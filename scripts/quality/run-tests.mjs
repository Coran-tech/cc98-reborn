import { spawnSync } from "node:child_process";

// Preserve every test from the pre-tooling CI. Browser integration suites stay
// opt-in: they use the separately maintained local forum, not a live account.
const tests = [
  "tests/page-submit-monitor.test.js",
  "tests/openid-refresh.test.js",
  "tests/security-watermark.test.js",
  "tests/extended-ubb-core.test.js",
  "tests/markup-converter-core.test.js",
  "tests/question-mark-integration.test.js",
  "tests/conversation-core.test.js",
  "tests/media-resource-url.test.js",
  "tests/favorite-share-core.test.js",
  "tests/favorite-share-service.test.js",
  "tests/user-notes-core.test.js",
  "tests/image-favorites-core.test.cjs",
  "tests/settings-backup-core.test.js",
  "tests/theme-core.test.js",
  "tests/content-filter-core.test.js",
  "tests/title-filter.test.js",
  "tests/semantic-client.test.js",
  "tests/semantic-filter-core.test.js",
  "tests/semantic-background.test.js",
  "tests/semantic-filter.test.js",
  "tests/topic-live-api.test.js",
  "tests/home-live-core.test.cjs",
  "tests/home-rank-identity.test.cjs",
  "tests/quality-tooling.test.mjs"
];
for (const file of tests) {
  console.log(`\n--- ${file} ---`);
  const result = spawnSync(process.execPath, [file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`\nPassed ${tests.length} offline test programs.`);
