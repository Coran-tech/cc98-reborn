(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98ArchiveZip = api;
})(globalThis, function (root) {
  "use strict";
  const DB_NAME = "cc98-reborn-topic-archives", ZIP_LIMIT = 0xffffffff, CHUNK = 1024 * 1024;
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    crcTable[n] = value >>> 0;
  }
  const failure = message => new Error(message);

  function entryName(path) {
    if (typeof path !== "string" || !path || /[\\:<>"?*\x00-\x1f\x7f]/.test(path)
      || path.split("/").some(part => !part || part === "." || part === ".." || /[. ]$/.test(part)
        || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw failure("无效的 ZIP 文件名");
    const bytes = encoder.encode(path);
    if (bytes.length > 65535) throw failure("ZIP 文件名过长");
    return bytes;
  }
  function header(size) {
    const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
    return { bytes, u16: (offset, value) => view.setUint16(offset, value, true), u32: (offset, value) => view.setUint32(offset, value, true) };
  }
  function createWriter() {
    let chunks = [], entries = [], size = 0, disposed = false, finished = false, busy = false;
    const names = new Set();
    const active = () => { if (disposed || finished) throw failure("ZIP 导出已结束"); };
    return {
      async add(path, value) {
        active();
        if (busy) throw failure("请按顺序加入 ZIP 文件");
        const name = entryName(path);
        if (names.has(path)) throw failure("ZIP 文件名重复");
        if (names.size >= 65535) throw failure("ZIP 文件数量超过上限");
        if (!(value instanceof Blob) && typeof value !== "string" && !(value instanceof Uint8Array)) throw failure("不支持的 ZIP 文件数据");
        const blob = value instanceof Blob ? value : new Blob([value]);
        if (blob.size > ZIP_LIMIT || size + 30 + name.length + blob.size > ZIP_LIMIT) throw failure("ZIP 大小超过上限");
        busy = true;
        try {
          let crc = 0xffffffff;
          for (let offset = 0; offset < blob.size; offset += CHUNK) {
            const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer());
            active();
            for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
          }
          active(); crc = (crc ^ 0xffffffff) >>> 0;
          const local = header(30);
          local.u32(0, 0x04034b50); local.u16(4, 20); local.u16(6, 0x800); local.u16(8, 0);
          // A stable valid DOS timestamp; capture times remain in snapshot.json.
          local.u16(12, 33); local.u32(14, crc); local.u32(18, blob.size); local.u32(22, blob.size); local.u16(26, name.length);
          const central = header(46);
          central.u32(0, 0x02014b50); central.u16(4, 20); central.u16(6, 20); central.u16(8, 0x800);
          central.u16(14, 33); central.u32(16, crc); central.u32(20, blob.size); central.u32(24, blob.size);
          central.u16(28, name.length); central.u32(42, size);
          chunks.push(local.bytes, name, blob); entries.push(central.bytes, name); names.add(path);
          size += 30 + name.length + blob.size;
        } finally { busy = false; }
      },
      finish() {
        active();
        if (busy) throw failure("ZIP 文件仍在写入");
        const directorySize = entries.reduce((sum, part) => sum + part.byteLength, 0);
        if (size + directorySize + 22 > ZIP_LIMIT) throw failure("ZIP 大小超过上限");
        const end = header(22);
        end.u32(0, 0x06054b50); end.u16(8, names.size); end.u16(10, names.size); end.u32(12, directorySize); end.u32(16, size);
        const blob = new Blob([...chunks, ...entries, end.bytes], { type: "application/zip" });
        finished = true; chunks = []; entries = []; names.clear();
        return blob;
      },
      dispose() { disposed = true; chunks = []; entries = []; names.clear(); }
    };
  }

  // Bulk exports read the existing same-origin store directly, avoiding the
  // runtime message size limit and base64 copies. This reader never upgrades or
  // mutates the database; page/asset blobs are loaded one entry at a time.
  async function openSnapshot(id) {
    if (typeof id !== "string" || !/^[a-z0-9-]{12,80}$/i.test(id)) throw failure("无效的存档编号");
    const db = await new Promise((resolve, reject) => {
      let rejected = false;
      const opening = root.indexedDB.open(DB_NAME);
      opening.onupgradeneeded = () => { rejected = true; opening.transaction.abort(); reject(failure("本地存档数据库不存在，未创建或修改任何数据")); };
      opening.onerror = () => reject(opening.error || failure("无法读取本地存档"));
      opening.onblocked = () => { rejected = true; reject(failure("本地存档正在升级，请稍后重试")); };
      opening.onsuccess = () => { if (rejected) opening.result.close(); else resolve(opening.result); };
    });
    let closed = false;
    const close = () => { closed = true; db.close(); };
    db.onversionchange = close;
    const read = (storeName, work) => new Promise((resolve, reject) => {
      if (closed) { reject(failure("存档导出已关闭")); return; }
      let result, tx;
      try {
        tx = db.transaction(storeName, "readonly");
        const request = work(tx.objectStore(storeName));
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || failure("无法读取存档内容"));
        tx.oncomplete = () => closed ? reject(failure("存档导出已关闭")) : resolve(result);
        tx.onabort = tx.onerror = () => reject(tx.error || failure("存档读取中断"));
      } catch (error) { reject(error); }
    });
    try {
      if (db.version !== 1 || !["snapshots", "pages", "assets"].every(name => db.objectStoreNames.contains(name))) throw failure("不支持的存档数据库格式");
      const tx = db.transaction(["snapshots", "pages", "assets"], "readonly");
      if (tx.objectStore("snapshots").keyPath !== "id") throw failure("存档索引格式无效");
      for (const name of ["pages", "assets"]) {
        const store = tx.objectStore(name);
        if (store.keyPath !== "key" || !store.indexNames.contains("snapshotId") || store.index("snapshotId").keyPath !== "snapshotId") throw failure("存档索引格式无效");
      }
      const source = await read("snapshots", store => store.get(id));
      if (!source) throw failure("未找到这份本地存档");
      if (source.updateBaseId) throw failure("更新中的暂存数据不能导出，请打开原备份");
      if (source.status === "capturing") throw failure("这份存档仍在保存，请完成后再导出");
      // Promotion changes the persisted revision even when content is identical.
      // Keep the original record as a value, independent of the caller's copy,
      // so legacy counters/status/failures and deletion are checked as well.
      const baseline = JSON.stringify(source);
      const assertUnchanged = async () => {
        const current = await read("snapshots", store => store.get(id));
        if (!current || JSON.stringify(current) !== baseline) throw failure("备份已更新，请重新导出");
      };
      const { captureSource, ...snapshot } = source;
      const pageKeys = await read("pages", store => store.index("snapshotId").getAllKeys(id));
      const assetKeys = await read("assets", store => store.index("snapshotId").getAllKeys(id));
      if (pageKeys.some(key => !Array.isArray(key) || key[0] !== id || !Number.isSafeInteger(key[1]) || key[1] < 1)
        || assetKeys.some(key => !Array.isArray(key) || key[0] !== id || typeof key[1] !== "string")) throw failure("存档条目索引无效");
      const pages = pageKeys.map(key => key[1]).sort((a, b) => a - b), pageSet = new Set(pages);
      return {
        snapshot, pages, assetCount: assetKeys.length,
        async *assets() {
          for (const key of assetKeys) {
            const asset = await read("assets", store => store.get(key));
            if (!asset || asset.snapshotId !== id || asset.url !== key[1] || !(asset.blob instanceof Blob)
              || asset.blob.size !== asset.bytes) throw failure("已保存的媒体无法完整读取；原存档未修改");
            yield { url: asset.url, mime: asset.mime, bytes: asset.bytes, blob: asset.blob, kind: asset.kind };
          }
        },
        async readPage(page) {
          if (!pageSet.has(page)) throw failure("该页不在这份存档中");
          const saved = await read("pages", store => store.get([id, page]));
          if (!saved || saved.snapshotId !== id || saved.page !== page || !Array.isArray(saved.records)) throw failure("已保存的页面无法完整读取；原存档未修改");
          return saved;
        },
        assertUnchanged, close
      };
    } catch (error) { close(); throw error; }
  }
  return Object.freeze({ createWriter, openSnapshot });
});
