const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), origin = 'http://127.0.0.1:8765';
const output = path.join(root, 'outputs/topic-search-preview');
const quote = (floor, text) => `<div style="background-color:#F5FAFF;border:1px solid #ccc;max-height:800px;overflow-y:auto"><b>以下是引用${floor}楼：用户测试的发言：<a href="/topic/100/${Math.ceil(floor / 10)}#${floor}">&gt;&gt;查看原帖&lt;&lt;</a></b><p>${text}</p></div>`;
const reply = (floor, text) => `<div class="reply" data-floor="${floor}"><span class="reply-floor">${floor}</span><a href="/user/id/${floor + 100}">用户${floor}</a><div class="reply-content"><div class="substance"><article>${text}</article></div></div><div class="comment1">发表于 2026-10-14 12:00:00</div></div>`;
function native(number, total) {
  const image = (src, alt = 'AC') => `<img src="${src}" alt="${alt}">`;
  const families = ['/images/CC98/CC9801.gif', '/images/tb/tb01.png', '/images/ms/ms01.png', '/images/em/em01.gif',
    '/images/mahjong/animal2017/001.png', '/images/mahjong/carton2017/018.gif', '/images/mahjong/face2017/004.gif'].map(src => image(src, '')).join('');
  const posts = number === 1 ? reply(1, '<p>Alpha 校园原文</p>') + reply(4, quote(1, 'Alpha 校园原文') + '<p>父层回应</p>' + families)
    : number === 2 ? reply(11, '<p>ALPHA 当前正文</p><p>literal [a+b] &lt;img src=x onerror=alert(1)&gt;</p>' + image('/static/images/ac/01.png') + image('/images/ac/1001.png'))
      + reply(12, quote(1, 'Alpha 校园原文' + image('/images/ac/01.png')) + '<p>正文关键词 beta</p>' + image('/images/ac/02.png'))
      : number === 3 ? reply(21, quote(11, 'ALPHA 当前正文') + '<p>alpha 后台命中</p>' + image('/images/ac1/01.png'))
        + reply(22, '其他内容' + image('/uploads/01.png', '普通照片') + image('/images/%61c/03.png', ''))
        : reply((number - 1) * 10 + 1, `<p>Alpha 第 ${number} 页</p><img data-src="/static/images/ac1/01.png" alt=""><img src="/uploads/unknown.png" alt="[AC04]">`)
          + reply((number - 1) * 10 + 2, '无关内容 [ac05]').replace('<span class="reply-floor">', '<aside class="userMessage">匿名 ABCD1234</aside><span class="reply-floor">');
  return `<section class="topicInfo-info"><h1 id="essay1">本帖全文搜索</h1><button class="followTopic" id="native-favorite">收藏</button></section>${posts}<div class="pagination"><ul class="page-nav">${Array.from({ length: total }, (_, i) => `<li><a href="/topic/100/${i + 1}">${i + 1}</a></li>`).join('')}</ul></div>`;
}
const shim = `<script>window.chrome={runtime:{getURL:p=>location.origin+'/'+p,getManifest:()=>({version:'0.3.7'}),onMessage:{addListener(){}},sendMessage:(m,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(k,c)=>{c?.({});return Promise.resolve({})},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener(){}}}};</script>`;
function shell(body, scripts = '') { return `<!doctype html><html class="cc98-comfort"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${['theme-tokens.css', 'styles.css', 'topic-search.css', 'interface-styles.css'].map(file => `<link rel="stylesheet" href="/src/${file}">`).join('')}<style>.native{position:absolute;left:-10000px;width:900px}#cc98-comfort-app{position:relative!important;padding:20px;min-height:2200px}textarea#draft{position:absolute;top:180px;right:24px} .cc98-rebuild-post{max-width:900px;margin:24px auto}</style></head><body>${body}${scripts}</body></html>`; }
function foreground(number, total) { return shell(`<div class="native">${native(number, total)}</div><main id="cc98-comfort-app"></main><textarea id="draft">保留的草稿</textarea>`, shim
  + ['theme-core.js', 'interface-style.js', 'conversation-core.js', 'conversation.js', 'topic-search.js', 'content.js'].map(file => `<script src="/src/${file}"></script>`).join('')
  + `<script>lastSettings={...DEFAULT_SETTINGS,previsitFirstPageForTopicImages:false,prewarmPostImages:false};scheduleRebuild=()=>{};scheduleSync=()=>{};document.documentElement.removeAttribute('data-cc98-rebuild-transition-veil');window.fixtureItems=getPostItems();window.__favoriteClicks=0;document.querySelector('#native-favorite').onclick=()=>__favoriteClicks++;const app=document.querySelector('#cc98-comfort-app');app.append(renderPostPager());app.querySelectorAll('.cc98-rebuild-pager a').forEach(a=>a.removeAttribute('target'));fixtureItems.forEach(item=>app.append(renderPostCard(item)));bindRebuiltFloorLinks(app);ensureObserver();CC98RebornThemeCore.apply(document.documentElement,lastSettings);</script>`); }

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [], requests = [], contexts = [];
  let mode = 'normal', total = 4, checks = 0;
  try {
    await fs.mkdir(output, { recursive: true });
    async function fresh() {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } }); contexts.push(context);
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        const match = url.pathname.match(/^\/topic\/100(?:\/(\d+))?$/);
        if (match) {
          const number = Number(match[1] || 1), type = route.request().resourceType();
          const mainFrame = type === 'document' && route.request().frame() === page.mainFrame();
          requests.push({ number, type, mainFrame, at: Date.now() });
          if (mode === 'failure' && number === 1 && !mainFrame) return route.fulfill({ status: 403, body: 'Forbidden' });
          if (mainFrame) return route.fulfill({ contentType: 'text/html', body: foreground(number, total) });
          if (number === 3) return route.fulfill({ contentType: 'text/html', body: shell('<div id="root"></div>', `<script>setTimeout(()=>document.querySelector('#root').innerHTML=${JSON.stringify(native(number, total))},40)</script>`) });
          await new Promise(resolve => setTimeout(resolve, 100));
          const body = mode === 'updated' && number === 2 ? native(number, total).replace('[a+b]', 'freshserver') : native(number, total);
          return route.fulfill({ contentType: 'text/html', body: shell(body) }).catch(() => {});
        }
        const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
        if (!file.startsWith(root + path.sep)) return route.abort();
        try { return await route.fulfill({ path: file }); } catch { return route.fulfill({ status: 404, body: 'Not found' }); }
      });
      await page.goto(`${origin}/topic/100/2`);
      await page.locator('.cc98-topic-search-entry').waitFor();
      return page;
    }
    const page = await fresh();
    const entry = page.locator('.cc98-topic-search-entry');
    assert(await entry.evaluate(button => button.nextElementSibling.classList.contains('cc98-rebuild-topic-favorite-action')));
    await entry.click();
    await page.getByLabel('关键词', { exact: true }).fill('alpha');
    const initialRequests = requests.length;
    const initialEntryWidth = await entry.evaluate(button => button.getBoundingClientRect().width);
    await page.getByRole('button', { name: '开始搜索', exact: true }).click();
    assert(await page.locator('.cc98-topic-search-warning').isVisible());
    assert((await page.locator('.cc98-topic-search-warning').innerText()).includes('为防止给服务器造成过大压力，这将需要等待一段时间。'));
    await page.waitForTimeout(250);
    assert.equal(requests.length, initialRequests, 'opening or requesting confirmation must not read background pages');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(requests.length, initialRequests); checks++;
    await page.evaluate(() => { scrollTo(0, 150); window.__postNodes = [...document.querySelectorAll('#cc98-comfort-app .cc98-rebuild-post')]; document.querySelector('#draft').setSelectionRange(2, 4); });
    const position = await page.evaluate(() => scrollY);
    await page.getByRole('button', { name: '开始搜索', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    await page.getByRole('button', { name: '后台搜索', exact: true }).click().catch(async error => {
      console.error({ status: await page.locator('.cc98-topic-search-status').textContent(), error: await page.locator('.cc98-topic-search-error').textContent(), requests, errors });
      throw error;
    });
    assert.equal(await page.locator('.cc98-topic-search-layer').count(), 0);
    assert.equal(await entry.evaluate(button => button.getBoundingClientRect().width), initialEntryWidth, 'background progress must not widen the foreground toolbar');
    // Concurrent conversation reads share the same queue/cache.
    await page.locator('[data-post-floor="11"] .cc98-rebuild-conversation-action').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('.cc98-rebuild-conversation-status')?.textContent.startsWith('查找完成'));
    await page.keyboard.press('Escape');
    await entry.evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('.cc98-topic-search-status')?.textContent.startsWith('搜索完成'));
    const floors = () => page.locator('[data-search-floor]').evaluateAll(nodes => nodes.map(node => Number(node.dataset.searchFloor)));
    assert.deepEqual(await floors(), [1, 4, 11, 12, 21, 31]);
    const fetches = requests.slice(initialRequests).filter(request => request.type === 'fetch');
    assert.deepEqual(fetches.map(request => request.number).sort(), [1, 3, 4], 'search/conversation must read each uncached page once');
    assert(fetches.every((request, i) => !i || request.at - fetches[i - 1].at >= 950), JSON.stringify(fetches));
    assert(requests.some(request => request.number === 3 && request.type === 'document' && !request.mainFrame), 'dynamic pages use a separate rendered document');
    assert.equal(await page.evaluate(() => scrollY), position);
    assert(await page.evaluate(() => __postNodes.every((node, i) => node === document.querySelectorAll('#cc98-comfort-app .cc98-rebuild-post')[i])));
    assert.equal(await page.locator('#draft').inputValue(), '保留的草稿');
    assert.deepEqual(await page.locator('#draft').evaluate(node => [node.selectionStart, node.selectionEnd]), [2, 4]);
    assert.equal(await page.locator('.cc98-topic-search-worker').count(), 0); checks++;
    const result = page.locator('[data-search-floor="31"] a');
    assert.equal(await result.getAttribute('href'), `${origin}/topic/100/4#31`);
    assert.equal(await result.getAttribute('target'), '_blank');
    assert((await page.locator('.cc98-topic-search-snippet mark').first().innerText()).toLowerCase() === 'alpha'); checks++;
    const cachedCount = requests.length;
    await page.getByLabel('包含引用内容', { exact: true }).uncheck();
    await page.getByRole('button', { name: '重新搜索', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    assert.deepEqual(await floors(), [1, 11, 21, 31]);
    assert.equal(requests.length, cachedCount); checks++;
    const search = async (query, quotes = false) => {
      await page.getByLabel('关键词', { exact: true }).fill(query);
      await page.getByLabel('包含引用内容', { exact: true }).setChecked(quotes);
      await page.getByRole('button', { name: '重新搜索', exact: true }).click();
      await page.getByRole('button', { name: '确认开始', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.cc98-topic-search-status')?.textContent.startsWith('搜索完成'));
      assert.equal(requests.length, cachedCount, 'username/emotion searches must reuse the same pages');
      return floors();
    };
    for (const query of ['用户31', 'UID 131', '131']) {
      assert.deepEqual(await search(query), [31]);
      assert((await page.locator('.cc98-topic-search-snippet mark').first().innerText()).toLowerCase() === query.toLowerCase()); checks++;
    }
    assert.deepEqual(await search('匿名 abcd1234'), [32]);
    assert(!(await page.locator('[data-search-floor="32"]').innerText()).includes('UID 132')); checks++;
    assert.deepEqual(await search('UID 132'), [], 'anonymous authors must not expose a hidden account ID'); checks++;
    assert.deepEqual(await search('[AC01]', true), [11, 12, 21, 31]); checks++;
    assert.deepEqual(await search('[ac01]', false), [11, 21, 31], 'quoted emoji follow the quote option; an ordinary 01.png is not an emoji'); checks++;
    for (const [query, expected] of [
      ['[ac02]', [12]], ['[ac03]', [22]], ['[ac04]', [31]], ['[ac05]', [32]], ['[ac1001]', [11]],
      ['[cc9801]', [4]], ['[tb01]', [4]], ['[ms01]', [4]], ['[em01]', [4]], ['[a:001]', [4]], ['[c:018]', [4]], ['[f:004]', [4]]
    ]) {
      assert.deepEqual(await search(query), expected, query);
      assert.equal(await page.locator('.cc98-topic-search-snippet img').count(), 0, 'indexing and snippets stay inert'); checks++;
    }
    await page.getByLabel('关键词', { exact: true }).fill('[a+b]');
    await page.getByRole('button', { name: '重新搜索', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    assert.deepEqual(await floors(), [11]);
    assert.equal(await page.locator('.cc98-topic-search-snippet img').count(), 0);
    assert.equal(requests.length, cachedCount); checks++;
    await page.evaluate(() => { lastSettings.blockedUserIds = '111'; });
    await page.getByRole('button', { name: '重新搜索', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    assert.equal(await page.locator('[data-search-floor="11"] .cc98-topic-search-snippet').count(), 0, 'search must not automatically reveal blocked authors');
    await page.locator('[data-search-floor="11"] .cc98-topic-search-reveal').click();
    assert.equal(await page.locator('[data-search-floor="11"] .cc98-topic-search-snippet').count(), 1);
    await page.evaluate(() => { lastSettings.blockedUserIds = ''; });
    checks++;
    await page.getByLabel('关键词', { exact: true }).fill('alpha');
    await page.getByRole('button', { name: '重新搜索', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    const layouts = [];
    for (const style of ['modern', 'ascii']) for (const tone of ['light', 'dark']) for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 700 : 850 });
      await page.evaluate(({ style, tone }) => { lastSettings.themeStyle = style; lastSettings.themeMode = tone; CC98RebornThemeCore.apply(document.documentElement, lastSettings); CC98RebornInterfaceStyle.sync(lastSettings); }, { style, tone });
      if (style === 'ascii') await page.locator('.cc98-topic-search-dialog > .cc98-ascii-decoration').waitFor({ state: 'attached' });
      const rect = await page.locator('.cc98-topic-search-dialog').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, radius: getComputedStyle(node).borderRadius }; });
      assert(rect.left >= 0 && rect.right <= width && rect.top >= 0 && rect.bottom <= (width === 390 ? 700 : 850), JSON.stringify(rect));
      if (style === 'ascii') assert.equal(rect.radius, '0px');
      else assert.notEqual(rect.radius, '0px');
      await page.screenshot({ path: path.join(output, `${style}-${tone}-${width}.png`) });
      layouts.push({ style, tone, width, ...rect }); checks++;
    }
    mode = 'failure';
    await page.getByRole('button', { name: '刷新内容', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cc98-topic-search-status')?.textContent.startsWith('读取中断'));
    assert((await page.locator('.cc98-topic-search-error').textContent()).includes('403'));
    mode = 'updated';
    await page.getByLabel('关键词', { exact: true }).fill('freshserver');
    await page.getByRole('button', { name: '继续搜索', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cc98-topic-search-status')?.textContent.startsWith('搜索完成')); checks++;
    assert.deepEqual(await floors(), [11], 'retrying a fresh read must fetch updated server content, including the old foreground page');
    checks++;
    const beforeRestore = requests.length;
    await page.evaluate(() => {
      const key = 'cc98RebornTopicSearch:v1', saved = JSON.parse(sessionStorage.getItem(key));
      saved.query = 'freshserver'; sessionStorage.setItem(key, JSON.stringify(saved));
      dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await entry.evaluate(button => button.click());
    assert.equal(await page.getByLabel('关键词', { exact: true }).inputValue(), 'freshserver');
    assert.deepEqual(await floors(), [11], 'reopening a frozen document must not overwrite refreshed text with its old visible snapshot');
    assert.equal(requests.length, beforeRestore); checks++;
    await page.keyboard.press('Escape');
    await page.locator('.cc98-rebuild-topic-favorite-action').evaluate(button => button.click());
    assert.equal(await page.evaluate(() => __favoriteClicks), 1); checks++;

    total = 6;
    mode = 'normal';
    const second = await fresh(), start = requests.length;
    await second.locator('.cc98-topic-search-entry').click();
    await second.getByLabel('关键词', { exact: true }).fill('alpha');
    await second.getByRole('button', { name: '开始搜索', exact: true }).click();
    await second.getByRole('button', { name: '确认开始', exact: true }).click();
    await second.waitForFunction(() => document.querySelector('.cc98-topic-search-status')?.textContent.includes('已读 2/6'));
    await second.getByRole('button', { name: '暂停搜索', exact: true }).click();
    assert((await second.locator('.cc98-topic-search-status').textContent()).startsWith('已暂停'));
    await second.getByRole('button', { name: '继续搜索', exact: true }).click();
    await second.getByRole('button', { name: '确认开始', exact: true }).click();
    await second.getByRole('button', { name: '后台搜索', exact: true }).click();
    await Promise.all([second.waitForURL(`${origin}/topic/100/3`), second.locator('.cc98-rebuild-pager a').filter({ hasText: /^3$/ }).click()]);
    await second.locator('.cc98-topic-search-entry').click();
    await second.waitForFunction(() => document.querySelector('.cc98-topic-search-status')?.textContent.startsWith('搜索完成'));
    assert.equal(await second.getByLabel('关键词', { exact: true }).inputValue(), 'alpha');
    assert((await second.locator('.cc98-topic-search-status').textContent()).includes('已读 6/6'));
    assert.equal(requests.slice(start).filter(request => request.number === 1 && request.type === 'fetch').length, 1, 'pause/pagination must not reread completed pages'); checks++;
    await second.getByRole('button', { name: '刷新内容', exact: true }).click();
    await second.getByRole('button', { name: '确认开始', exact: true }).click();
    await second.waitForFunction(() => document.querySelector('.cc98-topic-search-status')?.textContent.includes('已读 1/6'));
    await second.getByRole('button', { name: '后台搜索', exact: true }).click();
    await second.evaluate(() => history.pushState(null, '', '/topic/200/1'));
    await second.waitForFunction(() => JSON.parse(sessionStorage.getItem('cc98RebornTopicSearch:v1')).phase === 'paused');
    const afterLeaving = requests.length;
    await second.waitForTimeout(1100);
    assert.equal(requests.length, afterLeaving, 'leaving a topic must pause background reads');
    await second.evaluate(() => history.replaceState(null, '', '/topic/100/3'));
    await second.locator('.cc98-topic-search-entry').click();
    await second.getByRole('button', { name: '继续搜索', exact: true }).click();
    await second.getByRole('button', { name: '确认开始', exact: true }).click();
    await second.waitForFunction(() => document.querySelector('.cc98-topic-search-status')?.textContent.startsWith('搜索完成'));
    checks++;
    const beforeAccount = requests.length;
    await second.evaluate(() => { getStoredCc98UserInfo = () => ({ id: 99999 }); });
    await second.waitForFunction(() => !document.querySelector('.cc98-topic-search-layer'));
    await second.locator('.cc98-topic-search-entry').click();
    assert.equal(await second.getByLabel('关键词', { exact: true }).inputValue(), '');
    assert.equal(await second.locator('[data-search-floor]').count(), 0);
    assert.equal(requests.length, beforeAccount); checks++;
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify({ checks, layouts, requests }, null, 2));
    console.log(`topic full-text search: ${checks} groups passed (usernames/UID, anonymous identity, emotion families/lazy sources, quotes, inert snippets, shared cache/queue, confirmation, background work, literal highlights, source/draft/scroll, themes/layout, retry, pagination and account isolation)`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
