const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../src/user-notes-core.js");

assert.equal(core.MAX_LENGTH, 80);
for (const uid of [1, 123, Number.MAX_SAFE_INTEGER, "1", "123", "9007199254740991"]) {
  assert.equal(core.normalizeUid(uid), String(uid));
}
for (const uid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
  "9007199254740992", "0", "01", "-1", "1.0", "1e3", " 2", "2 ", "", "guest",
  null, undefined, {}, [1], true, false, 1n]) {
  assert.equal(core.normalizeUid(uid), "", `reject UID ${String(uid)}`);
  assert.equal(core.storageKey(uid, 123), "");
  assert.equal(core.storageKey(123, uid), "");
}

assert.equal(core.normalizeNote("  图书馆的同学  "), "图书馆的同学");
assert.equal(core.normalizeNote("\t一起\n参加\r\n比赛\u0000\u001b\u007f\u0085\u2028\u2029的人\t"), "一起 参加 比赛 的人");
assert.equal(core.normalizeNote("有  两个　 空格"), "有 两个 空格");
assert.equal(core.normalizeNote("\u0000\t\n\r\u007f\u009f"), "");
assert.equal(core.normalizeNote("中文😀".repeat(40)), "中文😀".repeat(26) + "中文");
assert.equal(core.normalizeNote("😀".repeat(81)), "😀".repeat(80));
assert.equal(Array.from(core.normalizeNote("备注😀".repeat(100))).length, 80);
assert.equal(core.normalizeNote("<img src=x onerror=alert(1)>"), "<img src=x onerror=alert(1)>");
for (const note of [null, undefined, 123, {}, ["备注"]]) assert.equal(core.normalizeNote(note), "");

assert.equal(core.storageKey(123, "456"), "cc98RebornUserNote:uid:123:user:456");
assert.notEqual(core.storageKey(123, 456), core.storageKey(789, 456));
assert.notEqual(core.storageKey(123, 456), core.storageKey(123, 789));
assert.deepEqual(core.parseStorageKey(core.storageKey(123, 456)), { ownerUid: "123", targetUid: "456" });
assert.deepEqual(core.parseStorageKey(core.storageKey(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)), {
  ownerUid: "9007199254740991", targetUid: "9007199254740991",
});
for (const key of [null, undefined, {}, "", "cc98RebornUserNote:uid:guest:user:123",
  "cc98RebornUserNote:uid:0:user:123", "cc98RebornUserNote:uid:01:user:123",
  "cc98RebornUserNote:uid:123:user:01", "cc98RebornUserNote:uid:123:user:0",
  "cc98RebornUserNote:uid:9007199254740992:user:123", "cc98RebornUserNote:uid:123:user:9007199254740992",
  "cc98RebornUserNote:uid:123:user:456:other", "cc98RebornUserNote:uid:123:user:456\n",
  " cc98RebornUserNote:uid:123:user:456", "cc98RebornUserNote:uid:123:user:456 ",
  "cc98RebornUserNote:uid:123:user:-456", "cc98RebornUserNote:uid:123:user:4.56",
  "cc98rebornUserNote:uid:123:user:456"]) {
  assert.equal(core.parseStorageKey(key), null, `reject storage key ${String(key)}`);
}

const sandbox = {};
vm.runInNewContext(fs.readFileSync(require.resolve("../src/user-notes-core.js"), "utf8"), sandbox);
const browser = sandbox.CC98RebornUserNotesCore;
assert.equal(browser.MAX_LENGTH, 80);
assert.equal(browser.normalizeUid(123), "123");
assert.equal(browser.normalizeNote("😀".repeat(81)), "😀".repeat(80));
assert.equal(browser.storageKey(123, 456), core.storageKey(123, 456));
assert.equal(JSON.stringify(browser.parseStorageKey(core.storageKey(123, 456))), JSON.stringify({ ownerUid: "123", targetUid: "456" }));

console.log("user-notes-core tests passed");
