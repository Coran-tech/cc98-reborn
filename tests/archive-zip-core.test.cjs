"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createWriter } = require("../popup/archive-zip.js");
const { chromium } = require("playwright");
const { executable } = require("./new-topics-virtual.test.cjs");
const root = path.resolve(__dirname, ".."), output = path.join(root, "outputs/archive-large-export-20261028/core");

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
function unpackZip(data) {
  const end = data.length - 22;
  assert.equal(data.readUInt32LE(end), 0x06054b50);
  const count = data.readUInt16LE(end + 10), centralSize = data.readUInt32LE(end + 12), start = data.readUInt32LE(end + 16);
  assert.equal(start + centralSize, end);
  let position = start;
  const files = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(data.readUInt32LE(position), 0x02014b50);
    assert.equal(data.readUInt16LE(position + 8), 0x800);
    assert.equal(data.readUInt16LE(position + 10), 0);
    const crc = data.readUInt32LE(position + 16), size = data.readUInt32LE(position + 24), nameLength = data.readUInt16LE(position + 28);
    const name = data.subarray(position + 46, position + 46 + nameLength).toString("utf8"), local = data.readUInt32LE(position + 42);
    assert.equal(data.readUInt32LE(local), 0x04034b50); assert.equal(data.readUInt16LE(local + 6), 0x800);
    assert.equal(data.readUInt16LE(local + 8), 0); assert.equal(data.readUInt32LE(local + 14), crc);
    assert.equal(data.readUInt32LE(local + 18), size); assert.equal(data.readUInt32LE(local + 22), size);
    const localNameLength = data.readUInt16LE(local + 26);
    assert.equal(localNameLength, nameLength); assert.equal(data.subarray(local + 30, local + 30 + nameLength).toString("utf8"), name);
    const bytes = data.subarray(local + 30 + nameLength, local + 30 + nameLength + size);
    assert.equal(crc32(bytes), crc, name + " CRC32"); files.set(name, bytes);
    position += 46 + nameLength;
  }
  assert.equal(position, end);
  return files;
}
async function main() {
  await fs.mkdir(output, { recursive: true });
  const report = { checks: [] }, writer = createWriter();
  const binary = new Uint8Array(3 * 1024 * 1024 + 17);
  for (let i = 0; i < binary.length; i++) binary[i] = (i * 29 + 17) & 255;
  await writer.add("index.html", "<!doctype html><p>完整正文</p>");
  await writer.add("media/原始媒体.bin", new Blob([binary], { type: "application/octet-stream" }));
  await writer.add("pages/empty.txt", new Uint8Array());
  const source = Buffer.from(await writer.finish().arrayBuffer()), files = unpackZip(source);
  assert.deepEqual(files.get("media/原始媒体.bin"), Buffer.from(binary));
  assert.equal(files.get("index.html").toString(), "<!doctype html><p>完整正文</p>");
  assert.equal(files.get("pages/empty.txt").length, 0); assert.equal(files.size, 3);
  assert.throws(() => writer.finish(), /已结束/);
  await fs.writeFile(path.join(output, "core-fixture.zip"), source);
  report.checks.push("ZIP32 local/central directory, UTF-8 filenames, empty entries, > 3 MiB binary CRC and exact original bytes");
  const invalid = createWriter();
  for (const name of ["../x", "/x", "a//b", "a/./b", "a\\b", "C:/x", "a\u0000b", "a/COM1.txt", "a/x.", "a/x ", "a?b"]) await assert.rejects(invalid.add(name, "x"), /无效/);
  await invalid.add("a", "x"); await assert.rejects(invalid.add("a", "x"), /重复/);
  invalid.dispose(); await assert.rejects(invalid.add("b", "x"), /已结束/);
  const cancelled = createWriter(), pending = cancelled.add("big.bin", new Blob([binary])); cancelled.dispose();
  await assert.rejects(pending, /已结束/); assert.throws(() => cancelled.finish(), /已结束/);
  const concurrent = createWriter(), first = concurrent.add("first.bin", new Blob([binary]));
  await assert.rejects(concurrent.add("second.bin", "no"), /按顺序/); assert.throws(() => concurrent.finish(), /仍在写入/); await first; concurrent.dispose();
  report.checks.push("Path traversal/platform-unsafe paths, duplicate entries, concurrent writes, cancellation and closed writers rejected");
  const browser = await chromium.launch({ executablePath: await executable(), headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated read-only export test</title>" }));
    await page.goto("https://archive-export.test/");
    await page.addScriptTag({ content: await fs.readFile(path.join(root, "popup/archive-zip.js"), "utf8") });
    const checks = await page.evaluate(async () => {
      const ok = (value, message) => { if (!value) throw new Error(message); }, checks = [];
      const rejected = async (fn, pattern) => { let caught; try { await fn(); } catch (error) { caught = error; } ok(caught && pattern.test(caught.message), "expected rejection " + pattern + ": " + caught); };
      const id = "snapshot-test-0001", other = "snapshot-test-0002", name = "cc98-reborn-topic-archives";
      await rejected(() => CC98ArchiveZip.openSnapshot(id), /不存在/);
      ok(!(await indexedDB.databases()).some(db => db.name === name), "missing database not created");
      checks.push("Missing database aborted without creating it");
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("snapshots", { keyPath: "id" });
          for (const store of ["pages", "assets"]) request.result.createObjectStore(store, { keyPath: "key" }).createIndex("snapshotId", "snapshotId");
        };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const snapshot = { id, topicId: "6677099", status: "partial", pageCount: 2, assetCount: 2, recordCount: 3, failures: [{ page: 89, url: "https://example.invalid/missing", error: "未保存" }], captureSource: "private-source" };
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["snapshots", "pages", "assets"], "readwrite");
        tx.objectStore("snapshots").add(snapshot); tx.objectStore("snapshots").add({ id: other, status: "capturing" });
        for (const [number, records] of [[1, [{ floor: 1, contentHtml: "<p>正文</p>" }, { floor: 2, contentHtml: "" }]], [119, [{ floor: 1182, contentHtml: "最后一层" }]]]) tx.objectStore("pages").add({ key: [id, number], snapshotId: id, page: number, capturedAt: 1793190000000, records });
        tx.objectStore("pages").add({ key: [other, 1], snapshotId: other, page: 1, records: [] });
        for (const [url, data] of [["https://file.cc98.org/a.png", [0, 1, 2, 255]], ["https://file.cc98.org/orphan.bin", [7, 6, 5]]]) tx.objectStore("assets").add({ key: [id, url], snapshotId: id, url, kind: "image", mime: "image/png", bytes: data.length, blob: new Blob([new Uint8Array(data)], { type: "image/png" }) });
        tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
      });
      const originalTransaction = IDBDatabase.prototype.transaction, operations = [];
      IDBDatabase.prototype.transaction = function (names, mode, ...args) { operations.push({ names, mode }); return originalTransaction.call(this, names, mode, ...args); };
      const reader = await CC98ArchiveZip.openSnapshot(id);
      ok(reader.snapshot.status === "partial" && reader.snapshot.failures.length === 1 && !Object.hasOwn(reader.snapshot, "captureSource"), "metadata and partial capture preserved without private sender");
      ok(reader.pages.join() === "1,119" && reader.assetCount === 2, "only target snapshot pages/assets listed");
      ok((await reader.readPage(119)).records[0].floor === 1182, "requested original page read");
      ok((await reader.readPage(1)).records[1].contentHtml === "", "empty post preserved");
      await rejected(() => reader.readPage(2), /不在/);
      const assets = [];
      for await (const asset of reader.assets()) assets.push({ url: asset.url, bytes: Array.from(new Uint8Array(await asset.blob.arrayBuffer())) });
      ok(assets.length === 2 && assets.some(asset => asset.url.endsWith("orphan.bin") && asset.bytes.join() === "7,6,5"), "unreferenced saved assets preserved");
      ok(assets.some(asset => asset.url.endsWith("a.png") && asset.bytes.join() === "0,1,2,255"), "exact binary media returned");
      await reader.assertUnchanged();
      reader.close(); await rejected(() => reader.readPage(1), /关闭/);
      await rejected(() => reader.assertUnchanged(), /关闭/);
      await rejected(() => CC98ArchiveZip.openSnapshot(other), /仍在保存/);
      await rejected(() => CC98ArchiveZip.openSnapshot("not-existing-0001"), /未找到/);
      // Fixture writes intentionally bypass the readonly-operation observer.
      const replaceFixture = value => new Promise((resolve, reject) => {
        const tx = originalTransaction.call(db, "snapshots", "readwrite"), store = tx.objectStore("snapshots");
        if (value) store.put(value); else store.delete(id);
        tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
      });
      for (const patch of [{ revision: 1 }, { updatedAt: 1793190000001 }, { pageCount: 3 }, { recordCount: 4 }, { assetCount: 3 }, { bytes: 8192 }, { completedAt: 1793190000002 }, { failures: [] }, { title: "修改后的标题" }]) {
        const changing = await CC98ArchiveZip.openSnapshot(id);
        await replaceFixture({ ...snapshot, ...patch });
        await rejected(() => changing.assertUnchanged(), /^备份已更新，请重新导出$/);
        changing.close(); await replaceFixture(snapshot);
      }
      const revisioned = { ...snapshot, revision: 7, updatedAt: 1793190000001 };
      await replaceFixture(revisioned);
      const noChange = await CC98ArchiveZip.openSnapshot(id);
      await noChange.assertUnchanged();
      await replaceFixture({ ...revisioned, revision: 8 });
      await rejected(() => noChange.assertUnchanged(), /^备份已更新，请重新导出$/);
      noChange.close(); await replaceFixture(snapshot);
      const deleted = await CC98ArchiveZip.openSnapshot(id);
      await replaceFixture(null);
      await rejected(() => deleted.assertUnchanged(), /^备份已更新，请重新导出$/);
      deleted.close(); await replaceFixture({ ...snapshot, updateBaseId: other, status: "partial", updateReceipt: true });
      await rejected(() => CC98ArchiveZip.openSnapshot(id), /暂存数据不能导出/);
      await replaceFixture(snapshot);
      checks.push("Export detects same-ID promotion, revision-only no-op updates, timestamps/legacy metadata changes and deletion; staging rejected; unchanged snapshots accepted");
      ok(operations.length > 0 && operations.every(entry => entry.mode === "readonly"), "every export transaction is readonly");
      IDBDatabase.prototype.transaction = originalTransaction;
      const unchanged = await new Promise((resolve, reject) => { const request = db.transaction("snapshots", "readonly").objectStore("snapshots").get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      ok(JSON.stringify(unchanged) === JSON.stringify(snapshot), "original snapshot unchanged");
      checks.push("Readonly transactions only, partial failures/empty floors retained, snapshot isolation, orphan binary media, exact bytes, closing and capture guard");
      db.close();
      const upgraded = await new Promise((resolve, reject) => { const request = indexedDB.open(name, 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); upgraded.close();
      await rejected(() => CC98ArchiveZip.openSnapshot(id), /不支持/);
      ok((await indexedDB.databases()).find(db => db.name === name).version === 2, "unsupported schema unchanged");
      checks.push("Unsupported schema rejected without downgrade or mutation");
      return checks;
    });
    report.checks.push(...checks);
  } finally { await browser.close(); }
  report.ok = true;
  await fs.writeFile(path.join(output, "validation.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { unpackZip };
