const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/settings-navigation');
const origin = 'https://www.cc98.org';
const settingsKey = 'cc98ComfortSettings';
const frameSelector = '.cc98-rebuild-user-settings-frame';

async function main() {
  const baseline = process.argv.includes('--baseline');
  await fs.mkdir(output, { recursive: true });
  const fixture = await fs.readFile(path.join(root, 'tests/user-settings-page.html'), 'utf8');
  let nativeEmpty = false;
  const errors = [], measurements = [];
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    viewport: { width: 1440, height: 1000 }
  });
  try {
    await context.setOffline(true);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin !== origin) return route.abort();
      if (route.request().isNavigationRequest()) {
        const body = url.pathname === '/' || nativeEmpty
          ? '<!doctype html><html><head><title>Local fixture</title></head><body><div id="root"><header class="topBar"><span class="topBarUserName">测试用户</span></header></div></body></html>'
          : fixture;
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
      }
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try { return await route.fulfill({ path: file }); } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async key => {
      await chrome.storage.local.set({ [key]: { enabled: true, themeStyle: 'modern', themeMode: 'light', prewarmPostImages: false, previsitFirstPageForTopicImages: false }, 'cc98RebornOpenIdBinding:v1': { bound: true, userId: '12345', userName: '测试用户', boundAt: Date.now() } });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
      getStoredUpdateStatus = async () => ({ ok: true, currentVersion: chrome.runtime.getManifest().version, latestVersion: chrome.runtime.getManifest().version, hasUpdate: false });
      getOpenIdBinding = async () => ({ ok: true, binding: { bound: true, userId: '12345', userName: '测试用户', boundAt: Date.now() } });
    }, settingsKey);
    await context.addInitScript(() => {
      if (location.protocol !== 'https:') return;
      localStorage.setItem('userInfo', 'obj-' + JSON.stringify({ id: 12345, name: '测试用户' }));
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function settingsFrame() {
      await page.locator(frameSelector).waitFor({ state: 'visible', timeout: 3000 });
      const frame = await (await page.locator(frameSelector).elementHandle()).contentFrame();
      await frame.locator('#enabled').waitFor({ state: 'visible', timeout: 3000 });
      return frame;
    }
    async function unobscured() {
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-cc98-rebuild-transition-veil')
        && !document.querySelector('#cc98-comfort-loading'), { timeout: 4500 });
    }
    await page.goto(origin + '/usercenter');
    await page.locator('.cc98-rebuild-settings-nav-entry').waitFor();
    await unobscured();
    let started = Date.now();
    await page.locator('.cc98-rebuild-settings-nav-entry').click();
    await settingsFrame();
    const veilWhileReady = await page.evaluate(() => document.documentElement.getAttribute('data-cc98-rebuild-transition-veil'));
    await unobscured();
    const entryMs = Date.now() - started;
    measurements.push({ scenario: 'personal-center-click', visibleMs: entryMs, veilWhileReady });
    if (baseline) {
      await fs.writeFile(path.join(output, 'baseline.json'), JSON.stringify({ measurements }, null, 2));
      console.log('Settings entry baseline:', JSON.stringify(measurements));
      return;
    }
    assert(entryMs < 1500, 'settings-ready page must not wait for veil failsafe');
    assert.equal(veilWhileReady, null);
    assert.equal(await page.locator('.cc98-rebuild-nav a').last().textContent(), '插件设置');
    assert.equal(await page.locator('.cc98-rebuild-nav a').last().getAttribute('aria-current'), 'page');
    await page.locator('.cc98-rebuild-settings-nav-entry').click();
    await unobscured();
    await page.goBack();
    await page.waitForFunction(() => location.hash === '');
    await unobscured();
    assert.equal(await page.locator('.cc98-rebuild-nav a').last().getAttribute('aria-current'), null);

    // The forum's personal-center DOM never arrives until the test inserts it.
    nativeEmpty = true;
    started = Date.now();
    await page.goto(origin + '/userCenter#cc98-reborn-settings');
    let frame = await settingsFrame();
    await unobscured();
    const emptyMs = Date.now() - started;
    assert(emptyMs < 1800, 'independent extension settings must not wait for native personal-center data');
    assert.equal(await page.locator('#fixture-native-router').count(), 0);
    await frame.evaluate(() => { window.__settingsFrameKept = true; });
    await page.evaluate(html => {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      document.getElementById('root').append(parsed.querySelector('.user-center'));
    }, fixture);
    await page.waitForTimeout(500);
    frame = await settingsFrame();
    assert(await frame.evaluate(() => window.__settingsFrameKept), 'late native content must not remount the settings iframe');
    assert.equal(await page.locator('#userCenterNavigation.cc98-rebuild-native-user-nav').count(), 1, 'late original personal-center navigation must replace the minimal settings shell');
    assert.equal(await page.locator('#fixture-native-router').evaluate(node => node.hidden), true);
    await unobscured();
    measurements.push({ scenario: 'no-native-personal-center', visibleMs: emptyMs, framePreservedOnNativeArrival: true });

    nativeEmpty = false;
    await page.goto(origin + '/');
    const nav = page.locator('.cc98-rebuild-nav');
    await nav.waitFor();
    assert.deepEqual(await nav.locator('a').allTextContents(), ['首页', '版面', '新帖', '关注', '精选', '稍后再看', '插件设置']);
    const target = await nav.locator('a').last().getAttribute('href');
    assert.equal(new URL(target).hash, '#cc98-reborn-settings');
    started = Date.now();
    await nav.locator('a').last().click();
    frame = await settingsFrame(); await unobscured();
    measurements.push({ scenario: 'home-top-navigation', visibleMs: Date.now() - started });

    for (const [style, tone] of [['modern', 'light'], ['ascii', 'light'], ['ascii', 'dark']]) {
      await worker.evaluate(async ({ key, style, tone }) => {
        const current = (await chrome.storage.local.get(key))[key];
        await chrome.storage.local.set({ [key]: { ...current, themeStyle: style, themeMode: tone } });
      }, { key: settingsKey, style, tone });
      await page.waitForFunction(({ style, tone }) => document.documentElement.dataset.cc98ComfortStyle === style && document.documentElement.dataset.cc98ComfortTone === tone, { style, tone });
      for (const width of [1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        const bounds = await page.locator('.cc98-rebuild-topbar').evaluate(header => {
          const box = header.getBoundingClientRect();
          return { client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, right: box.right, links: [...header.querySelectorAll('nav a')].map(link => { const r = link.getBoundingClientRect(); return { text: link.textContent, left: r.left, right: r.right }; }) };
        });
        assert(bounds.scroll <= bounds.client + 1, `${style}/${width}: document overflow`);
        for (const link of bounds.links) assert(link.left >= 0 && link.right <= width + 1, `${style}/${width}: link out of screen`);
        measurements.push({ scenario: 'layout', style, tone, width, bounds });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `navigation-${style}-${tone}.png`) });
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify({ passed: true, syntheticOnly: true, measurements, errors }, null, 2));
    console.log('Settings navigation: immediate entry, independent cold load, late-native iframe preservation, home link, history and 9 themed layouts passed');
  } finally { await context.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
