import { defineConfig } from "wxt";
import baseManifest from "./manifest.json";
import { CC98_EXCLUDE_MATCHES, CC98_MATCHES } from "./src/extension-matches";

// The legacy manifest stays the source of truth for permissions, host access,
// icons and web-accessible resources. Entrypoints replace content_scripts and
// the background worker, so those two fields are dropped here.
const { content_scripts: _contentScripts, background: _background, ...manifest } = baseManifest;

export default defineConfig({
  srcDir: ".",
  entrypointsDir: "entrypoints",
  outDir: "dist",
  manifest: {
    ...manifest,
    minimum_chrome_version: "116"
  },
  vite: () => ({
    build: {
      // Keep emitted chunk names readable for the manifest check and for
      // debugging a locally loaded extension.
      rollupOptions: {
        output: {
          chunkFileNames: "chunks/[name]-[hash].js",
          entryFileNames: "entrypoints/[name].js"
        }
      }
    }
  }),
  hooks: {
    // KaTeX ships 60 font files. Loading its stylesheet from the extension
    // origin keeps the font URLs relative and avoids inlining ~2 MB of base64
    // data into the content-script bundle.
    "build:manifestGenerated": (_wxt, generated) => {
      generated.content_scripts ??= [];
      generated.content_scripts.push({
        matches: CC98_MATCHES,
        exclude_matches: CC98_EXCLUDE_MATCHES,
        css: ["src/vendor/katex/katex.min.css"]
      });
    }
  }
});
