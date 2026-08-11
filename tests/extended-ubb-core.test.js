const assert = require("assert/strict");
const core = require("../src/extended-ubb-core.js");

assert.deepEqual(
  core.preferSavedSelection(
    { start: 10, end: 10, surface: "source" },
    { start: 0, end: 10, surface: "source" }
  ),
  { start: 0, end: 10, surface: "source" }
);

const wrapped = core.buildSourceEdit(
  "alpha beta",
  { start: 0, end: 10 },
  { before: "[quote]", after: "[/quote]" }
);
assert.equal(wrapped.nextValue, "[quote]alpha beta[/quote]");
assert.deepEqual(wrapped.nextSelection, { start: 7, end: 17 });

const collapsed = core.buildSourceEdit(
  "ab",
  { start: 1, end: 1 },
  { before: "[math]", after: "[/math]" }
);
assert.equal(collapsed.nextValue, "a[math][/math]b");
assert.deepEqual(collapsed.nextSelection, { start: 7, end: 7 });

const clamped = core.buildTableUbb(-1, 2147483647);
assert.equal((clamped.match(/\[tr\]/g) || []).length, 1);
assert.equal((clamped.match(/\[th\]/g) || []).length, 6);
assert.equal((clamped.match(/\[td\]/g) || []).length, 0);

const fractional = core.buildTableUbb(2.9, 3.9);
assert.equal((fractional.match(/\[tr\]/g) || []).length, 2);
assert.equal((fractional.match(/\[th\]/g) || []).length, 3);
assert.equal((fractional.match(/\[td\]/g) || []).length, 3);
assert.equal((core.buildTableUbb("invalid", 0).match(/\[th\]/g) || []).length, 1);

console.log("extended-ubb-core: ok");
