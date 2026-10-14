const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(__dirname, "..");
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), "cc98-post-lazy-media-"));
  const port = Number(process.env.CC98_LAZY_TEST_PORT) || 44339;
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(root, "tests/local-forum/server.js")], {
    cwd: root,
    env: { ...process.env, CC98_LOCAL_PORT: String(port), CC98_LOCAL_REQUIRE_AUTH: "0", CC98_LOCAL_NATIVE_FRONTEND: "0",
      CC98_LOCAL_DATA_PATH: path.join(runtime, "forum-data.json"), CC98_LOCAL_UPLOAD_ROOT: path.join(runtime, "uploads"), CC98_LOCAL_BACKUP_ROOT: path.join(runtime, "backups") },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  let browser;
  try {
    for (let i = 0; i < 80; i += 1) {
      try { if ((await fetch(`${origin}/__test/health`)).ok) break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (i === 79) throw new Error(logs);
    }
    const image = (id) => `${origin}/static/images/lazy-media-${id}.png`;
    const tall = Array.from({ length: 95 }, (_, index) => `正文长段落 ${index + 1}，用于让图片远离首屏。`).join("\n");
    const fixtures = new Map([
      [4, { content: `${tall}\n[upload=jpg]${image("upload-tall")}[/upload]`, ids: ["upload-tall"] }],
      [5, { content: `[img]${image("image-only")}[/img]`, ids: ["image-only"] }],
      [6, { content: `[img]${image("multi-1")}[/img]\n[img]${image("multi-2")}[/img]\n[img]${image("multi-3")}[/img]`, ids: ["multi-1", "multi-2", "multi-3"] }],
      [7, { content: `[img=1]${image("hidden-image")}[/img]`, ids: [], hiddenId: "hidden-image" }],
      [8, { content: `${tall.replace(/\n/g, "\n\n")}\n\n![Markdown 图片](${image("markdown-tall")})`, contentType: 1, ids: ["markdown-tall"] }],
      [9, { content: `[upload=jpg]${image("upload-image")}[/upload]`, ids: ["upload-image"] }],
      [10, { content: `[upload=png,1]${image("upload-hidden")}[/upload]`, ids: [], hiddenId: "upload-hidden" }],
      [11, { content: `[img]${image("mixed-before")}[/img]\n[img=1]${image("mixed-repeat")}[/img]\n[img]${image("mixed-repeat")}[/img]\n[img]${image("mixed-after")}[/img]\n[img=1]${image("mixed-repeat")}[/img]`, ids: ["mixed-before", "mixed-repeat", "mixed-after"], hiddenIds: ["mixed-repeat", "mixed-repeat"], order: ["mixed-before", "hidden:mixed-repeat", "mixed-repeat", "mixed-after", "hidden:mixed-repeat"] }],
      [12, { content: `[img]${image("later-page-only")}[/img]`, ids: ["later-page-only"] }],
      [13, { content: `[img]${image("repeated-image")}[/img]\n相同图片应在各自原位置显示\n[img]${image("repeated-image")}[/img]\n[img]${image("repeated-image")}[/img]`, ids: ["repeated-image", "repeated-image", "repeated-image"] }],
      [14, { content: `${tall}\n[img]${image("later-page-tall")}[/img]`, ids: ["later-page-tall"] }],
      [15, { content: `![引用式图片][fixture]\n\n[fixture]: ${image("markdown-reference")} "测试图"`, contentType: 1, ids: ["markdown-reference"] }]
    ]);
    for (let floor = 4; floor <= 15; floor += 1) {
      const fixture = fixtures.get(floor) || { content: `无关楼层 ${floor}` };
      const response = await fetch(`${origin}/topic/6500000/post`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: fixture.content, contentType: fixture.contentType || 0 }) });
      assert(response.ok, `create fixture floor ${floor}: ${response.status}`);
    }
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /CC98 Reborn|rebuild failed/i.test(message.text())) errors.push(message.text());
    });
    const lateContent = process.argv.includes("--late-content");
    const imageBytes = await fs.readFile(path.join(root, "reference/Forum-main/dist/static/images/default_avatar_girl.png"));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith("/static/images/lazy-media-")) return route.fulfill({ status: 200, contentType: "image/png", body: imageBytes });
      if (lateContent && url.pathname === "/__test/content.js") {
        const response = await route.fetch();
        const source = await response.text();
        return route.fulfill({ response, body: `setTimeout(() => { window.__cc98LazyContentStarted = performance.now(); const script = document.createElement("script"); script.textContent = ${JSON.stringify(source)}; document.head.append(script); }, 3500);` });
      }
      return route.continue();
    });
    const dropSnapshots = process.argv.includes("--drop-snapshots");
    await page.addInitScript(({ dropSnapshots }) => {
      window.addEventListener("message", (event) => {
        if (event.data?.source === "cc98-reborn-submit-monitor" && event.data.type === "topic-content-snapshot") {
          if (!window.__cc98LazyContentStarted) window.__cc98SnapshotsBeforeContent = (window.__cc98SnapshotsBeforeContent || 0) + 1;
          if (dropSnapshots) {
            window.__cc98DroppedSnapshots = (window.__cc98DroppedSnapshots || 0) + 1;
            event.stopImmediatePropagation();
          }
        }
      }, true);
    }, { dropSnapshots });
    const failures = [];
    const diagnostic = [];
    for (const pageNumber of [1, 2]) {
      if (pageNumber === 1) {
        await page.goto(`${origin}/topic/6500000/1`);
      } else {
        await page.locator('#cc98-comfort-app .cc98-rebuild-page-next').first().click();
        await page.waitForURL(`${origin}/topic/6500000/2`);
      }
      await page.locator('#cc98-comfort-app [data-post-floor]').first().waitFor();
      await page.waitForTimeout(4500);
      if (lateContent) assert(await page.evaluate(() => window.__cc98SnapshotsBeforeContent > 0), "Initial response must precede content-script installation for replay coverage");
      const activeFixtures = [...fixtures].filter(([floor]) => Math.ceil(floor / 10) === pageNumber);
      for (const [floor, fixture] of activeFixtures) {
        const unresolved = await page.locator(`#cc98-comfort-app [data-post-floor="${floor}"] .cc98-rebuild-post-body .lazyload-placeholder`).count();
        if (unresolved) failures.push(`page ${pageNumber} floor ${floor}: ${unresolved} source-only lazy placeholders remain in rebuilt body`);
        for (const id of new Set(fixture.ids)) {
          const expected = fixture.ids.filter((value) => value === id).length;
          const actual = await page.locator(`#cc98-comfort-app [data-post-floor="${floor}"] .cc98-rebuild-post-body img[src*="/lazy-media-${id}.png"]`).count();
          if (actual !== expected) failures.push(`page ${pageNumber} floor ${floor}: ${id}: ${actual}/${expected} URLs available before any reader scroll`);
        }
        if (fixture.order) {
          const actualOrder = await page.locator(`#cc98-comfort-app [data-post-floor="${floor}"] .cc98-rebuild-post-body`).evaluate((node) => [...node.querySelectorAll('img, .cc98-rebuild-hidden-image-button')].map((entry) => {
            const hidden = entry.matches('button');
            const src = hidden ? entry.dataset.cc98DirectImageSrc : entry.src;
            const id = src?.match(/\/lazy-media-([^.]+)\.png/)?.[1] || "missing-url";
            return `${hidden ? 'hidden:' : ''}${id}`;
          }));
          if (JSON.stringify(actualOrder) !== JSON.stringify(fixture.order)) failures.push(`page ${pageNumber} floor ${floor}: mixed hidden/visible image order ${JSON.stringify(actualOrder)}`);
        }
      }
      for (const [floor, fixture] of activeFixtures) {
        const card = page.locator(`#cc98-comfort-app [data-post-floor="${floor}"]`);
        // Native lazy rendering may replace a card while Playwright waits for
        // layout stability. Scroll the current DOM node in the same task.
        await card.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(250);
        for (const id of new Set(fixture.ids)) {
          const images = card.locator(`.cc98-rebuild-post-body img[src*="/lazy-media-${id}.png"]`);
          const expected = fixture.ids.filter((value) => value === id).length;
          const actual = await images.count();
          if (actual !== expected) {
            failures.push(`page ${pageNumber} floor ${floor}: ${id}: ${actual}/${expected} images after scrolling rebuilt card into view`);
          }
          if (!actual) {
            continue;
          }
          const img = images.first();
          await img.evaluate((node) => node.scrollIntoView({ block: "center" }));
          try {
            await page.waitForFunction(({ floor, id }) => {
              const node = document.querySelector(`#cc98-comfort-app [data-post-floor="${floor}"] .cc98-rebuild-post-body img[src*="/lazy-media-${id}.png"]`);
              return node?.complete && node.naturalWidth > 0;
            }, { floor, id }, { timeout: 5000 });
            await img.evaluate((node) => node.decode());
          } catch (error) {
            failures.push(`page ${pageNumber} floor ${floor}: ${id} failed decode: ${error.message}`);
          }
        }
        if (fixture.hiddenId) {
          const imageLocator = card.locator(`.cc98-rebuild-post-body img[src*="/lazy-media-${fixture.hiddenId}.png"]`);
          if (await imageLocator.count()) failures.push(`page ${pageNumber} floor ${floor}: hidden image expanded before click`);
          const button = card.locator('.cc98-rebuild-hidden-image-button');
          if (!await button.count()) {
            failures.push(`page ${pageNumber} floor ${floor}: hidden image reveal control absent`);
          } else {
            await button.first().click();
            try { await imageLocator.waitFor({ state: "attached", timeout: 4200 }); }
            catch { failures.push(`page ${pageNumber} floor ${floor}: ${fixture.hiddenId} never appears after reveal`); }
          }
        }
        if (fixture.hiddenIds) {
          for (const id of fixture.hiddenIds) {
            const images = card.locator(`.cc98-rebuild-post-body img[src*="/lazy-media-${id}.png"]`);
            const before = await images.count();
            const buttons = card.locator('.cc98-rebuild-hidden-image-button');
            if (!await buttons.count()) {
              failures.push(`page ${pageNumber} floor ${floor}: mixed hidden image control absent`);
              break;
            }
            await buttons.first().click();
            await page.waitForTimeout(250);
            if (await images.count() !== before + 1) failures.push(`page ${pageNumber} floor ${floor}: mixed hidden ${id} did not reveal one additional image`);
          }
          await page.waitForTimeout(1300);
          await page.locator('#cc98-comfort-app .cc98-rebuild-refresh-button').first().click();
          await page.waitForTimeout(1300);
          const remaining = await card.locator('.cc98-rebuild-hidden-image-button').count();
          if (remaining) failures.push(`page ${pageNumber} floor ${floor}: ${remaining} revealed images collapsed again after explicit sync`);
          for (const id of new Set(fixture.hiddenIds)) {
            const expected = fixture.ids.filter((value) => value === id).length + fixture.hiddenIds.filter((value) => value === id).length;
            const actual = await card.locator(`.cc98-rebuild-post-body img[src*="/lazy-media-${id}.png"]`).count();
            if (actual !== expected) failures.push(`page ${pageNumber} floor ${floor}: ${id}: ${actual}/${expected} images after reveal and explicit sync`);
          }
        }
        if (await card.count()) {
          diagnostic.push(await card.evaluate((node) => ({ floor: node.dataset.postFloor, body: node.querySelector('.cc98-rebuild-post-body')?.innerHTML.slice(0, 500), images: [...node.querySelectorAll('.cc98-rebuild-post-body img')].map((img) => ({ src: img.src, loaded: img.complete && img.naturalWidth > 0 })), hiddenControls: [...node.querySelectorAll('.cc98-rebuild-post-body .hiddenImage, .cc98-rebuild-hidden-image-button')].map((el) => el.outerHTML) })));
        } else {
          const current = await page.evaluate(() => ({ url: location.href, title: document.title, content: document.querySelector('#cc98-comfort-app')?.textContent.slice(0, 600) }));
          failures.push(`page ${pageNumber} floor ${floor}: rebuilt card disappeared after media reveal`);
          diagnostic.push(current);
        }
      }
      diagnostic.push(await page.evaluate(() => ({ page: location.pathname, droppedSnapshots: window.__cc98DroppedSnapshots || 0, source: [...document.querySelectorAll('#root .reply')].map((node) => ({ floor: node.querySelector('.reply-floor')?.textContent, placeholders: node.querySelectorAll('.lazyload-placeholder').length, images: [...node.querySelectorAll('.substance img')].map((img) => img.src), hidden: node.querySelectorAll('.hiddenImage').length })) })));
    }
    const navigationTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    for (const pageNumber of [1, 2]) {
      // The native pager uses React Router, exercising the extension's SPA path
      // without reloading content.js or the network monitor between pages.
      const clicked = await page.evaluate((targetPath) => {
        const link = [...document.querySelectorAll('#root .pagination .page-link[href]')].find((node) => new URL(node.href).pathname === targetPath);
        if (!link) return false;
        link.click();
        return true;
      }, `/topic/6500000/${pageNumber}`);
      assert(clicked, `native pager link for SPA page ${pageNumber} exists`);
      await page.waitForURL((url) => url.pathname === `/topic/6500000/${pageNumber}`);
      await page.waitForTimeout(4500);
      assert.equal(await page.evaluate(() => performance.timeOrigin), navigationTimeOrigin, "Native pager must retain the document for SPA coverage");
      for (const [floor, fixture] of fixtures) {
        if (Math.ceil(floor / 10) !== pageNumber) continue;
        for (const id of new Set(fixture.ids)) {
          const expected = fixture.ids.filter((value) => value === id).length;
          const actual = await page.locator(`#cc98-comfort-app [data-post-floor="${floor}"] .cc98-rebuild-post-body img[src*="/lazy-media-${id}.png"]`).count();
          if (actual !== expected) failures.push(`SPA page ${pageNumber} floor ${floor}: ${id}: ${actual}/${expected} URLs before reader scroll`);
        }
      }
    }
    await fs.mkdir(path.join(root, "outputs/conversation-preview"), { recursive: true });
    const suffix = `${dropSnapshots ? "-missed-snapshot" : ""}${lateContent ? "-late-content" : ""}`;
    await fs.writeFile(path.join(root, `outputs/conversation-preview/post-lazy-media${suffix}-diagnostic.json`), JSON.stringify({ failures, errors, diagnostic }, null, 2));
    await page.screenshot({ path: path.join(root, `outputs/conversation-preview/post-lazy-media${suffix}.png`) });
    if (process.argv.includes("--native-control")) {
      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.get("cc98ComfortSettings", (result) => chrome.storage.local.set({ cc98ComfortSettings: { ...result.cc98ComfortSettings, enabled: false } }, resolve))));
      await page.goto(`${origin}/topic/6500000/1`);
      await page.locator('#root .reply-floor').first().waitFor();
      await page.evaluate(() => {
        const reply = [...document.querySelectorAll('#root .reply')].find((node) => node.querySelector('.reply-floor')?.textContent.trim() === "9");
        (reply.querySelector('.lazyload-placeholder') || reply.querySelector('.substance img')).scrollIntoView({ block: "center" });
        window.dispatchEvent(new Event('scroll'));
      });
      const nativeUpload = page.locator('#root img[src*="/lazy-media-upload-image.png"]');
      await nativeUpload.waitFor();
      await nativeUpload.evaluate((img) => img.decode());
      console.log("native control: previously absent upload image loads after disabling Reborn");
    }
    console.log(JSON.stringify({ failures, errors, dropSnapshots, lateContent }, null, 2));
    assert.deepEqual(errors, [], "No browser exceptions");
    assert.deepEqual(failures, [], "All ordinary images must appear without switching off Reborn");
    console.log("post lazy media: real native UBB image-only/multiple/tall/Markdown/later-page images passed");
  } finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise((resolve) => server.exitCode !== null ? resolve() : server.once("exit", resolve));
    // This directory is a fresh mkdtemp result owned by this test.
    if (runtime.startsWith(path.join(os.tmpdir(), "cc98-post-lazy-media-"))) await fs.rm(runtime, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
