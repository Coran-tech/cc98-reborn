"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../src/image-favorites-core.js");
const { createStore } = require("../src/image-favorites-store.js");
const imageA = "https://file.cc98.org/uploads/a.gif";
const imageB = "https://file.cc98.org/uploads/b.webp";
const imageC = "https://file.cc98.org/uploads/c.png";
const sender = { id: "test-extension", tab: { id: 4 }, frameId: 0, url: "https://www.cc98.org/topic/6677179/2" };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fakeChrome(records = {}, options = {}) {
  const listeners = [], writes = [];
  const chrome = {
    runtime: { id: "test-extension" },
    storage: { local: {
      get(key, callback) {
        const result = structuredClone({ [key]: records[key] });
        const run = () => callback(result);
        if (options.reads) options.reads.push(run); else setImmediate(run);
      },
      set(values, callback) {
        setImmediate(() => {
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: records[key], newValue: structuredClone(value) };
            records[key] = structuredClone(value); writes.push({ key, value: structuredClone(value) });
          }
          listeners.forEach(listener => listener(changes, "local")); callback?.();
        });
      }
    }, onChanged: { addListener(listener) { listeners.push(listener); } } }
  };
  return { chrome, records, listeners, writes };
}
function clientFixture(records, options) {
  const state = fakeChrome(records, options);
  let owner = "1001";
  const sent = [];
  const store = createStore({ chrome: state.chrome, now: () => 12345678 });
  state.chrome.runtime.sendMessage = (message, callback) => {
    sent.push(structuredClone(message));
    store.handle(message, sender).then(callback, error => callback({ ok: false, error: error.message }));
  };
  const context = vm.createContext({ URL, Promise, Set, Map, console, chrome: state.chrome,
    window: { addEventListener() {} }, getCurrentReadLaterUserId: () => owner,
    hasVisibleCc98GuestLoginEntry: () => !owner,
    location: { pathname: "/topic/6677179" }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/image-favorites-core.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/image-favorites.js"), "utf8"), context);
  return { ...state, api: context.CC98RebornImageFavorites, setOwner(value) { owner = value; }, sent };
}

async function main() {
  assert.equal(core.storageKey("42"), `${core.PREFIX}42`);
  for (const id of ["0", "-1", "01", "1.2", "a", "1e2", "9007199254740992"]) assert.equal(core.storageKey(id), "");
  for (const url of ["javascript:alert(1)", "data:image/png;base64,a", "blob:https://www.cc98.org/test", "file:///a.jpg", "https://me:secret@file.cc98.org/a.jpg", "https://file.cc98.org/a\n.jpg", "//file.cc98.org/a.jpg"]) assert.equal(core.imageUrl(url), "");
  assert.equal(core.codeFor("https://file.cc98.org/a[/img][b].png"), "[img]https://file.cc98.org/a%5B/img%5D%5Bb%5D.png[/img]");
  assert.equal(core.sourceUrl("https://www.cc98.org/topic/6677179/2#19"), "https://www.cc98.org/topic/6677179/2#19");
  assert.equal(core.sourceUrl("https://webvpn.zju.edu.cn/https/abc/topic/6677179/2#19"), "https://www.cc98.org/topic/6677179/2#19");
  for (const url of ["https://cc98.org.evil.test/topic/42", "https://evil.test/topic/42", "https://www.cc98.org:99/topic/42", "javascript:alert(1)", "https://www.cc98.org/user/id/42"]) assert.equal(core.sourceUrl(url), "");
  const source = { url: imageA, sourceHref: "https://www.cc98.org/topic/6677179/2#19", sourceTitle: "测试主题" };
  let items = core.mutate([], { action: "toggle", item: source }, 123);
  assert.deepEqual(items[0], { ...source, code: `[img]${imageA}[/img]`, note: "", createdAt: 123 });
  items = core.mutate(items, { action: "note", url: imageA, note: "欢迎\n测试" });
  assert.equal(items[0].note, "欢迎 测试");
  assert.equal(items[0].sourceTitle, "测试主题");
  assert.equal(items[0].createdAt, 123);
  assert.equal(core.normalize([items[0], { ...items[0], note: "duplicate" }, { url: "javascript:x" }]).length, 1);
  assert.equal(core.normalize([{ ...items[0], code: "[script]evil[/script]" }])[0].code, `[img]${imageA}[/img]`);
  assert.equal(core.mutate(items, { action: "remove", url: imageA }).length, 0);
  assert.throws(() => core.mutate([], { action: "note", url: imageA, note: "x" }), /不在收藏/);

  // Concurrent windows/side drawer updates share one background queue.
  const state = fakeChrome(), store = createStore({ chrome: state.chrome, now: () => 123 });
  const message = (action, extra, owner = "1001") => ({ type: "CC98_IMAGE_FAVORITES", owner, action, ...extra });
  await Promise.all([
    store.handle(message("toggle", { item: source }), sender),
    store.handle(message("toggle", { item: { url: imageB } }), sender),
    store.handle(message("note", { url: imageA, note: "保留最新备注" }), sender),
    store.handle(message("toggle", { item: { url: imageC } }), { ...sender, frameId: 2 })
  ]);
  assert.deepEqual(state.records[core.storageKey("1001")].map(item => item.url), [imageC, imageB, imageA]);
  assert.equal(state.records[core.storageKey("1001")][2].note, "保留最新备注");
  await store.handle(message("toggle", { item: { url: imageA } }, "1002"), sender);
  assert.equal(state.records[core.storageKey("1002")].length, 1);
  assert.equal(state.records[core.storageKey("1001")].length, 3);
  await assert.rejects(store.handle(message("toggle", { item: source }), { ...sender, url: "https://evil.test/" }), /此页面/);
  await assert.rejects(store.handle(message("toggle", { item: source }), { ...sender, id: "another-extension" }), /此页面/);

  const client = clientFixture({});
  let notifications = 0; client.api.subscribe(() => { notifications += 1; });
  await client.api.list(); assert.equal(client.api.isReady(), true);
  await client.api.toggle(source); assert.equal(client.api.has(imageA), true);
  await client.api.setNote(imageA, "备注"); assert.equal(client.api.getItems()[0].note, "备注");
  const copies = client.api.getItems(); copies[0].note = "not persisted";
  assert.equal(client.api.getItems()[0].note, "备注");
  client.setOwner("1002"); assert.equal(client.api.has(imageA), false);
  await client.api.list(); assert.equal(client.api.getItems().length, 0);
  await client.api.toggle({ url: imageB });
  assert.equal(client.records[core.storageKey("1001")][0].note, "备注");
  assert.equal(client.records[core.storageKey("1002")][0].url, imageB);
  client.setOwner(""); await assert.rejects(client.api.list(), /请先登录/); await assert.rejects(client.api.toggle(source), /请先登录/);
  assert.equal(client.api.getItems().length, 0); assert.equal(client.api.isReady(), false); assert(notifications > 2);

  // Account change while initial read is in flight must not issue a mutation.
  const reads = [], delayed = clientFixture({ [core.storageKey("1001")]: [core.item(source, 123)] }, { reads });
  const pending = delayed.api.toggle({ url: imageB });
  delayed.setOwner("1002"); reads.shift()();
  await assert.rejects(pending, /账号已变化/);
  assert.equal(delayed.sent.length, 0); assert.equal(delayed.api.getItems().length, 0);

  // A reply to an already-sent old-account mutation cannot populate the new account.
  const switching = clientFixture({}); await switching.api.list();
  let finishMutation;
  switching.chrome.runtime.sendMessage = (message, callback) => { finishMutation = () => callback({ ok: true, owner: message.owner, items: [core.item(source, 123)] }); };
  const oldMutation = switching.api.toggle(source); await tick();
  switching.setOwner("1002"); switching.api.getItems(); finishMutation();
  await assert.rejects(oldMutation, /账号已变化/); assert.equal(switching.api.getItems().length, 0);

  // A newer cross-tab storage change wins over an already started stale read.
  const delayed2 = clientFixture({}, { reads: [] });
  // Use a separate controlled local getter to expose stale completion.
  let finishRead;
  delayed2.chrome.storage.local.get = (key, callback) => { finishRead = () => callback({ [key]: [] }); };
  const load = delayed2.api.list();
  delayed2.listeners.forEach(listener => listener({ [core.storageKey("1001")]: { newValue: [core.item(source, 123)] } }, "local"));
  finishRead(); await load; assert.equal(delayed2.api.has(imageA), true);
  await tick();
  console.log("Image favorites: URL/UBB safety, metadata/dedup, serialized writes, source validation, account isolation and stale-read handling passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
