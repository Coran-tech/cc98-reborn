import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..", "..");
const dist = path.join(root, "dist", "chrome-mv3");
const failures = [];

function fail(message) {
  failures.push(message);
}

function exists(relative) {
  return fs.existsSync(path.join(dist, relative));
}

if (!fs.existsSync(dist)) {
  console.error("Built extension not found. Run `pnpm build` first.");
  process.exit(1);
}

const manifestPath = path.join(dist, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("dist/chrome-mv3/manifest.json is missing.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const references = new Set();

if (manifest.background?.service_worker) references.add(manifest.background.service_worker);
for (const icon of Object.values(manifest.icons ?? {})) references.add(icon);
for (const icon of Object.values(manifest.action?.default_icon ?? {})) references.add(icon);
if (manifest.action?.default_popup) references.add(manifest.action.default_popup);

for (const script of manifest.content_scripts ?? []) {
  for (const file of script.js ?? []) references.add(file);
  for (const file of script.css ?? []) references.add(file);
}

for (const relative of references) {
  if (!exists(relative)) fail(`manifest references missing file: ${relative}`);
}

const wildcardResources = (manifest.web_accessible_resources ?? []).flatMap(
  (entry) => entry.resources ?? []
);
for (const resource of wildcardResources) {
  if (!resource.endsWith("/*")) continue;
  const directory = path.join(dist, path.dirname(resource.replace(/\/\*$/, "")));
  if (!fs.existsSync(directory)) fail(`web accessible resource directory is missing: ${resource}`);
}

const contentScript = (manifest.content_scripts ?? []).find((script) =>
  (script.js ?? []).some((file) => /(?:^|\/)content\.js$/.test(file))
);
if (!contentScript) fail("content script entry for content.js is missing");
if (!contentScript?.css?.length) fail("content script entry has no CSS");
if (contentScript?.run_at !== "document_start") fail("content script must run at document_start");

const expectedEntries = ["content", "topic-drawer", "page-submit-monitor", "openid-webvpn-bridge"];
for (const name of expectedEntries) {
  const found = (manifest.content_scripts ?? []).some((script) =>
    (script.js ?? []).some((file) => file.endsWith(`/${name}.js`))
  );
  if (!found) fail(`content script entry is missing: ${name}`);
}

const background = fs.readFileSync(path.join(dist, manifest.background.service_worker), "utf8");
if (background.includes("importScripts(")) {
  fail("bundled service worker still calls importScripts()");
}

const bundle = fs.readFileSync(path.join(dist, contentScript.js[0]), "utf8");
for (const marker of ["cc98-comfort-app", "cc98-rebuild", "CC98RebornThemeCore"]) {
  if (!bundle.includes(marker)) fail(`content bundle is missing marker: ${marker}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Built manifest: ${references.size} referenced files, ${(manifest.content_scripts ?? []).length} content scripts, ${wildcardResources.length} web accessible resources.`
);
