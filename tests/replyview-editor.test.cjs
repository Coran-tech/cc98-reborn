const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    // Serve only local fixture assets; the test must not contact the forum.
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (url.origin !== "http://127.0.0.1:8765" || !file.startsWith(`${root}${path.sep}`)) {
        return route.abort();
      }
      try {
        await fs.access(file);
        await route.fulfill({ path: file });
      } catch {
        await route.fulfill({ status: 404, body: "Not found" });
      }
    });
    await page.goto("http://127.0.0.1:8765/tests/local-ubb-editor.html");
    await page.waitForFunction(() => Boolean(window.__ubbRegression?.state));

    async function select(source, surface = "visual", start = 0, end = null) {
      await page.evaluate(({ source, surface, start, end }) => {
        const { editor, state } = window.__ubbRegression;
        delete editor.__cc98WysiwygLogicalSelection;
        state.textarea.value = source;
        state.refreshFromNative(false);
        const target = surface === "source" ? state.sourceEditor : state.visual;
        target.focus();
        const range = document.createRange();
        range.selectNodeContents(target);
        if (end !== null) {
          const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
          let offset = 0;
          let node;
          while ((node = walker.nextNode())) {
            if (start >= offset && start <= offset + node.length) {
              range.setStart(node, start - offset);
            }
            if (end >= offset && end <= offset + node.length) {
              range.setEnd(node, end - offset);
              break;
            }
            offset += node.length;
          }
        }
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        if (surface === "source" && end !== null) {
          restoreProfileSignatureSourceSelection(target, { start, end });
        }
        state.activeSurface = surface;
        state.rememberSelection();
      }, { source, surface, start, end });
    }

    async function inspect() {
      return page.evaluate(() => {
        const { state } = window.__ubbRegression;
        const block = state.visual.querySelector("[data-cc98-local-ubb-tag='replyview']");
        return {
          value: state.textarea.value,
          source: getProfileSignatureSourceText(state.sourceEditor),
          serialized: serializeProfileSignatureWysiwyg(state.visual),
          blockCount: state.visual.querySelectorAll("[data-cc98-local-ubb-tag='replyview']").length,
          text: block?.textContent,
          label: block?.dataset.cc98LocalLabel,
          labelDisplay: block ? getComputedStyle(block, "::before").display : null,
          selected: window.getSelection().toString()
        };
      });
    }

    const hide = page.locator('#native-editor .ubb-button[title="回复后可见"]');
    await select("secret");
    await hide.click();
    let result = await inspect();
    assert.equal(result.value, "[replyview]secret[/replyview]");
    assert.equal(result.blockCount, 1, "Hide must render a visible block on the first click");
    assert.equal(result.label, "回复后可见");
    assert.equal(result.labelDisplay, "block", "Label must occupy its own line");
    assert.equal(result.source, result.value);
    assert.equal(result.serialized, result.value, "Label must not leak into submitted UBB");
    assert.equal(result.selected, "secret", "Selected content must stay editable");
    await page.keyboard.insertText("edited");
    result = await inspect();
    assert.equal(result.value, "[replyview]edited[/replyview]");

    for (const surface of ["visual", "source"]) {
      for (const [text, start, end] of [["first last", 0, 5], ["first last", 6, 10]]) {
        await select(text, surface, start, end);
        await hide.click();
        result = await inspect();
        assert.equal(result.blockCount, 1, `${surface} partial selection did not render`);
        assert.equal(result.text, text.slice(start, end), `${surface} partial selection: ${JSON.stringify(result)}`);
        assert.equal(result.source, result.value);
        assert.equal(result.serialized.replace(/\n/g, ""),
          `${text.slice(0, start)}[replyview]${text.slice(start, end)}[/replyview]${text.slice(end)}`);
      }
    }

    const formatted = "[b]bold[/b]\n[color=#ff0000]red[/color]\n[ac01]";
    await select(formatted);
    await hide.click();
    result = await inspect();
    assert.equal(result.value, `[replyview]${formatted}[/replyview]`);
    assert.equal(result.serialized, result.value);
    await page.evaluate(() => window.__ubbRegression.state.forceSynchronize());
    assert.equal((await inspect()).value, result.value, "Manual sync must not change hidden content");

    await select("[ac01]");
    await hide.click();
    result = await inspect();
    assert.equal(result.value, "[replyview][ac01][/replyview]", "An image-only selection must be wrapped");
    assert.equal(result.blockCount, 1);

    await select("", "source");
    await page.keyboard.insertText("[replyview]before\nafter[/replyview]");
    result = await inspect();
    assert.equal(result.text, "beforeafter", "Typing in source must update the visual block");
    assert.equal(result.labelDisplay, "block");
    assert.equal(result.serialized, result.value);

    await select("[replyview]before\nafter[/replyview]", "source");
    result = await inspect();
    assert.equal(result.text, "beforeafter");
    assert.equal(result.serialized, result.value);
    assert.equal(result.labelDisplay, "block");

    const screenshot = path.join(os.tmpdir(), "cc98-replyview-editor.png");
    await page.locator("#native-editor").screenshot({ path: screenshot });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.dataset.cc98ComfortTheme = "night";
      document.documentElement.dataset.cc98ComfortTone = "dark";
    });
    assert.equal((await inspect()).labelDisplay, "block");
    const mobileScreenshot = path.join(os.tmpdir(), "cc98-replyview-editor-mobile.png");
    await page.locator("#native-editor").screenshot({ path: mobileScreenshot });
    console.log(`replyview-editor: passed (visual/source selection, live editing, formatting, round trip)\nScreenshot: ${screenshot}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
