const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const { executable } = require('./new-topics-virtual.test.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/archive-large-export-20261028/large-validation');
const origin = 'https://archive.test';
const id = '00000000-1111-4222-8333-444444444444';
const MiB = 1024 * 1024;
const prefix = 'https://file.cc98.org/v4-upload/test-only/';

function png(width, height, shade) {
  const value = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    value.data[i] = shade; value.data[i + 1] = 65 + x % 120; value.data[i + 2] = 95 + y % 100; value.data[i + 3] = 255;
  }
  return PNG.sync.write(value);
}
const image = png(320, 120, 43), emoji = png(24, 24, 125);
const specs = Array.from({ length: 5 }, (_, i) => ({ url: prefix + 'image-' + i + '.png', mime: 'image/png', kind: 'image', size: 11 * MiB, head: [...image], fill: 50 + i }));
specs.push({ url: prefix + 'notes.md', mime: 'text/plain', kind: 'file', size: Math.floor(.9 * MiB), head: [...Buffer.from('# Synthetic saved notes\nNo real user data.\n')], fill: 32 });
specs.push({ url: 'https://www.cc98.org/static/images/ac/01.png', mime: 'image/png', kind: 'image', size: emoji.length, head: [...emoji], fill: 0 });
specs.push({ url: prefix + 'unreferenced.bin', mime: 'application/octet-stream', kind: 'file', size: 19, head: [...Buffer.from('unreferenced backup')], fill: 0 });
function bytesFor(spec) { const result = Buffer.alloc(spec.size, spec.fill); Buffer.from(spec.head).copy(result); return result; }

