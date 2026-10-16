const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const localForum = require('./local-forum-path.cjs');
const root = path.resolve(__dirname, '..');
const origin = 'https://www.cc98.org';
const local = 'http://127.0.0.1:44345';
const output = path.join(root, 'outputs/topic-drawer-preview');
async function executable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  for (const name of (await fs.readdir(cache)).filter(n => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const file = path.join(cache, name, 'chrome-win64/chrome.exe');
    try { await fs.access(file); return file; } catch {}
  }
  throw new Error('Full Chromium is needed to verify the actual MV3 frame injection.');
}
async function main() {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'cc98-drawer-'));
  const server = spawn(process.execPath, [localForum.serverPath], { cwd: root,
    env: { ...process.env, ...localForum.environment, CC98_LOCAL_PORT: '44345', CC98_LOCAL_NATIVE_FRONTEND: '1', CC98_LOCAL_REQUIRE_AUTH: '0',
      CC98_LOCAL_DATA_PATH: path.join(runtime, 'data.json'), CC98_LOCAL_UPLOAD_ROOT: path.join(runtime, 'uploads'), CC98_LOCAL_BACKUP_ROOT: path.join(runtime, 'backups') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '', context, page, checks = 0;
  const errors = [], requests = [], rejected = [];
  server.stdout.on('data', b => { logs += b; }); server.stderr.on('data', b => { logs += b; });
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(local + '/__test/health')).ok) break; } catch {}
      if (i === 99) throw new Error(logs);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    for (let i = 4; i <= 14; i++) assert((await fetch(local + '/topic/6500000/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: `侧窗第 ${i} 楼 [ac01]`, contentType: 0 }) })).ok);
    for (let i = 1; i <= 9; i++) assert((await fetch(local + '/board/81/topic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `侧窗浏览示例话题 ${i}：主页面继续保留`, content: '本地侧窗测试内容', contentType: 0 }) })).ok);
    context = await chromium.launchPersistentContext('', { executablePath: await executable(), headless: true,
      ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`], viewport: { width: 1440, height: 1000 } });
    await context.setOffline(true);
    // Run the unchanged native React frontend and real extension against an
    // isolated backend. No request is sent to the production forum/account.
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin !== origin) { rejected.push(url.href); return route.abort(); }
      // A normal-link popup may issue its navigation before Playwright has
      // created the new tab's Frame object. This label is diagnostic only.
      let frame = 'new-tab';
      try { frame = request.frame().parentFrame() ? 'child' : 'top'; } catch {}
      requests.push({ url: url.href, method: request.method(), frame });
      try {
        const headers = {};
        for (const key of ['content-type', 'authorization', 'accept']) if (request.headers()[key]) headers[key] = request.headers()[key];
        const response = await fetch(local + url.pathname + url.search, { method: request.method(), headers, body: request.postDataBuffer() || undefined });
        let body = Buffer.from(await response.arrayBuffer());
        const type = response.headers.get('content-type') || '';
        if (/html|javascript|json|css/.test(type)) body = Buffer.from(body.toString('utf8').replaceAll(local, origin));
        await route.fulfill({ status: response.status, contentType: type, body });
      } catch (error) { await route.abort().catch(() => {}); }
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ cc98ComfortSettings: { enabled: true, rebuildUi: true, themeStyle: 'modern', themeMode: 'light', homeHotOnly: true,
        prewarmPostImages: false, previsitFirstPageForTopicImages: false, replyRebornTail: false, openLinksInNewTab: true },
        'cc98RebornOpenIdBinding:v1': { bound: true, userId: 795406, userName: 'LocalTester', boundAt: Date.now() } });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
      getOpenIdBinding = async () => ({ ok: true, binding: { bound: true, userId: 795406, userName: 'LocalTester' } });
    });
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    await fs.mkdir(output, { recursive: true });
    await page.goto(origin + '/');
    await page.locator('[data-home-section-kind="hot"] .cc98-rebuild-card-title').first().waitFor();
    console.log('native home ready');
    await page.waitForTimeout(1600);
    const compact = await page.locator('#cc98-comfort-app').evaluate(el => ({ width: el.offsetWidth, gutter: innerWidth - document.documentElement.clientWidth }));
    await page.locator('[data-home-section-kind="hot"] a.cc98-rebuild-card-title').first().evaluate(el => el.click());
    assert.equal(await page.locator('#cc98-comfort-app').evaluate(el => el.offsetWidth), compact.width, 'opening the one-screen homepage must not add a scrollbar gutter or reflow the parent'); checks++;
    await page.getByRole('button', { name: '关闭帖子侧窗', exact: true }).click();
    await page.evaluate(() => {
      window.__parentApp = document.querySelector('#cc98-comfort-app');
      window.__parentCards = [...__parentApp.querySelectorAll('.cc98-rebuild-card')];
      // Leave space for a real non-zero parent scroll without changing cards.
      __parentApp.style.minHeight = '2400px'; scrollTo(0, 170);
      const draft = document.createElement('textarea'); draft.id = 'drawer-parent-draft'; draft.value = '主页面草稿保留'; __parentApp.append(draft);
    });
    const baseline = await page.evaluate(() => ({ url: location.href, scroll: scrollY, width: __parentApp.offsetWidth }));
    // The first seeded topic can move in rank, so select the known test topic.
    const title = page.locator('[data-home-section-kind="hot"] a.cc98-rebuild-card-title[href*="/topic/6500000"]').first();
    await title.evaluate(el => el.click());
    const drawerFrame = async () => {
      await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 });
      return (await page.locator('.cc98-topic-drawer-frame').elementHandle()).contentFrame();
    };
    let child = await drawerFrame();
    console.log('real MV3 child ready', child.url());
    await child.locator('.cc98-rebuild-post').first().waitFor();
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, blockedContentRules: JSON.stringify(['/侧窗第 4 楼/']) } });
    });
    await child.locator('.cc98-rebuild-blocked .cc98-rebuild-card-title').filter({ hasText: '内容规则：/侧窗第 4 楼/' }).waitFor();
    assert.equal(await child.locator('[data-post-floor="4"]').count(), 0, 'regex rules run inside the actual drawer document'); checks++;
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, blockedContentRules: "[]" } });
    });
    await child.locator('[data-post-floor="4"]').waitFor(); checks++;
    // Exercise real content-script messaging from the child. Only the external
    // question service is replaced; URL/account validation stays in the worker.
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      getOpenIdBinding = async () => ({ binding: { bound: true, userId: 795406, boundAt: 42 } });
      await chrome.storage.session.set({ 'cc98RebornQuestionSession:v1': { token: 'local-drawer-test', bindingEpoch: 42, expiresAt: Date.now() + 600000 } });
      await chrome.storage.local.remove('cc98RebornQuestionPrivacyAccepted:v1');
      globalThis.__drawerQuestionCalls = [];
      globalThis.__drawerQuestionStates = {};
      questionRequest = async (path, options) => {
        __drawerQuestionCalls.push({ path, body: options.body });
        const { topicId, floor, floors } = options.body;
        if (path === '/api/questions/batch') return { items: Object.fromEntries(floors.map(f => [f, __drawerQuestionStates[`${topicId}:${f}`] || { count: 0, mine: false }])) };
        if (path !== '/api/questions/toggle') throw new Error('Unexpected authentication request in drawer regression');
        const key = `${topicId}:${floor}`, mine = !__drawerQuestionStates[key]?.mine;
        return __drawerQuestionStates[key] = { count: mine ? 1 : 0, mine };
      };
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, questionMarkEnabled: true } });
    });
    const question = child.locator('[data-post-floor="1"] .cc98-question-action');
    await question.click();
    await child.getByRole('button', { name: '同意并继续', exact: true }).click();
    await child.locator('[data-post-floor="1"] .cc98-question-action.is-selected').waitFor();
    assert.equal(await question.locator('.cc98-question-count').textContent(), '1'); checks++;
    await question.click();
    await child.waitForFunction(() => document.querySelector('[data-post-floor="1"] .cc98-question-count')?.textContent === '0'); checks++;
    assert.equal(await child.locator('.cc98-question-notice').count(), 0); checks++;
    assert.equal(await child.locator('.cc98-rebuild-topbar').isVisible(), false, 'the child must omit its duplicate forum navigation');
    assert(await page.locator('#cc98-comfort-app > .cc98-rebuild-topbar').isVisible(), 'parent navigation remains mounted and visible');
    const state = await page.evaluate(() => ({ url: location.href, scroll: scrollY, width: __parentApp.offsetWidth,
      app: __parentApp === document.querySelector('#cc98-comfort-app'), cards: __parentCards.every((node, i) => node === __parentApp.querySelectorAll('.cc98-rebuild-card')[i]),
      draft: document.querySelector('#drawer-parent-draft').value, transform: getComputedStyle(__parentApp).transform }));
    assert.equal(state.url, baseline.url); assert.equal(state.scroll, baseline.scroll); assert.equal(state.width, baseline.width);
    assert(state.app && state.cards && state.transform !== 'none'); assert.equal(state.draft, '主页面草稿保留'); checks += 6;
    assert(await child.locator('html.cc98-comfort.cc98-topic-drawer-child').count());
    assert.equal(await child.locator('.cc98-topic-drawer-layer').count(), 0); checks += 2;
    assert(await child.evaluate(() => window.__cc98RebornSubmitMonitorInstalled), 'real drawer keeps the MAIN-world native reply/media bridge'); checks++;
    assert.match(await page.locator('.cc98-topic-drawer-backdrop').evaluate(el => getComputedStyle(el).backgroundColor), /0\.2\)/, 'parent content remains visible through a translucent backdrop'); checks++;
    const widthBefore = await page.locator('.cc98-topic-drawer-panel').evaluate(el => el.getBoundingClientRect().width);
    await page.getByRole('separator').focus(); await page.getByRole('separator').press('ArrowLeft');
    assert.equal(await page.locator('.cc98-topic-drawer-panel').evaluate(el => el.getBoundingClientRect().width), widthBefore + 20); checks++;
    const grip = await page.getByRole('separator').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 120); await page.mouse.down();
    await page.mouse.move(grip.x - 90, grip.y + 120, { steps: 8 }); await page.mouse.up();
    assert(await page.locator('.cc98-topic-drawer-panel').evaluate(el => el.getBoundingClientRect().width) > widthBefore + 80); checks++;
    const sideLayout = await child.evaluate(() => {
      const root = document.documentElement, previous = root.dataset.cc98ComfortSideTopbar;
      root.dataset.cc98ComfortSideTopbar = 'true';
      const result = { padding: getComputedStyle(document.querySelector('#cc98-comfort-app')).paddingLeft,
        nav: getComputedStyle(document.querySelector('.cc98-rebuild-topbar')).display };
      root.dataset.cc98ComfortSideTopbar = previous;
      return result;
    });
    assert.deepEqual(sideLayout, { padding: '0px', nav: 'none' }, 'child must not reserve space for the optional side navigation');
    await child.locator('.cc98-rebuild-pager a[href*="/topic/6500000/2"]').first().click();
    await child.waitForURL('**/topic/6500000/2');
    await child.locator('[data-post-floor="11"]').waitFor();
    await child.locator('[data-post-floor="11"] .cc98-question-action').click();
    await child.locator('[data-post-floor="11"] .cc98-question-action.is-selected').waitFor();
    assert(await worker.evaluate(() => __drawerQuestionCalls.some(c => c.path === '/api/questions/toggle' && c.body.topicId === 6500000 && c.body.floor === 11))); checks++;
    assert.equal(context.pages().length, 2, 'pagination must not open a new browser tab despite the preference');
    assert.equal(page.url(), baseline.url); checks += 2;
    console.log('native pagination passed');
    // Use the actual upstream editor and submit handler, then verify storage in
    // the test backend rather than simulating an onClick success.
    await child.locator('.cc98-rebuild-native-editor textarea').first().fill('侧窗原生回复验证 abc-drawer');
    await child.locator('.cc98-rebuild-native-editor').getByRole('button', { name: '回复', exact: true }).click();
    await page.waitForTimeout(1200);
    const stored = await (await fetch(local + '/topic/6500000/post?from=10&size=10')).json();
    assert(JSON.stringify(stored).includes('侧窗原生回复验证 abc-drawer'), JSON.stringify(stored)); checks++;
    await child.locator('[data-post-floor] .cc98-rebuild-post-body').filter({ hasText: '侧窗原生回复验证 abc-drawer' }).waitFor();
    await page.locator('.cc98-topic-drawer-ready').waitFor();
    await child.evaluate(() => scrollTo(0, 0));
    console.log('native reply persisted');
    await page.screenshot({ path: path.join(output, 'modern-drawer.png') });
    await page.getByRole('button', { name: '关闭帖子侧窗', exact: true }).click();
    assert.equal(await page.locator('.cc98-topic-drawer-layer').count(), 0);
    assert(child.isDetached());
    const after = await page.evaluate(() => ({ url: location.href, scroll: scrollY, width: __parentApp.offsetWidth, inert: __parentApp.inert, draft: document.querySelector('#drawer-parent-draft').value }));
    assert.deepEqual(after, { ...baseline, inert: false, draft: '主页面草稿保留' }); checks += 3;
    assert(await title.evaluate(el => document.activeElement === el)); checks++;
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, themeStyle: 'ascii', themeMode: 'dark' } });
    });
    await page.goto(origin + '/newTopics');
    await page.locator('a.cc98-rebuild-card-title[href*="/topic/6500000"]').first().click();
    child = await drawerFrame();
    await child.locator('html[data-cc98-comfort-style="ascii"] [data-post-floor="1"]').waitFor();
    await child.locator('[data-post-floor="1"] .cc98-question-action').click();
    await child.locator('[data-post-floor="1"] .cc98-question-action.is-selected').waitFor();
    assert.equal(await child.locator('.cc98-question-notice').count(), 0); checks++;
    assert.equal(await child.locator('.cc98-rebuild-topbar').isVisible(), false, 'ASCII child also omits the duplicate topbar');
    const radius = await page.locator('.cc98-topic-drawer-close').evaluate(el => getComputedStyle(el).borderRadius);
    assert.equal(radius, '0px'); checks++;
    await page.screenshot({ path: path.join(output, 'ascii-drawer.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(180);
    assert(await page.locator('.cc98-topic-drawer-panel').evaluate(el => el.getBoundingClientRect().width <= innerWidth));
    assert(await child.locator('#cc98-comfort-app').evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1)); checks += 2;
    await page.screenshot({ path: path.join(output, 'narrow-drawer.png') });
    await page.getByRole('button', { name: '关闭帖子侧窗', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    // A regular hidden iframe remains light: only the opt-in drawer receives
    // the full runtime and MAIN-world submit/media bridge.
    const probeHandle = await page.evaluateHandle(() => { const frame = document.createElement('iframe'); frame.name = 'cc98-rebuild-conversation-probe'; frame.src = '/topic/6500000/1'; frame.style.display = 'none'; document.body.append(frame); return frame; });
    const probe = await probeHandle.asElement().contentFrame(); await probe.waitForLoadState(); await page.waitForTimeout(600);
    assert.equal(await probe.locator('#cc98-comfort-app').count(), 0); checks++;
    assert.equal(await probe.evaluate(() => Boolean(window.__cc98RebornSubmitMonitorInstalled)), false); checks++;
    await probeHandle.evaluate(el => el.remove());
    await page.locator('a.cc98-rebuild-card-title[href*="/topic/6500000"]').first().click();
    child = await drawerFrame();
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, topicDrawerEnabled: false } });
    });
    await page.locator('.cc98-topic-drawer-layer').waitFor({ state: 'detached' });
    assert(child.isDetached()); checks++;
    await page.reload();
    await page.locator('a.cc98-rebuild-card-title[href*="/topic/6500000"]').first().waitFor();
    const normalTabPromise = context.waitForEvent('page');
    await page.locator('a.cc98-rebuild-card-title[href*="/topic/6500000"]').first().evaluate(el => el.click());
    const normalTab = await normalTabPromise;
    await normalTab.waitForURL('**/topic/6500000**');
    assert.equal(await page.locator('.cc98-topic-drawer-layer').count(), 0, 'disabled drawer restores the configured normal new-tab behavior');
    await normalTab.close(); checks++;
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, topicDrawerEnabled: true } });
    });
    await page.waitForTimeout(100);
    await page.locator('a.cc98-rebuild-card-title[href*="/topic/6500000"]').first().click();
    child = await drawerFrame();
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, enabled: false } });
    });
    await page.locator('.cc98-topic-drawer-layer').waitFor({ state: 'detached' });
    assert(child.isDetached()); checks++;
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, enabled: true } });
    });
    await page.locator('a.cc98-rebuild-card-title').first().click();
    const pendingHandle = await page.locator('.cc98-topic-drawer-frame').elementHandle();
    const pending = await pendingHandle.contentFrame();
    await page.getByRole('button', { name: '关闭帖子侧窗', exact: true }).click();
    assert.equal(await page.locator('.cc98-topic-drawer-layer').count(), 0);
    assert(!pending || pending.isDetached()); checks += 2;
    // Modified clicks keep the normal browser behavior and never open a pane.
    await page.locator('a.cc98-rebuild-card-title').first().evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })));
    assert.equal(await page.locator('.cc98-topic-drawer-layer').count(), 0); checks++;
    assert.deepEqual(errors, []);
    const result = { checks, actualMV3: true, drawerOptionalDefaultEnabledAndTeardown: true, disabledDrawerUsesNormalLinkPreferenceAfterReload: true, drawerQuestionConsentCountsToggleAndPagination: true, drawerQuestionAsciiPassed: true, nativePagination: true, nativeReplyPersisted: true, parentPreserved: true, hiddenProbeUnchanged: true, errors, requests: requests.length, rejected: [...new Set(rejected)] };
    await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(result, null, 2)); console.log(result);
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
      await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ errors, requests, rejected, html: await page.content(), frames: page.frames().map(f => f.url()) }, null, 2));
    }
    throw error;
  } finally { if (context) await context.close(); server.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
