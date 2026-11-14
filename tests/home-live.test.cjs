const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const manifest = require("../manifest.json");

const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const endpoint = "https://api.cc98.org/config/index";
const output = path.join(root, "outputs/home-live");
const topics = Array.from({ length: 10 }, (_, index) => ({
  id: 7001001 + index,
  title: [
    "今天的晚霞，想分享给路过的你",
    "图书馆里适合安静读书的角落",
    "大家最近在听什么歌？",
    "校园摄影：把秋天留在这一页",
    "关于本周课程的一点学习心得",
    "周末一起去看看城市里的展览",
    "分享几本最近读完的好书",
    "食堂新窗口，你最喜欢哪一道",
    "从第一次跑步到完成十公里",
    "很高兴在这里遇见志同道合的朋友"
  ][index],
  boardId: 81 + (index % 3),
  boardName: ["校园信息", "似水流年", "开怀一笑"][index % 3]
}));

function fixture({ empty = false } = {}) {
  const native = (empty ? [] : topics)
    .map(
      (item) =>
        `<div class="mainPageListRow"><div class="mainPageListBoardName"><a href="/board/${item.boardId}">[${item.boardName}]</a></div><div class="mainPageListTitle"><a href="/topic/${item.id}/1">${item.title}</a></div></div>`
    )
    .join("");
  return `<!doctype html><html class="cc98-comfort"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CC98论坛</title>
    ${["theme-tokens.css", "styles.css", "interface-styles.css"].map((file) => `<link rel="stylesheet" href="/src/${file}">`).join("")}
    <style>.native{display:none!important}body{margin:0}</style></head><body>
    <div class="native mainPage"><div class="mainPageList"><div class="mainPageTitleText">热门话题</div>${native}</div><div class="mainPageList"><div class="mainPageTitleText">校园新闻</div><div class="mainPageListRow"><div class="mainPageListBoardName"><a href="/board/81">[校园信息]</a></div><div class="mainPageListTitle"><a href="/topic/8000001">另一分区保持不变</a></div></div></div></div>
    <main id="cc98-comfort-app" class="cc98-rebuild-shell" data-page-kind="home" data-home-hot-only="true">
      <header class="cc98-rebuild-topbar"><a class="cc98-rebuild-brand" href="/">CC98 Reborn</a><nav class="cc98-rebuild-nav"><a aria-current="page" href="/">首页</a><a href="/boardList">版面</a><a href="/newTopics">新帖</a><a href="/focus">关注</a><a href="/recommendedTopics">精选</a><a href="/#cc98-reborn-read-later">稍后再看</a><a href="/userCenter/reborn">插件设置</a></nav><form class="cc98-rebuild-search"><div class="cc98-rebuild-search-type-wrap"><button class="cc98-rebuild-search-type" type="button">主题</button></div><div class="cc98-rebuild-search-field"><input aria-label="搜索内容" placeholder="请输入搜索内容"></div><button type="button" class="cc98-rebuild-search-submit">搜索</button><button type="button" class="cc98-rebuild-search-submit cc98-rebuild-refresh-button">同步</button></form></header>
    </main>
    <script>
      window.chrome={runtime:{getURL:p=>location.origin+'/'+p,getManifest:()=>(${JSON.stringify({ version: manifest.version, version_name: manifest.version_name })}),onMessage:{addListener(){}},sendMessage:(m,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(k,c)=>{c?.({});return Promise.resolve({})},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener(){}}}};
      window.__rebuildRequests=0;window.__homeFetches=[];
      const nativeFetch=window.fetch;
      window.fetch=function(url, options){if(String(url).includes('/config/index'))__homeFetches.push({url:String(url),headers:options?.headers,credentials:options?.credentials,at:Date.now()});return nativeFetch.call(this,url,options)};
    </script>
    ${["theme-core.js", "interface-style.js", "home-live.js", "content.js"].map((file) => `<script src="/src/${file}"></script>`).join("")}
    <script>
      lastSettings={...DEFAULT_SETTINGS,themeMode:'light',themeStyle:'modern',themePalette:'teal',previsitFirstPageForTopicImages:false,prewarmPostImages:false};
      scheduleRebuild=()=>{__rebuildRequests++;window.mountHome()};scheduleSync=()=>{};
      document.documentElement.removeAttribute('data-cc98-rebuild-transition-veil');
      window.mountHome=()=>{
        const app=document.querySelector('#cc98-comfort-app');app.dataset.routeKey=getRoutePageKey();app.dataset.homeHotOnly=String(lastSettings.homeHotOnly);
        [...app.children].filter(child=>!child.matches('.cc98-rebuild-topbar')).forEach(child=>child.remove());
        if(!lastSettings.homeHotOnly){const hero=createElement('section','cc98-rebuild-hero cc98-rebuild-home-hero');hero.append(createElement('p','cc98-rebuild-kicker cc98-rebuild-version-kicker','Reborn View · '+EXTENSION_VERSION_LABEL),createElement('h1','',getPageTitle()),createHomeOnlineIndicator());app.append(hero)}
        renderHome(app);CC98RebornThemeCore.apply(document.documentElement,lastSettings);CC98RebornInterfaceStyle.sync(lastSettings);syncHomeLive();
      };
      window.mountHome();
    </script></body></html>`;
}

