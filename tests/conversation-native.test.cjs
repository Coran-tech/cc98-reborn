const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const localForum = require('./local-forum-path.cjs');

async function main() {
  const root = path.resolve(__dirname, "..");
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), "cc98-conversation-native-"));
  const port = 44338;
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [localForum.serverPath], {
    cwd: root, env: { ...process.env, ...localForum.environment, CC98_LOCAL_PORT: String(port), CC98_LOCAL_REQUIRE_AUTH: "0", CC98_LOCAL_NATIVE_FRONTEND: "0",
      CC98_LOCAL_DATA_PATH: path.join(runtime, "forum-data.json"), CC98_LOCAL_UPLOAD_ROOT: path.join(runtime, "uploads"), CC98_LOCAL_BACKUP_ROOT: path.join(runtime, "backups") }, stdio: ["ignore", "pipe", "pipe"]
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
    const quoted = (floor, content) => `[quote][b]以下是引用${floor}楼：用户测试在2026-10-12 12:00:00的发言：[url=/topic/6500000/${Math.ceil(floor / 10)}#${floor % 10 || 10}]>>查看原帖<<[/url][/b]${content}[/quote]`;
    for (let floor = 4; floor <= 15; floor += 1) {
      const content = floor === 4 ? quoted(1, "最早原文") + "第四楼回复 [ac01][img]/static/images/default_avatar_girl.png[/img]"
        : floor === 12 ? quoted(4, quoted(1, "最早原文") + "第四楼回复") + "第十二楼回复"
        : floor === 14 ? quoted(12, "第十二楼回复") + "第十四楼下游"
        : floor === 15 ? quoted(14, "第十四楼下游") + "第十五楼下游" : `无关楼层 ${floor}`;
      const response = await fetch(`${origin}/topic/6500000/post`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, contentType: 0 }) });
      assert(response.ok, `create fixture floor ${floor}: ${response.status}`);
    }
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("[CC98 Reborn]")) {
        errors.push(message.text());
        console.error(message.text());
      }
    });
    await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/topic/6500000/2`);
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').waitFor();
    await page.waitForTimeout(1600);
    await page.locator('[data-post-floor="12"] .cc98-rebuild-conversation-action').click();
    const foreground = await page.evaluate(() => ({ url: location.href, scroll: scrollY, posts: [...document.querySelectorAll('#cc98-comfort-app [data-post-floor]')].map((node) => node.dataset.postFloor) }));
    await page.waitForFunction(() => document.querySelector(".cc98-rebuild-conversation-status")?.textContent.startsWith("查找完成"), null, { timeout: 40000 });
    assert.deepEqual(new Set(await page.locator(".cc98-rebuild-conversation-post").evaluateAll((nodes) => nodes.map((node) => node.dataset.conversationKey))), new Set(["6500000:1", "6500000:4", "6500000:12", "6500000:14", "6500000:15"]));
    const parent = await page.locator('[data-conversation-key="6500000:12"] .cc98-rebuild-conversation-links').innerText();
    assert.equal(parent.trim(), "引用 #4", "real native flattened quotes must yield only their direct parent");
    assert.equal(await page.locator(".cc98-rebuild-conversation-probe").count(), 0);
    const backgroundBody = page.locator('[data-conversation-key="6500000:4"] .cc98-rebuild-conversation-body');
    await backgroundBody.locator('img.cc98-rebuild-inline-emoji').evaluate((img) => { img.loading = "eager"; return img.decode(); });
    await backgroundBody.locator('img.cc98-rebuild-content-image').evaluate((img) => { img.loading = "eager"; return img.decode(); });
    const rendering = await backgroundBody.locator('img.cc98-rebuild-inline-emoji').evaluate((img) => ({ width: img.naturalWidth, height: img.getBoundingClientRect().height }));
    assert(rendering.width > 0 && rendering.height > 10 && rendering.height < 64);
    await page.screenshot({ path: path.join(root, "outputs/conversation-preview/conversation-native.png") });
    await page.keyboard.press("Escape");
    const after = await page.evaluate(() => ({ url: location.href, scroll: scrollY, posts: [...document.querySelectorAll('#cc98-comfort-app [data-post-floor]')].map((node) => node.dataset.postFloor) }));
    assert.deepEqual(after, foreground);
    await page.locator('.cc98-topic-search-entry').first().click();
    const searchForeground = await page.evaluate(() => ({ url: location.href, scroll: scrollY, posts: [...document.querySelectorAll('#cc98-comfort-app [data-post-floor]')].map(node => node.dataset.postFloor) }));
    await page.getByLabel('关键词', { exact: true }).fill('第十四楼下游');
    await page.getByLabel('包含引用内容', { exact: true }).uncheck();
    await page.getByRole('button', { name: '开始搜索', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cc98-topic-search-status')?.textContent.startsWith('搜索完成'));
    assert.deepEqual(await page.locator('[data-search-floor]').evaluateAll(nodes => nodes.map(node => Number(node.dataset.searchFloor))), [14], 'native full-text search shares hydrated conversation pages and can exclude flattened quotes');
    const authorName = (await page.locator('[data-search-floor="14"] .cc98-topic-search-result-link').innerText()).replace(/^#\d+\s*·\s*/, '');
    await page.getByLabel('关键词', { exact: true }).fill('[ac01]');
    await page.getByRole('button', { name: '重新搜索', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    assert.deepEqual(await page.locator('[data-search-floor]').evaluateAll(nodes => nodes.map(node => Number(node.dataset.searchFloor))), [1, 4], 'the seed post and fourth floor both contain a real rendered [ac01] emotion');
    assert.equal(await page.locator('.cc98-topic-search-snippet mark').first().innerText(), '[ac01]');
    await page.getByLabel('关键词', { exact: true }).fill(authorName);
    await page.getByRole('button', { name: '重新搜索', exact: true }).click();
    await page.getByRole('button', { name: '确认开始', exact: true }).click();
    assert(await page.locator('[data-search-floor="14"]').count(), 'native author names must match even when absent from the post body');
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => ({ url: location.href, scroll: scrollY, posts: [...document.querySelectorAll('#cc98-comfort-app [data-post-floor]')].map(node => node.dataset.postFloor) })), searchForeground);
    assert.deepEqual(errors, []);
    console.log("conversation native forum: real UBB flattening, ancestry/descendants, source isolation, shared full-text username/emotion search and foreground preservation passed");
  } finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise((resolve) => server.exitCode !== null ? resolve() : server.once("exit", resolve));
    // This directory is a fresh mkdtemp result owned by this test.
    if (runtime.startsWith(path.join(os.tmpdir(), "cc98-conversation-native-"))) await fs.rm(runtime, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
