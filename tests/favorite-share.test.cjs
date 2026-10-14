const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const core = require("../src/favorite-share-core.js");

const root = path.resolve(__dirname, "..");
const sourceTopics = Array.from({ length: 105 }, (_, index) => ({
  id: 6700000 + index,
  title: index === 0 ? '<img src=x onerror="window.favoriteShareXss=true"> 标题 / 中文 😀' : `分享测试 ${index + 1}`,
  boardId: 182,
  boardName: "本地测试",
  time: "2026-10-12T10:00:00+08:00",
  lastPostTime: "2026-10-12T10:00:00+08:00",
  replyCount: 3,
  authorName: "不应进入分享的作者",
  accessToken: "fixture-only-secret-must-not-export",
  groupId: 9
}));
const groups = [
  { id: 0, name: "默认分组", count: 2 },
  { id: 9, name: "阅读清单 / 中文 😀", count: sourceTopics.length },
  { id: 23, name: "导入目标", count: 0 }
];
const selector = (name) => `[data-favorite-share="${name}"]`;
async function waitUntil(predicate, message) {
  for (let index = 0; index < 120; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function main() {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), "cc98-favorite-share-"));
  const port = 44341;
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
    for (let index = 0; index < 80; index += 1) {
      try { if ((await fetch(`${origin}/__test/health`)).ok) break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (index === 79) throw new Error(logs);
    }
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    page.setDefaultTimeout(12000);
    const errors = [];
    const favoriteRequests = [];
    const writes = [];
    const imported = new Set(["6800001"]);
    const failureOnce = new Map();
    let availableGroups = groups;
    let delayedId = "";
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: async (text) => { window.__favoriteCopiedText = text; }
      } });
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      // Every write is intercepted below; no request may leave the local fixture.
      if (url.origin !== origin) return route.abort();
      const respond = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) }).catch(() => {});
      if (url.pathname.toLowerCase() === "/me/favorite-topic-group") {
        assert.equal(request.method(), "GET");
        return respond({ errorCode: 0, data: availableGroups });
      }
      if (url.pathname.toLowerCase() === "/topic/me/favorite") {
        const from = Number(url.searchParams.get("from") || 0);
        const size = Number(url.searchParams.get("size") || 11);
        const group = Number(url.searchParams.get("groupid") || 0);
        favoriteRequests.push({ from, size, group, order: url.searchParams.get("order") });
        const items = group === 9 ? sourceTopics : sourceTopics.slice(0, 2);
        return respond(items.slice(from, from + size));
      }
      const isFavorite = url.pathname.match(/^\/topic\/(\d+)\/isfavorite$/i);
      if (isFavorite) {
        assert.equal(request.method(), "GET");
        return respond(imported.has(isFavorite[1]));
      }
      const favorite = url.pathname.match(/^\/me\/favorite\/(\d+)$/i);
      if (favorite) {
        assert.equal(request.method(), "PUT", "import must only add favorites");
        const id = favorite[1];
        writes.push({ id, group: url.searchParams.get("groupid") });
        if (id === delayedId) await new Promise((resolve) => setTimeout(resolve, 650));
        const failure = failureOnce.get(id);
        if (failure) {
          failureOnce.delete(id);
          return respond({ errorCode: failure, message: `fixture ${failure}` }, failure);
        }
        imported.add(id);
        return respond({ errorCode: 0 });
      }
      return route.continue();
    });
    await page.goto(`${origin}/usercenter/myfavorites/order/2/group/9/1`);
    await page.locator("[data-favorite-share-open]").waitFor().catch(async (error) => {
      console.error({ errors, page: await page.evaluate(() => ({ href: location.href, text: document.body.innerText.slice(0, 1800), module: Boolean(globalThis.CC98RebornFavoriteShare) })) });
      throw error;
    });
    assert.deepEqual(await page.evaluate(() => {
      const router = document.createElement("div");
      const operator = document.createElement("div");
      operator.className = "user-post-operator";
      router.append(operator);
      CC98RebornFavoriteShare.mount(router);
      CC98RebornFavoriteShare.mount(router);
      return { count: router.querySelectorAll("[data-favorite-share-open]").length, nativeOperator: Boolean(operator.querySelector("[data-favorite-share-open]")) };
    }), { count: 1, nativeOperator: true }, "native favorite operator receives exactly one entry");
    await page.locator("[data-favorite-share-open]").click();
    await page.locator(`${selector("export-group")} option[value="9"]`).waitFor({ state: "attached" });
    const dialog = page.getByRole("dialog");
    const foreground = await page.evaluate(() => ({ href: location.href, scroll: scrollY }));
    await page.locator(selector("export-group")).selectOption("9");
    await page.locator(selector("export")).click();
    await page.waitForFunction((name) => document.querySelector(name)?.value.startsWith("CC98F1."), selector("output"));
    const exported = await page.locator(selector("output")).inputValue();
    const decoded = core.decode(exported);
    assert.equal(decoded.name, groups[1].name);
    assert.equal(decoded.topics.length, 105, "all 11 pages must be included");
    assert.deepEqual(decoded.topics.map((topic) => topic.id), sourceTopics.map((topic) => String(topic.id)));
    assert.equal(decoded.topics[0].title, sourceTopics[0].title);
    assert.deepEqual(Object.keys(decoded.topics[0]).sort(), ["id", "title"]);
    assert(!JSON.stringify(decoded).includes("fixture-only-secret"));
    assert(!JSON.stringify(decoded).includes("cc98-local-test"));
    assert.deepEqual(favoriteRequests.filter((request) => request.group === 9 && request.size === 11).map((request) => request.from), Array.from({ length: 11 }, (_, index) => index * 10));
    assert.equal(writes.length, 0, "export must never write favorites");
    await page.locator(selector("copy")).click();
    assert.equal(await page.evaluate(() => window.__favoriteCopiedText), exported);
    await page.locator(selector("export-group")).selectOption("0");

    const openImport = async (topics, name = "好友分享") => {
      await page.locator(selector("tab-import")).click();
      await page.locator(selector("input")).fill(core.encode({ name, topics }));
      await page.locator(selector("decode")).click();
      await page.locator(`${selector("target-group")} option[value="23"]`).waitFor({ state: "attached" });
      await page.locator(selector("target-group")).selectOption("23");
    };
    const waitIdle = () => page.waitForFunction((name) => {
      const button = document.querySelector(name);
      return button && !button.disabled;
    }, selector("decode"));

    // Decode is a preview-only operation, including title strings that look like HTML.
    failureOnce.set("6800003", 400);
    await openImport([
      { id: 6800001, title: "已经收藏" },
      { id: 6800002, title: sourceTopics[0].title },
      { id: 6800003, title: "首次失败，手动重试" }
    ]);
    assert.equal(writes.length, 0, "decoding a string must not import it");
    assert.equal(await page.evaluate(() => window.favoriteShareXss), undefined);
    assert.equal(await page.locator(`${selector("preview")} img`).count(), 0);
    assert((await page.locator(selector("preview")).innerText()).includes(sourceTopics[0].title));
    await page.locator(selector("import")).click();
    await waitIdle();
    assert.deepEqual(writes, [{ id: "6800002", group: "23" }, { id: "6800003", group: "23" }]);
    assert(await page.locator(selector("retry")).isVisible());
    await page.locator(selector("reload-groups")).click();
    await waitIdle();
    assert.equal(await page.locator(selector("target-group")).inputValue(), "23", "refresh must retain the chosen import group");
    assert.equal(await page.locator(selector("export-group")).inputValue(), "0", "refresh must retain the independently chosen export group");
    assert(await page.locator(selector("retry")).isVisible(), "refresh must retain failed topics for the same selected group");
    await page.locator(selector("retry")).click();
    await waitIdle();
    assert.deepEqual(writes.slice(2), [{ id: "6800003", group: "23" }], "retry must only revisit failed topics");
    assert(imported.has("6800002") && imported.has("6800003"));
    assert(await page.locator(selector("view")).isVisible());
    await page.locator(selector("target-group")).selectOption("0");
    assert(await page.locator(selector("view")).isHidden(), "changing the target must clear the old completed-group link");

    const beforeInvalid = writes.length;
    await page.locator(selector("input")).fill("CC98F1.not-a-valid-share.00000000");
    await page.locator(selector("decode")).click();
    assert(await page.locator(selector("import")).isDisabled());
    assert.equal(writes.length, beforeInvalid, "invalid input must clear the prior import plan");

    // Authentication and rate limit errors stop the batch before the next topic.
    for (const [status, first, next] of [[401, 6810001, 6810002], [429, 6811001, 6811002]]) {
      await openImport([{ id: first, title: `状态 ${status}` }, { id: next, title: "暂停后不应写入" }]);
      failureOnce.set(String(first), status);
      const count = writes.length;
      await page.locator(selector("import")).click();
      await waitIdle();
      assert.deepEqual(writes.slice(count), [{ id: String(first), group: "23" }], `${status} must pause the batch`);
      assert(!imported.has(String(next)));
      assert.match(await page.locator(selector("status")).innerText(), /暂停|失效|频繁/, "paused imports must not be labelled completed");
    }

    // The active request may complete after cancellation; subsequent topics may not start.
    await openImport([{ id: 6820001, title: "暂停请求" }, { id: 6820002, title: "暂停后不再发送" }]);
    delayedId = "6820001";
    await page.locator(selector("import")).click();
    await waitUntil(() => writes.some((write) => write.id === delayedId), "first request must start before cancellation");
    await page.locator(selector("stop")).click();
    await waitIdle();
    await page.waitForTimeout(800);
    assert(!writes.some((write) => write.id === "6820002"));
    assert(await page.locator(selector("retry")).isVisible());
    await page.locator(selector("reload-groups")).click();
    await waitIdle();
    assert.equal(await page.locator(selector("target-group")).inputValue(), "23");
    const afterStop = writes.length;
    await page.locator(selector("retry")).click();
    await waitIdle();
    assert.deepEqual(writes.slice(afterStop), [{ id: "6820002", group: "23" }], "resume rechecks an uncertain completed write and keeps the selected group");

    // A group deleted while the dialog is open must not silently fall back to group zero.
    failureOnce.set("6820502", 400);
    await openImport([{ id: 6820501, title: "删除分组前成功" }, { id: 6820502, title: "删除分组前失败" }]);
    await page.locator(selector("import")).click();
    await waitIdle();
    assert(await page.locator(selector("retry")).isVisible());
    assert(await page.locator(selector("view")).isVisible());
    availableGroups = groups.filter((group) => group.id !== 23);
    const beforeGroupDeleted = writes.length;
    await page.locator(selector("reload-groups")).click();
    await waitIdle();
    assert.equal(await page.locator(selector("target-group")).inputValue(), "");
    assert(await page.locator(selector("import")).isDisabled());
    assert(await page.locator(selector("retry")).isHidden());
    assert(await page.locator(selector("retry")).isDisabled());
    assert(await page.locator(selector("view")).isHidden());
    assert.equal((await page.locator(selector("result")).innerText()).trim(), "");
    assert.equal(writes.length, beforeGroupDeleted);
    availableGroups = groups;
    await page.locator(selector("reload-groups")).click();
    await waitIdle();
    assert.equal(await page.locator(selector("target-group")).inputValue(), "", "restoring the group still requires an explicit new choice");

    await openImport([{ id: 6821001, title: "关闭请求" }, { id: 6821002, title: "关闭后不再发送" }]);
    delayedId = "6821001";
    await page.locator(selector("import")).click();
    await waitUntil(() => writes.some((write) => write.id === delayedId), "first request must start before closing");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.waitForTimeout(800);
    assert(!writes.some((write) => write.id === "6821002"));
    assert.deepEqual(await page.evaluate(() => ({ href: location.href, scroll: scrollY })), foreground);

    await page.locator("[data-favorite-share-open]").click();
    await page.locator(`${selector("export-group")} option[value="9"]`).waitFor({ state: "attached" });
    await openImport([{ id: 6830001, title: "中文和 emoji 😀 的预览标题" }]);
    const assertActiveTabStyle = async () => {
      const colors = await page.evaluate(() => {
        const active = document.querySelector('[data-favorite-share="tab-import"]');
        const inactive = document.querySelector('[data-favorite-share="tab-export"]');
        return { active: getComputedStyle(active).backgroundColor, inactive: getComputedStyle(inactive).backgroundColor, pressed: active.getAttribute("aria-pressed") };
      });
      assert.equal(colors.pressed, "true");
      assert.notEqual(colors.active, colors.inactive, "active tab needs a visually distinct background");
    };
    await assertActiveTabStyle();
    const output = path.join(root, "outputs/favorite-share-preview");
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "favorite-share-light.png") });
    await page.evaluate(() => {
      document.documentElement.dataset.cc98ComfortTheme = "night";
      document.documentElement.dataset.cc98ComfortTone = "dark";
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await assertActiveTabStyle();
    // The native stylesheet animates link colors; let its theme transition
    // settle before checking contrast or capturing the final dark screenshot.
    await page.waitForFunction(() => {
      const link = document.querySelector('[data-favorite-share="preview"] a');
      const panel = document.querySelector('.cc98-favorite-share-dialog');
      return link && panel && getComputedStyle(link).color === getComputedStyle(panel).color;
    });
    await page.screenshot({ path: path.join(output, "favorite-share-mobile-dark.png") });
    const bounds = await dialog.evaluate((node) => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, width: innerWidth, overflow: node.scrollWidth > node.clientWidth + 2 }));
    assert(bounds.left >= 0 && bounds.right <= bounds.width && !bounds.overflow, JSON.stringify(bounds));
    await page.locator(selector("close")).click();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.deepEqual(errors, []);
    console.log("favorite share browser: 11-page export, Unicode, clipboard, preview-only decode, target group, existing skip, failed retry, group refresh/deletion, invalid input, 401/429 pause, cancellation/resume, XSS, active tab contrast and mobile layout passed");
  } finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise((resolve) => server.exitCode !== null ? resolve() : server.once("exit", resolve));
    if (runtime.startsWith(path.join(os.tmpdir(), "cc98-favorite-share-"))) await fs.rm(runtime, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
