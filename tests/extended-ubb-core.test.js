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

function applyFontSelection(marked, font = "Consolas") {
  const start = marked.indexOf("|");
  const closing = marked.indexOf("|", start + 1);
  const value = marked.replace(/\|/g, "");
  return core.applyFontToSource(value, { start, end: closing - 1 }, font);
}

for (const [marked, expected] of [
  ["[english]ab|cd|ef[/english]", "[english]ab[/english][font=Consolas]cd[/font][english]ef[/english]"],
  ["[font=Arial]ab|cd|ef[/font]", "[font=Arial]ab[/font][font=Consolas]cd[/font][font=Arial]ef[/font]"],
  ["[font=Arial]|ab|cd[/font]", "[font=Consolas]ab[/font][font=Arial]cd[/font]"],
  ["[font=Arial]ab|cd|[/font]", "[font=Arial]ab[/font][font=Consolas]cd[/font]"],
  ["[font=Arial]|abcd|[/font]", "[font=Consolas]abcd[/font]"],
  ["|[font=Arial]ab[font=SimSun]cd[/font]ef[/font]|", "[font=Consolas]abcdef[/font]"],
  ["[font=Arial]a|b[/font]c[font=SimSun]d|e[/font]", "[font=Arial]a[/font][font=Consolas]bcd[/font][font=SimSun]e[/font]"],
  ["[font=Arial][b]ab|cd|ef[/b][/font]", "[font=Arial][b]ab[/b][/font][font=Consolas][b]cd[/b][/font][font=Arial][b]ef[/b][/font]"],
  ["[b][font=Arial]ab|cd|ef[/font][/b]", "[b][font=Arial]ab[/font][font=Consolas]cd[/font][font=Arial]ef[/font][/b]"],
  ["[font=Arial]a[font=SimSun]b|c|d[/font]e[/font]", "[font=Arial]a[font=SimSun]b[/font][/font][font=Consolas]c[/font][font=Arial][font=SimSun]d[/font]e[/font]"],
  ["[font=Arial]ab||cd[/font]", "[font=Arial]ab[/font][font=Consolas][/font][font=Arial]cd[/font]"],
  ["|[code][font=Arial]literal[/font][/code]|", "[font=Consolas][code][font=Arial]literal[/font][/code][/font]"],
  ["|[font=Arial][color=#ff0000]red[/color]\n[url=https://example.org]link[/url][ac01][/font]|", "[font=Consolas][color=#ff0000]red[/color]\n[url=https://example.org]link[/url][ac01][/font]"]
]) {
  const result = applyFontSelection(marked);
  assert.equal(result.value, expected, marked);
  assert.equal(result.value.slice(result.start - "[font=Consolas]".length, result.start), "[font=Consolas]");
  const repeated = core.applyFontToSource(result.value, result, "Consolas");
  assert.equal(repeated.value, expected, `Repeated application: ${marked}`);
}
assert.equal(applyFontSelection("[code]li|ter|al[/code]"), null);
assert.equal(applyFontSelection("|text|", "Arial][color=red"), null);

for (const [tag, setting] of [["font", "Arial"], ["size", "5"]]) {
  const wrap = (text, value = setting) => `[${tag}=${value}]${text}[/${tag}]`;
  const source = wrap("abcdef");
  const start = source.indexOf("cd");
  const selection = { start, end: start + 2 };
  const cleared = core.applyTypographyToSource(source, selection, tag, null);
  assert.equal(cleared.value, `${wrap("ab")}cd${wrap("ef")}`);
  assert.equal(cleared.value.slice(cleared.start, cleared.end), "cd");
  assert.equal(core.applyTypographyToSource(cleared.value, cleared, tag, null).value, cleared.value);
  assert.equal(core.applyTypographyToSource(source, { start: 0, end: source.length }, tag, null).value, "abcdef");
  const caret = core.applyTypographyToSource(source, { start, end: start }, tag, null);
  assert.equal(caret.value, wrap("ab") + wrap("cdef"));
  assert.equal(caret.start, caret.end);
  const otherTag = tag === "font" ? "size" : "font";
  const otherValue = otherTag === "size" ? "3" : "Consolas";
  const styled = wrap(`[${otherTag}=${otherValue}][b]bold[/b][/${otherTag}]`);
  assert.equal(core.applyTypographyToSource(styled, { start: 0, end: styled.length }, tag, null).value,
    `[${otherTag}=${otherValue}][b]bold[/b][/${otherTag}]`);
}
assert.equal(core.applyTypographyToSource("[size=2]ab[size=6]cd[/size]ef[/size]",
  { start: 0, end: 100 }, "size", "5").value, "[size=5]abcdef[/size]");
assert.equal(core.applyTypographyToSource("text", { start: 0, end: 4 }, "size", "8"), null);

console.log("extended-ubb-core: ok");
