const assert = require("node:assert/strict");
const core = require("../src/theme-core.js");

for (const [theme, mode, palette] of [
  ["soft", "light", "teal"], ["mist", "light", "blue"], ["night", "dark", "teal"],
  ["sage", "light", "green"], ["lake", "light", "blue"], ["rose", "light", "rose"],
  ["graphite", "dark", "green"], ["midnight", "dark", "blue"], ["wine", "dark", "rose"]
]) {
  assert.deepEqual(core.normalize({ theme }), { ...core.DEFAULTS, themeMode: mode, themePalette: palette });
}
assert.deepEqual(core.normalize(null), core.DEFAULTS);
assert.deepEqual(core.normalize({ theme: "__proto__", themePalette: "constructor", themeMode: "system" }), core.DEFAULTS);
assert.equal(core.normalize({ theme: "wine", themeMode: "light", themePalette: "blue" }).themeMode, "light");
assert.equal(core.normalize({ theme: "night", themePalette: "amber" }).themePalette, "amber");
assert.equal(core.normalize({ themeStyle: "ascii", themeMode: "dark", themePalette: "violet" }).themeStyle, "ascii");
assert.equal(core.normalize({ themeStyle: "unknown" }).themeStyle, "modern");
assert.equal(core.resolveTone({ themeStyle: "ascii", themeMode: "dark" }), "dark");
assert.equal(core.normalizeColor(" #AbC "), "#aabbcc");
assert.equal(core.normalizeColor("#F0A021"), "#f0a021");
for (const value of [null, {}, 42, "abc", "#abcd", "#11223344", "red", "var(--x)", "#123; background:url(x)", "<svg/onload=1>"]) {
  assert.equal(core.normalizeColor(value), "", `reject unsafe/invalid color ${value}`);
}
assert.equal(core.normalize({ themePalette: "custom", themeCustomPrimary: "invalid" }).themeCustomPrimary, core.DEFAULTS.themeCustomPrimary);
assert.equal(core.normalize({ themePalette: "custom", themeCustomSecondary: "#ABC" }).themeCustomSecondary, "#aabbcc");

