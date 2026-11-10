import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.match(manifest.version, /^\d+(?:\.\d+){0,3}$/);
const references = [
  ...manifest.content_scripts.flatMap((script) => [...(script.js || []), ...(script.css || [])]),
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon)
];
for (const file of references) {
  const resolved = path.resolve(root, file);
  assert(resolved.startsWith(root + path.sep), `Manifest path leaves project: ${file}`);
  assert(fs.statSync(resolved).isFile(), `Missing runtime file: ${file}`);
}
console.log(
  `Manifest ${manifest.version}: ${new Set(references).size} runtime references checked.`
);
