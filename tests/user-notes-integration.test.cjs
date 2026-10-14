const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(__dirname, "..");
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), "cc98-user-notes-integration-"));
  const origin = "http://127.0.0.1:44345";
  const server = spawn(process.execPath, [path.join(root, "tests/local-forum/server.js")], {
    cwd: root,
    env: { ...process.env, CC98_LOCAL_PORT: "44345", CC98_LOCAL_REQUIRE_AUTH: "0", CC98_LOCAL_NATIVE_FRONTEND: "0",
      CC98_LOCAL_DATA_PATH: path.join(runtime, "forum-data.json"), CC98_LOCAL_UPLOAD_ROOT: path.join(runtime, "uploads"),
      CC98_LOCAL_BACKUP_ROOT: path.join(runtime, "backups") },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  let browser;
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try { if ((await fetch(`${origin}/__test/health`)).ok) break; } catch {}
      if (attempt === 79) throw new Error(logs);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const followingBefore = await (await fetch(`${origin}/me/followee?from=0&size=100`)).json();
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    page.setDefaultTimeout(15000);
    const errors = [];
    const unexpectedWrites = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!["GET", "HEAD"].includes(request.method()) && url.pathname !== "/__local/extension-storage") {
        unexpectedWrites.push(`${request.method()} ${url.pathname}`);
      }
      return route.continue();
    });
    await page.goto(`${origin}/usercenter/myfollowings`);
    const entry = page.locator('.cc98-local-person-row [data-user-note="edit"][data-user-note-uid="100002"]');
    await entry.waitFor();
    await entry.click();
    const input = page.locator('[data-user-note="input"]');
    await input.waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-user-note="input"]').disabled);
    assert.match(await page.locator(".cc98-user-note-identity").innerText(), /SyntaxTester.*100002/);
    await input.fill("一起测试编辑器的同学");
    await page.locator('[data-user-note="save"]').click();
    await page.locator('[data-user-note="dialog"]').waitFor({ state: "detached" });
    await page.waitForFunction(() => document.querySelector('.cc98-local-person-row [data-user-note="label"]')?.textContent === "一起测试编辑器的同学");
    await page.waitForFunction(async () => {
      const response = await fetch("/__local/extension-storage");
      const state = await response.json();
      return state.values?.["cc98RebornUserNote:uid:795406:user:100002"] === "一起测试编辑器的同学";
    });
    await page.goto(`${origin}/topic/6500000`);
    const author = page.locator('.cc98-rebuild-post-user').filter({ hasText: /^SyntaxTester$/ }).first();
    await author.waitFor();
    const authorLine = author.locator("..");
    await authorLine.locator('[data-user-note="label"]').waitFor();
    assert.equal(await author.innerText(), "SyntaxTester");
    assert.equal(await authorLine.locator('[data-user-note="label"]').innerText(), "一起测试编辑器的同学");
    await fs.mkdir(path.join(root, "outputs/user-notes-preview"), { recursive: true });
    await author.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, "outputs/user-notes-preview/user-notes-post-native.png") });

    await page.goto(`${origin}/user/name/SyntaxTester`);
    const profileEntry = page.locator('.user-profile [data-user-note="edit"][data-user-note-uid="100002"]');
    await profileEntry.waitFor();
    await profileEntry.click();
    await page.waitForFunction(() => !document.querySelector('[data-user-note="input"]').disabled);
    assert.equal(await input.inputValue(), "一起测试编辑器的同学");
    await input.fill("共同项目的伙伴");
    await page.locator('[data-user-note="save"]').click();
    await page.locator('[data-user-note="dialog"]').waitFor({ state: "detached" });
    await page.waitForFunction(() => document.querySelector('.user-profile [data-user-note="label"]')?.textContent === "共同项目的伙伴");
    await page.screenshot({ path: path.join(root, "outputs/user-notes-preview/user-notes-profile-native.png") });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.user-profile [data-user-note="label"]')?.textContent === "共同项目的伙伴");
    await profileEntry.click();
    await page.waitForFunction(() => !document.querySelector('[data-user-note="clear"]').disabled);
    await page.locator('[data-user-note="clear"]').click();
    await page.locator('[data-user-note="dialog"]').waitFor({ state: "detached" });
    await page.goto(`${origin}/topic/6500000`);
    await author.waitFor();
    assert.equal(await authorLine.locator('[data-user-note="label"]').count(), 0);
    const followingAfter = await (await fetch(`${origin}/me/followee?from=0&size=100`)).json();
    assert.deepEqual(followingAfter, followingBefore);
    assert.deepEqual(unexpectedWrites, [], "Notes may only use extension storage in the local simulator");
    assert.deepEqual(errors, []);
    console.log("user-notes integration: following editor, real Forum post/profile hooks, name route UID, local persistence and clear passed");
  } finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise((resolve) => server.exitCode !== null ? resolve() : server.once("exit", resolve));
    if (runtime.startsWith(path.join(os.tmpdir(), "cc98-user-notes-integration-"))) await fs.rm(runtime, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
