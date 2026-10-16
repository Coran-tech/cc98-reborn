"use strict";
const assert = require("node:assert/strict");
const core = require("../src/semantic-filter-core.js");
let checks = 0;
function check(name, fn) { fn(); checks++; }
const enabled = { ...core.DEFAULTS, semanticFilterEnabled: true };
const response = (model, values = {}) => ({ schemaVersion: 1, results: [{ model, revision: "test-revision", ...values }] });
check("defaults are disabled and have six flat fields", () => {
  assert.equal(core.DEFAULTS.semanticFilterEnabled, false); assert.equal(Object.keys(core.DEFAULTS).length, 6);
  assert.deepEqual(core.normalize(undefined), core.DEFAULTS); assert(Object.isFrozen(core.DEFAULTS));
});
check("unrelated settings do not enter output or signature", () => {
  assert.deepEqual(core.normalize({ ...enabled, token: "do-not-copy", themeMode: "dark" }), enabled);
  assert.equal(core.signature({ ...enabled, token: "do-not-copy" }), core.signature(enabled));
});
check("line whitespace and CRLF are normalized", () => {
  const normalized = core.normalize({ ...enabled, semanticFilterLabels: " a \r\n b \n c ", semanticFilterBlockedLabels: " c \n a " }, { strict: true });
  assert.equal(normalized.semanticFilterLabels, "a\nb\nc"); assert.equal(normalized.semanticFilterBlockedLabels, "c\na");
});
for (const patch of [
  { semanticFilterEnabled: "true" }, { semanticFilterModel: "unknown" }, { semanticFilterThreshold: "0.8" },
  { semanticFilterThreshold: NaN }, { semanticFilterThreshold: -0.01 }, { semanticFilterThreshold: 1.01 },
  { semanticFilterLabels: "one" }, { semanticFilterLabels: "One\none" }, { semanticFilterLabels: "a\n" + "x".repeat(61) },
  { semanticFilterLabels: Array(13).fill("x").map((value, index) => value + index).join("\n") },
  { semanticFilterBlockedLabels: "not-a-candidate" }, { semanticFilterBlockedLabels: "人身攻击\n人身攻击" },
  { semanticFilterHypothesisTemplate: "missing" }, { semanticFilterHypothesisTemplate: "{} {}" },
  { semanticFilterHypothesisTemplate: "{named} {}" }, { semanticFilterHypothesisTemplate: "x".repeat(199) + "{}" }
]) check("invalid configuration fails open", () => {
  const normalized = core.normalize({ ...enabled, ...patch });
  assert.equal(normalized.semanticFilterEnabled, false);
  assert.throws(() => core.normalize({ ...enabled, ...patch }, { strict: true }), error => error.code === "INVALID_SEMANTIC_SETTINGS");
  assert.equal(core.match(response("cold", { toxicityScore: 1 }), { ...enabled, ...patch }), "");
});
check("invalid top-level settings are rejected strictly", () => {
  for (const value of [null, [], "config", 42]) {
    assert.equal(core.normalize(value).semanticFilterEnabled, false); assert.throws(() => core.normalize(value, { strict: true }));
  }
});
check("empty blocked labels are a valid no-match subset", () => {
  const config = core.normalize({ ...enabled, semanticFilterModel: "minilm", semanticFilterBlockedLabels: "" }, { strict: true });
  assert.equal(core.match(response("minilm", { labels: [{ label: "人身攻击", score: 1 }] }), config), "");
});
check("threshold boundaries are accepted", () => {
  assert.equal(core.normalize({ ...enabled, semanticFilterThreshold: 0 }, { strict: true }).semanticFilterThreshold, 0);
  assert.equal(core.normalize({ ...enabled, semanticFilterThreshold: 1 }, { strict: true }).semanticFilterThreshold, 1);
});
check("signature changes for every rule field", () => {
  const base = core.signature(enabled);
  for (const patch of [{ semanticFilterEnabled: false }, { semanticFilterModel: "horizon" }, { semanticFilterThreshold: 0.9 },
    { semanticFilterLabels: enabled.semanticFilterLabels + "\n游戏讨论" }, { semanticFilterBlockedLabels: "人身攻击" },
    { semanticFilterHypothesisTemplate: "This text concerns {}." }]) assert.notEqual(core.signature({ ...enabled, ...patch }), base);
});
for (const model of ["cold", "horizon"]) check(model + " uses only the chosen model toxicity score", () => {
  const config = { ...enabled, semanticFilterModel: model };
  assert.match(core.match(response(model, { toxicityScore: 0.8 }), config), /80%/);
  assert.equal(core.match(response(model, { toxicityScore: 0.799 }), config), "");
  assert.equal(core.match(response(model, { labels: [{ label: "toxicity", score: 1 }] }), config), "");
  assert.equal(core.match(response(model === "cold" ? "horizon" : "cold", { toxicityScore: 1 }), config), "");
});
for (const toxicityScore of [undefined, null, "0.9", NaN, Infinity, -1, 1.1]) check("invalid or missing toxicity score fails open", () => {
  assert.equal(core.match(response("cold", { toxicityScore }), enabled), "");
});
check("MiniLM selected topics combine with OR", () => {
  const value = response("minilm", { labels: [{ label: "正常讨论", score: 1 }, { label: "人身攻击", score: 0.85 }, { label: "招聘推广", score: 0.9 }] });
  const reason = core.match(value, { ...enabled, semanticFilterModel: "minilm" });
  assert(reason.includes("人身攻击 85%")); assert(reason.includes("招聘推广 90%")); assert(!reason.includes("正常讨论"));
});
check("MiniLM normal topics and invalid scores never hide", () => {
  for (const labels of [[{ label: "正常讨论", score: 1 }], [{ label: "人身攻击", score: "1" }], [{ label: "人身攻击", score: 0.7 }], []]) {
    assert.equal(core.match(response("minilm", { labels }), { ...enabled, semanticFilterModel: "minilm" }), "");
  }
});
check("disabled, errors and invalid envelopes never hide", () => {
  assert.equal(core.match(response("cold", { toxicityScore: 1 }), core.DEFAULTS), "");
  assert.equal(core.match(response("cold", { toxicityScore: 1, truncated: true }), enabled), "");
  for (const error of ["failed", { code: "ERROR", message: "Failed" }, null]) assert.equal(core.match(response("cold", { toxicityScore: 1, error }), enabled), "");
  assert.equal(core.match({ schemaVersion: 2, results: [{ model: "cold", toxicityScore: 1 }] }, enabled), "");
  assert.equal(core.match({ schemaVersion: 1, results: [] }, enabled), "");
});
console.log("Semantic filter core: " + checks + " checks passed");
