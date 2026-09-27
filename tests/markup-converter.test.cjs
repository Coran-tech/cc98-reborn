const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const converter = require("../src/markup-converter.js");

const samples = [
  ["[b]粗体[/b]", "**粗体**"],
  ["[i]斜体[/i]", "_斜体_"],
  ["[b]甲[i]乙[/i][/b]", "**甲_乙_**"],
  ["[del]删除[/del]", "~~删除~~"],
  ["[url=https://www.cc98.org/topic/1]链接[/url]", "[链接](https://www.cc98.org/topic/1)"],
  ["[img]https://example.com/a.png[/img]", "![](https://example.com/a.png)"],
  ["[quote]第一行\n第二行[/quote]", "> 第一行\n> 第二行"],
  ["[code]a\nb[/code]", "```\na\nb\n```"],
  ["[line]", "---"],
  ["[md]# 标题[/md]", "# 标题"],
  ["[table][tr][th]甲[/th][th]乙[/th][/tr][tr][td]1[/td][td]2[/td][/tr][/table]", "| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |"]
];
for (const [source, expected] of samples) {
  const result = converter.convertUbbToMarkdown(source);
  assert.equal(result.output, expected, source);
  assert.equal(result.blocked, false, source);
}
assert.equal(converter.convertUbbToMarkdown("[replyview]隐藏内容[/replyview]").blocked, true);
assert.equal(converter.convertUbbToMarkdown("[posteronly]").blocked, true);
assert.match(converter.convertUbbToMarkdown("[color=#f00]红[/color]").warnings.join(" "), /color/);
assert.equal(converter.convertUbbToMarkdown("[code]a```b[/code]").output, "````\na```b\n````");
assert.equal(converter.convertUbbToMarkdown("\n\n[b]甲[/b]\n").output, "\n\n**甲**\n");
assert.match(converter.convertUbbToMarkdown("[ac01]").warnings.join(" "), /表情/);
assert.match(converter.convertUbbToMarkdown("[table][tr][td=2,1]合并[/td][/tr][/table]").warnings.join(" "), /复杂表格/);

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
    const converted = await page.evaluate(() => {
      const api = window.CC98RebornMarkupConverter;
      return {
        toUbb: api.convertMarkdownToUbb("**粗体** *斜体* [链接](https://www.cc98.org) ![](https://example.com/a.png)"),
        unsafe: api.convertMarkdownToUbb("[危险](javascript:alert(1))"),
        code: api.convertMarkdownToUbb("```js\na < b\n```"),
        table: api.convertMarkdownToUbb("| A | B |\n| --- | --- |\n| 1 | 2 |"),
        literalTag: api.convertMarkdownToUbb("\\[b\\] 是文字"),
        rawHtml: api.convertMarkdownToUbb("<script>bad()</script><b>good</b>")
      };
    });
    assert.match(converted.toUbb.output, /\[b\]粗体\[\/b\]/);
    assert.match(converted.toUbb.output, /\[i\]斜体\[\/i\]/);
    assert.match(converted.toUbb.output, /\[url=https:\/\/www\.cc98\.org\]链接\[\/url\]/);
    assert.match(converted.toUbb.output, /\[img\]https:\/\/example\.com\/a\.png\[\/img\]/);
    assert.doesNotMatch(converted.unsafe.output, /javascript:/i);
    assert.match(converted.code.output, /\[code\]a < b\[\/code\]/);
    assert.match(converted.table.output, /\[table\]/);
    assert.match(converted.literalTag.output, /\[noubb\]\[b\]/);
    assert.equal(converted.rawHtml.blocked, true);

    const editor = page.locator("#native-editor");
    const convertButton = editor.locator("[data-cc98-dual-ubb-action='convert']");
    assert.equal(await convertButton.locator("xpath=following-sibling::*[1]").textContent(), "实验性");
    assert.equal(await editor.locator(".cc98-rebuild-dual-ubb-toolbar-actions .cc98-local-syntax-experimental-badge").count(), 1);
    await editor.locator(".cc98-rebuild-dual-ubb-toolbar-actions").screenshot({
      path: path.join(os.tmpdir(), "cc98-convert-toolbar-badge.png")
    });
    await convertButton.click();
    const dialog = page.locator(".cc98-rebuild-convert-dialog");
    await dialog.waitFor();
    const input = dialog.locator(".cc98-rebuild-convert-pane textarea").first();
    const output = dialog.locator(".cc98-rebuild-convert-pane textarea").last();
    await input.fill("[b]测试[/b]");
    assert.equal(await output.inputValue(), "**测试**");
    await dialog.screenshot({ path: path.join(os.tmpdir(), "cc98-markup-converter-desktop.png") });
    await dialog.locator(".cc98-rebuild-convert-apply").click();
    assert.equal(await editor.locator(".ubb-editor > textarea").inputValue(), "[md]**测试**[/md]");
    await editor.locator("[data-cc98-dual-ubb-action='convert']").click();
    await dialog.getByRole("button", { name: "Markdown → UBB" }).click();
    assert.equal(await input.inputValue(), "**测试**");
    assert.match(await output.inputValue(), /\[b\]测试\[\/b\]/);
    await dialog.locator(".cc98-rebuild-convert-apply").click();
    assert.equal((await editor.locator(".ubb-editor > textarea").inputValue()).trim(), "[b]测试[/b]");
    await editor.locator("[data-cc98-dual-ubb-action='convert']").click();
    await input.fill("[replyview]隐藏内容[/replyview]");
    assert.equal(await dialog.locator(".cc98-rebuild-convert-apply").isDisabled(), true);
    await input.fill("[color=#f00]红[/color]");
    assert.equal(await dialog.locator(".cc98-rebuild-convert-apply").isDisabled(), true);
    await dialog.locator(".cc98-rebuild-convert-review input").check();
    assert.equal(await dialog.locator(".cc98-rebuild-convert-apply").isEnabled(), true);
    await page.setViewportSize({ width: 390, height: 780 });
    await dialog.screenshot({ path: path.join(os.tmpdir(), "cc98-markup-converter-mobile.png") });
    await page.evaluate(() => {
      const root = document.documentElement;
      root.dataset.cc98ComfortTone = "dark";
      root.style.setProperty("--cc98-comfort-surface", "#202b2a");
      root.style.setProperty("--cc98-comfort-surface-2", "#293a38");
      root.style.setProperty("--cc98-comfort-text", "#edf4f1");
      root.style.setProperty("--cc98-comfort-border", "#526561");
      root.style.setProperty("--cc98-comfort-accent", "#87cbb8");
    });
    await dialog.screenshot({ path: path.join(os.tmpdir(), "cc98-markup-converter-dark.png") });
    await dialog.locator(".cc98-rebuild-convert-close").click();
    assert.equal((await editor.locator(".ubb-editor > textarea").inputValue()).trim(), "[b]测试[/b]");
    console.log("markup converter: core cases, safety checks, and editor round trip passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
