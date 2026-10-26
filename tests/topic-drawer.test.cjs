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
const feedContentOnly = process.argv.includes('--feed-content-only');
const collapseOnly = process.argv.includes('--collapse-only');
const compactTopbarOnly = process.argv.includes('--compact-topbar-only');
const watermarkOnly = process.argv.includes('--watermark-only');
const fitOnly = process.argv.includes('--fit-only');
const parallelOnly = process.argv.includes('--parallel-only') || fitOnly;
const focusOnly = process.argv.includes('--focus-only') || process.argv.includes('--feeds-only') || feedContentOnly;
const output = path.join(root, watermarkOnly ? 'outputs/watermark-cleanup/browser' : compactTopbarOnly ? 'outputs/drawer-compact-topbar/browser' : collapseOnly ? 'outputs/drawer-collapse/browser' : fitOnly ? 'outputs/drawer-fit-left/browser' : parallelOnly ? 'outputs/drawer-parallel-browsing/browser' : focusOnly ? 'outputs/feed-drawer-sidebar/browser' : 'outputs/drawer-link-navigation');
async function executable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  for (const name of (await fs.readdir(cache)).filter(n => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const file = path.join(cache, name, 'chrome-win64/chrome.exe');
    try { await fs.access(file); return file; } catch {}
  }
  throw new Error('Full Chromium is needed to verify the actual MV3 frame injection.');
}
async function testFocusDrawer({ page, worker, context, requests, errors }) {
  let checks = 0;
  await worker.evaluate(async () => {
    const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
    await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, topicDrawerEnabled: true, themeStyle: 'ascii', themeMode: 'dark' } });
  });
  if (!feedContentOnly) {
    await page.goto(origin + '/focus');
    const title = page.locator('#cc98-comfort-app a.cc98-rebuild-card-title[href*="/topic/6500000"]').first();
    await title.waitFor();
    assert(await page.locator('.focus-root .focus-topic-title[href*="/topic/6500000"]').count(), 'the source is the real native following feed, not synthetic page markup'); checks++;
    assert(requests.some(r => new URL(r.url).pathname === '/me/custom-board/topic')); checks++;
    await title.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      // Snapshot the real user-click boundary, after any native feed update or
      // Playwright scroll/hover adjustment but before the document drawer guard.
      window.addEventListener('click', event => {
        if (!event.target.closest?.('a.cc98-rebuild-card-title[href*="/topic/6500000"]')) return;
        window.__focusDrawerApp = document.querySelector('#cc98-comfort-app');
        window.__focusDrawerCards = [...__focusDrawerApp.querySelectorAll('.cc98-rebuild-card')];
        window.__focusDrawerBeforeClick = { url: location.href, scroll: scrollY, width: __focusDrawerApp.offsetWidth,
          titles: [...__focusDrawerApp.querySelectorAll('.cc98-rebuild-card-title')].map(a => a.textContent) };
      }, { capture: true, once: true });
    });
    await title.click();
    const before = await page.evaluate(() => window.__focusDrawerBeforeClick);
    assert(before.scroll > 0, 'the real following feed must have a non-zero reading position'); checks++;
    await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 });
    const child = await (await page.locator('.cc98-topic-drawer-frame').elementHandle()).contentFrame();
    await child.locator('[data-post-floor="1"]').waitFor();
    const preserved = async () => page.evaluate(() => ({ url: location.href, scroll: scrollY, width: __focusDrawerApp.offsetWidth,
      titles: [...__focusDrawerApp.querySelectorAll('.cc98-rebuild-card-title')].map(a => a.textContent),
      sameApp: __focusDrawerApp === document.querySelector('#cc98-comfort-app'),
      sameCards: __focusDrawerCards.every((node, index) => node === __focusDrawerApp.querySelectorAll('.cc98-rebuild-card')[index]) }));
    let state = await preserved();
    assert.deepEqual({ url: state.url, scroll: state.scroll, width: state.width, titles: state.titles }, before);
    assert(state.sameApp && state.sameCards); checks += 2;
    await child.locator('.cc98-rebuild-pager a[href*="/topic/6500000/2"]').first().click();
    await child.waitForURL('**/topic/6500000/2'); await child.locator('[data-post-floor="11"]').waitFor();
    assert.equal(page.url(), before.url); assert.equal(context.pages().length, 2); checks += 2;
    await page.screenshot({ path: path.join(output, 'ascii-focus-drawer.png') });
    await page.getByRole('button', { name: '关闭帖子侧窗', exact: true }).click();
    assert(child.isDetached()); assert.equal(await page.locator('.cc98-topic-drawer-layer').count(), 0); checks += 2;
    state = await preserved();
    assert(state.sameApp && state.sameCards); assert.equal(state.scroll, before.scroll);
    assert.equal(await page.locator('#cc98-comfort-app').evaluate(app => app.inert), false); checks += 3;
    const modifiedPopupPromise = context.waitForEvent('page');
    await title.click({ modifiers: ['Control'] }); const modifiedPopup = await modifiedPopupPromise;
    await modifiedPopup.waitForURL('**/topic/6500000**');
    assert.equal(await page.locator('.cc98-topic-drawer-layer').count(), 0); await modifiedPopup.close(); checks++;
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, topicDrawerEnabled: false } });
    });
    await page.waitForTimeout(200);
    const disabledPopupPromise = context.waitForEvent('page'); await title.click(); const disabledPopup = await disabledPopupPromise;
    await disabledPopup.waitForURL('**/topic/6500000**');
    assert.equal(await page.locator('.cc98-topic-drawer-layer').count(), 0); await disabledPopup.close(); checks++;
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, topicDrawerEnabled: true } });
    });
  }
  await worker.evaluate(async () => chrome.storage.local.set({ 'cc98RebornReadLater:v1:uid:795406': [
    { key: 'topic:6500000', href: 'https://www.cc98.org/topic/6500000/1', title: '侧窗稍后再看示例', addedAt: Date.now() }
  ] }));
  const includedRoutes = [];
  for (const route of ['/recommendedTopics', '/board/81', '/search?keyword=%E4%BE%A7%E7%AA%97', '/newTopics', '/#cc98-reborn-read-later']) {
    await page.goto(origin + route);
    const topic = page.locator('#cc98-comfort-app a.cc98-rebuild-card-title[href*="/topic/"]').first();
    await topic.waitFor(); await topic.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1600);
    await page.evaluate(() => {
      window.__feedDrawerApp = document.querySelector('#cc98-comfort-app');
      window.__feedDrawerCards = [...__feedDrawerApp.querySelectorAll('.cc98-rebuild-card')];
      window.__feedDrawerScroll = scrollY;
    });
    const parentUrl = page.url(); // Native search canonicalizes boardId=0.
    await topic.click(); await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 });
    const frame = await (await page.locator('.cc98-topic-drawer-frame').elementHandle()).contentFrame();
    await frame.locator('[data-post-floor="1"] .cc98-rebuild-post-body').waitFor();
    assert.equal(page.url(), parentUrl);
    assert(await page.evaluate(() => __feedDrawerApp === document.querySelector('#cc98-comfort-app')
      && __feedDrawerCards.every((node, i) => node === __feedDrawerApp.querySelectorAll('.cc98-rebuild-card')[i])
      && scrollY === __feedDrawerScroll), `${route}: parent nodes and position must stay intact`);
    if (route === '/recommendedTopics') await page.screenshot({ path: path.join(output, 'ascii-recommended-drawer.png') });
    await page.getByRole('button', { name: '关闭帖子侧窗', exact: true }).click();
    assert(frame.isDetached());
    includedRoutes.push(route); checks += 4;
  }
  if (feedContentOnly) {
    assert.deepEqual(errors, []);
    const result = { passed: true, checks, includedRoutes, actualPostBodiesLoaded: true, parentNodesAndPositionPreserved: true, closeReleasesFrame: true };
    await fs.writeFile(path.join(output, 'loaded-feeds-validation.json'), JSON.stringify(result, null, 2));
    console.log(result);
    return;
  }
  const excludedRoutes = [];
  for (const route of ['/boardList', '/usercenter/myfollowings/1']) {
    await page.goto(origin + route);
    const selector = route.includes('myfollowings') ? '#cc98-comfort-app .user-center-myfollowings-user a[href*="/user/"]' : '#cc98-comfort-app a.cc98-rebuild-card-title[href*="/board/"]';
    const normalLink = page.locator(selector).filter({ hasNotText: '帖子侧拉窗' }).first(); await normalLink.waitFor();
    const href = await normalLink.getAttribute('href');
    const popupPromise = context.waitForEvent('page'); await normalLink.click(); const popup = await popupPromise;
    await popup.waitForURL(new URL(href, origin).href);
    assert.equal(await page.locator('.cc98-topic-drawer-layer').count(), 0); assert.equal(page.url(), origin + route);
    await popup.close(); excludedRoutes.push(route); checks += 2;
  }
  const settingsPage = await context.newPage();
  await settingsPage.goto(new URL('/popup/popup.html', worker.url()).href);
  const label = settingsPage.locator('label').filter({ has: settingsPage.locator('#topicDrawerEnabled') });
  assert.match(await label.textContent(), /所有帖子列表/);
  assert.match(await label.getAttribute('title'), /所有瀑布流帖子列表/); assert(await label.isVisible()); checks += 3;
  checks += await testSidebarPosition({ page, worker, settingsPage });
  await label.screenshot({ path: path.join(output, 'focus-setting-label.png') }); await settingsPage.close();
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, actualMV3: true, nativeReactFocusRoute: '/focus', realNativeFollowingFeed: true,
    followsApiObserved: '/me/custom-board/topic', parentUrlContentNodesAndNonzeroScrollPreserved: true, sameTopicPagination: true,
    closeReleasesFrame: true, disabledDrawerUsesNormalNewTabPreference: true, modifiedClickUsesNativeNewTab: true,
    includedRoutes, excludedRoutes, allTopicListsEligible: true, sidebarPosition: true, screenshots: ['ascii-focus-drawer.png', 'ascii-recommended-drawer.png', 'focus-setting-label.png', 'modern-left-sidebar.png', 'ascii-right-sidebar.png', 'narrow-left-sidebar.png'].map(f => path.join(output, f)),
    reusedUnchangedNavigationEvidence: path.join(root, 'outputs/drawer-link-navigation/validation.json'), errors };
  await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(result, null, 2)); console.log(result);
}

