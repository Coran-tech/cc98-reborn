import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { changedFiles, git, repositoryFiles } from "./files.mjs";

function firstPushBase(cwd, defaultBranch) {
  if (defaultBranch) {
    try {
      const ancestor = git(
        ["merge-base", "HEAD", `refs/remotes/origin/${defaultBranch}`],
        cwd
      ).trim();
      if (ancestor !== git(["rev-parse", "HEAD"], cwd).trim()) return ancestor;
    } catch (error) {
      throw new Error(
        "Cannot compare the first push with the remote default branch. Fetch its history or specify --base explicitly.",
        { cause: error }
      );
    }
  }
  try {
    return git(["rev-parse", "--verify", "HEAD^"], cwd).trim();
  } catch {
    return null; // The root commit has no earlier formatting policy.
  }
}

export async function checkFormatting({
  cwd = process.cwd(),
  base = "HEAD",
  files,
  write = false,
  defaultBranch
} = {}) {
  let bootstrap = false;
  if (!files) {
    if (base.startsWith("-")) throw new Error("--base must identify a commit");
    if (/^0{40}$/.test(base)) base = firstPushBase(cwd, defaultBranch);
    if (base === null) bootstrap = true;
    else {
      git(["rev-parse", "--verify", `${base}^{commit}`], cwd);
      const names = git(["ls-tree", "--name-only", base, "--", ".prettierrc.json"], cwd).trim();
      bootstrap = names !== ".prettierrc.json";
    }
  }
  const candidates = files || (base === null ? repositoryFiles(cwd) : changedFiles(base, cwd));
  const legacy = bootstrap
    ? new Set(
        JSON.parse(await fs.readFile(path.join(cwd, ".format-bootstrap.json"), "utf8")).legacyFiles
      )
    : new Set();
  const failed = [];
  let checked = 0;
  let grandfathered = 0;
  for (const relative of [...new Set(candidates)].sort()) {
    const file = path.resolve(cwd, relative);
    if (!file.startsWith(path.resolve(cwd) + path.sep))
      throw new Error(`File leaves repository: ${relative}`);
    const info = await prettier.getFileInfo(file, {
      ignorePath: path.join(cwd, ".prettierignore")
    });
    if (info.ignored || !info.inferredParser) continue;
    // Only the first introduction of the formatter can retain these exact
    // legacy paths. Once the base has the config, this list is never consulted.
    if (legacy.has(relative.replaceAll("\\", "/"))) {
      grandfathered++;
      continue;
    }
    const source = await fs.readFile(file, "utf8");
    const options = { ...(await prettier.resolveConfig(file)), filepath: file };
    checked++;
    if (write) {
      const formatted = await prettier.format(source, options);
      if (source !== formatted) await fs.writeFile(file, formatted, "utf8");
    } else if (!(await prettier.check(source, options))) failed.push(relative);
  }
  return { checked, grandfathered, bootstrap, failed };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    base: process.env.FORMAT_BASE_REF || "HEAD",
    defaultBranch: process.env.FORMAT_DEFAULT_BRANCH,
    write: false
  };
  while (args.length) {
    const arg = args.shift();
    if (arg === "--base") {
      options.base = args.shift();
      if (!options.base) throw new Error("--base requires a commit");
    } else if (arg === "--write") options.write = true;
    else if (arg === "--files") {
      options.files = args.splice(0);
      if (!options.files.length) throw new Error("--files requires at least one path");
    } else if (arg === "--all") options.files = repositoryFiles();
    else throw new Error(`Unknown option: ${arg}`);
  }
  const result = await checkFormatting(options);
  for (const file of result.failed) console.error(`Formatting required: ${file}`);
  console.log(
    `Prettier: ${result.checked} checked${result.bootstrap ? `; first-adoption legacy paths left unchanged: ${result.grandfathered}` : ""}.`
  );
  if (result.failed.length) {
    console.error("Use npm run format -- --files <paths...> to format only the intended files.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
