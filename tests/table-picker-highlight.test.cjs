const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
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
    await page.addScriptTag({ url: "/src/extended-ubb.js" });
    const trigger = page.locator("#native-editor .cc98-local-syntax-trigger");
    await trigger.waitFor();
    assert.equal(await trigger.textContent(), "扩展");
    assert.equal(await page.locator("#native-editor .cc98-local-syntax-tools .cc98-local-syntax-experimental-badge").count(), 0);
    await page.locator("#native-editor .cc98-local-syntax-tools").screenshot({
      path: path.join(os.tmpdir(), "cc98-extended-toolbar-button.png")
    });
    await trigger.click();
    const grid = page.locator("#native-editor .cc98-local-table-grid");
    const target = grid.locator('[data-row="5"][data-column="5"]');
    await target.hover();
    const light = await page.evaluate(() => {
      const grid = document.querySelector("#native-editor .cc98-local-table-grid");
      const selected = grid.querySelector('[data-row="5"][data-column="5"]');
      const unselected = grid.querySelector('[data-row="6"][data-column="6"]');
      return {
        selectedCount: grid.querySelectorAll(".is-selected").length,
        selectedColor: getComputedStyle(selected).backgroundColor,
        unselectedColor: getComputedStyle(unselected).backgroundColor,
        selectedBorder: getComputedStyle(selected).borderTopColor,
        unselectedBorder: getComputedStyle(unselected).borderTopColor
      };
    });
    assert.equal(light.selectedCount, 25);
    assert.notEqual(light.selectedColor, light.unselectedColor);
    assert.notEqual(light.selectedBorder, light.unselectedBorder);
    await page.locator("#native-editor .cc98-local-syntax-popover").screenshot({
      path: path.join(os.tmpdir(), "cc98-table-picker-light.png")
    });
    await page.evaluate(() => {
      const root = document.documentElement;
      root.dataset.cc98ComfortTone = "dark";
      root.style.setProperty("--cc98-comfort-surface", "#202b2a");
      root.style.setProperty("--cc98-comfort-surface-2", "#293a38");
      root.style.setProperty("--cc98-comfort-accent", "#87cbb8");
    });
    const dark = await page.evaluate(() => {
      const grid = document.querySelector("#native-editor .cc98-local-table-grid");
      return {
        selectedColor: getComputedStyle(grid.querySelector('[data-row="5"][data-column="5"]')).backgroundColor,
        unselectedColor: getComputedStyle(grid.querySelector('[data-row="6"][data-column="6"]')).backgroundColor
      };
    });
    assert.notEqual(dark.selectedColor, dark.unselectedColor);
    console.log("table picker highlights 5x5 range in light and dark themes");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
