import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function git(args, cwd = process.cwd()) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

export function existingFiles(output, cwd = process.cwd()) {
  return [...new Set(output.split("\0").filter(Boolean))]
    .filter((file) => {
      const full = path.resolve(cwd, file);
      if (!full.startsWith(path.resolve(cwd) + path.sep)) return false;
      try {
        return fs.lstatSync(full).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

export function repositoryFiles(cwd = process.cwd()) {
  return existingFiles(
    git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd),
    cwd
  );
}

export function changedFiles(base, cwd = process.cwd()) {
  return existingFiles(
    git(["diff", "--name-only", "--diff-filter=ACMR", "-z", base, "--"], cwd) +
      git(["ls-files", "--others", "--exclude-standard", "-z"], cwd),
    cwd
  );
}