async function testSidebarPosition({ page, settingsPage }) {
  assert.equal(await settingsPage.locator('#topicsSidebarPosition').count(), 0);
  await page.goto(origin + '/newTopics');
  await page.locator('.cc98-rebuild-new-topic-controls').waitFor();
  const geometry = await page.locator('.cc98-rebuild-topics-read-later-layout').evaluate(node => {
    const feed = node.querySelector('.cc98-rebuild-topics-read-later-feed').getBoundingClientRect();
    const side = node.querySelector('.cc98-rebuild-topics-side-column').getBoundingClientRect();
    return { feed: feed.right, side: side.left, open: node.querySelector('details').open };
  });
  assert(geometry.feed <= geometry.side && geometry.open);
  return 2;
}

async function testParallelDrawer({ page, worker, context, errors }) {
  let checks = 0;
  await worker.evaluate(async () => {
    const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
    await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, themeStyle: 'ascii', themeMode: 'dark', topicDrawerEnabled: true } });
  });
  await page.goto(origin + '/newTopics');
  await page.locator('[data-new-topic-mode="card"]').click();
  await page.locator('[data-cc98-virtual="true"]').waitFor();
  await page.waitForTimeout(1800);
  const normalMainWidth = await page.locator('#cc98-comfort-app').evaluate(node => node.getBoundingClientRect().width);
  const virtualStatus = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.CC98RebornNewTopicsVirtual.status() }))[0].result;
  });
  const titles = () => page.locator('#cc98-comfort-app [data-feed-kind="topics"] a.cc98-rebuild-card-title');
  await titles().first().click();
  async function loadedFrame() {
    await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 });
    const frame = await (await page.locator('.cc98-topic-drawer-frame').elementHandle()).contentFrame();
    await frame.locator('[data-post-floor="1"] .cc98-rebuild-post-body').waitFor();
    return frame;
  }
  let child = await loadedFrame();
  const fitted = [];
  async function assertFitted(label) {
    const sizes = await page.evaluate(() => {
      const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width }; };
      const main = document.querySelector('#cc98-comfort-app'), panel = document.querySelector('.cc98-topic-drawer-panel');
      const feed = main.querySelector('[data-feed-kind="topics"], .cc98-rebuild-home-hot-section .cc98-rebuild-list');
      return { main: box(main), panel: box(panel), feed: box(feed), cards: [...feed.querySelectorAll(':scope > .cc98-rebuild-card')].map(box), client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
    });
    assert(Math.abs(sizes.main.x - 16) <= 1, `${label}: left margin`);
    assert(sizes.panel.x - sizes.main.right >= 12 && sizes.panel.x - sizes.main.right <= 20, `${label}: drawer margin ${JSON.stringify(sizes)}`);
    assert(sizes.cards.length && sizes.cards.every(card => Math.abs(card.width - sizes.feed.width) <= 2 && card.right <= sizes.panel.x - 10), `${label}: every card must fill, not crop, the left feed`);
    assert(sizes.scroll <= sizes.client + 1, `${label}: no horizontal overflow`);
    if (label.includes('ten')) assert(await page.locator('.cc98-rebuild-home-hot-section .cc98-rebuild-card-title').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().width >= node.closest('.cc98-rebuild-card').getBoundingClientRect().width * .6)), 'top-ten titles must retain a readable column width');
    fitted.push({ label, ...sizes }); checks++;
    return sizes;
  }
  if (process.argv.includes('--home-preview-only')) {
    await page.goto(origin + '/');
    await page.locator('[data-home-section-kind="hot"] a.cc98-rebuild-card-title').first().click();
    child = await loadedFrame();
    await assertFitted('ascii top ten preview');
    assert.equal(await page.locator('#cc98-comfort-app > .cc98-rebuild-topbar').evaluate(node => getComputedStyle(node).position), 'relative', 'ASCII frame decorations keep the topbar as their positioning context');
    await page.screenshot({ path: path.join(output, 'ascii-fitted-home.png') });
    await fs.writeFile(path.join(output, 'home-preview-validation.json'), JSON.stringify({ passed: true, fitted, asciiFrameContext: true }, null, 2));
    console.log('final fitted ASCII home and frame context passed');
    return;
  }
  if (fitOnly) {
    const initial = await assertFitted('ASCII new topics');
    await page.locator('.cc98-topic-drawer-resizer').press('ArrowLeft');
    await page.waitForTimeout(160);
    const resized = await assertFitted('resized left pane');
    assert(resized.main.width < initial.main.width); checks++;
    const tools = page.locator('details.cc98-rebuild-topics-side-column');
    assert.equal(await tools.evaluate(node => node.open), false);
    await tools.locator('summary').click();
    assert(await page.locator('.cc98-rebuild-new-topic-controls').isVisible());
    await page.locator('.cc98-rebuild-read-later-sidebar-search input').fill('保留工具搜索');
    await page.screenshot({ path: path.join(output, 'expanded-tools.png') });
    await tools.locator('summary').click();
    assert.equal(await page.locator('.cc98-rebuild-read-later-sidebar-search input').inputValue(), '保留工具搜索'); checks += 2;
  }
  const parentUrl = page.url(), childUrl = child.url();
  assert.equal(await page.locator('#cc98-comfort-app').evaluate(node => node.inert), false);
  assert.notEqual(await page.locator('.cc98-topic-drawer-panel').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('.cc98-topic-drawer-backdrop').count(), 0);
  assert.notEqual(await page.locator('html').evaluate(node => getComputedStyle(node).overflowY), 'hidden');
  assert(!(await virtualStatus()).paused); checks += 5;
  const before = { scroll: await page.evaluate(() => scrollY), childScroll: await child.evaluate(() => scrollY), virtual: await virtualStatus() };
  await page.mouse.move(120, 680); await page.mouse.wheel(0, 1400);
  await page.waitForFunction(y => scrollY > y + 300, before.scroll);
  assert.equal(child.url(), childUrl); assert.equal(await child.evaluate(() => scrollY), before.childScroll); checks += 2;
  const leftScroll = await page.evaluate(() => scrollY);
  await page.mouse.move(1250, 700); await page.mouse.wheel(0, 450);
  await child.waitForFunction(y => scrollY > y + 30, before.childScroll);
  assert(Math.abs(await page.evaluate(() => scrollY) - leftScroll) <= 4, 'right wheel input must not scroll the main list'); checks++;
  await child.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.mouse.wheel(0, 900); await page.waitForTimeout(250);
  assert(Math.abs(await page.evaluate(() => scrollY) - leftScroll) <= 4, 'the right document must not chain wheel input into the main list at its lower boundary'); checks++;
  console.log('parallel drawer: both scroll surfaces accept independent real wheel input');

  for (let step = 0; step < 7; step++) {
    await page.mouse.move(120, 680); await page.mouse.wheel(0, 1800); await page.waitForTimeout(450);
    const current = await virtualStatus();
    if (current.total > before.virtual.total && current.start > before.virtual.start) break;
  }
  const advanced = await virtualStatus();
  assert(advanced.start > before.virtual.start, 'virtualization must keep advancing on the left');
  assert(advanced.total > before.virtual.total, 'native infinite loading must append while a topic is open');
  assert(!advanced.paused && advanced.mounted < advanced.total);
  assert.equal(child.url(), childUrl); checks += 4;
  console.log('parallel drawer: left infinite load and bounded virtual rendering remain active');

  async function visibleLink(selector) {
    const links = page.locator(selector);
    const index = await links.evaluateAll(nodes => nodes.findIndex(node => {
      const box = node.getBoundingClientRect();
      return box.y >= 150 && box.bottom <= innerHeight - 50 && box.x >= 0 && box.x + 12 < innerWidth - Number(document.documentElement.style.getPropertyValue('--cc98-drawer-width').replace('px', ''));
    }));
    assert(index >= 0, 'a left-list link must remain reachable through the transparent outer layer');
    return links.nth(index);
  }
  const next = await visibleLink('#cc98-comfort-app [data-feed-kind="topics"] a.cc98-rebuild-card-title');
  const nextUrl = await next.getAttribute('href'), old = child;
  const beforeSwitch = await page.evaluate(() => scrollY);
  await next.click({ position: { x: 10, y: 10 } });
  child = await loadedFrame();
  assert.equal(child.url(), new URL(nextUrl, origin).href); assert(old.isDetached());
  assert.equal(await page.locator('.cc98-topic-drawer-frame').count(), 1);
  assert.equal(page.url(), parentUrl);
  assert(Math.abs(await page.evaluate(() => scrollY) - beforeSwitch) <= 4); checks += 5;
  await child.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, 'ascii-parallel-lists.png') });
  console.log('parallel drawer: exposed left title replaces the right document and releases the old frame');

  const board = await visibleLink('#cc98-comfort-app [data-feed-kind="topics"] a.cc98-rebuild-chip[href*="/board/"]');
  const popupPromise = context.waitForEvent('page');
  await board.click({ position: { x: 10, y: 10 } }); const popup = await popupPromise;
  await popup.waitForURL('**/board/**');
  assert(!child.isDetached()); assert.equal(page.url(), parentUrl); await popup.close(); checks += 2;
  await page.locator('.cc98-topic-drawer-new-tab').focus();
  await page.locator('.cc98-topic-drawer-new-tab').press('Shift+Tab');
  const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, className: document.activeElement?.className,
    inDrawer: Boolean(document.activeElement?.closest('.cc98-topic-drawer-layer')) }));
  assert(!focus.inDrawer, `Tab is not trapped inside the non-modal drawer: ${JSON.stringify(focus)}`); checks++;
  await titles().first().focus();
  assert(await page.evaluate(() => Boolean(document.activeElement?.closest('#cc98-comfort-app'))), 'main-list links remain keyboard-focusable while the right pane is open'); checks++;
  await page.evaluate(() => { history.pushState({ cc98ComfortImageViewer: true }, '', location.href); history.back(); });
  await page.waitForTimeout(250);
  assert(!child.isDetached(), 'same-URL viewer history must not close the right document'); checks++;
  await page.getByRole('button', { name: '关闭帖子侧窗', exact: true }).click();
  assert(child.isDetached());
  if (fitOnly) {
    await page.waitForTimeout(200);
    assert(Math.abs(await page.locator('#cc98-comfort-app').evaluate(node => node.getBoundingClientRect().width) - normalMainWidth) <= 1, 'closing restores the normal main width'); checks++;
  }
  assert.equal(await page.locator('html').evaluate(node => node.classList.contains('cc98-topic-drawer-split')), false); checks += 2;

  await worker.evaluate(async () => {
    const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
    await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, themeStyle: 'modern', themeMode: 'light' } });
  });
  await page.waitForFunction(() => document.documentElement.dataset.cc98ComfortStyle === 'modern');
  await page.evaluate(() => scrollTo(0, 0));
  await titles().first().click(); child = await loadedFrame();
  await page.screenshot({ path: path.join(output, 'modern-parallel-lists.png') });
  if (fitOnly) {
    await assertFitted('Reborn new topics');
    for (const style of ['ascii', 'modern']) {
      await worker.evaluate(async style => {
        const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
        await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, themeStyle: style, themeMode: style === 'ascii' ? 'dark' : 'light' } });
      }, style);
      await page.goto(origin + '/');
      const title = page.locator('[data-home-section-kind="hot"] a.cc98-rebuild-card-title').first();
      await title.waitFor(); await title.click(); child = await loadedFrame();
      await assertFitted(`${style} top ten`);
      await page.screenshot({ path: path.join(output, `${style}-fitted-home.png`) });
      await page.setViewportSize({ width: 1024, height: 1000 }); await page.waitForTimeout(200);
      await assertFitted(`${style} 1024 desktop`);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole('button', { name: '关闭帖子侧窗', exact: true }).click();
    }
    await page.goto(origin + '/newTopics'); await titles().first().click(); child = await loadedFrame();
  }
  await page.evaluate(() => { history.pushState({}, '', '/board/81'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.locator('.cc98-topic-drawer-layer').waitFor({ state: 'detached' });
  assert(child.isDetached()); checks++;
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, nativeForum: true, independentWheelScrolling: true, liveInfiniteLoading: true,
    virtualWindow: { before: before.virtual, after: advanced }, leftTitleSwitchReleasesOldFrame: true,
    ordinaryLeftLinksFollowGlobalPreference: true, nonModalKeyboard: true, focusAfterBackwardTab: focus, parentRouteCleanup: true, fitted, errors };
  await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(result, null, 2)); console.log(result);
}

