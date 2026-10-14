const assert = require("node:assert/strict");
const test = require("node:test");
const { create, MAX_TOPICS } = require("../src/favorite-share-service.js");

const topic = (id) => ({ id, title: `主题 ${id}` });
const json = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  headers: { get: (key) => headers[key] || null }
});
const service = (request, options = {}) => create({ request, intervalMs: 0, ...options });

test("listGroups validates the native envelope and does not invent groups on failure", async () => {
  const groups = [{ id: 0, name: "默认分组", count: 2, createTime: "2026-10-12" }, { id: 9, name: "其他", count: 0 }];
  const api = service(async (path, options) => {
    assert.equal(path, "/me/favorite-topic-group");
    assert.equal(options.method, "GET");
    return json({ errorCode: 0, data: groups });
  });
  assert.deepEqual((await api.listGroups()).map((item) => item.id), [0, 9]);
  await assert.rejects(service(async () => json(groups)).listGroups(), /无法读取/);
  await assert.rejects(service(async () => json({ errorCode: 1, data: groups })).listGroups(), /无法读取/);
  await assert.rejects(service(async () => json({ errorCode: 0, data: [groups[0], groups[0]] })).listGroups(), /数据异常/);
});

test("export follows 11-item lookahead with step 10 without duplicating boundary topics", async () => {
  const values = Array.from({ length: 23 }, (_, index) => topic(index + 1));
  const offsets = [];
  const progress = [];
  const api = service(async (path) => {
    const url = new URL(path, "https://api.cc98.org");
    const from = Number(url.searchParams.get("from"));
    offsets.push(from);
    assert.equal(url.searchParams.get("size"), "11");
    assert.equal(url.searchParams.get("groupid"), "9");
    assert.equal(url.searchParams.get("order"), "2");
    return json(values.slice(from, from + 11));
  });
  assert.deepEqual(await api.exportGroup(9, { onProgress: (value) => progress.push(value.completed) }), values);
  assert.deepEqual(offsets, [0, 10, 20]);
  assert.deepEqual(progress, [10, 20, 23]);
});

test("export accepts exact limits and rejects oversized or repeated pages", async () => {
  assert.equal(MAX_TOPICS, 2000);
  const values = Array.from({ length: 11 }, (_, index) => topic(index + 1));
  await assert.rejects(service(async () => json(values), { maxTopics: 10 }).exportGroup(0), { code: "TOPIC_LIMIT" });
  assert.equal((await service(async () => json(values.slice(0, 10)), { maxTopics: 10 }).exportGroup(0)).length, 10);
  await assert.rejects(service(async () => json(values)).exportGroup(0), /重复分页/);
  await assert.rejects(service(async () => json({ data: values })).exportGroup(0), /格式异常/);
  await assert.rejects(service(async () => json([{ id: "invalid" }])).exportGroup(0), /无效的帖子编号/);
});

test("import skips an existing favorite in any group and only writes strictly false states", async () => {
  const calls = [];
  const progress = [];
  const api = service(async (path, options) => {
    calls.push([path, options.method]);
    if (path === "/topic/1/isfavorite") return json(true);
    if (path === "/topic/2/isfavorite") return json(false);
    if (path === "/topic/3/isfavorite") return json({ isFavorite: false });
    return json(null, 204);
  });
  const result = await api.importTopics([topic(1), topic(2), topic(2), topic(3)], 9, { onProgress: (value) => progress.push(value) });
  assert.deepEqual(result.added, [topic(2)]);
  assert.deepEqual(result.skipped, [topic(1)]);
  assert.equal(result.failed[0].id, 3);
  assert.match(result.failed[0].reason, /未进行写入/);
  assert.deepEqual(result.pending, []);
  assert.equal(result.stopped, false);
  assert.deepEqual(calls.filter(([, method]) => method === "PUT"), [["/me/favorite/2?groupid=9", "PUT"]]);
  assert.deepEqual(Object.fromEntries(["completed", "total", "added", "skipped", "failed"].map((key) => [key, progress.at(-1)[key]])), {
    completed: 3, total: 3, added: 1, skipped: 1, failed: 1
  });
});

test("normal per-topic failures are retryable and do not stop following topics", async () => {
  const result = await service(async (path, options) => {
    if (path === "/topic/1/isfavorite") return json(null, 404);
    if (options.method === "PUT") throw new Error("connection lost");
    return json(false);
  }).importTopics([topic(1), topic(2)], 0);
  assert.deepEqual(result.failed.map((value) => value.id), [1, 2]);
  assert.equal(result.stopped, false);
});

