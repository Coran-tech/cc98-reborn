"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const core = require("../src/semantic-filter-core.js");
const source = fs.readFileSync(require.resolve("../src/semantic-filter.js"), "utf8");
let checks = 0;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function fixture() {
  let now = 1000, timerId = 0, account = "42", config = { enabled: true, ...core.DEFAULTS };
  const timers = new Map(), listeners = new Map(), documentListeners = new Map();
  const calls = [], waiting = new Map(), events = [], storageListeners = [], counts = { rebuild: 0, filtering: 0, conversation: 0, search: 0, ownText: 0 };
  const statusNode = { textContent: "" };
  const listen = map => (name, fn) => { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); };
  const emit = (map, name) => { for (const fn of map.get(name) || []) fn({ type: name }); };
  const document = { visibilityState: "visible", addEventListener: listen(documentListeners), querySelectorAll: () => [statusNode], dispatchEvent(event) { events.push(event.type); emit(documentListeners, event.type); } };
  const location = { origin: "https://www.cc98.org", pathname: "/topic/123/1", search: "", hash: "" };
  const context = {
    TextEncoder, Uint8Array, Uint32Array, DataView,
    Date: class extends Date { static now() { return now; } },
    crypto: { randomUUID: () => "test-document-1" },
    setTimeout(fn, delay = 0) { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); }, document, location,
    addEventListener: listen(listeners), CustomEvent: class { constructor(type) { this.type = type; } },
    CC98RebornSemanticFilterCore: core,
    CC98RebornContentFilter: { ownText(item) { counts.ownText++; return item.ownText ?? item.text ?? ""; } },
    getCurrentCc98WebAccount: () => ({ userId: account }),
    scheduleRebuild: () => counts.rebuild++, scheduleFiltering: () => counts.filtering++,
    CC98RebornConversation: { refreshFilters: () => counts.conversation++ },
    CC98RebornTopicSearch: { refreshFilters: () => counts.search++ },
    chrome: { storage: { onChanged: { addListener(callback) { storageListeners.push(callback); } } }, runtime: { lastError: null, sendMessage(message, callback) { calls.push(message); if (message.type === "CC98_SEMANTIC_CANCEL") callback({ ok: true }); else waiting.set(message.requestId, callback); } } }
  };
  vm.runInNewContext(source, context);
  const api = context.CC98RebornSemanticFilter;
  function sync(patch = {}) { config = { ...config, ...patch }; api.sync(config); }
  const analyzed = () => calls.filter(message => message.type === "CC98_SEMANTIC_ANALYZE");
  function respond(index, overrides = {}) {
    const message = analyzed()[index]; assert.ok(message, "analysis request exists");
    const callback = waiting.get(message.requestId); assert.ok(callback, "analysis callback exists");
    waiting.delete(message.requestId);
    const model = config.semanticFilterModel;
    callback({ ok: true, requestId: message.requestId, configSignature: core.signature(config), result: { schemaVersion: 1, requestId: "service-request", results: [{ model, revision: "pinned-test-revision", elapsedMs: 10, truncated: false, toxicityScore: 0.9, labels: [{ label: "人身攻击", score: 0.9 }], ...overrides.modelResult }] }, ...overrides.response });
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
  return { api, counts, calls, analyzed, events, statusNode, context, sync, respond, advance, setAccount(value) { account = value; }, navigate(path) { location.pathname = path; emit(listeners, "popstate"); }, visibility(value) { document.visibilityState = value; emit(documentListeners, "visibilitychange"); }, windowEvent(name) { emit(listeners, name); }, storage(changes, area = "local") { for (const listener of storageListeners) listener(changes, area); }, timers };
}
async function check(name, operation) { await operation(); checks++; }
const post = (text = "synthetic body") => ({ type: "post", text });

