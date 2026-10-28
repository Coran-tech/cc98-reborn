const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { listFixture, executable } = require('./new-topics-virtual.test.cjs');

const root = path.resolve(__dirname, '..');
const origin = 'https://www.cc98.org';
const baseline = process.argv.includes('--baseline');

async function main() {
  const context = await chromium.launchPersistentContext('', {
    executablePath: await executable(), headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root],
    viewport: { width: 1440, height: 1000 }
  });
  try {
    await context.setOffline(true);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin !== origin) return route.abort();
      if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#72b8aa"/></svg>' });
      return route.fulfill({ contentType: 'text/html', body: listFixture(520) });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ cc98ComfortSettings: { enabled: true, rebuildUi: true, themeStyle: 'ascii', themeMode: 'dark', prewarmPostImages: false, previsitFirstPageForTopicImages: false, semanticFilterEnabled: false, blockedTitleKeywords: '/NeverMatches/i', blockedContentRules: '[]', openLinksInNewTab: false } });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/newTopics', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-cc98-virtual="true"] > article').first().waitFor();
    await page.waitForTimeout(2200);
    const measure = () => worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
        const feed = document.querySelector('[data-cc98-virtual="true"]');
        const nodes = [...feed.querySelectorAll(':scope > article')];
        const rect = Element.prototype.getBoundingClientRect;
        let reads = 0;
        Element.prototype.getBoundingClientRect = function () {
          if (this.parentElement === feed && this.matches('article')) reads++;
          return rect.call(this);
        };
        const mutations = [];
        const observer = new MutationObserver(records => mutations.push(...records));
        observer.observe(feed, { childList: true, subtree: true, attributes: true });
        try {
          const start = performance.now();
          for (let i = 0; i < 30; i++) window.dispatchEvent(new Event('scroll'));
          const synchronousReads = reads;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const burstReads = reads;
          const burstMs = performance.now() - start;
          const retained = nodes.every(node => node.isConnected);
          return { mounted: nodes.length, events: 30, synchronousReads, burstReads, burstMs, mutations: mutations.length, retained };
        } finally { observer.disconnect(); Element.prototype.getBoundingClientRect = rect; }
      } }))[0].result;
    });
    const samples = [];
    for (let i = 0; i < 3; i++) samples.push(await measure());
    for (const sample of samples) {
      assert(sample.retained && sample.mutations === 0, JSON.stringify(sample));
      if (!baseline) {
        assert.equal(sample.synchronousReads, 0, 'scroll callbacks must schedule rather than force layout');
        assert(sample.burstReads <= sample.mounted, 'one visual anchor capture per frame is sufficient');
      }
    }
    const interleaved = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
        const settle = async () => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          await new Promise(resolve => setTimeout(resolve, 100));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        };
        const feed = document.querySelector('[data-cc98-virtual="true"]');
        const samples = [];
        for (const event of ['load', 'resize', 'load+resize', 'observed-resize']) {
          for (const distance of [150, -150]) {
            scrollTo(0, 2500); await settle();
            const before = scrollY, requested = before + distance;
            let afterEvent = null, changedRow = null;
            window.addEventListener('scroll', () => {
              afterEvent = scrollY;
              if (event.includes('load')) feed.dispatchEvent(new Event('load'));
              if (event === 'resize' || event === 'load+resize') dispatchEvent(new Event('resize'));
              if (event === 'observed-resize') {
                // Resize an overscanned row below the viewport so the observed
                // resize itself has no reason to move the reading position.
                changedRow = [...feed.querySelectorAll(':scope > article')].find(node => node.getBoundingClientRect().top > innerHeight + 100);
                if (changedRow) changedRow.style.setProperty('padding-bottom', '140px', 'important');
              }
            }, { once: true });
            scrollTo(0, requested); await settle();
            samples.push({ event, before, requested, afterEvent, final: scrollY, observedRow: event !== 'observed-resize' || Boolean(changedRow) });
            changedRow?.style.removeProperty('padding-bottom'); await settle();
          }
        }
        return samples;
      } }))[0].result;
    });
    for (const sample of interleaved) {
      assert(sample.observedRow, 'fixture must resize an observed card: ' + JSON.stringify(sample));
      assert.equal(sample.afterEvent, sample.requested, JSON.stringify(sample));
      assert(Math.abs(sample.final - sample.requested) <= 1, 'same-frame media/resize must not undo scrolling: ' + JSON.stringify(sample));
    }
    assert.deepEqual(errors, []);
    const result = { passed: true, baseline, realMV3: true, syntheticOnly: true, theme: 'ASCII dark / card', samples, interleaved, errors };
    const output = path.join(root, 'outputs/virtual-scroll-performance');
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, baseline ? 'before.json' : 'after.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await context.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