async function testCollapseControl({ page, worker, errors }) {
  let checks = 0;
  const measurements = [];
  const title = () => page.locator('#cc98-comfort-app a.cc98-rebuild-card-title[href*="/topic/"]').first();
  async function open() {
    await title().click();
    await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 });
    const frame = await (await page.locator('.cc98-topic-drawer-frame').elementHandle()).contentFrame();
    await frame.locator('[data-post-floor="1"] .cc98-rebuild-post-body').waitFor();
    return frame;
  }
  async function geometry(label, narrow = false) {
    const value = await page.locator('.cc98-topic-drawer-collapse').evaluate(button => {
      const a = button.getBoundingClientRect(), b = button.closest('.cc98-topic-drawer-panel').getBoundingClientRect();
      return { x: a.x, right: a.right, width: a.width, centerX: a.x + a.width / 2, centerY: a.y + a.height / 2,
        divider: b.x, viewport: innerWidth, height: innerHeight,
        hit: document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2)?.closest('button') === button };
    });
    assert(value.hit, `${label}: the visible button receives clicks, not the drag handle`);
    assert(Math.abs(value.centerY - value.height / 2) <= 1);
    if (narrow) assert(value.x >= 0 && value.right <= value.viewport);
    else assert(Math.abs(value.centerX - value.divider) <= 1, `${label}: ${JSON.stringify(value)}`);
    measurements.push({ label, ...value }); checks += 3;
    return value;
  }
  for (const style of ['modern', 'ascii']) {
    await worker.evaluate(async style => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, themeStyle: style, themeMode: style === 'ascii' ? 'dark' : 'light' } });
    }, style);
    await page.goto(origin + '/newTopics'); await title().waitFor(); await page.waitForTimeout(1600);
    const normalWidth = await page.locator('#cc98-comfort-app').evaluate(node => node.getBoundingClientRect().width);
    let child = await open(); const initial = await geometry(style);
    await page.locator('.cc98-topic-drawer-resizer').evaluate(node => {
      window.__collapseResizeStarts = 0; node.addEventListener('pointerdown', () => __collapseResizeStarts++);
    });
    const width = await page.locator('.cc98-topic-drawer-panel').evaluate(node => node.getBoundingClientRect().width);
    await page.mouse.move(initial.divider, initial.centerY - 100); await page.mouse.down();
    await page.mouse.move(initial.divider - 50, initial.centerY - 100, { steps: 4 }); await page.mouse.up();
    assert(await page.locator('.cc98-topic-drawer-panel').evaluate(node => node.getBoundingClientRect().width) > width + 30, 'the remaining divider still resizes the pane'); checks++;
    await geometry(`${style} resized`);
    await page.screenshot({ path: path.join(output, `${style}-divider-button.png`) });
    const dragStarts = await page.evaluate(() => __collapseResizeStarts);
    await page.getByRole('button', { name: '收起侧拉窗', exact: true }).click();
    await page.locator('.cc98-topic-drawer-layer').waitFor({ state: 'detached' });
    assert(child.isDetached());
    assert.equal(await page.evaluate(() => __collapseResizeStarts), dragStarts, 'clicking collapse must not begin a resize');
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('cc98-topic-drawer-split')), false);
    assert(Math.abs(await page.locator('#cc98-comfort-app').evaluate(node => node.getBoundingClientRect().width) - normalWidth) <= 1); checks += 4;
    child = await open();
    await page.getByRole('button', { name: '收起侧拉窗', exact: true }).focus();
    await page.getByRole('button', { name: '收起侧拉窗', exact: true }).press('Enter');
    await page.locator('.cc98-topic-drawer-layer').waitFor({ state: 'detached' });
    assert(child.isDetached()); checks++;
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const child = await open(); await geometry('narrow', true);
  await page.screenshot({ path: path.join(output, 'narrow-divider-button.png') });
  await page.getByRole('button', { name: '收起侧拉窗', exact: true }).press('Space');
  await page.locator('.cc98-topic-drawer-layer').waitFor({ state: 'detached' });
  assert(child.isDetached()); checks++;
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, dividerButton: true, dragStillWorks: true, clickDoesNotResize: true,
    restoresMainWidth: true, releasesFrame: true, keyboardEnterAndSpace: true, narrowButtonReachable: true, measurements, errors };
  await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(result, null, 2)); console.log(result);
}