for (const status of [401, 403, 429]) {
  test(`HTTP ${status} pauses the current and remaining topics`, async () => {
    let count = 0;
    const api = service(async () => {
      count += 1;
      return count === 1 ? json(true) : json(null, status, { "Retry-After": "20" });
    });
    const result = await api.importTopics([topic(1), topic(2), topic(3)], 0);
    assert.equal(result.stopped, true);
    assert.equal(result.status, status);
    assert.equal(result.retryAfter, 20);
    assert.deepEqual(result.skipped, [topic(1)]);
    assert.deepEqual(result.pending, [topic(2), topic(3)]);
    assert.deepEqual(result.failed, []);
    assert.equal(count, 2);
  });
}

test("account changes and preflight authentication errors pause without another request", async () => {
  for (const properties of [{ code: "ACCOUNT_CHANGED" }, { status: 401 }]) {
    let calls = 0;
    const result = await service(async () => {
      calls += 1;
      throw Object.assign(new Error("auth changed"), properties);
    }).importTopics([topic(1), topic(2)], 0);
    assert.equal(calls, 1);
    assert.equal(result.stopped, true);
    assert.deepEqual(result.pending, [topic(1), topic(2)]);
  }
});

test("cancellation during the interval prevents an unstarted PUT", async () => {
  const controller = new AbortController();
  const calls = [];
  const api = service(async (path) => {
    calls.push(path);
    return json(false);
  }, { delay: async () => controller.abort() });
  const result = await api.importTopics([topic(1), topic(2)], 0, { signal: controller.signal });
  assert.deepEqual(calls, ["/topic/1/isfavorite"]);
  assert.equal(result.stopped, true);
  assert.deepEqual(result.pending, [topic(1), topic(2)]);
});

test("a canceled in-flight write stays pending and retry checks state before writing again", async () => {
  const controller = new AbortController();
  let stored = false;
  let writes = 0;
  const api = service(async (_path, options) => {
    if (options.method === "GET") return json(stored);
    writes += 1;
    stored = true;
    controller.abort();
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  });
  const result = await api.importTopics([topic(1)], 0, { signal: controller.signal });
  assert.deepEqual(result.pending, [topic(1)]);
  assert.deepEqual(result.added, []);
  assert.deepEqual((await api.importTopics(result.pending, 0)).skipped, [topic(1)]);
  assert.equal(writes, 1);
});

test("a confirmed successful write remains successful when cancellation arrives with its response", async () => {
  const controller = new AbortController();
  const api = service(async (_path, options) => {
    if (options.method === "GET") return json(false);
    controller.abort();
    return json(null, 204);
  });
  const result = await api.importTopics([topic(1), topic(2)], 0, { signal: controller.signal });
  assert.deepEqual(result.added, [topic(1)]);
  assert.deepEqual(result.pending, [topic(2)]);
});

test("pre-aborted import makes no calls and export rejects AbortError", async () => {
  const controller = new AbortController();
  controller.abort();
  const api = service(async () => { throw new Error("must not request"); });
  assert.deepEqual((await api.importTopics([topic(1)], 0, { signal: controller.signal })).pending, [topic(1)]);
  await assert.rejects(api.exportGroup(0, { signal: controller.signal }), { name: "AbortError" });
});

test("all requests are sequential and spaced, including the state check before a write", async () => {
  const events = [];
  const api = create({
    request: async (_path, options) => { events.push(options.method); return json(options.method === "GET" ? false : null); },
    delay: async (ms) => events.push(`wait ${ms}`)
  });
  await api.importTopics([topic(1), topic(2)], 0);
  assert.deepEqual(events, ["GET", "wait 600", "PUT", "wait 600", "GET", "wait 600", "PUT"]);
});

test("retry-after supports HTTP dates and malformed dates remain unknown", async () => {
  for (const value of [new Date(Date.now() + 60000).toUTCString(), "bad-date"]) {
    const result = await service(async () => json(null, 429, { "Retry-After": value })).importTopics([topic(1)], 0);
    if (value === "bad-date") assert.equal(result.retryAfter, undefined);
    else assert.ok(result.retryAfter >= 59 && result.retryAfter <= 60);
  }
});

test("invalid identifiers are rejected before sending any request", async () => {
  let calls = 0;
  const api = service(async () => { calls += 1; return json(false); });
  for (const group of [true, false, null, "", " ", -1, "1/evil"]) {
    await assert.rejects(api.exportGroup(group), /分组无效/);
    await assert.rejects(api.importTopics([topic(1)], group), /分组无效/);
  }
  for (const id of [true, false, null, "", " ", 0, -1, "1/evil"]) {
    await assert.rejects(api.importTopics([{ id, title: "bad" }], 0), /无效的帖子编号/);
  }
  assert.equal(calls, 0);
});
