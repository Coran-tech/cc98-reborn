"use strict";

const SemanticCore = globalThis.CC98RebornSemanticFilterCore;
const ThemeCore = globalThis.CC98RebornThemeCore;
const SETTINGS_KEY = "cc98ComfortSettings";
const LOCAL_ORIGINS = Object.freeze(["http://127.0.0.1/*"]);
const $ = (selector) => document.querySelector(selector);
const fields = {
  semanticFilterEnabled: $("#semantic-enabled"),
  semanticFilterModel: $("#semantic-model"),
  semanticFilterThreshold: $("#semantic-threshold"),
  semanticFilterLabels: $("#semantic-labels"),
  semanticFilterBlockedLabels: $("#semantic-blocked-labels"),
  semanticFilterHypothesisTemplate: $("#semantic-template")
};
const state = { settings: {}, busy: false, dirty: false, connected: false, tested: false, themeStop: null, resizeObserver: null, lastHeight: 0 };
const ERROR_MESSAGES = Object.freeze({
  NO_PERMISSION: "未授权",
  PERMISSION_REQUIRED: "未授权",
  NOT_CONNECTED: "未连接",
  NO_TOKEN: "缺少令牌",
  GLOBAL_DISABLED: "插件已关闭",
  PLUGIN_DISABLED: "插件已关闭",
  DISABLED: "插件已关闭",
  INVALID_CONFIG: "配置无效",
  INVALID_SEMANTIC_SETTINGS: "配置无效",
  AUTH_FAILED: "令牌无效",
  BAD_TOKEN: "令牌无效",
  UNAUTHORIZED: "令牌无效",
  SERVICE_UNAVAILABLE: "服务不可用",
  NETWORK_ERROR: "服务不可用",
  SERVICE_REJECTED: "服务拒绝请求",
  INVALID_RESPONSE: "结果无效",
  CANCELLED: "已取消",
  STALE_SETTINGS: "配置已更新，请重试",
  TIMEOUT: "请求超时",
  BUSY: "服务忙"
});

