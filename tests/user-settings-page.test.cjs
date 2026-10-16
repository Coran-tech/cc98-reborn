const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const output = path.join(root, "outputs/user-settings-page-preview");
const settingsKey = "cc98ComfortSettings";
const bindingKey = "cc98RebornOpenIdBinding:v1";
const frameSelector = "iframe[src*='popup/popup.html']";
const mode = (value) => `input[name='themeMode'][value='${value}']`;
const palette = (value) => `input[name='themePalette'][value='${value}']`;

async function chromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData/Local"), "ms-playwright");
  const names = (await fs.readdir(cache)).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const name of names) {
    const executable = path.join(cache, name, "chrome-win64/chrome.exe");
    try { await fs.access(executable); return executable; } catch {}
  }
  throw new Error("An installed full Chromium binary is required for real MV3 iframe permission tests.");
}

async function main() {
  const context = await chromium.launchPersistentContext("", {
    executablePath: await chromiumExecutable(), headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Shanghai"
  });
  const errors = [], measurements = [], externalRequests = [];
  let checks = 0;
  try {
    // No live forum/account requests: the extension profile is isolated and
    // offline; navigation and the original stylesheet are fulfilled locally.
    await context.setOffline(true);
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === "chrome-extension:") return route.continue();
      if (url.origin !== origin) { externalRequests.push({ url: url.href, method: route.request().method() }); return route.abort(); }
      const file = url.pathname.startsWith("/usercenter") ? path.join(root, "tests/user-settings-page.html") : path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try { return await route.fulfill({ path: file }); }
      catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;
    assert.equal(new URL(worker.url()).protocol, "chrome-extension:", "test must run the actual MV3 extension");
    await worker.evaluate(async ({ settingsKey, bindingKey }) => {
      globalThis.__settingsMockCalls = [];
      globalThis.__settingsStorageChanges = [];
      chrome.storage.onChanged.addListener((changes) => { if (changes[settingsKey]) __settingsStorageChanges.push({ at: Date.now(), old: changes[settingsKey].oldValue?.enabled, next: changes[settingsKey].newValue?.enabled }); });
      globalThis.__settingsMockBinding = { bound: true, userName: "测试用户", userId: 12345, boundAt: Date.now() };
      await chrome.storage.local.set({
        [settingsKey]: { enabled: true, themeMode: "light", themePalette: "teal", themeDayStart: "07:00", themeNightStart: "19:00", themeCustomPrimary: "#1f7166", themeCustomSecondary: "#326b9b", prewarmPostImages: false, previsitFirstPageForTopicImages: false, fixturePreserved: "yes" },
        [bindingKey]: __settingsMockBinding
      });
      const record = (type, details) => __settingsMockCalls.push({ type, details });
      const status = () => ({ ok: true, currentVersion: chrome.runtime.getManifest().version, latestVersion: chrome.runtime.getManifest().version, hasUpdate: false, checkedAt: Date.now() });
      getStoredUpdateStatus = async () => { record("update-status"); return status(); };
      checkForUpdates = async (options) => { record("update-check", options); return status(); };
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
      clearCc98SiteData = async () => { record("clear-site-data"); return { ok: true, reloadedTabs: 0 }; };
      getOpenIdBinding = async () => ({ ok: true, binding: __settingsMockBinding });
      findCurrentCc98WebAccount = async () => ({ ok: true, account: { userId: 12345, userName: "测试用户" }, authTransport: "direct" });
      loginWithCc98OpenId = async () => { record("bind"); __settingsMockBinding = { bound: true, userId: 12345, userName: "测试用户", boundAt: Date.now() }; return { ok: true, binding: __settingsMockBinding }; };
      logoutCc98OpenId = async () => { record("logout-binding"); __settingsMockBinding = null; return { ok: true, binding: null }; };
      exitCurrentCc98WebAccount = async () => { record("exit-account"); return { ok: true }; };
    }, { settingsKey, bindingKey });

    const page = await context.newPage();
    const popup = await context.newPage();
    page.setDefaultTimeout(10000);
    popup.setDefaultTimeout(10000);
    await popup.setViewportSize({ width: 360, height: 700 });
    for (const item of [page, popup]) item.on("pageerror", (error) => errors.push(error.message));
    const getSettings = async () => worker.evaluate(async (key) => (await chrome.storage.local.get(key))[key], settingsKey);
    const settingsEntry = () => page.locator(".cc98-rebuild-settings-nav-entry");
    async function settingsFrame() {
      await page.bringToFront();
      await page.locator(frameSelector).waitFor({ state: "visible" });
      await page.waitForFunction((selector) => document.querySelector(selector)?.contentWindow, frameSelector);
      const element = await page.locator(frameSelector).elementHandle();
      const frame = await element.contentFrame();
      await frame.locator("html.cc98-reborn-embedded #enabled").waitFor();
      return frame;
    }
    async function selectRadio(surface, selector) {
      await (surface === popup ? popup : page).bringToFront();
      if (surface === popup) await surface.locator(selector).locator("..").click();
      else { await surface.locator(selector).focus(); await surface.locator(selector).press("Space"); }
      assert(await surface.locator(selector).isChecked(), "native radio operation must select its value");
    }
    async function activateFrameButton(surface, selector) {
      await page.bringToFront();
      await surface.locator(selector).focus();
      await surface.locator(selector).press("Enter");
    }
    async function enable(surface, checked) {
      await surface.evaluate(() => { window.__enabledEvents ||= []; if (!window.__enabledEventsBound) { document.querySelector("#enabled").addEventListener("change", (event) => __enabledEvents.push({ at: Date.now(), checked: event.target.checked })); window.__enabledEventsBound = true; } });
      if (await surface.locator("#enabled").isChecked() !== checked) {
        // Exercise the native keyboard operation of the visually styled input.
        // This avoids compositor-dependent mouse targeting of extension OOPIFs.
        await surface.locator("#enabled").focus();
        await surface.locator("#enabled").press("Space");
        assert.equal(await surface.locator("#enabled").isChecked(), checked, "enabled switch must support native Space-key toggling");
      }
    }
    async function assertSettingsPanel() {
      const frame = await settingsFrame();
      assert.equal(await page.locator("#fixture-native-router").evaluate((node) => node.hidden), true, "native personal-center content must hide on the settings subpage");
      assert.equal(await page.locator("#fixture-native-router").isVisible(), false, "hidden native router must not remain visible through stylesheet overrides");
      assert(await settingsEntry().evaluate((node) => node.classList.contains("is-active") || node.getAttribute("aria-current") === "page"), "settings navigation should be active");
      return frame;
    }
    async function assertLayout(label) {
      const frame = await settingsFrame();
      await frame.locator(".popup").waitFor();
      const targetHeight = await frame.locator(".popup").evaluate((node) => Math.ceil(node.getBoundingClientRect().height) + 2);
      await page.waitForFunction(({ selector, height }) => Math.abs(document.querySelector(selector).getBoundingClientRect().height - height) <= 8, { selector: frameSelector, height: targetHeight });
      const outer = await page.locator(frameSelector).evaluate((node) => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height, right: box.right, x: box.x, viewport: innerWidth, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }; });
      const inner = await frame.evaluate(() => { const root = document.documentElement, body = document.body, panel = document.querySelector(".popup"); return { client: root.clientWidth, scroll: Math.max(root.scrollWidth, body.scrollWidth), height: innerHeight, contentHeight: Math.ceil(panel.getBoundingClientRect().height), scrollHeight: root.scrollHeight, embedded: root.classList.contains("cc98-reborn-embedded"), tone: root.dataset.cc98ComfortTone, grid: getComputedStyle(panel).gridTemplateColumns }; });
      assert(inner.embedded, `${label}: iframe did not activate its verified embedded mode`);
      assert(inner.scroll <= inner.client + 1, `${label}: embedded settings has horizontal overflow`);
      assert(outer.scroll <= outer.client + 1, `${label}: forum page has horizontal overflow`);
      assert(inner.contentHeight <= inner.height + 2 && inner.height <= inner.contentHeight + 8, `${label}: iframe height ${inner.height} does not fit content ${inner.contentHeight}; nested scrolling or blank space`);
      measurements.push({ label, outer, inner });
      return frame;
    }
    async function screenshotSettings(name) {
      const frame = await settingsFrame();
      await page.locator(frameSelector).evaluate((node) => {
        const topbar = document.querySelector(".cc98-rebuild-topbar");
        const safeTop = Math.max(24, (topbar?.getBoundingClientRect().bottom || 0) + 18);
        window.scrollTo(0, Math.max(0, node.getBoundingClientRect().top + scrollY - safeTop));
      });
      await frame.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForTimeout(180);
      // Capture the painted viewport: stitching a tall extension OOPIF can
      // produce clipped compositor tiles despite correct DOM geometry.
      await page.screenshot({ animations: "disabled" });
      await page.waitForTimeout(180);
      await page.screenshot({ path: path.join(output, name), animations: "disabled" });
    }

    await page.goto(`${origin}/usercenter`);
    await settingsEntry().waitFor();
    await page.waitForTimeout(1600);
    const ordering = await page.locator("#userCenterNavigation ul > li").allTextContents();
    assert.equal(ordering.at(-1).trim(), "插件设置", "settings entry must be last in the personal-center list");
    assert(ordering.some((text) => text.trim() === "黑名单"), "existing blacklist entry must remain");
    await page.locator("#native-profile-draft").evaluate((node) => { node.value = "切换设置时保留个人主页草稿"; node.setSelectionRange(2, 8); window.__settingsDraft = node; });
    await settingsEntry().click();
    let frame = await assertSettingsPanel();
    const settingsHash = new URL(page.url()).hash;
    assert(settingsHash && settingsHash.includes("settings"), "settings needs its own hash route");
    const frameUrl = await page.locator(frameSelector).getAttribute("src");
    assert.equal(new URL(frameUrl).protocol, "chrome-extension:", "settings must use the actual extension iframe origin");
    assert.equal(new URL(frameUrl).host, extensionId, "settings must use this extension's real iframe host");
    assert.equal(new URL(frameUrl).searchParams.get("embedded"), "1");
    checks += 1;

    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popup.locator(palette("custom")).waitFor();
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
    const displayVersion = manifest.version_name || manifest.version;
    assert.equal(await popup.locator('#aboutVersion').textContent(), displayVersion, 'popup must display the build label');
    assert.equal(await frame.locator('#aboutVersion').textContent(), displayVersion, 'personal-center settings must display the same build label');
    await popup.waitForFunction(expected => document.querySelector('#updateCurrentVersion')?.textContent.includes(expected), displayVersion);
    assert.equal(await popup.locator("html").evaluate((node) => node.classList.contains("cc98-reborn-embedded")), false, "regular popup should retain standalone layout");
    const controls = await popup.locator("input[id], button[id], select[id], textarea[id]").evaluateAll((nodes) => nodes.map((node) => node.id));
    for (const id of controls) assert.equal(await frame.locator(`#${id}`).count(), 1, `embedded page omitted popup control ${id}`);
    assert.equal(await frame.locator("input[name='themeMode']").count(), 3);
    assert.equal(await frame.locator("input[name='themePalette']").count(), 7);
    checks += 1;

    if (process.argv.includes("--capture-only")) {
      await fs.mkdir(output, { recursive: true });
      await worker.evaluate(async (key) => { const current = (await chrome.storage.local.get(key))[key]; await chrome.storage.local.set({ [key]: { ...current, themePalette: "custom", themeCustomPrimary: "#8054ca", themeCustomSecondary: "#d1a300" } }); }, settingsKey);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const tone of ["light", "dark"]) {
          frame = await settingsFrame();
          await selectRadio(frame, mode(tone));
          await assertLayout(`capture-${width}-${tone}`);
          await screenshotSettings(`settings-${width}-${tone}.png`);
          const footerTop = await frame.locator("footer").evaluate(node => node.getBoundingClientRect().top);
          await page.locator(frameSelector).evaluate((node, top) => window.scrollTo(0, node.getBoundingClientRect().top + scrollY + top - 350), footerTop);
          await page.waitForTimeout(200);
          await page.screenshot({ animations: "disabled" });
          await page.waitForTimeout(150);
          await page.screenshot({ path: path.join(output, `settings-footer-${width}-${tone}.png`), animations: "disabled" });
        }
      }
      console.log("user-settings-page: captured wide/narrow light/dark settings and backup-footer previews");
      return;
    }

    assert(await popup.locator('#topicDrawerEnabled').isChecked(), 'old settings without the key default to enabled');
    assert(await frame.locator('#topicDrawerEnabled').isChecked()); checks++;
    await popup.bringToFront();
    await popup.locator('#topicDrawerEnabled').focus(); await popup.locator('#topicDrawerEnabled').press('Space');
    await frame.waitForFunction(() => document.querySelector('#topicDrawerEnabled')?.checked === false);
    assert.equal((await getSettings()).topicDrawerEnabled, false);
    await popup.reload();
    await popup.waitForFunction(() => document.querySelector('#topicDrawerEnabled')?.checked === false); checks++;
    await page.bringToFront();
    await frame.locator('#topicDrawerEnabled').focus(); await frame.locator('#topicDrawerEnabled').press('Space');
    await popup.waitForFunction(() => document.querySelector('#topicDrawerEnabled')?.checked === true);
    assert.equal((await getSettings()).topicDrawerEnabled, true); checks++;

    if (process.argv.includes("--check-switch")) {
      await popup.bringToFront();
      await page.bringToFront();
      frame = await settingsFrame();
      const label = frame.locator("#enabled").locator("..");
      const bounds = await label.boundingBox();
      const parentHit = await page.evaluate(({ x, y }) => { const node = document.elementFromPoint(x, y); return { tag: node?.tagName, frame: node?.matches("iframe.cc98-rebuild-user-settings-frame") }; }, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
      const innerHit = await label.evaluate((node) => { const box = node.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return { tag: hit?.tagName, switch: Boolean(hit?.closest(".switch")) }; });
      assert(parentHit.frame && innerHit.switch, "parent and iframe hit-test must both reach the enabled switch");
      await label.click();
      assert.equal(await frame.locator("#enabled").isChecked(), false, "frontmost forum page must receive the real switch click");
      await popup.waitForFunction(() => !document.querySelector("#enabled").checked);
      assert.equal((await getSettings()).enabled, false);
      console.log(`user-settings-page mouse switch passed after bringToFront: ${JSON.stringify({ parentHit, innerHit })}`);
      return;
    }

    await selectRadio(frame, mode("dark"));
    await popup.locator(mode("dark")).waitFor({ state: "attached" });
    await popup.waitForFunction(() => document.querySelector("input[name='themeMode'][value='dark']").checked);
    assert.equal((await getSettings()).themeMode, "dark");
    await selectRadio(popup, palette("rose"));
    frame = await settingsFrame();
    await frame.waitForFunction(() => document.querySelector("input[name='themePalette'][value='rose']").checked);
    assert.equal(await page.locator("html").getAttribute("data-cc98-comfort-palette"), "rose");
    checks += 1;

    await selectRadio(frame, palette("custom"));
    await frame.locator("#themeCustomPrimaryHex").fill("#8054ca");
    await frame.locator("#themeCustomPrimaryHex").blur();
    await frame.locator("#themeCustomSecondaryHex").fill("#d1a300");
    await frame.locator("#themeCustomSecondaryHex").blur();
    await popup.waitForFunction(() => document.querySelector("#themeCustomPrimaryHex").value === "#8054ca" && document.querySelector("#themeCustomSecondaryHex").value === "#d1a300");
    assert.equal((await getSettings()).themeCustomPrimary, "#8054ca");
    await selectRadio(frame, mode("auto"));
    await frame.locator("#themeDayStart").fill("06:30");
    await frame.locator("#themeDayStart").dispatchEvent("change");
    await frame.locator("#themeNightStart").fill("20:30");
    await frame.locator("#themeNightStart").dispatchEvent("change");
    await popup.waitForFunction(() => document.querySelector("#themeDayStart").value === "06:30" && document.querySelector("#themeNightStart").value === "20:30");
    assert.equal((await getSettings()).fixturePreserved, "yes");
    assert(await page.locator("#native-profile-draft").evaluate((node) => node === window.__settingsDraft && node.value === "切换设置时保留个人主页草稿" && node.selectionStart === 2 && node.selectionEnd === 8), "theme/settings changes must preserve the hidden native router and draft");
    checks += 1;

    await enable(frame, false);
    await popup.waitForFunction(() => !document.querySelector("#enabled").checked);
    frame = await assertSettingsPanel();
    assert.equal(await frame.locator("#enabled").isChecked(), false, "disabled settings page must remain usable");
    await page.reload();
    frame = await assertSettingsPanel();
    await page.locator("#userCenterNavigation a[href='/usercenter/config']").click();
    await page.locator("#fixture-native-router").waitFor({ state: "visible" });
    await page.locator("#cc98-comfort-app").waitFor({ state: "detached" });
    const disabledOrdering = await page.locator("#userCenterNavigation ul > li").allTextContents();
    assert.equal(disabledOrdering.at(-1).trim(), "插件设置", "native personal center must keep the recovery entry when disabled");
    await settingsEntry().click();
    frame = await assertSettingsPanel();
    await enable(frame, true);
    await popup.waitForFunction(() => document.querySelector("#enabled").checked);
    assert.equal((await getSettings()).enabled, true);
    checks += 1;

    await worker.evaluate(async (key) => { const current = (await chrome.storage.local.get(key))[key]; await chrome.storage.local.set({ [key]: { ...current, rebuildUi: false } }); }, settingsKey);
    frame = await assertSettingsPanel();
    await page.reload();
    frame = await assertSettingsPanel();
    await worker.evaluate(async (key) => { const current = (await chrome.storage.local.get(key))[key]; await chrome.storage.local.set({ [key]: { ...current, rebuildUi: true } }); }, settingsKey);
    await assertSettingsPanel();
    checks += 1;

    await activateFrameButton(frame, "#openBlacklist");
    await page.locator(".cc98-rebuild-user-blacklist-panel").waitFor({ state: "visible" });
    assert.equal(await page.locator("#fixture-native-router").evaluate((node) => node.hidden), true);
    await settingsEntry().click();
    frame = await assertSettingsPanel();
    await page.locator("#userCenterNavigation a[href='/usercenter/config']").click();
    await page.locator("#fixture-native-router").waitFor({ state: "visible" });
    assert.equal(await page.locator(frameSelector).isVisible(), false, "native tab must hide settings panel");
    await page.goBack();
    frame = await assertSettingsPanel();
    await page.goForward();
    await page.locator("#fixture-native-router").waitFor({ state: "visible" });
    await page.goto(`${origin}/usercenter${settingsHash}`);
    frame = await assertSettingsPanel();
    checks += 1;

    await activateFrameButton(frame, "#updateCheck");
    await frame.waitForFunction(() => document.querySelector(".update-card")?.dataset.state === "current");
    let calls = await worker.evaluate(() => __settingsMockCalls);
    assert(calls.some((call) => call.type === "update-check" && call.details?.force), "update button should call its mocked runtime service");
    await activateFrameButton(frame, "#clearCc98Data");
    await frame.locator("#clearCc98DataConfirm").waitFor({ state: "visible" });
    await activateFrameButton(frame, "#cancelClearCc98Data");
    calls = await worker.evaluate(() => __settingsMockCalls);
    assert(!calls.some((call) => call.type === "clear-site-data"), "cancel must not invoke clear-data service");
    await activateFrameButton(frame, "#clearCc98Data");
    await activateFrameButton(frame, "#confirmClearCc98Data");
    await frame.locator("#clearCc98DataStatus[data-state='success']").waitFor();
    await activateFrameButton(frame, "#openidLogout");
    await frame.locator("#openidBind").waitFor({ state: "visible" });
    await activateFrameButton(frame, "#openidBind");
    await frame.locator("#openidLogout").waitFor({ state: "visible" });
    await activateFrameButton(frame, "#openidExitAccount");
    await page.waitForTimeout(500);
    assert(!page.isClosed(), "embedded account exit must not close the forum tab");
    calls = await worker.evaluate(() => __settingsMockCalls);
    for (const type of ["clear-site-data", "logout-binding", "bind", "exit-account"]) assert(calls.some((call) => call.type === type), `missing mocked runtime action ${type}`);
    checks += 1;

    // Backup actions run inside the real extension frame. Only the download
    // is mocked so the test cannot create files through the user's browser.
    await worker.evaluate(async ({ settingsKey }) => {
      const stored = (await chrome.storage.local.get(settingsKey))[settingsKey];
      await chrome.storage.local.set({
        [settingsKey]: { ...stored, aiSearchSuggestApiKey: "test-secret", unknownFutureSetting: "preserved" },
        "cc98RebornUserNote:uid:12345:user:1001": "测试备注",
        "cc98RebornPrivateMessagePins:v1:uid:12345": [{ uid: "1001", name: "置顶同学" }],
        "cc98RebornPinnedBoards:v1": ["https://www.cc98.org/board/81"],
        "cc98RebornReadLater:v1:uid:12345": [{ key: "topic:1", title: "保留的稍后再看" }]
      });
    }, { settingsKey });
    await frame.locator('input[name="themeStyle"][value="ascii"]').focus();
    await frame.locator('input[name="themeStyle"][value="ascii"]').press("Space");
    await frame.waitForFunction(() => document.querySelector('input[name="themeStyle"][value="ascii"]').checked);
    await frame.evaluate(() => {
      window.__settingsDownloads = [];
      chrome.downloads.download = (options, callback) => {
        fetch(options.url).then(response => response.text()).then(text => { __settingsDownloads.push({ options, text }); callback(42); });
      };
    });
    await activateFrameButton(frame, "#backupSettings");
    await frame.waitForFunction(() => __settingsDownloads.length === 1 && !document.querySelector("#backupSettings").disabled);
    const exported = await frame.evaluate(() => __settingsDownloads[0]);
    const file = JSON.parse(exported.text);
    assert.equal(exported.options.saveAs, true);
    assert.match(exported.options.filename, /^cc98-reborn-settings-.*\.json$/);
    assert(!exported.text.includes("test-secret") && !exported.text.includes("cc98RebornOpenIdBinding") && !exported.text.includes("ReadLater"));
    assert.equal(file.data["cc98RebornUserNote:uid:12345:user:1001"], "测试备注");
    assert.deepEqual(file.data["cc98RebornPinnedBoards:v1"], ["/board/81"]);
    assert.equal(file.data["cc98RebornPrivateMessagePins:v1:uid:12345"][0].uid, "1001");
    assert.equal(file.data[settingsKey].themeStyle, "ascii");
    checks += 1;

    const importFile = async text => frame.locator("#settingsBackupFile").setInputFiles({ name: "settings.json", mimeType: "application/json", buffer: Buffer.from(text) });
    const beforeInvalid = await worker.evaluate(() => chrome.storage.local.get(null));
    await importFile("{broken");
    await frame.locator("#settingsBackupStatus[data-state='error']").waitFor();
    assert.deepEqual(await worker.evaluate(() => chrome.storage.local.get(null)), beforeInvalid, "invalid file must not change storage");
    file.data[settingsKey].fontScale = 113;
    file.data[settingsKey].themeStyle = "modern";
    file.data["cc98RebornUserNote:uid:12345:user:1001"] = "恢复的备注";
    file.data["cc98RebornPrivateMessagePins:v1:uid:12345"] = [{ uid: "1002", name: "恢复的置顶" }];
    file.data["cc98RebornPinnedBoards:v1"] = ["/board/182"];
    await importFile(JSON.stringify(file));
    await frame.locator("#settingsBackupPreview").waitFor({ state: "visible" });
    await activateFrameButton(frame, "#cancelRestoreSettings");
    assert.deepEqual(await worker.evaluate(() => chrome.storage.local.get(null)), beforeInvalid, "cancel must not change storage");
    checks += 1;

    await importFile(JSON.stringify(file));
    await frame.locator("#settingsBackupPreview").waitFor({ state: "visible" });
    await activateFrameButton(frame, "#confirmRestoreSettings");
    await frame.waitForFunction(() => document.querySelector("#settingsBackupStatus").textContent.startsWith("已恢复"));
    const restored = await worker.evaluate(() => chrome.storage.local.get(null));
    assert.equal(restored[settingsKey].fontScale, 113);
    assert.equal(restored[settingsKey].themeStyle, "modern");
    assert(await frame.locator('input[name="themeStyle"][value="modern"]').isChecked());
    assert.equal(restored[settingsKey].aiSearchSuggestApiKey, "test-secret");
    assert.equal(restored[settingsKey].unknownFutureSetting, "preserved");
    assert.equal(restored["cc98RebornUserNote:uid:12345:user:1001"], "恢复的备注");
    assert.equal(restored["cc98RebornPrivateMessagePins:v1:uid:12345"][0].uid, "1002");
    assert.deepEqual(restored["cc98RebornPinnedBoards:v1"], ["/board/182"]);
    assert.deepEqual(restored["cc98RebornReadLater:v1:uid:12345"], beforeInvalid["cc98RebornReadLater:v1:uid:12345"]);
    await popup.waitForFunction(() => document.querySelector("#fontScale").value === "113");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("cc98RebornPinnedBoards:v1") || "[]")[0]?.endsWith("/board/182"));
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("cc98RebornPinnedBoards:v1"))), [`${origin}/board/182`], "imported board pins must reach the native page cache");
    await popup.evaluate(() => { window.__standaloneBackups = []; chrome.downloads.download = (options, callback) => { fetch(options.url).then(response => response.text()).then(text => { __standaloneBackups.push(text); callback(43); }); }; });
    await popup.locator("#backupSettings").click();
    await popup.waitForFunction(() => __standaloneBackups.length === 1);
    assert.equal(JSON.parse(await popup.evaluate(() => __standaloneBackups[0])).data[settingsKey].fontScale, 113);
    checks += 1;

    await fs.mkdir(output, { recursive: true });
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const tone of ["light", "dark"]) {
        frame = await settingsFrame();
        await selectRadio(frame, mode(tone));
        await assertLayout(`${width}-${tone}`);
        await page.waitForFunction(() => getComputedStyle(document.getElementById("cc98-comfort-app")).filter === "none");
        if (width === 1440 || width === 390) await screenshotSettings(`settings-${width}-${tone}.png`);
        checks += 1;
      }
    }
    assert.deepEqual(errors, []);
    assert(!externalRequests.some((request) => request.method !== "GET"), "test attempted an external account mutation");
    await fs.writeFile(path.join(output, "measurements.json"), JSON.stringify({ extensionId, measurements, mockedActions: await worker.evaluate(() => __settingsMockCalls), externalRequests }, null, 2));
    console.log(`user-settings-page: ${checks} real MV3 iframe/storage/routing/layout/action checks passed`);
  } catch (error) {
    await fs.mkdir(output, { recursive: true });
    const pages = context.pages();
    const state = { checks, settings: await context.serviceWorkers()[0]?.evaluate(async (key) => (await chrome.storage.local.get(key))[key], settingsKey), changes: await context.serviceWorkers()[0]?.evaluate(() => __settingsStorageChanges), frames: [] };
    for (let index = 0; index < pages.length; index += 1) {
      await fs.writeFile(path.join(output, `failure-page-${index}.html`), await pages[index].content().catch(() => ""));
      for (const frame of pages[index].frames()) {
        state.frames.push(await frame.evaluate(() => ({ url: location.href, enabled: document.querySelector("#enabled")?.checked, events: window.__enabledEvents, day: document.querySelector("#themeDayStart")?.value, night: document.querySelector("#themeNightStart")?.value, scheduleError: document.querySelector("#themeScheduleError")?.textContent, customError: document.querySelector("#themeCustomColorError")?.textContent })).catch(() => ({ url: frame.url() })));
      }
    }
    await fs.writeFile(path.join(output, "failure-state.json"), JSON.stringify(state, null, 2));
    console.error("Browser errors:", errors);
    console.error("Pages:", pages.map((page) => page.url()));
    throw error;
  } finally {
    await context.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
