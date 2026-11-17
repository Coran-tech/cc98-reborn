import { defineWxtModule } from "wxt/modules";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The migration keeps runtime assets at their historical paths. Copying them
 * verbatim means `chrome.runtime.getURL("images/...")`, the legacy popup and
 * the KaTeX font URLs keep working while the JavaScript moves into bundles.
 */
const DIRECTORIES = ["images", "assets", "popup", "src/vendor/katex"];
const FILES = ["src/content-filter-frame.html", "src/content-filter-frame.js"];

function collectFiles(root: string, directory: string, output: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(root, absolute, output);
    } else if (entry.isFile()) {
      output.push(absolute.slice(root.length + 1));
    }
  }
  return output;
}

export default defineWxtModule({
  setup(wxt) {
    wxt.hook("build:publicAssets", (_wxt, assets) => {
      const root = resolve(process.cwd());
      for (const directory of DIRECTORIES) {
        for (const relative of collectFiles(root, resolve(root, directory))) {
          assets.push({ absoluteSrc: resolve(root, relative), relativeDest: relative });
        }
      }
      for (const relative of FILES) {
        assets.push({ absoluteSrc: resolve(root, relative), relativeDest: relative });
      }
    });
  }
});