function setMessage(element, value) { element.textContent = value || ""; element.hidden = !value; }
function showError(error) {
  const code = typeof error === "string" ? error : error?.code || error?.message || "UNKNOWN_ERROR";
  setMessage($("#semantic-error"), ERROR_MESSAGES[code] || (/^[A-Z][A-Z_]+$/.test(code) ? "操作失败" : code));
}
function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
function updateHeight() {
  const height = Math.ceil(document.querySelector("main").getBoundingClientRect().height);
  if (!Number.isFinite(height) || height === state.lastHeight) return;
  state.lastHeight = height;
  if (parent !== window) parent.postMessage({ type: "cc98-reborn:semantic-settings-size", height }, "*");
}
function applyTheme() { ThemeCore?.apply(document.documentElement, state.settings); requestAnimationFrame(updateHeight); }
function updateModelFields() {
  const model = fields.semanticFilterModel.value;
  $("#semantic-topic-options").hidden = model !== "minilm";
  const value = Number(fields.semanticFilterThreshold.value);
  $("#semantic-threshold-value").textContent = Number.isFinite(value) ? `${Math.round(value * 100)}%` : "";
  requestAnimationFrame(updateHeight);
}
function hydrate(settings) {
  const config = SemanticCore.normalize({ ...SemanticCore.DEFAULTS, ...settings });
  for (const [key, input] of Object.entries(fields)) {
    if (input.type === "checkbox") input.checked = config[key];
    else input.value = config[key];
  }
  state.dirty = false;
  updateModelFields();
}
function readConfig() {
  return SemanticCore.normalize({
    semanticFilterEnabled: fields.semanticFilterEnabled.checked,
    semanticFilterModel: fields.semanticFilterModel.value,
    semanticFilterThreshold: fields.semanticFilterThreshold.value === "" ? NaN : Number(fields.semanticFilterThreshold.value),
    semanticFilterLabels: fields.semanticFilterLabels.value,
    semanticFilterBlockedLabels: fields.semanticFilterBlockedLabels.value,
    semanticFilterHypothesisTemplate: fields.semanticFilterHypothesisTemplate.value
  }, { strict: true });
}
async function saveSettings(options = {}) {
  const config = readConfig();
  const latest = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  if (options.preserveEnabled) config.semanticFilterEnabled = SemanticCore.normalize(latest).semanticFilterEnabled;
  state.settings = { ...latest, ...config };
  await chrome.storage.local.set({ [SETTINGS_KEY]: state.settings });
  state.dirty = fields.semanticFilterEnabled.checked !== config.semanticFilterEnabled;
  $("#semantic-save-status").textContent = state.dirty ? "开关未保存" : "已保存";
  setMessage($("#semantic-error"), "");
  applyTheme();
  return config;
}
function setBusy(busy) {
  state.busy = busy;
  document.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  Object.values(fields).forEach((field) => { field.disabled = busy; });
  $("#semantic-token").disabled = busy;
  $("#semantic-test-text").disabled = busy;
}
async function send(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extra });
  if (!response || !response.ok) throw new Error(response?.error || "SERVICE_UNAVAILABLE");
  return response;
}
async function refreshStatus() {
  try {
    const result = await send("CC98_SEMANTIC_STATUS");
    state.connected = result.connected === true && result.permission === true;
    $("#semantic-status").dataset.connected = String(state.connected);
    $("#semantic-status").textContent = state.connected ? state.tested ? "可用" : "已配对" : "未连接";
    if (!state.connected) state.tested = false;
  } catch (_) {
    state.connected = false;
    $("#semantic-status").textContent = "未连接";
    $("#semantic-status").dataset.connected = "false";
  }
}
function requestLocalPermission() { return chrome.permissions.request({ origins: [...LOCAL_ORIGINS] }); }
async function connectWithToken(token) {
  if (!token.trim()) throw new Error("缺少令牌");
  await send("CC98_SEMANTIC_CONNECT", { token: token.trim() });
  $("#semantic-token").value = "";
  state.tested = false;
  setMessage($("#semantic-connection-message"), "已连接");
  await refreshStatus();
}
async function connect() {
  if (state.busy) return;
  const token = $("#semantic-token").value;
  if (!token.trim()) { showError("缺少令牌"); return; }
  // Called directly in the extension-origin button gesture, before async work.
  const permission = requestLocalPermission();
  setBusy(true);
  try {
    if (!await permission) throw new Error("未授权");
    await connectWithToken(token);
    setMessage($("#semantic-error"), "");
  } catch (error) { showError(error); }
  finally { setBusy(false); updateHeight(); }
}
async function disconnect() {
  if (state.busy) return;
  setBusy(true);
  try {
    await send("CC98_SEMANTIC_DISCONNECT");
    await chrome.permissions.remove({ origins: [...LOCAL_ORIGINS] });
    $("#semantic-token").value = "";
    state.tested = false;
    setMessage($("#semantic-connection-message"), "已断开");
    setMessage($("#semantic-error"), "");
    await refreshStatus();
  } catch (error) { showError(error); }
  finally { setBusy(false); updateHeight(); }
}
function renderTest(envelope, config) {
  const target = $("#semantic-test-result");
  const results = Array.isArray(envelope?.results) ? envelope.results : envelope?.result ? [envelope.result] : envelope?.model ? [envelope] : [];
  const result = results.find((item) => item.model === config.semanticFilterModel) || results[0];
  if (!result) throw new Error("无结果");
  if (result.error) throw new Error(typeof result.error === "string" ? result.error : result.error.message || "MODEL_ERROR");
  const reason = SemanticCore.match(envelope, { ...config, semanticFilterEnabled: true });
  target.replaceChildren(element("strong", "", reason ? "折叠" : "保留"));
  target.append(element("p", "note", `${result.model} · ${result.revision || "—"}${result.cached ? " · 缓存" : ""}`));
  const list = element("div", "test-labels");
  for (const label of result.labels || []) {
    if (!Number.isFinite(label.score)) continue;
    const row = element("div", "test-label");
    row.append(element("span", "", String(label.label)), element("span", "", `${(label.score * 100).toFixed(1)}%`));
    list.append(row);
  }
  target.append(list);
  if (result.truncated) target.append(element("p", "note", "已截断 · 保留"));
  target.hidden = false;
}
async function testSample() {
  if (state.busy) return;
  const text = $("#semantic-test-text").value;
  if (!text.trim() || text.length > 10000) { showError("文本须为 1–10000 字"); return; }
  try { readConfig(); } catch (error) { showError(error); return; }
  if (!state.connected && !$("#semantic-token").value.trim()) { showError("未连接"); return; }
  const permission = requestLocalPermission();
  setBusy(true);
  $("#semantic-test-result").hidden = false;
  $("#semantic-test-result").replaceChildren(element("p", "note", "计算中"));
  try {
    if (!await permission) throw new Error("未授权");
    if ($("#semantic-token").value.trim()) await connectWithToken($("#semantic-token").value);
    const config = await saveSettings({ preserveEnabled: true });
    const response = await send("CC98_SEMANTIC_TEST", { requestId: crypto.randomUUID(), text });
    renderTest(response.result, config);
    state.tested = true;
    await refreshStatus();
  } catch (error) {
    state.tested = false;
    showError(error);
    $("#semantic-test-result").replaceChildren(element("p", "note", "无结果"));
    await refreshStatus();
  } finally { setBusy(false); updateHeight(); }
}

