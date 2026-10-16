"use strict";
const assert = require("node:assert/strict");
const rules = require("../src/semantic-filter-core.js");
const core = require("../src/semantic-background.js");
let checks = 0;
const extensionId = "njfhkgjkndlmegmocgdmlmkddifagafk";
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function event() { const listeners = []; return { addListener(fn) { listeners.push(fn); }, emit(...args) { for (const fn of listeners) fn(...args); } }; }
const forum = (values = {}) => ({ id: extensionId, url: "https://www.cc98.org/topic/6500000/1", tab: { id: 11, url: "https://www.cc98.org/topic/6500000/1" }, frameId: 0, documentId: "forum-document", ...values });
const ui = (values = {}) => ({ id: extensionId, url: "chrome-extension://" + extensionId + "/popup/semantic-settings.html", tab: { id: 11 }, frameId: 2, documentId: "settings-document", ...values });
function fixture(options = {}) {
  const events = { storage: event(), permissions: event(), tabs: event() }, calls = [], creations = [], scriptCalls = [];
  const data = {
    [core.SETTINGS_KEY]: { enabled: true, ...rules.DEFAULTS, semanticFilterEnabled: true, ...options.settings },
    ...(options.connected === false ? {} : { [core.CONNECTION_KEY]: { token: "private-test-token", connectedAt: 1 } })
  };
  let allowed = options.permission !== false, claim = options.claim !== false, clearCount = 0;
  let healthImpl = async () => ({ schemaVersion: 1, models: [{ id: "cold", revision: "test-revision" }] });
  let analyzeImpl = async input => ({ schemaVersion: 1, requestId: "service-id", results: [{ model: input.model, revision: "test-revision", task: "toxicity", toxicityScore: 0.9, labels: (input.topicLabels || ["offensive"]).map(label => ({ label, score: 0.9 })), elapsedMs: 1, truncated: false }] });
  const chrome = {
    runtime: { id: extensionId, getURL: name => "chrome-extension://" + extensionId + "/" + name },
    storage: { onChanged: events.storage, local: {
      async get(keys) { const result = {}; for (const key of typeof keys === "string" ? [keys] : keys) if (key in data) result[key] = clone(data[key]); return result; },
      async set(values) { const changes = {}; for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: clone(data[key]), newValue: clone(value) }; data[key] = clone(value); } events.storage.emit(changes, "local"); },
      async remove(key) { const oldValue = clone(data[key]); delete data[key]; events.storage.emit({ [key]: { oldValue } }, "local"); }
    } },
    permissions: { onRemoved: events.permissions, async contains(value) { assert.deepEqual(value, { origins: ["http://127.0.0.1/*"] }); return allowed; } },
    tabs: { onRemoved: events.tabs },
    scripting: { async executeScript(details) { scriptCalls.push(details.target); return [{ result: claim }]; } }
  };
  const clientCore = { createClient(settings) {
    creations.push(settings);
    return {
      async health(requestOptions) { calls.push({ kind: "health", signal: requestOptions?.signal }); return healthImpl(requestOptions); },
      async analyze(input, requestOptions) { calls.push({ kind: "analyze", input: clone(input), signal: requestOptions?.signal }); return analyzeImpl(input, requestOptions); },
      clearCache() { clearCount++; }
    };
  } };
  const background = core.createBackground({ chrome, filterCore: rules, clientCore, maxQueue: options.maxQueue || 64, now: () => 1000 });
  return { data, calls, creations, scriptCalls, chrome, events, handle: background.handle,
    get clearCount() { return clearCount; },
    setPermission(value) { allowed = value; events.permissions.emit({ origins: [core.LOCAL_ORIGIN_PERMISSION] }); },
    setClaim(value) { claim = value; },
    health(fn) { healthImpl = fn; }, analyze(fn) { analyzeImpl = fn; },
    async settings(patch) { await chrome.storage.local.set({ [core.SETTINGS_KEY]: { ...data[core.SETTINGS_KEY], ...patch } }); }
  };
}
const message = (type, values = {}) => ({ type: "CC98_SEMANTIC_" + type, ...values });
const analyze = (f, id, sender = forum(), values = {}) => f.handle(message("ANALYZE", { requestId: id, text: "ordinary sample", ...values }), sender);
async function tick() { await new Promise(resolve => setImmediate(resolve)); }
async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); } throw new Error("Test condition did not settle"); }
function hold(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { const error = new Error("Cancelled"); error.code = "ABORTED"; reject(error); };
    if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  });
}
async function check(name, fn) { await fn(); checks++; }

