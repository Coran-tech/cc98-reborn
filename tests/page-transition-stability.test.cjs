const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const key = "cc98ComfortSettings";
const posts = (page) => Array.from({ length: 3 }, (_, index) => {
  const floor = (page - 1) * 10 + index + 1;
  return `<div class="reply" id="reply_${floor}" data-floor="${floor}"><a href="/user/id/1001">阅读用户</a><span class="reply-floor">${floor}</span>
    <div class="reply-content"><div class="substance"><article>${Array.from({ length: 22 }, (_, line) => `<p>第 ${page} 页、第 ${floor} 楼，第 ${line + 1} 段正文，页面晚到时也应保持稳定。</p>`).join("")}</article></div></div></div>`;
}).join("");
const nativePage = (page) => `<section class="topicInfo-info"><h1 id="essay1">页面 ${page} 的帖子标题</h1><div class="topicInfo-boardMessage"><a href="/board/81">测试版面</a></div></section>
  <div id="native-posts">${posts(page)}</div><div class="pagination"><div class="page-nav">${[1, 2, 3].map((number) => `<a href="/topic/6500000/${number}">${number}</a>`).join("")}</div></div>`;

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let checks = 0;
  try {
    for (const style of (process.env.CC98_TRANSITION_STYLE ? [process.env.CC98_TRANSITION_STYLE] : ["modern", "ascii"])) {
      let settings = { enabled: true, rebuildUi: true, themeStyle: style, themeMode: "light", previsitFirstPageForTopicImages: false, prewarmPostImages: false };
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await context.exposeBinding("__transitionSettings", () => ({ [key]: settings }));
      await context.addInitScript(() => {
        window.__transitionListeners = [];
        window.chrome = { runtime: { getManifest: () => ({ version: "0.3.7" }), getURL: (file) => new URL(`/${file}`, location.origin).href,
          onMessage: { addListener() {} }, sendMessage(_message, callback) { callback?.({ ok: false }); return Promise.resolve({ ok: false }); } },
          storage: { local: { get(_keys, callback) { const value = __transitionSettings(); if (callback) value.then(callback); else return value; }, set(_value, callback) { callback?.(); return Promise.resolve(); } },
            onChanged: { addListener(listener) { __transitionListeners.push(listener); } } } };
        window.__visibleShells = [];
        window.__frameSamples = [];
        window.__scrollCalls = [];
        const originalScrollTo = window.scrollTo;
        window.scrollTo = function (...args) { __scrollCalls.push({ args, stack: new Error().stack.split('\n').slice(1, 4) }); return originalScrollTo.apply(this, args); };
        const sample = () => {
          const app = document.querySelector('#cc98-comfort-app');
          if (app) {
            const first = app.querySelector('[data-post-floor]')?.dataset.postFloor || "";
            const signature = `${app.dataset.routeKey}:${first}`;
            if (__visibleShells.at(-1) !== signature) __visibleShells.push(signature);
          }
          __frameSamples.push({ y: scrollY, count: document.querySelectorAll('#cc98-comfort-app').length,
            active: document.documentElement.classList.contains('cc98-comfort-rebuild-active'),
            ready: document.documentElement.dataset.cc98ComfortRebuildReady,
            nativeOpacity: document.getElementById('native-page') ? getComputedStyle(document.getElementById('native-page')).opacity : null });
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (/^\/topic\//.test(url.pathname)) return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8"><title>CC98论坛</title>
          <link rel="stylesheet" href="/src/theme-tokens.css"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/interface-styles.css"></head><body>
          <div id="root"><div class="topBar"><a href="/">CC98</a></div><main id="native-page"></main></div>
          <script src="/src/theme-core.js"></script><script src="/src/interface-style.js"></script><script src="/src/content.js"></script></body></html>` });
        const file = url.pathname === "/src/content.js" && process.env.CC98_TRANSITION_BASELINE
          ? process.env.CC98_TRANSITION_BASELINE : path.resolve(root, `.${url.pathname}`);
        if (!file.startsWith(root + path.sep) && !process.env.CC98_TRANSITION_BASELINE) return route.abort();
        try { return await route.fulfill({ path: file }); }
        catch { return route.fulfill({ status: 404, body: "not found" }); }
      });
      async function populate(number) {
        await page.evaluate(({ markup, number }) => {
          document.getElementById('native-page').innerHTML = markup;
          document.title = `页面 ${number} 的帖子标题 - CC98论坛`;
        }, { markup: nativePage(number), number });
      }
      try {
        await page.goto(`${origin}/topic/6500000/1`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(420);
        await page.locator('#cc98-comfort-app[data-cc98-content-pending="true"] .cc98-rebuild-topbar').waitFor();
        const pendingShell = await page.evaluate(() => {
          window.__coldShell = document.getElementById('cc98-comfort-app');
          window.__coldTopbar = __coldShell.querySelector('.cc98-rebuild-topbar');
          return { nativeOpacity: getComputedStyle(document.getElementById('native-page')).opacity,
            title: __coldShell.querySelector('.cc98-rebuild-hero h1')?.textContent,
            header: __coldTopbar.getBoundingClientRect().toJSON() };
        });
        assert.equal(pendingShell.nativeOpacity, '0', "Always isolate the raw forum while showing the normal plugin layout");
        assert(pendingShell.header.height >= 40 && pendingShell.header.top >= 0, "The normal plugin navigation remains visible during loading");
        assert.equal(pendingShell.title, '', "Unknown topic titles reserve space rather than displaying a generic forum title");
        await fs.mkdir(path.join(root, 'outputs/plugin-shell-preview'), { recursive: true });
        await page.screenshot({ path: path.join(root, `outputs/plugin-shell-preview/${style}-loading.png`) });
        await populate(1);
        await page.locator('#cc98-comfort-app [data-post-floor="1"]').waitFor();
        await page.waitForTimeout(500);
        assert.deepEqual(await page.evaluate(() => __visibleShells.map((entry) => entry.split(':').at(-1))), ["", "1"], "Fill the plugin shell after the current page arrives");
        assert(await page.evaluate(() => __coldShell === document.getElementById('cc98-comfort-app') && __coldTopbar === __coldShell.querySelector('.cc98-rebuild-topbar')), "Fill content in place while retaining the shell and navigation nodes");
        const loadedHeader = await page.locator('.cc98-rebuild-topbar').evaluate((node) => node.getBoundingClientRect().toJSON());
        assert.equal(loadedHeader.width, pendingShell.header.width);
        assert.equal(loadedHeader.x, pendingShell.header.x);
        await page.screenshot({ path: path.join(root, `outputs/plugin-shell-preview/${style}-loaded.png`) });
        checks += 1;

        await page.evaluate(() => window.scrollTo(0, 600));
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(420);
        await populate(1);
        await page.locator('#cc98-comfort-app [data-post-floor="1"]').waitFor();
        await page.waitForTimeout(300);
        assert(Math.abs(await page.evaluate(() => scrollY) - 600) < 2, "Reload with delayed content must retain the browser's reading position");
        checks += 1;

        await page.evaluate(() => { window.__firstShell = document.getElementById('cc98-comfort-app'); window.scrollTo(0, 600); });
        await page.waitForTimeout(150);
        const startingY = await page.evaluate(() => scrollY);
        await page.evaluate(() => {
          window.__frameSamples = [];
          history.pushState({}, '', '/topic/6500000/2');
        });
        await page.waitForTimeout(700);
        assert(await page.evaluate(() => __firstShell === document.getElementById('cc98-comfort-app')), "Keep the current shell while the destination's native DOM is still old");
        const pending = await page.evaluate(() => ({ y: scrollY, route: document.getElementById('cc98-comfort-app').dataset.routeKey,
          samples: __frameSamples, mask: !!document.querySelector('#cc98-comfort-loading') }));
        assert.equal(pending.y, startingY, "Do not reset the viewport before destination content is available");
        assert(pending.route.endsWith('/1'), "Old native content must not be relabelled as the new route");
        assert(pending.samples.every((frame) => frame.count === 1 && frame.active && frame.ready === 'true' && frame.nativeOpacity === '0'), "Never expose the native forum or unmount the plugin interface while waiting");
        assert.equal(pending.mask, false);
        checks += 1;

        await populate(2);
        await page.locator('#cc98-comfort-app [data-post-floor="11"]').waitFor();
        assert.equal(await page.locator('#cc98-comfort-app [data-post-floor="1"]').count(), 0);
        assert.equal(await page.evaluate(() => scrollY), 0, "A forward page change resets to the top once, when ready");
        await page.evaluate(() => { window.__secondShell = document.getElementById('cc98-comfort-app'); window.scrollTo(0, 500); });
        await page.waitForTimeout(1800);
        assert(await page.evaluate(() => __secondShell === document.getElementById('cc98-comfort-app')), "Route follow-up timers must not rebuild identical data");
        assert.equal(await page.evaluate(() => scrollY), 500);
        checks += 1;

        // A same-route refresh used to expose the tall original tree while
        // reading geometry, allowing the browser to clamp the scroll position.
        await page.evaluate(() => {
          const marker = document.querySelector('#cc98-comfort-app [data-post-floor="12"]');
          marker.scrollIntoView({ block: 'start' });
          window.__anchorBefore = marker.getBoundingClientRect().top;
          window.__yBefore = scrollY;
          window.__frameSamples = [];
        });
        await page.locator('.cc98-rebuild-refresh-button').click({ force: true });
        await page.waitForTimeout(500);
        const refreshed = await page.evaluate(() => ({ y: scrollY, expectedY: __yBefore,
          top: document.querySelector('#cc98-comfort-app [data-post-floor="12"]').getBoundingClientRect().top,
          expectedTop: __anchorBefore, samples: __frameSamples }));
        assert(Math.abs(refreshed.y - refreshed.expectedY) < 2 && Math.abs(refreshed.top - refreshed.expectedTop) < 2,
          `Retain the visible reading anchor across a same-route replacement: ${JSON.stringify(refreshed)}`);
        assert(refreshed.samples.every((frame) => frame.count === 1 && frame.active && frame.ready === 'true'));
        checks += 1;

        // A second navigation supersedes an in-flight first one. Its late
        // response must not be published under the newest pathname.
        await page.evaluate(() => { history.pushState({}, '', '/topic/6500000/1'); });
        await page.waitForTimeout(250);
        await page.evaluate(() => { history.pushState({}, '', '/topic/6500000/3'); });
        await populate(1);
        await page.waitForTimeout(350);
        assert.equal(await page.locator('#cc98-comfort-app [data-post-floor="11"]').count(), 1, "Reject late content from a superseded page");
        await populate(3);
        await page.locator('#cc98-comfort-app [data-post-floor="21"]').waitFor();
        assert.equal(await page.locator('.cc98-rebuild-route-status').count(), 0);
        checks += 1;

        await page.evaluate(() => history.pushState({}, '', '/topic/6500000/2'));
        await page.waitForTimeout(250);
        const previous = settings; settings = { ...settings, enabled: false };
        await page.evaluate(({ key, previous, next }) => __transitionListeners.forEach((listener) => listener({ [key]: { oldValue: previous, newValue: next } }, 'local')), { key, previous, next: settings });
        await page.waitForTimeout(350);
        assert.equal(await page.locator('#cc98-comfort-app').count(), 0);
        assert.equal(await page.locator('.cc98-rebuild-route-status').count(), 0);
        assert.equal(await page.locator('#cc98-comfort-loading').count(), 0);
        assert.deepEqual(errors, []);
        checks += 1;
        console.log(`page transition stability: ${style}: cold load, reload, delayed SPA, follow-ups, reading anchor, rapid navigation and disable passed`);
      } catch (error) {
        console.error(style, errors, JSON.stringify(await page.evaluate(() => ({ shells: __visibleShells, samples: __frameSamples.slice(-8), url: location.href, scrolls: __scrollCalls.slice(-12), reset: typeof pendingRouteScrollReset === 'undefined' ? null : pendingRouteScrollReset }))));
        throw error;
      } finally { await context.close(); }
    }
    console.log(`page transition stability: ${checks} groups passed`);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
