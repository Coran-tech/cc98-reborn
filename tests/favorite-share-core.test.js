const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../src/favorite-share-core.js");

function wire(data, prefix = "CC98F1") {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0);
  }
  return `${prefix}.${bytes.toString("base64url")}.${((checksum ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0")}`;
}

const data = { name: "论坛收藏📚", topics: [
  { id: 6656303, title: "图片与表情 😀😺" },
  { id: "9007199254740991", title: '<img src=x onerror="alert(1)"> & 笔记' },
] };
const encoded = core.encode(data);
assert.match(encoded, /^CC98F1\.[A-Za-z0-9_-]+\.[a-f0-9]{8}$/);
assert.equal(encoded, wire({ version: 1, name: data.name, topics: data.topics.map((topic) => ({ ...topic, id: String(topic.id) })) }));
assert.deepEqual(core.decode(`\n ${encoded}\t`), {
  version: 1, name: data.name, topics: data.topics.map((topic) => ({ ...topic, id: String(topic.id) })), duplicates: 0,
});
assert.deepEqual(core.decode(core.encode({ name: "空", topics: [] })), { version: 1, name: "空", topics: [], duplicates: 0 });
assert.deepEqual(core.normalizeTopics([{ id: 3, title: "首次" }, { id: "3", title: "重复" }, { id: 1 }]), {
  topics: [{ id: "3", title: "首次" }, { id: "1", title: "" }], duplicates: 1,
});
assert.deepEqual(core.decode(wire({ version: 1, name: "去重", topics: [
  { id: "3", title: "第一次" }, { id: 3, title: "第二次" }, { id: "1", title: "第三次" },
] })), { version: 1, name: "去重", topics: [{ id: "3", title: "第一次" }, { id: "1", title: "第三次" }], duplicates: 1 });

const noSecrets = core.encode({ ...data, token: "SECRET", authorization: "Bearer SECRET", user: { id: 10 },
  topics: [{ id: 10, title: "标题", author: "SECRET", content: "SECRET", url: "https://example.com/SECRET" }] });
assert.deepEqual(JSON.parse(Buffer.from(noSecrets.split(".")[1], "base64url").toString()), {
  version: 1, name: data.name, topics: [{ id: "10", title: "标题" }],
});
assert(!Buffer.from(noSecrets.split(".")[1], "base64url").toString().includes("SECRET"));

for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "9007199254740992", "0", "01", "-1", "1.0", "1e3", " 2", "2 ", "", "abc", null, {}, [1], true]) {
  assert.throws(() => core.encode({ topics: [{ id }] }), /无效的帖子编号/, `reject id ${String(id)}`);
  assert.throws(() => core.decode(wire({ version: 1, name: "", topics: [{ id, title: "" }] })), /无效的帖子编号/);
}

const long = core.decode(core.encode({ name: "😀".repeat(81), topics: [{ id: 1, title: "😺".repeat(301) }] }));
assert.equal(long.name, "😀".repeat(80));
assert.equal(long.topics[0].title, "😺".repeat(300));
assert.throws(() => core.decode(wire({ version: 1, name: "中".repeat(81), topics: [] })), /收藏夹名称不能超过 80/);
assert.throws(() => core.decode(wire({ version: 1, name: "", topics: [{ id: 1, title: "😀".repeat(301) }] })), /帖子标题不能超过 300/);
assert.throws(() => core.encode({ topics: new Array(core.MAX_TOPICS + 1).fill({ id: 1 }) }), /最多分享 2000/);
assert.throws(() => core.decode(wire({ version: 1, name: "", topics: new Array(core.MAX_TOPICS + 1).fill({ id: 1, title: "" }) })), /最多分享 2000/);
assert.throws(() => core.decode("x".repeat(core.MAX_SHARE_LENGTH + 1)), /分享字符串过长/);
assert.throws(() => core.encode({ topics: Array.from({ length: 2000 }, (_, index) => ({ id: index + 1, title: "😀".repeat(300) })) }), /分享内容过长/);

const damagedParts = encoded.split(".");
damagedParts[1] = (damagedParts[1][0] === "A" ? "B" : "A") + damagedParts[1].slice(1);
assert.throws(() => core.decode(damagedParts.join(".")), /校验失败/);
assert.throws(() => core.decode(encoded.slice(0, -1)), /格式不正确/);
assert.throws(() => core.decode(encoded.replace(/^CC98F1/, "CC98F2")), /不支持这个分享版本/);
assert.throws(() => core.decode(wire({ version: 2, name: "", topics: [] })), /不支持这个分享版本/);
assert.throws(() => core.decode(wire(Buffer.from("{broken"))), /无法读取收藏数据/);
assert.throws(() => core.decode(wire(Buffer.from([0xff]))), /无法读取收藏数据/);
assert.throws(() => core.decode("CC98F1.A.00000000"), /已损坏/);
assert.throws(() => core.decode("CC98F1.AB.00000000"), /已损坏/);
assert.throws(() => core.decode("CC98F1.a==.00000000"), /已损坏/);
for (const value of ["", "\n\t", null, 1]) assert.throws(() => core.decode(value), /请粘贴/);
for (const extra of [
  { version: 1, name: "", topics: [], token: "secret" },
  { version: 1, topics: [] },
  { version: 1, name: "", topics: [{ id: 1, title: "", nested: { attack: [] } }] },
  { version: 1, name: {}, topics: [] },
  { version: 1, name: "", topics: {} },
  { version: 1, name: "", topics: [null] },
  { version: 1, name: "", topics: [{ id: { nested: { id: 1 } }, title: "" }] },
  { version: 1, name: "", topics: [{ id: 1, title: { nested: "text" } }] },
]) assert.throws(() => core.decode(wire(extra)));

// Check the browser UMD branch without Node Buffer, require, atob, or btoa.
const browser = vm.createContext({ TextEncoder, TextDecoder });
vm.runInContext(fs.readFileSync(require.resolve("../src/favorite-share-core.js"), "utf8"), browser);
assert.equal(browser.CC98RebornFavoriteShareCore.encode(data), encoded);
assert.equal(JSON.stringify(browser.CC98RebornFavoriteShareCore.decode(encoded)), JSON.stringify(core.decode(encoded)));
console.log("favorite-share-core: Unicode, limits, whitelist, deduplication, invalid IDs, checksum and browser UMD passed");