(async () => {
  await check("module startup and STATUS never create a client or request data", async () => {
    const f = fixture(); assert.equal(f.calls.length, 0); assert.equal(f.creations.length, 0);
    const value = await f.handle(message("STATUS"), ui());
    assert.equal(value.connected, true); assert.equal(value.permission, true); assert.equal(value.enabled, true);
    assert.equal(f.calls.length, 0); assert.equal(f.creations.length, 0); assert(!JSON.stringify(value).includes("private-test-token"));
  });
  await check("unrelated messages are left to the root router", async () => {
    assert.equal(await fixture().handle({ type: "OTHER_MESSAGE" }, {}), undefined);
  });
  for (const sender of [forum(), ui({ url: "data:text/html,example" }), ui({ id: "other-extension" }), ui({ url: "chrome-extension://" + extensionId + "/src/content-filter-frame.html" })]) {
    await check("CONNECT and DISCONNECT reject unauthorized senders", async () => {
      const f = fixture();
      assert.equal((await f.handle(message("CONNECT", { token: "new-private-token" }), sender)).error, "FORBIDDEN");
      assert.equal((await f.handle(message("DISCONNECT"), sender)).error, "FORBIDDEN"); assert.equal(f.calls.length, 0);
    });
  }
  await check("CONNECT validates explicit token and optional host permission", async () => {
    const f = fixture({ connected: false, permission: false });
    assert.equal((await f.handle(message("CONNECT", { token: "new-private-token" }), ui())).error, "PERMISSION_REQUIRED");
    assert.equal((await f.handle(message("CONNECT", { token: "has spaces" }), ui())).error, "INVALID_TOKEN");
    assert.equal(f.calls.length, 0); assert.equal(f.data[core.CONNECTION_KEY], undefined);
  });
  await check("CONNECT health-checks then persists only the separate connection key", async () => {
    const f = fixture({ connected: false }); const before = clone(f.data[core.SETTINGS_KEY]);
    const value = await f.handle(message("CONNECT", { token: "new-private-token" }), ui());
    assert.equal(value.ok, true); assert.equal(value.connected, true); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].kind, "health");
    assert.equal(f.data[core.CONNECTION_KEY].token, "new-private-token"); assert.deepEqual(f.data[core.SETTINGS_KEY], before);
    assert.equal(f.creations[0].timeoutMs, 60000); assert(!JSON.stringify(value).includes("new-private-token"));
    assert.equal(f.data[core.STATE_KEY].connected, true); assert(!JSON.stringify(f.data[core.STATE_KEY]).includes("token"));
  });
  await check("CONNECT failure never persists an unverified token or raw error", async () => {
    const f = fixture({ connected: false }); f.health(async () => { const error = new Error("private body and token"); error.code = "HTTP_ERROR"; error.httpStatus = 401; throw error; });
    const value = await f.handle(message("CONNECT", { token: "new-private-token" }), ui());
    assert.equal(value.error, "BAD_TOKEN"); assert.equal(f.data[core.CONNECTION_KEY], undefined); assert(!JSON.stringify(value).includes("private"));
  });
  await check("DISCONNECT removes token, clears client cache and publishes safe state", async () => {
    const f = fixture(); await analyze(f, "first");
    const value = await f.handle(message("DISCONNECT"), ui());
    assert.equal(value.ok, true); assert.equal(value.connected, false); assert.equal(f.data[core.CONNECTION_KEY], undefined);
    assert.equal(f.data[core.STATE_KEY].connected, false); assert(f.clearCount > 0);
    const count = f.calls.length; assert.equal((await analyze(f, "second")).error, "NOT_CONNECTED"); assert.equal(f.calls.length, count);
  });
  for (const options of [{ settings: { enabled: false } }, { settings: { enabled: "true" } }, { settings: { semanticFilterEnabled: false } }, { permission: false }, { connected: false }, { settings: { semanticFilterThreshold: "invalid" } }]) {
    await check("disabled or unconnected analysis fails open before creating a client", async () => {
      const f = fixture(options); const value = await analyze(f, "disabled"); assert.equal(value.ok, false); assert.equal(f.calls.length, 0); assert.equal(f.creations.length, 0);
    });
  }
  for (const sender of [forum({ id: "other-extension" }), forum({ url: "https://untrusted.example/topic/1" }), forum({ tab: undefined }), forum({ url: "https://www.cc98.org.evil.example/" })]) {
    await check("forum analysis rejects spoofed sender identity or URL", async () => {
      const f = fixture(); assert.equal((await analyze(f, "invalid-sender", sender)).error, "FORBIDDEN"); assert.equal(f.calls.length, 0);
    });
  }
  await check("analysis ignores webpage model, threshold and service URL", async () => {
    const f = fixture(); const value = await analyze(f, "first", forum(), { model: "minilm", threshold: 0, url: "https://untrusted.example/", token: "injected-token" });
    assert.equal(value.ok, true); assert.equal(value.requestId, "first"); assert.equal(value.configSignature, rules.signature(f.data[core.SETTINGS_KEY]));
    assert.deepEqual(f.calls[0].input, { text: "ordinary sample", model: "cold" });
    assert.equal(f.creations[0].token, "private-test-token"); assert(!JSON.stringify(value).includes("private-test-token"));
  });
  await check("MiniLM uses saved labels/template and independent multi-label mode", async () => {
    const f = fixture({ settings: { semanticFilterModel: "minilm" } }); await analyze(f, "nli");
    const input = f.calls[0].input;
    assert.deepEqual(input.topicLabels, rules.DEFAULTS.semanticFilterLabels.split("\n")); assert.equal(input.hypothesisTemplate, rules.DEFAULTS.semanticFilterHypothesisTemplate); assert.equal(input.multiLabel, true);
  });
  await check("TEST is explicit extension-only and works with experimental switch off", async () => {
    const f = fixture({ settings: { semanticFilterEnabled: false } });
    assert.equal((await f.handle(message("TEST", { requestId: "manual", text: "handwritten sample" }), ui())).ok, true);
    assert.equal(f.data[core.SETTINGS_KEY].semanticFilterEnabled, false);
    assert.equal((await f.handle(message("TEST", { requestId: "forbidden", text: "sample" }), forum())).error, "FORBIDDEN");
    await f.settings({ enabled: false }); const count = f.calls.length;
    assert.equal((await f.handle(message("TEST", { requestId: "disabled", text: "sample" }), ui())).error, "DISABLED"); assert.equal(f.calls.length, count);
  });
  await check("marked topic drawer documents can analyze without trusting arbitrary frames", async () => {
    const f = fixture(); const sender = forum({ frameId: 3, documentId: "drawer-document" });
    assert.equal((await analyze(f, "drawer1", sender)).ok, true); assert.equal((await analyze(f, "drawer2", sender)).ok, true);
    assert.equal(f.scriptCalls.length, 1); assert.deepEqual(f.scriptCalls[0], { tabId: 11, documentIds: ["drawer-document"] });
    const rejected = fixture({ claim: false }); assert.equal((await analyze(rejected, "hidden-frame", sender)).error, "FORBIDDEN"); assert.equal(rejected.calls.length, 0);
  });
  await check("drawer sender requires matching parent origin and document identity", async () => {
    for (const sender of [forum({ frameId: 3, documentId: undefined }), forum({ frameId: 3, tab: { id: 11, url: "https://cc98.org/" } }), forum({ frameId: 3, url: "https://www.cc98.org/board/1" })]) {
      const f = fixture(); assert.equal((await analyze(f, "invalid-frame", sender)).error, "FORBIDDEN"); assert.equal(f.calls.length, 0);
    }
  });
  await check("invalid request IDs and oversized/blank text never reach inference", async () => {
    for (const values of [{ requestId: "bad id" }, { text: "" }, { text: "x".repeat(10001) }]) {
      const f = fixture(); assert.equal((await analyze(f, "valid", forum(), values)).error, "INVALID_INPUT"); assert.equal(f.calls.length, 0);
    }
  });
  await check("global queue is serial and bounded", async () => {
    const f = fixture({ maxQueue: 2 }); let complete;
    f.analyze((input, settings) => new Promise(resolve => { complete = resolve; }));
    const first = analyze(f, "one"), second = analyze(f, "two");
    await until(() => f.calls.length === 1);
    assert.equal((await analyze(f, "three")).error, "BUSY"); assert.equal(f.calls.length, 1);
    complete({ schemaVersion: 1, results: [{ model: "cold" }] }); assert.equal((await first).ok, true);
    await until(() => f.calls.length === 2); complete({ schemaVersion: 1, results: [{ model: "cold" }] }); assert.equal((await second).ok, true);
  });
  await check("cancellation is isolated by tab, frame, document and request ID", async () => {
    const f = fixture(); f.analyze((input, settings) => hold(settings.signal));
    const original = forum(), pending = analyze(f, "same-id", original); await until(() => f.calls.length === 1);
    for (const sender of [forum({ documentId: "another-document" }), forum({ frameId: 9 }), forum({ tab: { id: 99, url: original.url } })]) {
      assert.equal((await f.handle(message("CANCEL", { requestId: "same-id" }), sender)).cancelled, false);
    }
    assert.equal(f.calls[0].signal.aborted, false);
    assert.equal((await f.handle(message("CANCEL", { requestId: "same-id" }), original)).cancelled, true);
    assert.equal((await pending).error, "CANCELLED"); assert.equal(f.calls[0].signal.aborted, true);
  });
  await check("queued jobs can be cancelled without entering the SDK", async () => {
    const f = fixture(); f.analyze((input, settings) => hold(settings.signal));
    const first = analyze(f, "first"), second = analyze(f, "second"); await until(() => f.calls.length === 1);
    assert.equal((await f.handle(message("CANCEL", { requestId: "second" }), forum())).cancelled, true);
    assert.equal((await second).error, "CANCELLED"); assert.equal(f.calls.length, 1);
    await f.handle(message("CANCEL", { requestId: "first" }), forum()); await first;
  });
  await check("duplicate IDs cannot replace an existing owner job", async () => {
    const f = fixture(); f.analyze((input, settings) => hold(settings.signal)); const first = analyze(f, "duplicate"); await until(() => f.calls.length === 1);
    assert.equal((await analyze(f, "duplicate")).error, "DUPLICATE_REQUEST");
    await f.handle(message("CANCEL", { requestId: "duplicate" }), forum()); await first;
  });
  for (const patch of [{ semanticFilterEnabled: false }, { enabled: false }, { semanticFilterThreshold: 0.9 }]) {
    await check("settings changes abort old work and discard stale results", async () => {
      const f = fixture(); f.analyze((input, settings) => hold(settings.signal)); const pending = analyze(f, "stale"); await until(() => f.calls.length === 1);
      await f.settings(patch); assert.equal((await pending).error, "STALE_SETTINGS"); assert.equal(f.calls[0].signal.aborted, true); assert(f.clearCount > 0);
    });
  }
  await check("unrelated theme changes keep valid inference running", async () => {
    const f = fixture(); let complete; f.analyze(() => new Promise(resolve => { complete = resolve; }));
    const pending = analyze(f, "theme"); await until(() => f.calls.length === 1); await f.settings({ themeMode: "dark" });
    assert.equal(f.calls[0].signal.aborted, false); complete({ schemaVersion: 1, results: [{ model: "cold" }] }); assert.equal((await pending).ok, true);
  });
  await check("permission revoke aborts work and publishes a new disconnected epoch", async () => {
    const f = fixture(); f.analyze((input, settings) => hold(settings.signal)); const pending = analyze(f, "revoked"); await until(() => f.calls.length === 1);
    f.setPermission(false); assert.equal((await pending).error, "PERMISSION_REQUIRED");
    await until(() => f.data[core.STATE_KEY]?.connected === false); assert.equal(f.calls[0].signal.aborted, true);
    assert(!JSON.stringify(f.data[core.STATE_KEY]).includes("token")); assert.equal((await analyze(f, "after-revoke")).error, "PERMISSION_REQUIRED");
  });
  await check("disconnect aborts active and queued work", async () => {
    const f = fixture(); f.analyze((input, settings) => hold(settings.signal));
    const first = analyze(f, "one"), second = analyze(f, "two"); await until(() => f.calls.length === 1);
    await f.handle(message("DISCONNECT"), ui()); assert.equal((await first).error, "DISCONNECTED"); assert.equal((await second).error, "DISCONNECTED");
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].signal.aborted, true);
  });
  await check("external connection removal restores visibility through a safe state epoch", async () => {
    const f = fixture(); await analyze(f, "initial");
    await f.chrome.storage.local.remove(core.CONNECTION_KEY); await until(() => f.data[core.STATE_KEY]?.connected === false);
    assert.equal((await f.handle(message("STATUS"), ui())).connected, false);
  });
  await check("tab closure cancels only that tab's jobs", async () => {
    const f = fixture(); f.analyze((input, settings) => hold(settings.signal)); const pending = analyze(f, "closed"); await until(() => f.calls.length === 1);
    f.events.tabs.emit(99); assert.equal(f.calls[0].signal.aborted, false);
    f.events.tabs.emit(11); assert.equal((await pending).error, "CANCELLED"); assert.equal(f.calls[0].signal.aborted, true);
  });
  await check("transport errors return only stable fail-open codes", async () => {
    const f = fixture(); f.analyze(async () => { const error = new Error("private sample and secret token"); error.code = "TIMEOUT"; throw error; });
    const value = await analyze(f, "timeout"); assert.equal(value.error, "TIMEOUT"); assert(!JSON.stringify(value).includes("private"));
  });
  console.log("Semantic background: " + checks + " checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