async function testCompactTopbar({ page, worker, errors }) {
  let checks = 0;
  const measurements = [];
  async function measure(label) {
    const value = await page.evaluate(() => {
      const header = document.querySelector('#cc98-comfort-app > .cc98-rebuild-topbar');
      const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const account = header.querySelector('.cc98-rebuild-native-user-entry');
      const rocket = document.querySelector('.cc98-topic-drawer-back-top');
      const r = rocket.getBoundingClientRect();
      return { header: box(header), brand: box(header.querySelector('.cc98-rebuild-brand')),
        account: box(account), name: box(account.querySelector('.topBarUserName')),
        nav: box(header.querySelector('.cc98-rebuild-nav')), search: box(header.querySelector('.cc98-rebuild-search')),
        controls: [...header.querySelectorAll('.cc98-rebuild-nav a, .cc98-rebuild-search :is(input, select, button)')].filter(el => el.getClientRects().length).map(box),
        rocket: { ...box(rocket), radius: getComputedStyle(rocket).borderRadius,
          hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === rocket,
          svg: Boolean(rocket.querySelector('svg path')), outsideTools: !rocket.closest('details') },
        divider: document.querySelector('.cc98-topic-drawer-panel').getBoundingClientRect().x,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        nameText: account.querySelector('.topBarUserName').textContent };
    });
    await fs.writeFile(path.join(output, 'current-measurement.json'), JSON.stringify({ label, ...value }, null, 2));
    assert(Math.abs(value.brand.y + value.brand.height / 2 - value.account.y - value.account.height / 2) < 2, `${label}: brand/account share row`);
    assert(value.nav.y >= value.brand.bottom && value.search.y >= value.nav.bottom, `${label}: ordered header rows`);
    assert(value.header.height < (value.header.width > 450 ? 175 : 225), `${label}: compact header ${JSON.stringify(value)}`);
    assert(value.account.right <= value.header.right && value.name.width > 0 && value.name.y >= value.account.y && value.name.bottom <= value.account.bottom, `${label}: account name aligned inside compact entry`);
    assert(value.controls.every(r => r.x >= value.header.x && r.right <= value.header.right + 1), `${label}: all navigation/search controls stay inside header`);
    assert(value.controls.every((r, i) => value.controls.slice(i + 1).every(s => Math.min(r.right, s.right) - Math.max(r.x, s.x) < 1 || Math.min(r.bottom, s.bottom) - Math.max(r.y, s.y) < 1)), `${label}: controls do not overlap`);
    assert(!value.horizontalOverflow, `${label}: no horizontal document overflow`);
    assert(value.rocket.hit && value.rocket.svg && value.rocket.outsideTools, `${label}: independent SVG button receives clicks`);
    assert.equal(value.rocket.width, 48); assert.equal(value.rocket.height, 48); assert.equal(value.rocket.radius, '50%');
    assert(value.rocket.right < value.divider && value.rocket.x > 16, `${label}: rocket stays in main pane`);
    measurements.push({ label, ...value }); checks += 12;
  }
  for (const [style, sideTopbar] of [['modern', false], ['ascii', false], ['modern', true]]) {
    await worker.evaluate(async ({ style, sideTopbar }) => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, themeStyle: style,
        themeMode: style === 'ascii' ? 'dark' : 'light', sideTopbar, openLinksInNewTab: false } });
    }, { style, sideTopbar });
    await page.goto(origin + '/newTopics');
    const title = page.locator('#cc98-comfort-app a.cc98-rebuild-card-title[href*="/topic/"]').first();
    await title.waitFor(); await page.waitForTimeout(1600);
    const normal = await page.locator('.cc98-rebuild-topbar').evaluate(el => ({ width: el.offsetWidth, display: getComputedStyle(el).display }));
    await title.click(); await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 });
    const child = await (await page.locator('.cc98-topic-drawer-frame').elementHandle()).contentFrame();
    await child.locator('[data-post-floor="1"] .cc98-rebuild-post-body').waitFor();
    const separator = page.getByRole('separator');
    // 496px main card area, matching the supplied narrow-left-pane example.
    let divider = await page.locator('.cc98-topic-drawer-panel').evaluate(el => el.getBoundingClientRect().x);
    await page.mouse.move(divider, 300); await page.mouse.down(); await page.mouse.move(528, 300, { steps: 4 }); await page.mouse.up();
    await page.waitForTimeout(250); await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await measure(`${style}-${sideTopbar ? 'rail' : 'header'}-496`);
    await page.screenshot({ path: path.join(output, `${style}-${sideTopbar ? 'rail' : 'header'}-496.png`) });
    const account = page.locator('#cc98-comfort-app .cc98-rebuild-native-user-entry').first();
    await account.focus();
    const menu = account.locator('.cc98-rebuild-side-topbar-menu');
    await menu.waitFor({ state: 'visible' });
    assert(await menu.getByRole('link').count() > 0, 'native account menu retains its links'); checks++;
    await page.locator('.cc98-topic-drawer-close').focus();
    await menu.waitFor({ state: 'hidden' });
    await page.evaluate(() => { document.querySelector('#cc98-comfort-app .topBarUserName').textContent = '这是一个非常非常长的论坛用户名 LongAccountName'; });
    await separator.press('End'); await page.waitForTimeout(250); await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await measure(`${style}-${sideTopbar ? 'rail' : 'header'}-minimum-long-name`);
    await page.screenshot({ path: path.join(output, `${style}-${sideTopbar ? 'rail' : 'header'}-minimum.png`) });
    await page.evaluate(() => scrollTo({ top: 650, behavior: 'instant' }));
    await child.evaluate(() => scrollTo({ top: 600, behavior: 'instant' }));
    await page.waitForTimeout(300);
    const childScroll = await child.evaluate(() => scrollY);
    assert(await page.evaluate(() => scrollY > 200)); assert(childScroll > 100); checks += 2;
    await page.getByRole('button', { name: '回到页面顶部', exact: true }).click();
    await page.waitForFunction(() => scrollY === 0); await page.waitForTimeout(450);
    assert.equal(await page.evaluate(() => scrollY), 0); assert.equal(await child.evaluate(() => scrollY), childScroll); checks += 2;
    assert.equal(await page.locator('.cc98-topic-drawer-back-top').count(), 1); checks++;
    await page.locator('.cc98-topic-drawer-collapse').click();
    assert.equal(await page.locator('.cc98-topic-drawer-back-top').count(), 0); assert(child.isDetached()); checks += 2;
    assert.deepEqual(await page.locator('.cc98-rebuild-topbar').evaluate(el => ({ width: el.offsetWidth, display: getComputedStyle(el).display })), normal); checks++;
    assert(await page.locator('.cc98-rebuild-topics-side-column .cc98-rebuild-back-to-top').isVisible()); checks++;
  }
  // The floating main-page action is omitted when the child covers a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#cc98-comfort-app a.cc98-rebuild-card-title[href*="/topic/"]').first().click();
  await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 });
  assert.equal(await page.locator('.cc98-topic-drawer-back-top').isVisible(), false); checks++;
  await page.locator('.cc98-topic-drawer-collapse').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Native form and navigation remain usable from the compact layout.
  await page.locator('#cc98-comfort-app a.cc98-rebuild-card-title[href*="/topic/"]').first().click();
  await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 });
  const input = page.locator('#cc98-comfort-app .cc98-rebuild-search input');
  await input.fill('侧窗'); await input.press('Enter');
  await page.waitForURL('**/search?**');
  assert.equal(await page.locator('.cc98-topic-drawer-layer').count(), 0); checks++;
  await page.locator('.cc98-rebuild-nav a').filter({ hasText: '插件设置' }).click();
  await page.waitForURL('**/userCenter#cc98-reborn-settings'); checks++;
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, compactRows: true, nativeAccountMenu: true, nativeSearchAndNavigation: true,
    independentCircularRocket: true, mainScrollOnly: true, cleanupAndOrdinaryHeaderRestored: true, measurements, errors };
  await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(result, null, 2)); console.log(result);
}

