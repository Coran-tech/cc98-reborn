const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const popupOrigin = "http://127.0.0.1:8765";
const key = "cc98ComfortSettings";
const output = path.join(root, "outputs/ascii-style-preview");

async function main() {
  let stored = { enabled: true, themeMode: "light", themePalette: "teal", previsitFirstPageForTopicImages: false, prewarmPostImages: false };
  const pages = [], errors = [];
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, timezoneId: "Asia/Shanghai" });
  let checks = 0;
  const layouts = [];
  try {
    await fs.mkdir(output, { recursive: true });
    async function broadcast(previous) {
      for (const page of pages) if (!page.isClosed()) await page.evaluate(({ key, previous, next }) => {
        __styleListeners.forEach(listener => listener({ [key]: { oldValue: previous, newValue: next } }, "local"));
      }, { key, previous, next: stored });
    }
    async function patch(patch) {
      const previous = structuredClone(stored); stored = { ...stored, ...patch }; await broadcast(previous);
    }
    await context.exposeBinding("__styleStorage", async (_source, { operation, values }) => {
      if (operation === "get") return { [key]: stored, "cc98RebornOpenIdBinding:v1": { bound: true, userId: 1001, userName: "测试用户", boundAt: Date.now() } };
      const previous = structuredClone(stored);
      if (values[key]) stored = structuredClone(values[key]);
      await broadcast(previous);
      return null;
    });
    await context.addInitScript(() => {
      window.__styleListeners = [];
      window.chrome = { runtime: { getManifest: () => ({ version: "0.3.6" }), getURL: file => new URL(`/${file}`, location.origin).href, onMessage: { addListener() {} }, sendMessage(_message, callback) { callback?.({ ok: false }); return Promise.resolve({ ok: false }); } },
        tabs: { query(_query, callback) { callback?.([]); }, create() {} },
        storage: { local: {}, onChanged: { addListener(listener) { __styleListeners.push(listener); }, removeListener(listener) { __styleListeners = __styleListeners.filter(item => item !== listener); } } } };
      for (const operation of ["get", "set"]) chrome.storage.local[operation] = (values, callback) => {
        const promise = __styleStorage({ operation, values }); if (callback) { promise.then(callback); return; } return promise;
      };
      chrome.storage.local.remove = (_keys, callback) => { callback?.(); return Promise.resolve(); };
    });
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (![origin, popupOrigin].includes(url.origin)) return route.abort();
      if (url.pathname.startsWith("/fixture/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="160"><rect width="600" height="160" fill="#7b9883"/><text x="300" y="90" fill="white" font-size="28" text-anchor="middle">CC98 / campus notes</text></svg>' });
      const file = /^\/topic\/100/.test(url.pathname) ? path.join(root, "tests/ascii-style.html") : path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try {
        if (file.endsWith('ascii-style.html')) return route.fulfill({ contentType: 'text/html', body: (await fs.readFile(file, 'utf8')).replace(/>\s+</g, '><') });
        return await route.fulfill({ path: file });
      } catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    const forum = await context.newPage(); pages.push(forum); forum.on("pageerror", error => errors.push(error.message));
    await forum.goto(`${origin}/topic/100/1`);
    const post = forum.locator('#cc98-comfort-app [data-post-floor="1"]');
    await post.waitFor();
    if (!process.argv.includes('--views-only')) {
    await forum.waitForTimeout(4500);
    assert.equal(await forum.locator(".cc98-ascii-decoration").count(), 0);
    const original = await post.evaluate(node => ({ radius: getComputedStyle(node).borderRadius, html: node.innerHTML }));
    await forum.evaluate(() => {
      window.__stylePost = document.querySelector('#cc98-comfort-app [data-post-floor="1"]');
      window.__styleDraft = document.querySelector('#ascii-draft');
      __styleDraft.value = "新的草稿，需要保持光标。";
      __styleDraft.focus(); __styleDraft.setSelectionRange(3, 7);
      window.__styleSelection = [__styleDraft.selectionStart, __styleDraft.selectionEnd];
      window.__styleRenderEvents = [];
      window.__styleScheduleEvents = [];
      const schedule = scheduleRebuild;
      scheduleRebuild = function (...args) { __styleScheduleEvents.push({ style: lastSettings?.themeStyle, stack: new Error().stack }); return schedule(...args); };
      const render = renderRebuiltUi;
      renderRebuiltUi = function (...args) { __styleRenderEvents.push(new Error().stack); return render(...args); };
    });
    checks++;
    // Metadata keeps its original values without extension-added emoji.
    const metadata = await forum.evaluate(() => {
      const raw = parseTopicMetaText('今天 08:20:11 3.2万 最后回复: Eilitania');
      const topic = document.createElement('div');
      topic.innerHTML = '<div class="focus-topic-info"><span>今天 08:20:11</span><span>3.2万</span><span>最后回复: <a href="/user/id/200">Eilitania</a></span></div>';
      const structured = parseStructuredTopicMeta(topic);
      const reply = parseTopicMetaText('32000 12 最后回复: 阅读伙伴 今天 08:20:11');
      return { raw: raw.hoverMeta, structured: structured.hoverMeta, reply: reply.hoverMeta, count: raw.viewCount, user: raw.lastReplyUser };
    });
    assert.equal(metadata.raw, '时间: 今天 08:20:11 浏览数: 3.2万 最后回复: Eilitania');
    assert.equal(metadata.structured, metadata.raw);
    assert.doesNotMatch(metadata.reply, /⏰|👁|💬|\uFE0F/);
    assert.equal(metadata.count, '3.2万'); assert.equal(metadata.user, 'Eilitania');
    checks++;
    const popup = await context.newPage(); pages.push(popup); popup.on("pageerror", error => errors.push(error.message));
    await popup.setViewportSize({ width: 360, height: 760 });
    await popup.goto(`${popupOrigin}/popup/popup.html`);
    await popup.locator('input[name="themeStyle"][value="modern"]').waitFor({ state: "attached" });
    assert(await popup.locator('input[name="themeStyle"][value="modern"]').isChecked());
    await popup.locator('input[name="themeStyle"][value="ascii"]').locator("..").click();
    await forum.waitForFunction(() => document.documentElement.dataset.cc98ComfortStyle === "ascii" && document.querySelector('[data-post-floor="1"] .cc98-ascii-decoration'));
    assert.equal(stored.themeStyle, "ascii");
    assert.equal(stored.themeMode, "light");
    assert.equal(stored.themePalette, "teal");
    const retained = await forum.evaluate(() => ({ post: __stylePost === document.querySelector('#cc98-comfort-app [data-post-floor="1"]'), draft: __styleDraft === document.querySelector('#ascii-draft'), value: __styleDraft.value, selection: [__styleDraft.selectionStart, __styleDraft.selectionEnd], expectedSelection: __styleSelection }));
    assert(retained.post && retained.draft && retained.value === "新的草稿，需要保持光标。" && retained.selection.join() === retained.expectedSelection.join(), JSON.stringify({ retained, schedules: await forum.evaluate(() => __styleScheduleEvents.slice(-6)) }));
    assert.equal(await post.evaluate(node => getComputedStyle(node).borderRadius), "0px");
    assert.match(await post.evaluate(node => getComputedStyle(node).fontFamily), /Consolas/);
    assert.equal(await post.locator('.cc98-rebuild-icon-action[title="引用"]').getAttribute("data-cc98-ascii-glyph"), "[Q]");
    assert.equal(await post.locator('.cc98-rebuild-conversation-action').getAttribute("data-cc98-ascii-glyph"), "[THREAD]");
    assert.equal(await post.locator(':scope > .cc98-ascii-decoration').textContent(), "");
    const follow = post.locator('.cc98-rebuild-post-user-line .cc98-rebuild-post-follow-action');
    async function verifyFollowSize(label) {
      const size = await follow.evaluate(node => ({ width: node.getBoundingClientRect().width, before: getComputedStyle(node, '::before').display, after: getComputedStyle(node, '::after').display, transition: getComputedStyle(node).transitionProperty }));
      assert.equal(size.width, 24, `${label}: ${JSON.stringify(size)}`);
      assert.notEqual(size.before, 'none', label); assert.equal(size.after, 'none', label);
      assert(!/width/.test(size.transition), label);
    }
    await verifyFollowSize('normal');
    await follow.hover(); await verifyFollowSize('hover');
    await follow.focus(); await verifyFollowSize('focus');
    await follow.click();
    await forum.waitForFunction(() => document.querySelector('.cc98-rebuild-post-user-line .cc98-rebuild-post-follow-action')?.dataset.followSymbol === '−');
    assert.equal(await forum.evaluate(() => __nativeFollows), 1);
    await verifyFollowSize('followed');
    await follow.click();
    await forum.waitForFunction(() => document.querySelector('.cc98-rebuild-post-user-line .cc98-rebuild-post-follow-action')?.dataset.followSymbol === '+');
    assert.equal(await forum.evaluate(() => __nativeFollows), 2);
    checks++;
    // Native message/tracking actions are links, while quote/score are buttons.
    // Both variants and their states must use square ASCII controls.
    const actions = post.locator('.cc98-rebuild-post-actions .cc98-rebuild-mini-action');
    assert.equal(await post.locator('.cc98-rebuild-icon-action[title="私信"]').evaluate(node => node.tagName), "A");
    assert.equal(await post.locator('.cc98-rebuild-icon-action[title="追踪"]').evaluate(node => node.tagName), "A");
    const radii = () => actions.evaluateAll(nodes => nodes.map(node => ({ label: node.title, tag: node.tagName, radius: getComputedStyle(node).borderRadius })));
    assert((await radii()).every(item => item.radius === "0px"), JSON.stringify(await radii()));
    const message = post.locator('.cc98-rebuild-icon-action[title="私信"]');
    await message.hover();
    assert.equal(await message.evaluate(node => getComputedStyle(node).borderRadius), "0px");
    await message.focus();
    assert.equal(await message.evaluate(node => getComputedStyle(node).borderRadius), "0px");
    await actions.evaluateAll(nodes => nodes.forEach(node => node.classList.add('is-active', 'is-pending')));
    assert((await radii()).every(item => item.radius === "0px"), JSON.stringify(await radii()));
    await actions.evaluateAll(nodes => nodes.forEach(node => node.classList.remove('is-active', 'is-pending')));
    checks++;
    await popup.screenshot({ path: path.join(output, "ascii-settings.png") });
    checks++;
    await post.locator('.cc98-rebuild-icon-action[title="引用"]').click();
    assert.equal(await forum.evaluate(() => __nativeQuotes), 1, "ASCII action must retain the native click handler");
    checks++;
    await forum.bringToFront();
    for (const tone of ["light", "dark"]) {
      await patch({ themeMode: tone });
      for (const width of [1440, 1024, 390]) {
        await forum.setViewportSize({ width, height: 1050 });
        await forum.waitForFunction(() => {
          const post = document.querySelector('#cc98-comfort-app [data-post-floor="1"]');
          const width = post.querySelector(':scope > .cc98-ascii-decoration .cc98-ascii-top').getBoundingClientRect().width;
          return width <= post.clientWidth + 1 && width > post.clientWidth - 12;
        });
        const size = await post.evaluate(node => {
          const rule = node.querySelector(':scope > .cc98-ascii-decoration .cc98-ascii-top');
          const first = node.querySelector(':scope > .cc98-ascii-decoration .cc98-ascii-top').dataset.rule;
          const font = getComputedStyle(rule);
          const author = node.querySelector('.cc98-rebuild-post-header').getBoundingClientRect();
          const body = node.querySelector('.cc98-rebuild-post-body').getBoundingClientRect();
          const secondary = [...node.querySelectorAll(':scope > .cc98-rebuild-awards, :scope > .cc98-rebuild-signature, :scope > .cc98-rebuild-post-footer')].map(section => { const rect = section.getBoundingClientRect(); return {name:section.className,x:rect.x,width:rect.width,top:rect.top,bottom:rect.bottom}; });
          const action = node.querySelector('.cc98-rebuild-conversation-action');
          return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, width: node.clientWidth, ruleWidth: rule.getBoundingClientRect().width, rule: first, font: font.fontFamily, pointer: getComputedStyle(node.querySelector(':scope > .cc98-ascii-decoration')).pointerEvents, authorX: author.x, authorBottom: author.bottom, bodyX: body.x, bodyTop: body.top, bodyBottom:body.bottom, bodyWidth:body.width, secondary, actionWidth: action.clientWidth, actionScrollWidth: action.scrollWidth };
        });
        assert(size.scrollWidth <= width + 1, JSON.stringify(size));
        assert(size.ruleWidth <= size.width + 1 && size.ruleWidth > size.width - 12, JSON.stringify(size));
        assert.match(size.rule, /^\+-- POST #1 -+\+$/);
        assert.equal(size.pointer, "none");
        if (width > 700) assert(size.bodyX > size.authorX + 100, "wide posts must place author beside body");
        else assert(size.bodyTop >= size.authorBottom, "narrow posts must stack author above body");
        assert(size.secondary.some(section=>section.name==='cc98-rebuild-awards')&&size.secondary.some(section=>section.name==='cc98-rebuild-signature'),'fixture must include native rating records and signature');
        assert(size.secondary.every(section=>Math.abs(section.x-size.bodyX)<2&&Math.abs(section.width-size.bodyWidth)<2),`${tone}/${width}: ratings/signature/footer must share the full body column: ${JSON.stringify(size.secondary)}`);
        assert(size.secondary.every((section,index)=>section.top>=(index?size.secondary[index-1].bottom:size.bodyBottom)-1),`${tone}/${width}: secondary content must follow body order without overlap`);
        assert(size.actionWidth >= size.actionScrollWidth, `ASCII action label must remain fully visible: ${JSON.stringify(size)}`);
        assert.equal(await post.locator('img[alt="[ac01]"]').count(), 1);
        assert.equal(await post.locator('pre code').innerText(), "+----------+\n| CC98 BBS |\n+----------+");
        await post.locator('img[alt="一张正常的图片"]').evaluate(image => { image.loading = "eager"; return image.decode(); });
        await forum.evaluate(() => scrollTo(0, 0));
        if (width !== 1024) await forum.screenshot({ path: path.join(output, `ascii-post-${width}-${tone}.png`) });
        layouts.push({ tone, ...size }); checks++;
      }
    }
    await forum.setViewportSize({ width: 1440, height: 1050 });
    await post.screenshot({ path: path.join(output, "ascii-post-detail-dark.png") });
    await patch({ themePalette: "violet" });
    assert.equal(await forum.locator('html').getAttribute('data-cc98-comfort-style'), "ascii");
    assert.equal(await forum.locator('html').getAttribute('data-cc98-comfort-palette'), "violet");
    await popup.reload();
    await popup.locator('input[name="themeStyle"][value="ascii"]').waitFor({ state: "attached" });
    assert(await popup.locator('input[name="themeStyle"][value="ascii"]').isChecked());
    checks++;
    // The optional fixed left toolbar still fits each viewport in this layout.
    await patch({ sideTopbar: true });
    for (const width of [1440, 1024, 390]) {
      await forum.setViewportSize({ width, height: 1050 });
      await forum.waitForTimeout(150);
      assert(await forum.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `ASCII side toolbar overflows ${width}`);
    }
    await patch({ sideTopbar: false });
    await forum.waitForTimeout(200);
    await forum.evaluate(() => { __stylePost = document.querySelector('#cc98-comfort-app [data-post-floor="1"]'); });
    checks++;
    await forum.setViewportSize({ width: 1440, height: 1050 });
    await post.locator('.cc98-rebuild-conversation-action').click();
    await forum.waitForFunction(() => document.querySelector('.cc98-rebuild-conversation-status')?.textContent.startsWith("查找完成"));
    await forum.locator('.cc98-rebuild-conversation-dialog > .cc98-ascii-decoration').waitFor();
    assert.equal(await forum.locator('.cc98-rebuild-conversation-post .cc98-ascii-decoration').count(), 2);
    assert.equal(await forum.locator('.cc98-rebuild-conversation-body .cc98-ascii-decoration').count(), 0, "decorations must not enter quoted content");
    await forum.screenshot({ path: path.join(output, "ascii-conversation-dark.png") });
    await forum.keyboard.press("Escape");
    checks++;
    // New cards and lazy content receive frames without rebuilding existing posts.
    await forum.evaluate(() => {
      const clone = __stylePost.cloneNode(true); clone.dataset.postFloor = "3"; clone.id = "ascii-late-post";
      document.querySelector('.cc98-rebuild-post-feed').append(clone);
      const editor = document.createElement('div'); editor.className = 'cc98-rebuild-native-editor'; editor.id = 'ascii-test-editor';
      editor.innerHTML = '<div contenteditable="true" id="ascii-editable"><p>可编辑的内容</p></div>';
      document.querySelector('#cc98-comfort-app').append(editor);
    });
    await forum.waitForFunction(() => document.querySelector('#ascii-late-post > .cc98-ascii-decoration .cc98-ascii-top')?.dataset.rule.includes('POST #3'));
    assert.equal(await forum.locator('#ascii-late-post > .cc98-ascii-decoration').count(), 1);
    assert.equal(await forum.locator('#ascii-editable .cc98-ascii-decoration').count(), 0);
    await forum.locator('#ascii-editable').fill("输入之后的内容");
    assert.equal(await forum.locator('#ascii-editable').innerText(), "输入之后的内容");
    checks++;
    await require('./ascii-overlays.cjs')({ forum, popup, patch, output });
    await patch({ themeStyle: "modern" });
    await forum.waitForFunction(() => !document.querySelector('.cc98-ascii-decoration'));
    assert.equal(await post.evaluate(node => getComputedStyle(node).borderRadius), original.radius);
    assert.equal(await post.locator('.cc98-rebuild-icon-action[title="私信"]').evaluate(node => getComputedStyle(node).borderRadius), "999px", "switching back must restore the existing Reborn link style");
    assert.equal(await post.locator('[data-cc98-ascii-glyph]').count(), 0);
    await follow.hover(); await verifyFollowSize('Reborn hover');
    await follow.focus(); await verifyFollowSize('Reborn focus');
    assert(await forum.evaluate(() => __stylePost === document.querySelector('#cc98-comfort-app [data-post-floor="1"]') && __styleDraft.value === "新的草稿，需要保持光标。"));
    checks++;
    await patch({ themeStyle: "ascii", enabled: false });
    assert.equal(await forum.locator('.cc98-ascii-decoration').count(), 0);
    await patch({ enabled: true });
    await forum.locator('[data-post-floor="1"] > .cc98-ascii-decoration').waitFor();
    checks++;
    // The same renderer supplies a compact single-column BBS topic index.
    await forum.evaluate(() => {
      const app = document.querySelector('#cc98-comfort-app');
      const shell = document.createElement('section'); shell.id = 'ascii-topic-index'; shell.className = 'cc98-rebuild-home-hot-section';
      const list = document.createElement('div'); list.className = 'cc98-rebuild-list';
      ['今日校园随记', '新学期的第一本书', '周末走走看看', '一起整理学习资料'].forEach((title, index) => {
        list.append(renderTopicCard({ type: 'topic', title, href: '/topic/' + (201 + index), board: '校园生活', boardHref: '/board/81', meta: '12 个回复 · 刚刚', hoverMeta: '阅读伙伴 · 24 次浏览', rank: index + 1 }));
      });
      shell.append(list); app.prepend(shell);
    });
    await forum.waitForTimeout(200);
    assert.equal(await forum.locator('#ascii-topic-index .cc98-rebuild-list').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 1);
    assert(await forum.locator('#ascii-topic-index .cc98-rebuild-card').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height < 80)), "topic index must use compact rows");
    await forum.locator('#ascii-topic-index').screenshot({ path: path.join(output, "ascii-topic-index.png") });
    checks++;
    }
    const topicViews = forum.locator('#cc98-comfort-app .cc98-rebuild-hero > .cc98-rebuild-topic-views');
    const waitForViews = value => forum.waitForFunction(value => document.querySelector('.cc98-rebuild-topic-views')?.textContent === '浏览 ' + value, value, { timeout: 5000 }).catch(async error => {
      console.error('View-count sync failed: ' + JSON.stringify(await forum.evaluate(() => ({ native: document.querySelector('#viewtimes .timeProp.tagSize')?.textContent, hero: document.querySelector('.cc98-rebuild-topic-views')?.textContent, kind: getPageKind() }))));
      throw error;
    });
    await topicViews.waitFor();
    assert.equal(await topicViews.count(), 1);
    assert.equal(await topicViews.textContent(), '浏览 32000');
    assert.equal(await forum.locator('#cc98-comfort-app .cc98-rebuild-post-views').count(), 0, 'view count no longer appears in any post footer'); checks++;
    await forum.evaluate(() => { window.__viewsPostIdentity = document.querySelector('#cc98-comfort-app [data-post-floor="1"]'); });
    await forum.evaluate(() => { document.querySelector('#viewtimes .timeProp.tagSize').textContent = '0'; });
    await waitForViews('0'); checks++;
    await forum.evaluate(() => { document.querySelector('#viewtimes .timeProp.tagSize').textContent = '98765'; });
    await waitForViews('98765'); checks++;
    await forum.evaluate(() => { document.querySelector('#viewtimes .timeProp.tagSize').firstChild.nodeValue = '98766'; });
    await waitForViews('98766');
    assert(await forum.evaluate(() => __viewsPostIdentity === document.querySelector('#cc98-comfort-app [data-post-floor="1"]')), 'count updates preserve the mounted post DOM'); checks++;
    await forum.evaluate(() => { document.querySelector('#viewtimes').remove(); });
    await topicViews.waitFor({ state: 'detached', timeout: 5000 });
    assert.equal(await forum.locator('#cc98-comfort-app .cc98-rebuild-post-views').count(), 0); checks++;
    const longTitle = '回到字符构成的论坛：' + '长标题下浏览计数与操作控件应各自排版。'.repeat(3);
    await forum.evaluate(() => {
      const native = document.createElement('span'); native.id = 'viewtimes';
      native.innerHTML = '<span class="timeProp tagSize">54321</span>';
      document.querySelector('.topicInfo-info').append(native);
    });
    await waitForViews('54321'); checks++;
    await forum.evaluate(title => { document.querySelector('.cc98-rebuild-hero h1').textContent = title; }, longTitle);
    await forum.evaluate(() => {
      window.__blockedRevealClicks = {};
      const host = document.createElement('section'); host.id = 'ascii-blocked-layout'; host.className = 'cc98-rebuild-section';
      for (const [id, reason] of [
        ['short', '标题：测试'],
        ['long', '标题：' + '这是一段需要自然折行的长屏蔽原因，操作按钮应保留完整宽度。'.repeat(3)],
        ['semantic', '语义规则（实验性）：攻击性 90%']
      ]) {
        const card = renderBlockedPlaceholder(reason, { onReveal: () => { __blockedRevealClicks[id] = (__blockedRevealClicks[id] || 0) + 1; } });
        card.dataset.blockedTest = id; host.append(card);
      }
      document.querySelector('.cc98-rebuild-hero').after(host);
    });
    const controlLayouts = [];
    for (const style of ['modern', 'ascii']) for (const tone of ['light', 'dark']) {
      await patch({ themeStyle: style, themeMode: tone });
      for (const width of [1440, 390]) {
        await forum.setViewportSize({ width, height: 1050 });
        await forum.waitForTimeout(150);
        const result = await forum.evaluate(() => {
          const hero = document.querySelector('.cc98-rebuild-hero');
          const title = hero.querySelector('h1'), views = hero.querySelector('.cc98-rebuild-topic-views');
          const titleBox = title.getBoundingClientRect(), viewsBox = views.getBoundingClientRect();
          const range = document.createRange(); range.selectNodeContents(views);
          const textBox = range.getBoundingClientRect();
          const controls = [...document.querySelectorAll('#ascii-blocked-layout [data-blocked-test]')].map(card => {
            const cardBox = card.getBoundingClientRect(), reason = card.querySelector('.cc98-rebuild-card-title').getBoundingClientRect();
            const button = card.querySelector('button'), box = button.getBoundingClientRect(), css = getComputedStyle(button);
            return { id: card.dataset.blockedTest, label: button.textContent, x: box.x, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, cardX: cardBox.x, cardRight: cardBox.right, reasonRight: reason.right, reasonTop: reason.top, reasonBottom: reason.bottom, scrollWidth: button.scrollWidth, clientWidth: button.clientWidth, whiteSpace: css.whiteSpace, writingMode: css.writingMode, radius: css.borderRadius, before: getComputedStyle(button, '::before').content, after: getComputedStyle(button, '::after').content };
          });
          return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, viewsCount: document.querySelectorAll('#cc98-comfort-app .cc98-rebuild-topic-views').length, footerViews: document.querySelectorAll('#cc98-comfort-app .cc98-rebuild-post-views').length, titleBottom: titleBox.bottom, titleWidth: title.clientWidth, titleScrollWidth: title.scrollWidth, viewsTop: viewsBox.top, viewsRight: viewsBox.right, textRight: textBox.right, textAlign: getComputedStyle(views).textAlign, controls };
        });
        assert.equal(result.viewsCount, 1);
        assert.equal(result.footerViews, 0);
        assert.equal(result.textAlign, 'right');
        assert(result.viewsTop >= result.titleBottom - 1, `${style}/${tone}/${width}: views overlap the long title`);
        assert(Math.abs(result.textRight - result.viewsRight) < 2, `${style}/${tone}/${width}: view count text must align right`);
        assert(result.titleScrollWidth <= result.titleWidth + 1, `${style}/${tone}/${width}: long title overflows`);
        assert(result.scrollWidth <= width + 1, JSON.stringify(result));
        assert.equal(result.controls.length, 3);
        for (const control of result.controls) {
          assert(control.x >= control.cardX - 1 && control.right <= control.cardRight + 1, JSON.stringify(control));
          assert(control.scrollWidth <= control.clientWidth + 1, JSON.stringify(control));
          if (style === 'ascii') {
            assert.equal(control.whiteSpace, 'nowrap');
            assert.equal(control.writingMode, 'horizontal-tb');
            assert.equal(control.radius, '0px');
            assert(control.width > control.height + 10 && control.height <= 42, 'ASCII reveal labels must stay horizontal: ' + JSON.stringify(control));
            assert(control.x >= control.reasonRight - 1, 'reveal action stays beside the reason: ' + JSON.stringify(control));
            assert.match(control.before, /\[/); assert.match(control.after, /\]/);
          }
        }
        for (const id of ['short', 'long', 'semantic']) {
          const before = await forum.evaluate(id => __blockedRevealClicks[id] || 0, id);
          const button = forum.locator(`#ascii-blocked-layout [data-blocked-test="${id}"] button`);
          assert.equal(await button.textContent(), id === 'semantic' ? '展开原文' : '显示');
          await button.click();
          assert.equal(await forum.evaluate(id => __blockedRevealClicks[id], id), before + 1, 'reveal callback remains connected');
        }
        await forum.evaluate(() => scrollTo(0, 0));
        if (style === 'ascii') await forum.screenshot({ path: path.join(output, `ascii-views-blocked-${width}-${tone}.png`) });
        controlLayouts.push({ style, tone, ...result }); checks++;
      }
    }
    assert.deepEqual(errors, []);
    if (layouts.length) await fs.writeFile(path.join(output, 'measurements.json'), JSON.stringify(layouts, null, 2));
    await fs.writeFile(path.join(output, 'views-blocked-measurements.json'), JSON.stringify({ passed: true, layouts: controlLayouts, errors }, null, 2));
    console.log(`ASCII interface: ${checks} groups passed (settings/storage, independent palette/tone, native actions, content/draft/selection, frames/resizing, media, dialog, asynchronous content, cleanup and compact index)`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
