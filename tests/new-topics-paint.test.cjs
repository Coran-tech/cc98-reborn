const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PNG } = require('pngjs');
const { chromium } = require('playwright');
const { listFixture, executable } = require('./new-topics-virtual.test.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/new-topics-paint-stability');
const origin = 'https://www.cc98.org';
const feedSelector = '#cc98-comfort-app [data-cc98-virtual="true"]';
const baseline = process.argv.includes('--baseline');
const extensionRoot = baseline ? path.join(root, 'dist/cc98-reborn-beta') : root;
const delayMs = 650;

function mixedFixture(count = 80) {
  const script = `(() => {
    function prepare() {
      for (const card of document.querySelectorAll('#native-topic-list [data-fixture-index]')) {
        const index = Number(card.dataset.fixtureIndex), gallery = card.querySelector('.card-topic-thumbnail');
        const count = [0, 1, 2, 0, 5, 0][index % 6];
        if (gallery) {
          while (gallery.children.length > count) gallery.lastElementChild.remove();
          while (gallery.children.length < count) { const image = document.createElement('img'); image.dataset.src = '/v2-upload/thumbnail/t/virtual-' + index + '-' + gallery.children.length + '.jpg'; image.alt = 'Mixed media'; gallery.append(image); }
          if (!count) gallery.remove();
        }
      }
    }
    const refresh = document.getElementById('new-topic-refresh-button'), oldRefresh = refresh.onclick;
    refresh.onclick = event => { oldRefresh(event); prepare(); };
    const append = __newTopicsFixture.append; __newTopicsFixture.append = amount => { append(amount); prepare(); };
    prepare();
  })();`;
  return listFixture(count).replace('</body>', '<script>' + script + '</script></body>');
}

function markerImage(upgraded = false) {
  const png = new PNG({ width: upgraded ? 512 : 256, height: upgraded ? 384 : 192 });
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4, magenta = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0;
    png.data.set(upgraded ? (magenta ? [35, 220, 85, 255] : [245, 205, 20, 255]) : (magenta ? [235, 30, 190, 255] : [20, 100, 240, 255]), i);
  }
  return PNG.sync.write(png);
}

function markerPixels(buffer, rect) {
  const png = PNG.sync.read(buffer);
  const left = Math.max(0, Math.ceil(rect.x + 4)), right = Math.min(png.width, Math.floor(rect.x + rect.width - 4));
  const top = Math.max(0, Math.ceil(rect.y + 4)), bottom = Math.min(png.height, Math.floor(rect.y + rect.height - 4));
  let colored = 0, upgraded = 0, total = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const i = (y * png.width + x) * 4, r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    if (r > 180 && g < 90 && b > 140 || b > 170 && r < 90 && g > 50 && g < 150) colored++;
    if (g > 170 && r < 120 && b < 170 || r > 180 && g > 140 && b < 90) upgraded++;
    total++;
  }
  return { colored, upgraded, total, oldRatio: total ? colored / total : 0, newRatio: total ? upgraded / total : 0, ratio: total ? (colored + upgraded) / total : 0 };
}

