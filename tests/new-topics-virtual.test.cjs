const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://www.cc98.org';
const output = path.join(root, 'outputs/new-topics-virtual-preview');
const FEED = '#cc98-comfort-app [data-cc98-virtual="true"]';
const CARD_LIMIT = 150;
const interactionsOnly = process.argv.includes('--interactions-only');
const lifecycleOnly = process.argv.includes('--lifecycle-only');
const lastRowOnly = process.argv.includes('--last-row-only');
const framesOnly = process.argv.includes('--frames-only') || lastRowOnly;
const initialCount = framesOnly ? 80 : 520;
const framesOutput = path.join(root, 'outputs/new-topics-scroll-stability');

function fixtureBoot(count) {
  const state = { count, mode: 'card', revision: 0, refreshClicks: 0, modeClicks: [] };
  let list = document.getElementById('native-topic-list');
  const title = index => (index === 0 ? 'BlockedProbe ' : '') + 'Synthetic topic ' + String(index).padStart(4, '0') + (index % 4 === 0 ? '：合成校园讨论，较长的标题用于检查换行与高度估计。'.repeat(2) : '：合成讨论') + (index === 0 ? ' r' + state.revision : '');
  const topic = index => {
    const card = document.createElement('div');
    const classic = state.mode === 'classic';
    card.className = classic ? 'focus-topic' : 'card-topic';
    card.dataset.fixtureIndex = index;
    const main = document.createElement('a'); main.className = classic ? 'focus-topic-title' : 'card-topic-title'; main.href = '/topic/' + (7000000 + index) + '/1'; main.textContent = title(index);
    const user = document.createElement('a'); user.className = classic ? 'focus-topic-left' : 'card-topic-userName'; user.href = '/user/id/' + (10000 + index); user.textContent = 'SyntheticUser' + index;
    const board = document.createElement('a'); board.href = '/board/81'; board.textContent = '校园生活';
    if (classic) board.className = 'focus-topic-right';
    else { const wrap = document.createElement('div'); wrap.className = 'card-topic-boardName'; wrap.append(board); card.append(wrap); }
    const info = document.createElement('div'); info.className = classic ? 'focus-topic-info' : 'card-topic-info'; info.innerHTML = '<span>今天 08:20:11</span><span>32000</span><span>最后回复: <a href="/user/id/200">SyntheticReply</a></span>';
    card.append(user, main, info); if (classic) card.append(board);
    if (!classic) {
      const gallery = document.createElement('div'); gallery.className = 'card-topic-thumbnail';
      for (let slot = 0; slot < 2; slot++) { const image = document.createElement('img'); image.dataset.src = '/v2-upload/thumbnail/t/virtual-' + index + '-' + slot + '.jpg'; image.alt = 'Synthetic media ' + index + '-' + slot; gallery.append(image); }
      card.append(gallery);
    }
    return card;
  };
  function render(appendFrom = 0) {
    list.className = state.mode === 'classic' ? 'focus-topic-topicArea' : 'card-topic-area-middle';
    if (!appendFrom) list.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (let index = appendFrom; index < state.count; index++) if (state.mode !== 'media' || index % 2 === 0) fragment.append(topic(index));
    list.append(fragment);
  }
  for (const mode of ['classic', 'card', 'media']) {
    const id = mode === 'media' ? 'new-topic-media-only-button' : 'new-topic-' + mode + '-button';
    document.getElementById(id).onclick = () => {
      state.mode = mode; state.modeClicks.push(mode);
      for (const button of document.querySelectorAll('[data-native-mode]')) button.classList.toggle('focus-hover', button.dataset.nativeMode === mode);
      render();
    };
  }
  document.getElementById('new-topic-refresh-button').onclick = () => { state.refreshClicks++; state.revision++; render(); };
  window.__newTopicsFixture = {
    state,
    append(amount) { const previous = state.count; state.count += amount; render(previous); },
    replaceContainer() { const next = document.createElement('div'); next.id = list.id; list.replaceWith(next); list = next; render(); },
    loading() { list.replaceChildren(); const node = document.createElement('div'); node.className = 'fixture-loading ant-spin-spinning'; node.textContent = '加载中'; list.append(node); },
    finishEmpty() { state.count = 0; list.replaceChildren(); const node = document.createElement('div'); node.className = 'noResultText'; node.textContent = '暂无帖子'; list.append(node); },
    render
  };
  render();
}

function listFixture(count = initialCount) {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成新帖 - CC98论坛</title></head><body><div id="root"><header class="topBar"><a class="topBarCC98" href="/">CC98</a><div class="topBarRight"><a class="topBarUserName" href="/user/id/795406">LocalTester</a></div></header><div class="focus-topic"><div class="focus-topic-head"><button id="new-topic-classic-button" data-native-mode="classic">经典模式</button><button id="new-topic-card-button" data-native-mode="card" class="focus-hover">卡片模式</button><button id="new-topic-media-only-button" data-native-mode="media">只看媒体</button><button id="new-topic-refresh-button">刷新</button></div></div><div id="native-topic-list"></div><button id="focus-topic-getMore">更多</button></div><script>(' + fixtureBoot.toString() + ')(' + count + ');</script></body></html>';
}

function postFixture() {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成侧窗帖子 - CC98论坛</title></head><body><div id="root"><header class="topBar"><a href="/">CC98</a><div class="topBarRight"><a class="topBarUserName" href="/user/id/795406">LocalTester</a></div></header><section class="topicInfo-info"><h1 id="essay1">合成侧窗帖子</h1><a href="/board/81">校园生活</a></section><div class="reply" id="reply70000001" data-floor="1"><a href="/user/id/10000">SyntheticUser</a><span class="reply-floor">1</span><div class="reply-content"><div class="substance"><article><p>这是用于侧窗回归的合成内容。</p></article></div></div><div class="comment1">发表于 2026-10-17 08:20:11</div></div><div class="pagination"><ul class="page-nav"><li><a href="?page=1">1</a></li></ul></div><div id="sendTopicInfo" class="sendTopicInfo"><div class="ubb-editor"><textarea>合成草稿</textarea></div></div></div></body></html>';
}

