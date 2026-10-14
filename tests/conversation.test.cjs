const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "http://127.0.0.1:8765";
const quote = (topic, floor) => `<b>以下是引用${floor}楼：用户测试在2026-10-12 12:00:00的发言：<a href="/topic/${topic}/${Math.ceil(floor / 10)}#${floor % 10 || 10}">&gt;&gt;查看原帖&lt;&lt;</a></b><p>被引用的内容</p>`;
const ubb = (...headers) => `<div style="background-color:#F5FAFF;border:1px solid rgb(204,204,204);max-height:800px;overflow-y:auto">${headers.map(([topic, floor]) => `<div style="padding:10px 0">${quote(topic, floor)}</div>`).join("")}</div>`;
const reply = (floor, body, topic = 100) => `<div class="reply" id="post-${floor}" data-floor="${floor}"><div class="reply-floor">#${floor}</div><a href="/user/id/${floor + 100}"><img class="avatar" src="/assets/icon32.png">用户${floor}</a><div class="reply-content"><div class="substance"><article>${body}</article></div></div><div class="comment1">发表于 2026-10-12 12:00:00</div></div>`;
const pager = (topic, total) => `<div class="pagination"><ul class="page-nav">${Array.from({ length: total }, (_, i) => `<li><a href="/topic/${topic}/${i + 1}#1">${i + 1}</a></li>`).join("")}</ul></div>`;
const native = (topic, page) => {
  if (topic === 200) return reply(1, "跨帖的最早原文", 200) + reply(2, ubb([200, 1]) + "跨帖上游", 200) + pager(200, 1);
  if (page === 1) return reply(1, "<strong>最早原文</strong>") + reply(4, ubb([100, 1]) + ubb([200, 2]) + "第四楼回复") + reply(8, ubb([100, 4]) + "不应混入的旁支") + pager(100, 3);
  if (page === 2) return reply(11, "无关内容") + reply(12, ubb([100, 1], [100, 4]) + "<p>当前回复 <strong>加粗</strong><img src='/static/images/ac/01.png' alt='测试表情'></p><img src='/fixture/photo-test.png' alt='测试图片' onerror='window.bad=true'>") + pager(100, 3);
  return reply(21, '<div class="markdown-body"><blockquote><p><strong>以下是引用12楼：用户测试在2026-10-12 12:00:00的发言：</strong></p><blockquote><strong>以下是引用4楼：用户测试在2026-10-12 12:00:00的发言：</strong></blockquote></blockquote><p>Markdown 下游一</p><div class="lazy-fixture" style="height:1000px"></div></div>')
    + reply(22, ubb([100, 12]) + "下游二") + reply(23, ubb([100, 12], [100, 22]) + "第二级下游") + reply(24, "只是文字：以下是引用12楼，不应识别") + pager(100, 3);
};
const shim = `<script>window.chrome={runtime:{getURL:p=>location.origin+'/'+p,getManifest:()=>({version:'0.3.5.2'}),onMessage:{addListener(){}},sendMessage:(m,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(k,c)=>{c?.({});return Promise.resolve({})},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener(){}}}};</script>`;
const shell = (body, scripts = "") => `<!doctype html><html lang="zh-CN" class="cc98-comfort" data-cc98-comfort-theme="soft" data-cc98-comfort-tone="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/theme-tokens.css"><link rel="stylesheet" href="/src/styles.css"><style>body{padding:24px;margin:0}.native{position:absolute;left:-10000px;width:900px}#cc98-comfort-app{position:relative!important;min-height:1800px;display:grid;gap:20px}.cc98-rebuild-post{margin:0 auto;width:min(800px,100%)}:root{--cc98-comfort-bg:#f4f6f5;--cc98-comfort-surface:#fff;--cc98-comfort-surface-2:#f0f4f2;--cc98-comfort-text:#24302d;--cc98-comfort-muted:#66736f;--cc98-comfort-border:#d7e0dc;--cc98-comfort-accent:#1f6f66;--cc98-comfort-font-body:'Segoe UI',sans-serif}</style></head><body>${body}${scripts}</body></html>`;
const foregroundPage = (topic, page) => shell(`<div class="native">${native(topic, page)}</div><main id="cc98-comfort-app"></main><textarea id="draft">保留未提交回复</textarea>`, shim
  + ["theme-core.js", "conversation-core.js", "conversation.js", "content.js"].map((file) => `<script src="/src/${file}"></script>`).join("")
  + `<script>lastSettings={...DEFAULT_SETTINGS,previsitFirstPageForTopicImages:false};scheduleRebuild=()=>{};scheduleSync=()=>{};document.documentElement.removeAttribute('data-cc98-rebuild-transition-veil');window.fixtureItems=getPostItems();window.__conversationDocumentId=Math.random();const app=document.querySelector('#cc98-comfort-app');app.append(renderPostPager());app.querySelectorAll(".cc98-rebuild-pager a").forEach(link=>link.removeAttribute("target"));fixtureItems.forEach(item=>app.append(renderPostCard(item)));bindRebuiltFloorLinks(app);ensureObserver();</script>`);
