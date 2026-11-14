const assert = require("node:assert/strict");
const path = require("node:path");
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
    console.log(
      "Image insertion: native upload, multi-editor isolation, image URL and signature source passed."
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
