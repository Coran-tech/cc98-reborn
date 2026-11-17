const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const icons = read("src/ui/icons.ts");

function entriesOf(blockName) {
  const declaration = icons.indexOf(`const ${blockName}`);
  assert(declaration >= 0, `${blockName} block is missing`);
  const start = icons.indexOf("{", icons.indexOf("=", declaration));
  const end = icons.indexOf("\n};", start);
  assert(start >= 0 && end > start, `${blockName} block is not terminated`);
  return icons.slice(start, end);
}

const iconBlock = entriesOf("ICONS");
const asciiBlock = entriesOf("ASCII_LABELS");
const iconKeys = new Set(
  [...iconBlock.matchAll(/^\s{2}"?([a-z][\w-]*)"?:\s/gm)].map((match) => match[1])
);
const asciiValues = new Map(
  [...asciiBlock.matchAll(/^\s{2}"?([a-z][\w-]*)"?:\s*"([^"]*)"/gm)].map((match) => [
    match[1],
    match[2]
  ])
);

assert(iconKeys.size >= 30, `expected at least 30 registered icons, found ${iconKeys.size}`);
assert.deepEqual(
  [...asciiValues.keys()].sort(),
  [...iconKeys].sort(),
  "every icon must have exactly one ASCII label"
);

for (const [name, label] of asciiValues) {
  assert(label.trim().length > 0, `ASCII label for ${name} is empty`);
}

const entry = read("entrypoints/content.ts");
assert(
  entry.indexOf('import "../src/ui/install-icons";') <
    entry.indexOf('import "../src/theme-core.js";'),
  "icon registry must load before the legacy content modules"
);
assert(
  entry.includes('import "../src/ui/icons.css";'),
  "icon stylesheet must be part of the content bundle"
);

const content = read("src/content.js");
for (const marker of [
  'createRebornIcon("lock"',
  'createRebornIcon("flame"',
  'createRebornIcon("clock"',
  'applyRebornIcon(copyButton, "copy"',
  'applyRebornIcon(closeButton, "x"',
  'applyRebornIcon(prevButton, "chevron-left"',
  'applyRebornIcon(icon, "arrow-up"'
]) {
  assert(content.includes(marker), `content.js is missing icon wiring: ${marker}`);
}

for (const glyph of ["🔒 ", "🔥", "🕗", "🔗", "☺"]) {
  assert(!content.includes(`"${glyph}`), `rendered emoji still present in content.js: ${glyph}`);
}

const popup = read("entrypoints/popup/App.tsx");
assert(!popup.includes("ℹ️"), "the popup still renders a colour emoji");

console.log(
  `Icon registry: ${iconKeys.size} Lucide icons, ${asciiValues.size} ASCII labels, legacy wiring and entry order verified.`
);
