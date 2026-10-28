const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { listFixture, executable } = require('./new-topics-virtual.test.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/smoothness-20261028');
const baseline = process.argv.includes('--baseline');
const origin = 'https://www.cc98.org';

async function main() {
  const context = await chromium.launchPersistentContext('', { executablePath: await executable(), headless: true,
    ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except=' + root, '--load-extension=' + root],
    viewport: { width: 1440, height: 1000 } });
  const report = { baseline, syntheticOnly: true, realMV3: true, count: 520, errors: [] };
  try {
    await context.setOffline(true);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin !== origin) return route.abort();
      if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#72b8aa"/></svg>' });
      return route.fulfill({ contentType: 'text/html', body: listFixture(report.count) });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ cc98ComfortSettings: { enabled: true, rebuildUi: true, themeStyle: 'ascii', themeMode: 'light', prewarmPostImages: false, previsitFirstPageForTopicImages: false, semanticFilterEnabled: false, blockedTitleKeywords: '', blockedContentRules: '[]' } });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
      getOpenIdBinding = async () => ({ ok: true, binding: { bound: false } });
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/newTopics');
    await page.locator('[data-cc98-virtual="true"]').waitFor();
    await page.waitForFunction(() => __newTopicsFixture.state.refreshClicks > 0);
    await page.waitForTimeout(1500);
    report.measurements = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
        const results = [];
        const original = parseStructuredTopicMeta;
        let parses = 0;
        parseStructuredTopicMeta = function (...args) { parses++; return original(...args); };
        const measure = (name, edit = () => {}, rounds = 1) => {
          parses = 0;
          edit();
          const started = performance.now();
          let items;
          for (let i = 0; i < rounds; i++) items = getTopicItems();
          results.push({ name, parses, milliseconds: performance.now() - started, count: items.length });
          return items;
        };
        try {
          getTopicItems();
          measure('unchanged-five-reads', undefined, 5);
          const card = document.querySelector('#native-topic-list .card-topic');
          let items = measure('same-task-title', () => { card.querySelector('.card-topic-title').firstChild.nodeValue = '即时改标题'; });
          if (items[0].title !== '即时改标题') throw new Error('Same-task text edit was missed');
          measure('unchanged-after-edit', undefined, 3);
          items = measure('same-task-metadata-and-lazy-media', () => {
            card.querySelector('.card-topic-userName').href = '/user/id/123456';
            card.querySelector('.card-topic-userName').textContent = 'NewName';
            card.querySelector('.card-topic-thumbnail img').dataset.src = '/v2-upload/thumbnail/t/changed.jpg';
          });
          if (items[0].uid !== '123456' || items[0].user !== 'NewName' || !items[0].media[0].src.endsWith('/changed.jpg')) throw new Error('Lazy media or user identity stale');
          card.querySelector('.card-topic-title').textContent = '异步变更';
          await Promise.resolve();
          items = measure('observer-delivered-edit');
          if (items[0].title !== '异步变更') throw new Error('Observer-delivered text edit was missed');
          const expected = items[0].title, expectedSrc = items[0].media[0].src;
          items[0].title = 'caller mutation'; items[0].media[0].src = 'caller mutation';
          items = measure('caller-isolation');
          if (items[0].title !== expected || items[0].media[0].src !== expectedSrc) throw new Error('Caller can corrupt cached native data');
          items = measure('append-one', () => {
            const extra = card.cloneNode(true); extra.querySelector('.card-topic-title').href = '/topic/7999999/1';
            document.querySelector('#native-topic-list').append(extra);
          });
          if (items.length !== 521) throw new Error('Append missing');
          items = measure('remove-one', () => { document.querySelector('#native-topic-list').lastElementChild.remove(); });
          if (items.length !== 520) throw new Error('Removal stale');
          card.remove();
          await Promise.resolve();
          card.querySelector('.card-topic-title').textContent = '离开DOM时修改';
          items = measure('reinsert-edited-row', () => { document.querySelector('#native-topic-list').prepend(card); });
          if (items[0].title !== '离开DOM时修改') throw new Error('Reinserted row reused stale data');
          items = measure('replace-container', () => {
            const source = document.querySelector('#native-topic-list'); source.replaceWith(source.cloneNode(true));
          });
          if (items[0].title !== '离开DOM时修改' || items.length !== 520) throw new Error('Replacement stale');
          measure('unchanged-replaced-container', undefined, 3);
          items = measure('mode-change', () => { document.querySelector('#new-topic-media-only-button').classList.add('focus-hover'); });
          if (items[0].viewMode !== 'media') throw new Error('Mode change reused old view mode');
          items = measure('restore-card-mode', () => { document.querySelector('#new-topic-media-only-button').classList.remove('focus-hover'); });
          if (items[0].viewMode !== 'card') throw new Error('Restored card mode stale');
          // Background parsing must remain independent of the active-page cache.
          const doc = new DOMParser().parseFromString(document.querySelector('#native-topic-list').outerHTML, 'text/html');
          const parsed = getTopicItems(doc);
          doc.querySelector('.card-topic-title').textContent = '后台内容';
          if (getTopicItems(doc)[0].title !== '后台内容' || parsed.length !== 520 || getTopicItems()[0].title === '后台内容') throw new Error('Background document contract changed');
          const webVpn = isWebVpnHost;
          try {
            isWebVpnHost = () => true;
            if (typeof getNativeTopicItemCache === 'function' && getNativeTopicItemCache('card') !== null) throw new Error('WebVPN must retain live URL resolution');
            if (typeof nativeTopicItemCache !== 'undefined' && nativeTopicItemCache !== null) throw new Error('WebVPN must release existing source cache');
          } finally { isWebVpnHost = webVpn; }
          const source = document.querySelector('#native-topic-list');
          items = measure('source-outside-known-container', () => { source.className = 'unknown-native-container'; });
          source.querySelector('.card-topic-title').textContent = '无缓存回退';
          if (getTopicItems()[0].title !== '无缓存回退' || items.length !== 520) throw new Error('Fallback content stale');
          history.pushState({}, '', '/focus');
          renderRebuiltUi();
          const released = typeof nativeTopicItemCache === 'undefined' || nativeTopicItemCache === null;
          if (!released) throw new Error('Native cache retains source after route change');
          return { results, released };
        } finally { parseStructuredTopicMeta = original; }
      } }))[0].result;
    });
    const rows = Object.fromEntries(report.measurements.results.map(row => [row.name, row]));
    if (!baseline) {
      for (const name of ['unchanged-five-reads', 'unchanged-after-edit', 'caller-isolation', 'remove-one', 'unchanged-replaced-container']) assert.equal(rows[name].parses, 0, name);
      for (const name of ['same-task-title', 'same-task-metadata-and-lazy-media', 'observer-delivered-edit', 'append-one', 'reinsert-edited-row']) assert.equal(rows[name].parses, 1, name);
      assert.equal(rows['replace-container'].parses, 520);
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, baseline ? 'extraction-before.json' : 'extraction-after.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await context.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