async function main() {
  const report = { passed: false, baseline, extensionRoot, realMV3: true, syntheticOnly: true, style: 'ASCII card', delayedDecodedPng: true, responseDelayMs: delayMs, routedNetwork: true, cachePolicyNote: 'Playwright request routing isolates external traffic and bypasses normal HTTP cache; unchanged media DOM must therefore remain mounted rather than relying on cache speed.', phases: [], captures: [], requests: [], errors: [] };
  await fs.mkdir(output, { recursive: true });
  const context = await chromium.launchPersistentContext('', { executablePath: await executable(), headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except=' + extensionRoot, '--load-extension=' + extensionRoot], viewport: { width: 1440, height: 1000 } });
  let page;
  try {
    const image = markerImage(), upgradedImage = markerImage(true);
    await context.setOffline(true);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin !== origin) return route.abort();
      if (request.resourceType() === 'image') {
        report.requests.push({ url: url.pathname + url.search, startedAt: Date.now() });
        await new Promise(resolve => setTimeout(resolve, url.searchParams.has('slow') ? 1800 : delayMs));
        if (url.searchParams.has('failed')) return route.fulfill({ status: 503, contentType: 'text/plain', body: 'Synthetic unavailable image' }).catch(() => {});
        return route.fulfill({ contentType: 'image/png', headers: { 'cache-control': 'public,max-age=86400' }, body: url.searchParams.has('progressive') ? upgradedImage : image }).catch(() => {});
      }
      return route.fulfill({ contentType: 'text/html', body: mixedFixture() });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    report.build = await worker.evaluate(async () => {
      await chrome.storage.local.set({ cc98ComfortSettings: { enabled: true, rebuildUi: true, themeStyle: 'ascii', themeMode: 'light', expandTopicCards: false, topicDrawerEnabled: true, prewarmPostImages: false, previsitFirstPageForTopicImages: false, semanticFilterEnabled: false, blockedTitleKeywords: '', blockedContentRules: '[]', openLinksInNewTab: false }, 'cc98RebornOpenIdBinding:v1': { bound: true, userId: 795406, userName: 'LocalTester', boundAt: 42 } });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
      getOpenIdBinding = async () => ({ ok: true, binding: { bound: true, userId: 795406, userName: 'LocalTester' } });
      const manifest = chrome.runtime.getManifest(); return { version: manifest.version, name: manifest.name, versionName: manifest.version_name };
    });
    page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/newTopics', { waitUntil: 'domcontentloaded' });
    await page.locator(feedSelector).waitFor();
    await page.waitForFunction(() => __newTopicsFixture.state.refreshClicks > 0); await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.__preparePaintInfo = () => document.querySelectorAll('#native-topic-list .card-topic-info').forEach(info => { info.innerHTML = '<span>32000</span><span>12</span><span>最后回复: <a href="/user/id/200">SyntheticReply</a></span><span>今天 08:20:11</span>'; });
      __preparePaintInfo();
    });
    await page.waitForTimeout(1100);
    await page.locator(feedSelector).evaluate(feed => scrollTo(0, feed.getBoundingClientRect().top + scrollY + 4400));
    await page.waitForTimeout(1200);
    const ready = () => page.waitForFunction(() => [...document.querySelectorAll('[data-cc98-virtual="true"] .cc98-rebuild-topic-media-image')].filter(image => { const r = image.getBoundingClientRect(); return r.bottom > 180 && r.top < innerHeight; }).every(image => image.complete && image.naturalWidth > 0));
    await ready();
    const target = await page.locator(feedSelector).evaluate(feed => {
      const inset = document.querySelector('.cc98-rebuild-topbar').getBoundingClientRect().bottom;
      const image = [...feed.querySelectorAll('.cc98-rebuild-topic-media-image')].find(image => { const box = image.getBoundingClientRect(); return box.top > inset + 10 && box.bottom < innerHeight - 10 && getComputedStyle(image).objectFit !== 'contain'; });
      if (!image) return null; const rect = image.getBoundingClientRect();
      return { key: image.closest('[data-item-key]').dataset.itemKey, index: Number(image.src.match(/virtual-(\d+)-/)[1]), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    });
    assert(target, 'a previously decoded image above the append location is fully visible'); report.target = target;
    const cdp = await context.newCDPSession(page);
    const beforeImage = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64');
    await fs.writeFile(path.join(output, baseline ? 'baseline-before.png' : 'candidate-before.png'), beforeImage);
    report.initialPixels = markerPixels(beforeImage, target.rect); assert(report.initialPixels.ratio > .85, 'real browser screenshot contains the decoded PNG marker');
    const captures = new Set();
    let activePhase = '';
    const rasterFrames = [];
    cdp.on('Page.screencastFrame', event => {
      cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
      if (activePhase) rasterFrames.push({ phase: activePhase, timestamp: event.metadata.timestamp, data: event.data });
    });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 1440, maxHeight: 1000 });
    await page.exposeFunction('__paintLossSignal', event => {
      const promise = (async () => {
        const buffer = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64');
        const name = (baseline ? 'baseline-' : 'candidate-') + event.phase + '-paint-loss.png';
        await fs.writeFile(path.join(output, name), buffer);
        const pixels = markerPixels(buffer, event.current.rect);
        report.captures.push({ ...event, path: path.join(output, name), pixels, pixelConfirmedLoss: pixels.ratio < .1 });
      })(); captures.add(promise); promise.finally(() => captures.delete(promise));
    });
    await page.evaluate(() => {
      const ids = new WeakMap(); let serial = 0;
      const identity = node => { if (!node) return 0; if (!ids.has(node)) ids.set(node, ++serial); return ids.get(node); };
      const probe = window.__paintProbe = { phase: '', frames: [], previous: new Map(), alerted: new Set(), running: true };
      function effective(node) { let opacity = 1, hidden = false; for (let current = node; current instanceof Element; current = current.parentElement) { const css = getComputedStyle(current); opacity *= Number(css.opacity); hidden ||= css.display === 'none' || ['hidden', 'collapse'].includes(css.visibility); } return { opacity, hidden }; }
      const frame = t => {
        const feed = document.querySelector('[data-cc98-virtual="true"]'), inset = document.querySelector('.cc98-rebuild-topbar')?.getBoundingClientRect().bottom || 0;
        const values = [];
        for (const card of feed?.querySelectorAll(':scope > .cc98-rebuild-card') || []) {
          const key = card.dataset.itemKey;
          [...card.querySelectorAll('.cc98-rebuild-topic-media-image')].forEach((image, slot) => {
            const rect = image.getBoundingClientRect(); if (rect.bottom <= inset || rect.top >= innerHeight) return;
            const frameNode = image.closest('.cc98-rebuild-image-frame'), css = effective(image), status = frameNode?.querySelector('.cc98-rebuild-image-status');
            const value = { key, slot, card: identity(card), image: identity(image), frame: identity(frameNode), src: image.currentSrc || image.src, complete: image.complete, naturalWidth: image.naturalWidth, status: frameNode?.dataset.status, loader: status ? getComputedStyle(status).display : null, ...css, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
            value.painted = value.complete && value.naturalWidth > 0 && !value.hidden && value.opacity > .9;
            values.push(value);
            const previous = probe.previous.get(key + ':' + slot);
            if (probe.phase && previous?.painted && !value.painted && !probe.alerted.has(probe.phase)) {
              probe.alerted.add(probe.phase); window.__paintLossSignal({ phase: probe.phase, t, previous, current: value });
            }
          });
        }
        if (probe.phase) probe.frames.push({ t, phase: probe.phase, y: scrollY, feed: identity(feed), rootClass: document.documentElement.className, appClass: document.getElementById('cc98-comfort-app')?.className, images: values });
        probe.previous = new Map(values.map(value => [value.key + ':' + value.slot, value]));
        if (probe.running) requestAnimationFrame(frame);
      }; requestAnimationFrame(frame);
    });
    for (const phase of ['append', 'avatar', 'view', 'reply', 'metadata', 'control', 'source', 'reorder', 'failed']) {
      await ready(); await page.waitForTimeout(200);
      activePhase = phase;
      await page.evaluate(({ phase, index }) => {
        __paintProbe.phase = phase;
        const native = document.querySelector('[data-fixture-index="' + index + '"]');
        const info = native.querySelector('.card-topic-info');
        if (phase === 'append') __newTopicsFixture.append(12);
        if (phase === 'avatar') { const avatar = document.createElement('img'); avatar.className = 'user-avatar'; avatar.src = '/static/images/avatar-change-' + index + '.png'; native.querySelector('a[href*="/user/id/"]').append(avatar); }
        if (phase === 'view') info.children[0].textContent = '32001';
        if (phase === 'reply') info.children[1].textContent = '13';
        if (phase === 'metadata') info.children[3].textContent = '今天 08:21:12';
        if (phase === 'source') { const image = native.querySelector('.card-topic-thumbnail img'); image.src = image.dataset.src + '?progressive=original'; }
        if (phase === 'reorder') { const gallery = native.querySelector('.card-topic-thumbnail'), images = [...gallery.querySelectorAll('img')]; gallery.insertBefore(images[1], images[0]); images[0].src = images[0].dataset.src + '?progressive=reordered'; }
        if (phase === 'failed') { const image = native.querySelector('.card-topic-thumbnail img'); image.src = image.dataset.src + '?failed=1'; }
        if (phase === 'control') { const card = [...document.querySelectorAll('[data-cc98-virtual="true"] > .cc98-rebuild-card')].find(card => card.dataset.itemKey.endsWith('/' + (7000000 + index) + '/1')); const image = card.querySelector('.cc98-rebuild-topic-media-image'); image.style.setProperty('opacity', '0', 'important'); setTimeout(() => image.style.removeProperty('opacity'), 250); }
      }, { phase, index: target.index });
      await page.waitForTimeout(1300);
      const frames = await page.evaluate(phase => __paintProbe.frames.filter(frame => frame.phase === phase), phase);
      const resets = [], replacements = [], feeds = new Set(frames.map(frame => frame.feed));
      for (let i = 1; i < frames.length; i++) for (const current of frames[i].images) {
        const previous = frames[i - 1].images.find(value => value.key === current.key && value.slot === current.slot); if (!previous) continue;
        if (previous.painted && !current.painted) resets.push({ t: frames[i].t, previous, current });
        if (previous.card !== current.card || previous.image !== current.image || previous.frame !== current.frame) replacements.push({ t: frames[i].t, previous, current });
      }
      report.phases.push({ phase, frames, metrics: { frames: frames.length, feedIdentities: feeds.size, paintResets: resets.length, cardOrImageReplacements: replacements.length }, resets, replacements });
      console.log('paint probe: ' + phase + ' ' + JSON.stringify(report.phases.at(-1).metrics));
      activePhase = '';
      await page.evaluate(() => { __paintProbe.phase = ''; });
    }
    await cdp.send('Page.stopScreencast');
    await Promise.all([...captures]); await page.evaluate(() => { __paintProbe.running = false; });
    report.rasterFrames = [];
    for (const frame of rasterFrames) {
      const buffer = Buffer.from(frame.data, 'base64'), pixels = markerPixels(buffer, target.rect);
      const value = { phase: frame.phase, timestamp: frame.timestamp, pixels, pixelConfirmedLoss: pixels.ratio < .1 };
      if (value.pixelConfirmedLoss && !report.rasterFrames.some(previous => previous.phase === frame.phase && previous.path)) { value.path = path.join(output, (baseline ? 'baseline-' : 'candidate-') + frame.phase + '-compositor-loss.png'); await fs.writeFile(value.path, buffer); }
      report.rasterFrames.push(value);
    }
    report.positiveControl = report.rasterFrames.some(value => value.phase === 'control' && value.pixelConfirmedLoss);
    assert(report.positiveControl, 'the actual compositor pixel detector observes an explicit opacity-loss positive control');
    await fs.writeFile(path.join(output, baseline ? 'baseline-paint-evidence.json' : 'latest-paint-evidence.json'), JSON.stringify(report, null, 2));
    if (!baseline) {
      assert(!report.captures.some(value => value.phase !== 'control' && value.pixelConfirmedLoss), 'updates must not erase an already painted image');
      assert(!report.rasterFrames.some(value => value.phase !== 'control' && value.pixelConfirmedLoss), 'compositor screenshots retain already visible decoded PNG pixels during updates');
      assert(report.phases.filter(value => value.phase !== 'control').every(value => value.metrics.paintResets === 0), 'updates preserve decoded media throughout every sampled frame');
      assert(report.phases.filter(value => !['source', 'reorder', 'control'].includes(value.phase)).every(value => value.metrics.cardOrImageReplacements === 0), 'metadata/append preserve existing media and card DOM');
      assert(report.phases.find(value => value.phase === 'source').frames.some(frame => frame.images.some(image => image.key === target.key && image.src.includes('progressive=original') && image.naturalWidth === 512)), 'ready handoff displays the newly decoded 512px source');
      assert(report.rasterFrames.some(value => value.phase === 'source' && value.pixels.newRatio > .85), 'new source actually paints green/yellow pixels rather than freezing the old image');
      const inspect = () => worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
        return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ status: CC98RebornNewTopicsVirtual.status(), saved: readReadLaterItems().map(item => ({ title: item.title, href: item.href })) }) }))[0].result;
      });
      const waitPending = async expected => { for (let i = 0; i < 35; i++) { const result = await inspect(); if (expected ? result.status.pendingMedia > 0 : result.status.pendingMedia === 0) return result.status; await page.waitForTimeout(35); } throw new Error('pendingMedia did not become ' + expected + ': ' + JSON.stringify(await inspect())); };
      const card = () => page.locator(feedSelector + ' > [data-item-key="' + target.key + '"]');
      await page.evaluate(index => { const native = document.querySelector('[data-fixture-index="' + index + '"]'); window.__retainedReadLater = [...document.querySelectorAll('[data-cc98-virtual="true"] > .cc98-rebuild-card')].find(card => card.dataset.itemKey.endsWith('/' + (7000000 + index) + '/1')).querySelector('.cc98-rebuild-read-later-button'); native.querySelector('.card-topic-title').textContent = 'Updated latest synthetic title'; }, target.index);
      await card().locator('a.cc98-rebuild-card-title').filter({ hasText: 'Updated latest synthetic title' }).waitFor();
      assert(await page.evaluate(() => __retainedReadLater.isConnected), 'title patch preserves the existing read-later button');
      await page.evaluate(() => __retainedReadLater.click());
      await page.waitForTimeout(200); report.savedAfterTitle = (await inspect()).saved;
      assert(report.savedAfterTitle.some(item => item.title === 'Updated latest synthetic title' && item.href === target.key.slice('topic:'.length)), 'retained read-later handler saves the latest title');
      const slow = async (index, tag) => { await page.evaluate(({ index, tag }) => { const image = document.querySelector('[data-fixture-index="' + index + '"] .card-topic-thumbnail img'); image.src = image.dataset.src + '?progressive=' + tag + '&slow=' + tag; }, { index, tag }); return waitPending(true); };
      report.viewerPending = { before: await slow(target.index, 'viewer') };
      const displayedBeforeViewer = await card().locator('.cc98-rebuild-topic-media-image').first().getAttribute('src');
      await card().locator('.cc98-rebuild-topic-media-image').first().evaluate(image => image.click());
      await page.locator('#cc98-comfort-image-viewer').waitFor();
      await page.waitForFunction(src => document.querySelector('#cc98-comfort-image-viewer img')?.src === src, displayedBeforeViewer);
      await page.waitForTimeout(2000);
      assert.equal(await card().locator('.cc98-rebuild-topic-media-image').first().getAttribute('src'), displayedBeforeViewer, 'pending handoff waits while its displayed image is protected by the viewer');
      await page.keyboard.press('Escape'); await page.locator('#cc98-comfort-image-viewer').waitFor({ state: 'detached' });
      await waitPending(false); await page.waitForTimeout(120);
      assert((await card().locator('.cc98-rebuild-topic-media-image').first().getAttribute('src')).includes('progressive=viewer'), 'closing viewer commits the decoded new image');
      report.viewerPending.after = (await inspect()).status;
      const finalBuffer = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64');
      await fs.writeFile(path.join(output, 'candidate-after-ready.png'), finalBuffer);
      report.cleanup = [];
      report.cleanup.push({ action: 'scroll', pending: await slow(target.index, 'scroll') });
      await page.evaluate(index => { window.__unmountedPaintCard = [...document.querySelectorAll('[data-cc98-virtual="true"] > .cc98-rebuild-card')].find(card => card.dataset.itemKey.endsWith('/' + (7000000 + index) + '/1')); document.activeElement?.blur(); scrollTo(0, document.documentElement.scrollHeight); }, target.index);
      await page.waitForTimeout(2100); assert(await page.evaluate(() => !__unmountedPaintCard.isConnected), 'scroll eviction does not reattach the pending old row');
      assert.equal((await inspect()).status.pendingMedia, 0);
      for (const action of ['disable', 'route']) {
        const index = await page.locator(feedSelector + ' .cc98-rebuild-topic-media-image').last().evaluate(image => Number(image.src.match(/virtual-(\d+)-/)[1]));
        report.cleanup.push({ action, pending: await slow(index, action) });
        if (action === 'disable') await worker.evaluate(async () => { const data = await chrome.storage.local.get('cc98ComfortSettings'); await chrome.storage.local.set({ cc98ComfortSettings: { ...data.cc98ComfortSettings, enabled: false } }); });
        else await page.evaluate(() => { history.pushState({}, '', '/focus'); dispatchEvent(new PopStateEvent('popstate')); });
        await page.waitForTimeout(2100);
        const state = await inspect(); assert.equal(state.status.active, false); assert.equal(state.status.pendingMedia, 0); assert.equal(await page.locator(feedSelector).count(), 0);
        if (action === 'disable') { await worker.evaluate(async () => { const data = await chrome.storage.local.get('cc98ComfortSettings'); await chrome.storage.local.set({ cc98ComfortSettings: { ...data.cc98ComfortSettings, enabled: true } }); }); await page.locator(feedSelector).waitFor(); await page.waitForTimeout(300); }
      }
      assert.deepEqual(report.errors, []); report.passed = true;
      const old = JSON.parse(await fs.readFile(path.join(output, 'baseline-paint-evidence.json'), 'utf8'));
      report.beforeAfter = { baselineBuild: old.build, baselinePixelConfirmed: old.captures.filter(value => value.phase !== 'control' && value.pixelConfirmedLoss).map(value => ({ phase: value.phase, pixels: value.pixels, path: value.path })), candidatePixelConfirmedLoss: report.captures.filter(value => value.phase !== 'control' && value.pixelConfirmedLoss).length, baselinePhases: old.phases.map(value => ({ phase: value.phase, ...value.metrics })), candidatePhases: report.phases.map(value => ({ phase: value.phase, ...value.metrics })) };
      await fs.writeFile(path.join(output, 'paint-stability-validation.json'), JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify({ baseline, passed: report.passed, pixelConfirmed: report.captures.filter(value => value.pixelConfirmedLoss).map(value => value.phase), compositorLoss: report.rasterFrames.filter(value => value.pixelConfirmedLoss).map(value => value.phase), output }));
  } catch (error) {
    report.error = error.stack; await fs.writeFile(path.join(output, 'paint-stability-failure.json'), JSON.stringify(report, null, 2)); throw error;
  } finally { await context.close(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { mixedFixture, markerImage };