async function testWatermark({ page, worker, errors }) {
  let checks = 0;
  const samples = [];
  async function state() {
    return worker.evaluate(async () => {
      const tab = (await chrome.tabs.query({ url: 'https://www.cc98.org/*' }))[0];
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => ({
        top: window.top === window, href: location.href, hosts: document.querySelectorAll('cc98-reborn-watermark').length,
        uid: typeof securityWatermarkUserId === 'string' ? securityWatermarkUserId : null,
        lines: typeof securityWatermarkTileKey === 'string' ? securityWatermarkTileKey.split('\n').slice(1) : [],
        font: typeof securityWatermarkTileCanvas !== 'undefined' ? securityWatermarkTileCanvas?.getContext('2d').font : null,
        timers: typeof securityWatermarkClockTimer !== 'undefined' ? [securityWatermarkClockTimer, securityWatermarkDirectionTimer, securityWatermarkEnsureTimer, securityWatermarkRevalidateTimer] : [],
        ratio: typeof securityWatermarkCanvas !== 'undefined' ? securityWatermarkCanvas?.dataset.pixelRatio : null,
        passThrough: getComputedStyle(document.querySelector('cc98-reborn-watermark') || document.body).pointerEvents,
        seconds: Math.floor(Date.now() / 1000)
      }) })).map(item => item.result);
    });
  }
  async function check(expectedTopic, childExpected) {
    const frames = await state(), top = frames.find(frame => frame.top);
    assert.equal(top.hosts, 1); assert.equal(top.uid, '795406'); checks += 2;
    assert.equal(top.lines.length, 2); assert.equal(top.lines[0], `795406 ${String(expectedTopic).padStart(8, '0')}`); checks += 2;
    assert(/^\d{15}$/.test(top.lines[1])); assert(Math.abs(Number(top.lines[1]) - top.seconds) <= 1); checks += 2;
    assert.match(top.font, /Consolas/); assert.equal(top.ratio, '2'); assert.equal(top.passThrough, 'none'); checks += 3;
    if (childExpected) {
      const child = frames.find(frame => !frame.top && /\/topic\//.test(frame.href));
      assert(child); assert.equal(child.hosts, 0); assert.equal(child.uid, ''); assert(child.timers.every(timer => timer === 0)); checks += 4;
    }
    assert.equal(frames.reduce((n, frame) => n + frame.hosts, 0), 1); checks++;
    samples.push(frames); return top;
  }
  await page.goto(origin + '/newTopics');
  const title = () => page.locator('#cc98-comfort-app a.cc98-rebuild-card-title[href*="/topic/6500000"]').first();
  await title().waitFor(); await page.locator('cc98-reborn-watermark').waitFor({ state: 'attached' }); await page.waitForTimeout(1800);
  await check(0, false);
  await title().click(); await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 });
  let child = await (await page.locator('.cc98-topic-drawer-frame').elementHandle()).contentFrame();
  await child.locator('[data-post-floor="1"] .cc98-rebuild-post-body').waitFor(); await page.waitForTimeout(250);
  const first = await check(6500000, true);
  await page.screenshot({ path: path.join(output, 'single-owner-two-line-watermark.png') });
  await page.waitForTimeout(1200); const next = await check(6500000, true);
  assert(Number(next.lines[1]) > Number(first.lines[1])); checks++;
  await child.locator('.cc98-rebuild-pager a[href*="/topic/6500000/2"]').first().click();
  await child.waitForURL('**/topic/6500000/2'); await child.locator('[data-post-floor="11"]').waitFor(); await page.waitForTimeout(250);
  await check(6500000, true);
  await page.locator('.cc98-topic-drawer-collapse').click(); assert(child.isDetached()); checks++;
  await page.waitForTimeout(100); await check(0, false);
  const other = page.locator('#cc98-comfort-app a.cc98-rebuild-card-title[href*="/topic/"]').first();
  const otherId = new URL(await other.getAttribute('href'), origin).pathname.match(/\/topic\/(\d+)/)[1];
  await other.click(); await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 }); await page.waitForTimeout(250);
  await check(otherId, true);
  await worker.evaluate(async () => {
    const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
    await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, themeStyle: 'ascii', themeMode: 'dark' } });
  });
  await page.locator('html[data-cc98-comfort-style="ascii"]').waitFor(); await page.waitForTimeout(300);
  await check(otherId, true); await page.screenshot({ path: path.join(output, 'ascii-single-watermark.png') });
  await page.locator('.cc98-topic-drawer-collapse').click();
  await page.goto(origin + '/topic/6500000/2#11'); await page.locator('[data-post-floor="11"]').waitFor(); await page.waitForTimeout(200);
  await check(6500000, false);
  await worker.evaluate(() => chrome.storage.local.remove('cc98RebornOpenIdBinding:v1'));
  await page.locator('cc98-reborn-watermark').waitFor({ state: 'detached' });
  const stopped = (await state()).find(frame => frame.top);
  assert(stopped.timers.every(timer => timer === 0)); assert.equal(stopped.uid, ''); checks += 2;
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, onlyTopDocumentRenders: true, childHasNoWatermarkTimers: true,
    uidTopicAndUnixSeconds: true, consolas: true, liveTimestamp: true, dpr2Pattern: true,
    drawerOpenPaginationReplacementClose: true, nativeTopicWithHash: true, unbindingCleanup: true, samples, errors };
  await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(result, null, 2)); console.log({ ...result, samples: samples.length });
}

