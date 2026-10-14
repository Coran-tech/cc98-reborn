const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "http://127.0.0.1:8765";
const output = path.join(root, "outputs/topbar-layout-preview");
const widths = [2549, 1920, 1440, 1024, 390];
const kinds = ["message", "post", "userCenter", "login", "homeHotOnly"];
const themes = [{ tone: "light", palette: "teal" }, { tone: "dark", palette: "rose" }, { tone: "dark", palette: "custom" }];
const close = (actual, expected, description) => assert(Math.abs(actual - expected) <= 1.1, `${description}: expected ${expected}, got ${actual}`);

async function measure(page) {
  return page.evaluate(() => {
    const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const app = document.getElementById("cc98-comfort-app");
    const header = app.querySelector(".cc98-rebuild-topbar");
    const css = getComputedStyle(app);
    const name = header.querySelector(".topBarUserName");
    return {
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      shell: { ...rect(app), paddingLeft: parseFloat(css.paddingLeft), paddingRight: parseFloat(css.paddingRight) },
      header: { ...rect(header), position: getComputedStyle(header).position },
      controls: Object.fromEntries(["brand", "nav", "search", "actions"].map((kind) => [kind, rect(header.querySelector(`.cc98-rebuild-${kind}`))])),
      searchControls: [...header.querySelectorAll(".cc98-rebuild-search-type, input, .cc98-rebuild-search-submit")].map((node) => ({ control: node.tagName === "INPUT" ? "input" : node.className, ...rect(node) })),
      name: { ...rect(name), clientWidth: name.clientWidth, scrollWidth: name.scrollWidth, display: getComputedStyle(name).display },
      avatar: rect(header.querySelector(".topBarUserImg img"))
    };
  });
}

async function main() {
  const baseline = process.argv.includes("--baseline");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 850 } });
  const records = [];
  const errors = [];
  const failures = [];
  try {
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const file = baseline && url.pathname === "/src/styles.css"
        ? path.join(output, "topbar-before.css")
        : path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try { return await route.fulfill({ path: file }); }
      catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    await page.goto(`${origin}/tests/topbar-layout.html`);
    await page.waitForFunction(() => document.documentElement.dataset.cc98ComfortPalette === "teal");
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
    await fs.mkdir(output, { recursive: true });

    if (baseline) {
      for (const width of [2549, 1920, 1440]) {
        await page.setViewportSize({ width, height: 850 });
        for (const kind of ["post", "message", "homeHotOnly"]) {
          await page.evaluate((kind) => setLayoutFixture({ kind }), kind);
          records.push({ kind, ...await measure(page) });
          if (width === 1920 && kind === "message") await page.screenshot({ path: path.join(output, "topbar-message-1920-before.png"), fullPage: true });
        }
      }
      const before = records.find((record) => record.viewport === 1920 && record.kind === "message");
      const normal = records.find((record) => record.viewport === 1920 && record.kind === "post");
      assert(before.header.width > normal.header.width + 200, "before CSS should reproduce the wide message header");
      await fs.writeFile(path.join(output, "baseline.json"), JSON.stringify(records, null, 2));
      console.log(`topbar baseline reproduced: message ${before.header.width}px, left ${before.header.x}px; normal ${normal.header.width}px, left ${normal.header.x}px`);
      return;
    }

    for (const width of widths) {
      await page.setViewportSize({ width, height: 850 });
      for (const side of [false, true]) {
        for (const kind of kinds) {
          let themeBaseline;
          for (const theme of themes) {
            await page.evaluate((options) => setLayoutFixture(options), { kind, side, ...theme });
            const value = await measure(page);
            const description = `${kind}/${width}/side=${side}/${theme.palette}`;
            try {
            assert(value.scrollWidth <= width + 1, `${description}: horizontal document overflow ${value.scrollWidth}px`);
            const sideRail = side && width >= 1101;
            if (sideRail) {
              close(value.header.width, 202, `${description}: side rail width`);
              close(value.header.x, 16, `${description}: side rail left margin`);
              assert.equal(value.header.position, "fixed");
            } else {
              const available = value.shell.width - value.shell.paddingLeft - value.shell.paddingRight;
              const expected = Math.min(1240, available);
              close(value.header.width, expected, `${description}: shared horizontal header width`);
              close(value.header.x, value.shell.x + value.shell.paddingLeft + (available - expected) / 2, `${description}: centered header`);
              assert(value.header.x >= 9 && value.header.right <= width - 9, `${description}: horizontal header lost screen margins`);
            }
            for (const [control, box] of Object.entries(value.controls)) {
              assert(box.width > 0, `${description}: ${control} collapsed`);
              assert(box.x >= value.header.x - 1 && box.right <= value.header.right + 1, `${description}: ${control} outside header ${JSON.stringify(box)}`);
            }
            for (const box of value.searchControls) {
              assert(box.width > 20 && box.x >= 0 && box.right <= width + 1, `${description}: a search control collapsed or left the viewport ${JSON.stringify(box)}`);
              assert(box.right <= value.header.right + 1, `${description}: search control overflowed header ${JSON.stringify(box)}`);
            }
            assert(value.avatar.width >= 20, `${description}: avatar collapsed`);
            if (!sideRail) {
              assert.notEqual(value.name.display, "none", `${description}: username hidden`);
              assert(value.name.width > 30 && value.name.scrollWidth <= value.name.clientWidth + 1, `${description}: username squeezed ${JSON.stringify(value.name)}`);
              assert(value.name.x >= value.header.x && value.name.right <= value.header.right, `${description}: username offscreen`);
            }
            const layout = { header: value.header, controls: value.controls, searchControls: value.searchControls, name: value.name, avatar: value.avatar };
            if (!themeBaseline) themeBaseline = layout;
            else assert.deepEqual(layout, themeBaseline, `${description}: theme changed header geometry`);
            } catch (error) { failures.push(error.message); }
            records.push({ kind, side, ...theme, ...value });
            if (width === 1920 && kind === "message" && !side && theme.palette === "teal") await page.screenshot({ path: path.join(output, "topbar-message-1920-after.png"), fullPage: true });
            if (width === 390 && kind === "homeHotOnly" && !side && theme.palette === "teal") await page.screenshot({ path: path.join(output, "topbar-home-hot-390.png"), fullPage: true });
          }
        }
      }
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, "verified-layouts.json"), JSON.stringify(records, null, 2));
    assert.equal(failures.length, 0, `${failures.length} layout checks failed:\n${failures.slice(0, 12).join("\n")}`);
    console.log(`topbar-layout: ${records.length} page/viewport/side/theme combinations passed`);
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