async function until(page, predicate, label) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await page.evaluate(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out: " + label);
}

async function snapshotCards(page) {
  await page.evaluate(() => {
    window.__homeNodes = {
      app: document.querySelector("#cc98-comfort-app"),
      header: document.querySelector(".cc98-rebuild-topbar"),
      input: document.querySelector(".cc98-rebuild-search input"),
      native: document.querySelector(".native").innerHTML,
      cards: [
        ...document.querySelectorAll(
          '[data-home-section-kind="hot"] > .cc98-rebuild-list > article'
        )
      ]
    };
  });
}

async function assertStable(page, allCards = true) {
  const retained = await page.evaluate(() => ({
    app: __homeNodes.app === document.querySelector("#cc98-comfort-app"),
    header: __homeNodes.header === document.querySelector(".cc98-rebuild-topbar"),
    input: __homeNodes.input === document.querySelector(".cc98-rebuild-search input"),
    native: __homeNodes.native === document.querySelector(".native").innerHTML,
    cards: __homeNodes.cards.every(
      (card, index) =>
        card ===
        document.querySelectorAll('[data-home-section-kind="hot"] > .cc98-rebuild-list > article')[
          index
        ]
    ),
    rebuilds: __rebuildRequests
  }));
  assert(
    retained.app && retained.header && retained.input && retained.native,
    JSON.stringify(retained)
  );
  if (allCards) assert(retained.cards, "unchanged cards retain their actual DOM nodes");
  assert.equal(retained.rebuilds, 0, "background updates never request full rebuilding");
}

