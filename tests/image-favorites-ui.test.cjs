// Isolated image-favorites integration; every URL is a local synthetic response.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const root = path.resolve(__dirname, '..');
const collapseOnly = process.argv.includes('--collapse-only');
const out = path.join(root, collapseOnly ? 'outputs/image-favorites-collapse-20261109/qa' : 'outputs/image-favorites-20261109/qa');
const origin = 'https://www.cc98.org';
const topic = origin + '/topic/6500000';
const favorites = origin + '/usercenter/myfavorites/order/2/group/0/1';
const firstImage = origin + '/fixture/one.png';
const secondImage = origin + '/fixture/two.png';
const viewer = '#cc98-comfort-image-viewer';
const nativeFavorites = '<div class="user-center"><div class="user-center-head"><p>我的收藏</p></div><nav class="user-center-navigation"><a href="/usercenter">个人主页</a><a class="user-center-navigation-active" href="/usercenter/myfavorites/order/2/group/0/1"><span class="center-nav-item">我的收藏</span></a></nav><div class="user-center-router"><div class="user-posts"><div class="user-post-operator"><button id="native-sort">按时间排序</button><select aria-label="收藏分组"><option>默认分组</option></select></div><div class="user-post"><div class="user-post-content"><a id="native-topic-favorite" href="/topic/6500100">原有帖子收藏</a></div></div></div></div></div>';
const nativeTopic = '<section class="topicInfo-info"><h1 id="essay1">收藏图片测试</h1><button class="followTopic">收藏</button></section><div class="reply" data-floor="1"><span class="reply-floor">1</span><a href="/user/id/1234">测试用户</a><div class="reply-content"><div class="substance"><article><p>原图与链接图片</p><img src="/fixture/one.png" alt="图片收藏测试一"><p>第二张</p><a href="https://example.test/source"><img src="/fixture/two.png" alt="图片收藏测试二"></a><p>' + '阅读位置保留。'.repeat(40) + '</p></article></div></div><div class="reply-footer"><button>引用</button></div></div>';
function documentFor(entry, url) {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>收藏图片测试 - CC98论坛</title><link rel="stylesheet" href="/tests/fixtures/native-forum.css">' + entry.css.map(f => '<link rel="stylesheet" href="/' + f + '">').join('') + '</head><body><div id="root"><header class="topBar"><div class="topBarRight"><span class="topBarUserName">测试用户</span></div></header>' + (url.includes('/usercenter/') ? nativeFavorites : nativeTopic) + '</div>' + entry.js.filter(f => /theme-core|interface-style|conversation(?:-core)?\.js|favorite-share|image-favorite|^src\/content\.js$/.test(f)).map(f => '<script src="/' + f + '"></script>').join('') + '</body></html>';
}
const art = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#e0e9d9"/><path d="M0 320 150 100 270 230 390 75 640 320v40H0Z" fill="#4c8278"/><circle cx="495" cy="80" r="33" fill="#cf9c55"/><text x="32" y="335" font-size="22" fill="white" font-family="sans-serif">CC98 / Image favorite fixture</text></svg>';

