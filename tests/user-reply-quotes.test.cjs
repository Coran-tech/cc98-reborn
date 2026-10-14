const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const output = path.join(root, "outputs/user-reply-quotes-preview");
const key = "cc98ComfortSettings";
const routePath = "/usercenter/myposts/ishot/0/1";

async function main() {
  const baseline = process.argv.includes("--baseline");
  let settings = { enabled: true, themeMode: "light", themePalette: "teal", emojiScale: 100, prewarmPostImages: false, previsitFirstPageForTopicImages: false };
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  let checks = 0;
  try {
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeBinding("__replyStorage", (_source, { operation, values }) => {
      if (operation === "get") return { [key]: settings, "cc98RebornOpenIdBinding:v1": { bound: true, userId: 12345, userName: "测试用户", boundAt: Date.now() } };
      if (values?.[key]) settings = values[key];
      return null;
    });
    await page.addInitScript(() => {
      window.__storageListeners = [];
      window.chrome = {
        runtime: { getManifest: () => ({ version: "0.3.6" }), getURL: file => new URL(`/${file}`, location.origin).href, onMessage: { addListener() {} }, sendMessage(_value, callback) { callback?.({ ok: false }); return Promise.resolve({ ok: false }); } },
        storage: { local: {}, onChanged: { addListener(listener) { __storageListeners.push(listener); } } }
      };
      chrome.storage.local.get = (keys, callback) => { const promise = __replyStorage({ operation: "get" }); if (callback) { promise.then(callback); return; } return promise; };
      chrome.storage.local.set = (values, callback) => { const promise = __replyStorage({ operation: "set", values }); if (callback) { promise.then(callback); return; } return promise; };
      chrome.storage.local.remove = (_keys, callback) => { callback?.(); return Promise.resolve(); };
    });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith("/uploads/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#638ba1"/><text x="160" y="90" text-anchor="middle" fill="white" font-size="24">引用内图片</text></svg>' });
      if (url.pathname.startsWith("/topic/")) return route.fulfill({ contentType: "text/html", body: "<title>原帖跳转</title>原帖" });
      const file = url.pathname.startsWith("/usercenter/") ? path.join(root, "tests/user-reply-quotes.html") : path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try {
        if (baseline && url.pathname === "/src/content.js") {
          const body = (await fs.readFile(file, "utf8")).replace(/function appendMultilineInlineUbb\(target, source\) \{[\s\S]*?(?=\nfunction bindUserReplyContentNavigation)/,
            'function appendMultilineInlineUbb(target, source) { String(source ?? "").split(/\\r?\\n/).forEach((line, index) => { if (index > 0) target.append(document.createElement("br")); appendInlineUbbText(target, line); }); }\n');
          return route.fulfill({ contentType: "text/javascript", body });
        }
        return route.fulfill({ path: file });
      } catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    const content = id => page.locator(`#${id} .cc98-rebuild-user-reply-ubb`);
    const quotes = id => content(id).locator(".cc98-local-experimental-quote");
    async function load() {
      await page.goto(`${origin}${routePath}`);
      await content("nested").waitFor();
      await page.waitForTimeout(500);
    }
    async function changeSettings(patch) {
      const previous = settings;
      settings = { ...settings, ...patch };
      await page.evaluate(({ previous, next, key }) => __storageListeners.forEach(listener => listener({ [key]: { oldValue: previous, newValue: next } }, "local")), { previous, next: settings, key });
    }
    await fs.mkdir(output, { recursive: true });
    await load();
    if (baseline) {
      assert.equal(await quotes("nested").count(), 0);
      assert.match(await content("nested").innerText(), /\[quote\]/);
      await page.screenshot({ path: path.join(output, "user-reply-quotes-before.png") });
      console.log("user-reply quotes: previous line renderer reproduces literal nested [quote] blocks");
      return;
    }

    assert.equal(await quotes("nested").count(), 2);
    assert.equal(await content("nested").locator("blockquote > blockquote").count(), 1);
    assert.doesNotMatch(await content("nested").innerText(), /\[\/?quote\]/i);
    assert.match(await quotes("nested").last().innerText(), /计算器需要买/);
    assert.equal(await content("nested").locator(':scope > a[href*="6094641"]').count(), 1, "own response must stay outside both quotes");
    assert.equal(await quotes("quote-only").count(), 1);
    assert.equal(await quotes("siblings").count(), 2);
    assert.equal(await content("siblings").locator("blockquote blockquote").count(), 0);
    checks += 1;

    assert.equal(await content("multiline").locator("strong br").count(), 1);
    assert.equal(await content("multiline").locator("a br").count(), 1);
    assert.equal(await quotes("literal").count(), 1);
    assert.match(await content("literal").locator(".ubb-code").innerText(), /\[quote\]代码里的引用标记\[\/quote\]/);
    assert.match(await content("literal").locator("code.cc98-local-experimental-noubb").innerText(), /\[quote\]原样显示\[\/quote\]/);
    assert.equal(await content("unsafe").locator("img").count(), 0);
    assert.equal(await content("unsafe").locator("a").getAttribute("href"), "#");
    assert.equal(await page.evaluate(() => window.__injected), undefined);
    assert.equal(await page.locator("#plain .cc98-rebuild-user-reply-ubb").count(), 0);
    checks += 1;

    const image = content("nested").locator('img[src*="reply-chart"]');
    await image.evaluate(image => image.decode());
    await quotes("quote-only").locator('img[src*="quoted-chart"]').evaluate(image => image.decode());
    assert.equal(await quotes("quote-only").locator("img.cc98-rebuild-inline-emoji").count(), 1);
    const emoji = content("nested").locator("img.cc98-rebuild-inline-emoji");
    assert.equal(await emoji.count(), 1);
    const originalHref = `${origin}/topic/6656303/1#3`;
    assert.equal(await content("nested").locator('a[href*="#3"]').evaluate(link => link.href), originalHref);
    await page.evaluate(() => { window.__replyDom = document.querySelector("#nested .cc98-rebuild-user-reply-ubb"); stabilizeNativeUserCenter(document.getElementById("fixture-router")); });
    assert(await page.evaluate(() => __replyDom === document.querySelector("#nested .cc98-rebuild-user-reply-ubb")), "observer must not reparse links inside an already-rendered reply");
    checks += 1;

    const measurements = [];
    for (const tone of ["light", "dark"]) {
      await changeSettings({ themeMode: tone });
      await page.waitForFunction(tone => document.documentElement.dataset.cc98ComfortTone === tone, tone);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1050 });
        await page.waitForTimeout(200);
        const size = await content("nested").evaluate(node => {
          const quote = node.querySelector("blockquote"), inner = quote.querySelector("blockquote");
          const rect = quote.getBoundingClientRect(), nested = inner.getBoundingClientRect(), css = getComputedStyle(quote);
          return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, outerX: rect.x, innerX: nested.x, outerWidth: rect.width, innerWidth: nested.width, background: css.backgroundColor, border: css.borderLeftColor, expectedBorder: getComputedStyle(document.documentElement).getPropertyValue("--cc98-comfort-secondary").trim() };
        });
        assert(size.scrollWidth <= width + 1, `horizontal overflow ${JSON.stringify(size)}`);
        assert(size.innerX > size.outerX && size.innerWidth < size.outerWidth, "each level must indent inside its parent");
        assert.notEqual(size.background, "rgba(0, 0, 0, 0)");
        const expectedBorder = await page.evaluate(value => { const node = document.createElement("span"); node.style.color = value; document.body.append(node); const color = getComputedStyle(node).color; node.remove(); return color; }, size.expectedBorder);
        assert.equal(size.border, expectedBorder);
        measurements.push({ tone, ...size });
        await page.screenshot({ path: path.join(output, `user-reply-quotes-${width}-${tone}.png`) });
        checks += 1;
      }
    }
    await changeSettings({ emojiScale: 200 });
    await page.waitForTimeout(200);
    const emojiSize = await emoji.evaluate(image => ({ height: image.getBoundingClientRect().height, fontSize: parseFloat(getComputedStyle(image).fontSize) }));
    assert(Math.abs(emojiSize.height - emojiSize.fontSize * 3.5) < 1);
    checks += 1;

    await page.evaluate(() => { __replyFixture.render(); __replyFixture.add("late", "[quote]翻页后的引用\n[quote]下一层[/quote][/quote]\n回复内容"); });
    await quotes("late").nth(1).waitFor();
    assert.equal(await quotes("nested").count(), 2);
    checks += 1;

    await page.setViewportSize({ width: 1440, height: 1050 });
    await content("quote-only").focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(`${origin}/topic/6656303/2#7`);
    await load();
    await content("nested").locator('a[href*="#3"]').click();
    await page.waitForURL(`${origin}/topic/6656303#3`);
    await load();
    await content("nested").click({ position: { x: 5, y: 5 } });
    await page.waitForURL(`${origin}/topic/6656303/2#7`);
    checks += 1;
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, "measurements.json"), JSON.stringify(measurements, null, 2));
    console.log(`user-reply quotes: ${checks} groups passed (nested/multiline/raw safety/media/theme/layout/async/navigation)`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
