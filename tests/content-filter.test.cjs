const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), origin = "https://www.cc98.org";
const output = path.join(root, "outputs/content-filter-preview");
const emoji = '<img src="/static/images/ac/01.png" alt="[ac01]">';
const contents = [
  "三次表情" + emoji.repeat(3),
  "四次表情" + emoji.repeat(4),
  '<blockquote>以下是引用1楼：用户Normal在2026-10-16 12:00:00的发言：' + emoji.repeat(6) + "</blockquote>引用外只有正常文字",
  "签名外正常文字",
  "广告 广告",
  "广告 讨论",
  "ABCabc",
  "没有匹配的正常文字",
  "a".repeat(30000) + "!",
  "加微信 加薇信"
];
const stats = [[0, 0], [1, 9], [9, 1], [1, 1], [2, 8], [9, 0], [null, null], [1, 29], [0, 0], [1, 9]];
function footer(i) {
  const [likes, dislikes] = stats[i];
  const votes = '<div class="reply-footer"><div class="upup"><span class="commentProp">' + (likes ?? '') + '</span></div><div class="downdown"><span class="commentProp">' + (dislikes ?? '') + '</span></div></div>';
  const award = i === 1 || i === 2 || i === 4 ? '<div class="awardInfo"><div class="tagSize"><span class="userName">Moderator</span><span class="grades">风评值 ' + (i === 2 ? '+5' : '-5') + '</span></div>' + (i === 4 ? '<button>显示全部</button>' : '') + '</div>' : '';
  return votes + award;
}
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>内容规则测试 - CC98论坛</title></head><body><div id="root"><h1>内容规则测试</h1>'
  + contents.map((text, i) => '<div class="reply" id="post-' + (i + 1) + '" data-floor="' + (i + 1) + '"><div class="reply-floor">#' + (i + 1) + '</div><a href="/user/id/' + (200 + i) + '">User' + (i + 1) + '</a><div class="reply-content"><div class="substance"><article>' + text + '</article></div></div>' + (i === 3 ? '<div class="signature">' + emoji.repeat(8) + "</div>" : "") + footer(i) + "</div>").join("")
  + '<div class="pagination"><ul class="page-nav"><li><a href="/topic/100/1">1</a></li></ul></div></div></body></html>';
