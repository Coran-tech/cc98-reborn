const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { create, normalizeIndex, apiBase } = require("../src/home-live.js");

const topic = (id) => ({ id, title: `帖子 ${id}`, boardId: 10, boardName: "学习天地" });
const data = (ids, onlineUserCount = 4021) => ({ hotTopic: ids.map(topic), onlineUserCount });
function fixture() {
  let time = 1_800_000_000_000,
    id = 0,
    active = true;
  const timers = new Map(),
    values = new Map(),
    events = new Map(),
    requests = [],
    updates = [];
  const host = {
    location: new URL("https://www.cc98.org/"),
    Date: { now: () => time },
    AbortController,
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    },
    setTimeout: (fn, ms) => {
      const key = ++id;
      timers.set(key, { fn, at: time + ms });
      return key;
    },
    clearTimeout: (key) => timers.delete(key),
    addEventListener: (type, fn) => events.set(type, fn),
    removeEventListener: (type) => events.delete(type),
    fetch: (url, options) =>
      new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }))
  };
  const controller = create(
    { onUpdate: (snapshot) => updates.push(snapshot), isActive: () => active },
    host
  );
  const settle = async () => {
    for (let n = 0; n < 8; n++) await Promise.resolve();
  };
  async function advance(ms) {
    const end = time + ms;
    while (true) {
      const entry = [...timers]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      time = entry[1].at;
      timers.delete(entry[0]);
      entry[1].fn();
      await settle();
    }
    time = end;
    await settle();
  }
  async function respond(body, status = 200, retry = null, index = requests.length - 1) {
    requests[index].resolve({
      ok: status === 200,
      status,
      headers: { get: () => retry },
      json: async () => body
    });
    await settle();
  }
  return {
    controller,
    host,
    values,
    events,
    timers,
    requests,
    updates,
    advance,
    respond,
    deactivate() {
      active = false;
    },
    now: () => time
  };
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const entry = fs.readFileSync(path.join(root, "entrypoints/content.ts"), "utf8");
  assert(
    entry.indexOf('import "../src/home-live.js";') >= 0 &&
      entry.indexOf('import "../src/home-live.js";') < entry.indexOf('import "../src/content.js";')
  );
  assert.match(
    fs.readFileSync(path.join(root, "scripts/package-extension.ps1"), "utf8"),
    /chrome-mv3/
  );
  assert.equal(normalizeIndex({}), null);
  assert.equal(normalizeIndex({ onlineUserCount: -1 }), null);
  assert.equal(normalizeIndex({ hotTopic: [topic(1), topic(1)] }), null);
  assert.deepEqual(normalizeIndex(data([], 0)), { hotTopic: [], onlineUserCount: 0 });
  assert.equal(apiBase(new URL("https://openid.cc98.org")), "");
  assert.equal(apiBase(new URL("https://www.cc98.org")), "https://api.cc98.org");
  assert.match(
    apiBase(new URL("https://webvpn.zju.edu.cn")),
    /^https:\/\/webvpn.zju.edu.cn\/https\//
  );

  const f = fixture();
  f.controller.start();
  f.controller.start();
  await f.advance(0);
  assert.equal(f.requests.length, 1, "repeated start has one request");
  assert.equal(f.requests[0].url, "https://api.cc98.org/config/index");
  assert.deepEqual(f.requests[0].options.headers, { Accept: "application/json" });
  assert.equal(f.requests[0].options.credentials, "omit");
  await f.respond(data([1, 2]));
  await f.advance(59_999);
  assert.equal(f.requests.length, 1);
  await f.advance(1);
  assert.equal(f.requests.length, 2);
  await f.respond(data([2, 3], 5000));
  assert.deepEqual(
    f.controller.getSnapshot().hotTopic.map((t) => t.id),
    [2, 3]
  );
  await f.advance(60_000);
  await f.respond(data([], 0));
  assert.deepEqual(
    f.controller.getSnapshot().hotTopic.map((t) => t.id),
    [2, 3],
    "empty list retains previous topics"
  );
  assert.equal(f.controller.getSnapshot().onlineUserCount, 0, "zero is a valid count");
  await f.advance(60_000);
  await f.respond({}, 503);
  assert.equal(f.controller.getSnapshot().onlineUserCount, 0, "failure preserves display");
  await f.advance(60_000);
  await f.respond({}, 429, "180");
  const count = f.requests.length;
  await f.advance(179_999);
  assert.equal(f.requests.length, count);
  await f.advance(1);
  assert.equal(f.requests.length, count + 1, "honor Retry-After");
  await f.respond(data([4], 12));
  f.controller.stop();
  await f.advance(600_000);
  assert.equal(f.requests.length, count + 1);
  assert.equal(f.events.size, 0);

  f.controller.start();
  await f.advance(0);
  const pending = f.requests.at(-1),
    before = f.updates.length;
  f.controller.stop();
  assert.equal(pending.options.signal.aborted, true);
  await f.respond(data([9], 999));
  assert.equal(f.updates.length, before, "late stopped response cannot change UI or cache");
  assert.equal(f.controller.getSnapshot().onlineUserCount, 12);

  const native = fixture();
  native.values.set("mainPageData", "obj-" + JSON.stringify(data([10], 80)));
  native.values.set("mainPageData_expirationTime", String((native.now() + 60_000) / 1000));
  native.controller.start();
  assert.equal(native.controller.getSnapshot().onlineUserCount, 80);
  await native.advance(59_999);
  assert.equal(native.requests.length, 0, "reuse fresh original homepage data");
  await native.advance(1);
  assert.equal(native.requests.length, 1);
  native.deactivate();
  await native.respond(data([11], 90));
  assert.equal(
    native.controller.getSnapshot().onlineUserCount,
    80,
    "navigation invalidates in-flight updates"
  );
  native.controller.stop();

  const cached = fixture();
  cached.values.set(
    "cc98RebornHomeIndex:v1",
    JSON.stringify({ ...data([21]), checkedAt: cached.now() })
  );
  cached.controller.start();
  await cached.advance(0);
  assert.equal(cached.requests.length, 0);
  assert.equal(cached.controller.getSnapshot().hotTopic[0].id, 21);
  cached.values.set(
    "cc98RebornHomeIndex:v1",
    JSON.stringify({ ...data([22], 7000), checkedAt: cached.now() })
  );
  cached.events.get("storage")({ key: "cc98RebornHomeIndex:v1" });
  assert.equal(
    cached.controller.getSnapshot().onlineUserCount,
    7000,
    "another tab supplies the same display data"
  );
  cached.controller.stop();
  const d = fixture();
  const details = d.controller.details;
  details.update([3, 1, 2]);
  await d.advance(1000);
  assert.equal(d.requests.length, 0, "no private requests without a forum session");
  d.values.set("accessToken", "str-Bearer fixture");
  details.update([3, 1, 2]);
  await d.advance(400);
  assert.equal(d.requests[0].url, "https://api.cc98.org/topic/basic?id=1&id=2&id=3");
  await d.respond([{ id: 2 }, { id: 1, replyCount: "0", hitCount: 100 }]);
  assert.equal(details.current()?.get(1).replyCount, 0);
  assert.equal(details.current()?.get(2).hitCount, undefined);
  details.update([2, 3, 1]);
  await d.advance(700);
  assert.equal(d.requests[1].url, "https://api.cc98.org/topic/2");
  await d.respond({ id: 2, replyCount: 5, hitCount: 65 });
  assert.equal(details.current()?.get(2).hitCount, 65);
  assert.equal(details.current()?.get(3).replyCount, undefined, "do not probe a missing topic");
  await d.advance(60_000);
  details.update([1, 2, 3]);
  await d.advance(1000);
  assert.equal(d.requests.length, 2, "fresh private counts are reused");
  d.values.set("accessToken", "str-Bearer another-fixture");
  assert.equal(details.current()?.get(1), undefined, "previous account data must not be displayed");
  details.update([2]);
  await d.advance(400);
  details.stop();
  await d.respond([{ id: 2, replyCount: 99, hitCount: 99 }]);
  assert.equal(details.current()?.get(2), undefined);
  assert.equal(d.requests[2].options.signal.aborted, true);
  console.log(
    "Home index: normalization, minute polling, native/shared cache, empty/error preservation, throttling and lifecycle passed."
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
