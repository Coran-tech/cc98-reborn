const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "http://127.0.0.1:8765";
const storage = new Map();
const writes = [];
const heldReads = [];
const select = (name) => `[data-user-note="${name}"]`;
const key = (owner, target) => `cc98RebornUserNote:uid:${owner}:user:${target}`;

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1160, height: 1000 } });
  const errors = [];
  const pages = [];
  let checks = 0;
  try {
    await context.exposeBinding("__noteStorageCall", async ({ page }, payload) => {
      if (payload.fail && payload.operation !== "get") throw new Error("fixture storage unavailable");
      if (payload.operation === "get") {
        const requested = payload.keys;
        const names = requested == null ? [...storage.keys()] : typeof requested === "string" ? [requested] : Array.isArray(requested) ? requested : Object.keys(requested);
        // Snapshot before the artificial delay so a new onChanged value can
        // arrive before a genuinely stale read response, as in a real race.
        const result = Object.fromEntries(names.map((name) => [name, storage.has(name) ? storage.get(name) : typeof requested === "object" && requested != null && !Array.isArray(requested) ? requested[name] : undefined]).filter(([, value]) => value !== undefined));
        if (payload.holdRead) await new Promise((resolve) => { heldReads.push(resolve); });
        if (payload.delay) await new Promise((resolve) => setTimeout(resolve, payload.delay));
        return result;
      }
      if (payload.delay) await new Promise((resolve) => setTimeout(resolve, payload.delay));
      const changes = {};
      if (payload.operation === "set") {
        for (const [name, value] of Object.entries(payload.values)) {
          changes[name] = { oldValue: storage.get(name), newValue: value };
          storage.set(name, value);
          writes.push({ operation: "set", name, value });
        }
      } else if (payload.operation === "remove") {
        for (const name of typeof payload.keys === "string" ? [payload.keys] : payload.keys) {
          changes[name] = { oldValue: storage.get(name) };
          storage.delete(name);
          writes.push({ operation: "remove", name });
        }
      } else throw new Error(`Unknown storage operation: ${payload.operation}`);
      for (const target of pages) {
        if (target.isClosed()) continue;
        // A real extension receives this event in every tab, including the writer.
        await target.evaluate((changed) => {
          for (const listener of window.__storageListeners || []) listener(changed, "local");
        }, changes).catch((error) => { if (!target.isClosed()) throw error; });
      }
      return null;
    });
    await context.addInitScript(() => {
      window.__storageListeners = [];
      window.chrome = { runtime: {}, storage: { local: {}, onChanged: {
        addListener(listener) { window.__storageListeners.push(listener); },
        removeListener(listener) { window.__storageListeners = window.__storageListeners.filter((entry) => entry !== listener); }
      } } };
      function request(operation, values, callback) {
        const payload = { operation, fail: window.__noteStorageFail || false, delay: window.__noteStorageDelay || 0 };
        payload.holdRead = operation === "get" && window.__noteStorageHoldGet === true;
        window.__noteStorageFail = false;
        if (operation === "set") payload.values = values;
        else payload.keys = values;
        const promise = window.__noteStorageCall(payload);
        if (typeof callback !== "function") return promise;
        promise.then((result) => callback(result), (error) => {
          chrome.runtime.lastError = { message: error.message };
          try { callback(); } finally { delete chrome.runtime.lastError; }
        });
        return undefined;
      }
      chrome.storage.local.get = (keys, callback) => request("get", keys, callback);
      chrome.storage.local.set = (values, callback) => request("set", values, callback);
      chrome.storage.local.remove = (keys, callback) => request("remove", keys, callback);
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const file = /^\/(?:usercenter|user|topic)\//.test(url.pathname)
        ? path.join(root, "tests/local-user-notes.html")
        : path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try { return await route.fulfill({ path: file }); }
      catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    async function createPage(url = "/usercenter/myfollowings", { readDelay = 0, holdReads = false } = {}) {
      const page = await context.newPage();
      pages.push(page);
      page.setDefaultTimeout(10000);
      page.on("pageerror", (error) => errors.push(error.message));
      if (readDelay) await page.addInitScript((delay) => { window.__noteStorageDelay = delay; }, readDelay);
      if (holdReads) await page.addInitScript(() => { window.__noteStorageHoldGet = true; });
      await page.goto(`${origin}${url}`);
      await page.waitForFunction(() => window.__fixtureReady === true);
      return page;
    }
    const page = await createPage();
    const followerEdit = (target = "1001") => page.locator(`.user-center-myfollowings-user ${select("edit")}[data-user-note-uid="${target}"]`);
    const postLabel = (target = "a") => page.locator(`#post-${target} ${select("label")}`);
    const closeWait = () => page.locator(select("dialog")).waitFor({ state: "detached" });
    const save = async (note) => {
      await page.locator(select("input")).fill(note);
      await page.locator(select("save")).click();
      await closeWait();
    };
    const names = () => page.locator(".fixture-original-name").allTextContents();
    const originalNames = await names();
    const urlBefore = page.url();

    // Mounting repeatedly must not create duplicate actions.
    await page.evaluate(() => {
      CC98RebornUserNotes.mount(document.getElementById("router"));
      CC98RebornUserNotes.mount(document.getElementById("router"));
      __fixture.decorate();
      __fixture.decorate();
    });
    assert.equal(await followerEdit().count(), 1);
    assert.equal(await followerEdit("1002").count(), 1);
    checks += 1;

    // Native following-card entry writes one owner/target key, then updates authors.
    await followerEdit().click();
    const dialog = page.locator(select("dialog"));
    assert.equal(await dialog.getAttribute("role"), "dialog");
    assert.equal(await dialog.getAttribute("aria-modal"), "true");
    await save("实验室的同学 😀");
    assert.equal(storage.get(key("9001", "1001")), "实验室的同学 😀");
    await postLabel().waitFor();
    assert((await postLabel().innerText()).includes("实验室的同学 😀"));
    assert.equal(await postLabel("b").count(), 0);
    assert.equal(await postLabel("anonymous").count(), 0);
    assert.equal(await postLabel("missing-uid").count(), 0);
    assert.deepEqual(await names(), originalNames, "the forum's names must remain unchanged");
    assert.equal(page.url(), urlBefore, "editing a note must not navigate the foreground");
    checks += 1;

    // A username change retains the note because matching uses the UID.
    await page.evaluate(() => {
      document.querySelector("#post-a .fixture-original-name").textContent = "改名后的用户";
      CC98RebornUserNotes.decorateAuthor(document.querySelector("#post-a .fixture-author"), { uid: "1001", name: "改名后的用户", anonymous: false });
    });
    assert.equal(await page.locator("#post-a .fixture-original-name").innerText(), "改名后的用户");
    assert((await postLabel().innerText()).includes("实验室的同学 😀"));
    assert.equal(await postLabel().count(), 1);
    checks += 1;

    // The real site has nested duplicate #userId nodes and name routes: only
    // the profile's private-message target provides the UID in this case.
    await page.evaluate(() => __fixture.route("/user/name/原用户名"));
    const profileEdit = page.locator(`.user-profile ${select("edit")}[data-user-note-uid="1001"]`);
    await profileEdit.click();
    assert.equal(await page.locator(select("input")).inputValue(), "实验室的同学 😀");
    await save("共同项目的伙伴");
    await page.waitForFunction(() => document.querySelector("#post-a [data-user-note='label']")?.textContent.includes("共同项目的伙伴"));
    assert.equal(storage.get(key("9001", "1001")), "共同项目的伙伴");
    assert.equal(await page.locator("#following-a .fixture-original-name").innerText(), "原用户名");
    assert.equal(await page.evaluate(() => [...document.querySelector(".user-profile #userId > p:first-child").childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.nodeValue).join("")), "原用户名");
    checks += 1;

    // A new /id route must not let the previous profile DOM's UID receive edits.
    await page.evaluate(() => __fixture.route("/user/id/1002"));
    assert.equal(await page.locator(`.user-profile ${select("edit")}`).count(), 0);
    await page.evaluate(() => __fixture.route("/user/name/原用户名"));
    assert.equal(await profileEdit.count(), 1);
    checks += 1;

    // The editor and normalization enforce the shared maximum without corrupting Unicode.
    await profileEdit.click();
    await page.locator(select("input")).fill("字".repeat(90));
    await page.locator(select("save")).click();
    await closeWait();
    assert.equal(Array.from(storage.get(key("9001", "1001"))).length, 80);
    await profileEdit.click();
    await save("共同项目的伙伴");
    checks += 1;

    // The independently mounted second page receives chrome.storage.onChanged.
    const second = await createPage("/topic/12345");
    await second.waitForFunction(() => document.querySelector("#post-a [data-user-note='label']")?.textContent.includes("共同项目的伙伴"));
    await profileEdit.click();
    await save("跨标签页同步");
    await second.waitForFunction(() => document.querySelector("#post-a [data-user-note='label']")?.textContent.includes("跨标签页同步"));
    await second.reload();
    await second.waitForFunction(() => window.__fixtureReady && document.querySelector("#post-a [data-user-note='label']")?.textContent.includes("跨标签页同步"));
    checks += 1;

    // Saving text that resembles markup is always rendered as text.
    const htmlNote = '<img src=x onerror="window.userNoteXss=true">';
    await profileEdit.click();
    await save(htmlNote);
    assert((await postLabel().innerText()).includes(htmlNote));
    assert.equal(await page.locator(`${select("label")} img`).count(), 0);
    assert.equal(await page.evaluate(() => window.userNoteXss), undefined);
    checks += 1;

    // A failed write neither changes visible notes nor closes the editable dialog.
    await profileEdit.click();
    await page.locator(select("input")).fill("不能保存的备注");
    await page.evaluate(() => { window.__noteStorageFail = true; });
    await page.locator(select("save")).click();
    await page.waitForFunction(() => document.querySelector("[data-user-note='status']")?.textContent.trim());
    assert(await dialog.isVisible());
    assert.equal(storage.get(key("9001", "1001")), htmlNote);
    assert((await postLabel().innerText()).includes(htmlNote));
    await page.locator(select("save")).click();
    await closeWait();
    assert.equal(storage.get(key("9001", "1001")), "不能保存的备注");
    checks += 1;

    // ESC closes a dialog and restores the trigger's focus. Tab stays in the dialog.
    await profileEdit.click();
    await page.keyboard.press("Shift+Tab");
    assert(await page.evaluate(() => document.querySelector("[data-user-note='dialog']")?.contains(document.activeElement)));
    await page.keyboard.press("Tab");
    assert(await page.evaluate(() => document.querySelector("[data-user-note='dialog']")?.contains(document.activeElement)));
    await page.keyboard.press("Escape");
    await closeWait();
    assert(await profileEdit.evaluate((node) => node === document.activeElement));
    checks += 1;

    // A second target cannot replace or erase the first target's independent record.
    await page.evaluate(() => __fixture.route("/usercenter/myfollowings"));
    await followerEdit("1002").click();
    await save("另一位同学");
    assert.equal(storage.get(key("9001", "1001")), "不能保存的备注");
    assert.equal(storage.get(key("9001", "1002")), "另一位同学");
    checks += 1;

    // Owner changes discard old labels. A write belongs to the newly logged-in owner.
    await page.evaluate(() => __fixture.account("9002"));
    await page.waitForFunction(() => document.querySelectorAll("#post-a [data-user-note='label'], #post-b [data-user-note='label']").length === 0);
    await followerEdit().click();
    assert.equal(await page.locator(select("input")).inputValue(), "");
    await save("账号二的私人备注");
    assert.equal(storage.get(key("9002", "1001")), "账号二的私人备注");
    assert.equal(storage.get(key("9001", "1001")), "不能保存的备注");
    await page.evaluate(() => __fixture.account("9001"));
    await page.waitForFunction(() => document.querySelector("#post-a [data-user-note='label']")?.textContent.includes("不能保存的备注"));
    checks += 1;

    // An open dialog cannot write another account after the owner changes.
    await followerEdit().click();
    await page.locator(select("input")).fill("切换账号后不能串号");
    await page.evaluate(() => __fixture.account("9002"));
    await closeWait();
    assert.equal(storage.get(key("9001", "1001")), "不能保存的备注");
    assert.equal(storage.get(key("9002", "1001")), "账号二的私人备注");
    await page.evaluate(() => __fixture.account("9001"));
    checks += 1;

    // Explicit clear removes only the selected record and updates the other tab.
    await followerEdit().click();
    await page.locator(select("clear")).click();
    await closeWait();
    await page.waitForFunction(() => !document.querySelector("#post-a [data-user-note='label']"));
    await second.waitForFunction(() => !document.querySelector("#post-a [data-user-note='label']"));
    assert.equal(storage.has(key("9001", "1001")), false);
    assert.equal(storage.get(key("9001", "1002")), "另一位同学");
    assert.equal(storage.get(key("9002", "1001")), "账号二的私人备注");
    checks += 1;

    // Guests have no reliable account UID and cannot access notes or write a shared guest record.
    await page.evaluate(() => __fixture.account("guest"));
    await page.waitForFunction(() => document.querySelectorAll("[data-user-note='label']").length === 0);
    const guestEntries = page.locator(select("edit"));
    for (let index = 0; index < await guestEntries.count(); index += 1) assert(!(await guestEntries.nth(index).isVisible()) || await guestEntries.nth(index).isDisabled());
    assert([...storage.keys()].every((name) => !name.includes("guest")));
    await page.evaluate(() => __fixture.account("9001"));
    await followerEdit().click();
    await save("一起做项目的同学");
    checks += 1;

    // A visible native log-in link overrides stale account data left in storage.
    await page.evaluate(() => {
      const topbar = document.createElement("div");
      topbar.className = "topBarUserInfo";
      topbar.id = "fixture-guest-topbar";
      topbar.innerHTML = '<a href="/logOn">登录</a>';
      document.body.prepend(topbar);
      CC98RebornUserNotes.sync();
    });
    await page.waitForFunction(() => document.querySelectorAll("[data-user-note='label']").length === 0);
    assert.equal(await followerEdit().count(), 0);
    assert.equal(storage.get(key("9001", "1001")), "一起做项目的同学");
    await page.evaluate(() => {
      document.getElementById("fixture-guest-topbar").remove();
      CC98RebornUserNotes.sync();
    });
    await followerEdit().waitFor();
    checks += 1;

    // Input remains disabled while loading. A cross-tab update wins against an
    // older get response rather than being overwritten by the stale snapshot.
    const delayed = await createPage("/usercenter/myfollowings", { holdReads: true });
    const delayedEdit = delayed.locator(`.user-center-myfollowings-user ${select("edit")}[data-user-note-uid="1001"]`);
    await delayedEdit.click();
    assert(await delayed.locator(select("input")).isDisabled(), "loading input cannot accept text that a late read would replace");
    assert(await delayed.locator(select("save")).isDisabled());
    await followerEdit().click();
    await save("后收到的新备注");
    await delayed.waitForFunction(() => document.querySelector("#post-a [data-user-note='label']")?.textContent.includes("后收到的新备注"));
    await delayed.evaluate(() => { window.__noteStorageHoldGet = false; });
    assert(heldReads.length >= 1, "at least one stale read must be held until after the new event");
    for (const release of heldReads.splice(0)) release();
    await delayed.waitForFunction(() => !document.querySelector("[data-user-note='input']")?.disabled);
    assert.equal(await delayed.locator(select("input")).inputValue(), "后收到的新备注");
    assert((await delayed.locator(`#post-a ${select("label")}`).innerText()).includes("后收到的新备注"));
    await delayed.keyboard.press("Escape");
    await delayed.close();
    checks += 1;

    // Both themes share the plugin's palette, and the mobile dialog stays within the viewport.
    await fs.mkdir(path.join(root, "outputs/user-notes-preview"), { recursive: true });
    await followerEdit().click();
    const light = await dialog.evaluate((node) => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
    assert.notEqual(light.color, light.background);
    await page.screenshot({ path: path.join(root, "outputs/user-notes-preview/user-notes-light.png"), fullPage: true });
    await page.evaluate(() => {
      document.documentElement.dataset.cc98ComfortTheme = "night";
      document.documentElement.dataset.cc98ComfortTone = "dark";
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const dark = await dialog.evaluate((node) => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right }));
    assert.notEqual(dark.color, dark.background);
    assert.notEqual(dark.background, light.background, "dialog follows the active plugin theme");
    assert(dark.left >= 0 && dark.right <= 390, "mobile dialog stays inside the viewport");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no mobile horizontal overflow");
    await page.screenshot({ path: path.join(root, "outputs/user-notes-preview/user-notes-mobile-dark.png"), fullPage: true });
    await page.keyboard.press("Escape");
    checks += 1;

    assert.deepEqual(errors, [], "no browser exceptions");
    assert(writes.every((entry) => /^cc98RebornUserNote:uid:[1-9]\d*:user:[1-9]\d*$/.test(entry.name)));
    console.log(`user-notes browser regression passed (${checks} scenarios, ${writes.length} storage writes).`);
  } catch (error) {
    console.error({ errors, storage: Object.fromEntries(storage), writes });
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
