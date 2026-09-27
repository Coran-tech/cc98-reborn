const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
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
      document.querySelector("main").id = "cc98-comfort-app";
      const filler = document.createElement("div");
      filler.style.height = "1000px";
      document.body.prepend(filler);
      document.body.append(filler.cloneNode());
      const button = document.querySelector("#native-editor .ubb-buttons .ubb-emoji-button");
      window.scrollTo(0, button.getBoundingClientRect().top + scrollY - 570);
    });
    const before = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.locator("#native-editor .ubb-buttons .ubb-emoji-button").click();
    await page.waitForTimeout(300);
    const opened = await page.evaluate(() => {
      const panel = document.querySelector("#native-editor > .cc98-rebuild-editor-emoji-panel");
      const rect = panel.getBoundingClientRect();
      return {
        hidden: panel.hidden,
        position: getComputedStyle(panel).position,
        top: rect.top,
        bottom: rect.bottom,
        scrollHeight: document.documentElement.scrollHeight,
        spacer: getComputedStyle(document.querySelector("main"), "::after").content
      };
    });
    assert.equal(opened.hidden, false);
    assert.equal(opened.position, "fixed");
    assert.ok(opened.top >= 0 && opened.bottom <= 700, JSON.stringify(opened));
    assert.ok(Math.abs(opened.scrollHeight - before) <= 2, JSON.stringify({ before, opened }));
    assert.equal(opened.spacer, "none");
    await page.evaluate(() => window.scrollBy(0, 160));
    await page.waitForTimeout(100);
    const afterScroll = await page.evaluate(() => {
      const rect = document.querySelector("#native-editor > .cc98-rebuild-editor-emoji-panel").getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, scrollHeight: document.documentElement.scrollHeight };
    });
    assert.ok(afterScroll.top >= 0 && afterScroll.bottom <= 700, JSON.stringify(afterScroll));
    assert.ok(Math.abs(afterScroll.scrollHeight - before) <= 2, JSON.stringify({ before, afterScroll }));
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(100);
    const narrow = await page.evaluate(() => {
      const rect = document.querySelector("#native-editor > .cc98-rebuild-editor-emoji-panel").getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    assert.ok(narrow.left >= 0 && narrow.right <= 360 && narrow.top >= 0 && narrow.bottom <= 640, JSON.stringify(narrow));
    await page.evaluate(() => {
      document.querySelector("#native-editor").classList.remove("cc98-rebuild-emoji-panel-open");
      document.querySelector("#native-editor > .cc98-rebuild-editor-emoji-panel").hidden = true;
      for (const className of ["cc98-rebuild-color-button-open", "cc98-rebuild-font-size-button-open"]) {
        document.documentElement.classList.add(className);
        assertNoSpacer(className);
        document.documentElement.classList.remove(className);
      }
      function assertNoSpacer(className) {
        if (getComputedStyle(document.querySelector("main"), "::after").content !== "none") {
          throw new Error(`${className} added a page-end spacer`);
        }
      }
    });
    console.log("editor popup does not add bottom whitespace and stays within viewport");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
