// Isolated real-MV3 acceptance test. No real forum account or browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const { png } = require('./topic-archive.test.cjs');
const { unpackZip } = require('./archive-zip-core.test.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/archive-update-20261028/integration');
const origin = 'https://www.cc98.org', oldImage = 'https://file.cc98.org/archive-update-existing.png', newImage = 'https://file.cc98.org/archive-update-new.png';

function reply(floor, text, image = oldImage) {
  return `<div class="reply" data-floor="${floor}"><span class="reply-floor">${floor}</span><a href="/user/id/12345">测试用户</a><div class="reply-content"><div class="substance"><article><p>${text}</p><blockquote>保留引用<img src="${oldImage}"></blockquote><img src="${image}" alt="存档测试图片"></article></div></div><div class="signature"><p>原签名档</p></div><div class="comment1">发表于 2026-10-28 12:00:00</div></div>`;
}
function topic(page, revision, maxPage) {
  const rows = page === 1 ? [[1, revision >= 2 ? '旧页已编辑' : '旧页原文']]
    : page === 2 ? [[11, '第二页保持原样']]
    : page === 3 ? revision ? [[21, '原末页已编辑'], [23, '新增同页回复']] : [[21, '原末页原文'], [22, '后来被删除但备份必须保留']]
    : page === 4 ? [[31, '第四页新增回复', newImage]] : [[41, '第五页取消期间内容', newImage]];
  const links = Array.from({ length: maxPage }, (_, i) => `<li><a href="/topic/100/${i + 1}">${i + 1}</a></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>备份追加更新测试 - CC98论坛</title></head><body><div id="root"><header class="topBar"><span class="topBarUserName">测试用户</span></header><h1 id="essay1">备份追加更新测试</h1><button class="followTopic">收藏</button>${rows.map(row => reply(...row)).join('')}<div class="pagination"><ul class="page-nav">${links}</ul></div></div></body></html>`;
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const context = await chromium.launchPersistentContext('', { executablePath: await executable(), headless: true,
    // Block DNS from launch as well as using offline routed pages: browser-created
    // tabs can begin navigation before Playwright attaches their target.
    ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--host-resolver-rules=MAP * ~NOTFOUND'],
    viewport: { width: 1280, height: 980 }, acceptDownloads: true });
  let revision = 0, maxPage = 3, blockPage = 0, failScan = false, releaseBlocked;
  const errors = [], cspErrors = [], requests = [], checks = [];
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/violates.*Content Security Policy|Refused to apply inline style/i.test(message.text())) cspErrors.push(message.text()); });
  });
  try {
    await context.setOffline(true);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      const match = url.origin === origin && url.pathname.match(/^\/topic\/100(?:\/(\d+))?$/);
      if (match) {
        const number = Number(match[1] || 1), scan = request.resourceType() === 'fetch';
        requests.push({ page: number, scan, at: Date.now(), revision });
        if (scan && failScan) return route.fulfill({ status: 403, body: 'Forbidden' });
        if (scan && number === blockPage) await new Promise(resolve => { releaseBlocked = resolve; });
        return route.fulfill({ contentType: 'text/html', body: topic(number, revision, maxPage) }).catch(() => {});
      }
      if (/\.(?:png|gif|jpe?g|webp)(?:$|\?)/i.test(url.href)) return route.fulfill({ contentType: 'image/png', body: png });
      return route.abort();
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(async base64 => {
      await chrome.storage.local.set({ cc98ComfortSettings: { enabled: true, themeMode: 'dark', themeStyle: 'ascii', prewarmPostImages: false, previsitFirstPageForTopicImages: false },
        'cc98RebornOpenIdBinding:v1': { bound: true, userId: '12345', userName: '测试用户', boundAt: Date.now() } });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
      getStoredUpdateStatus = async () => ({ ok: true, currentVersion: chrome.runtime.getManifest().version, latestVersion: chrome.runtime.getManifest().version, hasUpdate: false });
      getOpenIdBinding = async () => ({ ok: true, binding: { bound: true, userId: '12345', userName: '测试用户', boundAt: Date.now() } });
      globalThis.__archiveUpdateAssetFetches = [];
      globalThis.__archiveUpdateMessages = [];
      const originalHandle = CC98RebornTopicArchiveStore.handle;
      CC98RebornTopicArchiveStore.handle = async (message, sender) => {
        const response = await originalHandle(message, sender);
        if (/UPDATE_|BEGIN|FINISH|ABORT/.test(message.type || '')) __archiveUpdateMessages.push({ type: message.type, message, sender: { url: sender.url, frameId: sender.frameId }, response });
        return response;
      };
      globalThis.fetch = async url => {
        const value = String(url); globalThis.__archiveUpdateAssetFetches.push(value);
        if (/^(?:https:\/\/(?:file|www)\.cc98\.org\/|chrome-extension:.*\/images\/)/.test(value))
          return new Response(Uint8Array.from(atob(base64), c => c.charCodeAt(0)), { headers: { 'content-type': 'image/png' } });
        return new Response('offline fixture only', { status: 403 });
      };
    }, png.toString('base64'));
    await context.addInitScript(() => { if (location.protocol === 'https:') localStorage.setItem('userInfo', 'obj-' + JSON.stringify({ id: 12345, name: '测试用户' })); });
    const original = await context.newPage(); await original.goto(origin + '/topic/100/2');
    await original.locator('.cc98-topic-archive-entry').first().waitFor();
    if (process.argv.includes('--visual-only')) {
      // Reopen the actual production dialog with fixture metadata; do not repeat
      // the already-accepted capture/update/export workflow for a CSS-only fix.
      await worker.evaluate(async targetUrl => {
        const tab = (await chrome.tabs.query({})).find(item => item.url === targetUrl);
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', func: () => {
          CC98RebornTopicArchive.open(getTopicPageInfo(), null, {
            id: 'visual-fixture-archive', topicId: '100', includeFiles: false,
            pageCount: 3, recordCount: 4, status: 'complete'
          });
        } });
      }, original.url());
      await original.getByRole('heading', { name: '更新本地备份', exact: true }).waitFor();
      const controls = await original.locator('.cc98-topic-archive-dialog, .cc98-topic-archive-dialog :is(button,input,progress)').evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        return { tag: element.tagName, label: element.textContent.trim() || element.getAttribute('aria-label') || element.className,
          radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius] };
      }));
      for (const control of controls) assert.deepEqual(control.radii, ['0px', '0px', '0px', '0px'], control.tag + ' ' + control.label);
      await original.screenshot({ path: path.join(output, 'update-confirmation-ascii.png') });
      const report = { passed: true, scope: 'ASCII dialog corner regression only', controls };
      await fs.writeFile(path.join(output, 'visual-validation.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2)); return;
    }
    await original.locator('.cc98-topic-archive-entry').first().click();
    await original.getByRole('button', { name: '开始存档', exact: true }).click();
    await original.waitForFunction(() => document.querySelector('.cc98-topic-archive-status')?.textContent.startsWith('存档完成'), {}, { timeout: 30000 });
    const opened = context.waitForEvent('page'); await original.getByRole('button', { name: '查看存档', exact: true }).click(); const archive = await opened;
    await archive.waitForURL(`chrome-extension://${extensionId}/popup/archive.html#*`); await archive.locator('.archive-post').first().waitFor();
    const id = new URL(archive.url()).hash.slice(1);
    const send = (type, payload = {}) => archive.evaluate(({ type, payload }) => chrome.runtime.sendMessage({ type: 'CC98_ARCHIVE_' + type, ...payload }), { type, payload });
    const get = page => send('GET', { id, ...(page ? { page } : {}) });
    const initial = await get(); assert.equal(initial.snapshot.pageCount, 3); assert.equal(initial.snapshot.recordCount, 4);
    const initialAssetFetches = await worker.evaluate(() => __archiveUpdateAssetFetches.slice());
    checks.push('Real extension creates three-page baseline with reusable binary media');

    const openUpdate = async (fromList = false) => {
      if (fromList) {
        await archive.locator('#archive-back').click();
        await archive.locator('#archive-list .archive-row').waitFor();
        await archive.screenshot({ path: path.join(output, 'update-library-ascii.png') });
      }
      const control = fromList ? archive.locator('#archive-list').getByRole('button', { name: '更新备份', exact: true }) : archive.locator('#archive-update');
      const opening = context.waitForEvent('page'); await control.click(); const page = await opening;
      await page.waitForURL(new RegExp('/topic/100(?:/1)?(?:#.*)?$'));
      // Browser-created tabs start before Playwright can attach the offline route. Reload the exact
      // requested destination once attached; all production messaging and content scripts remain real.
      await page.reload({ waitUntil: 'domcontentloaded' });
      try { await page.getByRole('heading', { name: '更新本地备份', exact: true }).waitFor({ timeout: 30000 }); }
      catch (error) {
        await page.screenshot({ path: path.join(output, 'update-open-failure.png') });
        await fs.writeFile(path.join(output, 'update-open-failure.json'), JSON.stringify({ url: page.url(), text: await page.locator('body').innerText(), errors,
          requests,
          runtime: await worker.evaluate(async url => {
            const tabs = await chrome.tabs.query({}); const tab = tabs.find(tab => tab.url === url);
            if (!tab) return { error: 'test tab not found' };
            return chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', func: () => ({
              readyState: document.readyState, body: Boolean(document.body), url: location.href, title: document.title,
              settings: typeof lastSettings === 'undefined' ? 'undefined' : Boolean(lastSettings),
              account: typeof getStoredCc98UserInfo === 'function' ? getStoredCc98UserInfo() : 'missing function',
              nativeCount: document.querySelectorAll('.reply').length, dialogCount: document.querySelectorAll('.cc98-topic-archive-layer').length,
              bodyChildren: [...document.body.children].map(child => [child.tagName, child.id, child.className])
            }) });
          }, page.url()), messages: await worker.evaluate(() => __archiveUpdateMessages) }, null, 2));
        throw error;
      }
      await page.getByRole('button', { name: '开始更新', exact: true }).waitFor();
      return page;
    };
    const startUpdate = async (page, all = false) => {
      await page.getByLabel('复查已存页面', { exact: true }).setChecked(all);
      await page.getByRole('button', { name: /^(开始更新|再次更新)$/, exact: false }).click();
    };
    const finished = page => page.waitForFunction(() => {
      const control = document.querySelector('.cc98-topic-archive-primary'), status = document.querySelector('.cc98-topic-archive-status');
      return control && !control.disabled && status?.textContent.includes('页');
    }, {}, { timeout: 30000 });
    revision = 1; maxPage = 4;
    const updating = await openUpdate();
    assert.equal(await updating.getByLabel('复查已存页面', { exact: true }).isChecked(), false);
    await updating.screenshot({ path: path.join(output, 'update-confirmation-ascii.png') });
    const requestStart = requests.length;
    await startUpdate(updating); await finished(updating);
    const updateReads = requests.slice(requestStart).filter(r => r.scan), updateRequests = updateReads.map(r => r.page);
    assert.deepEqual(updateRequests, [3, 4], 'Incremental update scans only old tail and new page');
    assert(updateReads[1].at - updateReads[0].at >= 900, 'Update retains paced request scheduling');
    const updated = await get(); assert.equal(updated.snapshot.id, id); assert.equal(updated.snapshot.pageCount, 4); assert.equal(updated.snapshot.recordCount, 6);
    assert.equal(updated.snapshot.startedAt, initial.snapshot.startedAt); assert(updated.snapshot.updatedAt >= initial.snapshot.completedAt);
    assert.equal((await send('LIST')).items.length, 1, 'Staging snapshot does not leak into library');
    const tail = (await get(3)).pages[0].records;
    assert.deepEqual(tail.map(r => r.floor), [21, 22, 23]); assert(tail[0].contentHtml.includes('原末页已编辑')); assert(tail[1].contentHtml.includes('后来被删除但备份必须保留'));
    assert((await get(1)).pages[0].records[0].contentHtml.includes('旧页原文'));
    const afterAssetFetches = await worker.evaluate(() => __archiveUpdateAssetFetches.slice());
    const additional = afterAssetFetches.slice(initialAssetFetches.length);
    assert.deepEqual(additional, [newImage], 'Saved media are reused and new resource downloads once');
    await archive.reload(); await archive.locator('.archive-post').first().waitFor();
    await archive.locator('#archive-pagination [data-page="4"]').click(); await archive.waitForFunction(() => document.querySelector('.archive-post')?.dataset.floor === '31');
    await archive.screenshot({ path: path.join(output, 'updated-reader-ascii.png') });
    const exported = archive.waitForEvent('download'); await archive.locator('#archive-export-zip').click(); const download = await exported;
    const zipPath = path.join(output, 'updated-backup.zip'); await download.saveAs(zipPath);
    const entries = unpackZip(await fs.readFile(zipPath)), exportMeta = JSON.parse(entries.get('export.json').toString('utf8'));
    assert.equal(exportMeta.pageCount, 4); assert.equal(exportMeta.recordCount, 6); assert.deepEqual(exportMeta.warnings, []);
    checks.push('Viewer update entry, confirmation, paced tail/new-page scan, retained deleted floor, same archive ID and media reuse');
    checks.push('Updated archive reads in existing viewer and exports four-page ZIP with correct inventory');

    revision = 2;
    const full = await openUpdate(), fullStart = requests.length;
    await startUpdate(full, true); await finished(full);
    assert.deepEqual(requests.slice(fullStart).filter(r => r.scan).map(r => r.page), [1, 2, 3, 4]);
    assert((await get(1)).pages[0].records[0].contentHtml.includes('旧页已编辑'));
    assert.deepEqual((await get(3)).pages[0].records.map(r => r.floor), [21, 22, 23]);
    checks.push('Optional existing-page review refreshes edited historical text without losing deleted captured floor');

    maxPage = 5; blockPage = 5;
    const cancelled = await openUpdate();
    const beforeCancel = await get(), beforeCancelPages = await Promise.all([1, 2, 3, 4].map(get));
    await startUpdate(cancelled);
    for (let i = 0; i < 200 && !releaseBlocked; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert(releaseBlocked, 'New page read was started before cancellation');
    assert.deepEqual((await get()).snapshot, beforeCancel.snapshot, 'Original remains readable and unchanged while work copy scans');
    await cancelled.getByRole('button', { name: /取消/ }).click(); releaseBlocked(); releaseBlocked = null; blockPage = 0;
    await finished(cancelled);
    assert.deepEqual((await get()).snapshot, beforeCancel.snapshot); assert.deepEqual(await Promise.all([1, 2, 3, 4].map(get)), beforeCancelPages);
    assert.equal((await send('LIST')).items.length, 1);
    checks.push('Cancellation after a staged tail read leaves original metadata/pages/media intact and removes staging');

    failScan = true;
    const denied = await openUpdate(true), beforeDenied = await get();
    await startUpdate(denied); await finished(denied);
    assert.deepEqual((await get()).snapshot, beforeDenied.snapshot, 'All-403 update must not replace baseline');
    assert.equal((await send('LIST')).items.length, 1);
    checks.push('Library update entry works; unavailable original post keeps existing local backup unchanged');
    assert.deepEqual(errors, []); assert.deepEqual(cspErrors, []);
    const report = { passed: true, realMV3: true, isolatedFixtureOnly: true, baseline: { pages: 3, floors: 4 }, updated: { pages: 4, floors: 6 },
      incrementalReadPages: updateRequests, additionalAssetDownloads: additional.length, checks, errors, cspErrors };
    await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally { releaseBlocked?.(); await context.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
