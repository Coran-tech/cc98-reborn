const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const popupOrigin = "http://127.0.0.1:8765";
const pageOrigin = "https://www.cc98.org";
const storageKey = "cc98ComfortSettings";
const palettes = ["teal", "green", "blue", "violet", "rose", "amber"];
const customOverrides = ["--cc98-comfort-accent", "--cc98-comfort-accent-2", "--cc98-comfort-secondary", "--cc98-comfort-secondary-soft", "--cc98-comfort-link"];
const localTime = (time) => new Date(`2026-10-13T${time}+08:00`);
const settingsFor = (patch = {}) => ({
  enabled: true, themeMode: "light", themePalette: "teal",
  themeDayStart: "07:00", themeNightStart: "19:00",
  themeCustomPrimary: "#1f7166", themeCustomSecondary: "#326b9b",
  previsitFirstPageForTopicImages: false, prewarmPostImages: false,
  ...patch
});
const modeSelector = (mode) => `input[name="themeMode"][value="${mode}"]`;
const paletteSelector = (palette) => `input[name="themePalette"][value="${palette}"]`;

function rgb(color) {
  if (/^#[\da-f]{6}$/i.test(color)) return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const values = color.match(/^rgba?\(([^)]+)\)$/)?.[1].split(/[ ,/]+/).slice(0, 3).map(Number);
  assert(values?.length === 3 && values.every(Number.isFinite), `Unsupported color: ${color}`);
  return values;
}
function luminance(color) {
  const [r, g, b] = rgb(color).map((component) => {
    const value = component / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function main() {
  const storage = new Map([[storageKey, settingsFor({ themeFixtureExtra: "preserved", blockedUserIds: "1009" })]]);
  const writes = [];
  const pages = [];
  const errors = [];
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 360, height: 620 }, timezoneId: "Asia/Shanghai" });
  let checks = 0;
  try {
    async function broadcast(changes, areaName = "local") {
      for (const page of pages) {
        if (page.isClosed()) continue;
        await page.evaluate(({ changes, areaName }) => {
          for (const listener of window.__themeStorageListeners || []) listener(changes, areaName);
        }, { changes, areaName }).catch((error) => { if (!page.isClosed()) throw error; });
      }
    }
    async function replaceSettings(value) {
      const previous = storage.get(storageKey);
      storage.set(storageKey, structuredClone(value));
      await broadcast({ [storageKey]: { oldValue: previous, newValue: value } });
    }
    await context.exposeBinding("__themeStorageRequest", async (_source, payload) => {
      if (payload.operation === "get") {
        const keys = payload.keys;
        const names = keys == null ? [...storage.keys()] : typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        return Object.fromEntries(names.map((name) => [name, storage.has(name) ? storage.get(name) : keys && typeof keys === "object" && !Array.isArray(keys) ? keys[name] : undefined]).filter(([, value]) => value !== undefined));
      }
      const changes = {};
      for (const [key, value] of Object.entries(payload.values || {})) {
        changes[key] = { oldValue: storage.get(key), newValue: value };
        storage.set(key, structuredClone(value));
      }
      writes.push(structuredClone(payload.values));
      await broadcast(changes);
      return null;
    });
    await context.addInitScript(() => {
      window.__themeStorageListeners = [];
      window.chrome = {
        runtime: {
          id: "theme-fixture", getManifest: () => ({ version: "0.3.6" }),
          getURL: (file) => new URL(`/${file}`, location.origin).href,
          onMessage: { addListener() {} },
          sendMessage(_message, callback) { const response = { ok: false }; callback?.(response); return Promise.resolve(response); }
        },
        tabs: {
          query(_query, callback) { callback?.([]); return Promise.resolve([]); },
          sendMessage(_id, _message, callback) { callback?.({ ok: false }); },
          create() {}
        },
        storage: { local: {}, onChanged: {
          addListener(listener) { window.__themeStorageListeners.push(listener); },
          removeListener(listener) { window.__themeStorageListeners = window.__themeStorageListeners.filter((entry) => entry !== listener); }
        } }
      };
      for (const operation of ["get", "set"]) {
        chrome.storage.local[operation] = (values, callback) => {
          const promise = window.__themeStorageRequest({ operation, [operation === "get" ? "keys" : "values"]: values });
          if (typeof callback !== "function") return promise;
          promise.then((result) => callback(result), (error) => {
            chrome.runtime.lastError = { message: error.message };
            try { callback(); } finally { delete chrome.runtime.lastError; }
          });
        };
      }
      chrome.storage.local.remove = (_keys, callback) => { callback?.(); return Promise.resolve(); };
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (![popupOrigin, pageOrigin].includes(url.origin)) return route.abort();
      const file = url.origin === pageOrigin && /^\/topic\/\d+/.test(url.pathname)
        ? path.join(root, "tests/theme-page.html")
        : path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try { return await route.fulfill({ path: file }); }
      catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    async function makePage(url = `${popupOrigin}/popup/popup.html`, { time = "14:00:00", wide = false } = {}) {
      const page = await context.newPage();
      pages.push(page);
      page.on("pageerror", (error) => errors.push(`${new URL(page.url()).pathname}: ${error.message}`));
      page.setDefaultTimeout(10000);
      if (wide) await page.setViewportSize({ width: 1160, height: 850 });
      await page.clock.install({ time: localTime(time) });
      await page.goto(url);
      if (url.startsWith(popupOrigin)) await page.waitForFunction(() => document.querySelectorAll('input[name="themePalette"]').length === 7 && document.querySelector('input[name="themeMode"]:checked'));
      else await page.locator('#cc98-comfort-app [data-post-floor="1"]').waitFor();
      return page;
    }
    async function selectRadio(page, name, value) {
      await page.locator(`input[name="${name}"][value="${value}"]`).locator("..").click();
      await page.waitForFunction(({ name, value }) => document.querySelector(`input[name="${name}"][value="${value}"]`)?.checked, { name, value });
    }
    async function expectStored(patch) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const actual = storage.get(storageKey);
        if (Object.entries(patch).every(([key, value]) => actual[key] === value)) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.fail(`Stored settings mismatch: expected ${JSON.stringify(patch)}, actual ${JSON.stringify(storage.get(storageKey))}`);
    }
    async function expectTone(page, tone, palette) {
      await page.waitForFunction(({ tone, palette }) => document.documentElement.dataset.cc98ComfortTone === tone && (!palette || document.documentElement.dataset.cc98ComfortPalette === palette), { tone, palette });
    }
    async function noOverflow(page) {
      const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert(size.scroll <= size.width + 1 && size.body <= size.width + 1, `Popup overflow: ${JSON.stringify(size)}`);
    }
    async function expectCustomCleared(page) {
      const values = await page.evaluate((names) => names.map((name) => document.documentElement.style.getPropertyValue(name)), customOverrides);
      assert(values.every((value) => value === ""), "custom inline palette values must be removed");
    }
    async function setCustomHex(page, name, value) {
      const input = page.locator(`#themeCustom${name}Hex`);
      await input.fill(value);
      await input.dispatchEvent("change");
    }

    if (process.argv.includes("--capture-auto")) {
      await replaceSettings(settingsFor({ themeMode: "auto", themePalette: "teal" }));
      const preview = await makePage();
      await preview.locator("#themeSchedule").waitFor({ state: "visible" });
      assert(await preview.locator("#enabled").isChecked());
      await noOverflow(preview);
      const output = path.join(root, "outputs/theme-preview");
      await fs.mkdir(output, { recursive: true });
      await preview.screenshot({ path: path.join(output, "theme-popup-auto.png"), clip: { x: 0, y: 0, width: 360, height: 500 }, animations: "disabled" });
      assert.deepEqual(errors, []);
      console.log("theme: automatic schedule popup screenshot captured");
      return;
    }

    // The popup loads its real script and shared core, then persists independent axes.
    const popup = await makePage();
    for (const palette of palettes) {
      const input = popup.locator(paletteSelector(palette));
      assert.equal((await input.locator("..").innerText()).trim(), "", `${palette}: preset must show dots without a visible name`);
      assert((await input.getAttribute("aria-label"))?.trim(), `${palette}: preset needs an accessible label`);
      assert.equal(await input.locator("..").locator(".theme-swatches > i").count(), 2);
    }
    assert((await popup.locator(paletteSelector("custom")).locator("..").innerText()).includes("自定义"));
    await popup.locator(paletteSelector("teal")).focus();
    await popup.keyboard.press("ArrowRight");
    await expectStored({ themePalette: "green" });
    assert(await popup.locator(paletteSelector("green")).isChecked(), "preset radio must be keyboard operable");
    await selectRadio(popup, "themePalette", "teal");
    await expectTone(popup, "light", "teal");
    assert.equal(await popup.locator(modeSelector("light")).isChecked(), true);
    await selectRadio(popup, "themeMode", "dark");
    await expectStored({ themeMode: "dark" });
    await selectRadio(popup, "themePalette", "violet");
    await expectStored({ themeMode: "dark", themePalette: "violet", themeDayStart: "07:00", themeNightStart: "19:00" });
    assert.equal(storage.get(storageKey).themeFixtureExtra, "preserved", "theme edits must preserve unrelated settings");
    assert.equal(storage.get(storageKey).blockedUserIds, "1009");
    await expectTone(popup, "dark", "violet");
    await popup.reload();
    await popup.locator(paletteSelector("violet")).waitFor({ state: "attached" });
    await expectTone(popup, "dark", "violet");
    assert(await popup.locator(modeSelector("dark")).isChecked());
    assert(await popup.locator(paletteSelector("violet")).isChecked());
    checks += 1;

    // Automatic scheduling is local time; equal times show validation without writes.
    await selectRadio(popup, "themeMode", "auto");
    await expectStored({ themeMode: "auto" });
    await popup.locator("#themeSchedule").waitFor({ state: "visible" });
    await popup.locator("#themeDayStart").fill("08:15");
    await popup.locator("#themeDayStart").dispatchEvent("change");
    await popup.locator("#themeNightStart").fill("20:45");
    await popup.locator("#themeNightStart").dispatchEvent("change");
    await expectStored({ themeDayStart: "08:15", themeNightStart: "20:45" });
    const valid = structuredClone(storage.get(storageKey));
    const beforeInvalid = writes.length;
    await popup.locator("#themeNightStart").fill("08:15");
    await popup.locator("#themeNightStart").dispatchEvent("change");
    await popup.locator("#themeScheduleError").waitFor({ state: "visible" });
    await popup.waitForTimeout(250);
    assert.equal(writes.length, beforeInvalid, "equal schedules must not persist");
    assert.deepEqual(storage.get(storageKey), valid);
    assert.equal(await popup.locator("#themeNightStart").getAttribute("aria-invalid"), "true");
    await selectRadio(popup, "themePalette", "green");
    await expectStored({ themeMode: "auto", themePalette: "green", themeDayStart: "08:15", themeNightStart: "20:45" });
    assert.equal(await popup.locator("#themeNightStart").inputValue(), "08:15", "palette save must preserve an invalid schedule draft");
    assert(await popup.locator("#themeScheduleError").isVisible());
    await popup.locator("#themeNightStart").fill("20:45");
    await popup.locator("#themeNightStart").dispatchEvent("change");
    await selectRadio(popup, "themePalette", "rose");
    await expectStored({ themeMode: "auto", themePalette: "rose", themeDayStart: "08:15", themeNightStart: "20:45" });
    await noOverflow(popup);
    checks += 1;

    // A second popup observes repeated onChanged updates rather than stale hydration.
    const second = await makePage();
    for (const patch of [
      { themeMode: "dark", themePalette: "green" },
      { themeMode: "light", themePalette: "blue" },
      { themeMode: "auto", themePalette: "amber", themeDayStart: "07:00", themeNightStart: "19:00" }
    ]) {
      await replaceSettings(settingsFor(patch));
      await expectTone(popup, patch.themeMode === "dark" ? "dark" : "light", patch.themePalette);
      await expectTone(second, patch.themeMode === "dark" ? "dark" : "light", patch.themePalette);
      assert(await second.locator(modeSelector(patch.themeMode)).isChecked());
      assert(await second.locator(paletteSelector(patch.themePalette)).isChecked());
    }
    const beforeIrrelevant = storage.get(storageKey);
    await broadcast({ [storageKey]: { newValue: settingsFor({ themeMode: "dark", themePalette: "rose" }) } }, "sync");
    await expectTone(popup, "light", "amber");
    assert.equal(storage.get(storageKey), beforeIrrelevant);
    checks += 1;

    // Legacy themes migrate in real popup hydration; refresh retains canonical axes.
    for (const [legacy, expectedPalette] of [["night", "teal"], ["wine", "rose"]]) {
      storage.set(storageKey, { enabled: true, theme: legacy, previsitFirstPageForTopicImages: false });
      const legacyPopup = await makePage();
      await expectTone(legacyPopup, "dark", expectedPalette);
      assert(await legacyPopup.locator(modeSelector("dark")).isChecked());
      await selectRadio(legacyPopup, "themePalette", "blue");
      await expectStored({ themeMode: "dark", themePalette: "blue" });
      await legacyPopup.reload();
      await expectTone(legacyPopup, "dark", "blue");
      await legacyPopup.close();
    }
    checks += 1;

    // Custom HEX and picker edits preserve base colors independently of rendered tone.
    await selectRadio(popup, "themeMode", "light");
    await selectRadio(popup, "themePalette", "custom");
    await popup.locator("#themeCustomControls").waitFor({ state: "visible" });
    await setCustomHex(popup, "Primary", "#AbC");
    await expectStored({ themePalette: "custom", themeCustomPrimary: "#aabbcc" });
    assert.equal(await popup.locator("#themeCustomPrimary").inputValue(), "#aabbcc");
    await popup.locator("#themeCustomSecondary").evaluate((input) => {
      input.value = "#ff6600";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expectStored({ themeMode: "light", themePalette: "custom", themeCustomPrimary: "#aabbcc", themeCustomSecondary: "#ff6600" });
    await expectTone(second, "light", "custom");
    assert.equal(await second.locator("#themeCustomSecondaryHex").inputValue(), "#ff6600");
    await popup.reload();
    await expectTone(popup, "light", "custom");
    assert.equal(await popup.locator("#themeCustomPrimaryHex").inputValue(), "#aabbcc");
    assert.equal(await popup.locator("#themeCustomSecondaryHex").inputValue(), "#ff6600");
    await selectRadio(popup, "themePalette", "rose");
    await expectStored({ themePalette: "rose", themeCustomPrimary: "#aabbcc", themeCustomSecondary: "#ff6600" });
    await expectCustomCleared(popup);
    await selectRadio(popup, "themePalette", "custom");
    await expectStored({ themePalette: "custom" });
    assert.equal(await popup.locator("#themeCustomPrimaryHex").inputValue(), "#aabbcc");
    assert.equal(await popup.locator("#themeCustomSecondaryHex").inputValue(), "#ff6600");
    await noOverflow(popup);
    checks += 1;

    const customStored = structuredClone(storage.get(storageKey));
    const beforeInvalidColorWrites = writes.length;
    for (const invalid of ["red", "#12", "#abcz12", "url(https://invalid.local/x)", '<img src=x onerror="window.themeXss=true">']) {
      await setCustomHex(popup, "Primary", invalid);
      await popup.locator("#themeCustomColorError").waitFor({ state: "visible" });
      assert.equal(await popup.locator("#themeCustomPrimaryHex").getAttribute("aria-invalid"), "true");
      await popup.waitForTimeout(180);
      assert.equal(writes.length, beforeInvalidColorWrites, `${invalid}: invalid custom value was written`);
      assert.deepEqual(storage.get(storageKey), customStored);
      assert.equal(await popup.locator("#themeCustomControls img, #themeCustomControls script").count(), 0);
      assert.equal(await popup.evaluate(() => window.themeXss), undefined);
      assert(!/url\(|onerror|invalid\.local/.test(await popup.locator("html").getAttribute("style")));
    }
    await setCustomHex(popup, "Primary", "#aabbcc");
    await popup.locator("#themeCustomColorError").waitFor({ state: "hidden" });
    await popup.locator("#themeCustomPrimaryHex").press("Tab");
    await replaceSettings(settingsFor({ themeMode: "light", themePalette: "custom", themeCustomPrimary: "#31c4be", themeCustomSecondary: "#9945bd" }));
    assert.equal(await popup.locator("#themeCustomPrimaryHex").inputValue(), "#31c4be");
    assert.equal(await second.locator("#themeCustomSecondaryHex").inputValue(), "#9945bd");
    checks += 1;

    // Manual mode ignores the system color scheme, including a live change.
    await replaceSettings(settingsFor({ themeMode: "light", themePalette: "teal" }));
    await popup.emulateMedia({ colorScheme: "dark" });
    await expectTone(popup, "light", "teal");
    await replaceSettings(settingsFor({ themeMode: "dark", themePalette: "teal" }));
    await popup.emulateMedia({ colorScheme: "light" });
    await expectTone(popup, "dark", "teal");
    checks += 1;

    // Timer, focus, visibility and pageshow reconcile elapsed local boundaries.
    await replaceSettings(settingsFor({ themeMode: "auto", themePalette: "green" }));
    const boundary = await makePage(undefined, { time: "06:59:48" });
    await expectTone(boundary, "dark", "green");
    await boundary.clock.fastForward(12000);
    await expectTone(boundary, "light", "green");
    await boundary.clock.setSystemTime(localTime("18:59:58"));
    await boundary.evaluate(() => dispatchEvent(new Event("focus")));
    await expectTone(boundary, "light", "green");
    await boundary.clock.fastForward(2000);
    await expectTone(boundary, "dark", "green");
    await boundary.clock.setSystemTime(localTime("10:00:00"));
    await boundary.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expectTone(boundary, "light", "green");
    await boundary.clock.setSystemTime(localTime("22:00:00"));
    await boundary.evaluate(() => dispatchEvent(new Event("pageshow")));
    await expectTone(boundary, "dark", "green");
    checks += 1;

    await replaceSettings(settingsFor({ themeMode: "auto", themePalette: "custom", themeCustomPrimary: "#31c4be", themeCustomSecondary: "#9945bd" }));
    const customBoundary = await makePage(undefined, { time: "06:59:48" });
    await expectTone(customBoundary, "dark", "custom");
    const beforeCustomTimerWrites = writes.length;
    const customTimerValues = structuredClone(storage.get(storageKey));
    await customBoundary.clock.fastForward(12000);
    await expectTone(customBoundary, "light", "custom");
    await customBoundary.clock.setSystemTime(localTime("18:59:58"));
    await customBoundary.evaluate(() => dispatchEvent(new Event("focus")));
    await customBoundary.clock.fastForward(2000);
    await expectTone(customBoundary, "dark", "custom");
    assert.deepEqual(storage.get(storageKey), customTimerValues, "custom automatic tone changes must preserve user HEX values");
    assert.equal(writes.length, beforeCustomTimerWrites, "automatic color adaptation must not rewrite stored colors");
    await customBoundary.close();
    checks += 1;

    // Every palette uses common neutral surfaces and has readable main/secondary colors.
    const neutralByTone = new Map();
    const measurements = [];
    for (const tone of ["light", "dark"]) {
      await selectRadio(popup, "themeMode", tone);
      for (const palette of palettes) {
        await selectRadio(popup, "themePalette", palette);
        await expectStored({ themeMode: tone, themePalette: palette });
        await expectTone(popup, tone, palette);
        const colors = await popup.evaluate(() => {
          const body = getComputedStyle(document.body);
          const root = getComputedStyle(document.documentElement);
          const read = (name) => root.getPropertyValue(name).trim();
          return {
            text: body.color, bg: body.backgroundColor,
            surface: read("--cc98-comfort-surface"),
            accent: read("--cc98-comfort-accent"),
            secondary: read("--cc98-comfort-secondary"),
            soft: read("--cc98-comfort-accent-2"),
            secondarySoft: read("--cc98-comfort-secondary-soft"),
            link: read("--cc98-comfort-link")
          };
        });
        const neutral = { bg: colors.bg, surface: colors.surface, text: colors.text };
        if (neutralByTone.has(tone)) assert.deepEqual(neutral, neutralByTone.get(tone), `neutral colors vary with ${tone}/${palette}`);
        else neutralByTone.set(tone, neutral);
        for (const [label, foreground] of [["text", colors.text], ["link", colors.link], ["primary", colors.accent], ["secondary", colors.secondary]]) {
          for (const [surface, background] of [["body", colors.bg], ["panel", colors.surface]]) {
            const ratio = contrast(foreground, background);
            assert(ratio >= 4.5, `${tone}/${palette} ${label}/${surface} contrast ${ratio.toFixed(2)} < 4.5 (${foreground} on ${background})`);
            measurements.push({ tone, palette, label, surface, contrast: Number(ratio.toFixed(2)) });
          }
        }
        for (const [label, foreground, background] of [["primary/soft", colors.accent, colors.soft], ["secondary/soft", colors.secondary, colors.secondarySoft]]) {
          const ratio = contrast(foreground, background);
          assert(ratio >= 4.5, `${tone}/${palette} ${label} contrast ${ratio.toFixed(2)} < 4.5 (${foreground} on ${background})`);
          measurements.push({ tone, palette, label, contrast: Number(ratio.toFixed(2)) });
        }
        await noOverflow(popup);
      }
    }
    checks += 12;

    // The complete page script changes an existing post and native reply in place.
    await replaceSettings(settingsFor({ themeMode: "auto", themePalette: "teal" }));
    const webpage = await makePage(`${pageOrigin}/topic/6500000/1`, { time: "06:59:20", wide: true });
    await webpage.clock.fastForward(20000);
    await webpage.clock.runFor(2000);
    await expectTone(webpage, "dark", "teal");
    const emoji = webpage.locator('#cc98-comfort-app [data-post-floor="1"] .cc98-rebuild-post-body img[src*="/images/ac"]');
    assert.equal(await emoji.count(), 1);
    assert.match(await emoji.getAttribute("src"), /\/images\/ac1\/01\.png$/);
    await webpage.waitForFunction(() => {
      const image = document.querySelector('#cc98-comfort-app [data-post-floor="1"] .cc98-rebuild-post-body img');
      return image?.complete && image.naturalWidth > 0;
    });
    await webpage.evaluate(() => {
      const textarea = document.getElementById("theme-draft");
      textarea.value = "未发送的回复草稿\n第二行 😀";
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(2, 7);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      window.__themeRenderEvents = [];
      const render = renderRebuiltUi;
      renderRebuiltUi = function (...args) {
        window.__themeRenderEvents.push({ time: new Date().toISOString(), stack: new Error().stack });
        return render(...args);
      };
      const schedule = scheduleRebuild;
      scheduleRebuild = function (...args) {
        window.__themeRenderEvents.push({ type: "schedule", time: new Date().toISOString(), stack: new Error().stack });
        return schedule(...args);
      };
    });
    await webpage.clock.runFor(1000);
    await webpage.evaluate(() => {
      const app = document.getElementById("cc98-comfort-app");
      const post = app.querySelector('[data-post-floor="1"]');
      const textarea = document.getElementById("theme-draft");
      window.scrollTo(0, 260);
      const emoji = post.querySelector('.cc98-rebuild-post-body img');
      window.__themeBefore = { app, post, textarea, emoji, value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd, scroll: scrollY };
      window.__themeRenderEvents = [];
    });
    await webpage.clock.fastForward(20000);
    await expectTone(webpage, "light", "teal");
    assert.match(await emoji.getAttribute("src"), /\/images\/ac\/01\.png$/);
    async function assertPreserved(message) {
      const after = await webpage.evaluate(() => {
        const before = window.__themeBefore;
        return {
          app: document.getElementById("cc98-comfort-app") === before.app,
          post: document.querySelector('#cc98-comfort-app [data-post-floor="1"]') === before.post,
          textarea: document.getElementById("theme-draft") === before.textarea,
          emoji: before.post.querySelector('.cc98-rebuild-post-body img') === before.emoji,
          value: before.textarea.value, expected: before.value,
          start: before.textarea.selectionStart, end: before.textarea.selectionEnd,
          expectedStart: before.start, expectedEnd: before.end,
          scroll: scrollY, expectedScroll: before.scroll, rebuildEvents: window.__themeRenderEvents
        };
      });
      assert(after.app && after.post && after.textarea && after.emoji, `${message}: content nodes replaced: ${JSON.stringify(after)}`);
      assert.equal(after.value, after.expected, `${message}: draft lost`);
      assert.equal(after.start, after.expectedStart, `${message}: caret start moved`);
      assert.equal(after.end, after.expectedEnd, `${message}: caret end moved`);
      assert(Math.abs(after.scroll - after.expectedScroll) < 2, `${message}: scroll moved`);
    }
    await assertPreserved("scheduled transition");
    await replaceSettings(settingsFor({ themeMode: "dark", themePalette: "violet" }));
    await expectTone(webpage, "dark", "violet");
    assert.match(await emoji.getAttribute("src"), /\/images\/ac1\/01\.png$/);
    await webpage.waitForTimeout(250);
    await assertPreserved("storage theme transition");
    await replaceSettings(settingsFor({ themeMode: "light", themePalette: "rose" }));
    await expectTone(webpage, "light", "rose");
    await webpage.waitForTimeout(250);
    await assertPreserved("successive storage transition");
    checks += 1;

    await replaceSettings(settingsFor({ themeMode: "light", themePalette: "custom", themeCustomPrimary: "#bb3388", themeCustomSecondary: "#226699" }));
    await expectTone(webpage, "light", "custom");
    await webpage.waitForTimeout(180);
    await assertPreserved("selecting custom palette");
    await setCustomHex(popup, "Primary", "#dd4400");
    await expectStored({ themeCustomPrimary: "#dd4400" });
    await expectTone(webpage, "light", "custom");
    await webpage.waitForTimeout(200);
    await assertPreserved("editing custom HEX from popup");
    await replaceSettings(settingsFor({ themeMode: "dark", themePalette: "custom", themeCustomPrimary: "#dd4400", themeCustomSecondary: "#226699" }));
    await expectTone(webpage, "dark", "custom");
    await webpage.waitForTimeout(180);
    await assertPreserved("custom dark mode adaptation");
    await replaceSettings(settingsFor({ themeMode: "dark", themePalette: "teal", themeCustomPrimary: "#dd4400", themeCustomSecondary: "#226699" }));
    await expectTone(webpage, "dark", "teal");
    await expectCustomCleared(webpage);
    await expectCustomCleared(popup);
    await assertPreserved("custom to preset transition");
    checks += 1;

    for (const tone of ["light", "dark"]) {
      for (const palette of palettes) {
        await replaceSettings(settingsFor({ themeMode: tone, themePalette: palette }));
        await expectTone(webpage, tone, palette);
        const colors = await webpage.evaluate(() => {
          const body = getComputedStyle(document.body);
          const article = document.querySelector('#cc98-comfort-app [data-post-floor="1"]');
          const text = getComputedStyle(article.querySelector('.cc98-rebuild-post-body'));
          const link = getComputedStyle(article.querySelector('.cc98-rebuild-post-body a'));
          return { body: body.backgroundColor, text: text.color, link: link.color, surface: getComputedStyle(article).backgroundColor };
        });
        assert(contrast(colors.text, colors.surface) >= 4.5, `page ${tone}/${palette} post text contrast`);
        assert(contrast(colors.link, colors.surface) >= 4.5, `page ${tone}/${palette} post link contrast`);
        assert.equal(colors.body, neutralByTone.get(tone).bg, `page ${tone}/${palette} must share popup neutral background`);
        await assertPreserved(`${tone}/${palette} page palette transition`);
      }
    }
    checks += 12;

    // Capture real popup and rebuilt page controls in each tone after exercising them.
    const output = path.join(root, "outputs/theme-preview");
    await fs.mkdir(output, { recursive: true });
    for (const tone of ["light", "dark"]) {
      await replaceSettings(settingsFor({ themeMode: tone, themePalette: "teal" }));
      await expectTone(popup, tone, "teal");
      await expectTone(webpage, tone, "teal");
      await popup.screenshot({ path: path.join(output, `theme-popup-${tone}.png`), fullPage: true, animations: "disabled" });
      await webpage.evaluate(() => scrollTo(0, 0));
      await webpage.screenshot({ path: path.join(output, `theme-page-${tone}.png`), fullPage: true, animations: "disabled" });
    }
    await replaceSettings(settingsFor({ themeMode: "light", themePalette: "teal" }));
    await popup.screenshot({ path: path.join(output, "theme-popup-compact-presets.png"), clip: { x: 0, y: 0, width: 360, height: 410 }, animations: "disabled" });
    await replaceSettings(settingsFor({ themeMode: "light", themePalette: "custom", themeCustomPrimary: "#bb3388", themeCustomSecondary: "#226699" }));
    await popup.locator("#themeCustomControls").waitFor({ state: "visible" });
    await noOverflow(popup);
    await popup.screenshot({ path: path.join(output, "theme-popup-custom.png"), clip: { x: 0, y: 0, width: 360, height: 550 }, animations: "disabled" });
    await replaceSettings(settingsFor({ enabled: false, themeMode: "dark", themePalette: "custom", themeCustomPrimary: "#000000", themeCustomSecondary: "#ffffff" }));
    await webpage.waitForFunction(() => !document.documentElement.classList.contains("cc98-comfort"));
    await expectCustomCleared(webpage);
    await webpage.waitForTimeout(200);
    assert.equal(await webpage.locator("#cc98-comfort-app").count(), 0, "disabling must restore the original forum DOM");
    assert(await webpage.locator("#reply100001").isVisible(), "the original post must reappear");
    const disabledBackground = await webpage.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(disabledBackground, "rgba(0, 0, 0, 0)", "disabled plugin colors leaked into the original forum");
    checks += 1;
    await fs.writeFile(path.join(output, "contrast.json"), JSON.stringify(measurements, null, 2));
    assert.deepEqual(errors, [], "Unexpected browser errors");
    console.log(`theme: ${checks} browser checks passed (presets, custom colors, real popup/content scripts, storage, validation, schedule boundaries, draft preservation, disable restore)`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
