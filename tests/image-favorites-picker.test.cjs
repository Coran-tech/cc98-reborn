const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const favoritesCore = require('../src/image-favorites-core.js');

const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:8765';
const imageUrl = `${origin}/synthetic-favorite.png`;
const output = path.join(root, 'outputs/image-favorites-20261109/picker-qa');

async function main() {
  const browser = await chromium.launch({ executablePath: await executable(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(({ imageUrl }) => {
      const listeners = new Set();
      let items = [{ url: imageUrl, code: `[img]${imageUrl}[/img]`, note: '合成收藏图片', sourceHref: '/topic/1234567', createdAt: 1 }];
      let failure = '';
      let ready = true;
      globalThis.CC98RebornImageFavorites = {
        async list() { if (failure) throw new Error(failure); return items; },
        getItems: () => items,
        isReady: () => ready,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
      };
      globalThis.__favoriteFixture = {
        update(next, error = '') { items = next; failure = error; ready = !error; listeners.forEach(fn => fn()); },
        count: () => listeners.size
      };
    }, { imageUrl });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/synthetic-favorite.png') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#236c67"/><path d="m40 85 45-50 30 25 25-30 30 55" fill="#d6e7c3"/></svg>' });
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try {
        if (url.pathname === '/tests/local-ubb-editor.html') {
          const html = (await fs.readFile(file, 'utf8')).replace('</head>', '<link rel="stylesheet" href="/src/interface-styles.css"><link rel="stylesheet" href="/src/image-favorites-picker.css"></head>');
          return route.fulfill({ contentType: 'text/html', body: html });
        }
        return route.fulfill({ path: file });
      } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    await page.goto(`${origin}/tests/local-ubb-editor.html`);
    await page.waitForFunction(() => Boolean(window.__ubbRegression?.state));
    const panel = page.locator('#native-editor > .cc98-rebuild-editor-emoji-panel');
    const open = async () => {
      await page.locator('#native-editor .ubb-buttons .ubb-emoji-button').click();
      await panel.waitFor({ state: 'visible' });
    };
    const favorites = async () => {
      await panel.getByRole('button', { name: '图片收藏', exact: true }).click();
      await panel.locator('.cc98-rebuild-image-favorite-option').waitFor({ state: 'visible' });
    };
    const setCaret = async surface => {
      await page.evaluate(surface => {
        const state = __ubbRegression.state;
        const input = surface === 'source' ? state.sourceEditor : state.visual;
        input.textContent = '前后';
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const range = document.createRange();
        range.setStart(input.firstChild, 1); range.collapse(true);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        state.rememberSelection();
      }, surface);
    };
    await setCaret('source');
    await open();
    assert.deepEqual(await panel.locator('.cc98-rebuild-message-emoji-tab').allTextContents(), ['CC98', 'AC娘', '麻将脸', '贴吧', '雀魂', '经典', '图片收藏']);
    await favorites();
    await panel.getByRole('button', { name: '合成收藏图片', exact: true }).click();
    await page.waitForFunction(url => __ubbRegression.snapshot().sourceValue === `前[img]${url}[/img]后`, imageUrl);
    assert(await panel.isHidden());

    await setCaret('visual');
    await open();
    await favorites();
    await panel.getByRole('button', { name: '合成收藏图片', exact: true }).click();
    await page.waitForFunction(url => __ubbRegression.snapshot().sourceValue === `前[img]${url}[/img]后`, imageUrl);
    assert.equal(await page.evaluate(() => __ubbRegression.state.visual.querySelector('img')?.dataset.cc98UbbTag), 'img');
    assert.equal(await page.evaluate(() => __ubbRegression.state.visual.querySelector('[data-cc98-ubb-emotion-tag]')), null);

    const bracketImage = favoritesCore.item({ url: `${imageUrl}?name=[demo]`, note: '括号地址' }, 1);
    await page.evaluate(item => __favoriteFixture.update([item]), bracketImage);
    for (const surface of ['source', 'visual']) {
      await setCaret(surface); await open(); await favorites();
      await panel.getByRole('button', { name: '括号地址', exact: true }).click();
      await page.waitForFunction(code => __ubbRegression.snapshot().sourceValue === `前${code}后`, bracketImage.code);
      assert.match(await page.evaluate(() => __ubbRegression.snapshot().sourceValue), /name=%5Bdemo%5D/);
    }
    await page.evaluate(item => __favoriteFixture.update([item]), favoritesCore.item({ url: imageUrl, note: '合成收藏图片' }, 1));

    await setCaret('source');
    await open();
    await panel.getByRole('button', { name: 'AC娘', exact: true }).click();
    await panel.getByRole('button', { name: 'AC娘 1', exact: true }).click();
    await page.waitForFunction(() => __ubbRegression.snapshot().sourceValue === '前[ac01]后');

    await open(); await favorites();
    assert.equal(await page.evaluate(() => __favoriteFixture.count()), 1, 'one global subscription across opens');
    await fs.mkdir(output, { recursive: true });
    await panel.screenshot({ path: path.join(output, 'modern-picker.png') });
    await page.evaluate(() => document.documentElement.dataset.cc98ComfortStyle = 'ascii');
    assert.equal(await panel.locator('.cc98-rebuild-image-favorite-option').evaluate(node => getComputedStyle(node).borderRadius), '0px');
    await panel.screenshot({ path: path.join(output, 'ascii-picker.png') });
    await page.evaluate(() => __favoriteFixture.update([]));
    assert.equal(await panel.locator('.cc98-rebuild-image-favorite-option').count(), 0);
    assert.equal(await panel.locator('.cc98-rebuild-image-favorites-picker-status').textContent(), '暂无图片收藏');
    await page.evaluate(() => __favoriteFixture.update([], '请先登录'));
    await page.waitForFunction(() => document.querySelector('#native-editor .cc98-rebuild-image-favorites-picker-status')?.textContent === '请先登录');
    await page.evaluate(() => {
      const wrapper = document.createElement('div'); wrapper.className = 'cc98-content-rule-emotion'; document.body.append(wrapper);
      const rulePanel = ensurePrivateMessageEmojiPanel(wrapper, null, { onSelect() {} }); rulePanel.id = 'rule-emoji-panel';
    });
    assert.equal(await page.locator('#rule-emoji-panel .cc98-rebuild-message-emoji-tab').count(), 6, 'blocking rules keep only symbolic emoji');
    assert.equal(await page.evaluate(() => __favoriteFixture.count()), 1, 'custom rule picker adds no subscription');
    assert.deepEqual(errors, []);
    console.log('image favorites picker: six categories preserved; source/visual caret insertion; live updates; logout/error; ASCII; one subscription; rule-picker isolation passed');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
