const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/ascii-board-buttons');
const origin = 'https://www.cc98.org';
const settingsKey = 'cc98ComfortSettings';
const actions = ['.cc98-rebuild-board-post-topic-action', '.cc98-rebuild-board-post-vote-action'];
const samples = [
  { id: 'ascii-light-teal', themeStyle: 'ascii', themeMode: 'light', themePalette: 'teal' },
  { id: 'ascii-light-rose', themeStyle: 'ascii', themeMode: 'light', themePalette: 'rose' },
  { id: 'ascii-light-custom-white', themeStyle: 'ascii', themeMode: 'light', themePalette: 'custom', themeCustomPrimary: '#ffffff', themeCustomSecondary: '#000000' },
  { id: 'ascii-light-custom-black', themeStyle: 'ascii', themeMode: 'light', themePalette: 'custom', themeCustomPrimary: '#000000', themeCustomSecondary: '#ffffff' },
  { id: 'ascii-light-custom-yellow', themeStyle: 'ascii', themeMode: 'light', themePalette: 'custom', themeCustomPrimary: '#ffff00', themeCustomSecondary: '#00ffff' },
  { id: 'ascii-dark-teal', themeStyle: 'ascii', themeMode: 'dark', themePalette: 'teal' },
  { id: 'ascii-dark-custom-white', themeStyle: 'ascii', themeMode: 'dark', themePalette: 'custom', themeCustomPrimary: '#ffffff', themeCustomSecondary: '#000000' },
  { id: 'modern-light-teal', themeStyle: 'modern', themeMode: 'light', themePalette: 'teal' },
  { id: 'modern-dark-teal', themeStyle: 'modern', themeMode: 'dark', themePalette: 'teal' }
];

