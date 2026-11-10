const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/browser-perf-nav-20261029');
const baseline = process.argv.includes('--baseline');

async function main() {
  const helper = await fs.readFile(path.join(root, 'tests/topic-search.test.cjs'), 'utf8');
  const { foreground } = new Function('require', '__dirname', helper.split('async function main()')[0] + ';return {foreground};')(require, __dirname);
  const origin = 'https://www.cc98.org';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/focus') return route.fulfill({ contentType: 'text/html', body: foreground(2, 5) });
      if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="teal"/></svg>' });
      const name = decodeURIComponent(url.pathname).replace(/^\//, '');
      const file = baseline && name === 'src/content.js' ? path.join(output, 'content-before.js') : path.resolve(root, name);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try { return route.fulfill({ path: file }); } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    await page.goto(origin + '/focus');
    await page.evaluate(() => {
      const source = document.querySelector('.native');
      source.innerHTML = '<div class="focus-topic-topicArea" id="native-topics"></div>';
      const native = source.firstElementChild;
      for (let index = 1; index <= 320; index++) {
        const row = document.createElement('section'); row.className = 'focus-topic';
        row.innerHTML = `<a class="focus-topic-title" href="/topic/${7000000 + index}">主题 ${index}：用于验证长列表追加时保留现有卡片与媒体</a><a class="focus-topic-left" href="/user/id/${10000 + index}">用户 ${index}</a><a class="focus-topic-right" href="/board/81">校园生活</a><div class="focus-topic-info">今天 08:20:11 最后回复: 测试</div>`;
        native.append(row);
      }
      getPageKind = () => 'topics'; shouldWaitForNativeRoute = () => false;
      lastSettings = { ...lastSettings, themeStyle: 'ascii', blockedBoards: '', blockedUsers: '', blockedUserIds: '', blockedTitleKeywords: '', openLinksInNewTab: false };
      CC98RebornThemeCore.apply(document.documentElement, lastSettings);
      const app = document.querySelector('#cc98-comfort-app'); app.dataset.pageKind = 'topics'; app.dataset.routeKey = getRoutePageKey();
      const feed = document.createElement('section'); feed.dataset.feedKind = 'topics';
      getTopicItems().forEach(item => { const card = renderTopicCard(item); card.dataset.itemKey = 'topic:' + item.href; feed.append(card); });
      app.replaceChildren(feed); CC98RebornInterfaceStyle.sync(lastSettings);
      window.__cards = [...feed.children]; window.__renders = 0;
      const render = renderTopicCard; renderTopicCard = (...args) => { __renders++; return render(...args); };
      document.querySelector('#draft').value = '列表更新时保留输入'; document.querySelector('#draft').setSelectionRange(2, 5);
    });
    await page.waitForTimeout(300);
    if (process.argv.includes('--profile-only')) {
      console.log(JSON.stringify(await page.evaluate(() => {
        const names = ['getTopicItems', 'getTopicCardRenderState', 'getNativeTopicItemCache', 'getFirstLink', 'parseStructuredTopicMeta', 'parseTopicMetaText', 'getTopicInfoText', 'collectNewTopicCardMedia', 'shouldBlockRebuiltItem', 'stabilizeTopbarUserEntry', 'removeDecorativeFrameImages', 'getPageKind', 'makeAbsoluteCc98Url', 'normalizeHref'];
        const totals = {};
        for (const name of names) {
          const original = window[name];
          if (typeof original !== 'function') continue;
          totals[name] = { calls: 0, milliseconds: 0 };
          window[name] = function (...args) {
            const start = performance.now();
            try { return original.apply(this, args); }
            finally { totals[name].calls++; totals[name].milliseconds += performance.now() - start; }
          };
        }
        const start = performance.now(); syncRebuiltContent();
        return { milliseconds: performance.now() - start, totals };
      })));
      return;
    }
    const report = await page.evaluate(async () => {
      const feed = document.querySelector('[data-feed-kind="topics"]');
      const native = document.querySelector('#native-topics');
      const rows = [];
      const measure = (name, edit = () => {}, rounds = 1) => {
        const old = [...feed.children]; __renders = 0; edit(); const start = performance.now();
        for (let i = 0; i < rounds; i++) syncRebuiltContent();
        const row = { name, calls: __renders, milliseconds: performance.now() - start, count: feed.children.length, retained: old.filter(node => node.isConnected).length };
        rows.push(row); return row;
      };
      measure('unchanged-three-syncs', undefined, 3);
      measure('append-one', () => { const extra = native.firstElementChild.cloneNode(true); extra.querySelector('.focus-topic-title').href = '/topic/7999999'; extra.querySelector('.focus-topic-title').textContent = '新增主题'; native.append(extra); });
      measure('title-edit', () => { native.firstElementChild.querySelector('.focus-topic-title').textContent = '修改后的标题'; });
      if (!feed.firstElementChild.textContent.includes('修改后的标题')) throw new Error('Title edit not rendered');
      measure('metadata-edit', () => { native.firstElementChild.querySelector('.focus-topic-info').textContent = '今天 09:20:11 最后回复: 更新用户'; });
      if (!feed.firstElementChild.textContent.includes('更新用户')) throw new Error('Metadata edit not rendered');
      measure('link-preference', () => { lastSettings.openLinksInNewTab = true; });
      if (feed.firstElementChild.querySelector('.cc98-rebuild-card-title').target !== '_blank') throw new Error('New tab preference stale');
      measure('unchanged-after-settings', undefined, 3);
      const block = shouldBlockRebuiltItem; let blocked = true;
      shouldBlockRebuiltItem = item => blocked && item.href.endsWith('/7000001') ? '语义规则：测试' : block(item);
      measure('late-filter-result');
      if (!feed.firstElementChild.classList.contains('cc98-rebuild-blocked')) throw new Error('Async filter result not applied');
      measure('reveal', () => { revealBlacklistItem(getTopicItems()[0]); });
      if (feed.firstElementChild.classList.contains('cc98-rebuild-blocked')) throw new Error('Reveal not applied');
      blocked = false; shouldBlockRebuiltItem = block;
      measure('unchanged-after-reveal');
      const first = getTopicItems()[0];
      measure('read-later', () => { upsertReadLaterItem(getReadLaterItemFromTopicItem(first)); });
      if (!feed.firstElementChild.querySelector('.cc98-rebuild-read-later-button').classList.contains('is-saved')) throw new Error('Saved state stale');
      measure('unchanged-after-read-later', undefined, 2);
      measure('late-media', () => {
        native.firstElementChild.classList.add('card-topic');
        const gallery = document.createElement('div'); gallery.className = 'card-topic-thumbnail';
        gallery.innerHTML = '<img src="/fixture-media.png" alt="延迟媒体">'; native.firstElementChild.append(gallery);
      });
      const image = feed.firstElementChild.querySelector('img');
      if (!image || image.alt !== '延迟媒体') throw new Error('Late native media missing');
      measure('unchanged-after-media', undefined, 2);
      if (feed.firstElementChild.querySelector('img') !== image) throw new Error('Unchanged media node replaced');
      const button = feed.firstElementChild.querySelector('.cc98-rebuild-read-later-button'); button.focus();
      measure('focused-control');
      if (document.activeElement !== button) throw new Error('List sync lost focused control');
      // A different account's just-read collection is an independent batch.
      const readSaved = readReadLaterItems; readReadLaterItems = () => [];
      measure('changed-saved-collection');
      if (feed.firstElementChild.querySelector('.cc98-rebuild-read-later-button').classList.contains('is-saved')) throw new Error('Saved collection cached across batches');
      readReadLaterItems = readSaved;
      measure('restored-saved-collection');
      const draft = document.querySelector('#draft');
      return { baseline: false, isolatedFixtureOnly: true, rows, draft: draft.value, caret: draft.selectionStart };
    });
    report.baseline = baseline; report.errors = errors;
    if (!baseline) {
      const rows = Object.fromEntries(report.rows.map(row => [row.name, row]));
      for (const name of ['unchanged-three-syncs', 'unchanged-after-settings', 'unchanged-after-read-later', 'unchanged-after-media', 'focused-control']) assert.equal(rows[name].calls, 0, name);
      for (const name of ['append-one', 'title-edit', 'metadata-edit', 'late-filter-result', 'reveal', 'late-media', 'changed-saved-collection', 'restored-saved-collection']) assert.equal(rows[name].calls, 1, name);
      assert.equal(rows['append-one'].retained, 320);
      assert.equal(rows['title-edit'].retained, 320);
    }
    assert.equal(report.draft, '列表更新时保留输入'); assert.equal(report.caret, 2); assert.deepEqual(errors, []);
    // Let native-edit/scroll follow-ups finish before testing theme/hover. A
    // deliberate theme rebuild may replace the app; ordinary sync must not.
    await page.waitForTimeout(1500);
    report.interactions = await page.evaluate(async () => {
      const results = [];
      for (const theme of ['modern', 'ascii']) {
        lastSettings.themeStyle = theme; CC98RebornThemeCore.apply(document.documentElement, lastSettings); CC98RebornInterfaceStyle.sync(lastSettings);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const card = document.querySelector('[data-feed-kind="topics"]').firstElementChild;
        __renders = 0; syncRebuiltContent();
        results.push({ theme, retained: card.isConnected, renders: __renders, style: document.documentElement.dataset.cc98ComfortStyle });
      }
      return results;
    });
    if (!baseline) assert(report.interactions.every(row => row.retained && row.renders === 0 && row.style === row.theme), JSON.stringify(report.interactions));
    const first = page.locator('[data-feed-kind="topics"] > article').first();
    await first.hover(); await page.waitForTimeout(220);
    report.hover = await first.evaluate(card => {
      const before = card.getBoundingClientRect().height;
      syncRebuiltContent();
      return { retained: card.isConnected, before, after: card.getBoundingClientRect().height, hovered: card.matches(':hover') };
    });
    if (!baseline) assert(report.hover.retained && report.hover.hovered && report.hover.before === report.hover.after, JSON.stringify(report.hover));
    assert.deepEqual(errors, []);
    report.passed = true;
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, baseline ? 'topic-feed-before.json' : 'topic-feed-after.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
