const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const output = path.join(root, "outputs/private-message-pins-preview");
const owner = "12345", pinKey = `cc98RebornPrivateMessagePins:v1:uid:${owner}`;

async function main() {
  const records = { cc98ComfortSettings: { enabled: true, themeMode: "light", themePalette: "teal", emojiScale: 100, prewarmPostImages: false, previsitFirstPageForTopicImages: false }, "cc98RebornOpenIdBinding:v1": { bound: true, userId: owner, userName: "测试用户" } };
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let checks = 0;
  try {
    await context.exposeBinding("__pinStorage", async (_source, { method, keys, values }) => {
      if (method === "get") return keys === null ? structuredClone(records) : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => Object.hasOwn(records, key)).map(key => [key, records[key]]));
      const changes = {};
      for (const [key, value] of Object.entries(values || {})) { changes[key] = { oldValue: records[key], newValue: value }; records[key] = structuredClone(value); }
      for (const page of context.pages()) await page.evaluate(changes => window.__storageListeners?.forEach(listener => listener(changes, "local")), changes).catch(() => {});
      return null;
    });
    await context.addInitScript(({ owner }) => {
      localStorage.setItem("userInfo", JSON.stringify({ id: owner, name: "测试用户" }));
      localStorage.setItem("cc98RebornPinnedBoards:v1", JSON.stringify(["https://www.cc98.org/board/81"]));
      window.__storageListeners = [];
      window.chrome = { runtime: { getManifest: () => ({ version: "0.3.6" }), getURL: file => new URL(`/${file}`, location.origin).href, onMessage: { addListener() {} }, sendMessage(_value, callback) { callback?.({ ok: false }); return Promise.resolve({ ok: false }); } }, storage: { local: {}, onChanged: { addListener(listener) { __storageListeners.push(listener); } } } };
      chrome.storage.local.get = (keys, callback) => { const result = __pinStorage({ method: "get", keys }); if (callback) { result.then(callback); return; } return result; };
      chrome.storage.local.set = (values, callback) => { const result = __pinStorage({ method: "set", values }); if (callback) { result.then(callback); return; } return result; };
      chrome.storage.local.remove = (_keys, callback) => { callback?.(); return Promise.resolve(); };
    }, { owner });
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith("/uploads/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#638ba1"/></svg>' });
      const file = url.pathname.startsWith("/message/") ? path.join(root, "tests/private-message-sidebar.html") : path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try { return await route.fulfill({ path: file }); } catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on("pageerror", error => errors.push(error.message));
    const pin = id => page.locator(`#contact_${id} .cc98-message-pin`);
    const visualOrder = () => page.locator("#contact-list > [id^='contact_'], #contact-list > .cc98-message-pin-shortcut").evaluateAll(rows => rows.map(row => ({ uid: row.id.replace("contact_", "") || row.dataset.cc98PinnedUid, y: row.getBoundingClientRect().y })).sort((a, b) => a.y - b.y).map(row => row.uid));
    await page.goto(`${origin}/message/message?id=1001`);
    await pin(1002).waitFor(); await page.waitForFunction(() => !document.querySelector("#contact_1002 .cc98-message-pin").disabled);
    assert.deepEqual(records["cc98RebornPinnedBoards:v1"], [`${origin}/board/81`], "legacy page-local board pins must migrate into extension storage");
    const before = await page.evaluate(() => {
      const draft = document.getElementById("sidebar-draft"); draft.value = "保留置顶时的草稿"; draft.setSelectionRange(2, 5);
      window.__pinNativeRow = document.getElementById("contact_1002"); window.__pinDraft = draft;
      return { order: [...document.querySelectorAll("#contact-list > [id^='contact_']")].map(row => row.id), selected: __sidebarFixture.selected, switched: __sidebarFixture.switched, title: document.querySelector(".cc98-rebuild-message-hero h1")?.textContent };
    });
    await pin(1002).click();
    await page.waitForFunction(() => document.querySelector("#contact_1002 .cc98-message-pin").getAttribute("aria-pressed") === "true");
    assert.equal((await visualOrder())[0], "1002");
    const after = await page.evaluate(() => ({ order: [...document.querySelectorAll("#contact-list > [id^='contact_']")].map(row => row.id), selected: __sidebarFixture.selected, switched: __sidebarFixture.switched, title: document.querySelector(".cc98-rebuild-message-hero h1")?.textContent, sameRow: __pinNativeRow === document.getElementById("contact_1002"), sameDraft: __pinDraft === document.getElementById("sidebar-draft"), draft: __pinDraft.value, start: __pinDraft.selectionStart, end: __pinDraft.selectionEnd, unread: !document.querySelector("#contact_1002 .message-counterPerson").classList.contains("displaynone") }));
    assert.deepEqual(after.order, before.order); assert.equal(after.selected, before.selected); assert.equal(after.switched, before.switched); assert.equal(after.title, before.title);
    assert(after.sameRow && after.sameDraft && after.unread); assert.equal(after.draft, "保留置顶时的草稿"); assert.equal(after.start, 2); assert.equal(after.end, 5);
    assert.equal(records[pinKey][0].uid, "1002"); checks += 1;

    await pin(1003).focus(); await page.keyboard.press("Space");
    await page.waitForFunction(() => document.querySelector("#contact_1003 .cc98-message-pin").getAttribute("aria-pressed") === "true");
    assert.deepEqual((await visualOrder()).slice(0, 2), ["1003", "1002"]);
    await pin(1003).click(); await page.waitForFunction(() => document.querySelector("#contact_1003 .cc98-message-pin").getAttribute("aria-pressed") === "false");
    assert.deepEqual((await visualOrder()).slice(0, 3), ["1002", "1001", "1003"]); checks += 1;
    await page.locator("#contact_1002 .message-message-pName").click();
    assert.equal(await page.evaluate(() => __sidebarFixture.selected), 1002);
    assert(await page.locator("#contact_1002 .message-counterPerson").evaluate(node => node.classList.contains("displaynone"))); checks += 1;

    const second = await context.newPage(); second.on("pageerror", error => errors.push(error.message));
    await second.goto(`${origin}/message/message?id=1001`);
    await second.locator('#contact_1002 .cc98-message-pin[aria-pressed="true"]').waitFor();
    await pin(1004).click(); await second.locator('#contact_1004 .cc98-message-pin[aria-pressed="true"]').waitFor(); checks += 1;
    await page.reload(); await pin(1004).waitFor(); await page.waitForFunction(() => document.querySelector("#contact_1004 .cc98-message-pin").getAttribute("aria-pressed") === "true");
    assert.deepEqual((await visualOrder()).slice(0, 2), ["1004", "1002"]); checks += 1;

    await page.evaluate(() => document.getElementById("contact_1002").remove());
    const shortcut = page.locator('.cc98-message-pin-shortcut[data-cc98-pinned-uid="1002"]'); await shortcut.waitFor();
    await page.evaluate(() => __sidebarFixture.append({ id: 1002, name: "改名后的同学", preview: "新的消息", read: false }));
    await shortcut.waitFor({ state: "detached" }); assert.equal(await pin(1002).getAttribute("aria-pressed"), "true"); checks += 1;
    await page.locator("#more-control").click(); await pin(1013).waitFor(); assert.equal(await page.evaluate(() => __sidebarFixture.loadCalls), 1); checks += 1;

    await fs.mkdir(output, { recursive: true });
    for (const tone of ["light", "dark"]) {
      const old = records.cc98ComfortSettings; records.cc98ComfortSettings = { ...old, themeMode: tone };
      await page.evaluate(({ old, next }) => __storageListeners.forEach(listener => listener({ cc98ComfortSettings: { oldValue: old, newValue: next } }, "local")), { old, next: records.cc98ComfortSettings });
      await page.waitForFunction(tone => document.documentElement.dataset.cc98ComfortTone === tone, tone);
      await page.locator("#contact-list").evaluate(node => { node.scrollTop = 0; });
      await page.waitForTimeout(150);
      await page.locator(".message-message-people").screenshot({ path: path.join(output, `private-message-pins-${tone}.png`) });
      const overlap = await page.locator("#contact_1002").evaluate(row => { const a = row.querySelector(".cc98-message-pin").getBoundingClientRect(), b = row.querySelector(".message-counterPerson").getBoundingClientRect(); return a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y; });
      assert.equal(overlap, false); checks += 1;
    }
    await page.setViewportSize({ width: 390, height: 1000 }); await page.waitForTimeout(150);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); checks += 1;
    await page.evaluate(() => { localStorage.setItem("userInfo", JSON.stringify({ id: "67890", name: "另一个账号" })); CC98RebornPrivateMessagePins.mount(document.getElementById("native-message")); });
    await page.waitForFunction(() => !document.querySelector("#contact_1001 .cc98-message-pin").disabled);
    assert.equal(await page.locator('.cc98-message-pin[aria-pressed="true"]').count(), 0);
    await pin(1001).click();
    await page.waitForFunction(() => document.querySelector("#contact_1001 .cc98-message-pin").getAttribute("aria-pressed") === "true");
    assert.equal(records["cc98RebornPrivateMessagePins:v1:uid:67890"][0].uid, "1001");
    assert.deepEqual(records[pinKey].map(pin => pin.uid), ["1004", "1002"]); checks += 1;
    await page.evaluate(() => { localStorage.setItem("userInfo", JSON.stringify({ id: "12345", name: "测试用户" })); CC98RebornPrivateMessagePins.mount(document.getElementById("native-message")); document.getElementById("contact_1002").remove(); });
    await shortcut.waitFor();
    await shortcut.locator(".message-message-pName").click();
    await page.waitForURL(`${origin}/message/message?id=1002`); checks += 1;
    assert.deepEqual(errors, []);
    console.log(`private-message pins: ${checks} groups passed (native state, unpin, keyboard, storage sync, reload, absent contacts, async rows, account isolation and layout)`);
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