function crc32(data) {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let result = 0xffffffff;
  for (const byte of data) result = table[(result ^ byte) & 255] ^ (result >>> 8);
  return (result ^ 0xffffffff) >>> 0;
}
function zipEntries(bytes) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) if (bytes.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  assert(end >= 0, 'ZIP has an end-of-central-directory record');
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12), centralStart = bytes.readUInt32LE(end + 16);
  const entries = new Map(); let offset = centralStart;
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), crc = bytes.readUInt32LE(offset + 16);
    const packed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24), nameSize = bytes.readUInt16LE(offset + 28), extraSize = bytes.readUInt16LE(offset + 30), commentSize = bytes.readUInt16LE(offset + 32), local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    assert(flags & 0x800, 'UTF-8 ZIP filenames'); assert.equal(method, 0, 'binary store without compression copies'); assert.equal(packed, size);
    assert(!entries.has(name)); assert(!name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'));
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28), data = bytes.subarray(start, start + size);
    assert.equal(data.length, size); assert.equal(crc32(data), crc, 'ZIP CRC verifies ' + name);
    entries.set(name, data); offset += 46 + nameSize + extraSize + commentSize;
  }
  assert.equal(offset, centralStart + centralSize);
  return entries;
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: await executable(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, acceptDownloads: true });
  const errors = [], remote = [], csp = [];
  try {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { remote.push(url.href); return route.abort(); }
      if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated export fixture</title>' });
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try { await route.fulfill({ path: file }); } catch { await route.abort(); }
    });
    await context.addInitScript(() => {
      window.__archiveCalls = [];
      window.__archiveWrites = [];
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(names, mode, ...rest) {
        if (mode && mode !== 'readonly') window.__archiveWrites.push({ names, mode });
        return original.call(this, names, mode, ...rest);
      };
      const get = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const open = async () => get(indexedDB.open('cc98-reborn-topic-archives'));
      window.chrome = {
        runtime: { lastError: null, sendMessage(message, callback) {
          window.__archiveCalls.push({ type: message.type, page: message.page, url: message.url });
          const result = (async () => {
            const db = await open();
            try {
              if (message.type === 'CC98_ARCHIVE_LIST') return { ok: true, items: await get(db.transaction('snapshots').objectStore('snapshots').getAll()) };
              if (message.type === 'CC98_ARCHIVE_GET') {
                const tx = db.transaction(['snapshots', 'pages']);
                const [snapshot, keys, page] = await Promise.all([get(tx.objectStore('snapshots').get(message.id)), get(tx.objectStore('pages').index('snapshotId').getAllKeys(message.id)), message.page ? get(tx.objectStore('pages').get([message.id, message.page])) : null]);
                return { ok: true, snapshot, pageNumbers: keys.map(key => key[1]), pages: page ? [page] : [] };
              }
              if (message.type === 'CC98_ARCHIVE_ASSET') {
                const asset = await get(db.transaction('assets').objectStore('assets').get([message.id, message.url]));
                if (!asset) return { ok: false, error: '资源未保存' };
                const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(asset.blob); });
                return { ok: true, mime: asset.mime, bytes: asset.bytes, dataUrl, url: asset.url };
              }
              throw new Error('Unexpected mutation/message: ' + message.type);
            } finally { db.close(); }
          })().catch(error => ({ ok: false, error: error.message }));
          result.then(callback); return result;
        } },
        storage: { local: { get(_key, callback) { callback({ cc98ComfortSettings: { themeMode: 'dark', themeStyle: 'ascii', emojiScale: 140 } }); } }, onChanged: { addListener() {} } }
      };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Content Security Policy|violates.*style-src|Applying inline style/i.test(message.text())) csp.push(message.text()); });
    await page.goto(origin + '/fixture');
    const original = await page.evaluate(async ({ id, specs, prefix }) => {
      const db = await new Promise((resolve, reject) => {
        const opening = indexedDB.open('cc98-reborn-topic-archives', 1);
        opening.onupgradeneeded = () => { const db = opening.result; db.createObjectStore('snapshots', { keyPath: 'id' }); for (const name of ['pages', 'assets']) db.createObjectStore(name, { keyPath: 'key' }).createIndex('snapshotId', 'snapshotId'); };
        opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error);
      });
      const assets = specs.map(spec => { const bytes = new Uint8Array(spec.size).fill(spec.fill); bytes.set(spec.head); return { key: [id, spec.url], snapshotId: id, url: spec.url, kind: spec.kind, mime: spec.mime, bytes: bytes.length, blob: new Blob([bytes], { type: spec.mime }) }; });
      const pages = [], emoji = specs[6].url;
      for (let page = 1; page <= 119; page++) {
        const records = [];
        for (let j = 0; j < (page === 119 ? 2 : 10); j++) {
          const floor = (page - 1) * 10 + j + 1;
          const image = specs[(page - 1) % 5].url;
          const body = j === 0 ? `<p>第 ${page} 页：这是隔离测试内容，不是真实用户存档。</p><blockquote>引用里的图片也要保留<img data-cc98-archive-resource="${image}" alt="测试配图 ${page}"><img data-cc98-archive-resource="${emoji}" alt="[ac01]"></blockquote>` : `<p>第 ${floor} 楼的正文与数值：0 +1 -1。</p>`;
          records.push({ topicId: '7000001', floor, uid: '123456', user: 'SyntheticReader' + (floor % 9), avatar: emoji, publishedAt: '2026-10-28 18:00:00', contentHtml: body + (floor === 1 ? `<a data-cc98-archive-resource="${prefix}notes.md" download="notes.md">下载文件</a><img src="https://not-saved.invalid/image.png"><script>window.__attack=1</script><span style="background:url(https://attack.invalid/style)">样式不应执行</span>` : ''), signatureHtml: '<p>签名档 · 离线仍保留 <img data-cc98-archive-resource="' + emoji + '" alt="[ac01]"></p>', extraHtml: '<p>赞 12 · 踩 0 · 风评 +4</p>', metrics: { likes: 12, dislikes: 0, reputation: 4 }, references: [] });
        }
        const data = { key: [id, page], snapshotId: id, page, records, capturedAt: 1793184000000 + page };
        data.bytes = new TextEncoder().encode(JSON.stringify(data)).length; pages.push(data);
      }
      const snapshot = { version: 1, id, topicId: '7000001', title: '大型本地快照 · 119 页完整导出测试', owner: '123456', url: 'https://www.cc98.org/topic/7000001', status: 'partial', pageCount: 119, expectedPages: 119, recordCount: 1182, assetCount: assets.length, bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0) + pages.reduce((sum, page) => sum + page.bytes, 0), startedAt: 1793184000000, completedAt: 1793184300000, includeFiles: true, failures: [{ page: 89, url: 'https://www.bilibili.com/toy/204bang/index.html', error: '没有访问此资源域名的权限' }, { page: 1, url: 'https://not-saved.invalid/image.png', error: '测试未保存图片' }], error: '', captureSource: '[123,0,"test-private-document"]' };
      const tx = db.transaction(['snapshots', 'pages', 'assets'], 'readwrite');
      tx.objectStore('snapshots').add(snapshot);
      for (const row of pages) tx.objectStore('pages').add(row);
      for (const row of assets) tx.objectStore('assets').add(row);
      tx.objectStore('snapshots').add({ id: 'other-snapshot', title: 'Unrelated snapshot' });
      tx.objectStore('assets').add({ key: ['other-snapshot', prefix + 'private.bin'], snapshotId: 'other-snapshot', url: prefix + 'private.bin', bytes: 7, mime: 'application/octet-stream', blob: new Blob(['private']) });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); });
      db.close(); return { snapshot, pages };
    }, { id, specs, prefix });
    await page.goto(origin + '/popup/archive.html#' + id);
    await page.locator('.archive-post[data-floor="1"]').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.archive-content img')].some(img => img.alt === '测试配图 1' && img.naturalWidth === 320));
    assert.equal(await page.locator('.archive-post').count(), 10);
    const beforeHtmlGuard = await page.evaluate(() => __archiveCalls.length);
    await page.locator('#archive-export').click();
    await page.locator('#archive-error').filter({ hasText: '导出 ZIP' }).waitFor();
    assert.equal(await page.evaluate(() => __archiveCalls.length), beforeHtmlGuard, 'large single-file HTML is rejected before resource copying');
    const started = Date.now();
    const downloading = page.waitForEvent('download', { timeout: 180000 });
    await page.locator('#archive-export-zip').click();
    const download = await downloading, file = path.join(output, 'synthetic-large-snapshot.zip');
    await download.saveAs(file); assert.equal(await download.failure(), null);
    await page.waitForFunction(() => !document.querySelector('#archive-export-zip').disabled);
    const elapsedMs = Date.now() - started;
    assert.deepEqual(await page.evaluate(() => __archiveWrites), [], 'export only uses readonly IndexedDB transactions');
    assert.deepEqual(await page.evaluate(() => __archiveCalls.filter(call => !['CC98_ARCHIVE_GET', 'CC98_ARCHIVE_ASSET'].includes(call.type))), []);
    const after = await page.evaluate(async ({ id, specs }) => {
      const get = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const db = await get(indexedDB.open('cc98-reborn-topic-archives'));
      try {
        const snapshot = await get(db.transaction('snapshots').objectStore('snapshots').get(id));
        const pages = await get(db.transaction('pages').objectStore('pages').index('snapshotId').getAll(id));
        for (const spec of specs) {
          const asset = await get(db.transaction('assets').objectStore('assets').get([id, spec.url]));
          if (!asset || asset.bytes !== spec.size || asset.mime !== spec.mime) throw new Error('Asset metadata changed');
          const bytes = new Uint8Array(await asset.blob.arrayBuffer());
          for (let i = 0; i < bytes.length; i++) if (bytes[i] !== (i < spec.head.length ? spec.head[i] : spec.fill)) throw new Error('Asset bytes changed');
        }
        const unrelated = await get(db.transaction('assets').objectStore('assets').get(['other-snapshot', 'https://file.cc98.org/v4-upload/test-only/private.bin']));
        if (await unrelated.blob.text() !== 'private') throw new Error('Unrelated snapshot changed');
        return { snapshot, pages };
      } finally { db.close(); }
    }, { id, specs });
    assert.deepEqual(after, original, 'snapshot metadata and every raw page remain unchanged');
    const zip = await fs.readFile(file), entries = zipEntries(zip);
    const metadata = JSON.parse(entries.get('snapshot.json'));
    const { captureSource, ...publicSnapshot } = original.snapshot;
    assert.equal(metadata.id, id); assert.equal(metadata.status, 'partial'); assert.deepEqual(metadata.failures, publicSnapshot.failures);
    assert(!('captureSource' in metadata), 'internal document identity is not exported');
    const resources = JSON.parse(entries.get('resources.json'));
    assert(Array.isArray(resources)); assert.equal(resources.length, specs.length);
    assert.equal(entries.get('style.css')?.length > 0, true);
    const extracted = path.join(output, 'extracted'); await fs.mkdir(extracted, { recursive: true });
    for (const [name, bytes] of entries) {
      const target = path.resolve(extracted, name); assert(target.startsWith(extracted + path.sep));
      await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
    }
    const floors = new Set();
    for (const pageData of original.pages) {
      const number = String(pageData.page).padStart(6, '0');
      assert.deepEqual(JSON.parse(entries.get('pages/page-' + number + '.json')), pageData, 'raw page retained: ' + pageData.page);
      const name = pageData.page === 1 ? 'index.html' : 'page-' + number + '.html';
      const html = entries.get(name)?.toString('utf8'); assert(html, 'readable page exists: ' + name);
      assert(!/<script\b|<iframe\b|\bonerror\s*=|(?:src|poster)="(?:https?:|blob:|data:)/i.test(html), 'page has only inert local resource references');
      assert(!html.includes('window.__attack'));
      for (const match of html.matchAll(/data-floor="(\d+)"/g)) { assert(!floors.has(match[1])); floors.add(match[1]); }
      for (const match of html.matchAll(/(?:src|poster|href)="(media\/[^"#?]+)"/g)) assert(entries.has(match[1]), 'local resource exists');
    }
    assert.equal(floors.size, 1182); assert(floors.has('1') && floors.has('1182'));
    for (const spec of specs) {
      const resource = resources.find(resource => resource.url === spec.url);
      assert(resource, 'every stored resource is exported, including unreferenced resources');
      assert.equal(resource.bytes, spec.size); assert.equal(resource.mime, spec.mime);
      assert(entries.get(resource.path)?.equals(bytesFor(spec)), 'binary resource exactly preserved: ' + spec.url);
    }
    assert.equal([...entries.keys()].filter(name => name.startsWith('media/')).length, specs.length, 'each unique stored resource appears once');
    assert(zip.length < original.snapshot.bytes + 8 * MiB, 'no base64/repeated-media inflation');
    const oldInlineMediaLowerBound = 119 * Math.ceil(11 * MiB / 3) * 4;
    assert(oldInlineMediaLowerBound > 192 * MiB);
    const offline = await browser.newContext({ offline: true, viewport: { width: 1280, height: 960 }, acceptDownloads: true });
    try {
      await offline.addInitScript(() => { window.__violations = []; addEventListener('securitypolicyviolation', event => __violations.push(event.effectiveDirective)); });
      const local = await offline.newPage(); local.on('pageerror', error => errors.push(error.message));
      local.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
      await local.goto(pathToFileURL(path.join(extracted, 'index.html')).href);
      assert.equal(await local.locator('.archive-post').count(), 10);
      assert.equal(await local.locator('.archive-export-pagination').count(), 2);
      await local.locator('img[alt="测试配图 1"]').scrollIntoViewIfNeeded();
      await local.waitForFunction(() => document.querySelector('img[alt="测试配图 1"]').naturalWidth === 320);
      await local.screenshot({ path: path.join(output, 'offline-page-1.png') });
      await local.locator('.archive-export-pagination').first().getByRole('link', { name: '下一页', exact: true }).click();
      assert(local.url().endsWith('/page-000002.html')); assert.equal(await local.locator('.archive-post[data-floor="11"]').count(), 1);
      await local.locator('.archive-export-pagination').first().getByRole('link', { name: '第 119 页', exact: true }).click();
      assert(local.url().endsWith('/page-000119.html')); assert.equal(await local.locator('.archive-post').count(), 2); assert.equal(await local.locator('.archive-post[data-floor="1182"]').count(), 1);
      await local.locator('img[alt="测试配图 119"]').scrollIntoViewIfNeeded();
      await local.waitForFunction(() => document.querySelector('img[alt="测试配图 119"]').naturalWidth === 320);
      await local.screenshot({ path: path.join(output, 'offline-page-119.png') });
      await local.getByRole('link', { name: '全部页码', exact: true }).click();
      assert(local.url().endsWith('/contents.html'));
      assert.equal(await local.locator('a[href^="page-"]').count(), 118);
      assert.deepEqual(await local.evaluate(() => __violations), []);
    } finally { await offline.close(); }
    assert.deepEqual(errors, []); assert.deepEqual(remote, []); assert.deepEqual(csp, []);
    const report = { passed: true, syntheticOnly: true, browser: 'isolated Chromium', pages: 119, floors: floors.size, assetCount: specs.length, uniqueMediaBytes: specs.reduce((sum, spec) => sum + spec.size, 0), snapshotBytes: original.snapshot.bytes, zipBytes: zip.length, zipEntries: entries.size, oldInlineMediaLowerBound, elapsedMs, originalPartialFailures: metadata.failures.length, allStoredBytesUnchanged: true, archiveCRCChecked: true, largeHtmlGuardBeforeResourceRead: true, offlinePagination: [1, 2, 119], fullPageIndex: true, externalRequests: remote, errors, csp, suggestedFilename: download.suggestedFilename() };
    await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
