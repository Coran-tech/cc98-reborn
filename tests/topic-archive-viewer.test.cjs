const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const katex = require('../src/vendor/katex/katex.min.js');
const { executable } = require('./new-topics-virtual.test.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/topic-archive/viewer');
const origin = 'https://archive.test';

function image(width, height) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    png.data[p] = 56 + Math.round(x / width * 45); png.data[p + 1] = 114 + Math.round(y / height * 45); png.data[p + 2] = 125 + Math.round(x / width * 50); png.data[p + 3] = 255;
  }
  return 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
}
function sound() {
  const pcm = Buffer.alloc(1644);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(1600, 40);
  return 'data:audio/wav;base64,' + pcm.toString('base64');
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: await executable(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const errors = [], remote = [];
  try {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { remote.push(url.href); return route.abort(); }
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try { await route.fulfill({ path: file }); } catch { await route.abort(); }
    });
    const inlineTex = String.raw`\frac{1}{2}+x^2`;
    const displayTex = String.raw`\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}`;
    const fallbackTex = String.raw`\unknownArchiveCommand{x}`;
    const unsafeTex = String.raw`\includegraphics{https://attack.invalid/formula.png}`;
    const rawFormula = tex => `<span class="katex"><math><semantics><annotation encoding="application/x-tex">${tex}</annotation></semantics></math><span class="katex-html" style="background:url(https://attack.invalid/formula-css)">untrusted duplicate<img src="https://attack.invalid/formula-image"></span></span>`;
    const data = { image: image(720, 230), emoji: image(32, 32), sound: sound(), formulas: `<p>行内公式：${katex.renderToString(inlineTex)}</p>${katex.renderToString(displayTex, { displayMode: true })}<p>源码保留：${rawFormula(fallbackTex)}</p><p>受限命令：${rawFormula(unsafeTex)}</p>` };
    await context.addInitScript(data => {
      const asset = 'https://file.cc98.org/v4-upload/archive-sample.png';
      const emoji = 'https://www.cc98.org/static/images/ac/01.png';
      const chunk = 'https://file.cc98.org/v4-upload/chunk.png';
      const doc = 'https://file.cc98.org/v4-upload/route.txt';
      const sound = 'https://file.cc98.org/v4-upload/sound.wav';
      const missing = 'https://outside.invalid/not-captured.png';
      const awards = `<div class="awardInfo" style="position:fixed"><div class="tagSize"><span class="userName">用户</span><span class="grades">操作</span><span class="credit">理由</span></div><div class="tagSize good"><span class="userName"><a href="https://www.cc98.org/user/111111"><img data-cc98-archive-resource="${asset}" style="width:900px;height:900px" onerror="window.__archiveAttack=5">Alice</a></span><span class="grades">风评值 +3</span><span class="credit">资料很详细，谢谢分享。</span></div><div class="tagSize bad"><span class="userName">Bob</span><span class="grades">风评值 -1</span><span class="credit">请补充原始出处。</span></div></div>`;
      const items = [
        { id: 'snapshot-one', topicId: '7654321', title: '一次雨后夜跑的路线记录', url: 'https://www.cc98.org/topic/7654321', owner: '795406', startedAt: 1793160000000, completedAt: 1793160010000, status: 'complete', bytes: 268083, recordCount: 12, pageCount: 2, expectedPages: 2, failures: [] },
        { id: 'snapshot-two', topicId: '7654322', title: '照片与近况', url: 'https://www.cc98.org/topic/7654322', owner: '123456', startedAt: 1793150000000, completedAt: 1793150010000, status: 'partial', bytes: 108083, recordCount: 1, pageCount: 1, expectedPages: 2, failures: [{ page: 2, error: '页面请求失败（403）' }, { url: missing, error: '无资源访问权限' }] }
      ];
      const pages = {
        'snapshot-one': {
          1: [{ floor: 1, user: 'LocalTester', uid: '795406', publishedAt: '2026-10-28 10:00:00', avatar: emoji,
            contentHtml: `<p>雨停之后，沿着湖边走了一圈。把这条不绕路的路线留在这里。</p><blockquote>以下是引用 2 楼的发言：<p>拱桥边的路灯已经修好了。<img data-cc98-archive-resource="${emoji}" alt="[ac01]"></p><blockquote>下次可以一起去。</blockquote></blockquote><p><a href="https://www.cc98.org/topic/7000000"><img data-cc98-archive-resource="${asset}" alt="路线照片"></a></p><p><img data-cc98-archive-resource="${chunk}" alt="分段图片"></p><p><a data-cc98-archive-resource="${doc}" download="路线.txt">路线.txt</a></p><script>window.__archiveAttack=1</script><img src="https://attack.invalid/track.png" onerror="window.__archiveAttack=2"><iframe src="https://attack.invalid/frame"></iframe><style>body{background:url(https://attack.invalid/css)}</style><a href="javascript:window.__archiveAttack=3">不可执行链接</a><svg onload="window.__archiveAttack=4"></svg><p style="background-image:url(https://attack.invalid/style)">正文仍保留</p>`,
            signatureHtml: `<p>慢一点，也会到达。<img data-cc98-archive-resource="${emoji}" alt="[ac01]"></p>`, extraHtml: data.formulas + '<p>赞 12 · 踩 0 · 风评 +4</p>' },
            { floor: 2, user: 'AnotherReader', publishedAt: '2026-10-28 10:03:00', contentHtml: '<p>谢谢整理，已经存下来了。</p>', extraHtml: awards }],
          2: [{ floor: 11, user: 'LastReader', publishedAt: '2026-10-28 10:10:00', contentHtml: `<p>第 2 页的内容只在切换后加载。</p><audio data-cc98-archive-resource="${sound}" autoplay loop></audio>`, extraHtml: '<section class="cc98-rebuild-awards"><div class="cc98-rebuild-awards-title">评分记录</div><table class="cc98-rebuild-awards-table"><thead><tr><th>用户</th><th>操作</th><th>理由</th></tr></thead><tbody><tr><td>Carol</td><td class="cc98-rebuild-award-positive">风评值 +1</td><td>已收藏</td></tr></tbody></table></section>' }]
        },
        'snapshot-two': { 1: [{ floor: 1, user: 'PhotoReader', contentHtml: `<p>这一张暂时没有下载成功：</p><img data-cc98-archive-resource="${missing}" alt="未保存照片">` }] }
      };
      const assets = { [asset]: data.image, [emoji]: data.emoji, [chunk]: data.image, [sound]: data.sound, [doc]: 'data:text/plain;base64,' + btoa('saved route') };
      const calls = window.__archiveCalls = [];
      const listeners = [];
      window.__archiveTheme = (patch) => { window.__archiveSettings = { ...window.__archiveSettings, ...patch }; for (const cb of listeners) cb({ cc98ComfortSettings: { newValue: window.__archiveSettings } }, 'local'); };
      window.__archiveSettings = { themeMode: 'light', themeStyle: 'modern', emojiScale: 140 };
      window.chrome = {
        runtime: { lastError: null, sendMessage(message, callback) {
          calls.push(message);
          const respond = value => { queueMicrotask(() => callback(value)); return Promise.resolve(value); };
          const item = items.find(item => item.id === message.id);
          if (message.type === 'CC98_ARCHIVE_LIST') return respond({ ok: true, items });
          if (message.type === 'CC98_ARCHIVE_DELETE') { if (item) items.splice(items.indexOf(item), 1); return respond({ ok: true }); }
          if (!item) return respond({ ok: false, error: '存档不存在' });
          if (message.type === 'CC98_ARCHIVE_GET') return respond({ ok: true, snapshot: item, pageNumbers: Object.keys(pages[message.id]).map(Number), pages: message.page ? [{ page: message.page, records: pages[message.id][message.page], capturedAt: item.startedAt }] : [] });
          if (message.type === 'CC98_ARCHIVE_ASSET') {
            const value = assets[message.url]; if (!value) return respond({ ok: false, error: '资源未保存' });
            const [header, base64] = value.split(','); const mime = header.slice(5).replace(';base64', ''), bytes = atob(base64).length;
            if (message.url === chunk) {
              if (message.offset === undefined) return respond({ ok: true, chunked: true, url: message.url, mime, bytes });
              return respond({ ok: true, url: message.url, mime, bytes, offset: message.offset, base64: btoa(atob(base64).slice(message.offset, message.offset + message.length)) });
            }
            return respond({ ok: true, dataUrl: value, url: message.url, mime, bytes });
          }
          return respond({ ok: false, error: 'unknown message' });
        } },
        storage: { local: { get(_key, callback) { callback({ cc98ComfortSettings: window.__archiveSettings }); } }, onChanged: { addListener(cb) { listeners.push(cb); } } }
      };
    }, data);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/popup/archive.html');
    await page.locator('.archive-row').first().waitFor();
    assert.equal(await page.locator('.archive-row').count(), 2);
    await page.screenshot({ path: path.join(output, 'library-modern-light.png') });
    await page.locator('#archive-search').fill('7654322'); assert.equal(await page.locator('.archive-row').count(), 1);
    await page.locator('#archive-search').fill('');
    await page.getByRole('link', { name: '一次雨后夜跑的路线记录' }).click();
    await page.locator('.archive-post').first().waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.archive-content img[src^="blob:"]').length === 5);
    assert.equal(await page.locator('.archive-post').count(), 2);
    assert.equal(await page.locator('.archive-content script,.archive-content iframe,.archive-content svg,.archive-content style,[onerror]').count(), 0);
    assert.equal(await page.evaluate(() => window.__archiveAttack || 0), 0);
    assert.equal(await page.locator('.archive-content [style*="url"]').count(), 0);
    assert.equal(await page.locator('.archive-content a[href^="javascript:"]').count(), 0);
    assert(await page.locator('.archive-resource-missing').filter({ hasText: '图片未保存' }).count());
    assert(await page.locator('.archive-content blockquote blockquote').count());
    assert.equal(await page.locator('.archive-math').count(), 4);
    assert.equal(await page.locator('.archive-math .katex-html').count(), 0);
    assert.equal(await page.locator('.archive-math annotation').filter({ hasText: inlineTex }).count(), 1);
    assert.equal(await page.locator('.archive-math-block').count(), 1);
    assert.equal(await page.locator('.archive-math').first().locator('mfrac').count(), 1);
    assert.equal(await page.locator('.archive-math').first().locator('msup').count(), 1);
    assert.equal(await page.locator('.archive-math-fallback').filter({ hasText: fallbackTex }).textContent(), `\\(${fallbackTex}\\)`);
    assert.equal(await page.locator('.archive-math-fallback').filter({ hasText: unsafeTex }).textContent(), `\\(${unsafeTex}\\)`);
    assert.equal(await page.locator('.archive-math img,.archive-math a[href],.archive-math [style*="url"]').count(), 0);
    assert.equal(await page.locator('.archive-content').filter({ hasText: 'untrusted duplicate' }).count(), 0);
    await page.locator('.archive-extra').first().screenshot({ path: path.join(output, 'formula-viewer.png') });
    assert.deepEqual(await page.locator('.archive-awards-table thead th').allTextContents(), ['用户', '操作', '理由']);
    assert.equal(await page.locator('.archive-awards-table tbody > tr').count(), 2);
    assert.equal(await page.locator('.archive-awards-total').textContent(), '+2');
    assert.equal(await page.locator('.archive-award-avatar img').evaluate(img => img.getBoundingClientRect().width), 24);
    assert.equal(await page.locator('.archive-awards [style],[onerror]').count(), 0);
    const rowHeights = await page.locator('.archive-awards-table tbody > tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
    assert(rowHeights.every(height => height < 60), 'native award rows remain compact');
    const awardColors = await page.locator('.archive-awards-table tbody td:nth-child(2)').evaluateAll(cells => cells.map(cell => getComputedStyle(cell).color));
    assert.deepEqual(awardColors, ['rgb(22, 163, 74)', 'rgb(220, 38, 38)']);
    await page.locator('.archive-post[data-floor="2"]').screenshot({ path: path.join(output, 'awards-modern-light.png') });
    assert.equal(await page.locator('.archive-pagination:not([hidden])').count(), 2);
    assert.deepEqual(await page.locator('#archive-pagination [data-page]').allTextContents(), ['1', '2']);
    assert.deepEqual(await page.locator('#archive-pagination-bottom [data-page]').allTextContents(), ['1', '2']);
    const calls = await page.evaluate(() => window.__archiveCalls);
    assert.equal(calls.filter(call => call.type === 'CC98_ARCHIVE_ASSET' && call.url.includes('/ac/01.png')).length, 1, 'avatar/body/signature reuse one local resource read');
    assert(calls.some(call => call.type === 'CC98_ARCHIVE_ASSET' && call.offset === 0), 'chunked resources are assembled locally');
    assert(!calls.some(call => call.type === 'CC98_ARCHIVE_GET' && call.page === 2), 'viewer reads only selected page');
    await page.locator('img[alt="路线照片"]').click();
    await page.locator('#archive-image-dialog[open]').waitFor();
    assert.equal(await page.locator('#archive-image-link').getAttribute('href'), 'https://www.cc98.org/topic/7000000');
    await page.getByRole('button', { name: '关闭大图' }).click();
    await page.evaluate(() => __archiveTheme({ themeStyle: 'ascii' }));
    await page.screenshot({ path: path.join(output, 'detail-ascii-light.png'), fullPage: true });
    await page.locator('.archive-post[data-floor="2"]').screenshot({ path: path.join(output, 'awards-ascii-light.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.archive-post[data-floor="2"]').screenshot({ path: path.join(output, 'awards-mobile.png') });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'narrow reading view does not overflow the document');
    await page.locator('#archive-pagination-bottom').screenshot({ path: path.join(output, 'pagination-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.locator('#archive-pagination-bottom').getByRole('button', { name: '下一页', exact: true }).click();
    await page.locator('.archive-post[data-floor="11"]').waitFor();
    assert.equal(await page.locator('.archive-post').count(), 1);
    assert.equal(await page.locator('.archive-content img').count(), 0);
    await page.locator('audio[src^="blob:"]').waitFor();
    assert.deepEqual(await page.locator('audio').evaluate(audio => ({ controls: audio.controls, autoplay: audio.autoplay, loop: audio.loop, preload: audio.preload })), { controls: true, autoplay: false, loop: false, preload: 'none' });
    await page.locator('audio').evaluate(audio => audio.load());
    await page.waitForFunction(() => document.querySelector('audio').readyState >= 1);
    assert.equal(await page.locator('.archive-awards-table tbody > tr').count(), 1, 'previously rebuilt award markup is normalized too');
    assert.equal(await page.locator('#archive-pagination [aria-current="page"]').textContent(), '2');
    await page.locator('#archive-pagination-bottom [data-page-jump]').fill('1');
    await page.locator('#archive-pagination-bottom').getByRole('button', { name: '跳转', exact: true }).click();
    await page.locator('.archive-post[data-floor="1"]').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.archive-content img[src^="blob:"]').length === 5);
    await page.locator('#archive-pagination [data-page="2"]').click();
    await page.locator('.archive-post[data-floor="11"]').waitFor();
    await page.locator('#archive-pagination').getByRole('button', { name: '上一页', exact: true }).click();
    await page.locator('.archive-post[data-floor="1"]').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.archive-content img[src^="blob:"]').length === 5);
    await page.evaluate(() => __archiveTheme({ themeStyle: 'modern', themeMode: 'dark' }));
    await page.screenshot({ path: path.join(output, 'detail-modern-dark.png') });
    await page.locator('.archive-post[data-floor="2"]').screenshot({ path: path.join(output, 'awards-modern-dark.png') });
    await page.locator('#archive-pagination-bottom').screenshot({ path: path.join(output, 'pagination-bottom.png') });
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 HTML' }).click();
    const exported = await download; const exportPath = path.join(output, 'snapshot-export.html'); await exported.saveAs(exportPath);
    const html = await fs.readFile(exportPath, 'utf8');
    assert(html.includes('第 2 页的内容只在切换后加载。'));
    assert(!/<script|<iframe|onerror=|src="https?:|src="blob:/i.test(html), 'export is inert and self-contained');
    assert(html.includes('data:image/png;base64,') && html.includes('data:text/plain;base64,'));
    assert(!html.includes('window.__archiveAttack'));
    const offline = await browser.newContext({ viewport: { width: 1280, height: 1000 }, offline: true });
    try {
      const exportedPage = await offline.newPage();
      exportedPage.on('pageerror', error => errors.push(error.message));
      exportedPage.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
      await exportedPage.goto(pathToFileURL(exportPath).href);
      assert.equal(await exportedPage.locator('.archive-post').count(), 3);
      assert.equal(await exportedPage.locator('.archive-math').count(), 4);
      assert.equal(await exportedPage.locator('.archive-math').first().locator('mfrac').count(), 1);
      assert.equal(await exportedPage.locator('.archive-math').first().locator('msup').count(), 1);
      assert.equal(await exportedPage.locator('.archive-math annotation').filter({ hasText: inlineTex }).count(), 1);
      assert.equal(await exportedPage.locator('.archive-math-fallback').filter({ hasText: fallbackTex }).textContent(), `\\(${fallbackTex}\\)`);
      assert.equal(await exportedPage.locator('.archive-math-fallback').filter({ hasText: unsafeTex }).textContent(), `\\(${unsafeTex}\\)`);
      assert.equal(await exportedPage.locator('.archive-math .katex-html,.archive-math img,.archive-math a[href]').count(), 0);
      await exportedPage.locator('.archive-extra').first().screenshot({ path: path.join(output, 'formula-offline.png') });
      assert.equal(await exportedPage.locator('.archive-awards-table tbody > tr').count(), 3);
      assert.equal(await exportedPage.locator('.archive-award-avatar img').evaluate(img => img.getBoundingClientRect().width), 24);
      assert.equal(await exportedPage.locator('#archive-page-1 .archive-export-pagination').count(), 2);
      await exportedPage.locator('#archive-page-1 .archive-export-pagination').last().getByRole('link', { name: '下一页', exact: true }).click();
      assert.equal(await exportedPage.evaluate(() => location.hash), '#archive-page-2');
      await exportedPage.locator('.archive-post[data-floor="2"]').screenshot({ path: path.join(output, 'awards-offline.png') });
      await exportedPage.locator('img[alt="路线照片"]').scrollIntoViewIfNeeded();
      await exportedPage.waitForFunction(() => document.querySelector('img[alt="路线照片"]').naturalWidth === 720);
      assert.equal(await exportedPage.locator('a[download="路线.txt"]').getAttribute('href'), 'data:text/plain;base64,c2F2ZWQgcm91dGU=');
      await exportedPage.locator('audio').evaluate(audio => audio.load());
      await exportedPage.waitForFunction(() => document.querySelector('audio').readyState >= 1);
      await exportedPage.screenshot({ path: path.join(output, 'export-offline.png') });
    } finally { await offline.close(); }
    await page.evaluate(() => { location.hash = 'missing-snapshot'; });
    await page.locator('#archive-error').filter({ hasText: '存档不存在' }).waitFor();
    assert.equal(await page.locator('#archive-delete').isDisabled(), true);
    assert.equal(await page.locator('#archive-export').isDisabled(), true);
    assert.equal(await page.locator('#archive-title').textContent(), '');
    await page.getByRole('button', { name: '全部存档' }).click();
    await page.getByRole('link', { name: '照片与近况' }).click();
    await page.locator('#archive-failures:not([hidden])').waitFor();
    await page.locator('#archive-failures summary').click();
    assert(await page.getByText('页面请求失败（403）', { exact: false }).count());
    assert.deepEqual(await page.locator('#archive-pagination [data-page]').allTextContents(), ['1'], 'missing pages have no invented controls');
    await page.locator('#archive-pagination-bottom [data-page-jump]').fill('2');
    await page.locator('#archive-pagination-bottom [data-page-jump]').press('Enter');
    assert.equal(await page.locator('#archive-pagination-bottom .archive-page-feedback').textContent(), '第 2 页未保存');
    assert.equal(await page.locator('.archive-post').count(), 1, 'missing-page jumps preserve the current saved page');
    assert.equal(await page.evaluate(() => window.__archiveCalls.filter(call => call.id === 'snapshot-two' && call.type === 'CC98_ARCHIVE_GET' && call.page === 2).length), 0);
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: '删除', exact: true }).click();
    assert.equal(await page.locator('#archive-title').textContent(), '照片与近况');
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '删除', exact: true }).click();
    await page.waitForFunction(() => !location.hash && document.querySelectorAll('.archive-row').length === 1);
    assert.deepEqual(errors, []); assert.deepEqual(remote, [], 'stored markup/assets cannot automatically request external URLs');
    const report = { passed: true, realBrowser: true, mockedStorageContract: true, checks: ['list/search', 'top and bottom saved-page controls, direct page selection and jump', 'missing-page jump retains current content without requesting invented pages', 'native and rebuilt award markup become compact semantic tables with 24px avatars and signed colors', 'narrow reading view has no document overflow', 'resource reuse and chunk assembly', 'nested quotes/images/signature', 'local audio metadata decode without autoplay', 'no active markup or external requests', 'linked-image zoom', 'theme live update and ASCII styling', 'local KaTeX-to-MathML formula rendering and single-copy TeX fallback', 'untrusted formula markup and TeX cannot request external resources', 'offline export preserves awards and navigable page anchors', 'formulas render in script-free self-contained offline export', 'all-page self-contained HTML export opened offline', 'failed navigation clears stale controls', 'partial failure details', 'delete confirmation'], errors, remoteRequests: remote, screenshots: ['library-modern-light.png', 'detail-ascii-light.png', 'detail-modern-dark.png', 'export-offline.png', 'formula-viewer.png', 'formula-offline.png', 'awards-modern-light.png', 'awards-ascii-light.png', 'awards-modern-dark.png', 'awards-offline.png', 'awards-mobile.png', 'pagination-bottom.png', 'pagination-mobile.png'] };
    await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } finally { await context.close(); await browser.close(); }
}
async function paginationWindowTest() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: await executable(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  try {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const file = path.resolve(root, '.' + url.pathname);
      if (url.origin !== origin || !file.startsWith(root + path.sep)) return route.abort();
      await route.fulfill({ path: file });
    });
    await context.addInitScript(() => {
      window.__archivePages = Array.from({ length: 1000 }, (_, i) => i + 1).filter(page => page !== 500);
      window.__archiveCalls = [];
      window.chrome = {
        runtime: { sendMessage(message, callback) {
          window.__archiveCalls.push(message);
          const snapshot = { id: 'long-snapshot', title: '长帖分页', topicId: '7654321', startedAt: 1793160000000, status: 'partial', bytes: 1, expectedPages: 1000, recordCount: 0 };
          const result = message.type === 'CC98_ARCHIVE_GET'
            ? { ok: true, snapshot, pageNumbers: window.__archivePages, pages: message.page ? [{ page: message.page, records: [] }] : [] }
            : { ok: true, items: [snapshot] };
          queueMicrotask(() => callback(result)); return Promise.resolve(result);
        } },
        storage: { local: { get(_key, callback) { callback({ cc98ComfortSettings: { themeMode: 'light' } }); } }, onChanged: { addListener() {} } }
      };
    });
    const page = await context.newPage();
    await page.goto(origin + '/popup/archive.html#long-snapshot');
    await page.locator('#archive-pagination [aria-current="page"]').waitFor();
    const jump = async value => {
      await page.locator('#archive-pagination-bottom [data-page-jump]').fill(String(value));
      await page.locator('#archive-pagination-bottom [data-page-jump]').press('Enter');
    };
    await jump(499);
    await page.locator('#archive-pagination [data-page="499"][aria-current="page"]').waitFor();
    await page.locator('#archive-pagination-bottom [data-page-step="1"]').click();
    await page.locator('#archive-pagination [data-page="501"][aria-current="page"]').waitFor();
    assert.deepEqual(await page.locator('#archive-pagination [data-page]').allTextContents(), ['1', '498', '499', '501', '502', '503', '1000']);
    assert.equal(await page.locator('#archive-pagination .archive-page-ellipsis').count(), 2);
    for (const id of ['archive-pagination', 'archive-pagination-bottom']) assert(await page.locator(`#${id} button`).count() <= 11);
    await jump(500);
    assert.equal(await page.locator('#archive-pagination-bottom .archive-page-feedback').textContent(), '第 500 页未保存');
    assert.equal(await page.evaluate(() => __archiveCalls.filter(call => call.page === 500).length), 0);
    await page.locator('#archive-pagination').screenshot({ path: path.join(output, 'pagination-window-1000.png') });
    for (const count of [2, 3]) {
      await page.evaluate(count => { __archivePages = Array.from({ length: count }, (_, i) => i + 1); }, count);
      await page.getByRole('button', { name: '刷新', exact: true }).click();
      await page.locator('#archive-pagination [data-page="1"][aria-current="page"]').waitFor();
      assert.deepEqual(await page.locator('#archive-pagination [data-page]').allTextContents(), Array.from({ length: count }, (_, i) => String(i + 1)));
    }
    await page.evaluate(() => { __archivePages = Array.from({ length: 1000 }, (_, i) => i + 1).filter(page => page !== 500); });
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.locator('#archive-pagination [data-page="1000"]').waitFor();
    const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
    const target = path.join(output, 'pagination-window-1000.html'); await (await downloaded).saveAs(target);
    const html = await fs.readFile(target, 'utf8');
    const stats = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const navs = [...doc.querySelectorAll('.archive-export-pagination')];
      const links = navs.flatMap(nav => [...nav.querySelectorAll('a')]);
      return { pages: doc.querySelectorAll('.archive-export-page').length, navs: navs.length, maxLinks: Math.max(...navs.map(nav => nav.querySelectorAll('a').length)), links: links.length, badTargets: links.filter(link => !doc.getElementById(link.getAttribute('href').slice(1))).length, missingPage: Boolean(doc.getElementById('archive-page-500')), missingLinks: doc.querySelectorAll('a[href="#archive-page-500"]').length };
    }, html);
    assert.equal(stats.pages, 999); assert.equal(stats.navs, 1998); assert(stats.maxLinks <= 11); assert(stats.links <= stats.pages * 22);
    assert.equal(stats.badTargets, 0); assert.equal(stats.missingPage, false); assert.equal(stats.missingLinks, 0);
    const report = { passed: true, focusedPaginationCheck: true, readButtonsMax: 11, export: stats };
    await fs.writeFile(path.join(output, 'pagination-window-validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } finally { await context.close(); await browser.close(); }
}
async function cspAttachmentsTest() {
  const before = process.argv.includes('--csp-attachments-before');
  const baseline = path.join(root, 'outputs/archive-attachments-csp-20261028/before');
  const resultDir = path.join(output, 'csp'); await fs.mkdir(resultDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: await executable(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const consoleCsp = [], network = [];
  try {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const base = before && url.pathname.startsWith('/popup/archive.') ? baseline : root;
      const file = path.resolve(base, '.' + url.pathname);
      if (url.origin !== origin || !file.startsWith(base + path.sep)) { network.push(url.href); return route.abort(); }
      await route.fulfill({ path: file });
    });
    const tex = String.raw`\frac{1}{2}+x^2+\pmb{y}`;
    const boxedTex = String.raw`\fcolorbox{red}{white}{z}`;
    const formattedTex = String.raw`\Large\mathbf{x}+\textcolor{purple}{\mathsf{y}}`;
    const fixture = { formulas: katex.renderToString(tex, { displayMode: true }) + katex.renderToString(formattedTex) + katex.renderToString(boxedTex), markdown: '# 离线 Markdown\n\n仅下载，不自动渲染。\n' };
    await context.addInitScript(fixture => {
      window.__cspViolations = [];
      addEventListener('securitypolicyviolation', event => __cspViolations.push({ effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, sourceFile: event.sourceFile, lineNumber: event.lineNumber, sample: event.sample }));
      const markdown = 'https://file.cc98.org/v4-upload/2026/10/28/%E7%A4%BA%E4%BE%8B.md?download=1';
      const snapshot = { id: 'csp-snapshot', title: '公式与文本样式', topicId: '7654321', startedAt: 1793160000000, status: 'complete', bytes: 1000, expectedPages: 1, recordCount: 1 };
      const records = [{ floor: 1, user: 'Reader', contentHtml: `<p>公式：</p>${fixture.formulas}<p><font color="#8e44ad" face="Consolas" size="5">字体与颜色</font></p><p><span style="font-size:24px;font-family:Consolas;color:#b44a6d;position:fixed;background:url(https://attack.invalid/style)">受限文本样式</span></p><pre><code>style="color:red"; &lt;span style="color:red" title="&gt;"&gt;原样&lt;/span&gt;</code></pre><p><span title='a > b, style="literal"' STYLE='position:fixed;font-size:96px'>含引号的标签</span></p><!-- <x title="' --><p style='position:fixed'>注释后的正文</p><style>body { background:url(https://attack.invalid/css) }</style><script>const literal = '<p style="color:red">';</script><p><a data-cc98-archive-resource="${markdown}">下载文件</a></p>` }];
      const listeners = [];
      window.__cspTheme = patch => { for (const listener of listeners) listener({ cc98ComfortSettings: { newValue: { themeMode: 'light', themePalette: 'custom', themeCustomPrimary: '#693d91', themeCustomSecondary: '#876323', ...patch } } }, 'local'); };
      window.chrome = {
        runtime: { sendMessage(message, callback) {
          let result = { ok: true };
          if (message.type === 'CC98_ARCHIVE_GET') result = { ok: true, snapshot, pageNumbers: [1], pages: message.page ? [{ page: 1, records }] : [] };
          if (message.type === 'CC98_ARCHIVE_LIST') result.items = [snapshot];
          if (message.type === 'CC98_ARCHIVE_ASSET') result = { ok: true, mime: 'text/plain', bytes: new TextEncoder().encode(fixture.markdown).length, dataUrl: 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(fixture.markdown))), url: markdown };
          queueMicrotask(() => callback(result)); return Promise.resolve(result);
        } },
        storage: { local: { get(_key, callback) { callback({ cc98ComfortSettings: { themeMode: 'light', themePalette: 'custom', themeCustomPrimary: '#693d91', themeCustomSecondary: '#876323' } }); } }, onChanged: { addListener(listener) { listeners.push(listener); } } }
      };
    }, fixture);
    const page = await context.newPage();
    page.on('console', message => { if (/content security policy|violates.*style-src|applying inline style/i.test(message.text())) consoleCsp.push(message.text()); });
    await page.goto(origin + '/popup/archive.html#csp-snapshot');
    await page.locator('.archive-math').first().waitFor();
    assert.equal(await page.locator('.archive-content pre code').textContent(), 'style="color:red"; <span style="color:red" title=">">原样</span>');
    assert.equal(await page.getByText('含引号的标签', { exact: true }).getAttribute('title'), 'a > b, style="literal"');
    assert.equal(await page.getByText('注释后的正文', { exact: true }).count(), 1);
    assert.equal(await page.locator('.archive-math mfrac').count(), 1);
    assert.equal(await page.locator('.archive-math msup').count(), 1);
    if (!before) {
      assert.equal(await page.locator('.archive-math-fallback').textContent(), `\\(${boxedTex}\\)`);
      assert.deepEqual(await page.getByText('字体与颜色', { exact: true }).evaluate(el => ({ color: getComputedStyle(el).color, fontSize: getComputedStyle(el).fontSize, fontFamily: getComputedStyle(el).fontFamily })), { color: 'rgb(142, 68, 173)', fontSize: '24px', fontFamily: 'Consolas' });
      assert.equal(await page.getByText('受限文本样式', { exact: true }).getAttribute('style'), null);
      assert.equal(await page.getByText('含引号的标签', { exact: true }).getAttribute('style'), null);
      assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--cc98-comfort-accent').trim()), '#693d91');
    }
    await page.locator('.archive-post').screenshot({ path: path.join(resultDir, before ? 'before.png' : 'after.png') });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('.archive-content button').click();
    const download = await downloadPromise, filename = download.suggestedFilename();
    const file = path.join(resultDir, before ? 'before-attachment.md' : 'after-attachment.md'); await download.saveAs(file);
    assert.equal(await fs.readFile(file, 'utf8'), fixture.markdown);
    const exportedPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
    const exportedFile = path.join(resultDir, before ? 'before-export.html' : 'after-export.html');
    await (await exportedPromise).saveAs(exportedFile);
    await page.evaluate(() => __cspTheme({ themeMode: 'dark' }));
    await page.locator('.archive-post').screenshot({ path: path.join(resultDir, before ? 'before-dark.png' : 'after-dark.png') });
    const violations = await page.evaluate(() => __cspViolations);
    if (!before) {
      const offline = await browser.newContext({ offline: true, viewport: { width: 1100, height: 900 } });
      try {
        await offline.addInitScript(() => { window.__offlineCsp = []; addEventListener('securitypolicyviolation', event => __offlineCsp.push(event.effectiveDirective)); });
        const exportedPage = await offline.newPage();
        exportedPage.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
        await exportedPage.goto(pathToFileURL(exportedFile).href);
        assert.equal(await exportedPage.locator('.archive-math mfrac').count(), 1);
        assert.equal(await exportedPage.locator('a[download="示例.md"]').count(), 1);
        assert.equal(await exportedPage.locator('.archive-content pre code').textContent(), 'style="color:red"; <span style="color:red" title=">">原样</span>');
        assert.deepEqual(await exportedPage.evaluate(() => __offlineCsp), []);
        await exportedPage.locator('.archive-post').screenshot({ path: path.join(resultDir, 'after-offline.png') });
      } finally { await offline.close(); }
    }
    const report = { before, filename, violations, consoleCsp, network };
    await fs.writeFile(path.join(resultDir, before ? 'before-validation.json' : 'after-validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ before, filename, violations: violations.length, consoleCsp: consoleCsp.length, sources: [...new Set(violations.map(item => `${item.sourceFile}:${item.lineNumber}`))], network }));
    if (before) assert(violations.length > 0, 'old implementation reproduces the reported CSP violation');
    else { assert.deepEqual(violations, []); assert.deepEqual(consoleCsp, []); assert.deepEqual(network, []); assert.equal(filename, '示例.md'); }
  } finally { await context.close(); await browser.close(); }
}
(process.argv.some(arg => arg.startsWith('--csp-attachments')) ? cspAttachmentsTest() : process.argv.includes('--pagination-window') ? paginationWindowTest() : main()).catch(error => { console.error(error); process.exitCode = 1; });
