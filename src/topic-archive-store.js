(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornTopicArchiveStore = api;
})(globalThis, function (root) {
  "use strict";
  const DB_NAME = "cc98-reborn-topic-archives";
  const MIB = 1024 * 1024;
  const LIMITS = Object.freeze({ image: 25 * MIB, file: 100 * MIB, snapshot: 500 * MIB, page: 8 * MIB });
  const UI_PATHS = new Set(["/popup/archive.html", "/popup/popup.html"]);
  const STATUSES = new Set(["complete", "partial", "cancelled", "error"]);
  const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"]);
  const FILE_TYPES = new Set(["application/pdf", "application/zip", "application/x-zip-compressed", "application/x-7z-compressed", "application/vnd.rar", "application/x-rar-compressed", "application/gzip", "application/x-tar", "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/rtf", "text/plain", "text/csv", "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "video/mp4", "video/webm", "video/ogg", "video/quicktime"]);
  const error = message => new Error(message);
  const cleanString = (value, size) => typeof value === "string" ? value.slice(0, size) : "";
  const validId = value => typeof value === "string" && /^[a-z0-9-]{12,80}$/i.test(value);
  const numericId = value => /^[1-9]\d{0,15}$/.test(String(value || ""));
  const finiteTime = (value, fallback) => Number.isSafeInteger(value) && value > 0 ? value : fallback;
  const bytesOf = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;

  function createStore(options = {}) {
    const chrome = options.chrome || root.chrome;
    const idb = options.indexedDB || root.indexedDB;
    const fetchResource = options.fetch || root.fetch.bind(root);
    const clock = options.now || Date.now;
    const crypto = options.crypto || root.crypto;
    const limits = { ...LIMITS, ...options.limits };
    const own = new URL(chrome.runtime.getURL(""));
    const sessions = new Map(), locks = new Map();
    let database;

    function forumUrl(value) {
      try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol) && !url.username && !url.password && !url.port
          && (/^(?:www\.)?cc98\.org$/i.test(url.hostname) || /(?:^|\.)webvpn\.zju\.edu\.cn$/i.test(url.hostname)) ? url : null;
      } catch { return null; }
    }
    function forumSender(sender) {
      return sender?.id === chrome.runtime.id && Number.isInteger(sender.tab?.id) && sender.tab.id >= 0
        && Number.isInteger(sender.frameId) && sender.frameId >= 0 && Boolean(forumUrl(sender.url));
    }
    function uiSender(sender) {
      try {
        const url = new URL(sender?.url);
        return sender.id === chrome.runtime.id && url.protocol === own.protocol && url.hostname === own.hostname
          && !url.port && !url.username && !url.password && UI_PATHS.has(url.pathname);
      } catch { return false; }
    }
    function sourceKey(sender) { return JSON.stringify([sender.tab.id, sender.frameId, sender.documentId || sender.url]); }
    function sessionFor(id, sender) {
      const session = sessions.get(id);
      if (!validId(id) || !session || session.owner !== sourceKey(sender) || session.cancelled) throw error("存档任务已停止或不属于当前页面");
      return session;
    }
    function serial(id, work) {
      const next = (locks.get(id) || Promise.resolve()).catch(() => {}).then(work);
      locks.set(id, next);
      return next.finally(() => { if (locks.get(id) === next) locks.delete(id); });
    }
    function request(value) {
      return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error || error("本地存储读取失败")); });
    }
    function openDatabase() {
      if (database) return database;
      database = new Promise((resolve, reject) => {
        const opening = idb.open(options.databaseName || DB_NAME, 1);
        opening.onupgradeneeded = () => {
          const db = opening.result;
          db.createObjectStore("snapshots", { keyPath: "id" });
          for (const name of ["pages", "assets"]) db.createObjectStore(name, { keyPath: "key" }).createIndex("snapshotId", "snapshotId");
        };
        opening.onsuccess = () => {
          const db = opening.result;
          db.onversionchange = () => { db.close(); database = null; };
          resolve(db);
        };
        opening.onerror = () => { database = null; reject(opening.error || error("无法打开本地存档")); };
        opening.onblocked = () => { database = null; reject(error("本地存档正在被其他页面使用，请关闭后重试")); };
      });
      return database;
    }
    async function transaction(names, mode, run) {
      const db = await openDatabase(), tx = db.transaction(names, mode);
      const done = new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = tx.onerror = () => reject(tx.error || error("本地存储空间不足或写入失败"));
      });
      // Start handling failures immediately, even if an individual request also rejects.
      done.catch(() => {});
      try { const result = await run(tx); await done; return result; }
      catch (cause) { try { tx.abort(); } catch {} await done.catch(() => {}); throw cause; }
    }
    const getSnapshot = id => transaction(["snapshots"], "readonly", tx => request(tx.objectStore("snapshots").get(id)));
    function stopResources(session) {
      for (const controller of session.controllers) controller.abort();
      session.controllers.clear();
    }
    function summary(snapshot) {
      if (!snapshot) return null;
      const { captureSource, ...result } = snapshot;
      return { ...result, failures: failuresOf(result.failures) };
    }
    function requireWritable(snapshot) { if (!snapshot || snapshot.status !== "capturing") throw error("存档任务已结束"); }

    async function begin(meta, sender) {
      const url = forumUrl(meta?.url), source = forumUrl(sender.url);
      const topicId = String(meta?.topicId || "");
      if (!numericId(topicId) || !url || url.origin !== source.origin
        || url.pathname.match(/\/topic\/([1-9]\d*)(?:\/\d+)?\/?$/i)?.[1] !== topicId
        || source.pathname.match(/\/topic\/([1-9]\d*)(?:\/\d+)?\/?$/i)?.[1] !== topicId) throw error("无效的帖子地址");
      const id = crypto.randomUUID(), startedAt = finiteTime(meta.startedAt, clock());
      const snapshot = { version: 1, id, topicId, title: cleanString(meta.title, 1000) || `帖子 ${topicId}`, url: url.href,
        owner: cleanString(meta.owner, 200), startedAt, completedAt: null, includeFiles: meta.includeFiles === true,
        status: "capturing", pageCount: 0, recordCount: 0, bytes: 0, assetCount: 0, expectedPages: 0, error: "", failures: [], captureSource: sourceKey(sender) };
      await transaction(["snapshots"], "readwrite", tx => request(tx.objectStore("snapshots").add(snapshot)));
      sessions.set(id, { owner: sourceKey(sender), tabId: sender.tab.id, frameId: sender.frameId, documentId: sender.documentId,
        controllers: new Set(), pending: new Map(), failedResources: new Map(), cancelled: false });
      return { ok: true, id, snapshot: summary(snapshot) };
    }
    async function putPage(message, sender) {
      sessionFor(message.id, sender);
      const page = Number(message.page), result = message.result;
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Array.isArray(result?.records) || result.records.length > 200) throw error("无效的存档页数据");
      const records = result.records.map(record => {
        if (!record || !Number.isSafeInteger(Number(record.floor)) || Number(record.floor) < 1 || typeof record.contentHtml !== "string") throw error("无效的楼层数据");
        return { topicId: String(record.topicId), floor: Number(record.floor), user: cleanString(record.user, 500), uid: cleanString(String(record.uid || ""), 32),
          avatar: cleanString(record.avatar, 100000), publishedAt: cleanString(record.publishedAt, 200), contentHtml: record.contentHtml,
          signatureHtml: cleanString(record.signatureHtml, limits.page), extraHtml: cleanString(record.extraHtml, limits.page),
          metrics: record.metrics && typeof record.metrics === "object" ? JSON.parse(JSON.stringify(record.metrics)) : null,
          references: Array.isArray(record.references) ? record.references.slice(0, 1000).map(ref => ({ topicId: String(ref.topicId || ""), floor: Number(ref.floor) || 0 })) : [] };
      });
      const pageData = { key: [message.id, page], snapshotId: message.id, page, records, capturedAt: finiteTime(message.capturedAt, clock()) };
      pageData.bytes = bytesOf(pageData);
      if (pageData.bytes > limits.page) throw error("单页内容超过本地存档大小限制");
      return serial(message.id, () => transaction(["snapshots", "pages"], "readwrite", async tx => {
        sessionFor(message.id, sender);
        const snapshots = tx.objectStore("snapshots"), pages = tx.objectStore("pages");
        const snapshot = await request(snapshots.get(message.id)); requireWritable(snapshot);
        if (records.some(record => record.topicId !== snapshot.topicId)) throw error("楼层与存档帖子不一致");
        const previous = await request(pages.get(pageData.key));
        const bytes = snapshot.bytes - (previous?.bytes || 0) + pageData.bytes;
        if (bytes > limits.snapshot) throw error("本帖存档已达到本地大小上限");
        snapshot.bytes = bytes; snapshot.pageCount += previous ? 0 : 1;
        snapshot.recordCount += records.length - (previous?.records.length || 0);
        snapshot.expectedPages = Math.max(snapshot.expectedPages, page, Number.isSafeInteger(result.maxPage) ? result.maxPage : 0);
        if (page === 1 && result.title) snapshot.title = cleanString(result.title, 1000);
        await request(pages.put(pageData)); await request(snapshots.put(snapshot));
        return { ok: true, snapshot: summary(snapshot) };
      }));
    }
    function asciiAt(bytes, offset, value) {
      if (bytes.length < offset + value.length) return false;
      for (let index = 0; index < value.length; index++) if (bytes[offset + index] !== value.charCodeAt(index)) return false;
      return true;
    }
    function sniffImage(bytes) {
      if (bytes[0] === 137 && asciiAt(bytes, 1, "PNG")) return "image/png";
      if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
      if (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a")) return "image/gif";
      // Size fields contain arbitrary bytes: decoding them as UTF-8 changes the magic's offset.
      if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) return "image/webp";
      if (asciiAt(bytes, 0, "BM")) return "image/bmp";
      if (asciiAt(bytes, 4, "ftyp") && (asciiAt(bytes, 8, "avif") || asciiAt(bytes, 8, "avis"))) return "image/avif";
      return "";
    }
    function markdownMime(bytes) {
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw error("Markdown 附件不是有效的 UTF-8 纯文本"); }
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text)) throw error("Markdown 附件包含二进制或控制字符");
      const start = text.replace(/^\uFEFF/, "").trimStart();
      if (/^(?:<!doctype\s+html|<html\b|<script\b|<svg\b|<\?xml)/i.test(start)) throw error("不保存伪装成 Markdown 的网页或脚本附件");
      // Keep the original bytes and filename, but never present Markdown as executable or rendered HTML.
      return "text/plain";
    }
    function safeMime(type, bytes, kind, url) {
      const mime = String(type || "").split(";")[0].trim().toLowerCase();
      const head = new TextDecoder().decode(bytes.slice(0, 512)).replace(/^\uFEFF/, "").trim();
      if (/^(?:<!doctype\s+html|<html\b|<script\b|<svg\b|<\?xml)/i.test(head)
        || /(?:html|javascript|ecmascript|svg|xml|css|wasm)/i.test(mime) && !FILE_TYPES.has(mime)) throw error("不保存可执行网页或脚本资源");
      const image = sniffImage(bytes);
      if (kind === "image") {
        if (!image || !IMAGE_TYPES.has(image)) throw error("图片格式无法安全离线保存");
        return image;
      }
      if (/\.(?:html?|xhtml|svg|js|mjs|css|xml|wasm|exe|dll|msi|bat|cmd|ps1|sh|jar|scr)(?:[?#]|$)/i.test(url)) throw error("不保存可执行网页或脚本附件");
      if (mime === "text/markdown" || mime === "text/x-markdown"
        || mime === "application/octet-stream" && /\.(?:md|markdown)(?:[?#]|$)/i.test(url)) return markdownMime(bytes);
      if (image) return image;
      if (FILE_TYPES.has(mime)) return mime;
      if (mime === "application/octet-stream") {
        if (head.startsWith("%PDF-")) return "application/pdf";
        if (bytes[0] === 80 && bytes[1] === 75) return "application/zip";
        if (/\.(?:mp4|m4v)(?:[?#]|$)/i.test(url) && asciiAt(bytes, 4, "ftyp")) return "video/mp4";
      }
      throw error("附件格式暂不支持离线保存");
    }
    async function allowedResource(value) {
      let url;
      try { url = new URL(value); } catch { throw error("资源地址无效"); }
      if (url.username || url.password) throw error("不读取带登录信息的资源地址");
      if (url.protocol === own.protocol && url.hostname === own.hostname && !url.port
        && /^\/images\/[a-z0-9_./%-]+$/i.test(url.pathname) && !url.pathname.includes("..")) return url;
      if (url.protocol === "data:" && /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);base64,[a-z0-9+/=\s]+$/i.test(value)) return url;
      if (!/^https?:$/.test(url.protocol) || url.port || !url.hostname.includes(".")
        || /^\[|^(?:\d+\.){3}\d+$/.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid)$/i.test(url.hostname)) throw error("不读取本机或非公开资源地址");
      if (!chrome.permissions?.contains || !await chrome.permissions.contains({ origins: [url.origin + "/*"] })) throw error("没有访问此资源域名的权限");
      return url;
    }
    async function download(value, kind, session) {
      const url = await allowedResource(value), maximum = limits[kind];
      if (session.cancelled) throw error("存档已取消");
      if (url.protocol === "data:" && value.length > maximum * 1.4 + 200) throw error("资源超过单个文件大小限制");
      const controller = new AbortController(); session.controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || (kind === "file" ? 90000 : 30000));
      try {
        const authenticatedResource = /(?:^|\.)cc98\.org$|(?:^|\.)webvpn\.zju\.edu\.cn$/i.test(url.hostname);
        const response = await fetchResource(url.href, { credentials: authenticatedResource ? "include" : "omit", cache: "no-store", redirect: "error", signal: controller.signal });
        if (!response.ok) throw error(`资源下载失败（${response.status}）`);
        if (Number(response.headers.get("content-length")) > maximum) throw error("资源超过单个文件大小限制");
        const chunks = [], reader = response.body?.getReader(); let size = 0;
        if (!reader) throw error("无法读取资源数据");
        try {
          while (true) {
            const { value: chunk, done } = await reader.read();
            if (done) break;
            size += chunk.byteLength;
            if (size > maximum) { await reader.cancel(); throw error("资源超过单个文件大小限制"); }
            chunks.push(chunk);
          }
        } finally { reader.releaseLock(); }
        if (!size) throw error("资源内容为空");
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const mime = safeMime(response.headers.get("content-type"), bytes, kind, value);
        return { blob: new Blob([bytes], { type: mime }), mime, bytes: size };
      } catch (cause) {
        if (controller.signal.aborted) throw error(session.cancelled ? "存档已取消" : "资源下载超时");
        throw cause;
      } finally { clearTimeout(timer); session.controllers.delete(controller); }
    }
    async function putResource(message, sender) {
      const session = sessionFor(message.id, sender), value = String(message.url || "");
      const kind = message.kind === "file" ? "file" : "image";
      if (!value || value.length > limits.image * 1.4 + 200) throw error("资源地址过长或无效");
      const key = [message.id, value];
      const previous = await transaction(["assets"], "readonly", tx => request(tx.objectStore("assets").get(key)));
      if (previous) return { ok: true, asset: { url: value, mime: previous.mime, bytes: previous.bytes } };
      if (session.pending.has(value)) return session.pending.get(value);
      const work = (async () => {
        const snapshot = await getSnapshot(message.id); requireWritable(snapshot);
        if (kind === "file" && !snapshot.includeFiles) throw error("此快照未选择下载音视频和附件");
        const resource = await download(value, kind, session);
        return serial(message.id, () => transaction(["snapshots", "assets"], "readwrite", async tx => {
          sessionFor(message.id, sender);
          const snapshots = tx.objectStore("snapshots"), assets = tx.objectStore("assets");
          const current = await request(snapshots.get(message.id)); requireWritable(current);
          const old = await request(assets.get(key));
          if (old) return { ok: true, asset: { url: value, mime: old.mime, bytes: old.bytes } };
          if (current.bytes + resource.bytes > limits.snapshot) throw error("本帖存档已达到本地大小上限");
          await request(assets.add({ key, snapshotId: message.id, url: value, kind, ...resource }));
          current.bytes += resource.bytes; current.assetCount += 1;
          await request(snapshots.put(current));
          return { ok: true, asset: { url: value, mime: resource.mime, bytes: resource.bytes } };
        }));
      })();
      session.pending.set(value, work);
      try { const result = await work; session.failedResources.delete(value); return result; }
      catch (cause) { session.failedResources.set(value, { url: value, error: cleanString(cause?.message, 1000) || "资源未保存" }); throw cause; }
      finally { if (session.pending.get(value) === work) session.pending.delete(value); }
    }
    function failuresOf(value) {
      if (!Array.isArray(value)) return [];
      const failures = value.slice(0, 5000).map(item => ({ ...(Number.isSafeInteger(item?.page) && item.page > 0 ? { page: item.page } : {}),
        ...(typeof item?.url === "string" ? { url: item.url.slice(0, 4096) } : {}), error: cleanString(item?.error, 1000) || "未能保存" }));
      const detailKey = item => JSON.stringify([item.url, item.error]);
      const detailed = new Set(failures.filter(item => item.url && item.page).map(detailKey)), seen = new Set();
      return failures.filter(item => {
        if (item.url && !item.page && detailed.has(detailKey(item))) return false;
        const key = JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
    }
    async function finish(message, sender, cancelled = false) {
      const status = cancelled ? "cancelled" : message.status;
      if (!STATUSES.has(status)) throw error("无效的存档状态");
      const owner = sourceKey(sender), session = sessions.get(message.id);
      if (!validId(message.id) || session && session.owner !== owner) throw error("存档任务已停止或不属于当前页面");
      if (session) {
        if (cancelled) session.cancelled = true;
        stopResources(session);
      }
      return serial(message.id, () => transaction(["snapshots", "pages"], "readwrite", async tx => {
        const snapshots = tx.objectStore("snapshots"), snapshot = await request(snapshots.get(message.id));
        if (!snapshot || snapshot.captureSource !== owner) throw error("存档任务已停止或不属于当前页面");
        // ABORT may finish before the capture loop's finally sends FINISH. A retry acknowledges, never rewrites, that terminal state.
        if (STATUSES.has(snapshot.status)) return { ok: true, snapshot: summary(snapshot) };
        if (!session) throw error("存档任务已停止或不属于当前页面");
        requireWritable(snapshot);
        snapshot.expectedPages = Number.isSafeInteger(message.expectedPages) && message.expectedPages > 0 ? message.expectedPages : snapshot.expectedPages;
        snapshot.failures = failuresOf([...(Array.isArray(message.failures) ? message.failures : []), ...session.failedResources.values()]);
        const pages = await request(tx.objectStore("pages").index("snapshotId").getAll(message.id));
        const captured = new Set(pages.map(page => page.page));
        const complete = snapshot.recordCount > 0 && snapshot.expectedPages > 0 && snapshot.expectedPages <= 100000
          && captured.size === snapshot.expectedPages && Array.from({ length: snapshot.expectedPages }, (_, i) => i + 1).every(page => captured.has(page));
        snapshot.status = status === "complete" && (!complete || snapshot.failures.length) ? "partial" : status;
        snapshot.error = cleanString(message.error, 1000) || (status === "complete" && !complete ? "部分页面未保存" : "");
        snapshot.completedAt = clock();
        await request(snapshots.put(snapshot));
        sessions.delete(message.id);
        return { ok: true, snapshot: summary(snapshot) };
      }));
    }
    async function list() {
      const values = await transaction(["snapshots"], "readwrite", async tx => {
        const store = tx.objectStore("snapshots"), snapshots = await request(store.getAll());
        for (const snapshot of snapshots) {
          if (snapshot.status === "capturing" && !sessions.has(snapshot.id)) {
            snapshot.status = "partial"; snapshot.completedAt = clock(); snapshot.error = "读取已中断，可重新存档";
            await request(store.put(snapshot));
          }
        }
        return snapshots;
      });
      return { ok: true, items: values.sort((a, b) => b.startedAt - a.startedAt).map(summary) };
    }
    async function get(message) {
      const snapshot = await getSnapshot(message.id);
      if (!snapshot) throw error("未找到这份存档");
      return transaction(["pages"], "readonly", async tx => {
        const store = tx.objectStore("pages"), keys = await request(store.index("snapshotId").getAllKeys(message.id));
        const pageNumbers = keys.map(key => key[1]).sort((a, b) => a - b);
        let pages = [];
        if (message.page !== undefined) {
          if (!Number.isSafeInteger(message.page) || message.page < 1) throw error("无效的页码");
          const page = await request(store.get([message.id, message.page]));
          if (!page) throw error("该页未保存");
          pages = [{ page: page.page, records: page.records, capturedAt: page.capturedAt }];
        }
        return { ok: true, snapshot: summary(snapshot), pageNumbers, pages };
      });
    }
    async function asset(message) {
      const entry = await transaction(["assets"], "readonly", tx => request(tx.objectStore("assets").get([message.id, String(message.url || "")])));
      if (!entry) throw error("此资源未保存");
      const chunked = message.offset !== undefined;
      if (!chunked && entry.bytes > 16 * MIB) return { ok: true, chunked: true, url: entry.url, mime: entry.mime, bytes: entry.bytes };
      const offset = chunked ? message.offset : 0;
      const length = chunked ? (message.length === undefined ? 4 * MIB : message.length) : entry.bytes;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= entry.bytes || !Number.isSafeInteger(length) || length < 1 || chunked && length > 4 * MIB) throw error("无效的资源读取范围");
      const bytes = new Uint8Array(await entry.blob.slice(offset, offset + length).arrayBuffer());
      const pieces = [];
      for (let offset = 0; offset < bytes.length; offset += 32768) pieces.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
      const base64 = btoa(pieces.join(""));
      return { ok: true, url: entry.url, mime: entry.mime, bytes: entry.bytes, ...(chunked ? { base64, offset, length: bytes.length, nextOffset: offset + bytes.length } : { dataUrl: `data:${entry.mime};base64,${base64}` }) };
    }
    async function remove(message) {
      const session = sessions.get(message.id);
      if (session) { session.cancelled = true; stopResources(session); sessions.delete(message.id); }
      return serial(message.id, () => transaction(["snapshots", "pages", "assets"], "readwrite", async tx => {
        await request(tx.objectStore("snapshots").delete(message.id));
        for (const name of ["pages", "assets"]) {
          const store = tx.objectStore(name), keys = await request(store.index("snapshotId").getAllKeys(message.id));
          for (const key of keys) await request(store.delete(key));
        }
        return { ok: true };
      }));
    }
    function interruptSource(id, note) {
      const session = sessions.get(id);
      if (!session) return;
      session.cancelled = true; stopResources(session);
      serial(id, () => transaction(["snapshots"], "readwrite", async tx => {
        const store = tx.objectStore("snapshots"), snapshot = await request(store.get(id));
        if (snapshot?.status === "capturing") {
          snapshot.status = "partial"; snapshot.error = note; snapshot.completedAt = clock();
          snapshot.failures = failuresOf([...session.failedResources.values()]);
          await request(store.put(snapshot));
        }
      })).catch(() => {}).finally(() => { if (sessions.get(id) === session) sessions.delete(id); });
    }
    const tabRemoved = tabId => {
      for (const [id, session] of sessions) if (session.tabId === tabId) interruptSource(id, "原页面已关闭，存档中断");
    };
    const documentChanged = details => {
      for (const [id, session] of sessions) {
        if (session.tabId === details.tabId && (details.frameId === 0 || session.frameId === details.frameId)
          && (!session.documentId || details.documentId !== session.documentId)) interruptSource(id, "原页面已跳转，存档中断");
      }
    };
    chrome.tabs?.onRemoved?.addListener(tabRemoved);
    chrome.webNavigation?.onCommitted?.addListener(documentChanged);
    async function handle(message, sender) {
      try {
        const action = message?.type?.startsWith("CC98_ARCHIVE_") ? message.type.slice(13) : "";
        const forum = forumSender(sender), ui = uiSender(sender);
        if (["BEGIN", "PAGE", "RESOURCE", "FINISH", "ABORT"].includes(action)) {
          if (!forum) throw error("此页面不能创建存档");
        } else if (action === "OPEN" ? !(forum || ui) : !ui) throw error("此页面不能读取本地存档");
        if (action !== "BEGIN" && action !== "LIST" && action !== "OPEN" && !validId(message.id)) throw error("无效的存档编号");
        if (action === "BEGIN") return await begin(message.meta, sender);
        if (action === "PAGE") return await putPage(message, sender);
        if (action === "RESOURCE") return await putResource(message, sender);
        if (action === "FINISH") return await finish(message, sender);
        if (action === "ABORT") return await finish(message, sender, true);
        if (action === "LIST") return await list();
        if (action === "GET") return await get(message);
        if (action === "ASSET") return await asset(message);
        if (action === "DELETE") return await remove(message);
        if (action === "OPEN") {
          if (message.id !== undefined && !validId(message.id)) throw error("无效的存档编号");
          await chrome.tabs.create({ url: chrome.runtime.getURL("popup/archive.html") + (message.id ? "#" + message.id : "") });
          return { ok: true };
        }
        throw error("未知的存档操作");
      } catch (cause) {
        return { ok: false, error: cause?.name === "QuotaExceededError" ? "本地存储空间不足，请删除旧存档后重试" : cleanString(cause?.message, 1000) || "本地存档操作失败" };
      }
    }
    return { handle, close: async () => {
      chrome.tabs?.onRemoved?.removeListener(tabRemoved); chrome.webNavigation?.onCommitted?.removeListener(documentChanged);
      for (const session of sessions.values()) { session.cancelled = true; stopResources(session); }
      sessions.clear(); (await database)?.close(); database = null;
    } };
  }
  let instance;
  return { DB_NAME, LIMITS, createStore, handle(message, sender) { instance ||= createStore(); return instance.handle(message, sender); } };
});