async function executable() {
  const cache = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  for (const name of (await fs.readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) {
    const file = path.join(cache, name, "chrome-win64/chrome.exe");
    try { await fs.access(file); return file; } catch {}
  }
  throw new Error("Full Chromium is required for the real extension rule worker");
}
async function main() {
  const context = await chromium.launchPersistentContext("", { executablePath: await executable(), headless: true,
    ignoreDefaultArgs: ["--disable-extensions"], args: ["--disable-extensions-except=" + root, "--load-extension=" + root], viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let checks = 0, page;
  try {
    await context.setOffline(true);
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.protocol === "chrome-extension:") return route.continue();
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith("/static/images/")) return route.fulfill({ path: path.join(root, "assets/icon32.png") });
      return route.fulfill({ contentType: "text/html", body: html });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ cc98ComfortSettings: { enabled: true, themeMode: "light", homeHotOnly: true, prewarmPostImages: false, previsitFirstPageForTopicImages: false, blockedContentRules: "[]" } });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
      getOpenIdBinding = async () => ({ ok: true, binding: { bound: true, userId: 12345, userName: "Local", boundAt: 42 } });
    });
    const setRules = async rules => {
      await worker.evaluate(async rules => {
        const { cc98ComfortSettings: settings } = await chrome.storage.local.get("cc98ComfortSettings");
        await chrome.storage.local.set({ cc98ComfortSettings: { ...settings, blockedContentRules: JSON.stringify(rules) } });
      }, rules);
      await page.waitForTimeout(180);
    };
    const contentState = async floor => worker.evaluate(async floor => {
      const [tab] = await chrome.tabs.query({ url: "https://www.cc98.org/*" });
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [floor], func: floor => {
        if (floor === null) return { errors: CC98RebornContentFilter.errors() };
        const item = getPostItems().find(item => item.index === floor);
        return { reason: item ? shouldBlockRebuiltItem(item) : "missing item", metrics: item?.metrics };
      } });
      return result[0].result;
    }, floor);
    const blocked = async floor => (await contentState(floor)).reason;
    const getRules = async () => worker.evaluate(async () => JSON.parse((await chrome.storage.local.get("cc98ComfortSettings")).cc98ComfortSettings.blockedContentRules));
    const setTitleRules = async source => {
      await worker.evaluate(async source => {
        const { cc98ComfortSettings: settings } = await chrome.storage.local.get('cc98ComfortSettings');
        await chrome.storage.local.set({ cc98ComfortSettings: { ...settings, blockedTitleKeywords: source } });
      }, source);
      await page.waitForTimeout(180);
    };
    const getTitleRules = () => worker.evaluate(async () => (await chrome.storage.local.get('cc98ComfortSettings')).cc98ComfortSettings.blockedTitleKeywords);
    const titleProbe = title => worker.evaluate(async title => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [title], func: title => {
        let native = document.querySelector('#title-rule-probe');
        if (!native) {
          native = document.createElement('article'); native.id = 'title-rule-probe'; native.className = 'focus-topic';
          const link = document.createElement('a'); link.className = 'focus-topic-title'; link.href = '/topic/202/1';
          native.append(link); document.querySelector('#root').append(native);
        }
        const link = native.querySelector('.focus-topic-title');
        if (link.textContent !== title) link.textContent = title;
        const rebuiltReason = shouldBlockRebuiltItem({ type: 'topic', title });
        const nativeReason = getBlockReason(native, lastSettings);
        scheduleFiltering();
        return { rebuiltReason, nativeReason, folded: native.classList.contains('cc98-comfort-is-blocked'), errors: CC98RebornContentFilter.errors() };
      } }))[0].result;
    }, title);
    async function expectTitleMatch(title) {
      for (let attempt = 0; attempt < 80; attempt++) {
        const result = await titleProbe(title);
        if (result.rebuiltReason && result.nativeReason && result.folded) return result;
        await page.waitForTimeout(60);
      }
      throw new Error('Title did not match through rebuilt/native paths: ' + title.slice(0, 80));
    }
    async function expectTitleVisible(title) {
      await titleProbe(title);
      await page.waitForTimeout(300);
      const result = await titleProbe(title);
      assert.equal(result.rebuiltReason, '', 'unmatched/pending titles stay visible in rebuilt rendering');
      assert.equal(result.nativeReason, '', 'unmatched/pending titles stay visible in native filtering');
      assert.equal(result.folded, false, 'native topic node is not folded');
      return result;
    }
    async function settled(floor) {
      for (let i = 0; i < 100; i++) {
        const reason = await blocked(floor);
        if (!reason.startsWith("正在检查")) return reason;
        await page.waitForTimeout(100);
      }
      throw new Error("Content rule did not finish");
    }
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/topic/100/1");
    await page.locator(".cc98-rebuild-post[data-post-floor='1']").waitFor();
    await setRules(['风评 < -3']);
    assert.match(await blocked(2), /内容规则/);
    assert.equal(await blocked(3), '');
    assert.equal(await blocked(5), '', 'collapsed awards remain unknown');
    assert.equal((await contentState(1)).metrics.reputation, 0);
    await setRules(['NOT 风评 >= 0']);
    assert.equal(await blocked(5), '', 'NOT must preserve unknown');
    assert.equal(await blocked(7), '', 'missing counts must not imply a zero rating'); checks += 6;
    await setRules(['赞踩比 < 0.5 AND 赞踩总数 >= 20']);
    assert.equal(await blocked(2), '', 'small vote sample is protected');
    assert.match(await blocked(8), /内容规则/);
    assert.equal(await blocked(1), '', '0/0 is unknown');
    assert.equal(await blocked(6), '', 'positive/0 is infinity');
    assert.equal(await blocked(7), '', 'missing votes are unknown');
    assert.equal(await page.locator('#cc98-content-filter-frame').count(), 0, 'numeric rules do not start a worker'); checks += 6;
    await setRules(['踩 > 20']);
    assert.match(await blocked(8), /内容规则/);
    await page.evaluate(() => { document.querySelector('#post-8 .downdown .commentProp').firstChild.nodeValue = '2'; });
    await page.locator(".cc98-rebuild-post[data-post-floor='8']").waitFor();
    assert.equal(await blocked(8), '', 'native vote changes are re-evaluated');
    await page.evaluate(() => { document.querySelector('#post-8 .downdown .commentProp').textContent = '29'; }); checks += 2;
    await setRules(['/abc/i >= 2 AND 踩 > 3']);
    const probe = () => worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
        const html = '<p>ABCabc</p>';
        return [undefined, 9].map(dislikes => CC98RebornContentFilter.reason({ type: 'post', contentHtml: html, metrics: { dislikes } }));
      } }); return result[0].result;
    });
    let probed;
    for (let i = 0; i < 40; i++) { probed = await probe(); if (probed.every(value => !value.startsWith('正在检查'))) break; await page.waitForTimeout(100); }
    assert.equal(probed[0], ''); assert.match(probed[1], /内容规则/, 'regex cache separates identical texts with different metrics'); checks += 2;
    await setRules(['"[ac01]" > 3']);
    assert.equal(await blocked(1), "");
    assert.match(await blocked(2), /内容规则/);
    assert.equal(await blocked(3), "", "quoted emotions do not count");
    assert.equal(await blocked(4), "", "signature emotions do not count");
    assert.equal(await page.locator("#cc98-content-filter-frame").count(), 0, "literal rules need no worker frame"); checks += 5;
    await page.locator(".cc98-rebuild-post[data-post-floor='2']").waitFor({ state: "detached" });
    assert.equal(await page.locator(".cc98-rebuild-post[data-post-floor='3']").count(), 1);
    assert.equal(await page.locator(".cc98-rebuild-post[data-post-floor='4']").count(), 1); checks++;
    assert(await page.locator(".cc98-rebuild-blocked").count(), "real post rendering applies matching rules"); checks++;
    await setRules(['"广告" >= 2 AND NOT "讨论"']);
    assert.match(await blocked(5), /内容规则/);
    assert.equal(await blocked(6), ""); checks += 2;
    await setRules(["/abc/i >= 2", "/加[微薇]信/ >= 2"]);
    assert.match(await settled(7), /内容规则/);
    assert.match(await settled(10), /内容规则/);
    assert.equal(await settled(8), "");
    assert.equal(await page.locator("#cc98-content-filter-frame").count(), 1); checks += 4;
    await page.locator(".cc98-rebuild-post[data-post-floor='7']").waitFor({ state: "detached" }); checks++;
    await page.locator(".cc98-rebuild-post[data-post-floor='8'] .cc98-rebuild-conversation-action").click();
    await page.locator('[data-conversation-key="100:8"] .cc98-rebuild-conversation-body').waitFor();
    await setRules(['踩 > 20']);
    await page.locator('[data-conversation-key="100:8"] .cc98-rebuild-conversation-body').waitFor({ state: 'detached' });
    await setRules([]);
    await page.locator('[data-conversation-key="100:8"] .cc98-rebuild-conversation-body').waitFor(); checks++;
    await setRules(['"正常文字"']);
    await page.locator('[data-conversation-key="100:8"] .cc98-rebuild-conversation-body').waitFor({ state: "detached" });
    assert(await page.locator('[data-conversation-key="100:8"]').getByRole("button", { name: /显示此楼/ }).count());
    await page.keyboard.press("Escape"); checks++;
    await setRules([]);
    await page.getByRole('button', { name: '全文搜索', exact: true }).first().click();
    await page.getByLabel('关键词', { exact: true }).fill('User8');
    await page.getByRole('button', { name: '开始搜索', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    await page.locator('[data-search-floor="8"] .cc98-topic-search-snippet').waitFor();
    await setRules(['踩 > 20']);
    await page.locator('[data-search-floor="8"] .cc98-topic-search-reveal').waitFor();
    assert.equal(await page.locator('[data-search-floor="8"] .cc98-topic-search-snippet').count(), 0);
    await setRules([]);
    await page.locator('[data-search-floor="8"] .cc98-topic-search-snippet').waitFor();
    await page.getByRole('button', { name: '关闭搜索窗口', exact: true }).click(); checks++;
    await page.evaluate(() => { window.__ruleHeartbeat = 0; window.__ruleHeartbeatTimer = setInterval(() => __ruleHeartbeat++, 20); });
    await setRules(["/(a+)+$/"]);
    await settled(9);
    assert.equal(await blocked(9), "", "a timed-out regex is skipped");
    assert(await page.evaluate(() => __ruleHeartbeat > 2), "catastrophic regex must not freeze the page");
    assert((await contentState(null)).errors.some(message => message.includes("超时")));
    await page.evaluate(() => clearInterval(__ruleHeartbeatTimer)); checks += 3;
    await setRules([]);
    assert.equal(await page.locator("#cc98-content-filter-frame").count(), 0, "no rules releases the helper and worker");
    assert.equal(await blocked(2), ""); checks += 2;
    await setRules(["/(a+)+$/"]);
    await setRules(['"definitely-absent"']);
    await page.waitForTimeout(300);
    assert.equal(await blocked(9), "");
    assert.equal(await page.locator("#cc98-content-filter-frame").count(), 0, "changing rules tears down stale regex work"); checks++;
    await setRules([]);
    await page.goto(origin + "/#cc98-reborn-blacklist");
    const group = page.locator("[data-content-rules]");
    await group.waitFor();
    const picker = group.getByRole('button', { name: '选择屏蔽表情', exact: true });
    const panel = group.locator('[data-content-rule-emoji]');
    assert.equal(await panel.count(), 0, 'the shared emoji panel is created on demand'); checks++;
    for (const [category, code] of [['CC98', '[cc9801]'], ['AC娘', '[ac01]'], ['麻将脸', '[a:001]'], ['贴吧', '[tb01]'], ['雀魂', '[ms01]'], ['经典', '[em00]']]) {
      await group.getByLabel('要统计的文本或表情').fill('替换此文本');
      await picker.click();
      await panel.getByRole('button', { name: category, exact: true }).click();
      await panel.getByRole('button', { name: category + ' 1', exact: true }).click();
      assert.equal(await group.getByLabel('要统计的文本或表情').inputValue(), code);
      assert(await panel.isHidden());
      assert.equal(await picker.getAttribute('aria-expanded'), 'false'); checks++;
    }
    await picker.click(); await picker.click(); assert(await panel.isHidden()); checks++;
    await picker.click(); await page.keyboard.press('Escape'); assert(await panel.isHidden()); checks++;
    await picker.click(); await group.locator('.cc98-rebuild-blacklist-group-title').first().click(); assert(await panel.isHidden()); checks++;
    await picker.click(); await panel.getByRole('button', { name: 'AC娘', exact: true }).click();
    await panel.getByRole('button', { name: 'AC娘 1', exact: true }).click();
    await group.getByLabel("匹配次数").fill("3");
    await group.getByRole("button", { name: "添加规则", exact: true }).click();
    await group.locator(".cc98-rebuild-blacklist-item").first().waitFor();
    assert((await getRules()).includes('"[ac01]" > 3')); checks++;
    const expressionInput = group.getByLabel("内容规则表达式");
    const expressionStatus = group.locator(".cc98-content-rule-error");
    const expressionSubmit = group.getByRole("button", { name: "加入", exact: true });
    assert(await expressionStatus.isHidden());
    assert.equal(await expressionInput.getAttribute('aria-invalid'), null);
    assert(await expressionSubmit.isDisabled()); checks++;
    const rulesBeforeDraft = await getRules();
    await worker.evaluate(() => {
      globalThis.__draftSettingsWrites = 0;
      globalThis.__draftSettingsListener = (changes, area) => { if (area === 'local' && changes.cc98ComfortSettings) globalThis.__draftSettingsWrites++; };
      chrome.storage.onChanged.addListener(globalThis.__draftSettingsListener);
    });
    await expressionInput.fill('"广告" AND');
    assert(await expressionStatus.isVisible());
    assert.equal(await expressionStatus.getAttribute('data-state'), 'invalid');
    assert.equal(await expressionInput.getAttribute('aria-invalid'), 'true');
    assert.match(await expressionStatus.textContent(), /第\s*\d+\s*字/);
    assert(await expressionSubmit.isDisabled());
    assert.equal((await getRules()).length, 1); checks++;
    await fs.mkdir(output, { recursive: true });
    await group.screenshot({ path: path.join(output, 'syntax-invalid.png'), style: '.cc98-rebuild-topbar, .cc98-rebuild-transient-toast { visibility: hidden !important; }' });
    await expressionInput.fill('"广告" AND NOT "讨论"');
    assert.equal(await expressionStatus.textContent(), '语法有效');
    assert.equal(await expressionStatus.getAttribute('data-state'), 'valid');
    assert.match(await expressionStatus.getAttribute('class'), /\bis-valid\b/);
    assert.equal(await expressionInput.getAttribute('aria-invalid'), 'false');
    assert(await expressionSubmit.isEnabled()); checks++;
    await group.screenshot({ path: path.join(output, 'syntax-valid.png'), style: '.cc98-rebuild-topbar, .cc98-rebuild-transient-toast { visibility: hidden !important; }' });
    await expressionInput.fill('');
    assert(await expressionStatus.isHidden());
    assert.equal(await expressionStatus.getAttribute('data-state'), null);
    assert.equal(await expressionInput.getAttribute('aria-invalid'), null);
    assert(await expressionSubmit.isDisabled()); checks++;
    for (const source of ['/https?:\\/\\/example[.]com\\/[a-z/]+/i >= 1', '/[a-z/]+/u']) {
      await expressionInput.fill(source);
      assert.equal(await expressionStatus.getAttribute('data-state'), 'valid');
      assert(await expressionSubmit.isEnabled()); checks++;
    }
    for (const source of ['/广告/z', '/广告/ii']) {
      await expressionInput.fill(source);
      assert.equal(await expressionStatus.getAttribute('data-state'), 'invalid');
      assert.equal(await expressionInput.getAttribute('aria-invalid'), 'true');
      assert(await expressionSubmit.isDisabled()); checks++;
    }
    await expressionInput.evaluate(input => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      input.value = '"输入法完成"';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', isComposing: true }));
    });
    assert(await expressionStatus.isHidden(), 'IME does not validate the unfinished composition');
    assert.equal(await expressionInput.getAttribute('aria-invalid'), null);
    assert(await expressionSubmit.isDisabled()); checks++;
    await expressionInput.dispatchEvent('compositionend');
    assert.equal(await expressionStatus.getAttribute('data-state'), 'valid');
    assert.equal(await expressionInput.getAttribute('aria-invalid'), 'false');
    assert(await expressionSubmit.isEnabled()); checks++;
    await expressionInput.fill('"广告" AND');
    await group.getByRole('button', { name: '逻辑组合', exact: true }).click();
    assert.equal(await expressionStatus.getAttribute('data-state'), 'valid', 'programmatic example insertion validates immediately');
    assert(await expressionSubmit.isEnabled()); checks++;
    const regexValidationProbe = action => worker.evaluate(async action => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [action], func: action => {
        if (action === 'start') {
          globalThis.__draftRegexMatchCalls = 0;
          globalThis.__draftOriginalRegexExec = RegExp.prototype.exec;
          RegExp.prototype.exec = function (text) {
            if (this.source === '(a+)+$') { globalThis.__draftRegexMatchCalls++; throw new Error('Draft validation attempted regex matching'); }
            return globalThis.__draftOriginalRegexExec.call(this, text);
          };
          return 0;
        }
        const calls = globalThis.__draftRegexMatchCalls;
        RegExp.prototype.exec = globalThis.__draftOriginalRegexExec;
        delete globalThis.__draftRegexMatchCalls;
        delete globalThis.__draftOriginalRegexExec;
        return calls;
      } }))[0].result;
    }, action);
    await regexValidationProbe('start');
    await page.evaluate(() => { window.__draftHeartbeat = 0; window.__draftHeartbeatTimer = setInterval(() => __draftHeartbeat++, 20); });
    let draftMatchCalls;
    try {
      await expressionInput.fill('/(a+)+$/');
      assert.equal(await expressionStatus.getAttribute('data-state'), 'valid');
      assert(await expressionSubmit.isEnabled());
      await page.waitForTimeout(160);
      assert(await page.evaluate(() => __draftHeartbeat > 2), 'compiling a catastrophic regex keeps the page responsive');
      assert.equal(await page.locator('#cc98-content-filter-frame').count(), 0, 'unsaved regex does not start a matching worker'); checks++;
    } finally {
      draftMatchCalls = await regexValidationProbe('stop');
      await page.evaluate(() => clearInterval(__draftHeartbeatTimer));
    }
    assert.equal(draftMatchCalls, 0, 'draft validation compiles regex without executing any match'); checks++;
    assert.deepEqual(await getRules(), rulesBeforeDraft);
    assert.equal(await worker.evaluate(() => {
      chrome.storage.onChanged.removeListener(globalThis.__draftSettingsListener);
      const writes = globalThis.__draftSettingsWrites;
      delete globalThis.__draftSettingsListener;
      delete globalThis.__draftSettingsWrites;
      return writes;
    }), 0, 'typing, composition and examples do not write settings'); checks++;
    await group.getByLabel("内容规则表达式").fill('/广告{1,3}/i >= 2 OR "推广"');
    await group.getByRole("button", { name: "加入", exact: true }).click();
    await group.locator(".cc98-rebuild-blacklist-item").nth(1).waitFor();
    assert.equal(await expressionInput.inputValue(), '');
    assert(await expressionStatus.isHidden());
    assert.equal(await expressionInput.getAttribute('aria-invalid'), null);
    assert(await expressionSubmit.isDisabled()); checks++;
    await page.reload(); await group.waitFor();
    assert.equal((await getRules()).length, 2); checks++;
    await group.locator(".cc98-rebuild-blacklist-delete").first().click();
    await group.locator(".cc98-rebuild-blacklist-item").nth(1).waitFor({ state: "detached" });
    assert.equal((await getRules()).length, 1); checks++;
    await page.waitForTimeout(350);
    assert.equal(await page.getByRole('heading', { name: '屏蔽规则', exact: true }).count(), 1); checks++;
    await group.getByLabel('屏蔽指标', { exact: true }).selectOption('赞踩比');
    await group.getByLabel('指标阈值', { exact: true }).fill('0.5');
    await group.getByLabel('赞踩总数下限', { exact: true }).fill('20');
    await group.getByRole('button', { name: '添加数值规则', exact: true }).click();
    await group.locator('.cc98-rebuild-blacklist-item').nth(1).waitFor();
    assert((await getRules()).includes('赞踩比 < 0.5 AND 赞踩总数 >= 20')); checks++;
    await page.waitForTimeout(350);
    await group.getByLabel('屏蔽指标', { exact: true }).selectOption('赞踩比');
    await expressionInput.fill('');
    await group.getByRole('button', { name: '以「且」加入下方表达式', exact: true }).click();
    assert.equal(await expressionInput.inputValue(), '赞踩比 < 0.5 AND 赞踩总数 >= 20');
    assert.equal(await expressionStatus.getAttribute('data-state'), 'valid', 'numeric composition validates a previously empty draft');
    assert.equal(await expressionInput.getAttribute('aria-invalid'), 'false');
    assert(await expressionSubmit.isEnabled()); checks++;
    await group.getByLabel('内容规则表达式').fill('"[ac01]" > 3');
    await group.getByRole('button', { name: '以「且」加入下方表达式', exact: true }).click();
    assert.equal(await group.getByLabel('内容规则表达式').inputValue(), '("[ac01]" > 3) AND (赞踩比 < 0.5 AND 赞踩总数 >= 20)'); checks++;
    await fs.mkdir(output, { recursive: true });
    for (const width of [1440, 390]) for (const style of ["modern", "ascii"]) for (const tone of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await worker.evaluate(async ({ style, tone }) => {
        const { cc98ComfortSettings: settings } = await chrome.storage.local.get("cc98ComfortSettings");
        await chrome.storage.local.set({ cc98ComfortSettings: { ...settings, themeStyle: style, themeMode: tone } });
      }, { style, tone });
      await page.waitForTimeout(100);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await picker.click(); await panel.waitFor({ state: 'visible' });
      await page.waitForTimeout(60);
      const bounds = await panel.evaluate(element => {
        const box = element.getBoundingClientRect(), image = element.querySelector('img').getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, radius: getComputedStyle(element).borderTopLeftRadius, image: [image.width, image.height], width: innerWidth, height: innerHeight };
      });
      assert(bounds.left >= 0 && bounds.right <= bounds.width + 1 && bounds.top >= 0 && bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
      assert(bounds.image[0] <= 38 && bounds.image[1] <= 38, 'picker images stay within their cells: ' + JSON.stringify(bounds));
      if (style === 'ascii') assert.equal(bounds.radius, '0px');
      await panel.screenshot({ path: path.join(output, 'picker-' + width + '-' + style + '-' + tone + '.png'), style: '.cc98-rebuild-topbar, .cc98-rebuild-transient-toast { visibility: hidden !important; }' });
      await page.keyboard.press('Escape'); checks++;
      await group.screenshot({ path: path.join(output, width + "-" + style + "-" + tone + ".png"), style: '.cc98-rebuild-topbar, .cc98-rebuild-transient-toast { visibility: hidden !important; }' }); checks++;
    }
    await setRules([]);
    await setTitleRules('LegacyWord,SecondWord');
    await expectTitleMatch('A legacyWORD topic'); checks++;
    await expectTitleMatch('SECONDword appears here'); checks++;
    await expectTitleVisible('A completely unrelated topic'); checks++;
    assert.equal(await page.locator('#cc98-content-filter-frame').count(), 0, 'plain title terms do not start a worker'); checks++;
    await setTitleRules('/^release-[a-z]{2,4}$/i');
    const pendingTitle = await titleProbe('RELEASE-Abc');
    assert.equal(pendingTitle.rebuiltReason, '', 'a pending title regex never folds the title');
    assert.equal(pendingTitle.nativeReason, ''); checks++;
    await expectTitleMatch('RELEASE-Abc'); checks++;
    await expectTitleVisible('RELEASE-abcde'); checks++;
    await setTitleRules('/^https?:\\/\\/example[.]com\\/a,b$/i\nPlainAfter');
    await expectTitleMatch('HTTPS://EXAMPLE.COM/a,b'); checks++;
    await expectTitleVisible('https://example.com/a;c'); checks++;
    await expectTitleMatch('plainAFTER remains compatible'); checks++;
    await setTitleRules('/^(?:广告){1,3}$/i,LegacyAfter');
    await expectTitleMatch('广告广告');
    await expectTitleMatch('legacyafter');
    await expectTitleVisible('广告广告广告广告'); checks++;
    const stressTitle = 'a'.repeat(4000) + '!';
    await setTitleRules('/(a+)+$/');
    await page.evaluate(() => { window.__titleHeartbeat = 0; window.__titleHeartbeatTimer = setInterval(() => __titleHeartbeat++, 20); });
    try {
      const pending = await titleProbe(stressTitle);
      assert.equal(pending.rebuiltReason, '');
      assert.equal(pending.nativeReason, '');
      let result;
      for (let attempt = 0; attempt < 80; attempt++) {
        result = await titleProbe(stressTitle);
        if (result.errors.some(message => message.includes('超时'))) break;
        await page.waitForTimeout(60);
      }
      assert(result.errors.some(message => message.includes('超时')), 'catastrophic title regex reports its worker timeout');
      assert.equal(result.rebuiltReason, '');
      assert.equal(result.nativeReason, '');
      assert.equal(result.folded, false);
      assert(await page.evaluate(() => __titleHeartbeat > 2), 'title regex timeout does not block main-page interaction'); checks++;
    } finally { await page.evaluate(() => clearInterval(__titleHeartbeatTimer)); }
    await setTitleRules('/(a+)+$|^freshLiteral$/');
    const obsolete = await titleProbe(stressTitle);
    assert.equal(obsolete.rebuiltReason, '');
    await setTitleRules('/^fresh(?:Literal)$/i');
    await expectTitleMatch('FRESHLiteral');
    await page.waitForTimeout(400);
    const fresh = await expectTitleMatch('FRESHLiteral');
    assert.deepEqual(fresh.errors, [], 'changing title rules discards stale timeout/results');
    await expectTitleVisible(stressTitle); checks++;
    await setTitleRules('');
    await expectTitleVisible('FRESHLiteral');
    assert.equal(await page.locator('#cc98-content-filter-frame').count(), 0, 'clearing title regex releases the shared worker frame'); checks++;
    const titleGroup = page.locator('.cc98-rebuild-blacklist-group').filter({ has: page.getByText('标题匹配', { exact: true }) });
    const titleInput = titleGroup.getByLabel('标题匹配规则', { exact: true });
    const titleStatus = titleGroup.locator('.cc98-content-rule-error');
    const titleSubmit = titleGroup.getByRole('button', { name: '加入', exact: true });
    await titleInput.waitFor();
    assert.equal(await titleInput.getAttribute('type'), 'text');
    assert(await titleStatus.isHidden());
    assert(await titleSubmit.isDisabled()); checks++;
    await titleInput.fill('/广告/z');
    assert.equal(await titleStatus.getAttribute('data-state'), 'invalid');
    assert.equal(await titleInput.getAttribute('aria-invalid'), 'true');
    assert(await titleSubmit.isDisabled());
    assert.equal(await getTitleRules(), '', 'invalid title draft is not saved'); checks++;
    await titleInput.fill('/^a{1,3}\\/b,comma$/i');
    assert.equal(await titleStatus.getAttribute('data-state'), 'valid');
    assert.equal(await titleStatus.textContent(), '语法有效');
    assert.equal(await titleInput.getAttribute('aria-invalid'), 'false');
    assert(await titleSubmit.isEnabled());
    assert.equal(await getTitleRules(), '', 'valid title draft still waits for explicit save'); checks++;
    await titleSubmit.click();
    await titleGroup.locator('.cc98-rebuild-blacklist-item').first().waitFor();
    assert.equal(await titleInput.inputValue(), '');
    assert(await titleStatus.isHidden());
    assert.equal(await titleInput.getAttribute('aria-invalid'), null);
    assert(await titleSubmit.isDisabled());
    assert((await getTitleRules()).includes('/^a{1,3}\\/b,comma$/i'), 'stored title regex preserves escaped slash and commas'); checks++;
    await expectTitleMatch('AA/b,comma');
    await expectTitleVisible('ZZ/b,comma'); checks++;
    await page.reload(); await titleInput.waitFor();
    assert.equal(await titleGroup.locator('.cc98-rebuild-blacklist-item').count(), 1, 'saved regex remains one rule after reload');
    await expectTitleMatch('AA/b,comma'); checks++;
    assert.deepEqual(errors, []);
    const result = { checks, realMV3: true, sharedEditorEmojiPicker: true, sixEmojiFamiliesAndDismissal: true, pickerViewportAndThemes: true, nativeMetricsAndLiveVoteChanges: true, undefinedAndZeroVoteHandling: true, metricsInConversationCache: true, metricsInFullTextResults: true, regexCacheIncludesMetrics: true, numericEditorAndLogicComposition: true, nativeEmotionCounting: true, quotesAndSignaturesExcluded: true, logicAndRegexPassed: true, regexTimeoutDoesNotBlockUI: true, editorValidationPersistenceAndDeletePassed: true, liveSyntaxValidation: true, imeValidationAfterComposition: true, draftValidationNeverMatchesOrWritesStorage: true, programmaticDraftValidation: true, titleLiteralAndRegexFiltering: true, titleNativeAndRebuiltPaths: true, titleRegexCommaAndSlashPreservation: true, titleRegexTimeoutFailsOpen: true, titleRuleChangesCancelStaleWork: true, titleEditorValidationAndPersistence: true, errors };
    await fs.writeFile(path.join(output, "validation.json"), JSON.stringify(result, null, 2)); console.log(result);
  } catch (error) {
    await fs.mkdir(output, { recursive: true });
    if (page) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); await fs.writeFile(path.join(output, "failure.html"), await page.content()); }
    throw error;
  } finally { await context.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
