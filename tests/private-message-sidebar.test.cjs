const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const output = path.join(root, "outputs/private-message-sidebar-preview");
const storageKey = "cc98ComfortSettings";

async function main() {
  const baseline = process.argv.includes("--baseline");
  const ascii = process.argv.includes("--ascii");
  let settings = { enabled: true, themeStyle: ascii ? "ascii" : "modern", themeMode: "light", themePalette: "teal", emojiScale: 200, prewarmPostImages: false, previsitFirstPageForTopicImages: false };
  const errors = [];
  const measurements = [];
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let checks = 0;
  try {
    page.on("pageerror", (error) => errors.push(error.message));
    await page.exposeBinding("__sidebarStorage", (_source, key) => {
      const keys = Array.isArray(key) ? key : [key];
      return {
        ...(keys.includes(storageKey) ? { [storageKey]: settings } : {}),
        ...(keys.includes("cc98RebornOpenIdBinding:v1") ? { "cc98RebornOpenIdBinding:v1": { bound: true, userName: "测试用户" } } : {})
      };
    });
    await page.addInitScript(() => {
      window.__storageListeners = [];
      window.chrome = {
        runtime: { getManifest: () => ({ version: "0.3.6" }), getURL: (file) => new URL(`/${file}`, location.origin).href, onMessage: { addListener() {} }, sendMessage(_message, callback) { callback?.({ ok: false }); return Promise.resolve({ ok: false }); } },
        storage: { local: { get(key, callback) { const promise = __sidebarStorage(key); if (callback) { promise.then(callback); return; } return promise; }, set(_values, callback) { callback?.(); return Promise.resolve(); }, remove(_key, callback) { callback?.(); return Promise.resolve(); } }, onChanged: { addListener(listener) { __storageListeners.push(listener); } } }
      };
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith("/uploads/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#648ba0"/></svg>' });
      const file = url.pathname.startsWith("/message/") ? path.join(root, "tests/private-message-sidebar.html")
        : baseline && url.pathname === "/src/styles.css" ? path.join(output, "sidebar-before.css")
        : path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try {
        if (ascii && file.endsWith('private-message-sidebar.html')) {
          const html = (await fs.readFile(file, 'utf8')).replace('</head>', '<link rel="stylesheet" href="/src/interface-styles.css"></head>').replace('<script src="/src/content.js">', '<script src="/src/interface-style.js"></script><script src="/src/content.js">');
          return route.fulfill({ contentType: 'text/html', body: html });
        }
        return await route.fulfill({ path: file });
      }
      catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    async function changeTheme(tone) {
      const old = settings;
      settings = { ...settings, themeMode: tone };
      await page.evaluate(({ old, next, key }) => { for (const listener of __storageListeners) listener({ [key]: { oldValue: old, newValue: next } }, "local"); }, { old, next: settings, key: storageKey });
    }
    async function measureRows() {
      return page.evaluate(() => [...document.querySelectorAll("#contact-list > [id^='contact_']")].map((wrapper) => {
        const row = wrapper.querySelector(".message-message-person");
        if (!row) throw new Error(`Missing person in ${wrapper.outerHTML}`);
        const rect = (node) => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right }; };
        const avatar = row.querySelector(".message-message-pPortraitUrl"), info = row.querySelector(".message-message-pInfo"), name = row.querySelector(".message-message-pName"), preview = row.querySelector(".message-message-pMessage"), article = preview.querySelector("article");
        const nameCss = getComputedStyle(name), previewCss = getComputedStyle(preview), articleCss = getComputedStyle(article);
        return { id: wrapper.id, row: rect(row), avatar: rect(avatar), info: { ...rect(info), marginTop: getComputedStyle(info).marginTop, marginBottom: getComputedStyle(info).marginBottom }, name: { ...rect(name), paddingBottom: nameCss.paddingBottom, scrollWidth: name.scrollWidth, clientWidth: name.clientWidth, whiteSpace: nameCss.whiteSpace, ellipsis: nameCss.textOverflow }, preview: { ...rect(preview), lineHeight: parseFloat(previewCss.lineHeight), lines: articleCss.webkitLineClamp, wrapperLines: previewCss.webkitLineClamp, overflow: previewCss.overflow }, images: [...preview.querySelectorAll("img")].map((image) => ({ ...rect(image), emoji: image.classList.contains("cc98-rebuild-inline-emoji") })) };
      }));
    }
    async function validateRows(label) {
      const rows = await measureRows();
      for (const row of rows) {
        assert(row.row.height >= 80 && row.row.height <= 96.5, `${label}/${row.id}: contact height ${row.row.height} outside compact range`);
        assert(Math.abs(row.avatar.width - 44) <= 1 && Math.abs(row.avatar.height - 44) <= 1, `${label}/${row.id}: avatar ${row.avatar.width}x${row.avatar.height}`);
        assert(Math.abs(row.name.x - row.preview.x) <= 1, `${label}/${row.id}: name and preview not in same column`);
        assert(row.name.x > row.avatar.right, `${label}/${row.id}: avatar overlaps text`);
        assert(row.preview.right <= row.row.right + 1, `${label}/${row.id}: preview overflows sidebar`);
        assert(Math.abs(row.preview.width - row.info.width) <= 1 && Math.abs(row.preview.x - row.info.x) <= 1, `${label}/${row.id}: preview ${row.preview.width}px does not fill pInfo ${row.info.width}px`);
        assert(row.preview.height <= row.preview.lineHeight * 2 + 2, `${label}/${row.id}: preview is more than two lines`);
        assert(row.preview.lines === "2" || row.preview.wrapperLines === "2", `${label}/${row.id}: two-line clamp missing`);
        assert.equal(row.name.whiteSpace, "nowrap");
        assert.equal(row.name.ellipsis, "ellipsis");
        for (const image of row.images) assert(image.height <= row.preview.height + 1, `${label}/${row.id}: preview image taller than two-line preview`);
      }
      const long = rows.find((row) => row.id === "contact_1002");
      assert(long.name.scrollWidth > long.name.clientWidth, `${label}: long username fixture must exercise ellipsis`);
      measurements.push({ label, rows });
      return rows;
    }
    async function saveScreenshot(name) {
      await page.waitForFunction(() => {
        const app = document.getElementById("cc98-comfort-app");
        const overlays = [...document.querySelectorAll("#cc98-comfort-loading, .cc98-rebuild-openid-bind-overlay")];
        return app && getComputedStyle(app).filter === "none" && overlays.every((node) => getComputedStyle(node).display === "none" || !node.getBoundingClientRect().width);
      });
      await page.locator(".message-message-people").screenshot({ path: path.join(output, name), animations: "disabled" });
    }

    await page.goto(`${origin}/message/message?id=1001`);
    await page.locator("#cc98-comfort-app .cc98-rebuild-native-message").waitFor();
    await page.waitForTimeout(1600);
    await fs.mkdir(output, { recursive: true });
    if (baseline) {
      const rows = await measureRows();
      assert(rows[0].row.height >= 140, `before CSS did not reproduce tall contacts: ${rows[0].row.height}`);
      assert.equal(rows.length, 12);
      assert.equal(rows[0].info.marginTop, "20px");
      assert.equal(rows[0].info.marginBottom, "20px");
      assert.equal(rows[0].name.paddingBottom, "10px");
      assert.equal(rows[0].preview.width, 110);
      assert(await page.locator("#mainStylesheet").evaluate((sheet) => !sheet.disabled && sheet.media !== "not all"), "original native stylesheet must remain active in baseline");
      await saveScreenshot("sidebar-before.png");
      await fs.writeFile(path.join(output, "baseline.json"), JSON.stringify(rows, null, 2));
      console.log(`private-message sidebar baseline reproduced: first contact ${rows[0].row.height}px, avatar ${rows[0].avatar.width}px`);
      return;
    }
    await validateRows("desktop-light");
    const unread = await page.locator("#contact_1002 .message-counterPerson").evaluate((node) => {
      const box = node.getBoundingClientRect(), css = getComputedStyle(node);
      return { width: box.width, height: box.height, display: css.display, visibility: css.visibility, background: css.backgroundColor };
    });
    assert.equal(unread.width, 8, "unread dot must remain 8px wide");
    assert.equal(unread.height, 8, "unread dot must remain 8px tall");
    assert.notEqual(unread.display, "none", "unread dot must initially be visible");
    assert.notEqual(unread.visibility, "hidden", "unread dot must initially be visible");
    assert(!["transparent", "rgba(0, 0, 0, 0)"].includes(unread.background), "unread dot must have a visible background");
    assert.equal(await page.locator("#contact_1001 .message-counterPerson").evaluate((node) => getComputedStyle(node).display), "none", "read contact must hide its dot");
    await saveScreenshot("sidebar-after-light.png");
    assert.equal(await page.locator("#preview-photo").evaluate((image) => image.classList.contains("cc98-rebuild-inline-emoji")), false);
    assert.equal(await page.locator("#preview-emoji").evaluate((image) => image.classList.contains("cc98-rebuild-inline-emoji")), true);
    await page.evaluate(() => {
      const textarea = document.getElementById("sidebar-draft");
      textarea.value = "保留这份回复草稿 😀";
      textarea.setSelectionRange(2, 6);
      window.__sidebarState = { app: document.getElementById("cc98-comfort-app"), native: document.getElementById("native-message"), list: document.getElementById("contact-list"), textarea, value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd };
    });
    checks += 1;

    await page.locator("#contact_1002 .message-message-pName").click();
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(() => __sidebarFixture.selected), 1002);
    assert.equal(await page.evaluate(() => __sidebarFixture.switched), 1);
    assert.equal(await page.locator("#contact_1002 .message-counterPerson").evaluate((node) => getComputedStyle(node).display), "none", "opening a contact must hide its unread dot");
    assert(await page.locator("#contact_1002").evaluate((node) => node.classList.contains("message-message-pFocus")));
    const selectedStyle = await page.evaluate(() => {
      const style = (id) => { const css = getComputedStyle(document.querySelector(`${id} .message-message-person`)); return [css.backgroundColor, css.borderColor, css.boxShadow]; };
      return { selected: style("#contact_1002"), other: style("#contact_1001") };
    });
    assert.notDeepEqual(selectedStyle.selected, selectedStyle.other, "native selection class must remain visually distinct");
    checks += 1;

    const scrolling = await page.locator("#contact-list").evaluate((list) => { list.scrollTop = 200; list.dispatchEvent(new Event("scroll")); return { top: list.scrollTop, height: list.clientHeight, total: list.scrollHeight }; });
    assert(scrolling.top >= 190 && scrolling.total > scrolling.height, "contact list should remain scrollable");
    await page.locator("#more-control").scrollIntoViewIfNeeded();
    const moreHeight = await page.locator("#more-control").evaluate((node) => node.getBoundingClientRect().height);
    assert(moreHeight >= 24 && moreHeight <= 72, `more control incorrectly styled as a contact: ${moreHeight}`);
    await page.locator("#more-control").click();
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(() => __sidebarFixture.loadCalls), 1);
    assert.equal(await page.locator("#contact-list .message-message-person").count(), 16);
    await validateRows("dynamic-more");
    const state = await page.evaluate(() => { const s = __sidebarState; return { same: s.app === document.getElementById("cc98-comfort-app") && s.native === document.getElementById("native-message") && s.list === document.getElementById("contact-list") && s.textarea === document.getElementById("sidebar-draft"), value: s.textarea.value, expected: s.value, start: s.textarea.selectionStart, end: s.textarea.selectionEnd }; });
    assert(state.same, "contact interaction rebuilt the message page");
    assert.equal(state.value, state.expected);
    assert.equal(state.start, 2);
    assert.equal(state.end, 6);
    checks += 1;

    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const tone of ["light", "dark"]) {
        await changeTheme(tone);
        await validateRows(`${width}-${tone}`);
        const overflow = await page.locator("#contact-list").evaluate((list) => ({ client: list.clientWidth, scroll: list.scrollWidth }));
        assert(overflow.scroll <= overflow.client + 1, `${width}/${tone}: horizontal sidebar overflow`);
        if (width === 1440) { await page.locator("#contact-list").evaluate((list) => { list.scrollTop = 0; }); await saveScreenshot(`sidebar-after-${tone}.png`); }
        if (width === 390 && tone === "dark") { await page.locator("#contact-list").evaluate((list) => { list.scrollTop = 0; }); await saveScreenshot("sidebar-after-mobile.png"); }
        checks += 1;
      }
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, "measurements.json"), JSON.stringify(measurements, null, 2));
    console.log(`private-message-sidebar: ${checks} full-content layout/interaction checks passed`);
  } catch (error) {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, "failure-dom.html"), await page.content());
    console.error("Browser errors:", errors);
    throw error;
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
