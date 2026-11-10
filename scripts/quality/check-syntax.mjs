import { spawnSync } from "node:child_process";
import path from "node:path";
import { ESLint } from "eslint";
import { repositoryFiles } from "./files.mjs";

// Explicitly use this repository's policy even when an ignored local checkout
// contains its own ESLint configuration and uninstalled dependencies.
const eslint = new ESLint({ overrideConfigFile: path.resolve("eslint.config.mjs") });
let checked = 0;
for (const file of repositoryFiles()) {
  if (!/\.(?:cjs|mjs|js)$/.test(file) || (await eslint.isPathIgnored(file))) continue;
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  checked++;
}
console.log(`JavaScript syntax: ${checked} maintained files checked.`);
