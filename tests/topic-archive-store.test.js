"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { executable } = require("./new-topics-virtual.test.cjs");
const root = path.resolve(__dirname, "..");

async function main() {
  const browser = await chromium.launch({ executablePath: await executable(), headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Local archive persistence test</title>" }));
    await page.goto("https://archive.test/");
    await page.addScriptTag({ content: await fs.readFile(path.join(root, "src/topic-archive-store.js"), "utf8") });
    const report = await page.evaluate(async () => {
      const checks = [], extensionId = "abcdefghijklmnopabcdefghijklmnop";
      const own = "chrome-extension://" + extensionId + "/";
      const forum = { id: extensionId, url: "https://www.cc98.org/topic/6500000/1", tab: { id: 3 }, frameId: 0, documentId: "document-a" };
      const ui = { id: extensionId, url: own + "popup/archive.html", tab: { id: 4 }, frameId: 0 };
      const message = (type, values = {}) => ({ type: "CC98_ARCHIVE_" + type, ...values });
      const ok = (condition, label) => { if (!condition) throw new Error(label); };
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
      let permission = true, behavior, calls = [], permissionCalls = [], tabs = [];
      const event = () => { const listeners = new Set(); return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn), emit: value => { for (const fn of listeners) fn(value); } }; };
      const removed = event(), committed = event();
      const chrome = { runtime: { id: extensionId, getURL: name => own + name },
        permissions: { async contains(input) { permissionCalls.push(input); return permission; } },
        tabs: { onRemoved: removed, async create(input) { tabs.push(input); return { id: 8 }; } }, webNavigation: { onCommitted: committed } };
      const fetch = async (url, options) => {
        calls.push({ url, credentials: options.credentials, redirect: options.redirect });
        if (behavior) return behavior(url, options);
        return new Response(bytes, { headers: { "content-type": "image/png" } });
      };
      const options = { chrome, fetch, indexedDB, databaseName: "archive-test-main", timeoutMs: 80 };
      let store = CC98RebornTopicArchiveStore.createStore(options);
      const send = (type, values, sender = forum) => store.handle(message(type, values), sender);
      const start = async (patch = {}, sender = forum) => {
        const result = await send("BEGIN", { meta: { topicId: "6500000", title: "完整帖子", url: forum.url, owner: "user:42", includeFiles: true, startedAt: Date.now(), ...patch } }, sender);
        ok(result.ok, "begin " + JSON.stringify(result)); return result.id;
      };
      const addPage = (id, page = 1, patch = {}) => send("PAGE", { id, page, result: { records: [{ topicId: "6500000", floor: (page - 1) * 10 + 1, user: "作者", uid: "42", contentHtml: "<p>正文、引用、图片</p>", signatureHtml: "<p>签名</p>", extraHtml: "<p>投票详情</p>", ...patch }], maxPage: 2, title: "来自第一页的标题" }, capturedAt: Date.now() });

      ok(!(await send("LIST", {}, forum)).ok, "forum cannot read local library");
      ok(!(await send("BEGIN", { meta: {} }, ui)).ok, "extension UI cannot impersonate capture");
      ok(!(await send("LIST", {}, { ...ui, id: "untrusted" })).ok, "extension ID checked");
      ok(!(await send("LIST", {}, { ...ui, url: own + "images/a.png" })).ok, "only intended UI pages can manage");
      ok(!(await send("BEGIN", { meta: { topicId: "6500000", url: "https://www.cc98.org/topic/999" } })).ok, "topic identity checked");
      checks.push("Sender, UI route and topic identity boundaries reject unrelated callers");

      const id = await start(), otherId = await start();
      ok(id !== otherId, "snapshots have independent IDs");
      ok(!(await addPage(id, 1, { topicId: "999" })).ok, "mixed-topic page rejected");
      ok(!(await send("PAGE", { id, page: 1, result: { records: [] } }, { ...forum, documentId: "other-document" })).ok, "capture document ownership checked");
      ok((await addPage(id)).ok, "page persisted");
      ok((await addPage(id, 1, { contentHtml: "<p>更新后正文</p>" })).ok, "repeated capture page updates in its own job");
      ok((await addPage(id, 2)).ok, "second page persisted");
      let metadata = await send("GET", { id }, ui);
      ok(metadata.ok && metadata.pageNumbers.join() === "1,2" && metadata.pages.length === 0, "metadata retrieval is page-light");
      ok(metadata.snapshot.recordCount === 2 && metadata.snapshot.pageCount === 2, "page overwrite counters remain accurate");
      let detail = await send("GET", { id, page: 1 }, ui);
      ok(detail.pages[0].records[0].contentHtml.includes("更新后") && detail.pages[0].records[0].signatureHtml.includes("签名") && detail.pages[0].records[0].extraHtml.includes("投票"), "all body sections survive persistence");
      checks.push("Page records persist independently, preserve signatures/extras, and maintain counters on retry");

      const asset = url => send("RESOURCE", { id, url, kind: "image" });
      const first = await asset("https://file.cc98.org/v4-upload/a.png"); ok(first.ok, "image saved");
      ok(calls.at(-1).credentials === "include" && calls.at(-1).redirect === "error", "forum media cookies usable; redirects cannot escape permission validation");
      const count = calls.length;
      const two = await Promise.all([asset("https://file.cc98.org/v4-upload/b.png"), asset("https://file.cc98.org/v4-upload/b.png"), asset("https://file.cc98.org/v4-upload/c.png")]);
      ok(two.every(value => value.ok) && calls.length - count === 2, "same URL de-duplicated while independent resources overlap");
      metadata = await send("GET", { id }, ui);
      ok(metadata.snapshot.assetCount === 3, "concurrent asset counters not lost");
      const read = await send("ASSET", { id, url: "https://file.cc98.org/v4-upload/a.png" }, ui);
      ok(read.ok && read.bytes === bytes.length && read.dataUrl.startsWith("data:image/png;base64,"), "asset reads local data only");
      const beforeRead = calls.length;
      await send("ASSET", { id, url: "https://file.cc98.org/v4-upload/missing.png" }, ui);
      ok(calls.length === beforeRead, "asset miss never fetches network");
      checks.push("Images store as local blobs; deduplication/concurrent accounting and offline reads work");

      const binary = (...parts) => new Uint8Array(parts.flatMap(part => typeof part === "string" ? Array.from(part, character => character.charCodeAt(0)) : Array.from(part)));
      const webpRegression = binary("RIFF", [0xc2, 0x80, 0, 0], "WEBP");
      const avifRegression = binary([0, 0, 0xc2, 0x80], "ftypavif");
      const mp4Regression = binary([0, 0, 0xc2, 0x80], "ftypisom");
      const oldWebpText = new TextDecoder().decode(webpRegression);
      ok(oldWebpText.indexOf("WEBP") === 7 && !/^RIFF[\s\S]{4}WEBP/.test(oldWebpText), "old WebP text sniff fails when binary length contains a valid UTF-8 sequence");
      ok(!/^....ftyp(?:avif|avis)/.test(new TextDecoder().decode(avifRegression)) && !/^....ftyp/.test(new TextDecoder().decode(mp4Regression)), "old AVIF/MP4 text offsets reproduce the same failure");
      const media = await start();
      const mediaCases = [
        ["webp-multibyte.webp", webpRegression, "image/webp", "image"],
        ["webp-linefeed.webp", binary("RIFF", [10, 0, 0, 0], "WEBP"), "image/webp", "image"],
        ["avif-multibyte.avif", avifRegression, "image/avif", "image"],
        ["avis-linefeed.avif", binary([0, 0, 0, 10], "ftypavis"), "image/avif", "image"],
        ["minimal.png", binary([137], "PNG"), "image/png", "image"],
        ["minimal.jpg", new Uint8Array([255, 216, 255]), "image/jpeg", "image"],
        ["minimal-87.gif", binary("GIF87a"), "image/gif", "image"],
        ["minimal-89.gif", binary("GIF89a"), "image/gif", "image"],
        ["minimal.bmp", binary("BM"), "image/bmp", "image"],
        ["mp4-multibyte.mp4", mp4Regression, "video/mp4", "file"],
        ["m4v-linefeed.m4v", binary([0, 0, 0, 10], "ftypM4V "), "video/mp4", "file"]
      ];
      for (const [name, payload, mime, kind] of mediaCases) {
        const url = "https://file.cc98.org/" + name;
        behavior = async () => new Response(payload, { headers: { "content-type": "application/octet-stream" } });
        const saved = await send("RESOURCE", { id: media, url, kind });
        ok(saved.ok && saved.asset.mime === mime, "fixed byte signatures preserve format: " + name);
        const local = await send("ASSET", { id: media, url }, ui);
        const localBytes = Uint8Array.from(atob(local.dataUrl.split(",")[1]), character => character.charCodeAt(0));
        ok(local.ok && local.mime === mime && localBytes.length === payload.length && localBytes.every((byte, index) => byte === payload[index]), "local media keeps every original byte: " + name);
      }
      const shiftedWebp = binary("RIFF", [0xc2, 0x80, 0, 0, 0], "WEBP");
      ok(/^RIFF[\s\S]{4}WEBP/.test(new TextDecoder().decode(shiftedWebp)), "old text sniff also incorrectly accepted a shifted WEBP marker");
      const badMedia = [
        ["shifted.webp", shiftedWebp, "image/webp", "image"],
        ["truncated.webp", binary("RIFF", [0, 0, 0, 0], "WEB"), "image/webp", "image"],
        ["wav.webp", binary("RIFF", [0, 0, 0, 0], "WAVE"), "image/webp", "image"],
        ["text.webp", binary("not an image"), "image/webp", "image"],
        ["shifted.avif", binary([0, 0, 0xc2, 0x80, 0], "ftypavif"), "image/avif", "image"],
        ["wrong-brand.avif", binary([0, 0, 0, 12], "ftypheic"), "image/avif", "image"],
        ["shifted.mp4", binary([0, 0, 0xc2, 0x80, 0], "ftypisom"), "application/octet-stream", "file"],
        ["text.mp4", binary("not a video"), "application/octet-stream", "file"]
      ];
      for (const [name, payload, mime, kind] of badMedia) {
        behavior = async () => new Response(payload, { headers: { "content-type": mime } });
        ok(!(await send("RESOURCE", { id: media, url: "https://file.cc98.org/" + name, kind })).ok, "MIME/extension cannot substitute for correct magic: " + name);
      }
      ok((await send("GET", { id: media }, ui)).snapshot.assetCount === mediaCases.length, "invalid media signatures never persist");
      behavior = null;
      checks.push("WebP/AVIF/MP4 use byte offsets despite UTF-8-like size fields; all existing raster signatures survive and shifted/truncated/wrong signatures reject");

      const markdown = await start(), markdownText = "# 本地附件\n\n中文内容、链接 [CC98](https://www.cc98.org/)\n\n```js\nwindow.example = 1;\n```\n";
      const markdownCases = [
        ["text/markdown; charset=utf-8", "note.md"], ["text/x-markdown", "note.markdown"],
        ["application/octet-stream", "5m3z23ao.md"], ["application/octet-stream", "note.MARKDOWN?download=1"], ["text/plain", "plain.md"],
        ["text/markdown", "code-start.md", "const x = 1;\n\n这是代码示例。"],
        ["text/x-markdown", "function-start.markdown", "function example() { return 1; }\n"],
        ["application/octet-stream", "shell.md", "#!/bin/sh\necho test"],
        ["application/octet-stream", "script.md", "// 示例代码\nwindow.example = 1;"],
        ["text/plain", "legacy-encoding.md", new Uint8Array([0x63, 0x61, 0x66, 0xe9])]
      ];
      for (const [mime, name, content = markdownText] of markdownCases) {
        const markdownBytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
        const url = "https://file.cc98.org/v4-upload/d/2026/1028/" + name;
        behavior = async () => new Response(markdownBytes, { headers: { "content-type": mime } });
        const saved = await send("RESOURCE", { id: markdown, url, kind: "file" });
        ok(saved.ok && saved.asset.mime === "text/plain" && saved.asset.url === url && saved.asset.bytes === markdownBytes.length, "Markdown accepts " + mime);
        const local = await send("ASSET", { id: markdown, url }, ui);
        const localBytes = Uint8Array.from(atob(local.dataUrl.split(",")[1]), character => character.charCodeAt(0));
        ok(local.ok && local.mime === "text/plain" && localBytes.length === markdownBytes.length && localBytes.every((byte, index) => byte === markdownBytes[index]), "Markdown local download keeps original content bytes");
        const previousCalls = calls.length;
        ok((await send("RESOURCE", { id: markdown, url, kind: "file" })).ok && calls.length === previousCalls, "Markdown retry reuses saved bytes");
      }
      ok((await send("GET", { id: markdown }, ui)).snapshot.assetCount === markdownCases.length, "Markdown retry does not duplicate accounting");
      checks.push("Markdown MIME variants and code-leading text persist as download-only text/plain with original bytes; existing text/plain encodings remain supported");

      const unsafeMarkdown = await start();
      const unsafeCases = [
        ["application/octet-stream", "invalid.md", new Uint8Array([0xc3, 0x28])],
        ["text/markdown", "binary.md", new Uint8Array([35, 32, 65, 0, 66])],
        ["text/x-markdown", "binary.markdown", bytes],
        ["application/octet-stream", "html.md", " ".repeat(600) + "<html>active</html>"],
        ["application/octet-stream", "svg.md", "<svg onload='alert(1)'/>"],
        ["application/javascript", "javascript.md", "alert(1)"],
        ["text/markdown", "javascript.js", markdownText],
        ["application/octet-stream", "unknown.bin", markdownText]
      ];
      for (const [mime, name, body] of unsafeCases) {
        behavior = async () => new Response(body, { headers: { "content-type": mime } });
        ok(!(await send("RESOURCE", { id: unsafeMarkdown, url: "https://file.cc98.org/" + name, kind: "file" })).ok, "unsafe Markdown rejected: " + name);
      }
      ok((await send("GET", { id: unsafeMarkdown }, ui)).snapshot.assetCount === 0, "invalid Markdown never persisted");
      behavior = null;
      checks.push("Markdown validation rejects invalid UTF-8, binary controls, disguised active content and script MIME/extensions");

      const dedup = await start(), failedUrl = "https://file.cc98.org/missing.md";
      behavior = async () => new Response("missing", { status: 404 });
      const failedAsset = await send("RESOURCE", { id: dedup, url: failedUrl, kind: "file" });
      ok(!failedAsset.ok, "resource failure fixture");
      behavior = null; await addPage(dedup);
      const repeatedFailures = [
        { url: failedUrl, error: failedAsset.error }, { page: 1, url: failedUrl, error: failedAsset.error },
        { page: 1, url: failedUrl, error: failedAsset.error }, { page: 2, url: failedUrl, error: failedAsset.error },
        { page: 1, url: failedUrl, error: "另一原因" }, { url: failedUrl, error: "另一原因" },
        { url: "https://file.cc98.org/other.md", error: failedAsset.error }
      ];
      const dedupFinished = await send("FINISH", { id: dedup, status: "complete", expectedPages: 1, failures: repeatedFailures });
      const compacted = dedupFinished.snapshot.failures;
      ok(dedupFinished.ok && dedupFinished.snapshot.status === "partial" && compacted.length === 4, "client and server failures merge without duplicate anonymous resource error");
      ok(compacted.filter(item => item.url === failedUrl && item.error === failedAsset.error).map(item => item.page).join() === "1,2", "same URL on different pages keeps each page");
      ok(compacted.some(item => item.page === 1 && item.error === "另一原因"), "different failure reasons retained");
      ok(JSON.stringify((await send("FINISH", { id: dedup, status: "complete", failures: repeatedFailures })).snapshot.failures) === JSON.stringify(compacted), "finished failure acknowledgement is idempotent");
      const oldFailures = async write => {
        const db = await new Promise((resolve, reject) => { const opening = indexedDB.open(options.databaseName, 1); opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
        try {
          return await new Promise((resolve, reject) => {
            const tx = db.transaction(["snapshots"], write ? "readwrite" : "readonly"), records = tx.objectStore("snapshots"), reading = records.get(dedup);
            let original;
            reading.onsuccess = () => { original = reading.result; if (write) { original.failures = repeatedFailures; records.put(original); } };
            tx.oncomplete = () => resolve(original.failures); tx.onerror = tx.onabort = () => reject(tx.error);
          });
        } finally { db.close(); }
      };
      await oldFailures(true);
      const oldGet = (await send("GET", { id: dedup }, ui)).snapshot.failures;
      const oldList = (await send("LIST", {}, ui)).items.find(item => item.id === dedup).failures;
      ok(JSON.stringify(oldGet) === JSON.stringify(compacted) && JSON.stringify(oldList) === JSON.stringify(compacted), "old snapshots use identical deduplicated GET and LIST summaries");
      ok((await oldFailures(false)).length === repeatedFailures.length, "summary cleanup does not rewrite existing archive data");
      checks.push("Failure summaries deduplicate same-URL same-reason generic entries, preserve page/reason distinctions and clean old snapshots without rewriting them");

      const denied = await start();
      let beforeDenied = calls.length;
      permission = false;
      ok(!(await send("RESOURCE", { id: denied, url: "https://cdn.example.com/a.png", kind: "image" })).ok, "missing permission rejected");
      permission = true;
      for (const url of ["http://127.0.0.1/a.png", "http://192.168.1.2/a.png", "https://localhost/a.png", "https://private.lan/a.png", own + "src/content.js", "data:image/svg+xml;base64,PHN2Zz4=", "https://name:password@file.cc98.org/a.png"]) ok(!(await send("RESOURCE", { id: denied, url, kind: "image" })).ok, url);
      ok(calls.length === beforeDenied, "denied resources not requested");
      behavior = async () => new Response("<svg onload='alert(1)'></svg>", { headers: { "content-type": "image/svg+xml" } });
      ok(!(await send("RESOURCE", { id: denied, url: "https://file.cc98.org/a.svg", kind: "image" })).ok, "active SVG rejected");
      behavior = async () => new Response("<html>active</html>", { headers: { "content-type": "text/html" } });
      ok(!(await send("RESOURCE", { id: denied, url: "https://file.cc98.org/a.html", kind: "file" })).ok, "active HTML attachment rejected");
      behavior = null;
      ok((await send("RESOURCE", { id: denied, url: own + "images/ac/01.png", kind: "image" })).ok, "own packaged emoji readable");
      ok((await send("RESOURCE", { id: denied, url: "data:image/png;base64,iVBORw0KGgoBAgME", kind: "image" })).ok, "safe inline raster image readable");
      ok((await addPage(denied)).ok, "partial page saved");
      const partial = await send("FINISH", { id: denied, status: "complete", expectedPages: 1, failures: [] });
      ok(partial.ok && partial.snapshot.status === "partial" && partial.snapshot.failures.length > 0, "resource failures cannot be silently called complete");
      checks.push("Host permissions/local addresses/active formats are guarded; failures force explicit partial state");

      const noFiles = await start({ includeFiles: false });
      beforeDenied = calls.length;
      ok(!(await send("RESOURCE", { id: noFiles, url: "https://file.cc98.org/a.pdf", kind: "file" })).ok && calls.length === beforeDenied, "optional large media honored");
      const finished = await send("FINISH", { id, status: "complete", expectedPages: 2, failures: [] });
      ok(finished.ok && finished.snapshot.status === "complete", "complete snapshot recorded");
      const duplicateFinish = await send("FINISH", { id, status: "partial", expectedPages: 99, error: "ignored retry" });
      ok(duplicateFinish.ok && duplicateFinish.snapshot.status === "complete" && duplicateFinish.snapshot.expectedPages === 2 && !duplicateFinish.snapshot.error, "terminal finish retry acknowledges without rewriting snapshot");
      ok((await send("ABORT", { id })).snapshot.status === "complete", "late abort cannot change completed snapshot");
      ok(!(await addPage(id)).ok, "finished snapshot immutable");
      ok((await send("OPEN", { id }, forum)).ok && tabs.at(-1).url === own + "popup/archive.html#" + id, "content can open local viewer");
      checks.push("Optional file saving, completeness validation, immutable completed versions and viewer opening work");

      const cancelled = await start(); await addPage(cancelled);
      behavior = (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
      const pending = send("RESOURCE", { id: cancelled, url: "https://file.cc98.org/pending.png", kind: "image" });
      await new Promise(resolve => setTimeout(resolve, 10));
      const aborted = await send("ABORT", { id: cancelled });
      ok(aborted.ok && aborted.snapshot.status === "cancelled" && !(await pending).ok, "cancel aborts in-flight media and keeps saved pages");
      const afterAbort = await send("FINISH", { id: cancelled, status: "complete", expectedPages: 1 });
      ok(afterAbort.ok && afterAbort.snapshot.status === "cancelled", "capture finally can acknowledge aborted snapshot");
      ok((await send("ABORT", { id: cancelled })).snapshot.status === "cancelled", "repeated abort is idempotent");
      ok(!(await send("FINISH", { id: cancelled, status: "complete" }, { ...forum, documentId: "other-document" })).ok, "other document cannot acknowledge or inspect terminal capture");
      behavior = null;
      checks.push("Cancellation stops requests, preserves saved pages and supports same-document terminal acknowledgements without rewriting state");

      const large = await start();
      behavior = async () => { const payload = new Uint8Array(17 * 1024 * 1024); payload.set(bytes); return new Response(payload, { headers: { "content-type": "image/png" } }); };
      ok((await send("RESOURCE", { id: large, url: "https://file.cc98.org/large-valid.png", kind: "image" })).ok, "large resource saved");
      const largeMeta = await send("ASSET", { id: large, url: "https://file.cc98.org/large-valid.png" }, ui);
      ok(largeMeta.ok && largeMeta.chunked && !largeMeta.dataUrl && largeMeta.bytes === 17 * 1024 * 1024, "large asset avoids oversized runtime message");
      const headChunk = await send("ASSET", { id: large, url: "https://file.cc98.org/large-valid.png", offset: 0, length: 4 * 1024 * 1024 }, ui);
      const tailChunk = await send("ASSET", { id: large, url: "https://file.cc98.org/large-valid.png", offset: 16 * 1024 * 1024, length: 4 * 1024 * 1024 }, ui);
      ok(headChunk.ok && headChunk.nextOffset === 4 * 1024 * 1024 && atob(headChunk.base64).length === headChunk.length, "first asset chunk bounded");
      ok(tailChunk.ok && tailChunk.length === 1024 * 1024 && tailChunk.nextOffset === largeMeta.bytes, "last asset chunk clipped accurately");
      ok(!(await send("ASSET", { id: large, url: "https://file.cc98.org/large-valid.png", offset: -1, length: 1 }, ui)).ok, "invalid range rejected");
      behavior = null;
      checks.push("Large assets use bounded chunks with exact offsets rather than oversized extension messages");

      const closedSource = await start(); await addPage(closedSource);
      committed.emit({ tabId: 3, frameId: 0, documentId: "new-native-document" });
      for (let n = 0; n < 20; n++) { if ((await send("GET", { id: closedSource }, ui)).snapshot.status === "partial") break; await new Promise(resolve => setTimeout(resolve, 5)); }
      ok((await send("GET", { id: closedSource }, ui)).snapshot.status === "partial", "source navigation marks interrupted capture");
      ok(!(await addPage(closedSource)).ok, "old document cannot keep writing after navigation");
      checks.push("Source document navigation aborts owned jobs and records interruption");

      const interrupted = await start(); await addPage(interrupted);
      await store.close(); store = CC98RebornTopicArchiveStore.createStore(options);
      const listing = await send("LIST", {}, ui);
      ok(listing.items.find(item => item.id === interrupted).status === "partial", "restart marks interrupted capture");
      ok(listing.items.find(item => item.id === id).status === "complete", "completed snapshot survives restart");
      ok((await send("GET", { id: interrupted, page: 1 }, ui)).pages[0].records.length === 1, "interrupted data survives");
      ok((await send("DELETE", { id }, ui)).ok, "snapshot deleted");
      ok(!(await send("GET", { id }, ui)).ok && !(await send("ASSET", { id, url: "https://file.cc98.org/v4-upload/a.png" }, ui)).ok, "delete clears metadata/pages/assets together");
      checks.push("Restart recovery, persistence without website login and atomic whole-snapshot deletion work");

      const small = CC98RebornTopicArchiveStore.createStore({ ...options, databaseName: "archive-test-limits", limits: { image: 20, file: 100, snapshot: 1600, page: 1400 } });
      const smallSend = (type, values, sender = forum) => small.handle(message(type, values), sender);
      const smallId = (await smallSend("BEGIN", { meta: { topicId: "6500000", url: forum.url, includeFiles: true } })).id;
      behavior = async () => new Response(new Uint8Array(21), { headers: { "content-type": "image/png", "content-length": "21" } });
      ok(!(await smallSend("RESOURCE", { id: smallId, url: "https://file.cc98.org/large.png", kind: "image" })).ok, "content length limit enforced");
      behavior = async () => new Response(new Uint8Array(21), { headers: { "content-type": "image/png" } });
      ok(!(await smallSend("RESOURCE", { id: smallId, url: "https://file.cc98.org/chunked-large.png", kind: "image" })).ok, "streaming limit enforced without length");
      behavior = (url, opts) => new Promise((resolve, reject) => opts.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      const timeout = await smallSend("RESOURCE", { id: smallId, url: "https://file.cc98.org/timeout.png", kind: "image" });
      ok(!timeout.ok && timeout.error.includes("超时"), "download timeout explicit");
      behavior = null;
      ok(!(await smallSend("PAGE", { id: smallId, page: 1, result: { records: [{ topicId: "6500000", floor: 1, contentHtml: "x".repeat(1800) }] } })).ok, "oversized pages reject without silent truncation");
      const boundedPage = number => smallSend("PAGE", { id: smallId, page: number, result: { records: [{ topicId: "6500000", floor: (number - 1) * 10 + 1, contentHtml: "x".repeat(800) }] } });
      ok((await boundedPage(1)).ok, "first bounded page saved");
      const savedBytes = (await smallSend("GET", { id: smallId }, ui)).snapshot.bytes;
      ok(!(await boundedPage(2)).ok, "total snapshot size limit enforced");
      ok((await smallSend("GET", { id: smallId }, ui)).snapshot.bytes === savedBytes, "limit failure rolls back counters and data atomically");
      checks.push("Header/stream/page limits and network timeout report failures without saving corrupt resources");
      await small.close(); await store.close();
      return { passed: true, checks, realIndexedDB: true, mockedNetwork: true, productionRequests: 0, networkCalls: calls.length, permissionChecks: permissionCalls.length };
    });
    assert(report.passed && report.checks.length >= 8);
    const output = path.join(root, "outputs/topic-archive/storage");
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, "validation.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