async function main() {
  await fs.mkdir(output, { recursive: true });
  const baselineRoot = path.join(output, 'baseline');
  const compare = await fs.access(path.join(baselineRoot, 'src/interface-styles.css')).then(() => true, () => false);
  let settings;
  let baseline = false;
  const errors = [];
  const blockedRequests = [];
  const snapshots = [];
  const interactions = [];
  const screenshots = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  page.setDefaultTimeout(12000);
  try {
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeBinding('__boardStorage', (_source, { keys }) => {
      const records = { [settingsKey]: settings, 'cc98RebornOpenIdBinding:v1': { bound: true, userId: 12345, userName: '测试用户' } };
      return keys === null ? records : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, records[key]]));
    });
    await page.addInitScript(() => {
      localStorage.setItem('userInfo', JSON.stringify({ id: 12345, name: '测试用户' }));
      window.__storageListeners = [];
      window.chrome = {
        runtime: { getManifest: () => ({ version: '0.4.1' }), getURL: file => new URL(`/${file}`, location.origin).href, onMessage: { addListener() {} }, sendMessage(_message, callback) { callback?.({ ok: false }); return Promise.resolve({ ok: false }); } },
        storage: { local: {}, onChanged: { addListener(listener) { __storageListeners.push(listener); } } }
      };
      chrome.storage.local.get = (keys, callback) => { const promise = __boardStorage({ keys }); if (callback) { promise.then(callback); return; } return promise; };
      chrome.storage.local.set = (_values, callback) => { callback?.(); return Promise.resolve(); };
      chrome.storage.local.remove = (_keys, callback) => { callback?.(); return Promise.resolve(); };
    });
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || request.method() !== 'GET') { blockedRequests.push({ url: url.href, method: request.method() }); return route.abort(); }
      if (/^\/editor\//.test(url.pathname)) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Local navigation target</title><p>Local navigation target</p>' });
      if (/^\/board\//.test(url.pathname)) {
        const html = (await fs.readFile(path.join(root, 'tests/vote-editor.html'), 'utf8'))
          .replace('</head>', '<link rel="stylesheet" href="/src/interface-styles.css"></head>')
          .replace('<script src="/src/content.js">', '<script src="/src/interface-style.js"></script><script src="/src/content.js">');
        return route.fulfill({ contentType: 'text/html', body: html });
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
      const selected = baseline && ['src/interface-styles.css', 'src/styles.css', 'src/theme-tokens.css', 'src/theme-core.js'].includes(relative) ? baselineRoot : root;
      const file = path.resolve(selected, relative);
      if (!file.startsWith(`${selected}${path.sep}`)) return route.abort();
      try { return await route.fulfill({ path: file }); }
      catch { return route.fulfill({ status: 404, body: 'Not found' }); }
    });
    async function board(sample, query = '') {
      settings = { enabled: true, emojiScale: 100, prewarmPostImages: false, previsitFirstPageForTopicImages: false, ...sample };
      await page.goto(`${origin}/board/758${query}`);
      await page.locator(actions[1]).waitFor();
      await page.waitForFunction(({ style, tone }) => document.documentElement.dataset.cc98ComfortStyle === style && document.documentElement.dataset.cc98ComfortTone === tone, { style: sample.themeStyle, tone: sample.themeMode });
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
      await page.mouse.move(1400, 780);
    }
    async function measure(selector) {
      return page.locator(selector).evaluate(node => {
        const rgba = color => {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data];
        };
        const luminance = color => { const [r, g, b] = rgba(color).slice(0, 3).map(c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
        let background;
        for (let parent = node; parent; parent = parent.parentElement) { const value = getComputedStyle(parent).backgroundColor; if (rgba(value)[3] === 255) { background = value; break; } }
        background ||= getComputedStyle(document.documentElement).getPropertyValue('--cc98-comfort-bg').trim();
        const css = getComputedStyle(node);
        const colors = [...new Set([node, ...node.querySelectorAll('*')].filter(n => n.textContent.trim()).map(n => getComputedStyle(n).color))];
        const ratio = color => { const a = luminance(color), b = luminance(background); return Number(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(3)); };
        return { tag: node.tagName, text: node.textContent.trim(), color: css.color, textColors: colors, background: css.backgroundColor, effectiveBackground: background, contrast: Math.min(...colors.map(ratio)), radius: css.borderRadius, border: css.borderTopColor, opacity: css.opacity, cursor: css.cursor, focusVisible: node.matches(':focus-visible'), height: node.getBoundingClientRect().height, width: node.getBoundingClientRect().width, disabled: node.disabled === true };
      });
    }
    for (const version of compare ? ['baseline', 'candidate'] : ['candidate']) {
      baseline = version === 'baseline';
      for (const sample of samples) {
        await board(sample);
        const states = [];
        for (const [index, selector] of actions.entries()) {
          await page.mouse.move(1400, 780);
          await page.locator(selector).evaluate(node => node.blur());
          const normal = await measure(selector);
          await page.locator(selector).hover();
          const hover = await measure(selector);
          await page.mouse.move(1400, 780);
          await page.keyboard.press('Tab');
          await page.locator(selector).focus();
          const focus = await measure(selector);
          assert(focus.focusVisible, `${version}/${sample.id}/${index}: keyboard focus not exercised`);
          states.push({ action: index ? 'vote' : 'topic', normal, hover, focus });
          if (version === 'candidate') for (const [name, state] of Object.entries({ normal, hover, focus })) {
            assert(state.contrast >= 4.5, `${sample.id}/${index}/${name}: contrast ${state.contrast} < 4.5`);
            if (sample.themeStyle === 'ascii') assert.equal(state.radius, '0px');
            else assert.notEqual(state.radius, '0px');
          }
        }
        snapshots.push({ version, case: sample.id, states });
        if (['ascii-light-teal', 'ascii-dark-teal', 'ascii-light-custom-yellow', 'modern-light-teal'].includes(sample.id)) {
          await page.mouse.move(1400, 780); await page.locator(actions[1]).evaluate(node => node.blur());
          const filename = `${version}-${sample.id}.png`;
          await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
          screenshots.push(path.join(output, filename));
        }
      }
    }
    if (compare) {
      assert(snapshots.filter(row => row.version === 'baseline' && row.case === 'ascii-light-teal').every(row => row.states.every(action => action.normal.contrast < 1.1)), 'did not reproduce the reported white-on-transparent bug');
      for (const sample of samples.filter(sample => sample.themeStyle === 'modern' || sample.themeMode === 'dark')) {
        const before = snapshots.find(row => row.version === 'baseline' && row.case === sample.id);
        const after = snapshots.find(row => row.version === 'candidate' && row.case === sample.id);
        assert.deepEqual(after.states, before.states, `${sample.id}: unaffected appearance changed`);
      }
    }
    baseline = false;
    for (const legacy of [false, true]) for (const [index, selector] of actions.entries()) {
      await board(samples[0], legacy ? '?legacy=1' : '');
      const action = page.locator(selector);
      assert.equal(await action.evaluate(node => node.tagName), legacy ? 'A' : 'BUTTON');
      const mode = index ? 'postVoteTopic' : 'postTopic';
      if (legacy) assert.equal(await action.getAttribute('href'), `${origin}/editor/${mode}/758`);
      await action.click();
      await page.waitForURL(`${origin}/editor/${mode}/758`);
      if (!legacy) assert.equal(await page.evaluate(() => sessionStorage.getItem('vote-native-navigation')), mode);
      interactions.push({ type: legacy ? 'legacy-anchor' : 'native-button', action: mode, navigated: page.url() });
    }
    await board(samples[0], '?locked=1');
    for (const selector of actions) {
      assert(await page.locator(selector).isDisabled());
      const state = await measure(selector);
      assert.equal(state.opacity, '0.5');
      await page.locator(selector).evaluate(node => node.click());
      assert.equal(page.url(), `${origin}/board/758?locked=1`);
      interactions.push({ type: 'disabled', action: state.text, opacity: state.opacity, navigationSuppressed: true });
    }
    assert.deepEqual(errors, []);
    assert(blockedRequests.every(request => request.method === 'GET'), 'test attempted a forum write');
    const report = { passed: true, baselineCompared: compare, baselineArchive: compare ? path.join(root, 'dist/cc98-reborn-0.4.1.zip') : null, threshold: 4.5, fixture: 'tests/vote-editor.html with actual production content.js, theme-core.js, styles.css, theme-tokens.css, interface-style.js, interface-styles.css', snapshots, interactions, screenshots, errors, blockedRequests, minimumEnabledContrast: Math.min(...snapshots.filter(row => row.version === 'candidate').flatMap(row => row.states.flatMap(action => ['normal','hover','focus'].map(state => action[state].contrast)))) };
    await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(`ASCII board buttons: ${snapshots.length} appearance cases, ${interactions.length} navigation/disabled paths passed; enabled text contrast >= ${report.minimumEnabledContrast}:1`);
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify({ passed: false, error: error.stack, snapshots, interactions, errors, blockedRequests }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