const foreground = foregroundPage(100, 2);

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const output = path.join(root, "outputs", "conversation-preview");
  await fs.mkdir(output, { recursive: true });
  try {
    let mode = "normal";
    const requests = [];
    const insecureAvatars = [];
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    await page.addInitScript(() => {
      const reset = sessionStorage.getItem('__conversationFixtureReset');
      if (reset) {
        sessionStorage.removeItem('cc98RebornConversationCache:v1');
        if (reset === 'corrupt') sessionStorage.setItem('cc98RebornConversationCache:v1', '{broken json');
        sessionStorage.removeItem('__conversationFixtureReset');
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'www.cc98.org' && /^\/static\/images\/default_avatar_(boy|girl)\.png$/.test(url.pathname)) {
        if (url.protocol !== 'https:') insecureAvatars.push(url.href);
        return route.fulfill({ path: path.join(root, 'assets/icon32.png') });
      }
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/fixture/photo-test.png') return route.fulfill({ path: path.join(root, 'assets/icon128.png') });
      const match = url.pathname.match(/^\/topic\/(100|200)(?:\/(\d+))?$/);
      if (match) {
        const topic = Number(match[1]), number = Number(match[2] || 1);
        const foregroundNavigation = route.request().resourceType() === 'document' && route.request().frame() === page.mainFrame();
        requests.push({ topic, number, type: route.request().resourceType(), foregroundNavigation });
        if (mode === 'long' && topic === 100) {
          const body = number === 2 ? foreground.replace(pager(100, 3), pager(100, 40))
            : number === 1 ? shell(native(100, 1).replace(pager(100, 3), pager(100, 40)))
              : shell(reply((number - 1) * 10 + 1, ubb([100, 12]) + `第 ${number} 页回复`) + pager(100, 40));
          return route.fulfill({ contentType: 'text/html', body });
        }
        if (topic === 100 && number === 2) return route.fulfill({ contentType: "text/html", body: mode === "updated" && route.request().resourceType() === "fetch"
          ? shell(native(100, 2).replace('当前回复', '后台刷新的正文') + reply(13, ubb([100, 12]) + "刷新发现的同页新回复")) : foreground });
        if (foregroundNavigation) return route.fulfill({ contentType: 'text/html', body: foregroundPage(topic, number) });
        if (mode === "failure" && topic === 100 && number === 3) return route.fulfill({ status: 403, body: "Forbidden" });
        if (mode === "slow" && topic === 100 && number === 1) await new Promise((resolve) => setTimeout(resolve, 900));
        // Page three is a dynamic app shell: fetch alone contains no floors.
        const content = topic === 100 && number === 3
          ? shell("<div id='root'></div>", `<script>setTimeout(()=>{document.querySelector('#root').innerHTML=${JSON.stringify(native(topic, number))}},40);addEventListener('scroll',()=>{const slot=document.querySelector('.lazy-fixture');if(slot&&scrollY>100){slot.innerHTML='<img src="/fixture/photo-test.png" alt="跨页懒加载图片">';slot.style.height='auto'}})</script>`)
          : shell(native(topic, number));
        return route.fulfill({ contentType: "text/html", body: content }).catch(() => {});
      }
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try { return await route.fulfill({ path: file }); }
      catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    await page.goto(`${origin}/topic/100/2`);
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').waitFor().catch(async (error) => {
      console.error({ errors, state: await page.evaluate(() => ({ items: window.fixtureItems?.map((item) => ({ floor: item.index, id: item.id })), text: document.body.innerText.slice(0,1500), app: document.querySelector('#cc98-comfort-app')?.innerHTML.slice(0,1500) })) });
      throw error;
    });
    const original = await page.evaluate(() => ({ href: location.href, html: [...document.querySelectorAll('#cc98-comfort-app > .cc98-rebuild-post')].map(node => node.outerHTML).join(''), pageNumber: document.querySelector('.cc98-rebuild-page-jump input').value, draft: document.querySelector("#draft").value }));
    const mainAvatar = await page.evaluate(() => {
      const item = fixtureItems.find((item) => item.index === 12);
      const card = renderPostCard({ ...item, index: 99, avatar: 'http://www.cc98.org/static/images/default_avatar_boy.png', content: item.content.cloneNode(true) });
      return card.querySelector('img.cc98-rebuild-avatar').src;
    });
    assert.equal(mainAvatar, 'https://www.cc98.org/static/images/default_avatar_boy.png');
    await page.evaluate(() => { fixtureItems.find((item) => item.index === 12).avatar = 'http://www.cc98.org/static/images/default_avatar_girl.png'; });
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    const beforeScroll = await page.evaluate(() => window.scrollY);
    assert.equal(await page.locator('[data-conversation-key="100:12"] .cc98-rebuild-conversation-author img').getAttribute('src'), 'https://www.cc98.org/static/images/default_avatar_girl.png');
    await page.waitForFunction(() => document.querySelector(".cc98-rebuild-conversation-status")?.textContent.startsWith("查找完成"));
    const keys = await page.locator(".cc98-rebuild-conversation-post").evaluateAll((nodes) => nodes.map((node) => node.dataset.conversationKey));
    assert.deepEqual(new Set(keys), new Set(["100:1", "100:4", "200:1", "200:2", "100:12", "100:21", "100:22", "100:23"]));
    assert(requests.some((request) => request.number === 3 && request.type === "document"), "dynamic content must be read in a separate frame");
    assert.equal(await page.locator(".cc98-rebuild-conversation-probe").count(), 0);
    assert.equal(await page.locator('.cc98-rebuild-conversation-post[data-conversation-key="100:23"]').getAttribute("data-relation"), "downstream");
    assert((await page.locator('.cc98-rebuild-conversation-post[data-conversation-key="100:23"]').innerText()).includes("第 2 级"));
    assert.equal(await page.locator('.cc98-rebuild-conversation-post[data-conversation-key="100:12"] .cc98-rebuild-conversation-body strong').last().innerText(), "加粗");
    assert.equal(await page.locator(".cc98-rebuild-conversation-feed [onerror]").count(), 0);
    assert.equal(await page.locator(".cc98-rebuild-conversation-feed [id]").count(), 0);
    assert.equal(await page.locator(".cc98-rebuild-conversation-feed .cc98-rebuild-conversation-quote[open]").count(), 0);
    const hierarchy = await page.locator(".cc98-rebuild-conversation-branch").evaluateAll((nodes) => nodes.map((node) => ({ key: node.dataset.branchKey, parent: node.dataset.parentKey, depth: Number(node.dataset.depth), own: Boolean(node.querySelector(':scope > .cc98-rebuild-conversation-post')) })));
    assert.equal(hierarchy.find((node) => node.key === "100:12" && node.own).parent, "100:4");
    assert.equal(hierarchy.find((node) => node.key === "100:23" && node.own).parent, "100:22");
    assert.equal(hierarchy.find((node) => node.key === "100:23" && node.own).depth, 4);
    const indentation = await page.locator('[data-conversation-key="100:23"]').evaluate((node) => ({ child: node.getBoundingClientRect().left, parent: node.closest('.cc98-rebuild-conversation-children').previousElementSibling.getBoundingClientRect().left }));
    assert(indentation.child > indentation.parent, "each reply level is indented beneath its actual parent");
    const seedMedia = page.locator('[data-conversation-key="100:12"] .cc98-rebuild-conversation-body');
    assert.equal(await seedMedia.locator('img[alt="测试图片"]').count(), 1);
    const normalImages = await seedMedia.locator('img').evaluateAll((nodes) => nodes.filter((img) => img.src.includes('/fixture/photo-test.png')).map((img) => ({ src: img.src, alt: img.alt, class: img.className })));
    assert.equal(normalImages.length, 1, JSON.stringify(normalImages));
    await seedMedia.locator('img[alt="测试表情"]').evaluate((img) => { img.loading = "eager"; return img.decode(); });
    await seedMedia.locator('img[alt="测试图片"]').evaluate((img) => { img.loading = "eager"; return img.decode(); });
    const emoji = await seedMedia.locator('img[alt="测试表情"]').evaluate((img) => ({ width: img.naturalWidth, display: getComputedStyle(img).display, height: img.getBoundingClientRect().height, src: img.src }));
    assert(emoji.width > 0 && emoji.height > 10 && emoji.height < 64 && emoji.display === "inline-block");
    assert(emoji.src.includes('/images/ac/01.png'));
    await page.locator('[data-conversation-key="100:21"] img[alt="跨页懒加载图片"]').evaluate((img) => { img.loading = "eager"; return img.decode(); });
    assert(await seedMedia.locator('img[alt="测试图片"]').evaluate((img) => img.naturalWidth > 0 && img.getBoundingClientRect().width > 0));
    await seedMedia.locator('img[alt="测试图片"]').click();
    await page.locator('#cc98-comfort-image-viewer').waitFor({ timeout: 3000 }).catch(async (error) => {
      console.error({ errors, images: await seedMedia.locator('img').evaluateAll((nodes) => nodes.map((img) => ({ src: img.src, class: img.className, candidate: isImageViewerCandidate(img), parent: img.parentElement.tagName }))), viewer: await page.locator('#cc98-comfort-image-viewer').count() });
      throw error;
    });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#cc98-comfort-image-viewer').count(), 0);
    assert.equal(await page.getByRole('dialog').count(), 1, "closing the image viewer must retain the conversation dialog");
    await page.getByRole("button", { name: "下游回复", exact: true }).click();
    assert.equal(await page.locator('.cc98-rebuild-conversation-post[data-relation="upstream"]').count(), 0);
    await page.getByRole("button", { name: "全部", exact: true }).click();
    const seedBody = page.locator('.cc98-rebuild-conversation-post[data-conversation-key="100:12"]');
    await seedBody.getByText("引用原文", { exact: true }).click();
    await seedBody.getByRole("link", { name: ">>查看原帖<<", exact: true }).last().click();
    assert.equal(page.url(), original.href, "following a quote in the dialog must not navigate the foreground");
    assert.equal(await page.getByRole("dialog").count(), 1);
    await page.locator('[data-conversation-key="100:4"]').getByRole("button", { name: "以此楼为中心", exact: true }).click();
    assert.equal(await page.locator('[data-conversation-key="100:8"]').count(), 1, "recentering can reveal the other reply branch");
    await page.locator('[data-conversation-key="100:12"]').getByRole("button", { name: "以此楼为中心", exact: true }).click();
    await page.locator('.cc98-rebuild-conversation-scroll').evaluate((node) => { node.scrollTo({ top: 0, behavior: 'instant' }); });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(output, "conversation-light.png") });
    await page.evaluate(() => {
      document.documentElement.dataset.cc98ComfortTheme = "night";
      document.documentElement.dataset.cc98ComfortTone = "dark";
      document.querySelectorAll('.cc98-rebuild-conversation-body').forEach(stabilizeEmojiRendering);
    });
    await seedMedia.locator('img[alt="测试表情"]').evaluate((img) => { img.loading = "eager"; return img.decode(); });
    assert((await seedMedia.locator('img[alt="测试表情"]').getAttribute('src')).includes('/images/ac1/01.png'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, "conversation-mobile-dark.png") });
    assert(await page.getByRole("dialog").evaluate((node) => node.getBoundingClientRect().right <= innerWidth));
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    // Simulate genuine extension URLs. The local HTTP shim can load the
    // image pixels; this independent assertion guards URL preservation.
    await page.evaluate(() => {
      chrome.runtime.getURL = (p) => 'chrome-extension://conversation-test/' + p;
      fixtureItems.find((item) => item.index === 12).content.insertAdjacentHTML('beforeend', '<img src="chrome-extension://conversation-test/images/ac/02.png" alt="本地扩展表情">');
    });
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    assert((await page.locator('[data-conversation-key="100:12"] img[alt="本地扩展表情"]').getAttribute('src')).startsWith('chrome-extension://conversation-test/images/'));
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      chrome.runtime.getURL = (p) => location.origin + '/' + p;
      fixtureItems.find((item) => item.index === 12).content.querySelector('[alt="本地扩展表情"]').remove();
    });
    const after = await page.evaluate(() => ({ href: location.href, html: [...document.querySelectorAll('#cc98-comfort-app > .cc98-rebuild-post')].map(node => node.outerHTML).join(''), pageNumber: document.querySelector('.cc98-rebuild-page-jump input').value, draft: document.querySelector("#draft").value, scroll: window.scrollY }));
    assert.equal(after.href, original.href);
    assert.equal(after.html, original.html);
    assert.equal(after.pageNumber, original.pageNumber);
    assert.equal(after.draft, original.draft);
    // Resize can clamp the foreground scroll, so test precise preservation
    // with a second open/close at a fixed viewport.
    await page.setViewportSize({ width: 1180, height: 900 });
    const requestCount = requests.length;
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    const stableScroll = await page.evaluate(() => scrollY);
    await page.waitForFunction(() => document.querySelector(".cc98-rebuild-conversation-status")?.textContent.startsWith("查找完成"));
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => scrollY), stableScroll);
    assert.equal(requests.length, requestCount, "cached pages should not be refetched on reopening");

    // A different conversation immediately sees all saved topic pages, even
    // well past the old two-minute TTL; no sequential cache replay is needed.
    const otherConversation = await page.evaluate(() => {
      const originalNow = Date.now.bind(Date);
      Date.now = () => originalNow() + 10 * 60 * 1000;
      CC98RebornConversation.open(fixtureItems.find((item) => item.index === 11));
      return { status: document.querySelector('.cc98-rebuild-conversation-status').textContent,
        keys: [...document.querySelectorAll('.cc98-rebuild-conversation-post')].map((node) => node.dataset.conversationKey) };
    });
    assert(otherConversation.status.startsWith('查找完成') && otherConversation.status.includes('本帖 3/3 页'), otherConversation.status);
    assert(otherConversation.status.includes('复用缓存'));
    assert.deepEqual(otherConversation.keys, ['100:11']);
    await page.waitForTimeout(100);
    assert.equal(requests.length, requestCount, 'switching floors must not scan or refetch cached topic pages');
    await page.keyboard.press('Escape');
    const reopened = await page.evaluate(() => {
      CC98RebornConversation.open(fixtureItems.find((item) => item.index === 12));
      return document.querySelector('.cc98-rebuild-conversation-status').textContent;
    });
    assert(reopened.startsWith('查找完成'), reopened);
    assert.equal(requests.length, requestCount, 'cached cross-topic ancestors must also be restored immediately');

    // Real pagination replaces the whole document. Cached topic pages and
    // cross-topic ancestors must survive, with no fetch or probe rescanning.
    await page.keyboard.press('Escape');
    let cacheNavigationChecks = 0;
    async function flipCachedPage(number, floor) {
      const previousDocument = await page.evaluate(() => __conversationDocumentId);
      const start = requests.length;
      await Promise.all([
        page.waitForURL(`${origin}/topic/100/${number}`),
        page.locator('.cc98-rebuild-pager a').filter({ hasText: new RegExp(`^${number}$`) }).click()
      ]);
      await page.locator(`[data-post-floor="${floor}"] .cc98-rebuild-conversation-action`).waitFor();
      assert.notEqual(await page.evaluate(() => __conversationDocumentId), previousDocument, 'pagination must replace the document, not just fake an SPA route');
      await page.locator(`[data-post-floor="${floor}"] .cc98-rebuild-conversation-action`).click();
      const status = await page.locator('.cc98-rebuild-conversation-status').textContent();
      assert(status.startsWith('查找完成') && status.includes('本帖 3/3 页') && status.includes('复用缓存'), status);
      await page.waitForTimeout(100);
      assert.deepEqual(requests.slice(start).filter(request => !request.foregroundNavigation), [], 'same-topic pagination must not reread cached pages or cross-topic ancestors');
      assert.equal(await page.locator('.cc98-rebuild-conversation-probe').count(), 0);
      cacheNavigationChecks++;
      await page.keyboard.press('Escape');
    }
    await flipCachedPage(1, 4);
    await flipCachedPage(3, 22);
    const beforeBack = requests.length;
    await page.goBack();
    await page.locator('[data-post-floor="4"] .cc98-rebuild-conversation-action').click();
    assert((await page.locator('.cc98-rebuild-conversation-status').textContent()).startsWith('查找完成'));
    assert.deepEqual(requests.slice(beforeBack).filter(request => !request.foregroundNavigation), [], 'browser Back must retain the tab cache');
    cacheNavigationChecks++;
    await page.keyboard.press('Escape');
    await flipCachedPage(3, 22);
    const beforeReload = requests.length;
    await page.reload();
    await page.locator('[data-post-floor="22"] .cc98-rebuild-conversation-action').click();
    assert((await page.locator('.cc98-rebuild-conversation-status').textContent()).startsWith('查找完成'));
    assert.deepEqual(requests.slice(beforeReload).filter(request => !request.foregroundNavigation), [], 'a full reload must retain the same tab cache too');
    cacheNavigationChecks++;
    await page.keyboard.press('Escape');
    await flipCachedPage(2, 12);

    mode = 'updated';
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    await page.getByRole('button', { name: '刷新对话', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cc98-rebuild-conversation-status')?.textContent.startsWith('查找完成'));
    assert.equal(await page.locator('[data-conversation-key="100:13"]').count(), 1, 'explicit refresh must read the current page for new replies');
    assert((await page.locator('[data-conversation-key="100:12"]').innerText()).includes('后台刷新的正文'));
    const refreshedCount = requests.length;
    await page.keyboard.press('Escape');
    await page.locator('[data-post-floor="11"] .cc98-rebuild-conversation-action').click();
    await page.keyboard.press('Escape');
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    assert.equal(await page.locator('[data-conversation-key="100:13"]').count(), 1, 'a stale foreground snapshot must not replace refreshed cached content');
    assert((await page.locator('[data-conversation-key="100:12"]').innerText()).includes('后台刷新的正文'), 'changing the seed must not restore old foreground text');
    assert((await page.locator('.cc98-rebuild-conversation-status').innerText()).startsWith('查找完成'));
    assert.equal(requests.length, refreshedCount);
    await page.keyboard.press('Escape');
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    assert((await page.locator('[data-conversation-key="100:12"]').innerText()).includes('后台刷新的正文'), 'restoring a frozen document must load the newer snapshot');
    assert.equal(requests.length, refreshedCount);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { getStoredCc98UserInfo = () => ({ id: 99999 }); });
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    await page.waitForFunction(() => document.querySelector('.cc98-rebuild-conversation-status')?.textContent.startsWith('查找完成'));
    assert(requests.length > refreshedCount, 'a new account must not reuse previous account pages');
    await page.keyboard.press('Escape');

    mode = "failure";
    await page.evaluate(() => sessionStorage.setItem('__conversationFixtureReset', 'corrupt'));
    await page.reload();
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    await page.waitForFunction(() => document.querySelector(".cc98-rebuild-conversation-status")?.textContent.includes("1 页读取失败"));
    assert(!(await page.locator(".cc98-rebuild-conversation-status").innerText()).startsWith("查找完成"));
    mode = "normal";
    await page.getByRole("button", { name: "重试未读取页", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".cc98-rebuild-conversation-status")?.textContent.startsWith("查找完成"));
    await page.keyboard.press("Escape");

    await page.evaluate((html) => {
      const item = fixtureItems.find((item) => item.index === 12);
      item.content.insertAdjacentHTML("afterbegin", html);
    }, ubb([100, 6]));
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    await page.waitForFunction(() => document.querySelector(".cc98-rebuild-conversation-status")?.textContent.includes("1 个原楼层未读取"));
    assert.equal(await page.locator('[data-conversation-key="100:6"]').count(), 1);
    assert(!(await page.locator(".cc98-rebuild-conversation-status").innerText()).startsWith("查找完成"));
    await page.keyboard.press("Escape");

    mode = "slow";
    await page.evaluate(() => sessionStorage.setItem('__conversationFixtureReset', '1'));
    await page.reload();
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    await page.getByRole("button", { name: "停止查找", exact: true }).click();
    await page.getByRole("button", { name: "继续查找", exact: true }).waitFor();
    await page.getByRole("button", { name: "继续查找", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.locator(".cc98-rebuild-conversation-probe").count(), 0);

    mode = 'long';
    await page.evaluate(() => sessionStorage.setItem('__conversationFixtureReset', '1'));
    await page.reload();
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').waitFor();
    // The main UI independently prefetches page 1 to identify the original
    // poster. Count requests from the conversation action onward only.
    const longStart = requests.length;
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    await page.getByRole('button', { name: '继续查找', exact: true }).waitFor({ timeout: 40000 });
    await page.keyboard.press('Escape');
    await page.reload();
    await page.locator('[data-post-floor="11"] .cc98-rebuild-conversation-action').click();
    await page.waitForFunction(() => document.querySelector('.cc98-rebuild-conversation-status')?.textContent.startsWith('查找完成'), null, { timeout: 20000 });
    const longRequests = requests.slice(longStart).filter((request) => request.topic === 100 && !request.foregroundNavigation);
    assert.equal(new Set(longRequests.map((request) => request.number)).size, 39);
    assert.equal(longRequests.length, 39, `reopening a partial scan must fetch only its unread pages: ${JSON.stringify(longRequests)}`);
    assert(!longRequests.some((request) => request.number === 2), 'the visible page must be read from the foreground snapshot');
    await page.keyboard.press('Escape');
    const completeLongCount = requests.length;
    const longStatus = await page.evaluate(() => {
      CC98RebornConversation.open(fixtureItems.find((item) => item.index === 12));
      return document.querySelector('.cc98-rebuild-conversation-status').textContent;
    });
    assert(longStatus.startsWith('查找完成') && longStatus.includes('本帖 40/40 页'), longStatus);
    assert.equal(requests.length, completeLongCount, 'cache hits must bypass the 30-page network batch limit');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    assert.deepEqual(insecureAvatars, [], 'generated avatars must request HTTPS without waiting for browser auto-upgrade');
    console.log(`conversation tab cache: ${cacheNavigationChecks} full-document pagination/reload checks, partial scan recovery across reload, explicit refresh, account isolation and corrupt snapshot recovery passed`);
    console.log("conversation browser: cross-page and cross-topic chains, flattened UBB, Markdown, branches, foreground preservation, cache, retry, stop/close and responsive layout passed");
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
