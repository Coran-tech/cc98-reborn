const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');
const format = source.slice(source.indexOf('function normalizeSecurityWatermarkUserId('), source.indexOf('function readCachedSecurityWatermarkIdentity('));
function boot(extra = {}) {
  const context = vm.createContext({ location: { href: 'https://www.cc98.org/newTopics' },
    getCc98RoutePathFromHref: href => { const u = new URL(href); return u.pathname + u.search + u.hash; }, ...extra });
  vm.runInContext(format, context);
  return context;
}
const plain = value => JSON.parse(JSON.stringify(value));
const identity = (userId = 42, watermarkIdPrefix = 'TEST0001') => ({ userId, watermarkIdPrefix });

test('line one has eight-digit UID, exactly two ASCII spaces and eight-digit topic', () => {
  const c = boot();
  const lines = plain(c.buildSecurityWatermarkLines(identity(), 123, 1700000000123));
  assert.deepEqual(lines, ['00000042  00000123', 'TEST00011700000000']);
  assert.match(lines[0], /^\d{8} {2}\d{8}$/);
  assert.equal(lines[0].length, 18);
  assert.deepEqual([...lines[0].slice(8, 10)].map(char => char.charCodeAt(0)), [32, 32]);
});

test('line two joins the eight-character user watermark directly to ten-digit Unix seconds', () => {
  const c = boot();
  const lines = plain(c.buildSecurityWatermarkLines(identity('795406', 'AbCd1234'), '6500000', 1792987329999));
  assert.equal(lines[0], '00795406  06500000');
  assert.equal(lines[1], 'AbCd12341792987329');
  assert.equal(lines[1].length, 18);
  assert.equal(lines[1].slice(0, 8), 'AbCd1234');
  assert.match(lines[1].slice(8), /^\d{10}$/);
  assert.equal(Number(lines[1].slice(8)), 1792987329);
  assert.equal(/\s/.test(lines[1]), false);
});

test('padding is stable, preserves watermark case and never truncates real numeric IDs', () => {
  const c = boot();
  assert.deepEqual(plain(c.buildSecurityWatermarkLines(identity('000042', 'AbCd1234'), '000123', 1000)), ['00000042  00000123', 'AbCd12340000000001']);
  assert.equal(c.normalizeSecurityWatermarkUserId('123456789'), '123456789');
});

test('missing or invalid UID/watermark cannot produce a fabricated or partial watermark', () => {
  const c = boot();
  for (const uid of ['', null, '0', -1, 'TEST0001', '42.5', '<42>']) assert.deepEqual(plain(c.buildSecurityWatermarkLines(identity(uid), 1)), []);
  for (const prefix of ['', undefined, 'short', '123456789', '<script>']) assert.deepEqual(plain(c.buildSecurityWatermarkLines({ userId: 42, watermarkIdPrefix: prefix }, 1)), []);
});

test('topic follows the active drawer, including WebVPN paths; list pages use zero', () => {
  const c = boot();
  assert.equal(c.getSecurityWatermarkTopicId(), '0');
  c.location.href = 'https://www.cc98.org/topic/123#27';
  assert.equal(c.getSecurityWatermarkTopicId(), '123');
  c.CC98RebornTopicDrawer = { getTopicHref: () => 'https://www.cc98.org/topic/456/2?from=feed#11' };
  assert.equal(c.getSecurityWatermarkTopicId(), '456');
  c.CC98RebornTopicDrawer.getTopicHref = () => 'https://www-cc98-org-s.webvpn.zju.edu.cn/https/example/topic/789/2#11';
  assert.equal(c.getSecurityWatermarkTopicId(), '789');
  c.CC98RebornTopicDrawer.getTopicHref = () => '';
  c.location.href = 'https://www.cc98.org/search?next=/topic/987';
  assert.equal(c.getSecurityWatermarkTopicId(), '0');
});

