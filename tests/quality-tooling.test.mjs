import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkFormatting } from "../scripts/quality/check-format.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "cc98-quality-"));
const git = (...args) =>
  execFileSync("git", args, { cwd: temporary, encoding: "utf8", stdio: "pipe" });
const write = (file, text) => fs.writeFile(path.join(temporary, file), text, "utf8");
try {
  git("init", "--quiet");
  await write("legacy.js", "const legacy={old:true}\n");
  git("add", "legacy.js");
  git(
    "-c",
    "user.name=Quality Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "Before formatter"
  );
  const initial = git("rev-parse", "HEAD").trim();
  await write(".prettierrc.json", '{ "semi": true }\n');
  await write(".prettierignore", "");
  await write(".format-bootstrap.json", '{ "legacyFiles": ["legacy.js"] }\n');
  await write("legacy.js", "const legacy={old:false}\n");
  let result = await checkFormatting({ cwd: temporary, base: initial });
  assert.deepEqual(result.failed, []);
  assert.equal(result.bootstrap, true);
  assert.equal(result.grandfathered, 1);

  await write("new.js", "const fresh={value:1}\n");
  result = await checkFormatting({ cwd: temporary, base: initial });
  assert(result.failed.includes("new.js"), "New files must be formatted even on first adoption");
  await checkFormatting({ cwd: temporary, files: ["new.js"], write: true });
  assert.deepEqual((await checkFormatting({ cwd: temporary, files: ["new.js"] })).failed, []);
  assert(
    (await checkFormatting({ cwd: temporary, files: ["legacy.js"] })).failed.includes("legacy.js"),
    "Explicit files never use the bootstrap exemption"
  );
  git("add", ".");
  git(
    "-c",
    "user.name=Quality Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "Adopt formatter"
  );
  const adopted = git("rev-parse", "HEAD").trim();
  await write("legacy.js", "const legacy={old:true,changed:1}\n");
  result = await checkFormatting({ cwd: temporary, base: adopted });
  assert.equal(result.bootstrap, false);
  assert(
    result.failed.includes("legacy.js"),
    "Modified legacy files must be formatted after adoption"
  );
  git("add", "legacy.js");
  git(
    "-c",
    "user.name=Quality Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "Change on a new branch"
  );
  const firstPush = await checkFormatting({ cwd: temporary, base: "0".repeat(40) });
  assert.equal(firstPush.bootstrap, false, "A new branch cannot restart first-adoption exemptions");
  assert(
    firstPush.failed.includes("legacy.js"),
    "First push of a new branch checks modified legacy files"
  );
  await assert.rejects(
    checkFormatting({ cwd: temporary, base: "0".repeat(40), defaultBranch: "missing" }),
    /Fetch its history or specify --base/
  );
  const currentBranch = git("branch", "--show-current").trim();
  git("checkout", "--quiet", "--orphan", "unrelated-history");
  git(
    "-c",
    "user.name=Quality Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "Unrelated root"
  );
  git("update-ref", "refs/remotes/origin/unrelated", "HEAD");
  git("checkout", "--quiet", currentBranch);
  await assert.rejects(
    checkFormatting({ cwd: temporary, base: "0".repeat(40), defaultBranch: "unrelated" }),
    /Fetch its history or specify --base/
  );
  await assert.rejects(checkFormatting({ cwd: temporary, base: "does-not-exist" }));

  const lint = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/eslint/bin/eslint.js"),
      "--stdin",
      "--stdin-filename",
      "src/quality-new-file.js"
    ],
    {
      cwd: root,
      input: "function run() { return definitelyMissingBinding; } run();\n",
      encoding: "utf8"
    }
  );
  assert.equal(lint.status, 1, lint.stderr);
  assert.match(lint.stdout, /no-undef/);
  console.log(
    "Quality tooling: first-adoption, new-file, changed-legacy-file, explicit-file, invalid-base and new lint violation checks passed."
  );
} finally {
  const target = path.resolve(temporary);
  assert(target.startsWith(path.resolve(os.tmpdir()) + path.sep + "cc98-quality-"));
  await fs.rm(target, { recursive: true, force: true });
}