// Independent WCAG calculation verifies derived colors on the backgrounds
// actually used by labels, quoted content and active button states.
const colorChannels = (color) => [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
const blend = (first, second, ratio) => `#${colorChannels(first).map((value, index) => Math.round(value * ratio + colorChannels(second)[index] * (1 - ratio)).toString(16).padStart(2, "0")).join("")}`;
const lum = (color) => colorChannels(color).map((value) => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (first, second) => (Math.max(lum(first), lum(second)) + 0.05) / (Math.min(lum(first), lum(second)) + 0.05);
for (const selected of ["#000000", "#ffffff", "#808080", "#ffff00", "#00ff00", "#ff0000", "#0000ff", "#1f7166"]) {
  for (const tone of ["light", "dark"]) {
    const raw = { themePalette: "custom", themeCustomPrimary: selected, themeCustomSecondary: selected };
    const colors = core.resolveCustomColors(raw, tone);
    const backgrounds = tone === "light" ? ["#f6f7f8", "#ffffff", "#f0f1f3", "#e6e8eb"] : ["#16181b", "#212428", "#2b2e33", "#353940"];
    for (const kind of ["primary", "secondary"]) {
      const foreground = colors[kind], soft = colors[`${kind}Soft`];
      assert(/^#[\da-f]{6}$/.test(foreground));
      for (const background of [...backgrounds, soft, blend(foreground, backgrounds[1], 0.22), blend(foreground, backgrounds[2], 0.16)]) {
        assert(contrast(foreground, background) >= 4.5, `${selected}/${tone} ${kind} on ${background}`);
      }
    }
    assert.equal(core.normalize(raw).themeCustomPrimary, selected, "tone adaptation must retain the original selection");
  }
}
const customStyles = new Map([["--cc98-comfort-font-scale", "110%"]]);
const styledElement = { dataset: {}, classList: { contains: () => false }, style: {
  getPropertyValue: (property) => customStyles.get(property) || "",
  setProperty: (property, value) => customStyles.set(property, value),
  removeProperty: (property) => customStyles.delete(property)
} };
core.apply(styledElement, { themePalette: "custom", themeCustomPrimary: "#fff", themeCustomSecondary: "#000" });
assert.equal(customStyles.size, 6);
core.apply(styledElement, { themePalette: "blue" });
assert.deepEqual([...customStyles], [["--cc98-comfort-font-scale", "110%"]], "preset clears only owned custom variables");
core.apply(styledElement, { themePalette: "custom" });
core.apply(styledElement, { themePalette: "custom", enabled: false });
assert.equal(customStyles.size, 1, "disabled forum restores native variables");
styledElement.classList.contains = (name) => name === "cc98-reborn-popup";
core.apply(styledElement, { themePalette: "custom", enabled: false });
assert.equal(customStyles.size, 6, "popup can preview custom while the forum is disabled");
for (const time of ["", "7:00", "24:00", "19:60", "12:30:00", null, 420]) assert.equal(core.isValidTime(time), false);
for (const time of ["00:00", "07:00", "19:30", "23:59"]) assert.equal(core.isValidTime(time), true);
assert.deepEqual(core.normalize({ themeDayStart: "20:00", themeNightStart: "20:00" }), core.DEFAULTS);

const localTime = (time) => { const [h, m] = time.split(":").map(Number); return new Date(2026, 9, 13, h, m); };
for (const [time, expected] of [["00:00", "dark"], ["06:59", "dark"], ["07:00", "light"], ["18:59", "light"], ["19:00", "dark"], ["23:59", "dark"]]) {
  assert.equal(core.resolveTone({ themeMode: "auto" }, localTime(time)), expected, time);
  for (const themeMode of ["light", "dark"]) assert.equal(core.resolveTone({ themeMode }, localTime(time)), themeMode);
}
for (const [time, expected] of [["00:00", "light"], ["05:29", "light"], ["05:30", "dark"], ["20:44", "dark"], ["20:45", "light"]]) {
  assert.equal(core.resolveTone({ themeMode: "auto", themeDayStart: "20:45", themeNightStart: "05:30" }, localTime(time)), expected, `overnight ${time}`);
}
const element = { dataset: {} };
core.apply(element, { themeMode: "auto", themePalette: "rose" }, localTime("19:00"));
assert.equal(element.dataset.cc98ComfortTone, "dark");
core.apply(element, { themeMode: "auto", themePalette: "rose" }, localTime("07:00"));
assert.equal(element.dataset.cc98ComfortPalette, "rose");
assert.equal(element.dataset.cc98ComfortTone, "light");

let now = new Date(2026, 9, 13, 18, 59, 30, 125);
let stored = { themeMode: "auto", themePalette: "blue" };
let timer = null;
const listeners = new Map();
const host = {
  Date: class extends Date { constructor() { super(now); } },
  setTimeout(fn, ms) { timer = { fn, ms }; return 1; },
  clearTimeout() { timer = null; },
  addEventListener(type, fn) { listeners.set(type, fn); },
  removeEventListener(type) { listeners.delete(type); },
  document: { addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } }
};
const updates = [];
const stop = core.watch(() => stored, (settings, date) => updates.push(core.resolveTone(settings, date)), host);
assert.deepEqual(updates, ["light"]);
assert.equal(timer.ms, 29875, "timer aligns to local minute boundary");
now = localTime("19:00"); timer.fn();
assert.deepEqual(updates, ["light", "dark"]);
now = localTime("19:01"); timer.fn();
assert.equal(updates.length, 2, "unchanged minute does not re-render");
now = localTime("07:01"); listeners.get("visibilitychange")();
assert.equal(updates.at(-1), "light", "wake from background recomputes wall time");
stored = { ...stored, themeMode: "dark" }; listeners.get("focus")();
assert.equal(updates.at(-1), "dark");
assert.equal(timer, null, "manual mode has no timer");
stored = { ...stored, themeMode: "auto", enabled: false }; listeners.get("pageshow")();
assert.equal(timer, null, "disabled extension has no timer");
stop(); assert.equal(listeners.size, 0);
console.log("Theme core: migration, custom HEX validation/contrast/cleanup, day/night boundaries, overnight schedule, manual modes, wake-up and timer cleanup passed");