async function executable() {
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  for (const name of (await fs.readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) {
    const file = path.join(cache, name, 'chrome-win64/chrome.exe');
    try { await fs.access(file); return file; } catch (_) {}
  }
  throw new Error('Full Chromium is required for the MV3 list regression.');
}

async function main() {
  const report = { passed: false, mode: lifecycleOnly ? 'lifecycle-only' : interactionsOnly ? 'interactions-only' : 'full', realMV3: true, syntheticOnly: true, checks: [], domComparison: {}, append: {}, scrollSamples: [], anchor: {}, cleanup: [], lifecycle: [], errors: [], requests: [], screenshots: [] };
  const context = await chromium.launchPersistentContext('', { executablePath: await executable(), headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except=' + root, '--load-extension=' + root], viewport: { width: 1440, height: 1000 } });
  let page;
  try {
    await fs.mkdir(output, { recursive: true });
    await context.setOffline(true);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin !== origin) return route.abort();
      report.requests.push({ path: url.pathname, type: request.resourceType() });
      if (/\.(?:jpe?g|png|gif|svg)(?:$|\?)/i.test(url.pathname)) {
        return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#72b8aa"/><path d="M0 400L160 200L320 350L480 120L640 320V480H0Z" fill="#326b9b"/></svg>' });
      }
      return route.fulfill({ contentType: 'text/html', body: /^\/topic\//.test(url.pathname) ? postFixture() : listFixture() });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ cc98ComfortSettings: { enabled: true, rebuildUi: true, themeStyle: 'modern', themeMode: 'light', homeHotOnly: true, topicDrawerEnabled: true, prewarmPostImages: false, previsitFirstPageForTopicImages: false, semanticFilterEnabled: false, blockedTitleKeywords: '', blockedContentRules: '[]', replyRebornTail: false, openLinksInNewTab: false }, 'cc98RebornOpenIdBinding:v1': { bound: true, userId: 795406, userName: 'LocalTester', boundAt: 42 } });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
      getOpenIdBinding = async () => ({ ok: true, binding: { bound: true, userId: 795406, userName: 'LocalTester' } });
    });
    page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/newTopics', { waitUntil: 'domcontentloaded' });
    await page.locator(FEED).waitFor();
    const isolated = (action, value = null) => worker.evaluate(async ({ action, value }) => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [action, value], func: (action, value) => {
        const api = globalThis.CC98RebornNewTopicsVirtual;
        if (action === 'status') return api.status();
        if (action === 'reset') { globalThis.__virtualRenderCalls = 0; return; }
        if (action === 'calls') return globalThis.__virtualRenderCalls || 0;
        if (action === 'rebuild') { scheduleRebuild(); return; }
        if (action === 'same-update') { const feed = document.querySelector('[data-cc98-virtual="true"]'); api.update(feed, getTopicItems()); return; }
        if (action === 'install') {
          globalThis.__virtualRenderCalls = 0;
          const original = renderTopicCard;
          renderTopicCard = function (...args) { globalThis.__virtualRenderCalls++; return original(...args); };
          globalThis.__virtualTracked = new Set();
          for (const target of [window, document]) {
            const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
            const records = new Map();
            target.addEventListener = (type, listener, options) => {
              if (['scroll', 'resize', 'selectionchange', 'focusout'].includes(type) && options?.signal && !options.signal.aborted) {
                const entry = { target: target === window ? 'window' : 'document', type, listener };
                records.set(listener, entry); __virtualTracked.add(entry);
                options.signal.addEventListener('abort', () => { __virtualTracked.delete(entry); records.delete(listener); }, { once: true });
              }
              return add(type, listener, options);
            };
            target.removeEventListener = (type, listener, options) => {
              const entry = records.get(listener); if (entry) { __virtualTracked.delete(entry); records.delete(listener); }
              return remove(type, listener, options);
            };
          }
          return;
        }
        if (action === 'listeners') return [...(globalThis.__virtualTracked || [])].map(entry => ({ target: entry.target, type: entry.type }));
        if (action === 'saved') return readReadLaterItems().length;
        throw new Error('Unknown virtual-list probe: ' + action);
      } }))[0].result;
    }, { action, value });
    const status = () => isolated('status');
    const patch = async patch => {
      await worker.evaluate(async patch => { const { cc98ComfortSettings: current } = await chrome.storage.local.get('cc98ComfortSettings'); await chrome.storage.local.set({ cc98ComfortSettings: { ...current, ...patch } }); }, patch);
      await page.waitForTimeout(200);
    };
    const waitStatus = async (predicate, label) => {
      for (let attempt = 0; attempt < 100; attempt++) { const result = await status(); if (predicate(result)) return result; await page.waitForTimeout(60); }
      throw new Error('Timed out: ' + label + ' ' + JSON.stringify(await status()));
    };
    const settle = async () => { await page.waitForTimeout(160); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
    const stats = async label => ({ label, ...await status(), ...await page.locator(FEED).evaluate(feed => ({ cards: feed.querySelectorAll(':scope > .cc98-rebuild-card').length, images: feed.querySelectorAll('img').length, totalHeight: feed.getBoundingClientRect().height, scrollY, nativeCards: document.querySelectorAll('#native-topic-list > .focus-topic, #native-topic-list > .card-topic').length })) });
    const bounded = async label => {
      const result = await stats(label);
      assert(result.active && !result.full, JSON.stringify(result));
      assert(result.cards > 0 && result.cards <= CARD_LIMIT, 'mounted plugin cards are bounded: ' + JSON.stringify(result));
      assert(result.images <= result.cards * 6, 'mounted plugin images are bounded independently of retained native source DOM');
      return result;
    };
    const visibleAnchor = () => page.locator(FEED).evaluate(feed => {
      const toolbarBottom = document.querySelector('.cc98-rebuild-topbar')?.getBoundingClientRect().bottom || 0;
      const card = [...feed.querySelectorAll(':scope > .cc98-rebuild-card')].find(card => { const box = card.getBoundingClientRect(); return box.top >= toolbarBottom && box.bottom > toolbarBottom + 20; });
      if (!card) return null;
      const box = card.getBoundingClientRect(); return { href: card.querySelector('a.cc98-rebuild-card-title')?.getAttribute('href'), y: box.top, relativeY: box.top - toolbarBottom, height: box.height };
    });
    const anchorPosition = href => page.locator(FEED).evaluate((feed, href) => { const link = [...feed.querySelectorAll('a.cc98-rebuild-card-title')].find(link => link.getAttribute('href') === href); const box = link?.closest('.cc98-rebuild-card').getBoundingClientRect(); const toolbarBottom = document.querySelector('.cc98-rebuild-topbar')?.getBoundingClientRect().bottom || 0; return box ? { y: box.top, relativeY: box.top - toolbarBottom, height: box.height } : null; }, href);
    await page.waitForFunction(() => __newTopicsFixture.state.refreshClicks > 0);
    await page.waitForTimeout(1900);
    await waitStatus(value => value.total === initialCount && value.mounted > 0, 'initial topics');
    await isolated('install');
    if (framesOnly) {
      await fs.mkdir(framesOutput, { recursive: true });
      report.mode = 'frames-only'; report.framePhases = [];
      await page.locator(FEED).evaluate(feed => scrollTo(0, feed.getBoundingClientRect().top + scrollY + feed.getBoundingClientRect().height * .45)); await settle();
      const beginFrames = label => page.evaluate(label => {
        const ids = new WeakMap(); let serial = 0;
        const identity = node => { if (!node) return 0; if (!ids.has(node)) ids.set(node, ++serial); return ids.get(node); };
        const probe = window.__virtualFrameProbe = { label, naturalHover: /pointer over cards|last row hover/.test(label), frames: [], mutations: [], stop: false };
        let previousFeed = document.querySelector('[data-cc98-virtual="true"]'); identity(previousFeed);
        const observer = new MutationObserver(() => {
          const current = document.querySelector('[data-cc98-virtual="true"]');
          if (current !== previousFeed) { probe.mutations.push({ t: performance.now(), before: identity(previousFeed), after: identity(current) }); previousFeed = current; }
        }); observer.observe(document.documentElement, { childList: true, subtree: true });
        probe.observer = observer;
        const sample = t => {
          const feed = document.querySelector('[data-cc98-virtual="true"]');
          const inset = Math.max(0, document.querySelector('.cc98-rebuild-topbar')?.getBoundingClientRect().bottom || 0);
          const cards = feed ? [...feed.querySelectorAll(':scope > .cc98-rebuild-card')] : [];
          let expansionOffset = 0;
          const rows = cards.map(node => { const box = node.getBoundingClientRect(), meta = node.querySelector('.cc98-rebuild-hover-meta');
            const row = { key: node.dataset.itemKey, id: identity(node), top: box.top, bottom: box.bottom, expansionOffset };
            if (meta) expansionOffset += meta.getBoundingClientRect().height + (parseFloat(getComputedStyle(meta).marginTop) || 0);
            return row; }).filter(row => row.bottom > inset && row.top < innerHeight);
          const box = feed?.getBoundingClientRect();
          const readable = box ? Math.max(0, Math.min(innerHeight, box.bottom) - Math.max(inset, box.top)) : 0;
          const gaps = []; let bottom = Math.max(inset, box?.top || 0);
          for (const row of [...rows].sort((a, b) => a.top - b.top)) { gaps.push(Math.max(0, row.top - bottom)); bottom = Math.max(bottom, row.bottom); }
          gaps.push(Math.max(0, Math.min(innerHeight, box?.bottom || 0) - bottom));
          probe.frames.push({ t, feed: identity(feed), y: scrollY, cards: cards.length, images: feed?.querySelectorAll('img').length || 0, readable, gap: Math.max(0, ...gaps), rows });
          if (!probe.stop) requestAnimationFrame(sample);
        }; requestAnimationFrame(sample);
      }, label);
      const endFrames = async () => {
        await page.waitForTimeout(550);
        const phase = await page.evaluate(() => { const probe = __virtualFrameProbe; probe.stop = true; probe.observer.disconnect(); return { label: probe.label, naturalHover: probe.naturalHover, frames: probe.frames, mutations: probe.mutations }; });
        const identityChanges = [], reverseScroll = [], discontinuities = [], blank = [];
        for (let i = 0; i < phase.frames.length; i++) {
          const frame = phase.frames[i], previous = phase.frames[i - 1];
          if (frame.readable > 100 && (!frame.rows.length || frame.gap > 100)) blank.push({ index: i, frame });
          if (!previous) continue;
          if (frame.y < previous.y - 3) reverseScroll.push({ index: i, before: previous.y, after: frame.y, delta: frame.y - previous.y });
          for (const row of frame.rows) { const old = previous.rows.find(value => value.key === row.key); if (!old) continue;
            if (old.id !== row.id) identityChanges.push({ index: i, key: row.key, before: old.id, after: row.id });
            const layoutDelta = row.top - old.top + frame.y - previous.y;
            const hoverDelta = phase.naturalHover ? row.expansionOffset - old.expansionOffset : 0;
            if (Math.abs(layoutDelta - hoverDelta) > 3) discontinuities.push({ index: i, key: row.key, screenDelta: row.top - old.top, scrollDelta: frame.y - previous.y, layoutDelta, hoverDelta });
          }
        }
        phase.metrics = { frames: phase.frames.length, feedRemounts: phase.mutations.length, blankFrames: blank.length, visibleNodeReplacements: identityChanges.length, reverseScrollFrames: reverseScroll.length, maxReverseScroll: Math.min(0, ...reverseScroll.map(value => value.delta)), layoutDiscontinuities: discontinuities.length, maxMounted: Math.max(...phase.frames.map(value => value.cards)), maxImages: Math.max(...phase.frames.map(value => value.images)), maxRafGapMs: Math.max(0, ...phase.frames.slice(1).map((value, index) => value.t - phase.frames[index].t)) };
        phase.evidence = { blank, identityChanges, reverseScroll, discontinuities };
        report.framePhases.push(phase); console.log('frame probe: ' + phase.label + ' ' + JSON.stringify(phase.metrics));
      };
      if (!lastRowOnly) {
      await beginFrames('same-data update followed by continuous downward wheel');
      await isolated('same-update');
      for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 180); await page.waitForTimeout(30); }
      await endFrames();
      await beginFrames('stationary batched append below the old 180-item signature cap');
      await page.evaluate(() => { for (let i = 0; i < 3; i++) setTimeout(() => __newTopicsFixture.append(8), i * 230); });
      await page.waitForTimeout(1100); await endFrames();
      await beginFrames('continuous wheel during slow batched append crossing 180 items');
      await page.evaluate(() => { for (let i = 0; i < 8; i++) setTimeout(() => __newTopicsFixture.append(16), i * 180); });
      for (let i = 0; i < 36; i++) { await page.mouse.wheel(0, 140); await page.waitForTimeout(35); }
      await endFrames();
      await waitStatus(value => value.total === 232, 'frame-probe appended model');
      await page.locator(FEED).evaluate(feed => scrollTo(0, feed.getBoundingClientRect().top + scrollY + feed.getBoundingClientRect().height * .9)); await settle();
      const hoverPoint = await page.locator(FEED).evaluate(feed => ({ x: feed.getBoundingClientRect().left + Math.min(240, feed.getBoundingClientRect().width / 2), y: 400 }));
      await page.mouse.move(hoverPoint.x, hoverPoint.y); await page.waitForTimeout(240);
      await beginFrames('pointer over cards near the loaded tail during wheel and append');
      await page.evaluate(() => { for (let i = 0; i < 4; i++) setTimeout(() => __newTopicsFixture.append(16), i * 230); });
      for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, 140); await page.waitForTimeout(35); }
      await endFrames();
      await waitStatus(value => value.total === 296, 'near-tail appended model');
      await bounded('frame-probe final bounded DOM');
      const shot = path.join(framesOutput, 'scroll-stability-main.png'); await page.screenshot({ path: shot }); report.screenshots.push(shot);
      const hoverMeta = await page.locator(FEED + ' .cc98-rebuild-card:hover .cc98-rebuild-hover-meta').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, height: node.getBoundingClientRect().height, opacity: getComputedStyle(node).opacity, display: getComputedStyle(node).display })));
      assert(hoverMeta.some(value => value.text.trim() && value.height > 10 && Number(value.opacity) > .9 && value.display !== 'none'), 'card metadata remains visible on hover');
      report.hoverMeta = hoverMeta;
      await page.mouse.move(0, 0); await patch({ themeStyle: 'ascii', themeMode: 'dark' });
      await page.setViewportSize({ width: 390, height: 900 }); await settle();
      await beginFrames('ASCII dark narrow card view during wheel and batched append');
      await page.evaluate(() => { for (let i = 0; i < 2; i++) setTimeout(() => __newTopicsFixture.append(16), i * 230); });
      for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(35); }
      await endFrames(); await waitStatus(value => value.total === 328, 'ASCII frame model');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'narrow frame case does not overflow');
      const mobileShot = path.join(framesOutput, 'scroll-stability-ascii-mobile.png'); await page.screenshot({ path: mobileShot }); report.screenshots.push(mobileShot);
      }
      await page.mouse.move(0, 0); await patch({ themeStyle: 'modern', themeMode: 'light' }); await page.setViewportSize({ width: 1440, height: 1000 }); await settle();
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await settle();
      const last = await page.locator(FEED + ' > .cc98-rebuild-card').last().evaluate(card => { const box = card.getBoundingClientRect(); return { key: card.dataset.itemKey, x: box.left + Math.min(180, box.width / 2), y: box.top + 45, height: document.documentElement.scrollHeight, scroll: scrollY }; });
      assert(last.key.endsWith('/' + (7000000 + (lastRowOnly ? initialCount : 328) - 1) + '/1'), 'the actual last loaded model row is mounted at document end');
      await beginFrames('actual last row hover then mouse leave at document end');
      await page.mouse.move(last.x, last.y); await page.waitForTimeout(350);
      const hoveredEnd = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, scroll: scrollY }));
      await page.mouse.move(0, 0); await page.waitForTimeout(350); await endFrames();
      const leftEnd = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, scroll: scrollY }));
      report.lastRowHover = { before: last, hovered: hoveredEnd, after: leftEnd };
      assert(hoveredEnd.height > last.height, 'last-row hover naturally expands the card inside document flow');
      assert.equal(leftEnd.height, last.height, 'leaving the last row returns document height to its collapsed value');
      assert(Math.abs(leftEnd.scroll - last.scroll) <= 3, 'leaving the last hovered row restores the same reading position after the natural collapse');
      await fs.writeFile(path.join(framesOutput, lastRowOnly ? 'last-row-frame-evidence.json' : 'latest-frame-evidence.json'), JSON.stringify(report, null, 2));
      assert(report.framePhases.every(phase => phase.metrics.frames >= 20), 'probe captures continuous rendered frames');
      assert(report.framePhases.every(phase => phase.metrics.feedRemounts === 0), 'append does not replace the live feed');
      assert(report.framePhases.every(phase => phase.metrics.blankFrames === 0), 'no rendered frame exposes an empty virtual viewport');
      assert(report.framePhases.every(phase => phase.metrics.visibleNodeReplacements === 0), 'unchanged visible cards preserve DOM identity');
      assert(report.framePhases.every(phase => phase.naturalHover ? phase.metrics.maxReverseScroll >= -48 : phase.metrics.reverseScrollFrames === 0), 'wheel/append does not reverse reading position outside expected in-flow hover expansion/collapse (at most 40px details plus 8px margin)');
      assert(report.framePhases.every(phase => phase.metrics.layoutDiscontinuities === 0), 'visible card coordinates have no unexplained jumps after accounting for restored in-flow hover animation');
      assert(report.framePhases.every(phase => phase.metrics.maxMounted <= CARD_LIMIT && phase.metrics.maxImages <= phase.metrics.maxMounted * 6), 'plugin card/image DOM remains bounded throughout every rendered frame');
      assert.deepEqual(report.errors, []); report.passed = true;
      const baseline = JSON.parse(await fs.readFile(path.join(framesOutput, 'baseline-frame-evidence.json'), 'utf8'));
      report.beforeAfter = report.framePhases.map(phase => ({ label: phase.label, before: baseline.framePhases.find(value => value.label === phase.label)?.metrics || null, after: phase.metrics }));
      report.candidateRange = { syntheticNativeItems: [initialCount, lastRowOnly ? initialCount : 328], actualRafFrames: report.framePhases.reduce((sum, phase) => sum + phase.metrics.frames, 0), layouts: lastRowOnly ? ['Modern light card 1440x1000'] : ['Modern light card 1440x1000', 'ASCII dark card 390x900'], networkIsolated: true, hoverPreserved: true };
      await fs.writeFile(path.join(framesOutput, lastRowOnly ? 'last-row-validation.json' : 'scroll-stability-validation.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ passed: true, mode: report.mode, phases: report.framePhases.map(phase => ({ label: phase.label, ...phase.metrics })), output: framesOutput }));
      return;
    }
    const lifecycle = async () => {
      for (const full of [false, true]) {
        if ((await status()).full !== full) { await page.locator('[data-new-topics-virtual-toggle]').click(); await waitStatus(value => value.full === full, 'lifecycle display mode'); }
        await page.locator(FEED).evaluate(feed => scrollTo(0, feed.getBoundingClientRect().top + scrollY + feed.getBoundingClientRect().height * .4)); await settle();
        const before = await visibleAnchor(); assert(before?.href);
        await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
        await waitStatus(value => !value.active, 'persisted pagehide cleanup');
        assert.deepEqual(await isolated('listeners'), []);
        await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
        await waitStatus(value => value.active && value.total === 520 && value.full === full && value.mounted > 0, 'persisted pageshow restore'); await settle();
        const after = await anchorPosition(before.href); assert(after, 'BFCache return restores the same reading card');
        assert(Math.abs(after.relativeY - before.relativeY) <= 8, 'BFCache return preserves the reading anchor');
        const listeners = await isolated('listeners');
        await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await settle();
        assert.equal((await isolated('listeners')).length, listeners.length, 'repeat pageshow does not duplicate listeners');
        report.lifecycle.push({ full, before, after, listeners: listeners.length, status: await status() });
      }
      await patch({ enabled: false });
      await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); }); await settle();
      assert.equal((await status()).active, false, 'disabled extension stays inactive on BFCache return');
      await patch({ enabled: true }); await waitStatus(value => value.active && value.mounted > 0, 'enable after BFCache');
      report.checks.push('persisted pagehide/pageshow cleans and restores model, full mode and same-key reading anchor without duplicate listeners; disabled stays inactive');
      console.log('virtual list: persisted page lifecycle passed');
    };
    if (lifecycleOnly) {
      await lifecycle(); assert.deepEqual(report.errors, []); report.passed = true;
      await fs.writeFile(path.join(output, 'lifecycle-validation.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ passed: true, mode: report.mode, checks: report.checks.length, output }));
      return;
    }
    report.domComparison.virtual = await bounded('initial card-mode virtual');
    assert.equal(report.domComparison.virtual.nativeCards, 520);
    assert(report.domComparison.virtual.images > 0);
    report.checks.push('520 native topics remain the source; mounted plugin card/image counts are bounded');

    await page.locator('[data-new-topics-virtual-toggle]').click();
    await waitStatus(value => value.full && value.mounted === 520, 'show all');
    report.domComparison.full = await stats('same 520 topics, full display');
    assert.equal(report.domComparison.full.cards, 520);
    assert.equal(report.domComparison.full.images, 1040);
    await isolated('reset');
    await page.evaluate(() => __newTopicsFixture.append(12));
    await waitStatus(value => value.total === 532 && value.mounted === 532, 'append in full mode');
    report.append.full = { added: 12, renders: await isolated('calls'), ...await stats('full append') };
    await page.locator('[data-new-topics-virtual-toggle]').click();
    await waitStatus(value => !value.full && value.mounted < CARD_LIMIT, 'resume virtual');
    await page.evaluate(() => { window.__appendFirstCard = document.querySelector('[data-cc98-virtual="true"] > .cc98-rebuild-card'); });
    await isolated('reset');
    await page.evaluate(() => __newTopicsFixture.append(12));
    await waitStatus(value => value.total === 544, 'append beyond old 180-node signature cap');
    report.append.virtual = { added: 12, renders: await isolated('calls'), ...await bounded('virtual append') };
    assert(report.append.virtual.renders < 150, 'appending offscreen topics must not render the full model');
    assert(await page.evaluate(() => __appendFirstCard === document.querySelector('[data-cc98-virtual="true"] > .cc98-rebuild-card')), 'append keeps existing visible cards mounted');
    report.checks.push('show all/resume work; >180-item appends update the model without rendering every plugin card');
    console.log('virtual list: full/virtual DOM and append comparison passed');

    if (!interactionsOnly) {
    for (const fraction of [0.2, 0.5, 0.85, 1, 0]) {
      const started = performance.now();
      await page.locator(FEED).evaluate((feed, fraction) => { const rect = feed.getBoundingClientRect(); scrollTo(0, rect.top + scrollY + fraction * Math.max(0, rect.height - innerHeight)); }, fraction);
      await settle();
      report.scrollSamples.push({ fraction, elapsedMs: performance.now() - started, ...await bounded('scroll ' + fraction) });
    }
    assert(await page.locator(FEED + ' a.cc98-rebuild-card-title[href="' + origin + '/topic/7000000/1"], ' + FEED + ' a.cc98-rebuild-card-title[href="/topic/7000000/1"]').count(), 'returning to top restores the first topic');
    report.checks.push('scrolling hundreds of topics stays bounded and returning to top restores original items');

    await page.locator(FEED).evaluate(feed => { const box = feed.getBoundingClientRect(); scrollTo(0, box.top + scrollY + box.height * .45); });
    await settle();
    let anchor = await visibleAnchor(); assert(anchor?.href, 'a visible anchor exists');
    const late = await page.locator(FEED).evaluate((feed, href) => {
      const anchor = [...feed.querySelectorAll(':scope > .cc98-rebuild-card')].find(card => card.querySelector('a.cc98-rebuild-card-title')?.getAttribute('href') === href);
      const above = [...feed.querySelectorAll(':scope > .cc98-rebuild-card')].find(card => card.getBoundingClientRect().bottom < anchor.getBoundingClientRect().top - 10 && card.querySelector('img'));
      if (!above) return null;
      const before = above.getBoundingClientRect().height, image = above.querySelector('img');
      const frame = image.closest('.cc98-rebuild-image-frame') || image;
      frame.style.setProperty('height', '560px', 'important'); frame.style.setProperty('max-height', 'none', 'important'); frame.style.setProperty('aspect-ratio', 'auto', 'important');
      image.dispatchEvent(new Event('load', { bubbles: false }));
      return { before, after: above.getBoundingClientRect().height };
    }, anchor.href);
    assert(late && late.after > late.before + 100, 'fixture simulates an image becoming substantially taller above the viewport');
    await settle();
    const imagePosition = await anchorPosition(anchor.href); assert(imagePosition, 'image-resize anchor remains mounted');
    report.anchor.image = { before: anchor, after: imagePosition, cardHeight: late, delta: imagePosition.y - anchor.y };
    assert(Math.abs(report.anchor.image.delta) <= 32, 'late image height does not shift the reading anchor: ' + JSON.stringify(report.anchor.image));
    anchor = await visibleAnchor();
    await page.setViewportSize({ width: 390, height: 900 }); await settle();
    const resized = await anchorPosition(anchor.href); assert(resized, 'resize keeps the reading anchor available');
    report.anchor.resize = { before: anchor, after: resized, delta: resized.relativeY - anchor.relativeY };
    assert(Math.abs(report.anchor.resize.delta) <= 64, 'viewport resize preserves the reading anchor: ' + JSON.stringify(report.anchor.resize));
    await bounded('narrow card mode');
    report.checks.push('late media height and viewport resize preserve a measured reading anchor');
    }

    await page.evaluate(() => scrollTo(0, 0)); await settle();
    await page.setViewportSize({ width: 390, height: 900 }); await settle();
    await patch({ themeStyle: 'ascii', themeMode: 'dark' }); await settle();
    await page.locator('[data-new-topic-mode="classic"]').click();
    await waitStatus(value => value.total === 544 && value.mounted > 0, 'classic mode'); await page.waitForTimeout(1900);
    assert.equal(await page.locator(FEED + ' img').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await bounded('ASCII dark classic mobile');
    const classicShot = path.join(output, 'ascii-classic-dark-mobile.png'); await page.screenshot({ path: classicShot }); report.screenshots.push(classicShot);
    await page.locator('[data-new-topic-mode="media"]').click();
    await waitStatus(value => value.total === 272, 'native media-only mode'); await page.waitForTimeout(1900);
    await bounded('media-only mode');
    await patch({ themeStyle: 'modern', themeMode: 'dark' }); await page.setViewportSize({ width: 1024, height: 900 }); await settle();
    const mediaShot = path.join(output, 'modern-media-dark.png'); await page.screenshot({ path: mediaShot }); report.screenshots.push(mediaShot);
    await page.locator('[data-new-topic-mode="card"]').click();
    await waitStatus(value => value.total === 544, 'restore card mode'); await page.waitForTimeout(1900);
    await patch({ themeMode: 'light' }); await page.setViewportSize({ width: 1440, height: 1000 }); await page.evaluate(() => scrollTo(0, 0)); await settle();
    report.checks.push('classic/card/media modes and decisive Modern/ASCII, dark/light, mobile/desktop layouts work');
    console.log('virtual list: layout modes passed');

    const nativeRefreshBefore = await page.evaluate(() => __newTopicsFixture.state.refreshClicks);
    await page.locator('.cc98-rebuild-new-topic-refresh').click();
    await page.waitForFunction(previous => __newTopicsFixture.state.refreshClicks === previous + 1, nativeRefreshBefore);
    await settle(); await bounded('native refresh');
    const savedButton = page.locator(FEED + ' .cc98-rebuild-read-later-button').first();
    await savedButton.click(); await page.locator(FEED + ' .cc98-rebuild-read-later-button.is-saved').first().waitFor();
    assert.equal(await isolated('saved'), 1);
    await page.locator(FEED).evaluate(feed => scrollTo(0, feed.getBoundingClientRect().top + scrollY + feed.getBoundingClientRect().height * .7)); await settle();
    await page.evaluate(() => scrollTo(0, 0)); await settle();
    await page.locator(FEED + ' .cc98-rebuild-read-later-button.is-saved').first().waitFor();
    await patch({ blockedTitleKeywords: 'BlockedProbe' });
    await page.locator(FEED + ' .cc98-rebuild-blocked').first().waitFor();
    await page.locator(FEED + ' .cc98-rebuild-blocked').first().getByRole('button', { name: '显示', exact: true }).click();
    await page.locator(FEED + ' a.cc98-rebuild-card-title').filter({ hasText: 'BlockedProbe' }).waitFor();
    await patch({ blockedTitleKeywords: '' }); await bounded('revealed filtered topic');
    report.checks.push('native refresh fires once; read-later survives remount; blacklist reveal preserves topic access');
    console.log('virtual list: refresh/read-later/filter passed');

    await page.evaluate(() => { const link = document.querySelector('[data-cc98-virtual="true"] a.cc98-rebuild-card-title'); window.__focusedVirtualLink = link; link.focus({ preventScroll: true }); scrollBy(0, 15000); });
    await settle();
    assert(await page.evaluate(() => __focusedVirtualLink.isConnected && document.activeElement === __focusedVirtualLink), 'focused card is not discarded');
    await bounded('focus pin');
    await page.evaluate(() => document.activeElement.blur()); await page.mouse.wheel(0, 30); await settle();
    await page.evaluate(() => { const link = [...document.querySelectorAll('[data-cc98-virtual="true"] a.cc98-rebuild-card-title')].find(link => link.getBoundingClientRect().top >= 0) || document.querySelector('[data-cc98-virtual="true"] a.cc98-rebuild-card-title'); window.__selectedVirtualLink = link; const range = document.createRange(); range.selectNodeContents(link); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); window.__virtualSelectionText = selection.toString(); scrollBy(0, 15000); });
    await settle();
    assert(await page.evaluate(() => __selectedVirtualLink.isConnected && getSelection().toString() === __virtualSelectionText), 'selected text survives range changes');
    await bounded('selection pin');
    await page.evaluate(() => getSelection().removeAllRanges()); await page.mouse.wheel(0, 30); await settle();
    report.checks.push('focused and selected cards remain connected without expanding the mounted window to the full model');
    console.log('virtual list: focus/selection protection passed');

    await page.evaluate(() => scrollTo(0, 0)); await settle();
    const drawerBefore = { status: await status(), scroll: await page.evaluate(() => scrollY) };
    await page.locator(FEED + ' a.cc98-rebuild-card-title').first().click();
    await page.locator('.cc98-topic-drawer-ready').waitFor({ timeout: 35000 });
    const drawerStatus = await status(); assert(!drawerStatus.paused, 'the left virtual list remains live while the non-modal drawer is open');
    await page.mouse.move(120, 650); await page.mouse.wheel(0, 2800); await settle();
    assert((await page.evaluate(() => scrollY)) > drawerBefore.scroll + 500, 'the visible left list must accept real wheel input');
    // Narrow cards are taller: advance beyond the real overscan window rather
    // than assuming a fixed wheel distance always crosses a row boundary.
    for (let step = 0; step < 5 && (await status()).start <= drawerStatus.start; step++) {
      await page.mouse.wheel(0, 1400); await settle();
    }
    assert((await status()).start > drawerStatus.start, 'the mounted window must advance while the drawer stays open');
    assert.equal(await page.locator('.cc98-topic-drawer-frame').count(), 1);
    const drawerAnchor = await page.locator(FEED).evaluate(feed => {
      const inset = Math.max(0, document.querySelector('.cc98-rebuild-topbar').getBoundingClientRect().bottom);
      return [...feed.querySelectorAll(':scope > .cc98-rebuild-card')].find(node => node.getBoundingClientRect().top >= inset && node.getBoundingClientRect().top < innerHeight)?.dataset.itemKey;
    });
    assert(drawerAnchor, 'capture a visible row before restoring normal width');
    await page.getByRole('button', { name: '关闭帖子侧窗', exact: true }).click();
    await settle();
    assert.equal(await page.locator('.cc98-topic-drawer-frame').count(), 0);
    assert(await page.locator(FEED).evaluate((feed, key) => {
      const node = [...feed.querySelectorAll(':scope > .cc98-rebuild-card')].find(node => node.dataset.itemKey === key);
      if (!node) return false;
      const rect = node.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight;
    }, drawerAnchor), 'restoring normal width must retain the visible reading row');
    await bounded('drawer closed');
    report.checks.push('non-modal side drawer keeps virtualization live, accepts left wheel input and releases its iframe without resetting the new reading position');
    console.log('virtual list: side drawer passed');

    await page.evaluate(() => document.activeElement.blur()); await settle();
    const lastMedia = page.locator(FEED + ' .cc98-rebuild-topic-media-image').last();
    const gallery = await lastMedia.evaluate(image => { const match = image.src.match(/virtual-(\d+)-(\d+)\.jpg/); return { src: image.src, next: location.origin + '/v2-upload/thumbnail/t/virtual-' + (Number(match[1]) + 1) + '-0.jpg' }; });
    await lastMedia.evaluate(image => image.click());
    await page.locator('#cc98-comfort-image-viewer').waitFor();
    const galleryStatus = await status(); assert(galleryStatus.paused);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(expected => document.querySelector('#cc98-comfort-image-viewer img')?.src === expected, gallery.next);
    assert.equal(await page.locator(FEED + ' img[src="' + gallery.next + '"]').count(), 0, 'viewer reaches a model image that is outside mounted cards');
    assert.deepEqual({ start: (await status()).start, end: (await status()).end }, { start: galleryStatus.start, end: galleryStatus.end });
    await page.keyboard.press('Escape'); await page.locator('#cc98-comfort-image-viewer').waitFor({ state: 'detached' }); await settle();
    report.checks.push('viewer is protected and its next-image navigation reaches the full loaded gallery outside mounted DOM');
    console.log('virtual list: full-gallery viewer passed');

    const shot = path.join(output, 'modern-card-light-desktop.png'); await page.evaluate(() => scrollTo(0, 0)); await settle(); await page.screenshot({ path: shot }); report.screenshots.push(shot);
    for (let cycle = 0; cycle < 3; cycle++) {
      await patch({ enabled: false });
      await waitStatus(value => !value.active, 'disable cleanup');
      assert.deepEqual(await isolated('listeners'), [], 'disabled list releases signal-owned global listeners');
      await patch({ enabled: true });
      await waitStatus(value => value.active && value.mounted > 0, 'enable remount');
      const before = await isolated('listeners');
      await isolated('rebuild'); await settle();
      const after = await isolated('listeners');
      assert.equal(after.length, before.length, 'rebuild does not duplicate virtual scroll/resize/selection listeners');
      assert.equal(await page.locator(FEED).count(), 1);
      report.cleanup.push({ cycle, listeners: after.length, status: await status() });
    }
    await page.evaluate(() => __newTopicsFixture.replaceContainer());
    await settle();
    await isolated('reset');
    await page.evaluate(() => __newTopicsFixture.append(12));
    await waitStatus(value => value.total === 556, 'append after native source container replacement');
    report.append.replacedSource = { added: 12, renders: await isolated('calls'), ...await bounded('replaced native source append') };
    assert(report.append.replacedSource.renders < CARD_LIMIT, 'native container replacement keeps append rendering bounded');
    report.checks.push('native source container replacement rebinds observers and subsequent >180-item appends stay visible');
    await page.evaluate(() => __newTopicsFixture.loading());
    await page.waitForTimeout(400);
    assert.equal((await status()).total, 556, 'temporary native loading preserves the current data model');
    await page.evaluate(() => __newTopicsFixture.finishEmpty());
    await waitStatus(value => value.total === 0, 'final native empty state clears retained records');
    assert.equal(await page.locator('#cc98-comfort-app .cc98-rebuild-card-title').count(), 0, 'final empty state releases old plugin cards');
    report.checks.push('temporary loading preserves content and an explicit final empty response clears it');
    await page.evaluate(() => { __newTopicsFixture.state.count = 20; __newTopicsFixture.render(); });
    await waitStatus(value => value.total === 20 && value.mounted > 0, 'new source data after empty refresh');
    await page.evaluate(() => {
      history.pushState({}, '', '/focus');
      // A real route renders new native content; a URL-only change correctly
      // leaves the previous shell pending under the stale-DOM route guard.
      __newTopicsFixture.state.mode = 'classic';
      __newTopicsFixture.state.revision++;
      __newTopicsFixture.replaceContainer();
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitStatus(value => !value.active, 'non-newTopics route');
    await page.locator(FEED).waitFor({ state: 'detached', timeout: 10000 });
    assert.equal(await page.locator(FEED).count(), 0, 'other topic lists remain unvirtualized');
    assert.deepEqual(await isolated('listeners'), []);
    report.checks.push('disable, repeated rebuild and route exit release observers/listeners without virtualizing other lists');
    assert.deepEqual(report.errors, []);
    assert(!report.requests.some(request => request.type !== 'image' && !['document', 'stylesheet', 'script'].includes(request.type)), 'virtual lifecycle does not issue extra API/list-data requests');
    report.passed = true;
    await fs.writeFile(path.join(output, interactionsOnly ? 'interactions-validation.json' : 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: true, checks: report.checks.length, virtual: report.domComparison.virtual.cards, full: report.domComparison.full.cards, appendRenders: report.append.virtual.renders, output }));
  } catch (error) {
    report.error = error.stack;
    const failureOutput = framesOnly ? framesOutput : output;
    if (page) { await page.screenshot({ path: path.join(failureOutput, 'failure.png'), fullPage: false }).catch(() => {}); await fs.writeFile(path.join(failureOutput, 'failure.html'), await page.content()).catch(() => {}); }
    await fs.writeFile(path.join(failureOutput, framesOnly ? 'scroll-stability-failure.json' : lifecycleOnly ? 'lifecycle-failure.json' : interactionsOnly ? 'interactions-failure.json' : 'validation-failure.json'), JSON.stringify(report, null, 2));
    throw error;
  } finally { await context.close(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { listFixture, postFixture, executable };
