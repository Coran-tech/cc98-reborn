const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    const root = path.resolve(__dirname, "..");
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (url.origin !== "http://127.0.0.1:8765" || !file.startsWith(`${root}${path.sep}`)) {
        return route.abort();
      }
      try {
        await route.fulfill({ path: file });
      } catch {
        await route.fulfill({ status: 404, body: "Not found" });
      }
    });
    await page.goto("http://127.0.0.1:8765/tests/local-ubb-editor.html");
    await page.waitForFunction(() => Boolean(window.__ubbRegression?.state));
    await page.evaluate(() => {
      window.__fontTest = {
        set(marked, kind, surface) {
          this.editor = kind === "native" ? window.__ubbRegression.editor
            : document.querySelector("[data-cc98-profile-signature-editor='true']");
          this.visual = this.editor.querySelector(".cc98-rebuild-dual-ubb-visual");
          this.source = this.editor.querySelector(".cc98-rebuild-dual-ubb-source");
          this.textarea = this.editor.querySelector("textarea");
          this.kind = kind;
          const start = marked.indexOf("|");
          const end = marked.indexOf("|", start + 1) - 1;
          const value = marked.replace(/\|/g, "");
          delete this.editor.__cc98WysiwygLogicalSelection;
          delete this.editor.__cc98WysiwygRange;
          setNativeMessageInputValue(this.textarea, value);
          if (surface === "source") {
            this.source.focus();
            restoreProfileSignatureSourceSelection(this.source, { start, end });
          } else {
            const rendered = buildNativeEditorUbbPreview(marked);
            const walker = document.createTreeWalker(rendered, NodeFilter.SHOW_TEXT);
            let offset = 0;
            const offsets = [];
            while (walker.nextNode()) {
              for (const char of walker.currentNode.nodeValue) {
                if (char === "|") offsets.push(offset);
                else offset += char.length;
              }
            }
            this.visual.focus();
            const textWalker = document.createTreeWalker(this.visual, NodeFilter.SHOW_TEXT);
            let position = 0;
            const boundaries = [];
            while (textWalker.nextNode()) {
              const node = textWalker.currentNode;
              for (let index = 0; index < 2; index++) {
                if (!boundaries[index] && offsets[index] >= position && offsets[index] <= position + node.length) {
                  boundaries[index] = { node, offset: offsets[index] - position };
                }
              }
              position += node.length;
            }
            const range = document.createRange();
            if (boundaries.length === 2) {
              range.setStart(boundaries[0].node, boundaries[0].offset);
              range.setEnd(boundaries[1].node, boundaries[1].offset);
            } else {
              range.selectNodeContents(this.visual);
              range.collapse(true);
            }
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          }
          this.editor.__cc98WysiwygRememberSelection();
        },
        inspect() {
          return {
            value: this.textarea.value,
            source: getProfileSignatureSourceText(this.source),
            serialized: serializeProfileSignatureWysiwyg(this.visual),
            text: this.visual.textContent,
            selected: window.getSelection().toString()
          };
        }
      };
    });
    const cases = [
      ["[english]ab|cd|ef[/english]", "[english]ab[/english][font=Consolas]cd[/font][english]ef[/english]"],
      ["|[font=Arial]a[ac01]b[/font]|", "[font=Consolas]a[ac01]b[/font]"],
      ["[font=Arial]ab|cd|ef[/font]", "[font=Arial]ab[/font][font=Consolas]cd[/font][font=Arial]ef[/font]"],
      ["[font=Arial]|ab|cd[/font]", "[font=Consolas]ab[/font][font=Arial]cd[/font]"],
      ["[font=Arial]ab|cd|[/font]", "[font=Arial]ab[/font][font=Consolas]cd[/font]"],
      ["|[font=Arial]ab[font=SimSun]cd[/font]ef[/font]|", "[font=Consolas]abcdef[/font]"],
      ["[font=Arial]a|b[/font]c[font=SimSun]d|e[/font]", "[font=Arial]a[/font][font=Consolas]bcd[/font][font=SimSun]e[/font]"],
      ["[font=Arial][b]ab|cd|ef[/b][/font]", "[font=Arial][b]ab[/b][/font][font=Consolas][b]cd[/b][/font][font=Arial][b]ef[/b][/font]"],
      ["[b][font=Arial]ab|cd|ef[/font][/b]", "[b][font=Arial]ab[/font][font=Consolas]cd[/font][font=Arial]ef[/font][/b]"],
      ["[font=Arial]a[font=SimSun]b|c|d[/font]e[/font]", "[font=Arial]a[font=SimSun]b[/font][/font][font=Consolas]c[/font][font=Arial][font=SimSun]d[/font]e[/font]"],
      ["|[font=Arial][color=#ff0000]red[/color]\n[url=https://example.org]link[/url][/font]|", "[font=Consolas][color=#ff0000]red[/color]\n[url=https://example.org]link[/url][/font]"]
    ];
    let count = 0;
    for (const kind of ["native", "profile"]) {
      const font = page.locator(kind === "native" ? "#native-editor .cc98-rebuild-editor-font-select"
        : "#profile-router .cc98-rebuild-editor-font-select");
      for (const surface of ["visual", "source"]) {
        for (const [marked, expected] of cases) {
          await page.evaluate(({ marked, kind, surface }) => window.__fontTest.set(marked, kind, surface), { marked, kind, surface });
          // Use the actual select, including the focus/blur transition of its popup.
          await font.dispatchEvent("pointerdown");
          await font.focus();
          await font.selectOption("Consolas");
          const result = await page.evaluate(() => window.__fontTest.inspect());
          assert.equal(result.value, expected, `${kind}/${surface}: ${marked}`);
          assert.equal(result.source, result.value);
          assert.equal(result.serialized, result.value);
          await font.dispatchEvent("pointerdown");
          await font.focus();
          await font.selectOption("Consolas");
          assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, expected, `${kind}/${surface}: reapplying ${marked}`);
          count++;
        }
        await page.evaluate(({ kind, surface }) => window.__fontTest.set("[font=Arial]ab||cd[/font]", kind, surface), { kind, surface });
        await font.dispatchEvent("pointerdown");
        await font.focus();
        await font.selectOption("Consolas");
        await page.keyboard.insertText("NEW");
        assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value,
          "[font=Arial]ab[/font][font=Consolas]NEW[/font][font=Arial]cd[/font]", `${kind}/${surface}: typing with the new font`);
        count++;
      }
    }

    async function changeSize(kind, value) {
      if (kind === "native") {
        await page.locator("#native-editor .cc98-rebuild-font-size-trigger").click();
        await page.locator(value === "__cc98_reset__"
          ? ".cc98-rebuild-font-size-popover:not([hidden]) .cc98-rebuild-font-size-reset"
          : `.cc98-rebuild-font-size-popover:not([hidden]) [data-cc98-font-size-value='${value}']`).click();
      } else {
        const select = page.locator('#profile-router select[title="选择字号"]');
        await select.dispatchEvent("pointerdown");
        await select.focus();
        await select.selectOption(value);
      }
    }
    async function resetTypography(kind, tag) {
      if (tag === "size") {
        await changeSize(kind, "__cc98_reset__");
        return;
      }
      await page.locator(`${kind === "native" ? "#native-editor" : "#profile-router"} .cc98-rebuild-font-family-reset`).click();
    }
    const asSize = (text) => text.replace(/\[font=(Arial|SimSun|Consolas)\]/g,
      (_, font) => `[size=${{ Arial: "2", SimSun: "6", Consolas: "5" }[font]}]`).replace(/\[\/font\]/g, "[/size]");
    for (const kind of ["native", "profile"]) {
      const scope = kind === "native" ? "#native-editor" : "#profile-router";
      for (const surface of ["visual", "source"]) {
        for (const [markedFont, expectedFont] of cases.filter(([text]) => !text.includes("[english]"))) {
          const marked = asSize(markedFont);
          const expected = asSize(expectedFont);
          await page.evaluate(({ marked, kind, surface }) => window.__fontTest.set(marked, kind, surface), { marked, kind, surface });
          await changeSize(kind, "5");
          const result = await page.evaluate(() => window.__fontTest.inspect());
          assert.equal(result.value, expected, `size ${kind}/${surface}: ${marked}`);
          assert.equal(result.source, result.value);
          assert.equal(result.serialized, result.value);
          await changeSize(kind, "5");
          assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, expected, "Size must not nest on repeated application");
          count++;
        }
        for (const [tag, setting, otherTag, otherSetting] of [["font", "Arial", "size", "5"], ["size", "5", "font", "Arial"]]) {
          const wrap = (text) => `[${tag}=${setting}]${text}[/${tag}]`;
          const other = (text) => `[${otherTag}=${otherSetting}]${text}[/${otherTag}]`;
          const clearCases = [
            [wrap("ab|cd|ef"), `${wrap("ab")}cd${wrap("ef")}`],
            [wrap("|ab|cd"), `ab${wrap("cd")}`],
            [wrap("ab|cd|"), `${wrap("ab")}cd`],
            [`|${wrap(other("[b]bold[/b]"))}|`, other("[b]bold[/b]")],
            [`|${wrap("ab" + wrap("cd") + "ef")}|`, "abcdef"]
          ];
          for (const [marked, expected] of clearCases) {
            await page.evaluate(({ marked, kind, surface }) => window.__fontTest.set(marked, kind, surface), { marked, kind, surface });
            await resetTypography(kind, tag);
            const result = await page.evaluate(() => window.__fontTest.inspect());
            assert.equal(result.value, expected, `clear ${tag} ${kind}/${surface}: ${marked}`);
            assert.equal(result.source, result.value);
            assert.equal(result.serialized, result.value);
            await resetTypography(kind, tag);
            assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, expected, "Reset must be idempotent");
            count++;
          }
          await page.evaluate(({ marked, kind, surface }) => window.__fontTest.set(marked, kind, surface), { marked: wrap("ab||cd"), kind, surface });
          await resetTypography(kind, tag);
          await page.keyboard.insertText("NEW");
          assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value,
            wrap("ab") + "NEW" + wrap("cd"), `clear ${tag} ${kind}/${surface}: typing at default`);
          count++;
        }
      }
      assert.equal(await page.locator(`${scope} .cc98-rebuild-font-family-control`).count(), 1);
      assert.equal(await page.locator(`${scope} .cc98-rebuild-font-family-apply`).count(), 1);
      assert.equal(await page.locator(`${scope} .cc98-rebuild-font-family-reset`).count(), 1);
      assert.equal(await page.locator(`${scope} .cc98-rebuild-editor-font-select option[value='__cc98_reset__']`).count(), 0);
      assert.equal(await page.locator(kind === "native"
        ? ".cc98-rebuild-font-size-popover .cc98-rebuild-font-size-reset"
        : `${scope} select[title='选择字号'] option[value='__cc98_reset__']`).count(), 1);
    }
    for (const kind of ["native", "profile"]) {
      const scope = kind === "native" ? "#native-editor" : "#profile-router";
      for (const surface of ["visual", "source"]) {
        const font = page.locator(`${scope} .cc98-rebuild-editor-font-select`);
        const applyFont = page.locator(`${scope} .cc98-rebuild-font-family-apply`);
        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|first|", kind, surface), { kind, surface });
        await font.dispatchEvent("pointerdown");
        await font.focus();
        await font.selectOption("Consolas");
        assert.equal(await font.inputValue(), "Consolas");
        assert.equal(await applyFont.isEnabled(), true);
        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|second|", kind, surface), { kind, surface });
        await applyFont.click();
        assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, "[font=Consolas]second[/font]", `${kind}/${surface}: quick font apply`);
        await page.evaluate(({ kind, surface }) => window.__fontTest.set("[font=Consolas]|second|[/font]", kind, surface), { kind, surface });
        await resetTypography(kind, "font");
        assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, "second");
        assert.equal(await applyFont.isDisabled(), true, "Cancel font clears the quick-apply selection");
        count++;

        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|first|", kind, surface), { kind, surface });
        await changeSize(kind, "5");
        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|second|", kind, surface), { kind, surface });
        await page.locator(`${scope} .cc98-rebuild-font-size-apply`).click();
        assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, "[size=5]second[/size]", `${kind}/${surface}: quick size apply`);
        count++;

        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|first|", kind, surface), { kind, surface });
        await page.locator(`${scope} .cc98-rebuild-color-chooser`).click();
        const popover = page.locator(".cc98-rebuild-color-popover:not([hidden])");
        await popover.locator(".cc98-rebuild-color-popover-input").fill("#0f9d58");
        await popover.locator(".cc98-rebuild-color-popover-ok").click();
        assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, "[color=#0f9d58]first[/color]", `${kind}/${surface}: choose color`);
        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|second|", kind, surface), { kind, surface });
        await page.locator(`${scope} .cc98-rebuild-color-apply`).click();
        assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, "[color=#0f9d58]second[/color]", `${kind}/${surface}: quick color apply`);
        count++;

        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|first|", kind, surface), { kind, surface });
        await page.locator(`${scope} .cc98-rebuild-color-chooser`).click();
        await popover.locator(".cc98-rebuild-color-transparent").click();
        await popover.locator(".cc98-rebuild-color-popover-ok").click();
        assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, "[color=transparent]first[/color]", `${kind}/${surface}: choose transparent`);
        assert.match(await page.locator(`${scope} .cc98-rebuild-color-apply .sp-preview`).evaluate((node) => node.style.backgroundImage), /conic-gradient/, `${kind}/${surface}: transparent swatch`);
        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|second|", kind, surface), { kind, surface });
        await page.locator(`${scope} .cc98-rebuild-color-apply`).click();
        assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, "[color=transparent]second[/color]", `${kind}/${surface}: quick transparent apply`);
        count++;

        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|first|", kind, surface), { kind, surface });
        await page.locator(`${scope} .cc98-rebuild-color-chooser`).click();
        await popover.locator(".cc98-rebuild-color-popover-input").fill("#2266aa");
        await popover.locator(".cc98-rebuild-color-popover-ok").click();
        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|second|", kind, surface), { kind, surface });
        await page.locator(`${scope} .cc98-rebuild-color-chooser`).click();
        await popover.locator(".cc98-rebuild-color-popover-input").fill("#ee7700");
        assert.equal(await page.locator(`${scope} .cc98-rebuild-color-apply .sp-preview`).evaluate((node) => node.style.backgroundColor), "rgb(238, 119, 0)", `${kind}/${surface}: live color swatch`);
        await page.locator("#profile-router .user-center-config > label").click();
        assert.equal(await page.locator(`${scope} .cc98-rebuild-color-apply .sp-preview`).evaluate((node) => node.style.backgroundColor), "rgb(34, 102, 170)", `${kind}/${surface}: dismissed draft restores swatch`);
        await page.locator(`${scope} .cc98-rebuild-color-chooser`).click();
        await popover.locator(".cc98-rebuild-color-transparent").click();
        assert.match(await page.locator(`${scope} .cc98-rebuild-color-apply .sp-preview`).evaluate((node) => node.style.backgroundImage), /conic-gradient/, `${kind}/${surface}: live transparent swatch`);
        await popover.locator(".cc98-rebuild-color-popover-cancel").click();
        assert.equal(await page.locator(`${scope} .cc98-rebuild-color-apply .sp-preview`).evaluate((node) => getComputedStyle(node).backgroundImage), "none", `${kind}/${surface}: cancel restores solid swatch`);
        await page.locator(`${scope} .cc98-rebuild-color-chooser`).click();
        await popover.locator(".cc98-rebuild-color-mode-button[data-cc98-color-mode='gradient']").click();
        assert.match(await page.locator(`${scope} .cc98-rebuild-color-apply .sp-preview`).evaluate((node) => node.style.backgroundImage), /linear-gradient/, `${kind}/${surface}: live gradient swatch`);
        await popover.locator(".cc98-rebuild-color-popover-cancel").click();
        assert.equal(await page.locator(`${scope} .cc98-rebuild-color-apply .sp-preview`).evaluate((node) => getComputedStyle(node).backgroundImage), "none", `${kind}/${surface}: cancel restores gradient draft`);
        await page.evaluate(({ kind, surface }) => window.__fontTest.set("|second|", kind, surface), { kind, surface });
        await page.locator(`${scope} .cc98-rebuild-color-apply`).click();
        assert.equal((await page.evaluate(() => window.__fontTest.inspect())).value, "[color=#2266aa]second[/color]", `${kind}/${surface}: quick apply uses confirmed color`);
        count++;
      }
    }
    await page.evaluate(() => {
      const source = document.createElement("div");
      source.className = "message-message-window";
      source.id = "message-editor-test";
      source.innerHTML = '<div class="message-message-wPost"><textarea class="message-message-wPostArea"></textarea></div>';
      document.querySelector("main").append(source);
      stabilizePrivateMessageEditor(source);
      const textarea = source.querySelector(".cc98-rebuild-message-editor-textarea");
      setNativeMessageInputValue(textarea, "[size=5]abcd[/size]");
      textarea.focus();
      textarea.setSelectionRange(8, 12);
    });
    const messageSize = page.locator("#message-editor-test select[title='选择字号']");
    assert.equal(await messageSize.locator("option[value='__cc98_reset__']").count(), 1);
    await messageSize.dispatchEvent("pointerdown");
    await messageSize.focus();
    await messageSize.selectOption("__cc98_reset__");
    assert.equal(await page.locator("#message-editor-test .cc98-rebuild-message-editor-textarea").inputValue(), "abcd");
    assert.equal(await page.locator("#message-editor-test .message-message-wPostArea").inputValue(), "abcd");
    assert.equal(await messageSize.inputValue(), "");
    count++;
    await page.locator("#profile-router").screenshot({ path: path.join(os.tmpdir(), "cc98-font-editor.png") });
    await page.locator("#native-editor .cc98-rebuild-font-size-trigger").click();
    await page.locator(".cc98-rebuild-font-size-popover:not([hidden])").screenshot({ path: path.join(os.tmpdir(), "cc98-font-size-dropdown.png") });
    await page.locator(".cc98-rebuild-font-size-popover:not([hidden]) .cc98-rebuild-font-size-reset").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.dataset.cc98ComfortTheme = "night";
      document.documentElement.dataset.cc98ComfortTone = "dark";
    });
    await page.locator("#native-editor").screenshot({ path: path.join(os.tmpdir(), "cc98-typography-mobile.png") });
    console.log(`font-editor: ${count} cases passed (font/size/reset, two editors, both surfaces)`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
