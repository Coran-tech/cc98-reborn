const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    const root = path.resolve(__dirname, "..");
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const file = path.resolve(root, "." + url.pathname);
      if (url.origin !== "http://localhost" || !file.startsWith(root + path.sep))
        return route.abort();
      try {
        await route.fulfill({ path: file });
      } catch {
        await route.fulfill({ status: 404 });
      }
    });
    await page.goto("http://localhost/tests/local-ubb-editor.html");
    await page.waitForFunction(() => window.__ubbRegression?.state);
    await page.evaluate(() => {
      for (const editor of document.querySelectorAll(".createTopic")) {
        const toolbar = editor.querySelector(".ubb-buttons");
        toolbar.insertAdjacentHTML(
          "beforeend",
          '<label class="ubb-button" for="ubbFileUpload" title="上传文件">上传</label><button type="button" class="ubb-button" title="插入图片">图</button>'
        );
        const input = document.createElement("input");
        input.type = "file";
        input.id = "ubbFileUpload";
        input.multiple = true;
        editor.querySelector(".ubb-editor").append(input);
        const native = editor.__cc98DualUbbState.textarea;
        // Mirror the native uploader: keep the offsets from onBlur, then
        // apply the upload result asynchronously using those saved offsets.
        let offsets;
        native.addEventListener(
          "blur",
          () => (offsets = [native.selectionStart, native.selectionEnd])
        );
        input.addEventListener("change", async () => {
          editor.dataset.uploadSizes = [...input.files].map((f) => f.size).join(",");
          await new Promise((resolve) => setTimeout(resolve, 20));
          const [start, end] = offsets || [native.value.length, native.value.length];
          const tags = Array.from(input.files, (f) => "[img]" + f.name + "[/img]").join("");
          setNativeMessageInputValue(
            native,
            native.value.slice(0, start) + tags + native.value.slice(end)
          );
          input.value = "";
        });
      }
    });
    const sample = "Left\nRIGHT end";
    const code = "[img]https://cc98.org/test.png[/img]";
    async function select(id, surface, start, end) {
      await page.evaluate(
        ({ id, surface, start, end, sample }) => {
          const ed = document.querySelector(id);
          const native = ed.querySelector("textarea");
          setNativeMessageInputValue(native, sample);
          const target = ed.querySelector(".cc98-rebuild-dual-ubb-" + surface);
          target.focus();
          const text = Array.from(
            (function* () {
              const w = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
              while (w.nextNode()) yield w.currentNode;
            })()
          ).find((n) => n.data.includes("RIGHT"));
          const base = text.data.indexOf("RIGHT");
          const range = document.createRange();
          range.setStart(text, base + start);
          range.setEnd(text, base + end);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
        },
        { id, surface, start, end, sample }
      );
    }
    for (const [id, pane, start, end] of [
      ["#native-editor", "visual", 2, 2],
      ["#blank-editor", "source", 1, 4]
    ]) {
      await select(id, pane, start, end);
      const choosing = page.waitForEvent("filechooser");
      await page.locator(id + " label[for=ubbFileUpload]").click();
      const chooser = await choosing;
      assert.equal(
        await chooser.element().evaluate((el) => el.closest(".createTopic").id),
        id.slice(1)
      );
      await chooser.setFiles(
        ["1.png", "2.png"].map((name) => ({
          name,
          mimeType: "image/png",
          buffer: Buffer.from("fixture")
        }))
      );
      const expected =
        sample.slice(0, 5 + start) + "[img]1.png[/img][img]2.png[/img]" + sample.slice(5 + end);
      await page.waitForFunction(
        ({ id, expected }) => document.querySelector(id + " textarea").value === expected,
        { id, expected },
        { timeout: 3000 }
      );
    }
    for (const [id, pane] of [
      ["#native-editor", "visual"],
      ["#native-editor", "source"],
      ["#profile-router", "source"]
    ]) {
      await select(id, pane, 1, 3);
      page.once("dialog", (dialog) => dialog.accept("https://cc98.org/test.png"));
      await page.locator(id + ' [title="插入图片"]').click();
      assert.equal(await page.locator(id + " textarea").inputValue(), "Left\nR" + code + "HT end");
    }
    async function pasteImage(id, pane, large = false) {
      await page.locator(id + " .cc98-rebuild-dual-ubb-" + pane).evaluate(async (el, large) => {
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 4;
        const blob = await new Promise((done) => canvas.toBlob(done));
        const parts = large ? [blob, new Uint8Array(5 * 1024 * 1024)] : [blob];
        const file = new File(parts, "screen.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(file);
        el.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
        );
      }, large);
    }
    for (const [pane, large, choice] of [
      ["visual", false, ""],
      ["source", true, "取消"],
      ["source", true, "缩小后插入"],
      ["source", true, "使用原图"]
    ]) {
      await select("#native-editor", pane, 1, 3);
      await pasteImage("#native-editor", pane, large);
      if (choice) {
        const msg = await page
          .locator(".cc98-rebuild-toast-text,.cc98-rebuild-paste-choice")
          .allTextContents();
        assert(
          await page.locator(".cc98-rebuild-paste-choice").count(),
          "Missing image size choice: " + JSON.stringify(msg)
        );
        if (choice === "取消") {
          await fs.mkdir(path.join(root, "outputs/beta-reading-tools"), { recursive: true });
          await page
            .locator(".cc98-rebuild-paste-choice")
            .screenshot({ path: path.join(root, "outputs/beta-reading-tools/image-choice.png") });
        }
        await page.getByRole("button", { name: choice, exact: true }).click();
      }
      if (choice === "取消") {
        assert.equal(await page.locator("#native-editor textarea").inputValue(), sample);
      } else {
        await page.waitForFunction(
          () =>
            document.querySelector("#native-editor textarea").value ===
            "Left\nR[img]screen.png[/img]HT end"
        );
        const size = Number(await page.locator("#native-editor").getAttribute("data-upload-sizes"));
        assert.equal(size > 5 * 1024 * 1024, choice === "使用原图");
      }
    }
    console.log(
      "Image insertion: native picker, both paste panes, oversized original/shrink/cancel, editor isolation and caret placement passed."
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