test('the bound UID and user watermark are read together from extension storage only', async () => {
  let binding = { bound: true, ...identity() };
  const c = boot({ OPENID_BINDING_STORAGE_KEY: 'binding', chrome: { runtime: {}, storage: { local: { get(key, callback) {
    assert.equal(key, 'binding'); callback({ binding });
  } } } } });
  const a = source.indexOf('function readOpenIdBindingSecurityWatermarkIdentity(');
  vm.runInContext(source.slice(a, source.indexOf('async function getSecurityWatermarkIdentity(', a)), c);
  assert.deepEqual(plain(await c.readOpenIdBindingSecurityWatermarkIdentity()), identity('00000042'));
  binding = { bound: false, ...identity() }; assert.equal(await c.readOpenIdBindingSecurityWatermarkIdentity(), null);
  binding = { bound: true, userId: 42 }; assert.equal(await c.readOpenIdBindingSecurityWatermarkIdentity(), null);
  binding = { bound: true, watermarkIdPrefix: 'TEST0001' }; assert.equal(await c.readOpenIdBindingSecurityWatermarkIdentity(), null);
});

test('the cache holds one normalized UID/watermark snapshot rather than independent fields', () => {
  const c = boot({ securityWatermarkCachedIdentity: null, securityWatermarkCachedAt: 0, WATERMARK_CACHE_TTL: 1800000 });
  const a = source.indexOf('function readCachedSecurityWatermarkIdentity(');
  vm.runInContext(source.slice(a, source.indexOf('function readOpenIdBindingSecurityWatermarkIdentity(', a)), c);
  const original = identity(); c.writeCachedSecurityWatermarkIdentity(original); original.watermarkIdPrefix = 'DIFF0001';
  assert.deepEqual(plain(c.readCachedSecurityWatermarkIdentity()), identity('00000042'));
  c.clearCachedSecurityWatermarkIdentity(); assert.equal(c.readCachedSecurityWatermarkIdentity(), null);
});

function ownerContext(child) {
  const pending = [], started = [], remembered = [], timers = [], stops = [], cleared = [];
  const window = { setInterval: (...args) => { timers.push(args); return 1; } }; window.top = child ? {} : window;
  const context = vm.createContext({ window, WATERMARK_FEATURE_ENABLED: true, WATERMARK_REVALIDATE_INTERVAL: 300000,
    securityWatermarkRequestId: 0, securityWatermarkRevalidateTimer: 0,
    getSecurityWatermarkIdentity: () => new Promise(resolve => pending.push(resolve)),
    rememberSecurityWatermarkIdentity: value => remembered.push(value), startSecurityWatermark: value => started.push(value),
    clearCachedSecurityWatermarkIdentity: () => cleared.push(true), stopSecurityWatermark: () => stops.push(true) });
  const start = source.indexOf('function ensureSecurityWatermark(options');
  vm.runInContext(source.slice(start, source.indexOf('function getRebuildTransitionRoutePath(', start)), context);
  return { context, pending, started, remembered, timers, stops, cleared };
}

test('child readers do not look up identity or start watermark repair/clock timers', () => {
  const c = ownerContext(true); c.context.ensureSecurityWatermark();
  assert.equal(c.pending.length, 0); assert.equal(c.timers.length, 0); assert.equal(c.started.length, 0); assert.equal(c.stops.length, 1);
});

test('stale asynchronous reads cannot mix the old UID/watermark into the new binding', async () => {
  const c = ownerContext(false), old = identity('00000001', 'OLD00001'), current = identity('00000002', 'NEW00002');
  c.context.ensureSecurityWatermark({ force: true }); c.context.ensureSecurityWatermark({ force: true });
  c.pending[1](current); await Promise.resolve(); c.pending[0](old); await Promise.resolve();
  assert.deepEqual(c.started, [current]); assert.deepEqual(c.remembered, [current]); assert.equal(c.timers.length, 1);
});

test('a current incomplete binding clears cached identity and stops rendering', async () => {
  const c = ownerContext(false); c.context.ensureSecurityWatermark({ force: true }); c.pending[0](null); await Promise.resolve();
  assert.equal(c.cleared.length, 1); assert.equal(c.stops.length, 1); assert.equal(c.started.length, 0);
});
