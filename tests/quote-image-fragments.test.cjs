const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const output = path.join(root, "outputs/quote-image-fragments-preview");
const image = '<img src="/fixture/quoted-chart.png" alt="引用图片">';
const quote = content => `<div style="background-color:#f5faff;border:1px solid #ccc;max-height:800px;overflow-y:auto">${content}</div>`;
const broken = `正文前段（保留）${quote('<p>合作前查询了相关信息。</p>![img](<a class="download-file" href="/fixture/quoted-chart.png">点击下载文件</a>)<br>![img](<a class="download-file" href="/fixture/quoted-second.png">点击下载文件</a>)')}正文后段（保留）`;
const source = `<div class="reply" data-floor="1"><div class="reply-floor">#1</div><a href="/user/id/100">测试用户</a><div class="reply-content"><div class="substance"><article>${broken}</article></div></div></div><div class="pagination"><ul class="page-nav"><li><a href="/topic/100/1">1</a></li></ul></div>`;
const shim = `<script>window.chrome={runtime:{getURL:p=>location.origin+'/'+p,getManifest:()=>({version:'0.3.6'}),onMessage:{addListener(){}},sendMessage:(m,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(k,c)=>{const p=Promise.resolve({cc98ComfortSettings:{enabled:true,themeMode:'light',prewarmPostImages:false,previsitFirstPageForTopicImages:false}});if(c)p.then(c);return p},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener(){}}}};</script>`;
const shell = baseline => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>引用图片测试</title><link rel="stylesheet" href="/src/theme-tokens.css"><link rel="stylesheet" href="/src/styles.css"><style>.native{position:absolute;left:-10000px;width:900px}#cc98-comfort-app{position:relative!important;padding:20px;max-width:1000px;margin:auto}.cc98-rebuild-post-body img{max-width:100%}</style></head><body><div class="native">${source}</div><main id="cc98-comfort-app"></main>${shim}${["theme-core.js", "conversation-core.js", "conversation.js", "content.js"].map(file => `<script src="/src/${file}"></script>`).join("")}<script>lastSettings={...DEFAULT_SETTINGS,themeMode:'light',prewarmPostImages:false,previsitFirstPageForTopicImages:false};scheduleRebuild=()=>{};scheduleSync=()=>{};${baseline ? "normalizeFragmentedMarkdownImages=()=>{};" : ""}document.documentElement.classList.add('cc98-comfort');document.documentElement.dataset.cc98ComfortTone='light';document.documentElement.removeAttribute('data-cc98-rebuild-transition-veil');window.fixtureItems=getPostItems();const app=document.querySelector('#cc98-comfort-app');app.dataset.routeKey=getRoutePageKey();fixtureItems.forEach(item=>app.append(renderPostCard(item)));bindRebuiltFloorLinks(app);ensureObserver();</script></body></html>`;

