const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/performance-preview');

async function main() {
  const baseline = process.argv.includes('--baseline');
  const helper = await fs.readFile(path.join(root, 'tests/topic-search.test.cjs'), 'utf8');
  const { foreground, origin } = new Function('require', '__dirname', helper.split('async function main()')[0] + ';return {foreground,origin};')(require, __dirname);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/topic/100/2') return route.fulfill({ contentType: 'text/html', body: foreground(2, 5) });
      const name = decodeURIComponent(url.pathname).replace(/^\//, '');
      const file = baseline && ['src/content.js', 'src/interface-style.js'].includes(name)
        ? path.join(root, 'outputs/performance-before', path.basename(name)) : path.resolve(root, name);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try { await route.fulfill({ path: file }); } catch { await route.fulfill({ status: 404, body: '' }); }
    });
    await page.goto(origin + '/topic/100/2');
    await page.evaluate(() => {
      const source = document.querySelector('.native');
      source.querySelectorAll('.reply').forEach(node => node.remove());
      for (let floor = 11; floor <= 50; floor++) {
        const node = document.createElement('div'); node.className = 'reply'; node.id = 'reply_' + floor; node.dataset.floor = floor;
        node.innerHTML = `<a href='/user/id/${floor + 1000}'>用户${floor}</a><span class='reply-floor'>${floor}</span><div class='reply-content'><div class='substance'><article>${Array.from({ length: 8 }, (_, i) => `<p>第 ${floor} 楼的正文 ${i}，保留原有内容、引用与编辑操作。</p>`).join('')}</article></div></div><div class='reply-footer'><button>引用</button><button>评分</button></div>`;
        source.append(node);
      }
      getPageKind = () => 'post'; shouldWaitForNativeRoute = () => false;
      const app = document.querySelector('#cc98-comfort-app'); app.dataset.pageKind = 'post';
      app.dataset.routeKey = getRoutePageKey();
      const feed = document.createElement('div'); feed.className = 'cc98-rebuild-post-feed'; feed.dataset.feedKind = 'post';
      getPostItems().forEach(item => { const card = renderPostCard(item); card.dataset.itemKey = 'post:' + item.id; feed.append(card); });
      app.replaceChildren(feed); window.__originalCards = [...feed.children];
      const render = renderPostCard; window.__renderCalls = 0;
      renderPostCard = function (...args) { __renderCalls++; return render(...args); };
      document.querySelector('#draft').value = '性能优化时保留草稿'; document.querySelector('#draft').setSelectionRange(2, 4);
    });
    const posts = await page.evaluate(() => {
      const times = [];
      for (let i = 0; i < 3; i++) { const start = performance.now(); syncRebuiltContent(); times.push(performance.now() - start); }
      return { calls: __renderCalls, times, retained: __originalCards.every((node, i) => node === document.querySelectorAll('.cc98-rebuild-post-feed > article')[i]),
        draft: document.querySelector('#draft').value, caret: document.querySelector('#draft').selectionStart };
    });
    await page.evaluate(() => {
      const modal = document.createElement('section'); modal.id = 'perf-modal'; modal.className = 'ant-modal-content';
      modal.innerHTML = '<div class="ant-list"><div class="ant-list-item">评分记录</div><div class="ant-list-item">保留原生内容</div></div>';
      document.body.append(modal);
      const stabilize = stabilizeNativeAntUi; window.__antCalls = 0;
      stabilizeNativeAntUi = function (...args) { __antCalls++; return stabilize(...args); };
      ensureNativeAntUiStabilizer();
    });
    await page.waitForTimeout(350);
    await page.evaluate(() => { __antCalls = 0; });
    await page.waitForTimeout(800);
    const antIdle = await page.evaluate(() => __antCalls);
    await page.evaluate(() => {
      const late = document.createElement('div'); late.className = 'ant-list-item'; late.textContent = '异步评分';
      document.querySelector('#perf-modal .ant-list').append(late);
    });
    await page.waitForTimeout(180);
    const lateAnt = await page.locator('#perf-modal .ant-list-item').last().evaluate(node => node.classList.contains('cc98-rebuild-native-ant-list'));
    await page.evaluate(() => {
      document.querySelector('#perf-modal').remove();
      lastSettings.themeStyle = 'ascii'; CC98RebornThemeCore.apply(document.documentElement, lastSettings); CC98RebornInterfaceStyle.sync(lastSettings);
      const editor = document.createElement('div'); editor.id = 'perf-editor'; editor.className = 'cc98-rebuild-native-editor';
      editor.innerHTML = '<div contenteditable="true" id="perf-visual">编辑内容</div>'; document.querySelector('#cc98-comfort-app').append(editor);
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const query = document.querySelectorAll.bind(document); window.__frameScans = 0;
      document.querySelectorAll = function (selector) { if (selector.includes('#cc98-comfort-app .cc98-rebuild-topbar') && selector.includes('.cc98-rebuild-conversation-post')) __frameScans++; return query(selector); };
    });
    await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        document.querySelector('#perf-visual').append(document.createTextNode('输入'));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
    });
    const editorFullScans = await page.evaluate(() => __frameScans);
    await page.evaluate(() => {
      const panel = document.createElement('section'); panel.id = 'perf-late-panel'; panel.className = 'cc98-rebuild-convert-dialog';
      panel.innerHTML = '<button class="cc98-rebuild-convert-close">×</button><p>动态打开的新弹窗</p>';
      document.body.append(panel);
    });
    await page.waitForTimeout(150);
    const lateDecoration = await page.locator('#perf-late-panel').evaluate(node => Boolean(node.querySelector('.cc98-ascii-decoration')) && node.querySelector('button').dataset.cc98AsciiControl === '[X]');
    const dynamic = await page.evaluate(() => {
      const native = document.querySelector('.native');
      const extra = native.querySelector('.reply').cloneNode(true); extra.id = 'reply_51'; extra.dataset.floor = '51'; extra.querySelector('.reply-floor').textContent = '51'; native.append(extra);
      const before = __renderCalls; syncRebuiltContent();
      return { added: document.querySelectorAll('.cc98-rebuild-post-feed > article').length === 41, calls: __renderCalls - before };
    });
    assert(posts.retained && posts.draft === '性能优化时保留草稿' && posts.caret === 2);
    assert(lateAnt && lateDecoration && dynamic.added, JSON.stringify({ posts, antIdle, editorFullScans, lateAnt, lateDecoration, dynamic }));
    if (!baseline) { assert.equal(posts.calls, 0); assert.equal(antIdle, 0); assert.equal(editorFullScans, 0); assert.equal(dynamic.calls, 1); }
    assert.deepEqual(errors, []);
    const result = { baseline, posts, antIdle, editorFullScans, dynamic, lateAnt, lateDecoration };
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, baseline ? 'before.json' : 'after.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
