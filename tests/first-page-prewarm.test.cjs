const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const key = "cc98ComfortSettings";
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const reply = (floor, { hot = false, anonymous = false } = {}) => `
  <div class="reply" id="${hot ? "hot_" : "reply"}${floor}" data-floor="${floor}">
    ${anonymous ? '<div class="userMessage"><span>匿名 ABCD1234</span></div>' : '<a href="/user/id/1001">原用户名</a>'}
    <span class="reply-floor">${floor}</span>
    <div class="reply-content"><div class="substance"><article>
      ${hot ? '<p>应在原位置高亮的热门回复内容。</p>' : Array.from({ length: 14 }, (_, i) => `<p>当前页正文第 ${i + 1} 段，后台预热不应打断阅读和输入。</p>`).join("")}
    </article></div></div>
  </div>`;

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let checks = 0;
  try {
    for (const mode of ["static", "spa", "failure", "disable", "leave", "off", "native"]) {
      const anonymous = mode === "spa";
      let settings = { enabled: true, rebuildUi: mode !== "native", themeMode: "light",
        previsitFirstPageForTopicImages: mode !== "off", prewarmPostImages: false, replyRebornTail: false };
      const context = await browser.newContext({ viewport: { width: 1180, height: 900 } });
      const page = await context.newPage();
      const errors = [], firstRequests = [], foregroundNavigations = [];
      const started = deferred(), release = deferred();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) foregroundNavigations.push(frame.url()); });
      await context.exposeBinding("__prewarmReadSettings", () => ({ [key]: settings }));
      await context.addInitScript(() => {
        window.__prewarmListeners = [];
        window.chrome = {
          runtime: { getManifest: () => ({ version: "0.3.7" }), getURL: (file) => new URL(`/${file}`, location.origin).href,
            onMessage: { addListener() {} }, sendMessage(_message, callback) { callback?.({ ok: false }); return Promise.resolve({ ok: false }); } },
          storage: { local: {
            get(_keys, callback) { const result = __prewarmReadSettings(); if (callback) result.then(callback); else return result; },
            set(_values, callback) { callback?.(); return Promise.resolve(); }
          }, onChanged: { addListener(listener) { __prewarmListeners.push(listener); } } }
        };
        // Old extension versions may leave this redirect record behind.
        sessionStorage.setItem("cc98RebornFirstPagePrevisitPending", JSON.stringify({
          topicId: "6500000", targetHref: location.href, targetRouteKey: location.href, startedAt: Date.now()
        }));
        window.__prewarmMasks = [];
        const observe = () => new MutationObserver((records) => {
          for (const record of records) {
            if (record.type === "attributes" && record.target === document.documentElement
              && /loading|prewarming|transition-veil/.test(record.attributeName)
              && record.target.getAttribute(record.attributeName) === "true") __prewarmMasks.push(record.attributeName);
            for (const node of record.addedNodes) if (node.nodeType === 1
              && (node.id === "cc98-comfort-loading" || node.querySelector("#cc98-comfort-loading"))) __prewarmMasks.push("loading overlay");
          }
        }).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        if (document.documentElement) observe(); else document.addEventListener("DOMContentLoaded", observe, { once: true });
      });
      await context.route("**/*", async (route) => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (/^\/topic\/6500000(?:\/1)?$/.test(url.pathname)) {
          firstRequests.push({ navigation: request.isNavigationRequest(), frame: request.frame() });
          started.resolve();
          await release.promise;
          if (mode === "failure") return route.fulfill({ status: 503, body: "unavailable" }).catch(() => {});
          const posts = reply(1, { anonymous }) + reply(12, { hot: true });
          const body = mode === "spa" && !request.isNavigationRequest() ? "<div id='root'></div>"
            : mode === "spa" ? `<div id="root"></div><script>setTimeout(() => { document.getElementById('root').innerHTML = ${JSON.stringify(posts)}; }, 220);</script>`
              : `<div id="root">${posts}</div>`;
          return route.fulfill({ contentType: "text/html", body }).catch(() => {});
        }
        if (/^\/topic\/\d+\/\d+$/.test(url.pathname)) {
          const current = Number(url.pathname.split("/").pop());
          const floor = (current - 1) * 10 + 1;
          return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8">
            <link rel="stylesheet" href="/src/theme-tokens.css"><link rel="stylesheet" href="/src/styles.css"></head><body>
            <div id="root"><div class="topBar"><a href="/">CC98</a></div>
              <section class="topicInfo-info"><h1 id="essay1">后台预热回归</h1><div class="topicInfo-boardMessage"><a href="/board/81">测试版面</a></div></section>
              ${reply(floor, { anonymous })}${reply(floor + 1, { hot: true }).replace(`id="hot_${floor + 1}"`, `id="reply${floor + 1}"`)}
              <div class="pagination"><div class="page-nav">${[1, 2, 3].map((number) => `<a href="/topic/6500000/${number}">${number}</a>`).join("")}</div></div>
              <div class="sendTopicInfo" id="sendTopicInfo"><div class="ubb-editor"><textarea id="prewarm-draft">已有草稿</textarea></div></div>
            </div><script src="/src/theme-core.js"></script><script src="/src/content.js"></script></body></html>` });
        }
        const file = path.resolve(root, `.${url.pathname}`);
        if (!file.startsWith(`${root}${path.sep}`)) return route.abort();
        try { return await route.fulfill({ path: file }); }
        catch { return route.fulfill({ status: 404, body: "not found" }); }
      });
      const currentUrl = `${origin}/topic/6500000/2#11`;
      try {
        await page.goto(currentUrl, { waitUntil: "domcontentloaded" });
        const current = mode === "native" ? page.locator('#root .reply[data-floor="11"]')
          : page.locator('#cc98-comfort-app [data-post-floor="11"]');
        await current.waitFor({ state: "visible", timeout: 3000 });
        if (mode === "off") {
          await page.waitForTimeout(650);
          assert.equal(firstRequests.length, 0, "Disabled option must not request page one through either reader");
        } else {
          await Promise.race([started.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("No background read")), 3000))]);
          assert.equal(page.url(), currentUrl, `${mode}: page one must not replace the foreground`);
          assert.equal(firstRequests[0].navigation, false, "Static background read must not navigate a browsing context");
          assert.equal(await page.locator('.cc98-rebuild-op-badge').count(), 0, "Identity is still unknown while page one is pending");
        }
        // Exercise an actual reader interaction before placing the precise
        // test viewport; this supersedes pending initial URL-fragment retries.
        await page.mouse.click(5, 500);
        await page.evaluate(() => {
          window.__originalCurrentBody = document.querySelector('#cc98-comfort-app [data-post-floor="11"] .cc98-rebuild-post-body') || document.querySelector('#root .reply .substance');
          window.__originalDraft = document.getElementById("prewarm-draft");
          __originalDraft.value = "读取过程中仍可编辑的草稿";
          const text = __originalCurrentBody.querySelector('p').firstChild;
          const range = document.createRange(); range.setStart(text, 1); range.setEnd(text, 8);
          getSelection().removeAllRanges(); getSelection().addRange(range);
          window.scrollTo(0, 160);
        });
        const before = await page.evaluate(() => ({ scroll: scrollY, selection: getSelection().toString(), history: history.length }));
        if (mode === "disable") {
          const previous = settings; settings = { ...settings, previsitFirstPageForTopicImages: false };
          await page.evaluate(({ key, previous, next }) => __prewarmListeners.forEach((listener) => listener({ [key]: { oldValue: previous, newValue: next } }, "local")), { key, previous, next: settings });
        } else if (mode === "leave") {
          await page.evaluate(() => { history.pushState({}, "", "/topic/6500001/2"); });
        }
        release.resolve();
        if (["static", "spa"].includes(mode)) {
          await page.locator('#cc98-comfort-app [data-post-floor="11"] .cc98-rebuild-op-badge').waitFor({ timeout: 5000 });
          assert(await page.locator('#cc98-comfort-app [data-post-floor="12"]').evaluate((node) => node.classList.contains("cc98-rebuild-hot-highlight")), "Hot reply fingerprints must also update in place");
        } else if (mode === "failure") {
          await page.waitForTimeout(7200);
        } else {
          await page.waitForTimeout(650);
        }
        if (!["disable", "leave"].includes(mode)) {
          const after = await page.evaluate(() => ({ scroll: scrollY, selection: getSelection().toString(), history: history.length,
            bodyRetained: __originalCurrentBody.isConnected, draftRetained: document.getElementById("prewarm-draft") === __originalDraft, draft: __originalDraft.value }));
          assert.deepEqual({ scroll: after.scroll, selection: after.selection, history: after.history }, before, `${mode}: reading position, selection and history must be unchanged`);
          assert(after.bodyRetained && after.draftRetained, `${mode}: foreground DOM nodes must stay mounted`);
          assert.equal(after.draft, "读取过程中仍可编辑的草稿");
          assert.equal(page.url(), currentUrl);
          assert.equal(foregroundNavigations.length, 1, `${mode}: only the original foreground navigation is allowed`);
        }
        assert.deepEqual(await page.evaluate(() => __prewarmMasks), [], `${mode}: no prewarm masks`);
        const probes = mode === "leave" ? 'iframe[data-cc98-reborn-op-prefetch][src*="/topic/6500000"]' : 'iframe[data-cc98-reborn-op-prefetch]';
        assert.equal(await page.locator(probes).count(), 0, `${mode}: completed or cancelled frames must be removed`);
        if (mode === "native") assert.equal(await page.evaluate(() => localStorage.getItem("cc98RebornOriginalPosterIdentity:v2:6500000")), "uid:1001", "The native UI also warms in the background");
        if (["disable", "leave", "off"].includes(mode)) {
          assert.equal(await page.evaluate(() => localStorage.getItem("cc98RebornOriginalPosterIdentity:v2:6500000")), null, "Cancelled or disabled reads must not populate the old topic cache");
        }
        if (["static", "spa", "failure"].includes(mode)) {
          const requests = firstRequests.length;
          await page.goto(`${origin}/topic/6500000/3`, { waitUntil: "domcontentloaded" });
          await page.locator('#cc98-comfort-app [data-post-floor="21"]').waitFor();
          await page.waitForTimeout(700);
          assert.equal(firstRequests.length, requests, `${mode}: other pages of the same topic reuse the recent read/attempt`);
        }
        assert.deepEqual(errors, []);
        checks += 1;
        console.log(`first-page background prewarm: ${mode} passed`);
      } catch (error) {
        console.error(mode, errors, await page.evaluate(() => ({ url: location.href,
          app: document.querySelector('#cc98-comfort-app')?.outerHTML.slice(0, 700),
          floors: [...document.querySelectorAll('[data-post-floor]')].map((node) => node.dataset.postFloor),
          nativeFloors: [...document.querySelectorAll('.reply-floor')].map((node) => node.textContent),
          root: document.documentElement.outerHTML.slice(0, 300) })));
        throw error;
      } finally {
        release.resolve();
        await context.close();
      }
    }
    console.log(`first-page background prewarm: ${checks} groups passed`);
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
