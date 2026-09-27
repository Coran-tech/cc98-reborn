const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    page.on("pageerror", (error) => errors.push(error.message));
    const root = path.resolve(__dirname, "..");
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (url.origin !== "http://127.0.0.1:8765" || !file.startsWith(`${root}${path.sep}`)) return route.abort();
      try { await route.fulfill({ path: file }); }
      catch { await route.fulfill({ status: 404, body: "Not found" }); }
    });
    await page.goto("http://127.0.0.1:8765/tests/local-ubb-editor.html");
    await page.waitForFunction(() => Boolean(window.__ubbRegression?.state));
    await page.evaluate(() => {
      const container = document.createElement("section");
      container.id = "message-test";
      container.className = "cc98-rebuild-native-message";
      const editor = document.createElement("div");
      editor.className = "cc98-rebuild-message-editor";
      const toolbar = document.createElement("div");
      toolbar.className = "cc98-rebuild-message-editor-toolbar";
      const textarea = document.createElement("textarea");
      textarea.className = "cc98-rebuild-message-editor-textarea";
      editor.append(toolbar, textarea);
      container.append(editor);
      document.querySelector("main").append(container);
      appendEditorColorSplitButton(editor, toolbar);
      window.__colorTestEditors = {
        native: window.__ubbRegression.editor,
        profile: document.querySelector("[data-cc98-profile-signature-editor='true']"),
        message: editor
      };
    });

    const panel = page.locator(".cc98-rebuild-color-popover:not([hidden])");
    async function select(kind, surface, value = "abcd") {
      await page.evaluate(({ kind, surface, value }) => {
        const editor = window.__colorTestEditors[kind];
        const textarea = getNativeEditorTextarea(editor);
        clearEditorColorSelectionSnapshot(editor);
        delete editor.__cc98WysiwygLogicalSelection;
        delete editor.__cc98WysiwygRange;
        setNativeMessageInputValue(textarea, value);
        if (kind === "message") {
          textarea.focus();
          textarea.setSelectionRange(0, value.length);
        } else {
          const target = editor.querySelector(surface === "source" ? ".cc98-rebuild-dual-ubb-source" : ".cc98-rebuild-dual-ubb-visual");
          target.focus();
          const range = document.createRange();
          range.selectNodeContents(target);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
          editor.__cc98WysiwygRememberSelection();
        }
      }, { kind, surface, value });
    }
    const value = (kind) => page.evaluate((kind) => getNativeEditorTextarea(window.__colorTestEditors[kind]).value, kind);
    async function swatches(scope) {
      return page.evaluate((scope) => {
        const read = (node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return { color: style.backgroundColor, image: style.backgroundImage, size: style.backgroundSize, width: rect.width, height: rect.height };
        };
        const toolbar = document.querySelector(`${scope} .cc98-rebuild-color-swatch`);
        const dialog = document.querySelector(".cc98-rebuild-color-popover:not([hidden]) .cc98-rebuild-color-popover-swatch");
        return { toolbar: read(toolbar), dialog: dialog ? read(dialog) : null };
      }, scope);
    }
    async function sameSwatches(scope) {
      const result = await swatches(scope);
      for (const key of ["color", "image", "size"]) assert.equal(result.toolbar[key], result.dialog[key], `Visible ${key} must agree`);
      assert.ok(result.toolbar.width > 0 && result.toolbar.height > 0, "The swatch must actually be visible");
      const stops = await panel.locator(".cc98-rebuild-gradient-stop").evaluateAll((nodes) => nodes.map((node) => {
        const color = node.style.getPropertyValue("--cc98-gradient-stop-color");
        const rgb = `rgb(${[1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)).join(", ")})`;
        return { actual: getComputedStyle(node).backgroundColor, expected: rgb, style: node.getAttribute("style") };
      }));
      for (const stop of stops) assert.equal(stop.actual, stop.expected, `Gradient stop must display its actual color: ${stop.style}`);
      return result;
    }

    let count = 0;
    for (const kind of ["native", "profile", "message"]) {
      const scope = { native: "#native-editor", profile: "#profile-router", message: "#message-test" }[kind];
      const open = () => page.locator(`${scope} .cc98-rebuild-color-chooser`).click();
      const apply = () => page.locator(`${scope} .cc98-rebuild-color-apply`).click();
      const expectedDefault = kind === "native" ? "#ff0000" : "#ff6666";
      await select(kind, "visual");
      const initial = (await swatches(scope)).toolbar;
      await apply();
      assert.equal(await value(kind), `[color=${expectedDefault}]abcd[/color]`, `${kind}: first click matches default swatch`);
      assert.equal((await swatches(scope)).toolbar.color, initial.color);
      count++;

      for (const surface of kind === "message" ? ["source"] : ["visual", "source"]) {
        await select(kind, surface);
        await open();
        await panel.locator(".cc98-rebuild-color-transparent").click();
        await sameSwatches(scope);
        await panel.locator(".cc98-rebuild-color-popover-ok").click();
        assert.equal(await value(kind), "[color=transparent]abcd[/color]");
        await select(kind, surface);
        await open();
        assert.equal(await panel.locator(".cc98-rebuild-color-transparent").getAttribute("aria-pressed"), "true");
        await sameSwatches(scope);
        await panel.locator("[data-cc98-color-mode='gradient']").click();
        await panel.locator(".cc98-rebuild-gradient-preset").first().click();
        await panel.locator(".cc98-rebuild-gradient-density-input").selectOption("2");
        const gradient = (await sameSwatches(scope)).toolbar;
        assert.equal(gradient.size, "100% 100%", "Gradient must not retain the transparent checker tile size");
        await panel.locator(".cc98-rebuild-color-popover-ok").click();
        const expected = "[color=#ff4d4f]ab[/color][color=#faad14]cd[/color]";
        assert.equal(await value(kind), expected, `${kind}/${surface}: confirmed gradient and density`);
        await select(kind, surface);
        await open();
        assert.equal(await panel.locator("[data-cc98-color-mode='gradient']").evaluate((node) => node.classList.contains("is-active")), true);
        assert.equal(await panel.locator(".cc98-rebuild-gradient-density-input").inputValue(), "2");
        assert.deepEqual((await sameSwatches(scope)).toolbar, gradient, "Reopening keeps the same visible gradient");

        await panel.locator(".cc98-rebuild-color-popover-input").fill("#00ff00");
        await panel.locator(".cc98-rebuild-gradient-density-input").selectOption("7");
        await sameSwatches(scope);
        await panel.locator(".cc98-rebuild-color-popover-cancel").click();
        await select(kind, surface);
        await apply();
        assert.equal(await value(kind), expected, "Cancel must discard color-stop and density edits together");

        await select(kind, surface);
        await open();
        await panel.locator("[data-cc98-color-mode='solid']").click();
        await panel.locator(".cc98-rebuild-color-popover-input").fill("#123456");
        await panel.locator("[data-cc98-color-preset='#00a65a']").click();
        assert.equal(await panel.locator(".cc98-rebuild-color-popover-input").inputValue(), "#00a65a");
        await sameSwatches(scope);
        await panel.locator(".cc98-rebuild-color-popover-ok").click();
        assert.equal(await value(kind), "[color=#00a65a]abcd[/color]");
        await select(kind, surface);
        await open();
        await panel.locator(".cc98-rebuild-color-popover-input").fill("#ee7700");
        await page.keyboard.press("Escape");
        await select(kind, surface);
        await apply();
        assert.equal(await value(kind), "[color=#00a65a]abcd[/color]");
        count += 5;
      }

      if (kind === "native") {
        await page.evaluate(() => {
          const editor = window.__colorTestEditors.native;
          const button = editor.querySelector(".ubb-button-color");
          const replacement = document.createElement("div");
          replacement.className = "ubb-button ubb-button-color";
          replacement.innerHTML = '<span class="sp-replacer"><span class="sp-preview"><span class="sp-preview-inner" style="background-color:#123456"></span></span></span>';
          button.replaceWith(replacement);
          stabilizeEditorColorButton(editor);
        });
        await select(kind, "visual");
        await apply();
        assert.equal(await value(kind), "[color=#00a65a]abcd[/color]", "Native toolbar replacement preserves confirmed color");
        count++;
      }

      await select(kind, "visual");
      await open();
      const red = panel.locator("input[type='number'][data-cc98-color-channel='r']");
      await red.fill("31.7");
      await panel.locator("input[type='number'][data-cc98-color-channel='g']").fill("64");
      await panel.locator("input[type='number'][data-cc98-color-channel='b']").fill("96");
      assert.equal(await panel.locator(".cc98-rebuild-color-popover-input").inputValue(), "#204060");
      await sameSwatches(scope);
      await panel.locator(".cc98-rebuild-color-popover-input").fill("invalid");
      await panel.locator(".cc98-rebuild-color-popover-ok").click();
      assert.equal(await value(kind), "[color=#204060]abcd[/color]", "Invalid input must not corrupt the last valid color");
      count++;

      await select(kind, "visual");
      await open();
      await panel.locator(".cc98-rebuild-color-popover-input").fill("#ee7700");
      await page.mouse.click(3, 3);
      assert.equal(await panel.count(), 0, "Clicking outside closes the picker");
      await apply();
      assert.equal(await value(kind), "[color=#204060]abcd[/color]", "Clicking outside discards draft color without losing the selection");
      count++;

      await select(kind, "visual");
      await open();
      await panel.locator("[data-cc98-color-mode='gradient']").click();
      assert.equal(await panel.locator(".cc98-rebuild-color-presets").isVisible(), false);
      await panel.locator(".cc98-rebuild-gradient-preset").first().click();
      await panel.getByRole("button", { name: "添加色标", exact: true }).click();
      const handle = panel.locator(".cc98-rebuild-gradient-stop.is-active");
      const handleRect = await handle.boundingBox();
      const trackRect = await panel.locator(".cc98-rebuild-gradient-track").boundingBox();
      await page.mouse.move(handleRect.x + handleRect.width / 2, handleRect.y + handleRect.height / 2);
      await page.mouse.down();
      await page.mouse.move(trackRect.x + trackRect.width * 0.25, handleRect.y + handleRect.height / 2, { steps: 8 });
      await page.mouse.up();
      assert.match(await handle.getAttribute("title"), /^25%/);
      await panel.locator(".cc98-rebuild-color-popover-input").fill("#abcdef");
      const draggedGradient = (await sameSwatches(scope)).toolbar;
      await panel.locator(".cc98-rebuild-color-popover-ok").click();
      const draggedValue = await value(kind);
      await select(kind, "visual");
      await open();
      assert.equal(await panel.locator(".cc98-rebuild-gradient-stop").count(), 3);
      assert.match(await panel.locator(".cc98-rebuild-gradient-stop.is-active").getAttribute("title"), /^25% · #ABCDEF$/);
      assert.deepEqual((await sameSwatches(scope)).toolbar, draggedGradient);
      await panel.getByRole("button", { name: "删除色标", exact: true }).click();
      await panel.locator(".cc98-rebuild-color-popover-cancel").click();
      await apply();
      assert.equal(await value(kind), draggedValue, "Cancelled stop removal must not mutate committed gradient");
      count++;

      await select(kind, "source", "[color=#123456]abcd[/color]");
      await open();
      await panel.locator(".cc98-rebuild-color-clear").click();
      assert.equal(await value(kind), "abcd", "Clear color works in every editor, including plain-text private messages");
      count++;
    }
    assert.deepEqual(errors, [], "No browser exceptions");
    await select("profile", "visual");
    await page.locator("#profile-router .cc98-rebuild-color-chooser").click();
    await panel.locator("[data-cc98-color-mode='gradient']").click();
    await panel.locator(".cc98-rebuild-gradient-preset").first().click();
    await sameSwatches("#profile-router");
    await page.screenshot({ path: path.join(os.tmpdir(), "cc98-color-lifecycle-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.dataset.cc98ComfortTheme = "night";
      document.documentElement.dataset.cc98ComfortTone = "dark";
    });
    await sameSwatches("#profile-router");
    await page.screenshot({ path: path.join(os.tmpdir(), "cc98-color-lifecycle-mobile.png") });
    console.log(`color-editor: ${count} lifecycle scenarios passed (native/profile/message, visible swatches and generated UBB)`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
