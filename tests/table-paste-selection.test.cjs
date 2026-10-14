const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const tableSource = "[table][tr][td]alpha[/td][td]beta[/td][td][/td][/tr][tr][td]gamma[/td][td][/td][td]omega[/td][/tr][/table]";

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const errors = [];
  let count = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 1100 } });
    page.on("pageerror", (error) => errors.push(error.message));
    // All resources are local; this regression never contacts CC98.
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (url.origin !== "http://127.0.0.1:8765" || !file.startsWith(`${root}${path.sep}`)) {
        return route.abort();
      }
      if (url.pathname === "/src/content.js" && process.env.CC98_CONTENT_FIXTURE) {
        file = path.resolve(root, process.env.CC98_CONTENT_FIXTURE);
      }
      try { await route.fulfill({ path: file }); }
      catch { await route.fulfill({ status: 404, body: "Not found" }); }
    });
    await page.goto("http://127.0.0.1:8765/tests/local-ubb-editor.html");
    await page.waitForFunction(() => Boolean(window.__ubbRegression?.state));
    if (process.argv.includes("--ascii")) {
      await page.addStyleTag({ path: path.join(root, "src/interface-styles.css") });
      await page.addScriptTag({ path: path.join(root, "src/interface-style.js") });
      await page.evaluate(() => {
        document.querySelector('main').id = 'cc98-comfort-app';
        document.querySelector('#native-editor').classList.add('cc98-rebuild-native-editor');
        const settings = { enabled: true, themeStyle: 'ascii' };
        CC98RebornThemeCore.apply(document.documentElement, settings);
        CC98RebornInterfaceStyle.sync(settings);
      });
      await page.locator('#native-editor > .cc98-ascii-decoration').waitFor();
    }

    async function reset(kind) {
      await page.evaluate(({ kind, source }) => {
        const editor = kind === "native" ? window.__ubbRegression.editor
          : document.querySelector("[data-cc98-profile-signature-editor='true']");
        clearEditorColorSelectionSnapshot(editor);
        delete editor.__cc98WysiwygLogicalSelection;
        delete editor.__cc98WysiwygRange;
        setNativeMessageInputValue(getNativeEditorTextarea(editor), source);
        window.__tablePasteEditor = editor;
        window.__tablePasteVisual = editor.querySelector(".cc98-rebuild-dual-ubb-visual");
        window.__tablePasteInputCount = 0;
        window.__tablePasteVisual.oninput = () => { window.__tablePasteInputCount += 1; };
      }, { kind, source: tableSource });
      const scope = kind === "native" ? "#native-editor" : "#profile-router";
      const cells = page.locator(`${scope} .cc98-rebuild-dual-ubb-visual td`);
      assert.equal(await cells.count(), 6, `${kind}: table fixture must render`);
      await cells.nth(0).click();
      await page.keyboard.press("End");
      assert.equal((await inspect()).cell, 0, `${kind}: initial caret must be in first cell`);
      return cells;
    }

    async function inspect() {
      return page.evaluate(() => {
        const editor = window.__tablePasteEditor;
        const visual = window.__tablePasteVisual;
        const cells = [...visual.querySelectorAll("td")];
        const selection = window.getSelection();
        const range = selection.rangeCount ? selection.getRangeAt(0) : null;
        const element = range?.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer : range?.startContainer.parentElement;
        const cell = element?.closest("td");
        const probe = cell ? document.createRange() : null;
        if (probe) { probe.selectNodeContents(cell); probe.setEnd(range.startContainer, range.startOffset); }
        const saved = editor.__cc98WysiwygRange;
        const savedElement = saved?.startContainer.nodeType === Node.ELEMENT_NODE
          ? saved.startContainer : saved?.startContainer.parentElement;
        return {
          cells: cells.map((node) => node.textContent.replace(/[\u200b\uFEFF]/g, "")),
          cell: cells.indexOf(cell),
          offset: probe?.toString().replace(/[\u200b\uFEFF]/g, "").length,
          savedCell: cells.indexOf(savedElement?.closest("td")),
          collapsed: range?.collapsed,
          inputCount: window.__tablePasteInputCount,
          source: getNativeEditorTextarea(editor).value,
          lower: getProfileSignatureSourceText(editor.querySelector(".cc98-rebuild-dual-ubb-source")),
          serialized: serializeProfileSignatureWysiwyg(visual)
        };
      });
    }

    async function paste(text) {
      await page.evaluate((text) => {
        const clipboard = new DataTransfer();
        clipboard.setData("text/plain", text);
        window.__tablePasteVisual.dispatchEvent(new ClipboardEvent("paste", {
          clipboardData: clipboard, bubbles: true, cancelable: true
        }));
      }, text);
    }

    async function pasteAtCurrentCell(label, text = "粘贴") {
      const before = await inspect();
      assert.ok(before.cell >= 0, `${label}: browser caret must be in a table cell`);
      assert.equal(before.collapsed, true, `${label}: fixture requires a collapsed caret`);
      const expected = [...before.cells];
      expected[before.cell] = expected[before.cell].slice(0, before.offset)
        + text + expected[before.cell].slice(before.offset);
      await paste(text);
      const after = await inspect();
      assert.deepEqual(after.cells, expected,
        `${label}: paste must use the live cell ${before.cell}, not saved cell ${before.savedCell}`);
      assert.equal(after.cell, before.cell, `${label}: caret must remain in the pasted cell`);
      assert.equal(after.source, after.lower, `${label}: lower pane must synchronize`);
      assert.equal(after.source, after.serialized, `${label}: submitted UBB must match the visual table`);
      count += 1;
    }

    for (const kind of ["native", "profile"]) {
      let cells = await reset(kind);
      await cells.nth(1).click();
      assert.equal((await inspect()).inputCount, 0, `${kind}: clicking another cell must not type`);
      assert.equal((await inspect()).cell, 1);
      await pasteAtCurrentCell(`${kind}: mouse move to nonempty cell`);
      await pasteAtCurrentCell(`${kind}: repeated paste`, "第二次");

      cells = await reset(kind);
      await cells.nth(2).click();
      assert.equal((await inspect()).cell, 2, `${kind}: empty cell must be selectable`);
      await pasteAtCurrentCell(`${kind}: mouse move to empty cell`);

      await reset(kind);
      await page.keyboard.press("ArrowRight");
      assert.equal((await inspect()).cell, 1, `${kind}: ArrowRight must cross the cell boundary`);
      assert.equal((await inspect()).inputCount, 0, `${kind}: arrow navigation must not type`);
      await pasteAtCurrentCell(`${kind}: keyboard move to next cell`);

      // Browser selection moves on keydown. Paste can arrive without keyup
      // (for example through a context menu or another input method).
      await reset(kind);
      await page.keyboard.down("ArrowRight");
      assert.equal((await inspect()).cell, 1, `${kind}: keydown must move the live caret`);
      assert.equal((await inspect()).inputCount, 0);
      try {
        await pasteAtCurrentCell(`${kind}: paste before navigation keyup`, "即时");
      } finally {
        await page.keyboard.up("ArrowRight");
      }

      // Selection API movement does not emit mouseup/keyup. This models an
      // accessibility or touch selection update and must not restore old DOM ranges.
      cells = await reset(kind);
      await page.evaluate(() => {
        const cell = window.__tablePasteVisual.querySelectorAll("td")[4];
        const range = document.createRange();
        range.selectNodeContents(cell);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
      assert.equal((await inspect()).cell, 4);
      assert.equal((await inspect()).inputCount, 0);
      await pasteAtCurrentCell(`${kind}: empty cell selection without keyup or mouseup`, "空格");

      await reset(kind);
      await page.evaluate(() => {
        const text = window.__tablePasteVisual.querySelectorAll("td")[1].firstChild;
        const range = document.createRange();
        range.setStart(text, 1);
        range.setEnd(text, 3);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
      const selected = await inspect();
      assert.equal(selected.cell, 1);
      assert.equal(selected.collapsed, false);
      assert.equal(selected.inputCount, 0);
      await paste("替换");
      const replaced = await inspect();
      assert.deepEqual(replaced.cells, ["alpha", "b替换a", "", "gamma", "", "omega"],
        `${kind}: paste must replace the live selection in the newly selected cell`);
      assert.equal(replaced.cell, 1, `${kind}: replacing a selection must keep the caret in that cell`);
      assert.equal(replaced.source, replaced.lower, `${kind}: selection replacement must sync the lower pane`);
      assert.equal(replaced.source, replaced.serialized, `${kind}: selection replacement must serialize correctly`);
      count += 1;
    }
    assert.deepEqual(errors, [], "Editor must not raise browser errors");
    console.log(`table-paste-selection: ${count} checks passed${process.argv.includes("--ascii") ? " in ASCII style" : ""} (mouse, keyboard, empty cells, repeated paste, native and profile)`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