async function main() {
  await fs.mkdir(out, { recursive: true });
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  const entry = manifest.content_scripts.find(s => s.js.includes('src/content.js'));
  const report = { passed: false, checks: [], errors: [] };
  const records = {
    cc98ComfortSettings: { enabled: true, rebuildUi: true, themeMode: 'light', themeStyle: 'modern', prewarmPostImages: false, previsitFirstPageForTopicImages: false },
    'cc98RebornOpenIdBinding:v1': { bound: true, userId: '1234', userName: '测试用户' }
  };
  const browser = await chromium.launch({ executablePath: await executable(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const favoriteStore = require('../src/image-favorites-store.js').createStore({ chrome: {
    runtime: { id: 'synthetic-extension' }, storage: { local: {
      get(key, callback) { const result = { [key]: records[key] }; callback?.(result); return Promise.resolve(result); },
      set(value, callback) { Object.assign(records, value); callback?.(); return Promise.resolve(); }
    } }
  } });
  await context.exposeBinding('__fixtureMessage', async (_source, message) => {
    if (message.type !== 'CC98_IMAGE_FAVORITES') return { ok: false };
    try { return await favoriteStore.handle(message, { id: 'synthetic-extension', tab: { id: 1 }, frameId: 0, url: topic }); }
    catch (error) { return { ok: false, error: error.message }; }
  });
  await context.exposeBinding('__fixtureStorage', (_source, { operation, keys, values }) => {
    if (operation === 'get') {
      const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : keys ? Object.keys(keys) : Object.keys(records);
      return Object.fromEntries(names.filter(k => k in records).map(k => [k, records[k]]));
    }
    if (operation === 'set') {
      const changes = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { oldValue: records[k], newValue: v }]));
      Object.assign(records, values); return changes;
    }
    return {};
  });
  await context.addInitScript(() => {
    if (!localStorage.getItem('userInfo')) localStorage.setItem('userInfo', JSON.stringify({ id: 1234, name: '测试用户' }));
    const listeners = [];
    window.chrome = {
      runtime: {
        getManifest: () => ({ version: '0.4.3' }), getURL: p => new URL('/' + p, location.origin).href,
        onMessage: { addListener() {} }, sendMessage: (m, callback) => {
          const result = __fixtureMessage(m).then(value => {
            if (value.ok && value.owner && value.items) listeners.forEach(fn => fn({ ['cc98RebornImageFavorites:v1:uid:' + value.owner]: { newValue: value.items } }, 'local'));
            callback?.(value); return value;
          }); return result;
        }
      },
      storage: {
        local: {
          get: (keys, callback) => { const p = __fixtureStorage({ operation: 'get', keys }); p.then(v => callback?.(v)); return p; },
          set: (values, callback) => { const p = __fixtureStorage({ operation: 'set', values }).then(changes => { listeners.forEach(fn => fn(changes, 'local')); callback?.(); }); return p; }
        },
        onChanged: { addListener: fn => listeners.push(fn), removeListener: fn => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); } }
      }
    };
    window.__favoriteFixtureListeners = listeners;
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && route.request().resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: documentFor(entry, url.pathname) });
    if (url.pathname.startsWith('/fixture/') || url.pathname.startsWith('/images/')) return route.fulfill({ contentType: 'image/svg+xml', body: art });
    if (url.origin !== origin) return route.fulfill({ status: 204, body: '' });
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) return route.abort();
    try { return await route.fulfill({ path: file }); } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  const page = await context.newPage(); page.setDefaultTimeout(6500);
  page.on('pageerror', e => report.errors.push(e.message));
  const list = () => page.evaluate(() => CC98RebornImageFavorites.list());
  const shot = name => page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' });
  const changeTheme = (themeStyle, themeMode) => page.evaluate(({ themeStyle, themeMode }) => {
    Object.assign(lastSettings, { themeStyle, themeMode }); CC98RebornThemeCore.apply(document.documentElement, lastSettings); CC98RebornInterfaceStyle.sync(lastSettings);
  }, { themeStyle, themeMode });
  try {
    if (collapseOnly) {
      const sender = { id: 'synthetic-extension', tab: { id: 1 }, frameId: 0, url: topic };
      for (let index = 0; index < 25; index++) {
        await favoriteStore.handle({ type: 'CC98_IMAGE_FAVORITES', owner: '1234', action: 'toggle', item: { url: origin + '/fixture/saved-' + index + '.png', sourceHref: topic, sourceTitle: '收藏图片测试' } }, sender);
      }
      await page.goto(favorites); await list();
      const region = page.locator('.cc98-image-favorites-region');
      const header = region.locator('summary');
      await header.waitFor();
      assert.equal(await region.evaluate(node => node.open), false);
      assert.equal(await region.locator('img').count(), 0, 'collapsed initial mount does not create thumbnails');
      assert.equal(await region.locator('.cc98-image-favorites-count').innerText(), '25');
      assert(await page.locator('#native-topic-favorite').isVisible(), 'native topic favorites remain visible');
      await shot('modern-closed');
      await header.click();
      await page.waitForFunction(() => document.querySelector('.cc98-image-favorites-region').open && document.querySelectorAll('.cc98-image-favorites-card').length === 24);
      await shot('modern-open');
      const first = region.locator('.cc98-image-favorites-card').first();
      await first.locator('.cc98-image-favorites-edit').click();
      await first.locator('.cc98-image-favorites-note-input').fill('未保存的备注草稿');
      await page.evaluate(() => { window.__favoriteDraftNode = document.querySelector('.cc98-image-favorites-note-input'); });
      await header.click();
      assert.equal(await region.evaluate(node => node.open), false);
      await header.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('.cc98-image-favorites-region').open);
      assert.equal(await first.locator('.cc98-image-favorites-note-input').inputValue(), '未保存的备注草稿');
      assert(await page.evaluate(() => window.__favoriteDraftNode === document.querySelector('.cc98-image-favorites-note-input')));
      await first.getByRole('button', { name: '取消', exact: true }).click();
      await page.evaluate(() => { CC98RebornImageFavorites.mount(document.querySelector('.cc98-rebuild-native-user-router')); });
      assert.equal(await region.evaluate(node => node.open), true, 'routine stabilization keeps manual expansion');
      await region.locator('.cc98-image-favorites-pages .is-next').click();
      assert.equal(await region.locator('.cc98-image-favorites-pages span').innerText(), '2 / 2');
      await header.focus(); await page.keyboard.press('Space');
      await page.waitForFunction(() => !document.querySelector('.cc98-image-favorites-region').open);
      await page.evaluate(async url => { await CC98RebornImageFavorites.toggle({ url, sourceHref: location.origin + '/topic/6500000' }); }, origin + '/fixture/new.png');
      assert.equal(await region.evaluate(node => node.open), false, 'storage update does not expand the region');
      assert.equal(await region.locator('.cc98-image-favorites-count').innerText(), '26');
      await header.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('.cc98-image-favorites-region').open);
      assert.equal(await region.locator('.cc98-image-favorites-pages span').innerText(), '2 / 2', 'folding retains pagination');
      await changeTheme('ascii', 'light'); await shot('ascii-open');
      await header.click(); await shot('ascii-closed');
      assert(await page.locator('#native-topic-favorite').isVisible());
      await page.reload(); await list(); await header.waitFor();
      assert.equal(await region.evaluate(node => node.open), false, 'fresh page starts collapsed again');
      assert.equal(await region.locator('img').count(), 0);
      // Clearing a hidden old-account grid also clears its note draft before an account change can reopen it.
      await header.click(); await region.locator('.cc98-image-favorites-card').first().waitFor();
      await header.click();
      await page.evaluate(() => { localStorage.setItem('userInfo', JSON.stringify({ id: 5678, name: '另一测试用户' })); });
      assert.deepEqual(await list(), []);
      assert.equal(await region.locator('img').count(), 0);
      assert.equal(await region.evaluate(node => node.open), false);
      assert.deepEqual(report.errors, []);
      const result = { passed: true, checks: ['Default collapsed with no initial thumbnails', 'Native topic favorites remain visible', 'Mouse and Enter/Space toggle', 'Note draft and page survive folds', 'Storage updates and stabilizers preserve manual fold state', 'Reload starts collapsed; hidden old-account cards cleared'], errors: report.errors };
      await fs.writeFile(path.join(out, 'validation.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); return;
    }
    if (process.argv.includes('--visual-only')) {
      const sender = { id: 'synthetic-extension', tab: { id: 1 }, frameId: 0, url: topic };
      await favoriteStore.handle({ type: 'CC98_IMAGE_FAVORITES', owner: '1234', action: 'toggle', item: { url: firstImage, sourceHref: topic, sourceTitle: '收藏图片测试' } }, sender);
      await favoriteStore.handle({ type: 'CC98_IMAGE_FAVORITES', owner: '1234', action: 'note', url: firstImage, note: '校园剪影 · 下次回复用' }, sender);
      await page.goto(topic); await list();
      await page.locator('#cc98-comfort-app img[alt="图片收藏测试一"]').first().hover();
      await page.locator('.cc98-image-favorite-hover').waitFor(); await shot('modern-hover');
      await page.goto(favorites);
      await page.locator('.cc98-image-favorites-region > summary').click();
      const view = page.locator('.cc98-image-favorites-view'); await view.waitFor();
      const style = await view.evaluate(n => { const s = getComputedStyle(n); return { radius: parseFloat(s.borderTopLeftRadius), border: parseFloat(s.borderTopWidth), width: n.clientWidth, height: n.clientHeight }; });
      assert(style.radius <= 6 && style.border === 0, JSON.stringify(style));
      await shot('modern-favorites'); await changeTheme('ascii', 'light');
      assert.equal(await view.evaluate(n => parseFloat(getComputedStyle(n).borderTopLeftRadius)), 0);
      await shot('ascii-favorites'); assert.deepEqual(report.errors, []);
      await fs.writeFile(path.join(out, 'visual-validation.json'), JSON.stringify({ passed: true, thumbnail: style, errors: report.errors }, null, 2));
      console.log(JSON.stringify({ passed: true, thumbnail: style, checks: ['Updated hover-star color and rectangular modern/ASCII favorite preview'] })); return;
    }
    await page.goto(topic);
    const one = page.locator('#cc98-comfort-app img[alt="图片收藏测试一"]').first();
    await one.waitFor(); await one.hover();
    const hover = page.locator('.cc98-image-favorite-hover');
    await hover.waitFor(); await hover.click();
    await page.waitForFunction(url => CC98RebornImageFavorites.has(url), firstImage);
    assert.equal(await page.locator(viewer).count(), 0, 'hover star does not open viewer');
    assert.equal(page.url(), topic, 'hover star preserves the current document');
    let saved = await list();
    assert.equal(saved.length, 1); assert.equal(saved[0].url, firstImage); assert.equal(saved[0].code, '[img]' + firstImage + '[/img]');
    assert.match(saved[0].sourceHref, /\/topic\/6500000/);
    report.checks.push('Hover star stores image URL, reusable UBB and source without activating the image');
    await shot('modern-hover');

    await one.click(); await page.locator(viewer).waitFor();
    const star = page.locator('.cc98-image-viewer-favorite');
    assert.equal(await star.getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await star.getAttribute('aria-pressed'), 'false');
    await star.click(); await page.waitForFunction(url => CC98RebornImageFavorites.has(url), secondImage);
    assert.equal(await star.getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('ArrowLeft'); assert.equal(await star.getAttribute('aria-pressed'), 'true');
    report.checks.push('Viewer favorite state follows image navigation and shares the same collection');
    for (const [width, style, mode] of [[1280, 'modern', 'light'], [320, 'ascii', 'dark']]) {
      await page.setViewportSize({ width, height: 900 }); await changeTheme(style, mode);
      const bounds = await page.locator(viewer).evaluate(v => [...v.querySelectorAll('.cc98-image-viewer-toolbar button,.cc98-image-viewer-close')].map(n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
      assert(bounds.every(r => r.left >= 0 && r.right <= width && r.top >= 0 && r.bottom <= 900), JSON.stringify(bounds));
      for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) { const a = bounds[i], b = bounds[j]; assert(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1, 'viewer controls do not overlap'); }
      await shot(style + '-viewer-' + width);
    }
    await page.keyboard.press('Escape'); await page.locator(viewer).waitFor({ state: 'detached' });
    await page.waitForTimeout(1300); // Existing viewer restores the prior reading position on a short timer.
    await page.setViewportSize({ width: 1280, height: 900 }); await changeTheme('modern', 'light');
    const two = page.locator('#cc98-comfort-app img[alt="图片收藏测试二"]').first();
    await two.hover(); await hover.click();
    await page.waitForFunction(url => !CC98RebornImageFavorites.has(url), secondImage);
    assert.equal(page.url(), topic); assert.equal(await page.locator('#cc98-image-link-menu').count(), 0);
    report.checks.push('Star on a linked image does not follow its link or open its action menu');

    await page.goto(favorites);
    await page.locator('#cc98-comfort-app .user-center-router.cc98-rebuild-native-user-router').waitFor();
    assert.equal(await page.locator('#native-topic-favorite').count(), 1);
    assert.equal((await list()).length, 1, 'favorite persists across navigation');
    const region = page.locator('.cc98-image-favorites-region');
    await region.locator('summary').click();
    const card = region.locator('[data-favorite-url]').first();
    await card.waitFor();
    await card.locator('.cc98-image-favorites-edit').click();
    await card.locator('.cc98-image-favorites-note-input').fill('校园剪影 · 下次回复用');
    await card.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForFunction(() => CC98RebornImageFavorites.getItems()[0]?.note === '校园剪影 · 下次回复用');
    assert.match(await card.locator('.cc98-image-favorites-source').getAttribute('href'), /\/topic\/6500000/);
    await card.locator('.cc98-image-favorites-view').click();
    await page.locator(viewer).waitFor();
    assert.equal(await page.locator(viewer + ' .cc98-image-viewer-counter').innerText(), '1 / 1');
    assert.equal(await page.locator(viewer + ' .cc98-image-viewer-stage img').getAttribute('src'), firstImage);
    await page.keyboard.press('Escape'); await page.locator(viewer).waitFor({ state: 'detached' });
    await shot('modern-favorites');
    await changeTheme('ascii', 'light'); await shot('ascii-favorites');
    report.checks.push('Existing favorites page retains topic favorites while image favorites support note editing, source links and original viewer');

    await page.evaluate(() => {
      const editor = document.createElement('div'); editor.id = 'fixture-editor'; editor.className = 'cc98-rebuild-message-editor';
      const textarea = document.createElement('textarea'); textarea.id = 'fixture-textarea';
      const anchor = document.createElement('button'); anchor.id = 'fixture-emoji-anchor'; anchor.textContent = '表情';
      editor.append(textarea, anchor); document.querySelector('.cc98-image-favorites-region').append(editor);
      const panel = ensurePrivateMessageEmojiPanel(editor, textarea); panel.hidden = false;
      textarea.value = '前文后文'; textarea.focus(); textarea.setSelectionRange(2, 2);
      positionPrivateMessageEmojiPanel(editor, panel, anchor);
    });
    const picker = page.locator('#fixture-editor .cc98-rebuild-message-emoji-panel');
    assert.equal(await picker.locator('.cc98-rebuild-message-emoji-tab').count(), 7);
    await picker.locator('[data-emoji-key="image-favorites"]').click();
    await picker.locator('[data-image-favorite-url]').waitFor();
    assert.equal(await picker.locator('[data-image-favorite-url]').getAttribute('title'), '校园剪影 · 下次回复用');
    await picker.scrollIntoViewIfNeeded(); await shot('ascii-picker');
    await picker.locator('[data-image-favorite-url]').click();
    assert.equal(await page.locator('#fixture-textarea').inputValue(), '前文[img]' + firstImage + '[/img]后文');
    await page.evaluate(() => { const textarea = document.querySelector('#fixture-textarea'), editor = document.querySelector('#fixture-editor'); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); const panel = ensurePrivateMessageEmojiPanel(editor, textarea); panel.hidden = false; positionPrivateMessageEmojiPanel(editor, panel, document.querySelector('#fixture-emoji-anchor')); });
    await picker.locator('[data-emoji-key="ac"]').click(); await picker.locator('.cc98-rebuild-message-emoji-option').first().click();
    assert.match(await page.locator('#fixture-textarea').inputValue(), /\[ac01\]$/);
    await page.locator('#fixture-editor').evaluate(n => n.remove());
    report.checks.push('Seventh tab inserts a favorited image at the caret; original AC emoji insertion remains intact');

    // Switching the observed web account must not expose another account's collection.
    await page.evaluate(() => { localStorage.setItem('userInfo', JSON.stringify({ id: 5678, name: '另一测试用户' })); });
    assert.deepEqual(await list(), []);
    assert.equal(await region.locator('[data-favorite-url]').count(), 0);
    await page.evaluate(() => { localStorage.setItem('userInfo', JSON.stringify({ id: 1234, name: '测试用户' })); });
    assert.equal((await list())[0].note, '校园剪影 · 下次回复用');
    await card.locator('.cc98-image-favorites-delete').click();
    await page.waitForFunction(() => CC98RebornImageFavorites.getItems().length === 0);
    assert.equal(await region.locator('[data-favorite-url]').count(), 0);
    assert.equal(await page.locator('#native-topic-favorite').count(), 1);
    report.checks.push('Collection is account-scoped and deleting a picture leaves native topic favorites untouched');
    assert.deepEqual(report.errors, []);
    report.passed = true;
    await fs.writeFile(path.join(out, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) {
    await shot('failure').catch(() => {});
    await fs.writeFile(path.join(out, process.argv.includes('--visual-only') ? 'visual-validation.json' : 'validation.json'), JSON.stringify({ ...report, failure: String(error) }, null, 2));
    console.error({ checks: report.checks, errors: report.errors, body: await page.locator('body').innerText().catch(() => '') }); throw error;
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
