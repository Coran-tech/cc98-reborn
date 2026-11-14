const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../src/content.js"), "utf8");
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const values = new Map();
const context = vm.createContext({
  URL,
  location: new URL("https://www.cc98.org/"),
  HOME_HOT_RANK_CACHE_KEY_PREFIX: "rank:",
  homeHotRankingStates: new Map(),
  normalizeText: (value) => String(value).trim(),
  isDirectCc98Host: (host) => /^(www\.)?cc98\.org$/.test(host),
  isWebVpnHost: (host) => host === "webvpn.zju.edu.cn",
  getWebVpnProxyPrefixFromUrl: () => "/https/proxy",
  getCurrentWebVpnCc98Prefix: () => "/https/proxy",
  normalizeWebVpnProxyPrefix: (value) => value,
  localStorage: {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value)
  }
});
vm.runInContext(
  slice("function isCc98RoutePath(", "function getCurrentCc98RoutePath(") +
    slice("function getHomeHotRankCacheKey(", "function getBoardSections("),
  context
);
const item = (id, suffix = "") => ({
  title: `帖子 ${id}`,
  href: `https://www.cc98.org/topic/${id}${suffix}`
});
const rank = (items) => context.getHomeHotItemsWithRankMovement({ title: "热门话题", items });
const key = "rank:热门话题";
// A persisted pre-API baseline uses full URLs and /1. Keep its real movements.
values.set(
  key,
  JSON.stringify({
    entries: [1, 2, 3].map((id, index) => ({
      key: item(id, "/1").href,
      href: item(id, "/1").href,
      rank: index + 1
    }))
  })
);
assert.deepEqual(
  Array.from(rank([item(1), item(2), item(3)]), (x) => x.rankMovement),
  ["", "", ""]
);
for (const href of [
  "/topic/1/1",
  "/topic/1/8#75",
  "http://cc98.org/topic/1?x=1",
  "https://webvpn.zju.edu.cn/https/proxy/topic/1/1"
]) {
  assert.equal(context.getHomeHotRankItemKey({ href }), "topic:1");
}
const changed = rank([item(2, "/1"), item(1), item(4)]);
assert.deepEqual(
  Array.from(changed, (x) => [x.rankMovement, x.rankDelta]),
  [
    ["up", 1],
    ["down", 1],
    ["new", 0]
  ]
);
assert(
  Array.from(rank([item(2), item(1, "/1"), item(4, "/1")])).every((x) => !x.rankMovementAnimated)
);
// Reloading retains the canonical baseline and does not announce old topics anew.
context.homeHotRankingStates.clear();
assert(Array.from(rank([item(2), item(1), item(4)])).every((x) => !x.rankMovement));
// Older cache entries without href are migrated from their URL key too.
context.homeHotRankingStates.clear();
values.set(key, JSON.stringify({ entries: [{ key: item(1, "/1").href, rank: 1 }] }));
assert.equal(rank([item(1)])[0].rankMovement, "");
context.homeHotRankingStates.clear();
values.set(key, JSON.stringify({ entries: [{ key: "title:无链接", rank: 1 }] }));
assert.equal(rank([{ title: "无链接" }])[0].rankMovement, "");
console.log(
  "Homepage ranks: native/API identities, legacy cache migration, real movement and reload passed."
);
