const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const output = path.join(root, "outputs/message-pagination-preview");
const storageKey = "cc98ComfortSettings";

async function main() {
  const baseline = process.argv.includes("--baseline");
  let settings = { enabled: true, themeMode: "light", themePalette: "teal", prewarmPostImages: false, previsitFirstPageForTopicImages: false };
  const errors = [], measurements = [];
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let checks = 0;
  try {
    page.on("pageerror", (error) => errors.push(error.message));
    await page.exposeBinding("__paginationStorage", (_source, key) => {
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
        storage: { local: { get(key, callback) { const promise = __paginationStorage(key); if (callback) { promise.then(callback); return; } return promise; }, set(_values, callback) { callback?.(); return Promise.resolve(); }, remove(_key, callback) { callback?.(); return Promise.resolve(); } }, onChanged: { addListener(listener) { __storageListeners.push(listener); } } }
      };
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const file = url.pathname.startsWith("/message/") ? path.join(root, "tests/message-pagination.html")
        : baseline && url.pathname === "/src/styles.css" ? path.join(output, "pagination-before.css")
        : path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try { return await route.fulfill({ path: file }); }
      catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    async function changeTheme(patch) {
      const old = settings;
      settings = { ...settings, ...patch };
      await page.evaluate(({ old, next, key }) => { for (const listener of __storageListeners) listener({ [key]: { oldValue: old, newValue: next } }, "local"); }, { old, next: settings, key: storageKey });
    }
    async function measure() {
      return page.evaluate(() => {
        const rect = (node) => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }; };
        const controls = [...document.querySelectorAll(".pagination .page-link, .pagination .page-goto input, .pagination .page-goto a")].map((node) => {
          const css = getComputedStyle(node);
          return { tag: node.tagName, text: node.textContent.trim(), active: node.classList.contains("active"), ...rect(node), radius: parseFloat(css.borderRadius), color: css.color, background: css.backgroundColor, border: css.borderColor, outlineStyle: css.outlineStyle, outlineWidth: parseFloat(css.outlineWidth), boxShadow: css.boxShadow };
        });
        const pagination = document.querySelector(".pagination"), list = document.querySelector(".page-nav"), go = document.querySelector(".page-goto");
        return { controls, pagination: { ...rect(pagination), clientWidth: pagination.clientWidth, scrollWidth: pagination.scrollWidth }, list: rect(list), go: rect(go), tone: document.documentElement.dataset.cc98ComfortTone, palette: document.documentElement.dataset.cc98ComfortPalette };
      });
    }
    async function validate(label) {
      const record = await measure();
      for (const control of record.controls) {
        assert(control.height >= 29 && control.height <= 31, `${label}/${control.tag}/${control.text}: height ${control.height} should match the 30px shared pager`);
        assert(control.radius >= control.height / 2, `${label}/${control.tag}/${control.text}: missing capsule radius (${control.radius})`);
        assert(control.width >= 31, `${label}/${control.text}: control collapsed`);
        assert(control.x >= record.pagination.x - 1 && control.right <= record.pagination.right + 1, `${label}/${control.text}: control overflows pagination`);
      }
      assert(record.pagination.scrollWidth <= record.pagination.clientWidth + 1, `${label}: pagination has horizontal overflow`);
      const current = record.controls.find((control) => control.active), normal = record.controls.find((control) => control.tag === "A" && !control.active);
      assert(current, `${label}: current page missing`);
      assert(current.background !== normal.background || current.color !== normal.color || current.border !== normal.border, `${label}: current page is visually indistinguishable`);
      measurements.push({ label, ...record });
      return record;
    }
    async function screenshot(name) {
      await page.waitForFunction(() => {
        const app = document.getElementById("cc98-comfort-app");
        return app && getComputedStyle(app).filter === "none" && !document.querySelector(".cc98-rebuild-openid-bind-overlay");
      });
      await page.locator(".message-pager").screenshot({ path: path.join(output, name), animations: "disabled" });
    }

    await page.goto(`${origin}/message/response/10`);
    await page.locator("#cc98-comfort-app .cc98-rebuild-native-message .pagination").waitFor();
    await page.waitForTimeout(1600);
    await fs.mkdir(output, { recursive: true });
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
    if (baseline) {
      const record = await measure();
      assert(new Set(record.controls.map((control) => control.height)).size > 1, "frozen before CSS should reproduce inconsistent control heights");
      await screenshot("pagination-before.png");
      await fs.writeFile(path.join(output, "baseline.json"), JSON.stringify(record, null, 2));
      console.log(`message-pagination baseline: ${record.controls.filter((control) => control.tag === "A")[0].height}px pages, ${record.controls.find((control) => control.tag === "INPUT").height}px input, ${record.controls.at(-1).height}px Go`);
      return;
    }

    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of [
        { themeMode: "light", themePalette: "teal" }, { themeMode: "dark", themePalette: "teal" },
        { themeMode: "light", themePalette: "custom", themeCustomPrimary: "#e6c900", themeCustomSecondary: "#7b2d94" },
        { themeMode: "dark", themePalette: "custom", themeCustomPrimary: "#e6c900", themeCustomSecondary: "#7b2d94" }
      ]) {
        await changeTheme(theme);
        const label = `${width}-${theme.themeMode}-${theme.themePalette}`;
        const record = await validate(label);
        if (width === 390) assert(new Set(record.controls.filter((control) => control.tag === "A" && control.text !== "Go").map((control) => control.y)).size > 1, `${label}: narrow page links should wrap`);
        if (width === 1440) await screenshot(`pagination-after-${theme.themeMode}-${theme.themePalette}.png`);
        if (width === 390 && theme.themeMode === "dark" && theme.themePalette === "custom") await screenshot("pagination-after-mobile.png");
        checks += 1;
      }
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await changeTheme({ themeMode: "light", themePalette: "teal" });
    const target = page.locator(".page-link").filter({ hasText: /^7$/ });
    const initial = await target.evaluate((node) => { const css = getComputedStyle(node); return [css.color, css.backgroundColor, css.borderColor]; });
    await target.hover();
    const hover = await target.evaluate((node) => { const css = getComputedStyle(node); return [css.color, css.backgroundColor, css.borderColor]; });
    assert.notDeepEqual(hover, initial, "page hover should be visible");
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab");
    await target.focus();
    const focus = await target.evaluate((node) => { const css = getComputedStyle(node); return { outline: css.outlineStyle, width: parseFloat(css.outlineWidth), shadow: css.boxShadow, focusVisible: node.matches(":focus-visible") }; });
    assert(focus.focusVisible && (focus.outline !== "none" && focus.width > 0 || focus.shadow !== "none"), "keyboard focus must be visible");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => __pagerFixture.navigations.at(-1).target), 7);
    assert.equal(await page.evaluate(() => __pagerFixture.navigations.at(-1).source), "page");
    assert.equal(await page.locator(".page-link.active").textContent(), "7");
    checks += 1;

    const input = page.locator(".page-goto input"), go = page.locator(".page-goto a");
    await input.focus();
    assert(await input.evaluate((node) => { const css = getComputedStyle(node); return node.matches(":focus-visible") && (css.outlineStyle !== "none" && parseFloat(css.outlineWidth) > 0 || css.boxShadow !== "none"); }), "jump input keyboard focus must be visible");
    await input.fill("18");
    assert.match(await go.getAttribute("href"), /\/message\/response\/18#1$/);
    await go.click();
    assert.equal(await page.evaluate(() => __pagerFixture.navigations.at(-1).target), 18);
    assert.equal(await page.evaluate(() => __pagerFixture.navigations.at(-1).source), "go");
    await input.fill("26");
    assert.match(await go.getAttribute("href"), /\/message\/response\/18#1$/, "out-of-range input must preserve native last-valid Go target");
    await input.fill("4");
    await input.focus();
    await page.keyboard.press("Tab");
    assert(await go.evaluate((node) => node === document.activeElement), "Tab from the jump input must reach Go");
    assert(await go.evaluate((node) => { const css = getComputedStyle(node); return node.matches(":focus-visible") && (css.outlineStyle !== "none" && parseFloat(css.outlineWidth) > 0 || css.boxShadow !== "none"); }), "Go keyboard focus must be visible");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => __pagerFixture.navigations.at(-1).target), 4);
    assert.equal(await page.evaluate(() => __pagerFixture.navigations.length), 3);
    checks += 1;

    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, "measurements.json"), JSON.stringify(measurements, null, 2));
    console.log(`message-pagination: ${checks} full-content layout/theme/keyboard/navigation checks passed`);
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
