const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "http://127.0.0.1:8765";
const palettes = ["teal", "green", "blue", "violet", "rose", "amber"];
const colorCases = [
  ...palettes.map((palette) => ({ id: palette, palette })),
  { id: "custom-black-white", palette: "custom", primary: "#000000", secondary: "#ffffff" },
  { id: "custom-white-black", palette: "custom", primary: "#ffffff", secondary: "#000000" },
  { id: "custom-gray", palette: "custom", primary: "#808080", secondary: "#aaaaaa" },
  { id: "custom-yellow", palette: "custom", primary: "#ffff00", secondary: "#00ffff" },
  { id: "custom-vivid", palette: "custom", primary: "#ff00ff", secondary: "#00ff00" }
];
const customOverrides = ["--cc98-comfort-accent", "--cc98-comfort-accent-2", "--cc98-comfort-secondary", "--cc98-comfort-secondary-soft", "--cc98-comfort-link"];
const roles = {
  topbar: "#element-topbar", brand: "#element-brand", activeNav: "#element-active-nav",
  primary: "#element-primary", search: "#element-search", page: "#element-page",
  refresh: "#element-refresh", boardMarker: "#element-board-marker",
  footer: "#element-footer",
  secondary: "#element-secondary", boardLink: "#element-board-link", tag: "#element-tag",
  bodyLink: "#element-body-link", quote: "#element-quote", quoteLink: "#element-quote-link"
};
const semantic = {
  positive: "#element-positive", negative: "#element-negative", warning: "#element-warning",
  hotCard: "#element-hot-card", hotLabel: "#element-hot-label", ubbColor: "#element-ubb-color", ubbLink: "#element-ubb-link"
};

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1180, height: 960 } });
  const errors = [];
  const output = path.join(root, "outputs/theme-preview");
  const records = [];
  try {
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
      try { return await route.fulfill({ path: file }); }
      catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    await page.goto(`${origin}/tests/page-theme-elements.html`);
    await page.waitForFunction(() => document.documentElement.dataset.cc98ComfortPalette === "teal");
    // Check the completed role colors, independent of decorative hover transitions.
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
    await fs.mkdir(output, { recursive: true });
    const neutral = new Map();
    const semanticByTone = new Map();
    const paletteSnapshots = new Map();
    for (const tone of ["light", "dark"]) {
      await page.selectOption("#fixture-tone", tone);
      for (const sample of colorCases) {
        const palette = sample.palette;
        await page.selectOption("#fixture-palette", palette);
        if (palette === "custom") {
          for (const [field, color] of [["primary", sample.primary], ["secondary", sample.secondary]]) {
            await page.fill(`#fixture-${field}`, color);
            await page.dispatchEvent(`#fixture-${field}`, "change");
          }
        }
        const snapshot = await page.evaluate(({ roles, semantic }) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          const rgba = (color) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
          const luminance = (color) => {
            const [r, g, b] = rgba(color).slice(0, 3).map((component) => { const value = component / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const effectiveBackground = (node) => {
            for (let current = node; current; current = current.parentElement) {
              const color = getComputedStyle(current).backgroundColor;
              if (rgba(color)[3] === 255) return color;
            }
            return getComputedStyle(document.documentElement).getPropertyValue("--cc98-comfort-bg").trim();
          };
          const style = (selector) => {
            const node = document.querySelector(selector);
            if (!node) throw new Error(`Missing forum component: ${selector}`);
            const css = getComputedStyle(node);
            const background = effectiveBackground(node);
            const a = luminance(css.color), b = luminance(background);
            return { color: css.color, background: css.backgroundColor, border: css.borderTopColor, leftBorder: css.borderLeftColor, bottomBorder: css.borderBottomColor, effectiveBackground: background, contrast: Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(3)) };
          };
          const root = document.documentElement;
          const css = getComputedStyle(root);
          const probe = document.createElement("i");
          document.body.append(probe);
          const token = (name) => { probe.style.color = css.getPropertyValue(name); return getComputedStyle(probe).color; };
          const tokens = { accent: token("--cc98-comfort-accent"), accentSoft: token("--cc98-comfort-accent-2"), secondary: token("--cc98-comfort-secondary"), secondarySoft: token("--cc98-comfort-secondary-soft") };
          probe.remove();
          return {
            tone: root.dataset.cc98ComfortTone, palette: root.dataset.cc98ComfortPalette,
            tokens, neutral: { body: getComputedStyle(document.body).backgroundColor, card: getComputedStyle(document.getElementById("element-card")).backgroundColor, text: css.getPropertyValue("--cc98-comfort-text").trim() },
            roles: Object.fromEntries(Object.entries(roles).map(([name, selector]) => [name, style(selector)])),
            semantic: Object.fromEntries(Object.entries(semantic).map(([name, selector]) => [name, style(selector)]))
          };
        }, { roles, semantic });
        assert.equal(snapshot.tone, tone);
        assert.equal(snapshot.palette, palette);
        if (!neutral.has(tone)) neutral.set(tone, snapshot.neutral);
        else assert.deepEqual(snapshot.neutral, neutral.get(tone), `${tone}/${palette}: neutral surfaces must not change with palette`);
        if (!semanticByTone.has(tone)) semanticByTone.set(tone, snapshot.semantic);
        else assert.deepEqual(snapshot.semantic, semanticByTone.get(tone), `${tone}/${palette}: semantic or explicit UBB colors changed with palette`);
        assert.equal(snapshot.semantic.ubbColor.color, "rgb(198, 40, 40)", "inline UBB text color overridden");
        assert.equal(snapshot.semantic.ubbLink.color, "rgb(108, 54, 176)", "inline UBB link color overridden");
        const primary = snapshot.roles.primary;
        assert.equal(primary.background, snapshot.tokens.accent, `${tone}/${palette}: main forum action must use primary color`);
        assert.equal(snapshot.roles.search.background, snapshot.tokens.accent, `${tone}/${palette}: search must use primary color`);
        for (const name of ["brand", "activeNav", "page"]) {
          assert.equal(snapshot.roles[name].color, snapshot.tokens.accent, `${tone}/${palette}: ${name} primary text`);
          assert.equal(snapshot.roles[name].background, snapshot.tokens.accentSoft, `${tone}/${palette}: ${name} primary background`);
        }
        for (const name of ["boardLink", "tag", "bodyLink", "quoteLink", "secondary", "refresh", "boardMarker", "footer"]) {
          assert.equal(snapshot.roles[name].color, snapshot.tokens.secondary, `${tone}/${palette}: ${name} must use secondary color`);
        }
        assert.equal(snapshot.roles.tag.background, snapshot.tokens.secondarySoft, `${tone}/${palette}: tag background`);
        assert.equal(snapshot.roles.quote.leftBorder, snapshot.tokens.secondary, `${tone}/${palette}: quote border`);
        assert.equal(snapshot.roles.quote.background, snapshot.tokens.secondarySoft, `${tone}/${palette}: quote background`);
        for (const name of Object.keys(roles).filter((name) => !["topbar", "boardMarker"].includes(name))) {
          assert(snapshot.roles[name].contrast >= 4.5, `${tone}/${palette}: actual ${name} contrast ${snapshot.roles[name].contrast} < 4.5`);
        }
        snapshot.case = sample.id;
        paletteSnapshots.set(`${tone}/${sample.id}`, snapshot);
        records.push(snapshot);
        if (["teal", "rose", "custom-gray", "custom-yellow", "custom-vivid"].includes(sample.id)) await page.screenshot({ path: path.join(output, `elements-${tone}-${sample.id}.png`), fullPage: true, animations: "disabled" });
      }
      await page.selectOption("#fixture-palette", "blue");
      const remaining = await page.evaluate((names) => Object.fromEntries(names.map((name) => [name, document.documentElement.style.getPropertyValue(name)])), customOverrides);
      assert(Object.values(remaining).every((value) => value === ""), `${tone}: custom inline overrides remain after selecting preset`);
      const teal = paletteSnapshots.get(`${tone}/teal`), rose = paletteSnapshots.get(`${tone}/rose`);
      for (const name of Object.keys(roles)) {
        assert.notDeepEqual(teal.roles[name], rose.roles[name], `${tone}: changing palette did not recolor actual forum ${name}`);
      }
    }
    assert.notDeepEqual(neutral.get("light"), neutral.get("dark"), "day/night neutral surfaces must differ");
    // The desktop side rail has more-specific native overrides: its search and
    // sync controls must retain their primary/secondary roles, including hover.
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(() => { document.documentElement.dataset.cc98ComfortSideTopbar = "true"; });
    for (const tone of ["light", "dark"]) {
      await page.selectOption("#fixture-tone", tone);
      for (const selector of [roles.search, roles.refresh]) {
        await page.hover(selector);
        const actual = await page.evaluate((selector) => {
          const node = document.querySelector(selector);
          const expectedName = selector === "#element-search" ? "accent" : "secondary";
          const probe = document.createElement("i");
          probe.style.color = `var(--cc98-comfort-${expectedName})`;
          document.body.append(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          const css = getComputedStyle(node);
          return { expected, color: css.color, background: css.backgroundColor };
        }, selector);
        assert.equal(selector === roles.search ? actual.background : actual.color, actual.expected, `${tone}: side rail role override`);
      }
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, "elements-computed-colors.json"), JSON.stringify(records, null, 2));
    console.log(`page-theme-elements: ${records.length} real-component combinations passed (primary, secondary, custom extremes, neutral, semantic and UBB colors)`);
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
