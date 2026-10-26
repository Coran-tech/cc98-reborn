const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');
const format = source.slice(source.indexOf('function normalizeSecurityWatermarkUserId('), source.indexOf('function readCachedSecurityWatermarkUserId('));
function boot(extra = {}) {
  const context = vm.createContext({ location: { href: 'https://www.cc98.org/newTopics' },
    getCc98RoutePathFromHref: href => { const u = new URL(href); return u.pathname + u.search + u.hash; }, ...extra });
  vm.runInContext(format, context);
  return context;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('two lines use six-digit UID, one ASCII space, eight-digit topic, fifteen-digit Unix seconds', () => {
  const c = boot();
  assert.deepEqual(plain(c.buildSecurityWatermarkLines(42, 123, 1700000000123)), ['000042 00000123', '000001700000000']);
  const lines = plain(c.buildSecurityWatermarkLines('795406', '6500000', 1792987329999));
  assert.match(lines[0], /^\d{6} \d{8}$/);
  assert.match(lines[1], /^\d{15}$/);
  assert.equal(Number(lines[1]), 1792987329);
  assert.equal(lines[0].split(' ').length, 2);
});

test('zero padding preserves the actual identity instead of truncating longer IDs', () => {
  const c = boot();
  assert.deepEqual(plain(c.buildSecurityWatermarkLines('000042', '000123', 1000)), ['000042 00000123', '000000000000001']);
  assert.equal(c.normalizeSecurityWatermarkUserId('1234567'), '1234567');
  for (const uid of ['', null, '0', -1, 'TEST0001', '42.5', '<42>']) assert.deepEqual(plain(c.buildSecurityWatermarkLines(uid, 1)), []);
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

test('only the locally bound numeric UID is read, without a webpage identity fallback', async () => {
  let binding = { bound: true, userId: 42, watermarkIdPrefix: 'TEST0001' };
  const c = boot({ OPENID_BINDING_STORAGE_KEY: 'binding', chrome: { runtime: {}, storage: { local: { get(key, callback) {
    assert.equal(key, 'binding'); callback({ binding });
  } } } } });
  const a = source.indexOf('function readOpenIdBindingSecurityWatermarkUserId(');
  vm.runInContext(source.slice(a, source.indexOf('async function getSecurityWatermarkUserId(', a)), c);
  assert.equal(await c.readOpenIdBindingSecurityWatermarkUserId(), '000042');
  binding = { bound: false, userId: 42 }; assert.equal(await c.readOpenIdBindingSecurityWatermarkUserId(), '');
  binding = { bound: true, watermarkIdPrefix: 'TEST0001' }; assert.equal(await c.readOpenIdBindingSecurityWatermarkUserId(), '');
});

function ownerContext(child) {
  const pending = [], started = [], remembered = [], timers = [], stops = [];
  const window = { setInterval: (...args) => { timers.push(args); return 1; } }; window.top = child ? {} : window;
  const context = vm.createContext({ window, WATERMARK_FEATURE_ENABLED: true, WATERMARK_REVALIDATE_INTERVAL: 300000,
    securityWatermarkRequestId: 0, securityWatermarkRevalidateTimer: 0,
    getSecurityWatermarkUserId: () => new Promise(resolve => pending.push(resolve)),
    rememberSecurityWatermarkUserId: value => remembered.push(value), startSecurityWatermark: value => started.push(value),
    stopSecurityWatermark: () => stops.push(true) });
  const start = source.indexOf('function ensureSecurityWatermark(options');
  vm.runInContext(source.slice(start, source.indexOf('function getRebuildTransitionRoutePath(', start)), context);
  return { context, pending, started, remembered, timers, stops };
}

test('child readers do not look up identity or start watermark repair/clock timers', () => {
  const c = ownerContext(true); c.context.ensureSecurityWatermark();
  assert.equal(c.pending.length, 0); assert.equal(c.timers.length, 0); assert.equal(c.started.length, 0); assert.equal(c.stops.length, 1);
});

test('a stale asynchronous binding read cannot overwrite a newer watermark identity', async () => {
  const c = ownerContext(false);
  c.context.ensureSecurityWatermark({ force: true }); c.context.ensureSecurityWatermark({ force: true });
  c.pending[1]('000002'); await Promise.resolve(); c.pending[0]('000001'); await Promise.resolve();
  assert.deepEqual(c.started, ['000002']); assert.deepEqual(c.remembered, ['000002']); assert.equal(c.timers.length, 1);
});
