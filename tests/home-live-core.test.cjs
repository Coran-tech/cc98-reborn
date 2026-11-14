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
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const scripts = manifest.content_scripts.find((group) => group.js.includes("src/content.js")).js;
  assert(
    scripts.indexOf("src/home-live.js") >= 0 &&
      scripts.indexOf("src/home-live.js") < scripts.indexOf("src/content.js")
  );
  assert.match(
    fs.readFileSync(path.join(root, "scripts/package-extension.ps1"), "utf8"),
    /"home-live\.js"/
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
  console.log(
    "Home index: normalization, minute polling, native/shared cache, empty/error preservation, throttling and lifecycle passed."
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
