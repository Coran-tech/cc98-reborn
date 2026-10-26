"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const actualCore = require("../src/content-filter-core.js");
const runtimeSource = fs.readFileSync(require.resolve("../src/content-filter.js"), "utf8");
const workerSource = fs.readFileSync(require.resolve("../src/content-filter-worker.js"), "utf8");
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
let checks = 0;

function fixture(options = {}) {
  let now = 1000, nextTimer = 0, settings = { enabled: true, blockedContentRules: "[]", blockedTitleKeywords: "" };
  const timers = new Map(), jobs = [], frames = [], events = [], listeners = new Map();
  const counts = { rebuild: 0, filtering: 0, conversation: 0, search: 0, evaluations: 0, virtual: 0 };
  const statusNode = { textContent: "" };
  const core = { ...actualCore, evaluate(rule, text, allowRegex, metrics) {
    counts.evaluations++;
    assert.equal(allowRegex, false, "content thread must never evaluate regex");
    return actualCore.evaluate(rule, text, allowRegex, metrics);
  } };
  class Channel {
    constructor() {
      this.port1 = { onmessage: null, closed: false, close() { this.closed = true; }, postMessage(message) { jobs.push({ message, port: this }); } };
      this.port2 = { parent: this.port1 };
    }
  }
  const document = {
    body: { append(frame) { frames.push(frame); frame.load(); } },
    querySelectorAll: () => [statusNode], dispatchEvent(event) { events.push(event.type); },
    createElement(type) {
      if (type === "template") return { innerHTML: "", content: { querySelectorAll: () => [], textContent: "" } };
      assert.equal(type, "iframe");
      return { removed: false, setAttribute() {}, addEventListener(type, fn) { assert.equal(type, "load"); this.load = fn; }, remove() { this.removed = true; }, contentWindow: { postMessage(message, target, ports) {
        assert.equal(message.type, "CC98_CONTENT_FILTER_CONNECT"); assert.equal(target, "*");
        if (options.ready !== false) ports[0].parent.onmessage({ data: { ready: true } });
      } } };
    },
    createTextNode: text => ({ textContent: text })
  };
  const context = {
    CC98RebornContentFilterCore: core, document, MessageChannel: Channel,
    location: { origin: "https://www.cc98.org", pathname: "/newTopics", search: "", hash: "" },
    setTimeout(fn, delay = 0) { const id = ++nextTimer; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { listeners.set(name, fn); },
    CustomEvent: class { constructor(type) { this.type = type; } },
    chrome: { runtime: { getURL: file => "chrome-extension://test/" + file } },
    scheduleRebuild: () => counts.rebuild++, scheduleFiltering: () => counts.filtering++,
    CC98RebornConversation: { refreshFilters: () => counts.conversation++ },
    CC98RebornTopicSearch: { refreshFilters: () => counts.search++ }
  };
  if (options.virtual) context.CC98RebornNewTopicsVirtual = { refresh() { counts.virtual++; return true; } };
  vm.runInNewContext(runtimeSource, context);
  const api = context.CC98RebornContentFilter;
  function sync(patch = {}) { settings = { ...settings, ...patch }; api.sync(settings); }
  function reply(index, result = {}) {
    const job = jobs[index]; assert.ok(job, "worker job exists");
    job.port.onmessage({ data: { id: job.message.id, index: -1, ...result } });
  }
  function runWorker(index) {
    const job = jobs[index]; assert.ok(job, "worker job exists");
    const worker = { importScripts() {}, CC98RebornContentFilterCore: actualCore, postMessage: value => reply(index, value) };
    vm.runInNewContext(workerSource, worker);
    worker.onmessage({ data: job.message });
  }
  async function advance(milliseconds) {
    const end = now + milliseconds;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); now = next[1].at; next[1].fn(); await flush();
    }
    now = end; await flush();
  }
  return { api, sync, jobs, frames, timers, counts, events, statusNode, reply, runWorker, advance,
    navigate(path) { const url = new URL(path, "https://www.cc98.org"); Object.assign(context.location, { origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash }); },
    pagehide() { listeners.get("pagehide")(); } };
}
async function check(name, operation) { await operation(); checks++; }

