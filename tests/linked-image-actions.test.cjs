/* Real MV3 UI test with synthetic HTML/images and no live account requests. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/linked-image-actions');
const origin = 'https://www.cc98.org';
const menu = '#cc98-image-link-menu';
const viewer = '#cc98-comfort-image-viewer';
const photo = (name, alt) => `<img src="/fixture/fixture-${name}-photo.png" alt="${alt}" width="480" height="180">`;
const body = `<p>正文中的链接图片</p><a href="/landing/body">${photo('body', '正文链接图片')}</a><p>普通图片</p>${photo('plain', '普通图片')}<a href="/fixture/original.PNG?size=full">${photo('direct', '原图链接')}</a>`;
const signature = `<div class="signature"><article><p>签名档</p><a href="/landing/signature?source=image">${photo('signature', '签名链接图片')}</a><a href="https://external.test/page?from=signature" target="_blank">${photo('external', '外部链接图片')}</a><a href="/topic/100/1#1">${photo('floor', '楼层链接图片')}</a></article></div>`;
const topic = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>图片链接操作测试</title></head><body><div id="root"><header class="topBar"><span class="topBarUserName">测试用户</span></header><div class="topicInfo-info"><span id="essay1">图片链接操作测试</span></div><div class="reply" data-floor="1"><div class="reply-floor">#1</div><a href="/user/id/12345">测试用户</a><div class="reply-content"><div class="substance"><article>${body}</article></div>${signature}</div><div class="comment1">发表于 2026-10-26</div></div><div class="pagination"><ul class="page-nav"><li><a href="/topic/100/1">1</a></li></ul></div></div></body></html>`;

async function main() {
  await fs.mkdir(output, { recursive: true });
  const errors = [], checks = [];
  let page, worker, stage = "startup";
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    viewport: { width: 1200, height: 850 }
  });
  try {
    await context.setOffline(true);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (route.request().isNavigationRequest()) {
        if (url.origin === origin && url.pathname.startsWith('/topic/')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: topic });
        if (url.origin === origin || url.origin === 'https://external.test') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Local link destination</title><div id="root">Local fixture</div>' });
        return route.abort();
      }
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/fixture/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180"><rect width="480" height="180" fill="#d9ebe6"/><path d="M0 150 L120 45 L230 130 L350 35 L480 145 V180 H0Z" fill="#478b7d"/><text x="240" y="30" text-anchor="middle" fill="#204e45" font-size="20">CC98 IMAGE</text></svg>' });
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try { return await route.fulfill({ path: file }); } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    await context.addInitScript(() => {
      if (location.origin === 'https://www.cc98.org') localStorage.setItem('userInfo', 'obj-' + JSON.stringify({ id: 12345, name: '测试用户' }));
    });
    worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ cc98ComfortSettings: { enabled: true, themeStyle: 'modern', themeMode: 'light', openLinksInNewTab: false, prewarmPostImages: false, previsitFirstPageForTopicImages: false }, 'cc98RebornOpenIdBinding:v1': { bound: true, userId: '12345', userName: '测试用户', boundAt: Date.now() } });
      getOpenIdBinding = async () => ({ ok: true, binding: { bound: true, userId: '12345', userName: '测试用户', boundAt: Date.now() } });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
    });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function prefs(patch) {
      await worker.evaluate(async patch => { const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings'); await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, ...patch } }); }, patch);
    }
    async function load() {
      await page.goto(origin + '/topic/100/1');
      await page.locator('#cc98-comfort-app .cc98-rebuild-signature img[alt="签名链接图片"]').waitFor();
      await page.waitForFunction(() => !document.querySelector('#cc98-comfort-loading') && !document.documentElement.hasAttribute('data-cc98-rebuild-transition-veil'));
      await page.locator('#cc98-comfort-app img[alt]').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode().catch(() => {}); })));
    }
    const image = alt => page.locator(`#cc98-comfort-app img[alt="${alt}"]`).first();
    async function choose(surface, alt) {
      await surface.locator(`#cc98-comfort-app img[alt="${alt}"]`).first().click();
      await surface.locator(menu).waitFor({ state: 'visible', timeout: 4000 });
      assert.deepEqual(await surface.locator(menu + ' .cc98-image-link-action').allTextContents(), ['查看大图', '前往链接']);
    }
    await load();
    const classification = await worker.evaluate(async () => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url?.includes('/topic/100/1'));
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
        globalThis.__imageChoiceTrace = [];
        const show = showImageLinkMenu, close = closeImageLinkMenu;
        showImageLinkMenu = (...args) => { __imageChoiceTrace.push({ operation: 'show', alt: args[0].image.alt }); return show(...args); };
        closeImageLinkMenu = (...args) => { if (document.getElementById('cc98-image-link-menu')) __imageChoiceTrace.push({ operation: 'close', stack: new Error().stack }); return close(...args); };
        return ['/topic/200', '/landing/page?preview=.png', '/landing/page#preview.webp', '/fixture/photo.PNG?size=full', '/fixture/vector.svg#part', '/fixture/no-extension', 'javascript:void(0)'].map(href => {
          const link = document.createElement('a'), image = document.createElement('img');
          link.href = href; image.src = 'https://www.cc98.org/fixture/no-extension';
          image.className = 'cc98-rebuild-content-image'; link.append(image);
          return { href, choice: Boolean(getLinkedImageAction(image)) };
        });
      } }))[0].result;
    });
    assert.deepEqual(classification.map(value => value.choice), [true, true, true, false, false, false, false]);
    await fs.writeFile(path.join(output, 'classification-validation.json'), JSON.stringify({ passed: true, classification }, null, 2));
    if (process.argv.includes('--classify-only')) { console.log('Linked image target classification: real MV3 URL path/query/hash/scheme/self-source checks passed'); return; }
    const original = page.url(), pages = context.pages().length;
    await choose(page, '签名链接图片');
    assert.equal(page.url(), original); assert.equal(context.pages().length, pages);
    assert.equal(await page.locator(viewer).count(), 0);
    await page.getByRole('button', { name: '查看大图', exact: true }).click();
    await page.locator(viewer).waitFor();
    assert.match(await page.locator(viewer + ' img').getAttribute('src'), /fixture-signature-photo\.png/);
    assert.equal(page.url(), original);
    await page.keyboard.press('Escape');
    await page.locator(viewer).waitFor({ state: 'detached' });
    checks.push('Real sanitized signature retains its link; initial click chooses, viewing does not navigate');

    for (const alt of ['普通图片', '原图链接']) {
      stage = alt;
      await image(alt).click(); await page.locator(viewer).waitFor({ timeout: 4000 });
      assert.equal(await page.locator(menu).count(), 0);
      await page.keyboard.press('Escape');
    }
    checks.push('Unlinked and direct image-suffix links retain immediate viewer');
    await choose(page, '签名链接图片');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), '前往链接');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(menu).count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'A');
    await page.keyboard.press('Enter');
    await page.locator(menu).waitFor({ timeout: 4000 });
    await page.mouse.click(10, 10); assert.equal(await page.locator(menu).count(), 0);
    checks.push('Enter, Tab, Escape and outside click support keyboard use and dismissal');

    await choose(page, '楼层链接图片');
    assert.equal(page.url(), original, 'floor guard must not preempt the chooser');
    await page.keyboard.press('Escape');
    await prefs({ openLinksInNewTab: true }); await load();
    await choose(page, '签名链接图片');
    assert.equal(context.pages().length, pages, 'global new-tab guard must not preempt chooser');
    const newTabPromise = context.waitForEvent('page');
    await page.getByRole('link', { name: '前往链接', exact: true }).click();
    const newTab = await newTabPromise;
    await newTab.waitForURL(origin + '/landing/signature?source=image');
    assert.equal(page.url(), original); await newTab.close();
    await page.locator(menu).waitFor({ state: 'detached' });
    checks.push('Floor links defer selection; go-to-link honors new-tab preference and exact URL');
    await prefs({ openLinksInNewTab: false }); await load();
    await choose(page, '正文链接图片');
    const goTarget = await page.getByRole('link', { name: '前往链接', exact: true }).getAttribute('target');
    if (goTarget === '_blank') {
      const pending = context.waitForEvent('page'); await page.getByRole('link', { name: '前往链接', exact: true }).click();
      const destination = await pending; await destination.waitForURL(origin + '/landing/body'); await destination.close();
    } else {
      await page.getByRole('link', { name: '前往链接', exact: true }).click(); await page.waitForURL(origin + '/landing/body');
    }
    checks.push('Go-to-link follows the real linked destination, preserving original target semantics');
    await load();

    for (const [style, tone, width] of [['modern', 'light', 1200], ['modern', 'dark', 390], ['ascii', 'light', 1200], ['ascii', 'dark', 390]]) {
      await prefs({ themeStyle: style, themeMode: tone });
      await page.waitForFunction(({ style, tone }) => document.documentElement.dataset.cc98ComfortStyle === style && document.documentElement.dataset.cc98ComfortTone === tone, { style, tone });
      await page.setViewportSize({ width, height: 850 });
      await choose(page, '签名链接图片');
      const box = await page.locator(menu).boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 850);
      if (style === 'ascii') assert.equal(await page.locator(menu).evaluate(node => getComputedStyle(node).borderRadius), '0px');
      await page.screenshot({ path: path.join(output, `menu-${style}-${tone}-${width}.png`) });
      await page.keyboard.press('Escape');
    }
    checks.push('Theme tokens, ASCII straight edges and narrow viewport placement verified');
    await page.setViewportSize({ width: 1200, height: 850 });
    await prefs({ themeStyle: 'modern', themeMode: 'light' });
    await page.locator('.cc98-rebuild-conversation-action').first().click();
    const dialog = page.locator('.cc98-rebuild-conversation-dialog'); await dialog.waitFor();
    await dialog.locator('details').evaluateAll(nodes => nodes.forEach(node => node.open = true));
    const dialogImage = dialog.locator('img[alt="正文链接图片"]').first();
    await dialogImage.click(); await page.locator(menu).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 1); assert.equal(await page.locator(menu).count(), 0);
    await dialogImage.click(); await page.getByRole('button', { name: '查看大图', exact: true }).click();
    await page.locator(viewer).waitFor(); await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 1); await page.keyboard.press('Escape');
    checks.push('Conversation chooser/viewer closes independently without dismissing parent dialog');

    await prefs({ openLinksInNewTab: true });
    await page.goto(origin + '/');
    await page.locator('#cc98-comfort-app').waitFor();
    await page.evaluate(() => {
      const section = document.createElement('section'); section.className = 'cc98-rebuild-home-hot-section';
      section.innerHTML = '<a class="cc98-rebuild-card-title" href="/topic/100/1">Local drawer fixture</a>';
      document.getElementById('cc98-comfort-app').append(section);
    });
    await page.locator('a.cc98-rebuild-card-title').click();
    await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 15000 });
    const child = await (await page.locator('.cc98-topic-drawer-frame').elementHandle()).contentFrame();
    await choose(child, '签名链接图片');
    assert.equal(page.url(), origin + '/');
    await child.locator(menu).getByRole('button', { name: '查看大图' }).click();
    await child.locator(viewer).waitFor(); await child.locator(viewer + ' .cc98-image-viewer-close').click();
    await choose(child, '签名链接图片'); await child.locator(menu).getByRole('link', { name: '前往链接' }).focus();
    await child.locator(menu).getByRole('link', { name: '前往链接' }).press('Escape');
    assert.equal(await page.locator('.cc98-topic-drawer-ready').count(), 1);
    await choose(child, '签名链接图片');
    const childPopup = context.waitForEvent('page');
    await child.locator(menu).getByRole('link', { name: '前往链接' }).click();
    const destination = await childPopup; await destination.waitForURL(origin + '/landing/signature?source=image'); await destination.close();
    assert.equal(page.url(), origin + '/');
    assert.equal(await child.locator(menu).count(), 0);
    checks.push('Actual injected drawer offers both actions, respects parent navigation policy and retains independent Escape behavior');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify({ passed: true, syntheticOnly: true, checks, errors }, null, 2));
    console.log(`Linked image actions: ${checks.length} real MV3 interaction groups passed`);
  } catch (error) {
    const state = { stage, errors, url: page?.url(), checks, images: await page?.locator('#cc98-comfort-app img').evaluateAll(nodes => nodes.map(image => ({ alt: image.alt, className: image.className, href: image.closest('a')?.href }))).catch(() => []) };
    state.trace = await worker?.evaluate(async () => { const tab = (await chrome.tabs.query({})).find(tab => tab.url?.includes('/topic/100/1')); if (!tab) return []; return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__imageChoiceTrace }))[0].result; }).catch(() => []);
    await fs.writeFile(path.join(output, 'failure-state.json'), JSON.stringify(state, null, 2));
    await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    console.error(state);
    throw error;
  } finally { await context.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

