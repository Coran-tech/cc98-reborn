const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const output = path.join(root, "outputs/private-message-emoji-preview");
const storageKey = "cc98ComfortSettings";
const knownIds = ["mixed-ac", "mixed-tb", "mixed-cc98", "mixed-mahjong", "only-ac", "notice-ac", "notice-tb", "known-srcset", "known-picture"];
const regularIds = ["regular-upload", "regular-emoji", "regular-face", "message-avatar", "regular-srcset", "regular-picture", "picture-mobile-source"];
const settingsFor = (patch = {}) => ({ enabled: true, themeMode: "light", themePalette: "teal", themeDayStart: "07:00", themeNightStart: "19:00", themeCustomPrimary: "#1f7166", themeCustomSecondary: "#326b9b", emojiScale: 100, prewarmPostImages: false, previsitFirstPageForTopicImages: false, ...patch });

async function main() {
  const baseline = process.argv.includes("--baseline");
  const captureDark = process.argv.includes("--capture-dark");
  let storedSettings = settingsFor({ themeMode: captureDark ? "dark" : "light" });
  const errors = [];
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  let checks = 0;
  const measurements = [];
  try {
    page.on("pageerror", (error) => errors.push(error.message));
    await page.exposeBinding("__privateEmojiStorage", (_source, { operation, key, values }) => {
      if (operation === "get") {
        const names = typeof key === "string" ? [key] : Array.isArray(key) ? key : key && typeof key === "object" ? Object.keys(key) : [];
        return Object.fromEntries(names.filter((name) => name === storageKey).map((name) => [name, storedSettings]));
      }
      if (values?.[storageKey]) storedSettings = values[storageKey];
      return null;
    });
    await page.addInitScript(() => {
      window.__storageListeners = [];
      window.chrome = {
        runtime: { getManifest: () => ({ version: "0.3.6" }), getURL: (file) => new URL(`/${file}`, location.origin).href, onMessage: { addListener() {} }, sendMessage(_value, callback) { callback?.({ ok: false }); return Promise.resolve({ ok: false }); } },
        storage: { local: {}, onChanged: { addListener(listener) { window.__storageListeners.push(listener); } } }
      };
      chrome.storage.local.get = (key, callback) => { const promise = __privateEmojiStorage({ operation: "get", key }); if (callback) { promise.then(callback); return; } return promise; };
      chrome.storage.local.set = (values, callback) => { const promise = __privateEmojiStorage({ operation: "set", values }); if (callback) { promise.then(callback); return; } return promise; };
      chrome.storage.local.remove = (_key, callback) => { callback?.(); return Promise.resolve(); };
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith("/uploads/")) return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#638ba1"/><text x="100" y="58" text-anchor="middle" fill="white" font-size="18">聊天图片</text></svg>` });
      const file = url.pathname.startsWith("/message/") ? path.join(root, "tests/private-message-emoji.html")
        : baseline && url.pathname === "/src/content.js" ? path.join(output, "private-message-before-content.js")
        : baseline && url.pathname === "/src/styles.css" ? path.join(output, "private-message-before.css")
        : path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try { return await route.fulfill({ path: file }); }
      catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    async function changeSettings(patch) {
      const previous = storedSettings;
      storedSettings = { ...storedSettings, ...patch };
      await page.evaluate(({ previous, next, key }) => { for (const listener of __storageListeners) listener({ [key]: { oldValue: previous, newValue: next } }, "local"); }, { previous, next: storedSettings, key: storageKey });
    }
    async function checkEmoji(ids = knownIds, scale = storedSettings.emojiScale) {
      for (const id of ids) {
        await page.waitForFunction((id) => document.getElementById(id)?.classList.contains("cc98-rebuild-inline-emoji"), id, { timeout: 6000 });
        const value = await page.locator(`#${id}`).evaluate((image) => { const css = getComputedStyle(image), rect = image.getBoundingClientRect(); return { width: rect.width, height: rect.height, fontSize: parseFloat(css.fontSize), display: css.display, src: image.getAttribute("src"), regular: image.classList.contains("cc98-rebuild-content-image") }; });
        const expected = 1.75 * scale / 100 * value.fontSize;
        assert(Math.abs(value.height - expected) <= 1, `${id}/${scale}: expected emoji height ${expected}, got ${value.height}`);
        assert(value.width <= expected + 1 && value.width > 1, `${id}/${scale}: oversized emoji width ${value.width}`);
        assert.equal(value.display, "inline-block");
        assert.equal(value.regular, false);
        measurements.push({ id, scale, ...value });
      }
    }
    async function captureState() {
      await page.evaluate(() => {
        const textarea = document.getElementById("message-draft");
        textarea.value = "保留草稿内容\n第二行 😀";
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(2, 6);
        document.getElementById("chat-scroll").scrollTop = 350;
        window.scrollTo(0, 120);
        window.__emojiState = { app: document.getElementById("cc98-comfort-app"), native: document.getElementById("native-message"), scroll: document.getElementById("chat-scroll"), textarea, value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd, inner: document.getElementById("chat-scroll").scrollTop, outer: scrollY, messages: document.querySelectorAll("#chat-scroll > div").length };
      });
    }
    async function assertState(label, messages = true, preserveScroll = true) {
      const state = await page.evaluate(() => {
        const s = window.__emojiState;
        return { app: s.app === document.getElementById("cc98-comfort-app"), native: s.native === document.getElementById("native-message"), scroll: s.scroll === document.getElementById("chat-scroll"), textarea: s.textarea === document.getElementById("message-draft"), value: s.textarea.value, expected: s.value, start: s.textarea.selectionStart, expectedStart: s.start, end: s.textarea.selectionEnd, expectedEnd: s.end, inner: s.scroll.scrollTop, expectedInner: s.inner, outer: scrollY, expectedOuter: s.outer, messages: document.querySelectorAll("#chat-scroll > div").length, expectedMessages: s.messages };
      });
      assert(state.app && state.native && state.scroll && state.textarea, `${label}: rebuilt message DOM ${JSON.stringify(state)}`);
      assert.equal(state.value, state.expected, `${label}: draft value`);
      assert.equal(state.start, state.expectedStart, `${label}: selection start`);
      assert.equal(state.end, state.expectedEnd, `${label}: selection end`);
      if (preserveScroll) {
        assert(Math.abs(state.inner - state.expectedInner) <= 1, `${label}: message scroll ${state.inner} != ${state.expectedInner}`);
        assert(Math.abs(state.outer - state.expectedOuter) <= 1, `${label}: page scroll ${state.outer} != ${state.expectedOuter}`);
      }
      if (messages) assert.equal(state.messages, state.expectedMessages, `${label}: messages removed/merged`);
    }
    async function regularDimensions() {
      return page.evaluate((ids) => Object.fromEntries(ids.map((id) => { const image = document.getElementById(id); const box = image.getBoundingClientRect(); return [id, { width: box.width, height: box.height, src: image.getAttribute("src"), srcset: image.getAttribute("srcset"), emoji: image.classList.contains("cc98-rebuild-inline-emoji") }]; })), regularIds);
    }

    await page.goto(`${origin}/message/message?id=1001`);
    await page.locator("#cc98-comfort-app .cc98-rebuild-native-message").waitFor();
    await page.waitForTimeout(1600);
    await fs.mkdir(output, { recursive: true });
    if (baseline) {
      await page.evaluate(() => __messageFixture.render("B"));
      await page.waitForTimeout(350);
      const image = await page.locator("#mixed-ac").evaluate((image) => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, marked: image.classList.contains("cc98-rebuild-inline-emoji") }));
      assert(image.height >= 150 && !image.marked, `before runtime should reproduce oversized replacement emoji: ${JSON.stringify(image)}`);
      await page.screenshot({ path: path.join(output, "private-message-emoji-before.png"), fullPage: true, animations: "disabled" });
      console.log(`private-message emoji baseline reproduced: ${image.width}x${image.height}, marked=${image.marked}`);
      return;
    }
    if (captureDark) {
      await checkEmoji();
      assert.match(await page.locator("#mixed-ac").getAttribute("src"), /\/images\/ac1\/01\.png$/);
      await page.screenshot({ path: path.join(output, "private-message-emoji-after-dark.png"), fullPage: true, animations: "disabled" });
      assert.deepEqual(errors, []);
      console.log("private-message emoji dark preview captured; known assets have the expected size and AC1 bank");
      return;
    }
    await checkEmoji();
    const regular = await regularDimensions();
    assert(Object.values(regular).every((image) => !image.emoji), `regular photos/avatar mislabeled as emoji: ${JSON.stringify(regular)}`);
    await captureState();
    checks += 1;

    // React replacing the conversation must be handled by the normal observer.
    const immediatelyMarked = await page.evaluate(async () => {
      __messageFixture.render("B");
      await new Promise(requestAnimationFrame);
      return document.getElementById("mixed-ac").classList.contains("cc98-rebuild-inline-emoji");
    });
    assert.equal(immediatelyMarked, true, "new chat emoji must be classified before the next paint");
    await page.waitForTimeout(250);
    await checkEmoji();
    await assertState("conversation replacement");
    assert.deepEqual(await regularDimensions(), regular);
    checks += 1;

    // Added images and late lazy-source attributes are recognized without a manual refresh.
    await page.evaluate(() => __messageFixture.addImage("late-ac", "src", "/images/ac/03.png"));
    await checkEmoji(["late-ac"]);
    await page.evaluate(() => __messageFixture.addImage("lazy-tb", null));
    assert.equal(await page.locator("#lazy-tb").evaluate((image) => image.classList.contains("cc98-rebuild-inline-emoji")), false);
    await page.locator("#lazy-tb").evaluate((image) => image.setAttribute("data-src", "/images/tb/tb02.png"));
    await checkEmoji(["lazy-tb"]);
    assert.match(await page.locator("#lazy-tb").getAttribute("src"), /\/images\/tb\/tb02\.png$/);
    await assertState("lazy emoji insertion");
    await page.evaluate(() => __messageFixture.addImage("lazy-srcset", "data-srcset", "/images/ac/07.png 1x, /images/ac/08.png 2x"));
    await checkEmoji(["lazy-srcset"]);
    assert.equal(await page.locator("#lazy-srcset").getAttribute("srcset"), null, "lazy metadata must not create a plugin-owned srcset");
    assert.equal(await page.locator("#lazy-srcset").getAttribute("data-srcset"), "/images/ac/07.png 1x, /images/ac/08.png 2x");
    checks += 1;

    // Scale changes and dark AC variants are applied in place to all message text surfaces.
    const allEmoji = [...knownIds, "late-ac", "lazy-tb", "lazy-srcset"];
    for (const scale of [70, 200, 100]) {
      await changeSettings({ emojiScale: scale });
      await page.waitForTimeout(180);
      await checkEmoji(allEmoji, scale);
      await assertState(`emoji scale ${scale}`);
      assert.deepEqual(await regularDimensions(), regular, `scale ${scale} changed normal photos/avatar`);
    }
    checks += 3;
    await changeSettings({ themeMode: "dark" });
    await checkEmoji(allEmoji);
    assert.match(await page.locator("#mixed-ac").getAttribute("src"), /\/images\/ac1\/01\.png$/);
    assert.match(await page.locator("#mixed-tb").getAttribute("src"), /\/images\/tb\/tb01\.png$/);
    assert.match(await page.locator("#mixed-cc98").getAttribute("src"), /\/images\/CC98\/CC9801\.gif$/);
    assert.match(await page.locator("#mixed-mahjong").getAttribute("src"), /\/images\/mahjong\/face2017\/180\.png$/);
    assert.match(await page.locator("#known-srcset").getAttribute("srcset"), /\/images\/ac1\/03\.png 1x/);
    assert.match(await page.locator("#known-picture-source").getAttribute("srcset"), /\/images\/ac1\/04\.png 1x/);
    assert.deepEqual(await regularDimensions(), regular, "dark tone changed a responsive photo fallback/avatar");
    await assertState("dark tone");
    await changeSettings({ themeMode: "light" });
    await checkEmoji(allEmoji);
    assert.match(await page.locator("#mixed-ac").getAttribute("src"), /\/images\/ac\/01\.png$/);
    await assertState("light tone");
    checks += 1;

    // React can reuse an image slot for an upload after showing a known emoji.
    await page.locator("#lazy-tb").evaluate((image) => { image.removeAttribute("data-src"); image.src = "/uploads/face-photo.png"; image.width = 160; });
    await page.waitForFunction(() => !document.getElementById("lazy-tb").classList.contains("cc98-rebuild-inline-emoji"));
    const reused = await page.locator("#lazy-tb").evaluate((image) => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height }));
    assert.equal(reused.width, 160);
    assert.equal(reused.height, 80);
    // An explicitly new upload can naturally change the native layout height;
    // only extension setting changes are required to retain numeric scroll offsets.
    await assertState("reused upload image slot", true, false);
    await page.locator("#known-picture-source").evaluate((source) => source.setAttribute("srcset", "/uploads/new-picture-photo.png"));
    await page.locator("#known-picture").evaluate((image) => { image.src = "/uploads/new-picture-photo.png"; image.width = 160; });
    await page.waitForFunction(() => !document.getElementById("known-picture").classList.contains("cc98-rebuild-inline-emoji"));
    assert.equal(await page.locator("#known-picture").evaluate((image) => image.getBoundingClientRect().width), 160);
    await page.locator("#lazy-srcset").evaluate((image) => { image.src = "/uploads/lazy-face-photo.png"; image.setAttribute("data-srcset", "/uploads/lazy-face-photo.png 1x"); image.width = 160; });
    await page.waitForFunction(() => !document.getElementById("lazy-srcset").classList.contains("cc98-rebuild-inline-emoji"));
    assert.equal(await page.locator("#lazy-srcset").getAttribute("srcset"), null);
    assert.equal(await page.locator("#lazy-srcset").evaluate((image) => image.getBoundingClientRect().width), 160);
    await assertState("responsive/lazy image slot reuse", true, false);
    checks += 1;

    await page.evaluate(() => { scrollTo(0, 0); document.getElementById("chat-scroll").scrollTop = 0; });
    await page.screenshot({ path: path.join(output, "private-message-emoji-after.png"), fullPage: true, animations: "disabled" });
    await fs.writeFile(path.join(output, "measurements.json"), JSON.stringify(measurements, null, 2));
    assert.deepEqual(errors, []);
    console.log(`private-message-emoji: ${checks} full-content browser checks passed (dynamic DOM, lazy URLs, scale, tone, normal images, drafts and scroll)`);
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
