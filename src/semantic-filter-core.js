(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornSemanticFilterCore = api;
})(globalThis, function () {
  "use strict";
  const DEFAULTS = Object.freeze({
    semanticFilterEnabled: false,
    semanticFilterModel: "cold",
    semanticFilterThreshold: 0.8,
    semanticFilterLabels: "人身攻击\n正常讨论\n情感话题\n招聘推广\n体育讨论",
    semanticFilterBlockedLabels: "人身攻击\n招聘推广",
    semanticFilterHypothesisTemplate: "这段文字涉及{}。"
  });
  const MODELS = ["cold", "horizon", "minilm"];
  function labelList(value, minimum) {
    if (typeof value !== "string" || value.length > 1000) return null;
    const labels = value.split(/\r?\n/).map(label => label.trim()).filter(Boolean);
    if (labels.length < minimum || labels.length > 12 || labels.some(label => label.length > 60 || /[\u0000-\u001f\u007f]/.test(label))
      || new Set(labels.map(label => label.toLocaleLowerCase())).size !== labels.length) return null;
    return labels;
  }
  function templateValid(value) {
    return typeof value === "string" && value.length >= 1 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value)
      && (value.match(/\{\}/g) || []).length === 1 && !/[{}]/.test(value.replace("{}", ""));
  }
  function normalize(settings, options = {}) {
    const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
    const config = { ...DEFAULTS };
    let invalid = settings !== undefined && source !== settings;
    for (const key of Object.keys(DEFAULTS)) if (source[key] !== undefined) config[key] = source[key];
    if (typeof config.semanticFilterEnabled !== "boolean") { config.semanticFilterEnabled = false; invalid = true; }
    if (!MODELS.includes(config.semanticFilterModel)) { config.semanticFilterModel = DEFAULTS.semanticFilterModel; invalid = true; }
    if (typeof config.semanticFilterThreshold !== "number" || !Number.isFinite(config.semanticFilterThreshold)
      || config.semanticFilterThreshold < 0 || config.semanticFilterThreshold > 1) {
      config.semanticFilterThreshold = DEFAULTS.semanticFilterThreshold; invalid = true;
    }
    const labels = labelList(config.semanticFilterLabels, 2), blocked = labelList(config.semanticFilterBlockedLabels, 0);
    if (!labels) { config.semanticFilterLabels = DEFAULTS.semanticFilterLabels; invalid = true; }
    else config.semanticFilterLabels = labels.join("\n");
    if (!blocked || labels && blocked.some(label => !labels.includes(label))) {
      config.semanticFilterBlockedLabels = DEFAULTS.semanticFilterBlockedLabels; invalid = true;
    } else config.semanticFilterBlockedLabels = blocked.join("\n");
    if (!templateValid(config.semanticFilterHypothesisTemplate)) {
      config.semanticFilterHypothesisTemplate = DEFAULTS.semanticFilterHypothesisTemplate; invalid = true;
    }
    if (invalid) {
      if (options.strict) {
        const error = new Error("语义屏蔽设置无效，请检查模型、阈值、候选标签、目标标签和判断模板。");
        error.code = "INVALID_SEMANTIC_SETTINGS";
        throw error;
      }
      // Never let repaired values silently activate a different blocking rule.
      config.semanticFilterEnabled = false;
      const repairedLabels = labelList(config.semanticFilterLabels, 2);
      const repairedBlocked = labelList(config.semanticFilterBlockedLabels, 0);
      if (repairedBlocked?.some(label => !repairedLabels.includes(label))) config.semanticFilterBlockedLabels = "";
    }
    return config;
  }
  function signature(settings) {
    const config = normalize(settings);
    return JSON.stringify(Object.keys(DEFAULTS).map(key => config[key]));
  }
  function match(value, settings) {
    const config = normalize(settings);
    if (!config.semanticFilterEnabled) return "";
    const result = value && Array.isArray(value.results) ? value.schemaVersion === 1 && value.results.length === 1 ? value.results[0] : null : value;
    if (!result || result.error !== undefined || result.truncated === true || result.model !== config.semanticFilterModel) return "";
    const validScore = score => typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1;
    const format = score => Math.round(score * 100) + "%";
    if (config.semanticFilterModel !== "minilm") {
      return validScore(result.toxicityScore) && result.toxicityScore >= config.semanticFilterThreshold
        ? "语义规则（实验性）：攻击性 " + format(result.toxicityScore) : "";
    }
    if (!Array.isArray(result.labels) || result.labels.length > 64) return "";
    const blocked = labelList(config.semanticFilterBlockedLabels, 0);
    const matches = result.labels.filter(entry => entry && blocked.includes(entry.label)
      && validScore(entry.score) && entry.score >= config.semanticFilterThreshold);
    return matches.length ? "语义规则（实验性）：" + matches.map(entry => entry.label + " " + format(entry.score)).join("、") : "";
  }
  return Object.freeze({ DEFAULTS, normalize, signature, match });
});