async function geometry(page) {
  return page.evaluate(() => {
    const hero = document.querySelector(".cc98-rebuild-home-hero");
    const online = [...document.querySelectorAll(".cc98-rebuild-home-online")].find(
      (node) => node.getClientRects().length
    );
    const container = online.closest(".cc98-rebuild-section-heading") || hero;
    const rect = (node) => {
      const box = node.getBoundingClientRect(),
        css = getComputedStyle(node);
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
        radius: css.borderRadius,
        color: css.color,
        background: css.backgroundColor,
        paddingRight: css.paddingRight
      };
    };
    const box = container.getBoundingClientRect();
    return {
      title: rect(container.querySelector("h1,h2")),
      kicker: rect(hero.querySelector(".cc98-rebuild-version-kicker")),
      online: rect(online),
      hero: {
        left: box.left,
        right: box.right,
        paddingRight: getComputedStyle(container).paddingRight
      },
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  });
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const errors = [],
    unexpected = [],
    requests = [],
    checks = [],
    layouts = [];
  let response = { onlineUserCount: 4021, hotTopic: topics },
    status = 200,
    headers = {};
  let held = null,
    holdNext = false;
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.href === endpoint) {
      requests.push({ method: request.method(), headers: request.headers() });
      if (holdNext) {
        holdNext = false;
        held = route;
        return;
      }
      return route.fulfill({
        status,
        headers: { "access-control-allow-origin": origin, ...headers },
        contentType: "application/json",
        body: JSON.stringify(response)
      });
    }
    if (url.origin === origin && url.pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: fixture({ empty: url.searchParams.has("empty-home") })
      });
    if (url.origin === origin && url.pathname === "/src/content.js") {
      const source = await fs.readFile(path.join(root, "src/content.js"), "utf8"),
        cut = source.lastIndexOf("\narmInitialRebuildTransitionVeil();");
      assert(cut > 0, "explicit home fixture uses production functions without boot side effects");
      return route.fulfill({ contentType: "text/javascript", body: source.slice(0, cut) });
    }
    if (url.origin === origin && url.pathname.startsWith("/src/"))
      return route.fulfill({ path: path.join(root, url.pathname) });
    if (url.pathname.endsWith("/favicon.ico")) return route.fulfill({ status: 204, body: "" });
    unexpected.push(url.href);
    return route.abort();
  });
  try {
    const start = new Date("2026-11-10T12:00:00Z");
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
    await page.goto(origin);
    await page.clock.runFor(1);
    await until(
      page,
      () => document.querySelector(".cc98-rebuild-home-online-count")?.textContent === "4021",
      "initial online count"
    );
    assert.equal(requests.length, 1);
    assert.equal(
      await page.locator('[data-home-section-kind="hot"] .cc98-rebuild-rank-motion-new').count(),
      0,
      "Native /topic/id/1 and API links must identify the same ranked topics"
    );
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].headers.authorization, undefined);
    assert.equal(await page.evaluate(() => __homeFetches[0].credentials), "omit");
    assert.equal(
      await page.locator('[data-home-section-kind="hot"] .cc98-rebuild-card').count(),
      10
    );
    checks.push(
      "Native homepage and API normalize into the existing ten-card UI; no app token/cookies"
    );

    await snapshotCards(page);
    await page.locator(".cc98-rebuild-search input").fill("保留搜索输入");
    await page.locator(".cc98-rebuild-search input").focus();
    response = { ...response, onlineUserCount: 4100 };
    await page.clock.fastForward(59_000);
    assert.equal(requests.length, 1, "no early poll");
    await page.clock.fastForward(1000);
    await until(
      page,
      () => document.querySelector(".cc98-rebuild-home-online-count")?.textContent === "4100",
      "minute update"
    );
    assert.equal(requests.length, 2);
    await assertStable(page);
    assert.equal(await page.locator(".cc98-rebuild-search input").inputValue(), "保留搜索输入");
    assert(await page.evaluate(() => document.activeElement === __homeNodes.input));
    checks.push(
      "60-second update only changes the count; cards, header, focus and input remain mounted"
    );

    const reordered = [
      topics[1],
      topics[0],
      topics[2],
      { ...topics[3], title: "更新后的标题仍沿用原有卡片" },
      ...topics.slice(4, 9),
      { id: 7001011, boardId: 81, boardName: "校园信息", title: "新上榜的校园话题" }
    ];
    response = { onlineUserCount: 4200, hotTopic: reordered };
    await page.clock.fastForward(60_000);
    await until(
      page,
      () => document.querySelector(".cc98-rebuild-home-online-count")?.textContent === "4200",
      "rank update"
    );
    const ids = await page
      .locator('[data-home-section-kind="hot"] .cc98-rebuild-card-title')
      .evaluateAll((nodes) =>
        nodes.map((node) => Number(new URL(node.href).pathname.split("/")[2]))
      );
    assert.deepEqual(
      ids,
      reordered.map((item) => item.id)
    );
    assert(
      await page.evaluate(
        () =>
          __homeNodes.cards[2] ===
          document.querySelectorAll('[data-home-section-kind="hot"] .cc98-rebuild-card')[2]
      )
    );
    assert.equal(
      await page.locator('[data-home-section-kind="hot"] .cc98-rebuild-rank-motion-up').count(),
      1
    );
    assert.equal(
      await page.locator('[data-home-section-kind="hot"] .cc98-rebuild-rank-motion-new').count(),
      1
    );
    await assertStable(page, false);
    checks.push(
      "Reordered/new/removed topics update in place and preserve rank movement plus unchanged cards"
    );

    await snapshotCards(page);
    response = { onlineUserCount: 0, hotTopic: [] };
    await page.clock.fastForward(60_000);
    await until(
      page,
      () => document.querySelector(".cc98-rebuild-home-online-count")?.textContent === "0",
      "zero is a valid count"
    );
    await assertStable(page);
    const sibling = await context.newPage();
    sibling.on("pageerror", (error) => errors.push(error.message));
    const siblingTime = await page.evaluate(() => Date.now());
    await sibling.clock.install({ time: new Date(siblingTime) });
    await sibling.clock.pauseAt(new Date(siblingTime + 1));
    const beforeSibling = requests.length;
    await sibling.goto(origin);
    await sibling.clock.runFor(1);
    await until(
      sibling,
      () => document.querySelector(".cc98-rebuild-home-online-count")?.textContent === "0",
      "shared cached count"
    );
    assert.equal(
      requests.length,
      beforeSibling,
      "a second home tab reuses the same-minute response"
    );
    const cachedIds = await sibling
      .locator('[data-home-section-kind="hot"] .cc98-rebuild-card-title')
      .evaluateAll((nodes) =>
        nodes.map((node) => Number(new URL(node.href).pathname.split("/")[2]))
      );
    assert.deepEqual(
      cachedIds,
      reordered.map((item) => item.id),
      "last nonempty API list survives a fresh page with older native DOM"
    );
    status = 503;
    await page.clock.fastForward(60_000);
    await until(page, () => __homeFetches.length === 5, "failed request");
    await assertStable(page);
    assert.equal(await page.locator(".cc98-rebuild-home-online-count").textContent(), "0");
    checks.push(
      "Empty hotTopic and failed requests retain the last good cards; zero is not treated as missing"
    );

    status = 200;
    response = { onlineUserCount: 4321, hotTopic: reordered };
    await page.clock.fastForward(60_000);
    await until(
      page,
      () => document.querySelector(".cc98-rebuild-home-online-count")?.textContent === "4321",
      "request recovery"
    );
    await until(
      sibling,
      () => document.querySelector(".cc98-rebuild-home-online-count")?.textContent === "4321",
      "other tabs receive the refreshed result"
    );
    await sibling.close();
    checks.push(
      "Other home tabs reuse the response and receive updates; cached nonempty topics survive empty recalculation"
    );
    await page.evaluate(() => {
      lastSettings.blockedTitleKeywords = "新上榜";
      syncHomeIndexUi();
    });
    assert.equal(
      await page.locator('[data-home-section-kind="hot"] .cc98-rebuild-blocked').count(),
      1
    );
    await page.evaluate(() => {
      lastSettings.blockedTitleKeywords = "";
      lastSettings.openLinksInNewTab = true;
      syncHomeIndexUi();
    });
    assert.equal(
      await page
        .locator('[data-home-section-kind="hot"] .cc98-rebuild-card-title')
        .first()
        .getAttribute("target"),
      "_blank"
    );
    await page
      .locator('[data-home-section-kind="hot"] .cc98-rebuild-read-later-button')
      .first()
      .evaluate((node) => node.click());
    await page.evaluate(() => syncHomeIndexUi());
    assert(
      await page
        .locator('[data-home-section-kind="hot"] .cc98-rebuild-read-later-button')
        .first()
        .evaluate((node) => node.classList.contains("is-saved"))
    );
    checks.push(
      "Existing blocking rules, read-later action and new-tab preference survive API data updates"
    );
    await page.locator(".cc98-rebuild-search input").fill("");
    await page.evaluate(() => document.activeElement?.blur());
    await page.clock.runFor(3500);

    for (const hotOnly of [true, false]) {
      await page.evaluate((value) => {
        lastSettings.homeHotOnly = value;
        mountHome();
      }, hotOnly);
      for (const themeStyle of ["modern", "ascii"])
        for (const themeMode of ["light", "dark"]) {
          await page.setViewportSize({ width: 1440, height: 1050 });
          await page.evaluate(
            (settings) => {
              Object.assign(lastSettings, settings);
              CC98RebornThemeCore.apply(document.documentElement, lastSettings);
              CC98RebornInterfaceStyle.sync(lastSettings);
            },
            { themeStyle, themeMode }
          );
          await page.clock.runFor(180);
          const layout = await geometry(page),
            row = themeStyle === "ascii" ? layout.kicker : layout.title;
          assert(
            Math.abs(layout.online.bottom - row.bottom) <= 2,
            `${themeStyle}: online bottom aligns with the requested row: ${JSON.stringify(layout)}`
          );
          assert(
            layout.online.left >= row.right,
            `${themeStyle}: online is to the right of its row`
          );
          assert(!layout.overflow, `${themeStyle}: no horizontal overflow`);
          if (themeStyle === "ascii") assert.equal(layout.online.radius, "0px");
          layouts.push({ hotOnly, themeStyle, themeMode, width: 1440, ...layout });
          await page.screenshot({
            path: path.join(output, `${hotOnly ? "hot" : "full"}-${themeStyle}-${themeMode}.png`)
          });
        }
    }
    await page.evaluate(() => {
      lastSettings.homeHotOnly = true;
      mountHome();
    });
    for (const themeStyle of ["modern", "ascii"]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(
        (settings) => {
          Object.assign(lastSettings, settings);
          CC98RebornThemeCore.apply(document.documentElement, lastSettings);
          CC98RebornInterfaceStyle.sync(lastSettings);
        },
        { themeStyle, themeMode: "light" }
      );
      await page.clock.runFor(180);
      const layout = await geometry(page);
      assert(!layout.overflow, `narrow ${themeStyle}: no horizontal overflow`);
      assert(layout.online.right <= 390, `narrow ${themeStyle}: online card fits the viewport`);
      layouts.push({ hotOnly: true, themeStyle, width: 390, ...layout });
      await page.screenshot({ path: path.join(output, `hot-${themeStyle}-narrow.png`) });
    }
    checks.push(
      "Modern/ASCII light/dark and full/hot-only headers preserve layout; narrow screens fit"
    );

    await page.evaluate(() => {
      lastSettings.enabled = false;
      syncHomeLive();
    });
    const stoppedCount = requests.length;
    await page.clock.fastForward(120_000);
    assert.equal(requests.length, stoppedCount, "disabled plugin stops polling");
    await page.evaluate(() => {
      lastSettings.enabled = true;
      syncHomeLive();
    });
    holdNext = true;
    await page.clock.runFor(1);
    for (let attempt = 0; !held && attempt < 100; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert(held, "one in-flight home request to exercise route exit");
    const beforeExit = await page.locator(".cc98-rebuild-home-online-count").textContent();
    await page.evaluate(() => {
      history.pushState(null, "", "/newTopics");
      syncHomeLive();
    });
    await held
      .fulfill({
        headers: { "access-control-allow-origin": origin },
        contentType: "application/json",
        body: JSON.stringify({ onlineUserCount: 9999, hotTopic: topics })
      })
      .catch(() => {});
    await page.clock.fastForward(120_000);
    assert.equal(await page.locator(".cc98-rebuild-home-online-count").textContent(), beforeExit);
    assert.equal(requests.length, stoppedCount + 1);
    checks.push("Disabling or leaving home stops polling and ignores a late response");

    const vpnStates = await page.evaluate(() => {
      const original = isWebVpnHost;
      try {
        isWebVpnHost = () => true;
        const item = {
          type: "topic",
          title: "旧标题",
          href: "https://www.cc98.org/topic/123",
          board: "学习天地",
          boardHref: "https://www.cc98.org/board/81",
          rank: 1
        };
        return [getHomeCardState(item), getHomeCardState({ ...item, title: "新标题", rank: 2 })];
      } finally {
        isWebVpnHost = original;
      }
    });
    assert(
      vpnStates[0] && vpnStates[1] && vpnStates[0] !== vpnStates[1],
      "WebVPN card state must detect title/rank changes"
    );

    const emptyPage = await context.newPage();
    emptyPage.on("pageerror", (error) => errors.push(error.message));
    await emptyPage.goto(origin + "/?empty-home");
    try {
      await until(
        emptyPage,
        () =>
          document.querySelectorAll('[data-home-section-kind="hot"] .cc98-rebuild-card').length ===
          10,
        "API/cache fills a missing native hot list"
      );
    } catch (error) {
      console.error(
        await emptyPage.evaluate(() => ({
          active: isHomeLiveActive(),
          kind: getPageKind(),
          route: getCurrentCc98RoutePath(),
          snapshot: homeLiveController?.getSnapshot(),
          sections: getHomeSections(),
          app: document.querySelector("#cc98-comfort-app")?.innerHTML,
          requests: __homeFetches
        })),
        errors
      );
      throw error;
    }
    assert.equal(await emptyPage.evaluate(() => __rebuildRequests), 0);
    await emptyPage.close();
    checks.push(
      "A delayed native hot list can be filled without a rebuild; WebVPN title/rank keys update"
    );

    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await fs.writeFile(
      path.join(output, "validation.json"),
      JSON.stringify({ checks, layouts, requests: requests.length, errors, unexpected }, null, 2)
    );
    console.log(
      JSON.stringify({ passed: checks.length, checks, requests: requests.length, output })
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
module.exports = { fixture, topics };