(async () => {
  await check("disabled and empty title rules never create workers", async () => {
    const f = fixture(); f.sync(); assert.equal(f.api.titleReason("anything"), "");
    f.sync({ enabled: false, blockedTitleKeywords: "/anything/" }); assert.equal(f.api.titleReason("anything"), "");
    await flush(); assert.equal(f.frames.length, 0); assert.equal(f.jobs.length, 0);
  });
  await check("plain keywords remain case insensitive substring matches", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "招聘,Ads; AND\n\"quoted\"" });
    assert.equal(f.api.titleReason("论坛招聘实习"), "标题：招聘");
    assert.equal(f.api.titleReason("new ADS today"), "标题：Ads");
    assert.equal(f.api.titleReason("A AND B"), "标题：AND");
    assert.equal(f.api.titleReason('literal "quoted" value'), '标题："quoted"');
    assert.equal(f.api.titleReason("quoted without quotes"), "");
    assert.equal(f.api.titleReason(""), ""); assert.equal(f.api.titleReason(null), "");
    assert.equal(f.jobs.length, 0);
  });
  await check("regex pending keeps the title visible and uses the existing worker protocol", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/^urgent/i" });
    for (let n = 0; n < 4; n++) assert.equal(f.api.titleReason("URGENT notice"), "");
    await flush(); assert.equal(f.jobs.length, 1); assert.equal(f.frames.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(f.jobs[0].message.rules)), ["/^urgent/i"]);
    f.runWorker(0); assert.equal(f.api.titleReason("URGENT notice"), "标题：/^urgent/i");
    await f.advance(40);
    assert.equal(f.counts.rebuild, 1); assert.equal(f.counts.filtering, 1); assert.equal(f.counts.conversation, 1); assert.equal(f.counts.search, 1);
    assert.deepEqual(f.events, ["cc98-content-rules-updated"]);
  });
  await check("regex commas semicolons escapes and flags survive transfer", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "ordinary,/a,b;c/i\n/foo\\/bar/u" });
    assert.equal(f.api.titleReason("A,B;C"), ""); await flush();
    assert.deepEqual(JSON.parse(JSON.stringify(f.jobs[0].message.rules)), ["/a,b;c/i", "/foo\\/bar/u"]);
    f.runWorker(0); assert.equal(f.api.titleReason("A,B;C"), "标题：/a,b;c/i");
  });
  await check("invalid title regex is skipped while later valid rules remain active", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/[/\nkeep\n/^good$/i" });
    assert.equal(f.api.titleReason("please keep this"), "标题：keep");
    assert.equal(f.api.titleReason("GOOD"), ""); await flush();
    assert.deepEqual(JSON.parse(JSON.stringify(f.jobs[0].message.rules)), ["/^good$/i"]);
    f.runWorker(0); assert.equal(f.api.titleReason("GOOD"), "标题：/^good$/i");
    assert.ok(f.api.errors().some(error => error.startsWith("标题规则：")));
  });
  await check("more than 50 ordinary keywords remain supported", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: Array.from({ length: 51 }, (_, index) => "unique-word-" + index + "!").join("\n") });
    assert.equal(f.api.titleReason("unique-word-50!"), "标题：unique-word-50!"); assert.equal(f.jobs.length, 0);
  });
  await check("only the first 50 regex rules are queued and later plain keywords survive", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: Array.from({ length: 51 }, (_, index) => "/^word" + index + "$/").concat("last-plain").join("\n") });
    assert.equal(f.api.titleReason("last-plain"), "标题：last-plain");
    assert.equal(f.api.titleReason("word50"), ""); await flush(); assert.equal(f.jobs[0].message.rules.length, 50);
    f.runWorker(0); assert.equal(f.api.titleReason("word50"), ""); assert.match(f.api.errors().join(" "), /50/);
  });
  await check("title and body caches cannot reuse each other's same-text decision", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/title/", blockedContentRules: JSON.stringify(["/never/"]) });
    assert.equal(f.api.titleReason("title"), ""); assert.equal(f.api.reason({ type: "post", text: "title" }), "正在检查内容规则");
    await flush(); assert.equal(f.jobs.length, 2); f.runWorker(0); f.runWorker(1);
    assert.equal(f.api.titleReason("title"), "标题：/title/"); assert.equal(f.api.reason({ type: "post", text: "title" }), "");
  });
  await check("body regex positive result never hides an unmatched same-text title", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/never/", blockedContentRules: JSON.stringify(["/body/"]) });
    f.api.reason({ type: "post", text: "body" }); f.api.titleReason("body"); await flush(); f.runWorker(0); f.runWorker(1);
    assert.equal(f.api.reason({ type: "post", text: "body" }), "内容规则：/body/"); assert.equal(f.api.titleReason("body"), "");
  });
  await check("changing only title settings cancels stale jobs and clears old title hits", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/old/" }); f.api.titleReason("old"); await flush();
    f.sync({ blockedTitleKeywords: "/new/" }); assert.equal(f.frames[0].removed, true); assert.equal(f.jobs[0].port.closed, true);
    f.reply(0, { index: 0 }); assert.equal(f.api.titleReason("old"), ""); await flush(); f.runWorker(1); assert.equal(f.api.titleReason("old"), "");
  });
  await check("disabling and pagehide tear down title workers and ignore late results", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/match/" }); f.api.titleReason("match"); await flush(); f.sync({ enabled: false });
    f.reply(0, { index: 0 }); assert.equal(f.api.titleReason("match"), ""); assert.equal(f.frames[0].removed, true);
    f.sync({ enabled: true }); f.api.titleReason("match"); await flush(); f.pagehide(); f.reply(1, { index: 0 });
    assert.equal(f.frames[1].removed, true); assert.equal(f.timers.size, 0);
  });
  await check("worker errors and timeouts never hide titles", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/(a+)+$/" });
    assert.equal(f.api.titleReason("a".repeat(9999) + "!"), ""); await flush();
    // Never execute this catastrophic pattern in the test process.
    f.reply(0, { index: 0, error: "正则运行超时，本次已跳过" });
    assert.equal(f.api.titleReason("a".repeat(9999) + "!"), ""); assert.match(f.api.errors().join(" "), /超时/);
    f.api.titleReason("different"); await flush(); await f.advance(15000);
    assert.equal(f.api.titleReason("different"), ""); assert.match(f.api.errors().join(" "), /标题规则检测等待超时/);
  });
  await check("bridge startup failure keeps the title visible", async () => {
    const f = fixture({ ready: false }); f.sync({ blockedTitleKeywords: "/foo/" }); f.api.titleReason("foo");
    await f.advance(8000); assert.equal(f.api.titleReason("foo"), ""); assert.equal(f.jobs.length, 0);
    assert.match(f.api.errors().join(" "), /未能启动/);
  });
  await check("title and settings lengths are bounded without repeated error rebuilds", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/x/" });
    assert.equal(f.api.titleReason("x".repeat(10001)), ""); await f.advance(40); const count = f.counts.rebuild;
    for (let n = 0; n < 10; n++) f.api.titleReason("x".repeat(10001));
    await f.advance(500); assert.equal(f.counts.rebuild, count); assert.equal(f.jobs.length, 0);
    f.sync({ blockedTitleKeywords: "x".repeat(100001) }); assert.equal(f.api.titleReason("x"), ""); assert.match(f.api.errors().join(" "), /100000/);
  });
  await check("shared worker queue is limited to 128 entries and title pressure is deferred", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/x/" });
    for (let n = 0; n < 140; n++) f.api.titleReason("title x " + n);
    await flush(); assert.equal(f.jobs.length, 128); assert.equal(f.api.status().deferredTitles, true);
    await f.advance(40); const count = f.counts.rebuild;
    for (let n = 0; n < 10; n++) f.api.titleReason("still full " + n);
    await f.advance(40); assert.equal(f.counts.rebuild, count);
  });
  await check("negative title completions do not rebuild or refresh visible lists", async () => {
    const f = fixture({ virtual: true }); f.sync({ blockedTitleKeywords: "/^blocked$/" });
    f.api.titleReason("ordinary title"); await flush(); f.runWorker(0); await f.advance(40);
    assert.equal(f.api.titleReason("ordinary title"), "");
    assert.equal(f.counts.rebuild, 0); assert.equal(f.counts.virtual, 0); assert.equal(f.counts.filtering, 0);
    assert.deepEqual(f.events, []);
  });
  await check("matching titles refresh the virtual feed without a full rebuild", async () => {
    const f = fixture({ virtual: true }); f.sync({ blockedTitleKeywords: "/^blocked$/" });
    assert.equal(f.api.titleReason("blocked"), ""); await flush(); f.runWorker(0); await f.advance(40);
    assert.equal(f.api.titleReason("blocked"), "标题：/^blocked$/");
    assert.equal(f.counts.rebuild, 0); assert.equal(f.counts.virtual, 1); assert.equal(f.counts.filtering, 1);
    assert.equal(f.counts.conversation, 1); assert.equal(f.counts.search, 1);
  });
  await check("body pending completion still updates the visible placeholder", async () => {
    const f = fixture(); f.sync({ blockedContentRules: JSON.stringify(["/^blocked$/"]) });
    assert.equal(f.api.reason({ type: "post", text: "ordinary body" }), "正在检查内容规则");
    await flush(); f.runWorker(0); await f.advance(40);
    assert.equal(f.api.reason({ type: "post", text: "ordinary body" }), "");
    assert.equal(f.counts.rebuild, 1); assert.equal(f.counts.filtering, 1);
  });
  await check("title errors update status without disturbing unchanged visible content", async () => {
    const f = fixture({ virtual: true }); f.sync({ blockedTitleKeywords: "/x/" });
    f.api.titleReason("ordinary title"); await flush(); f.reply(0, { index: -1, error: "正则运行超时" }); await f.advance(40);
    assert.equal(f.api.titleReason("ordinary title"), ""); assert.match(f.statusNode.textContent, /超时/);
    assert.equal(f.counts.rebuild, 0); assert.equal(f.counts.virtual, 0);
  });
  await check("a native 520-title scan completes once instead of rotating the 128-job queue", async () => {
    const f = fixture({ virtual: true }); f.sync({ blockedTitleKeywords: "/^never-match$/" });
    let completed = 0;
    for (let round = 0; round < 10; round++) {
      for (let index = 0; index < 520; index++) f.api.titleReason("ordinary synthetic title " + index);
      await flush();
      assert(f.api.status().pending <= 128);
      const end = f.jobs.length;
      for (let job = completed; job < end; job++) f.runWorker(job);
      completed = end; await f.advance(40);
    }
    assert.equal(f.jobs.length, 520); assert.equal(f.api.status().titleEntries, 520);
    assert.equal(f.api.status().pending, 0); assert(f.api.status().bytes <= 4 * 1024 * 1024);
    assert.equal(f.counts.rebuild, 0); assert.equal(f.counts.virtual, 0);
    assert(f.counts.filtering > 0, "backpressure progresses native scanning without refreshing visible cards");
  });
  await check("completed titles do not restart when a scan exceeds 1024 short titles", async () => {
    for (const size of [1025, 1200]) {
      const f = fixture({ virtual: true }); f.sync({ blockedTitleKeywords: "/^never-match$/" });
      let completed = 0;
      for (let round = 0; round < Math.ceil(size / 128) + 4; round++) {
        for (let index = 0; index < size; index++) f.api.titleReason("stable synthetic title " + index);
        await flush(); const end = f.jobs.length;
        assert(f.api.status().pending <= 128);
        for (let job = completed; job < end; job++) f.runWorker(job);
        completed = end; await f.advance(40);
      }
      assert.equal(f.jobs.length, size); assert.equal(f.api.status().titleEntries, size);
      assert.equal(f.counts.rebuild, 0); assert.equal(f.counts.virtual, 0);
      assert(f.api.status().bytes <= 4 * 1024 * 1024);
    }
  });
  await check("title byte pressure fails open without evicting and repeating completed decisions", async () => {
    const f = fixture({ virtual: true }); f.sync({ blockedTitleKeywords: "/^never-match$/" });
    const titles = Array.from({ length: 240 }, (_, index) => String(index).padStart(4, "0") + "x".repeat(9995));
    let completed = 0, stableJobs = 0;
    for (let round = 0; round < 7; round++) {
      for (const title of titles) assert.equal(f.api.titleReason(title), "");
      await flush(); const end = f.jobs.length;
      for (let job = completed; job < end; job++) f.runWorker(job);
      completed = end; await f.advance(40);
      if (round === 2) stableJobs = f.jobs.length;
      if (round > 2) assert.equal(f.jobs.length, stableJobs);
    }
    assert(stableJobs > 128 && stableJobs < titles.length);
    assert.equal(f.api.status().pending, 0); assert(f.api.status().bytes <= 4 * 1024 * 1024);
    assert.match(f.api.errors().join(" "), /缓存已满/);
    assert.equal(f.counts.rebuild, 0); assert.equal(f.counts.virtual, 0);
  });
  await check("leaving a title-heavy SPA route releases its budget for a 50k post body", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/^never-match$/", blockedContentRules: JSON.stringify(["/never-match/"]) });
    const titles = Array.from({ length: 240 }, (_, index) => String(index).padStart(4, "0") + "x".repeat(9995));
    let completed = 0;
    for (let round = 0; round < 3; round++) {
      for (const title of titles) f.api.titleReason(title);
      await flush(); const end = f.jobs.length;
      for (let job = completed; job < end; job++) f.runWorker(job);
      completed = end; await f.advance(40);
    }
    const body = { type: "post", text: "y".repeat(50000) };
    assert.equal(f.api.reason(body), "", "active title cache really occupies the needed byte budget");
    const jobsBefore = f.jobs.length;
    f.navigate("/topic/7000001");
    assert.equal(f.api.reason(body), "正在检查内容规则"); await flush();
    assert.equal(f.jobs.length, jobsBefore + 1); assert.equal(f.api.status().titleEntries, 0);
    assert(f.api.status().bytes < 110000, "old title cache is released without a global unbounded cache");
    f.runWorker(jobsBefore); assert.equal(f.api.reason(body), "");
  });
  await check("an old title reply cannot rebuild a new route before that route calls the runtime", async () => {
    const f = fixture({ virtual: true }); f.sync({ blockedTitleKeywords: "/match/" });
    f.api.titleReason("match"); await flush(); f.navigate("/topic/7000002");
    f.reply(0, { index: 0 }); await f.advance(40);
    assert.equal(f.api.status().titleEntries, 0); assert.equal(f.api.status().pending, 0);
    assert.equal(f.frames[0].removed, true); assert.equal(f.jobs[0].port.closed, true);
    assert.equal(f.counts.rebuild, 0); assert.equal(f.counts.virtual, 0); assert.equal(f.counts.filtering, 0);
  });
  await check("a title hit queued before navigation cannot rebuild the new route", async () => {
    const f = fixture({ virtual: true }); f.sync({ blockedTitleKeywords: "/match/" });
    f.api.titleReason("match"); await flush(); f.runWorker(0);
    f.navigate("/topic/7000003"); await f.advance(40);
    assert.equal(f.counts.rebuild, 0); assert.equal(f.counts.virtual, 0); assert.equal(f.counts.filtering, 0);
    assert.deepEqual(f.events, []); assert.equal(f.api.status().titleEntries, 0);
  });
  await check("navigation cancels old titles while preserving a shared pending body and its completion notification", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/match/", blockedContentRules: JSON.stringify(["/body/"]) });
    f.api.titleReason("match"); f.api.reason({ type: "post", text: "body" }); await flush();
    f.navigate("/topic/7000004"); f.reply(0, { index: 0 });
    assert.equal(f.api.status().pending, 1); assert.equal(f.frames[0].removed, true); assert.equal(f.jobs[1].port.closed, true);
    await flush(); assert.equal(f.jobs.length, 3); assert.equal(f.jobs[2].message.id, f.jobs[1].message.id);
    f.reply(1, { index: 0 }); assert.equal(f.api.status().pending, 1, "old bridge body response cannot complete the replayed body");
    f.runWorker(2); await f.advance(40);
    assert.equal(f.api.reason({ type: "post", text: "body" }), "内容规则：/body/");
    assert.equal(f.counts.rebuild, 1); assert.equal(f.counts.filtering, 1); assert.equal(f.api.status().titleEntries, 0);
  });
  await check("mixed route cancellation physically removes old title jobs before admitting another 128-job batch", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/match/", blockedContentRules: JSON.stringify(["/body/"]) });
    for (let index = 0; index < 127; index++) f.api.titleReason("match old " + index);
    f.api.reason({ type: "post", text: "body" }); await flush(); assert.equal(f.jobs.length, 128);
    const originalBodyId = f.jobs[127].message.id;
    await f.advance(1000); f.navigate("/topic/7000007");
    for (let index = 0; index < 127; index++) f.api.titleReason("match new " + index);
    await flush();
    assert.equal(f.api.status().pending, 128); assert.equal(f.frames.length, 2); assert.equal(f.frames[0].removed, true);
    assert.equal(f.jobs.filter(job => !job.port.closed).length, 128, "only one bounded bridge queue survives navigation");
    assert.equal(f.jobs[128].message.id, originalBodyId); assert.equal(f.jobs[128].message.text, "body");
    await f.advance(13999); assert.equal(f.api.status().pending, 128);
    await f.advance(1); assert.equal(f.api.status().pending, 127, "replaying a body does not extend its original deadline");
    assert.match(f.api.errors().join(" "), /内容规则检测等待超时/);
  });
  await check("navigation drops queued title refresh without losing a queued body completion", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/match/", blockedContentRules: JSON.stringify(["/body/"]) });
    f.api.titleReason("match"); f.api.reason({ type: "post", text: "body" }); await flush(); f.runWorker(0); f.runWorker(1);
    f.navigate("/topic/7000005"); await f.advance(40);
    assert.equal(f.counts.rebuild, 1); assert.equal(f.counts.filtering, 1); assert.equal(f.api.status().titleEntries, 0);
    assert.equal(f.api.reason({ type: "post", text: "body" }), "内容规则：/body/"); await flush(); assert.equal(f.jobs.length, 2);
  });
  await check("hash-only changes retain the current title scan and same-settings SPA sync releases a departed route", async () => {
    const f = fixture(); f.sync({ blockedTitleKeywords: "/match/" });
    f.api.titleReason("match"); await flush(); f.runWorker(0); await f.advance(40);
    f.navigate("/newTopics#position"); assert.equal(f.api.titleReason("match"), "标题：/match/"); await flush(); assert.equal(f.jobs.length, 1);
    f.navigate("/topic/7000006"); f.sync(); assert.equal(f.api.status().titleEntries, 0); assert.equal(f.frames[0].removed, true);
  });
  await check("shared cache refuses a single entry exceeding its byte budget", async () => {
    const f = fixture(); f.sync({ blockedContentRules: JSON.stringify(["/x/"]) });
    assert.equal(f.api.reason({ type: "post", text: "x".repeat(2100000) }), "");
    await flush(); assert.equal(f.jobs.length, 0); assert.equal(f.frames.length, 0);
    assert.match(f.api.errors().join(" "), /内容过长/);
  });
  await check("body text and numeric metrics preserve existing synchronous behavior", async () => {
    const f = fixture(); f.sync({ blockedContentRules: JSON.stringify(['"advert" AND 踩 > 5']) });
    assert.match(f.api.reason({ type: "post", text: "ADVERT", metrics: { dislikes: 6 } }), /^内容规则/);
    assert.equal(f.api.reason({ type: "post", text: "ADVERT", metrics: { dislikes: 2 } }), ""); assert.equal(f.jobs.length, 0);
  });
  console.log("title-filter: " + checks + " runtime isolation/cache/lifecycle checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
