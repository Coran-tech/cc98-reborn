"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const core = require("../src/semantic-client.js");
let checks = 0;
const token = "local-test-token";
const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const result = (model = "cold", revision = "revision-a", overrides = {}) => ({
  schemaVersion: 1, requestId: "request-1", results: [{
    model, revision, task: model === "minilm" ? "topic-classification" : "toxicity",
    labels: [{ label: "offensive", score: 0.75 }], toxicityScore: 0.75,
    elapsedMs: 12, truncated: false, ...overrides
  }]
});
function fixture(options = {}) {
  const calls = [];
  let responder = async (url, request) => url.endsWith("/health")
    ? json({ schemaVersion: 1, status: "ready", models: [{ id: "cold", revision: "revision-a" }] })
    : json(result(JSON.parse(request.body).models[0]));
  const client = core.createClient({
    token, crypto: webcrypto, fetch: async (url, request) => { calls.push({ url, request }); return responder(url, request); }, ...options
  });
  return { client, calls, respond(fn) { responder = fn; } };
}
async function check(name, fn) {
  await fn(); checks++;
}
async function rejected(promise, code) {
  await assert.rejects(promise, error => error instanceof core.SemanticClientError && error.code === code);
}

(async () => {
  await check("creating the module and client makes zero requests", async () => {
    let calls = 0;
    const context = { fetch() { calls++; }, setTimeout, clearTimeout };
    vm.runInNewContext(fs.readFileSync(require.resolve("../src/semantic-client.js"), "utf8"), context);
    assert.equal(typeof context.CC98RebornSemanticClient.createClient, "function");
    const f = fixture(); assert.equal(f.calls.length, 0); assert.equal(calls, 0);
    assert.deepEqual(Object.keys(f.client), ["health", "analyze", "clearCache"]);
  });
  await check("service address cannot be customized", async () => {
    for (const key of ["url", "baseUrl", "baseURL", "endpoint", "origin"]) {
      assert.throws(() => fixture({ [key]: "http://example.com/" }), error => error.code === "INVALID_OPTIONS");
    }
  });
  await check("invalid adapter options are rejected", async () => {
    for (const options of [{ fetch: false }, { timeoutMs: 0 }, { timeoutMs: 60001 }, { cacheTtlMs: -1 }, { maxCacheEntries: 257 }, { maxPending: 0 }, { now: 42 }]) {
      assert.throws(() => fixture(options), error => error.code === "INVALID_OPTIONS");
    }
  });
  await check("explicit health uses fixed origin and defensive fetch options", async () => {
    const f = fixture(); const value = await f.client.health();
    assert.equal(value.schemaVersion, 1); assert.equal(f.calls.length, 1);
    const { url, request } = f.calls[0];
    assert.equal(url, "http://127.0.0.1:8766/api/v1/health"); assert.equal(request.method, "GET");
    assert.equal(request.headers.Authorization, "Bearer " + token); assert.equal(request.body, undefined);
    assert.equal(request.redirect, "error"); assert.equal(request.credentials, "omit");
    assert.equal(request.cache, "no-store"); assert.equal(request.referrerPolicy, "no-referrer");
  });
  await check("analyze sends only the documented body", async () => {
    const f = fixture(); await f.client.analyze({ text: "example text", model: "cold", url: "https://example.com/" });
    assert.equal(f.calls[0].url, "http://127.0.0.1:8766/api/v1/evaluate");
    assert.deepEqual(JSON.parse(f.calls[0].request.body), { schemaVersion: 1, text: "example text", models: ["cold"], topicLabels: [] });
    assert.equal(f.calls[0].request.method, "POST"); assert.equal(f.calls[0].request.headers["Content-Type"], "application/json");
  });
  for (const model of ["cold", "horizon", "minilm"]) await check("supports model " + model, async () => {
    const f = fixture(); const value = await f.client.analyze({ text: "text", model, ...(model === "minilm" ? { topicLabels: ["insult", "discussion"] } : {}) });
    assert.equal(value.results[0].model, model);
  });
  for (const missing of [undefined, "", "bad\r\ntoken", "has spaces", 42]) await check("invalid token never calls fetch: " + String(missing), async () => {
    const f = fixture({ token: missing });
    await rejected(f.client.analyze({ text: "text", model: "cold" }), "AUTH_REQUIRED");
    await rejected(f.client.health(), "AUTH_REQUIRED"); assert.equal(f.calls.length, 0);
  });
  for (const input of [null, {}, { text: "", model: "cold" }, { text: " \n\t", model: "cold" }, { text: "x".repeat(10001), model: "cold" }, { text: "text", model: "remote" }]) {
    await check("invalid text or model", async () => {
      const f = fixture(); await rejected(f.client.analyze(input), "INVALID_INPUT"); assert.equal(f.calls.length, 0);
    });
  }
  await check("maximum text length is accepted", async () => {
    const f = fixture(); await f.client.analyze({ text: "x".repeat(10000), model: "cold" }); assert.equal(f.calls.length, 1);
  });
  for (const topicLabels of [undefined, [], ["one"], Array.from({ length: 13 }, (_, n) => "label-" + n), ["one", "x".repeat(61)], ["one", " "], ["one", 2], ["One", " one "]]) {
    await check("invalid topic label configuration", async () => {
      const f = fixture(); await rejected(f.client.analyze({ text: "text", model: "minilm", topicLabels }), "INVALID_INPUT"); assert.equal(f.calls.length, 0);
    });
  }
  await check("topic labels are trimmed with 12 labels supported", async () => {
    const f = fixture(); await f.client.analyze({ text: "text", model: "minilm", topicLabels: Array.from({ length: 12 }, (_, n) => " label-" + n + " ") });
    assert.equal(JSON.parse(f.calls[0].request.body).topicLabels[0], "label-0");
  });
  await check("optional NLI template and multi-label mode are forwarded", async () => {
    const f = fixture(); const input = { text: "text", model: "minilm", topicLabels: ["one", "two"], hypothesisTemplate: "This example concerns {}.", multiLabel: false };
    f.respond(async () => json(result("minilm", "revision-a", { hypothesisTemplate: input.hypothesisTemplate, multiLabel: false, scoreType: "exclusive-nli-entailment", topicLabels: input.topicLabels })));
    const value = await f.client.analyze(input);
    assert.deepEqual(JSON.parse(f.calls[0].request.body), { schemaVersion: 1, text: input.text, models: ["minilm"], topicLabels: input.topicLabels, hypothesisTemplate: input.hypothesisTemplate, multiLabel: false });
    assert.equal(value.results[0].multiLabel, false); assert.equal(value.results[0].hypothesisTemplate, input.hypothesisTemplate);
  });
  for (const hypothesisTemplate of ["", "No placeholder", "{} and {}", "{} {named}", "{{}}", "x".repeat(199) + "{}", 42, null]) {
    await check("invalid NLI templates never reach fetch", async () => {
      const f = fixture(); await rejected(f.client.analyze({ text: "text", model: "minilm", topicLabels: ["one", "two"], hypothesisTemplate }), "INVALID_INPUT");
      assert.equal(f.calls.length, 0);
    });
  }
  await check("a 200-character template is accepted", async () => {
    const f = fixture(); await f.client.analyze({ text: "text", model: "minilm", topicLabels: ["one", "two"], hypothesisTemplate: "x".repeat(198) + "{}" });
    assert.equal(f.calls.length, 1);
  });
  for (const multiLabel of ["true", 0, null]) await check("invalid multi-label modes never reach fetch", async () => {
    const f = fixture(); await rejected(f.client.analyze({ text: "text", model: "minilm", topicLabels: ["one", "two"], multiLabel }), "INVALID_INPUT");
    assert.equal(f.calls.length, 0);
  });
  const malformed = [
    value => { value.schemaVersion = 2; }, value => { value.requestId = ""; }, value => { value.results.push(value.results[0]); },
    value => { value.results[0].model = "horizon"; }, value => { value.results[0].revision = ""; },
    value => { value.results[0].task = ""; }, value => { value.results[0].labels = []; },
    value => { value.results[0].labels[0].score = 1.1; }, value => { value.results[0].labels[0].score = -0.1; },
    value => { value.results[0].labels[0].score = null; }, value => { value.results[0].labels[0].score = "0.5"; },
    value => { value.results[0].labels[0].label = ""; }, value => { value.results[0].labels.push(value.results[0].labels[0]); },
    value => { value.results[0].labels = Array.from({ length: 65 }, (_, n) => ({ label: "label" + n, score: 0.5 })); },
    value => { value.results[0].toxicityScore = null; }, value => { value.results[0].toxicityScore = 2; },
    value => { value.results[0].elapsedMs = -1; }, value => { value.results[0].elapsedMs = "10"; },
    value => { value.results[0].truncated = 0; }, value => { value.results[0].error = {}; }
  ];
  for (let index = 0; index < malformed.length; index++) await check("rejects malformed result " + index, async () => {
    const f = fixture(); const value = result(); malformed[index](value); f.respond(async () => json(value));
    await rejected(f.client.analyze({ text: "text", model: "cold" }), "INVALID_RESPONSE");
  });
  await check("structured model errors are not cached", async () => {
    const f = fixture(); f.respond(async () => json(result("cold", "revision-a", { labels: [], error: "model-not-ready" })));
    const value = await f.client.analyze({ text: "text", model: "cold" });
    assert.equal(value.results[0].error, "model-not-ready");
    await f.client.analyze({ text: "text", model: "cold" }); assert.equal(f.calls.length, 2);
  });
  await check("structured service model errors are validated, preserved and not cached", async () => {
    const f = fixture(); const serviceError = { code: "MODEL_NOT_DOWNLOADED", message: "Model files are unavailable", details: { ignored: true } };
    f.respond(async () => json(result("cold", "revision-a", { labels: [], error: serviceError })));
    const value = await f.client.analyze({ text: "text", model: "cold" });
    assert.deepEqual(value.results[0].error, { code: serviceError.code, message: serviceError.message });
    await f.client.analyze({ text: "text", model: "cold" }); assert.equal(f.calls.length, 2);
  });
  for (const error of [null, { code: "", message: "message" }, { code: "x".repeat(101), message: "message" }, { code: "ERROR", message: "" }, { code: "ERROR", message: "x".repeat(2001) }, { code: "ERROR", message: 42 }]) {
    await check("malformed structured service errors are rejected", async () => {
      const f = fixture(); f.respond(async () => json(result("cold", "revision-a", { labels: [], error })));
      await rejected(f.client.analyze({ text: "text", model: "cold" }), "INVALID_RESPONSE");
    });
  }
  await check("finite optional inference metadata and label titles are retained", async () => {
    const f = fixture(); const metadata = {
      scoreType: "independent-nli-entailment", labels: [{ label: "insult", title: "Attack", score: 0.75 }],
      inputCharacters: 100, inputTokens: 500, processedTokens: 256, maxInputTokens: 256,
      inferenceMs: 21, loadMs: 1200, loadedNow: true, cached: false, originalElapsedMs: 1221,
      repository: "organization/model", device: "cpu", dtype: "float32", topicLabels: ["insult", "discussion"],
      hypothesisTemplate: "This example is {}.", multiLabel: true
    };
    f.respond(async () => json(result("minilm", "revision-a", metadata)));
    const value = await f.client.analyze({ text: "text", model: "minilm", topicLabels: ["insult", "discussion"] });
    for (const key of Object.keys(metadata)) assert.deepEqual(value.results[0][key], metadata[key]);
  });
  for (const scoreType of ["softmax", "independent-sigmoid", "independent-nli-entailment", "exclusive-nli-entailment"]) {
    await check("recognized score semantics " + scoreType, async () => {
      const f = fixture(); f.respond(async () => json(result("cold", "revision-a", { scoreType })));
      assert.equal((await f.client.analyze({ text: "text", model: "cold" })).results[0].scoreType, scoreType);
    });
  }
  for (const metadata of [
    { scoreType: "invented" }, { labels: [{ label: "label", score: 0.5, title: "x".repeat(129) }] },
    { inputTokens: -1 }, { inputTokens: 1.5 }, { processedTokens: null }, { maxInputTokens: 0 }, { inputCharacters: 10001 },
    { processedTokens: 257, maxInputTokens: 256 }, { inferenceMs: null }, { loadMs: -1 }, { originalElapsedMs: "100" },
    { loadedNow: 1 }, { cached: "yes" }, { multiLabel: 0 }, { repository: "x".repeat(201) }, { dtype: {} },
    { topicLabels: ["one"] }, { topicLabels: ["one", "one"] }, { hypothesisTemplate: "{} {}" }, { hypothesisTemplate: "{named}" }
  ]) await check("malformed optional metadata is rejected", async () => {
    const f = fixture(); f.respond(async () => json(result("cold", "revision-a", metadata)));
    await rejected(f.client.analyze({ text: "text", model: "cold" }), "INVALID_RESPONSE");
  });
  await check("truncation is retained in returned results", async () => {
    const f = fixture(); f.respond(async () => json(result("cold", "revision-a", { truncated: true })));
    assert.equal((await f.client.analyze({ text: "text", model: "cold" })).results[0].truncated, true);
  });
  await check("malformed JSON and HTML are rejected", async () => {
    const f = fixture(); f.respond(async () => new Response("not json", { headers: { "Content-Type": "application/json" } }));
    await rejected(f.client.health(), "INVALID_RESPONSE");
    f.respond(async () => new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }));
    await rejected(f.client.health(), "INVALID_RESPONSE");
  });
  await check("HTTP failure has a stable error code", async () => {
    const f = fixture(); f.respond(async () => new Response("forbidden", { status: 403 })); await rejected(f.client.health(), "HTTP_ERROR");
  });
  await check("outer HTTP service errors retain their validated cause", async () => {
    const f = fixture(); const serviceError = { code: "UNAUTHORIZED", message: "Invalid local service token" };
    f.respond(async () => new Response(JSON.stringify({ schemaVersion: 1, error: serviceError }), { status: 403, headers: { "Content-Type": "application/json" } }));
    await assert.rejects(f.client.health(), error => error.code === "HTTP_ERROR" && error.httpStatus === 403
      && error.serviceError.code === serviceError.code && error.serviceError.message === serviceError.message);
  });
  await check("outer model errors in successful envelopes have a distinct error code", async () => {
    const f = fixture(); f.respond(async () => json({ schemaVersion: 1, error: { code: "MODEL_BUSY", message: "Try again later" } }));
    await assert.rejects(f.client.health(), error => error.code === "SERVICE_ERROR" && error.serviceError.code === "MODEL_BUSY");
  });
  await check("network failure does not leak transport details or token", async () => {
    const f = fixture(); f.respond(async () => { throw new Error("transport secret " + token); });
    await assert.rejects(f.client.health(), error => error.code === "NETWORK_ERROR" && !error.message.includes(token));
  });
  await check("oversized Content-Length is refused", async () => {
    const f = fixture(); f.respond(async () => new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": String(core.MAX_RESPONSE_BYTES + 1) } }));
    await rejected(f.client.health(), "RESPONSE_TOO_LARGE");
  });
  await check("actual streaming response size is bounded", async () => {
    const f = fixture(); f.respond(async () => new Response("x".repeat(core.MAX_RESPONSE_BYTES + 1), { headers: { "Content-Type": "application/json" } }));
    await rejected(f.client.health(), "RESPONSE_TOO_LARGE");
  });
  await check("invalid UTF-8 is a response error", async () => {
    const f = fixture(); f.respond(async () => new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "application/json" } }));
    await rejected(f.client.health(), "INVALID_RESPONSE");
  });
  await check("UTF-8 response size is bounded without streaming", async () => {
    const f = fixture(); f.respond(async () => ({ ok: true, headers: new Headers(), text: async () => "\u4e2d".repeat(core.MAX_RESPONSE_BYTES / 2) }));
    await rejected(f.client.health(), "RESPONSE_TOO_LARGE");
  });
  await check("timeout aborts transport even if the fake fetch ignores abort", async () => {
    const f = fixture({ timeoutMs: 10 }); f.respond(() => new Promise(() => {}));
    await rejected(f.client.health(), "TIMEOUT"); assert.equal(f.calls[0].request.signal.aborted, true);
  });
  await check("default timeout remains 20 seconds", async () => {
    const scheduled = [], timers = [];
    const context = { fetch() {}, AbortController, TextEncoder, TextDecoder, crypto: webcrypto,
      setTimeout(fn, ms) { scheduled.push(ms); const timer = setTimeout(fn, ms); timers.push(timer); return timer; }, clearTimeout };
    vm.runInNewContext(fs.readFileSync(require.resolve("../src/semantic-client.js"), "utf8"), context);
    const client = context.CC98RebornSemanticClient.createClient({ token, fetch: async () => json({ schemaVersion: 1 }) });
    await client.health(); timers.forEach(clearTimeout); assert.deepEqual(scheduled, [20000]);
  });
  await check("caller cancellation aborts transport", async () => {
    const f = fixture(); const controller = new AbortController(); f.respond(() => new Promise(() => {}));
    const pending = f.client.health({ signal: controller.signal });
    await new Promise(resolve => setImmediate(resolve)); controller.abort();
    await rejected(pending, "ABORTED"); assert.equal(f.calls[0].request.signal.aborted, true);
  });
  await check("already cancelled requests perform no network work", async () => {
    const f = fixture(); const controller = new AbortController(); controller.abort();
    await rejected(f.client.analyze({ text: "text", model: "cold" }, { signal: controller.signal }), "ABORTED"); assert.equal(f.calls.length, 0);
  });
  await check("malformed cancellation options do not reach fetch", async () => {
    const f = fixture();
    for (const settings of [{ signal: {} }, { refresh: "yes" }, null]) await rejected(f.client.analyze({ text: "text", model: "cold" }, settings), "INVALID_INPUT");
    assert.equal(f.calls.length, 0);
  });
  await check("concurrent requests have a finite bound and cancellation releases slots", async () => {
    const f = fixture({ maxPending: 1 }); f.respond(() => new Promise(() => {})); const controller = new AbortController();
    const pending = f.client.health({ signal: controller.signal }); await rejected(f.client.health(), "BUSY");
    controller.abort(); await rejected(pending, "ABORTED");
    f.respond(async () => json({ schemaVersion: 1 })); await f.client.health();
  });
  await check("same text and revision reuse cache with defensive copies", async () => {
    const f = fixture(); const first = await f.client.analyze({ text: "private text", model: "cold" });
    first.results[0].labels[0].score = 0;
    const second = await f.client.analyze({ text: "private text", model: "cold" });
    assert.equal(second.results[0].labels[0].score, 0.75); assert.equal(f.calls.length, 1);
  });
  await check("model and text cache entries are isolated", async () => {
    const f = fixture(); await f.client.analyze({ text: "text-a", model: "cold" }); await f.client.analyze({ text: "text-b", model: "cold" });
    await f.client.analyze({ text: "text-a", model: "horizon" }); assert.equal(f.calls.length, 3);
  });
  await check("NLI label values and order are part of the cache key", async () => {
    const f = fixture(); const base = { text: "text", model: "minilm", topicLabels: ["one", "two"] };
    await f.client.analyze(base); await f.client.analyze(base); assert.equal(f.calls.length, 1);
    await f.client.analyze({ ...base, topicLabels: ["one", "three"] });
    await f.client.analyze({ ...base, topicLabels: ["two", "one"] }); assert.equal(f.calls.length, 3);
  });
  await check("NLI template and multi-label mode isolate cached results", async () => {
    const f = fixture(); const base = { text: "text", model: "minilm", topicLabels: ["one", "two"], hypothesisTemplate: "This example is {}.", multiLabel: true };
    await f.client.analyze(base); await f.client.analyze(base); assert.equal(f.calls.length, 1);
    await f.client.analyze({ ...base, hypothesisTemplate: "This example concerns {}." });
    await f.client.analyze({ ...base, multiLabel: false });
    await f.client.analyze({ text: base.text, model: base.model, topicLabels: base.topicLabels });
    assert.equal(f.calls.length, 4);
  });
  for (const metadata of [{ hypothesisTemplate: "A different {} template." }, { multiLabel: false }, { topicLabels: ["two", "one"] }]) {
    await check("NLI response echoes cannot contradict explicit request configuration", async () => {
      const f = fixture(); const input = { text: "text", model: "minilm", topicLabels: ["one", "two"], hypothesisTemplate: "This example is {}.", multiLabel: true };
      f.respond(async () => json(result("minilm", "revision-a", metadata)));
      await rejected(f.client.analyze(input), "INVALID_RESPONSE");
    });
  }
  await check("request text and configuration are snapshotted before asynchronous hashing", async () => {
    let finish;
    const f = fixture({ crypto: { subtle: { digest: (algorithm, bytes) => new Promise(resolve => { finish = () => webcrypto.subtle.digest(algorithm, bytes).then(resolve); }) } } });
    const input = { text: "original text", model: "cold" }, pending = f.client.analyze(input);
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    input.text = "mutated text"; input.model = "horizon"; input.hypothesisTemplate = "invalid";
    await finish(); const value = await pending;
    assert.equal(value.results[0].model, "cold");
    assert.deepEqual(JSON.parse(f.calls[0].request.body), { schemaVersion: 1, text: "original text", models: ["cold"], topicLabels: [] });
  });
  await check("explicit health revision changes invalidate only stale model entries", async () => {
    const f = fixture(); await f.client.analyze({ text: "text", model: "cold" });
    f.respond(async url => url.endsWith("/health") ? json({ schemaVersion: 1, models: [{ id: "cold", revision: "revision-b" }] }) : json(result("cold", "revision-b")));
    await f.client.health(); const value = await f.client.analyze({ text: "text", model: "cold" });
    assert.equal(value.results[0].revision, "revision-b"); assert.equal(f.calls.length, 3);
    await f.client.analyze({ text: "text", model: "cold" }); assert.equal(f.calls.length, 3);
  });
  await check("explicit refresh bypasses cache and discovers changed revisions", async () => {
    const f = fixture(); const input = { text: "text", model: "cold" }; await f.client.analyze(input);
    f.respond(async () => json(result("cold", "revision-b")));
    assert.equal((await f.client.analyze(input, { refresh: true })).results[0].revision, "revision-b");
    await f.client.analyze(input); assert.equal(f.calls.length, 2);
  });
  await check("TTL expiry and clearCache cause new analysis", async () => {
    let time = 100; const f = fixture({ now: () => time, cacheTtlMs: 10 }); const input = { text: "text", model: "cold" };
    await f.client.analyze(input); time = 109; await f.client.analyze(input); assert.equal(f.calls.length, 1);
    time = 110; await f.client.analyze(input); assert.equal(f.calls.length, 2);
    f.client.clearCache(); await f.client.analyze(input); assert.equal(f.calls.length, 3);
  });
  await check("cache entry and byte limits prevent unlimited retention", async () => {
    const f = fixture({ maxCacheEntries: 1 });
    await f.client.analyze({ text: "one", model: "cold" }); await f.client.analyze({ text: "two", model: "cold" });
    await f.client.analyze({ text: "one", model: "cold" }); assert.equal(f.calls.length, 3);
    const tiny = fixture({ maxCacheBytes: 1 }); const input = { text: "text", model: "cold" };
    await tiny.client.analyze(input); await tiny.client.analyze(input); assert.equal(tiny.calls.length, 2);
  });
  await check("no Web Crypto disables caching without weak hashes or plaintext keys", async () => {
    const f = fixture({ crypto: null }); const input = { text: "text", model: "cold" };
    await f.client.analyze(input); await f.client.analyze(input); assert.equal(f.calls.length, 2);
  });
  await check("clearing while analysis is in flight prevents repopulation", async () => {
    const f = fixture(); let complete;
    f.respond(() => new Promise(resolve => { complete = resolve; }));
    const input = { text: "text", model: "cold" }, pending = f.client.analyze(input);
    while (!complete) await new Promise(resolve => setImmediate(resolve));
    f.client.clearCache(); complete(json(result())); await pending;
    f.respond(async () => json(result())); await f.client.analyze(input); assert.equal(f.calls.length, 2);
  });
  await check("malformed health revisions cannot poison cache", async () => {
    const f = fixture(); f.respond(async () => json({ schemaVersion: 1, models: [{ id: "cold", revision: "" }] }));
    await rejected(f.client.health(), "INVALID_RESPONSE");
  });
  console.log("Semantic client: " + checks + " checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