(async () => {
  await check("off and global off send zero requests and do not extract text", async () => {
    const f = fixture(); f.sync(); assert.equal(f.api.reason(post()), "");
    f.sync({ semanticFilterEnabled: true, enabled: false }); assert.equal(f.api.reason(post()), "");
    assert.equal(f.calls.length, 0); assert.equal(f.counts.ownText, 0);
  });
  await check("only posts and explicit post records use shared own-text extraction", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true });
    for (const item of [null, "bad", { type: "topic", text: "topic title" }, post("   ")]) assert.equal(f.api.reason(item), "");
    f.api.reason({ type: "record", contentHtml: "quote and signature", ownText: "actual own body [ac01]" }, true);
    assert.equal(f.analyzed().length, 1); assert.equal(f.analyzed()[0].text, "actual own body [ac01]");
    assert.deepEqual(Object.keys(f.analyzed()[0]).sort(), ["requestId", "text", "type"]);
  });
  await check("pending remains visible and duplicate bodies share one request", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); const item = post();
    for (let n = 0; n < 5; n++) assert.equal(f.api.reason(item), "");
    assert.equal(f.api.reason(post()), ""); assert.equal(f.analyzed().length, 1);
    assert.equal(f.api.status().pending, 1); assert.equal(f.counts.rebuild, 0);
  });
  await check("completed hit returns reason synchronously and batches all refresh hooks", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true });
    f.api.reason(post("one")); f.api.reason(post("two"));
    f.respond(0); await flush(); f.respond(1); await flush();
    assert.match(f.api.reason(post("one")), /语义规则/); assert.match(f.api.reason(post("two")), /语义规则/);
    assert.equal(f.counts.rebuild, 0); await f.advance(250);
    assert.equal(f.counts.rebuild, 1); assert.equal(f.counts.filtering, 1); assert.equal(f.counts.conversation, 1); assert.equal(f.counts.search, 1);
    assert.deepEqual(f.events, ["cc98-content-rules-updated"]);
    assert.equal(f.analyzed().length, 2);
  });
  await check("negative results and status-only errors never rebuild the page", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true });
    f.api.reason(post()); f.respond(0, { modelResult: { toxicityScore: 0.1 } }); await flush(); await f.advance(1000);
    assert.equal(f.api.reason(post()), ""); assert.equal(f.counts.rebuild, 0); assert.equal(f.analyzed().length, 1);
  });
  await check("overlong body is skipped without silently clipping it", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true });
    assert.equal(f.api.reason(post("x".repeat(10001))), ""); assert.equal(f.analyzed().length, 0);
    await f.advance(40); assert.match(f.statusNode.textContent, /10000/); assert.equal(f.counts.rebuild, 0);
    f.api.reason(post("x".repeat(10000))); assert.equal(f.analyzed()[0].text.length, 10000);
  });
  await check("token-truncated model result cannot fold even with a high score", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true });
    f.api.reason(post()); f.respond(0, { modelResult: { truncated: true, toxicityScore: 1 } }); await flush(); await f.advance(250);
    assert.equal(f.api.reason(post()), ""); assert.match(f.api.errors().join(" "), /token/); assert.equal(f.counts.rebuild, 0);
  });
  await check("queue is serial and bounded to 32 bodies", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true });
    for (let n = 0; n < 50; n++) f.api.reason(post("body " + n));
    assert.equal(f.analyzed().length, 1); assert.equal(f.api.status().queued, 31); assert.match(f.api.errors().join(" "), /等待/);
    f.respond(0, { modelResult: { toxicityScore: 0 } }); await flush();
    assert.equal(f.analyzed().length, 2); assert.equal(f.api.status().queued, 30);
  });
  await check("connection failure drops the queue and opens an exponential circuit breaker", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true });
    f.api.reason(post("one")); f.api.reason(post("two"));
    f.respond(0, { response: { ok: false, error: "NETWORK_ERROR" } }); await flush();
    for (let n = 0; n < 100; n++) f.api.reason(post("after error " + n));
    assert.equal(f.analyzed().length, 1); assert.equal(f.api.status().queued, 0); assert.equal(f.api.status().nextRetryAt, 31000);
    await f.advance(30000); f.api.reason(post("one")); assert.equal(f.analyzed().length, 2);
    f.respond(1, { response: { ok: false, error: "NETWORK_ERROR" } }); await flush();
    assert.equal(f.api.status().nextRetryAt, 91000); assert.equal(f.counts.rebuild, 0);
  });
  await check("timeout cancels active work and fails open", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); f.api.reason(post());
    await f.advance(65000); assert.equal(f.api.reason(post()), "");
    assert.equal(f.calls.filter(item => item.type === "CC98_SEMANTIC_CANCEL").length, 1);
    assert.match(f.api.errors().join(" "), /超时/); assert.equal(f.counts.rebuild, 0);
  });
  await check("configuration changes cancel and discard late replies", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); f.api.reason(post());
    f.sync({ semanticFilterThreshold: 0.95 }); f.respond(0); await flush();
    assert.equal(f.api.reason(post()), ""); assert.equal(f.analyzed().length, 2);
    assert.equal(f.calls.filter(item => item.type === "CC98_SEMANTIC_CANCEL").length, 1);
    f.respond(1); await flush(); await f.advance(300); assert.equal(f.counts.rebuild, 0);
  });
  await check("background signature mismatch is never applied", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); f.api.reason(post());
    f.respond(0, { response: { configSignature: "old-config" } }); await flush();
    assert.equal(f.api.reason(post()), ""); assert.match(f.api.errors().join(" "), /变化/);
  });
  await check("switching accounts cancels active work and clears previous matches", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); f.api.reason(post("match")); f.respond(0); await flush();
    f.api.reason(post("pending")); f.setAccount("99"); await f.advance(500);
    assert.equal(f.api.status().pending, 0); assert.equal(f.api.reason(post("match")), ""); assert.equal(f.analyzed().length, 3);
    f.respond(1); await flush(); assert.equal(f.api.reason(post("pending")), "");
  });
  await check("same-topic pagination cancels pending but preserves completed digest cache", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); f.api.reason(post("match")); f.respond(0); await flush();
    f.api.reason(post("pending")); f.navigate("/topic/123/2");
    assert.match(f.api.reason(post("match")), /语义规则/); assert.equal(f.analyzed().length, 2);
    f.respond(1); await flush(); assert.equal(f.api.reason(post("pending")), ""); assert.equal(f.analyzed().length, 3);
  });
  await check("global disable restores matched posts and cancels pending work", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); f.api.reason(post("match")); f.respond(0); await flush(); await f.advance(250);
    f.api.reason(post("pending")); f.sync({ enabled: false });
    assert.equal(f.api.reason(post("match")), ""); f.respond(1); await flush(); await f.advance(250);
    assert.equal(f.counts.rebuild, 2); assert.equal(f.api.status().pending, 0);
  });
  await check("hidden pages cancel then resume on visibility and BFCache pageshow", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); f.api.reason(post()); f.visibility("hidden");
    assert.equal(f.api.status().paused, true); assert.equal(f.api.reason(post()), ""); f.respond(0); await flush();
    f.visibility("visible"); await f.advance(250); assert.equal(f.api.status().paused, false); assert.equal(f.counts.rebuild, 1);
    f.api.reason(post()); assert.equal(f.analyzed().length, 2); f.windowEvent("pagehide"); assert.equal(f.api.status().paused, true);
    f.windowEvent("pageshow"); await f.advance(250); assert.equal(f.api.status().paused, false); assert.equal(f.counts.rebuild, 2);
  });
  await check("cache expires without idle polling or rebuild loops", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); f.api.reason(post()); f.respond(0, { modelResult: { toxicityScore: 0 } }); await flush();
    await f.advance(300001); assert.equal(f.timers.size, 0); assert.equal(f.counts.rebuild, 0);
    f.api.reason(post()); assert.equal(f.analyzed().length, 2);
  });
  await check("disconnect and permission state epochs restore matched content without reading tokens", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); f.api.reason(post("matched")); f.respond(0); await flush(); await f.advance(250);
    const changes = {};
    Object.defineProperty(changes, "cc98RebornSemanticConnection:v1", { enumerable: true, get() { throw new Error("must never inspect the token change value"); } });
    f.storage(changes); assert.equal(f.api.status().cacheEntries, 0); await f.advance(250); assert.equal(f.counts.rebuild, 2);
    assert.equal(f.api.reason(post("matched")), ""); f.respond(1); await flush(); await f.advance(250);
    f.storage({ "cc98RebornSemanticState:v1": { newValue: { epoch: "changed", connected: false } } });
    await f.advance(250); assert.equal(f.api.status().cacheEntries, 0); assert.equal(f.counts.rebuild, 4);
  });
  await check("connection changes cancel old jobs, reset failed cache, and ignore unrelated storage", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true }); f.api.reason(post());
    f.storage({ unrelated: {} }); assert.equal(f.api.status().pending, 1);
    f.storage({ "cc98RebornSemanticState:v1": {} }, "sync"); assert.equal(f.api.status().pending, 1);
    f.storage({ "cc98RebornSemanticState:v1": {} }); assert.equal(f.api.status().pending, 0);
    f.respond(0); await flush(); assert.equal(f.api.reason(post()), ""); assert.equal(f.analyzed().length, 2);
    f.respond(1, { response: { ok: false, error: "NOT_CONNECTED" } }); await flush(); assert.ok(f.api.status().nextRetryAt > 0);
    f.storage({ "cc98RebornSemanticState:v1": {} }); assert.equal(f.api.status().nextRetryAt, 0);
    assert.equal(f.api.reason(post()), ""); assert.equal(f.analyzed().length, 3);
  });
  await check("completed cache is bounded and never repeats original text in status", async () => {
    const f = fixture(); f.sync({ semanticFilterEnabled: true });
    for (let n = 0; n < 280; n++) { f.api.reason(post("private synthetic body " + n)); f.respond(n, { modelResult: { toxicityScore: 0 } }); await flush(); }
    assert.equal(f.api.status().cacheEntries, 256); assert.doesNotMatch(JSON.stringify(f.api.status()), /private synthetic/);
    assert.equal(f.counts.rebuild, 0);
  });
  await check("SHA-256 cache digest matches standard vectors without exposing post bodies", async () => {
    // Expose only the lexical helper in this isolated test copy, never the runtime API.
    const instrumented = source.replace("globalThis.CC98RebornSemanticFilter = { sync", "globalThis.__testDigest = digest; globalThis.CC98RebornSemanticFilter = { sync");
    const f = fixture(); vm.runInNewContext(instrumented, f.context);
    for (const text of ["", "abc", "中英文与表情[ac01]😀", "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(10000)]) {
      assert.equal(f.context.__testDigest(text), createHash("sha256").update(text).digest("hex"));
    }
  });
  console.log("semantic-filter: " + checks + " content-side queue/cache/lifecycle checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