async function main() {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'cc98-drawer-'));
  const server = spawn(process.execPath, [localForum.serverPath], { cwd: root,
    env: { ...process.env, ...localForum.environment, CC98_LOCAL_PORT: '44345', CC98_LOCAL_NATIVE_FRONTEND: '1', CC98_LOCAL_REQUIRE_AUTH: '0',
      CC98_LOCAL_DATA_PATH: path.join(runtime, 'data.json'), CC98_LOCAL_UPLOAD_ROOT: path.join(runtime, 'uploads'), CC98_LOCAL_BACKUP_ROOT: path.join(runtime, 'backups') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '', context, page, checks = 0, holdFrameDocument = false, heldImage = false, releaseHeldImage;
  const errors = [], requests = [], rejected = [];
  server.stdout.on('data', b => { logs += b; }); server.stderr.on('data', b => { logs += b; });
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(local + '/__test/health')).ok) break; } catch {}
      if (i === 99) throw new Error(logs);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    for (let i = 4; i <= 14; i++) assert((await fetch(local + '/topic/6500000/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: `侧窗第 ${i} 楼 [ac01]`, contentType: 0 }) })).ok);
    for (let i = 1; i <= (parallelOnly ? 65 : focusOnly ? 18 : 9); i++) assert((await fetch(local + '/board/81/topic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `侧窗浏览示例话题 ${i}：主页面继续保留`, content: '本地侧窗测试内容', contentType: 0 }) })).ok);
    context = await chromium.launchPersistentContext('', { executablePath: await executable(), headless: true,
      ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`], viewport: { width: 1440, height: 1000 }, deviceScaleFactor: watermarkOnly ? 2 : 1 });
    await context.setOffline(true);
    // Run the unchanged native React frontend and real extension against an
    // isolated backend. No request is sent to the production forum/account.
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin === 'https://outside.example') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated external destination</title><h1>External link destination</h1>' });
      if (url.origin !== origin) { rejected.push(url.href); return route.abort(); }
      if (url.pathname === '/drawer-download.txt') return route.fulfill({ contentType: 'application/octet-stream', headers: { 'Content-Disposition': 'attachment; filename="drawer-download.txt"' }, body: 'drawer download regression' });
      if (url.pathname === '/drawer-hold.png') {
        heldImage = true;
        await new Promise(resolve => { releaseHeldImage = resolve; });
        return route.abort().catch(() => {});
      }
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
        if (holdFrameDocument && frame === 'child' && request.isNavigationRequest() && /text\/html/.test(type)) {
          holdFrameDocument = false;
          body = Buffer.from(body.toString('utf8').replace(/(<body[^>]*>)/i, '$1<img src="/drawer-hold.png" alt="">'));
        }
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
    if (watermarkOnly) { await testWatermark({ page, worker, errors }); return; }
    if (compactTopbarOnly) { await testCompactTopbar({ page, worker, errors }); return; }
    if (collapseOnly) { await testCollapseControl({ page, worker, context, errors }); return; }
    if (parallelOnly) { await testParallelDrawer({ page, worker, context, requests, errors }); return; }
    if (focusOnly) { await testFocusDrawer({ page, worker, context, requests, errors }); return; }
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
    const addNavigationLink = async (href, text = '导航测试', extra = {}, stable = false) => {
      await child.evaluate(({ href, text, extra, stable }) => {
        document.querySelector('#drawer-navigation-test')?.remove();
        const link = document.createElement('a'); link.id = 'drawer-navigation-test'; link.href = href; link.textContent = text;
        Object.entries(extra).forEach(([key, value]) => link.setAttribute(key, value));
        if (stable) {
          // Startup may replace the app before Playwright has clicked a freshly
          // injected test link. This isolated fixture exercises the same
          // document-level router without depending on a transient app node.
          link.style.cssText = 'position:fixed;top:4px;right:4px;z-index:2147483647;background:#fff;color:#000;padding:12px';
          document.body.append(link);
        } else (document.querySelector('.cc98-rebuild-post-body') || document.querySelector('#cc98-comfort-app')).append(link);
      }, { href, text, extra, stable });
      return child.locator('#drawer-navigation-test');
    };
    // A real body quote must override the normal new-tab preference, both
    // across pages and within the already mounted document.
    let nav = await addNavigationLink(origin + '/topic/6500000/1#2', '查看本帖第 2 楼');
    await nav.click(); await child.waitForURL('**/topic/6500000/1#2'); await child.locator('[data-post-floor="2"]').waitFor();
    assert.equal(page.url(), baseline.url); assert.equal(context.pages().length, 2); checks += 2;
    await child.evaluate(() => { window.__drawerNavigationApp = document.querySelector('#cc98-comfort-app'); });
    nav = await addNavigationLink(origin + '/topic/6500000/1#3', '查看本帖第 3 楼');
    await nav.click(); await child.waitForURL('**/topic/6500000/1#3');
    assert(await child.evaluate(() => window.__drawerNavigationApp === document.querySelector('#cc98-comfort-app'))); checks++;
    const childNavigationUrl = child.url();
    const normalDestinations = [origin + '/topic/6500001/1', origin + '/user/id/795406', origin + '/board/81', 'https://outside.example/thread-link'];
    for (const href of normalDestinations) {
      nav = await addNavigationLink(href);
      const popupPromise = context.waitForEvent('page'); await nav.click(); const popup = await popupPromise;
      await popup.waitForURL(href); assert.equal(page.url(), baseline.url); assert.equal(child.url(), childNavigationUrl);
      assert.equal(await page.locator('.cc98-topic-drawer-frame').count(), 1); await popup.close(); checks += 3;
    }
    // A page script's forged cross-origin navigation message cannot gain the
    // frame's parent-navigation authority without a real matching link click.
    await child.evaluate(() => {
      const token = window.name.split(':').pop();
      for (const href of ['https://outside.example/forged', 'javascript:alert(1)', 'data:text/html,forged']) {
        parent.postMessage({ channel: 'CC98_REBORN_TOPIC_DRAWER', token, type: 'navigate', fromHref: location.href, href }, location.origin);
      }
    });
    await page.waitForTimeout(150); assert.equal(context.pages().length, 2); assert.equal(page.url(), baseline.url); checks += 2;
    // Modified and middle clicks retain the browser's normal native behavior.
    for (const clickOptions of [{ modifiers: ['Control'] }, { button: 'middle' }]) {
      nav = await addNavigationLink(origin + '/board/81');
      const popupPromise = context.waitForEvent('page'); await nav.click(clickOptions); const popup = await popupPromise;
      await popup.waitForURL(origin + '/board/81'); assert.equal(child.url(), childNavigationUrl); await popup.close(); checks++;
    }
    nav = await addNavigationLink(origin + '/drawer-download.txt', '下载测试', { download: 'drawer-download.txt' });
    const downloadPromise = page.waitForEvent('download'); await nav.click(); const downloaded = await downloadPromise;
    assert.equal(downloaded.suggestedFilename(), 'drawer-download.txt'); assert.equal(child.url(), childNavigationUrl); checks += 2;
    console.log('drawer navigation new-tab, quote floors, downloads and forged messages passed');
    await child.locator('#drawer-navigation-test').evaluate(link => link.remove());
    await child.evaluate(() => scrollTo(0, 0));
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
    const modifiedPopupPromise = context.waitForEvent('page');
    await page.locator('a.cc98-rebuild-card-title').first().evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })));
    const modifiedPopup = await modifiedPopupPromise; await modifiedPopup.close();
    assert.equal(await page.locator('.cc98-topic-drawer-layer').count(), 0); checks++;
    // Current-page preference exits the frame and navigates the real top-level
    // browser page, including explicitly _blank and external HTTP(S) anchors.
    await worker.evaluate(async () => {
      const { cc98ComfortSettings } = await chrome.storage.local.get('cc98ComfortSettings');
      await chrome.storage.local.set({ cc98ComfortSettings: { ...cc98ComfortSettings, openLinksInNewTab: false } });
    });
    await page.goto(origin + '/newTopics');
    await page.locator('a.cc98-rebuild-card-title[href*="/topic/6500000"]').first().click(); child = await drawerFrame();
    await child.locator('.cc98-rebuild-post-actions a[href*="/editor/edit/"]').first().click();
    await child.waitForURL('**/editor/edit/**'); await child.locator('.cc98-rebuild-native-editor').first().waitFor();
    assert.equal(page.url(), origin + '/newTopics'); assert.equal(context.pages().length, 2); checks += 2;
    nav = await addNavigationLink(origin + '/topic/6500000/1', '返回本帖');
    await nav.click(); await child.waitForURL('**/topic/6500000/1'); await child.locator('[data-post-floor="1"]').waitFor();
    assert.equal(page.url(), origin + '/newTopics'); checks++;
    await page.getByRole('button', { name: '关闭帖子侧窗', exact: true }).click();
    console.log('drawer edit action and return stay inside');
    for (const href of normalDestinations) {
      await page.goto(origin + '/newTopics');
      if (href === normalDestinations[0]) holdFrameDocument = true;
      await page.locator('a.cc98-rebuild-card-title[href*="/topic/6500000"]').first().click(); child = await drawerFrame();
      await child.locator('.cc98-rebuild-post-body').first().waitFor();
      if (href === normalDestinations[0]) {
        assert(heldImage); assert.notEqual(await child.evaluate(() => document.readyState), 'complete'); checks += 2;
        await page.screenshot({ path: path.join(output, 'ready-before-load-drawer.png') });
      }
      nav = await addNavigationLink(href, '离开当前帖子', { target: '_blank' }, true);
      if (href === normalDestinations[0]) {
        // A UI update may replace the clicked card before postMessage arrives.
        // Keep the actual trusted-click destination, not a detached DOM owner.
        await child.evaluate(() => window.addEventListener('click', event => {
          event.target.closest?.('#drawer-navigation-test')?.remove();
        }, { capture: true, once: true }));
      }
      const parentNavigation = page.waitForURL(href, { waitUntil: 'commit' });
      await Promise.all([parentNavigation, nav.click({ noWaitAfter: true })]);
      releaseHeldImage?.();
      assert(child.isDetached()); assert.equal(context.pages().length, 2); checks += 2;
    }
    console.log('drawer navigation current-page preference passed');
    assert.deepEqual(errors, []);
    const result = { passed: true, checks, actualMV3: true, drawerExternalAndInternalNavigationFollowsGlobalPreference: true,
      sameTopicQuoteFloorNavigationStaysInside: true, modifiedAndMiddleClicksNative: true, downloadsNative: true, forgedNavigationMessagesRejected: true,
      readyBeforeLoadNavigationPassed: true, trustedNavigationSurvivesClickedDomRemoval: true, editAndReturnStayInside: true,
      screenshots: ['modern-drawer.png', 'ascii-drawer.png', 'narrow-drawer.png', 'ready-before-load-drawer.png'].map(file => path.join(output, file)), changedFiles: ['src/topic-drawer.js', 'tests/topic-drawer.test.cjs'],
      drawerOptionalDefaultEnabledAndTeardown: true, disabledDrawerUsesNormalLinkPreferenceAfterReload: true, drawerQuestionConsentCountsToggleAndPagination: true, drawerQuestionAsciiPassed: true, nativePagination: true, nativeReplyPersisted: true, parentPreserved: true, hiddenProbeUnchanged: true, errors, requests: requests.length, rejected: [...new Set(rejected)] };
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