async function main() {
  const baseline = process.argv.includes("--baseline");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  let checks = 0;
  try {
    await fs.mkdir(output, { recursive: true });
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith("/topic/")) return route.fulfill({ contentType: "text/html", body: shell(baseline) });
      if (url.pathname.startsWith("/fixture/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="840" height="280"><rect width="840" height="280" fill="#e4edf6"/><rect x="32" y="32" width="776" height="216" rx="12" fill="white"/><text x="420" y="154" text-anchor="middle" font-size="32" fill="#32566a">引用中的图片</text></svg>' });
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try {
        if (url.pathname === "/src/content.js") {
          const code = await fs.readFile(file, "utf8");
          // This fixture mounts real post cards itself; disable only automatic
          // page startup so pending startup frames cannot replace those cards.
          return route.fulfill({ contentType: "text/javascript", body: code.slice(0, code.lastIndexOf("\narmInitialRebuildTransitionVeil();")) });
        }
        return await route.fulfill({ path: file });
      }
      catch { return route.fulfill({ status: 404, body: "Not found" }); }
    });
    await page.goto(`${origin}/topic/100/1`);
    const body = page.locator('#cc98-comfort-app [data-post-floor="1"] .cc98-rebuild-post-body');
    await body.waitFor();
    if (baseline) {
      assert.match(await body.innerText(), /!\[img\]\(/);
      assert.equal(await body.locator("a.cc98-rebuild-download-button img").count(), 2);
      await body.screenshot({ path: path.join(output, "quote-images-before.png") });
      console.log("quote images: prior pipeline reproduces Markdown fragments and image download cards");
      return;
    }
    assert.doesNotMatch(await body.innerText(), /!\[img\]\(|下载文件/);
    assert.equal(await body.locator("img").count(), 2);
    assert.equal(await body.locator("a.download-file, a[download]").count(), 0);
    assert.match(await body.innerText(), /正文前段（保留）/);
    assert.match(await body.innerText(), /正文后段（保留）/);
    assert.equal(await page.locator('.native .download-file').count(), 2, "native React content must remain untouched");
    checks++;

    const cases = [
      { name: "already mounted image", html: quote(`前![img](<a class="download-file" href="/fixture/quoted-chart.png">${image}</a>)后`), text: "前后", images: 1 },
      { name: "split inline markers and Unicode", html: quote(`😀<span>!</span><b>[img]</b><span>(</span>${image}<i>)</i>尾😀`), text: "😀尾😀", images: 1 },
      { name: "nested and repeated images", html: quote(`父![img](${image})${quote(`子![img](${image})`)}`), text: "父子", images: 2 },
      { name: "picture sources", html: quote(`![img](<a class="download-file" href="/fixture/quoted-chart.png"><picture><source srcset="/fixture/quoted-second.png">${image}</picture></a>)`), text: "", images: 1, picture: true },
      { name: "captured lazy slot", html: quote('![img](<div class="visibleImage"><div class="lazyload-placeholder" data-cc98-lazy-src="/fixture/quoted-chart.png"></div></div>)'), text: "", images: 1 },
      { name: "hidden image stays folded", html: quote('![img](<div class="hiddenImage">点击查看图片</div>)'), text: "点击查看图片", images: 0, hidden: true, mediaSources: [{ src: "/fixture/quoted-chart.png", kind: "image" }] },
      { name: "title and alt", html: quote(`![说明](<a href="/fixture/quoted-chart.png">/fixture/quoted-chart.png</a> "图片标题")`), text: "", images: 1, alt: "说明" },
      { name: "empty placeholder before image", html: quote(`前![img]()${image}后`), text: "前后", images: 1 },
      { name: "empty placeholder after image", html: quote(`前${image}![img]()后`), text: "前后", images: 1 },
      { name: "ordinary attachments and links", html: quote('<a class="download-file" href="/fixture/paper.pdf">点击下载文件</a><a class="download-file" href="/fixture/archive.zip">点击下载文件</a><a href="/topic/200">普通链接</a>![img]()'), images: 0, downloads: 2, literal: "![img]()" },
      { name: "literal code", html: quote(`<pre><code>![img](${image})</code></pre><code class="cc98-local-experimental-noubb">![img](${image})</code>`), images: 2, literal: "![img](" },
      { name: "escaped marker", html: quote(`\\![img](${image})`), text: "\\![img]()", images: 1 },
      { name: "quote boundaries", html: `${quote('![img](')}${quote(`${image})`)}`, text: "![img]()", images: 1 },
      { name: "incomplete syntax", html: quote(`![img](${image}`), text: "![img](", images: 1 },
      { name: "ordinary linked image", html: quote(`<a href="/topic/200">${image}</a>`), images: 1, links: 1 }
    ];
    for (const test of cases) {
      const result = await page.evaluate(({ html, mediaSources }) => {
        const source = document.createElement("article"); source.innerHTML = html;
        const original = source.innerHTML;
        const node = sanitizePostContent(source, mediaSources || []);
        const once = node.innerHTML;
        normalizeFragmentedMarkdownImages(node);
        return { text: node.textContent, images: node.querySelectorAll("img").length,
          downloads: node.querySelectorAll("a[download]").length, links: node.querySelectorAll("a").length,
          picture: Boolean(node.querySelector("picture source")), alt: node.querySelector("img")?.alt,
          hidden: Boolean(node.querySelector('.cc98-rebuild-hidden-image-button[data-cc98-direct-image-src]')),
          stable: once === node.innerHTML, sourceUnchanged: original === source.innerHTML };
      }, test);
      assert.equal(result.images, test.images, test.name);
      if (test.text !== undefined) assert.equal(result.text, test.text, test.name);
      if (test.literal) assert(result.text.includes(test.literal), test.name);
      if (test.downloads !== undefined) assert.equal(result.downloads, test.downloads, test.name);
      if (test.links !== undefined) assert.equal(result.links, test.links, test.name);
      if (test.picture) assert(result.picture, test.name);
      if (test.alt) assert.equal(result.alt, test.alt, test.name);
      if (test.hidden) assert(result.hidden, test.name);
      assert(result.stable && result.sourceUnchanged, `${test.name}: idempotence / native source`);
      checks++;
    }
    const rich = await page.evaluate(html => {
      const source = document.createElement("div"); source.innerHTML = html;
      const content = normalizeRichContentNode(source);
      return { text: content.textContent, images: content.querySelectorAll("img").length, downloads: content.querySelectorAll("a.download-file").length };
    }, quote('![img](<a class="download-file" href="/fixture/quoted-chart.png">点击下载文件</a>)'));
    assert.deepEqual(rich, { text: "", images: 1, downloads: 0 });
    checks++;

    for (const tone of ["light", "dark"]) {
      await page.evaluate(tone => { lastSettings.themeMode = tone; applySettings(lastSettings); }, tone);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1050 });
        await body.locator("img").evaluateAll(nodes => Promise.all(nodes.map(image => { image.loading = "eager"; return image.decode(); })));
        assert(await body.locator("img").evaluateAll(nodes => nodes.every(image => image.naturalWidth > 0 && image.getBoundingClientRect().width > 0)));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await body.screenshot({ path: path.join(output, `quote-images-${width}-${tone}.png`) });
        checks++;
      }
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.locator('[data-post-floor="1"] .cc98-rebuild-conversation-action').click();
    await page.waitForFunction(() => document.querySelector(".cc98-rebuild-conversation-status")?.textContent.startsWith("查找完成"));
    const dialogBody = page.locator('[data-conversation-key="100:1"] .cc98-rebuild-conversation-body');
    assert.doesNotMatch(await dialogBody.textContent(), /!\[img\]\(|下载文件/);
    assert.equal(await dialogBody.locator("img").count(), 2);
    assert.equal(await dialogBody.locator("a.download-file").count(), 0);
    await dialogBody.locator('summary').first().click();
    await dialogBody.locator('img').first().evaluate(image => { image.loading = "eager"; return image.decode(); });
    assert(await dialogBody.locator('img').first().evaluate(image => isImageViewerCandidate(image)), await dialogBody.locator('img').first().evaluate(image => image.outerHTML));
    await dialogBody.locator('img').first().click();
    await page.locator('#cc98-comfort-image-viewer').waitFor({ timeout: 4000 }).catch(async error => {
      console.error(await page.evaluate(() => ({ href: location.href, errors: window.bad, dialogs: document.querySelectorAll('[role="dialog"]').length, image: document.querySelector('.cc98-rebuild-conversation-body img')?.outerHTML, clicks: document.querySelector('.cc98-rebuild-conversation-dialog')?.outerHTML.slice(0, 500) })));
      throw error;
    });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 1);
    await page.keyboard.press("Escape");
    assert.equal(await body.locator("img").count(), 2);
    checks++;
    assert.deepEqual(errors, []);
    console.log(`quote images: ${checks} groups passed (fragment cleanup / downloads / lazy / literal safety / nested quotes / themes / conversation viewer)`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