$("#semantic-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  setBusy(true);
  try { await saveSettings(); await refreshStatus(); } catch (error) { showError(error); }
  finally { setBusy(false); updateHeight(); }
});
Object.values(fields).forEach((input) => input.addEventListener("input", () => { state.dirty = true; $("#semantic-save-status").textContent = "未保存"; updateModelFields(); }));
$("#semantic-model").addEventListener("change", updateModelFields);
$("#semantic-connect").addEventListener("click", connect);
$("#semantic-disconnect").addEventListener("click", disconnect);
$("#semantic-test").addEventListener("click", testSample);
$("#semantic-download").addEventListener("click", async () => {
  try {
    await chrome.downloads.download({ url: chrome.runtime.getURL("assets/semantic-lab.zip"), filename: "cc98-semantic-lab.zip", saveAs: true });
    setMessage($("#semantic-connection-message"), "下载已开始");
  } catch (_) { showError("下载失败"); }
});
document.querySelectorAll("[data-semantic-template]").forEach((button) => button.addEventListener("click", () => {
  fields.semanticFilterHypothesisTemplate.value = button.dataset.semanticTemplate === "en" ? "This text is about {}." : "这段文字涉及{}。";
  state.dirty = true; $("#semantic-save-status").textContent = "未保存";
}));
document.querySelectorAll("[data-semantic-sample]").forEach((button) => button.addEventListener("click", () => {
  $("#semantic-test-text").value = button.dataset.semanticSample === "attack" ? "你连这么简单的话都看不懂，还到处装懂，真是个蠢货。" : "谢谢你把步骤整理得这么清楚，照着做已经解决了问题。";
}));
window.addEventListener("message", (event) => {
  if (event.source === parent && event.data?.type === "cc98-reborn:semantic-settings-request-size") { state.lastHeight = 0; updateHeight(); }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (Object.hasOwn(changes, "cc98RebornSemanticConnection:v1") || Object.hasOwn(changes, "cc98RebornSemanticState:v1")) refreshStatus();
  if (!changes[SETTINGS_KEY]) return;
  state.settings = changes[SETTINGS_KEY].newValue || {};
  applyTheme();
  if (!state.dirty) hydrate(state.settings);
  refreshStatus();
});
window.addEventListener("pagehide", () => { state.themeStop?.(); state.resizeObserver?.disconnect(); });

(async () => {
  if (!SemanticCore || !ThemeCore) throw new Error("模块未加载");
  state.settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  hydrate(state.settings);
  applyTheme();
  state.themeStop = ThemeCore.watch(() => state.settings, applyTheme);
  state.resizeObserver = new ResizeObserver(updateHeight);
  state.resizeObserver.observe(document.querySelector("main"));
  await refreshStatus();
  updateHeight();
})().catch((error) => { showError(error); setBusy(true); });
