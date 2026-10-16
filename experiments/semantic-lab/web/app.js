"use strict";

const MODEL_INFO = Object.freeze({
  cold: { name: "COLD" },
  horizon: { name: "Horizon" },
  minilm: { name: "MiniLM" }
});
const SAMPLES = Object.freeze({
  discussion: "我觉得这项安排还有改进空间。工作日晚上有课的同学可能不方便参加，能否再提供一个周末时段？大家的需求不太一样，可以先收集一下意见。",
  attack: "你连这么简单的话都看不懂，还到处装懂，真是个蠢货。闭嘴吧，没人想听你胡说八道。",
  quote: "楼上说“你就是个蠢货，赶紧闭嘴”，我不赞同这样的表达。我们可以反对一个观点，但不应该对别人进行人身攻击。",
  topic: "周六晚上有人一起看篮球比赛吗？这场两队的防守策略变化很有意思，想找几个人赛后聊聊，也欢迎支持另一队的朋友。"
});
const $ = (selector) => document.querySelector(selector);
const state = { token: null, controller: null, busy: false, healthPending: false, operationCount: 0, healthTimer: null, cards: new Map(), resultText: "", cancelled: false };
const ui = {
  text: $("#sample-text"), count: $("#text-count"), labels: $("#topic-labels"), template: $("#hypothesis-template"), topic: $("#topic-settings"), threshold: $("#fold-threshold"), thresholdValue: $("#threshold-value"),
  run: $("#run-button"), cancel: $("#cancel-button"), runStatus: $("#run-status"), error: $("#input-error"), results: $("#results"), empty: $("#results-empty"), models: $("#model-status-list"), modelError: $("#model-error"), connection: $("#connection-status")
};

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function message(element, value) {
  element.textContent = value || "";
  element.hidden = !value;
}

function errorText(error) {
  if (typeof error === "string") return error;
  if (error && typeof error.message === "string") return error.message;
  return "请求失败";
}

async function parseResponse(response) {
  let data;
  try { data = await response.json(); }
  catch (_) { throw new Error(`响应无效（HTTP ${response.status}）`); }
  if (!response.ok) throw new Error(errorText(data.error || data.message || `请求失败（HTTP ${response.status}）`));
  return data;
}

async function getToken(signal) {
  if (!state.token) {
    const data = await parseResponse(await fetch("/api/v1/session", { signal, cache: "no-store", credentials: "same-origin" }));
    if (typeof data.token !== "string" || !data.token) throw new Error("授权失败，请刷新重试");
    state.token = data.token;
  }
  return state.token;
}

async function post(path, body, signal) {
  const token = await getToken(signal);
  const response = await fetch(path, { method: "POST", signal, credentials: "same-origin", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(body) });
  if (response.status === 401) state.token = null;
  return parseResponse(response);
}

function selectedModels() {
  return [...document.querySelectorAll('input[name="models"]:checked')].map((input) => input.value);
}

function updateInput() {
  ui.count.textContent = `${ui.text.value.length} / 10000`;
  ui.topic.hidden = !selectedModels().includes("minilm");
}

function setBusy(busy) {
  state.busy = busy;
  ui.run.disabled = busy;
  ui.cancel.hidden = !busy;
  ui.cancel.disabled = false;
  $("#clear-button").disabled = busy;
  ui.text.disabled = busy;
  ui.labels.disabled = busy;
  ui.template.disabled = busy;
  document.querySelectorAll('input[name="models"], [data-sample], [data-template]').forEach((input) => { input.disabled = busy; });
  document.querySelectorAll("[data-model-action]").forEach((button) => { button.disabled = busy || button.dataset.operating === "true"; });
  updatePolling();
}

function updatePolling() {
  if ((state.busy || state.operationCount) && !state.healthTimer) state.healthTimer = window.setInterval(refreshHealth, 2200);
  if (!state.busy && !state.operationCount && state.healthTimer) { clearInterval(state.healthTimer); state.healthTimer = null; }
}

function makeCard(id) {
  const card = node("article", "result-card");
  card.dataset.model = id;
  card.dataset.task = id === "minilm" ? "topic" : "toxicity";
  const top = node("div", "result-top");
  const title = node("div");
  title.append(node("h3", "", MODEL_INFO[id].name));
  const status = node("span", "status-chip", "等待中");
  top.append(title, status);
  const body = node("div", "result-body");
  card.append(top, body);
  const data = { card, status, body, result: null };
  state.cards.set(id, data);
  return card;
}

function cardProgress(id, status, detail) {
  const card = state.cards.get(id);
  card.status.textContent = status;
  card.status.removeAttribute("data-state");
  const progress = node("div", "result-progress");
  progress.append(node("span", "spinner"), node("span", "", detail));
  card.body.replaceChildren(progress);
}

function displayError(id, error) {
  const card = state.cards.get(id);
  card.status.textContent = "未完成";
  card.status.dataset.state = "error";
  card.body.replaceChildren(node("p", "inline-error", errorText(error)));
}

function percent(value) {
  return `${(Math.max(0, Math.min(1, Number(value))) * 100).toFixed(1)}%`;
}

function updatePreview(card) {
  if (!card.result || card.result.error) return;
  const preview = card.body.querySelector(".preview-fold");
  if (!preview) return;
  const score = card.result.toxicityScore;
  const isToxicity = typeof score === "number" && Number.isFinite(score) && card.card.dataset.task !== "topic";
  const fold = isToxicity && score >= Number(ui.threshold.value);
  preview.dataset.folded = String(fold);
  preview.open = !fold;
  const summary = preview.querySelector("summary");
  summary.textContent = fold ? "原文 · 已折叠" : "原文";
}

function renderResult(id, result) {
  const card = state.cards.get(id);
  card.result = result;
  if (result.error) { displayError(id, result.error); return; }
  card.status.textContent = "完成";
  card.status.dataset.state = "ready";
  const meta = node("div", "result-meta");
  const elapsed = Number(result.elapsedMs);
  meta.append(node("span", "", Number.isFinite(elapsed) ? `耗时 ${(elapsed / 1000).toFixed(2)} s` : "耗时 —"));
  if (result.cached) meta.append(node("span", "", "缓存"));
  if (result.revision) {
    const details = node("details", "result-details");
    details.append(node("summary", "", "详情"), node("code", "result-version", result.revision));
    meta.append(details);
  }
  const list = node("div", "label-list");
  const labels = Array.isArray(result.labels) ? [...result.labels].filter((label) => Number.isFinite(Number(label.score))).sort((a, b) => b.score - a.score) : [];
  for (const label of labels) {
    const row = node("div", "label-row");
    const name = node("span", "label-name", String(label.title || label.label));
    name.title = String(label.label);
    row.append(name, node("span", "label-score", percent(label.score)));
    const track = node("div", "label-track");
    const bar = node("div", "label-bar");
    bar.style.width = percent(label.score);
    track.append(bar); row.append(track); list.append(row);
  }
  card.body.replaceChildren(meta, list);
  if (!labels.length) card.body.append(node("p", "result-hint", "无分数"));
  if (result.truncated) card.body.append(node("p", "result-warning", "已截断"));
  const preview = node("details", "preview-fold");
  preview.append(node("summary"), node("p", "", state.resultText));
  card.body.append(preview);
  updatePreview(card);
}

async function runComparison() {
  if (state.busy) return;
  message(ui.error, "");
  const text = ui.text.value.trim();
  const ids = selectedModels();
  const topicLabels = [...new Set(ui.labels.value.split(/[,，\n]/u).map((label) => label.trim()).filter(Boolean))];
  const hypothesisTemplate = ui.template.value;
  if (!text) { message(ui.error, "请输入文字"); ui.text.focus(); return; }
  if (text.length > 10000) { message(ui.error, "最多 10000 字"); return; }
  if (!ids.length) { message(ui.error, "请选择模型"); return; }
  if (ids.includes("minilm") && (topicLabels.length < 2 || topicLabels.length > 12)) { message(ui.error, "标签需为 2–12 项"); ui.labels.focus(); return; }
  if (ids.includes("minilm") && topicLabels.some((label) => label.length > 60)) { message(ui.error, "每个标签最多 60 字"); ui.labels.focus(); return; }
  if (ids.includes("minilm") && (!hypothesisTemplate.trim() || hypothesisTemplate.length > 200 || (hypothesisTemplate.match(/\{\}/gu) || []).length !== 1 || /[{}]/u.test(hypothesisTemplate.replace("{}", "")))) { message(ui.error, "模板最多 200 字，且仅含一个 {}"); ui.template.focus(); return; }
  state.controller = new AbortController();
  state.cancelled = false;
  state.resultText = text;
  state.cards.clear();
  ui.results.replaceChildren(...ids.map(makeCard));
  ui.empty.hidden = true;
  setBusy(true);
  let completed = 0;
  let failed = 0;
  try {
    for (const id of ids) {
      if (state.controller.signal.aborted) break;
      cardProgress(id, "处理中", "加载 / 推理中");
      ui.runStatus.textContent = `${completed + 1} / ${ids.length} · ${MODEL_INFO[id].name}`;
      try {
        const data = await post("/api/v1/evaluate", { text, models: [id], topicLabels, ...(id === "minilm" ? { hypothesisTemplate } : {}) }, state.controller.signal);
        const result = Array.isArray(data.results) ? data.results.find((entry) => entry.model === id) : null;
        if (!result) throw new Error("无模型结果");
        renderResult(id, result);
        if (result.error) failed += 1;
        completed += 1;
      } catch (error) {
        if (state.controller.signal.aborted || error.name === "AbortError") break;
        displayError(id, error);
        failed += 1; completed += 1;
      }
      await refreshHealth();
    }
  } finally {
    if (state.cancelled) {
      for (const id of ids) {
        const card = state.cards.get(id);
        if (card.result || card.status.dataset.state === "error") continue;
        card.status.textContent = "已取消";
        card.status.removeAttribute("data-state");
        card.body.replaceChildren();
      }
      ui.runStatus.textContent = `已取消 · ${completed} / ${ids.length}`;
    } else ui.runStatus.textContent = failed ? `完成 · ${failed} 项失败` : "完成";
    state.controller = null;
    setBusy(false);
    refreshHealth();
  }
}

const STATUS_NAMES = { ready: "已加载", loaded: "已加载", loading: "加载中", downloading: "下载中", downloaded: "已下载", unloaded: "未加载", idle: "未加载", not_loaded: "未加载", error: "加载失败", evaluating: "推理中", running: "推理中", unavailable: "不可用" };

function renderModels(models) {
  const entries = new Map((Array.isArray(models) ? models : []).map((model) => [model.id, model]));
  for (const id of Object.keys(MODEL_INFO)) {
    const model = entries.get(id) || { id, status: "unavailable" };
    let row = ui.models.querySelector(`[data-model="${id}"]`);
    if (!row) {
      row = node("div", "model-status-row"); row.dataset.model = id;
      const info = node("div", "model-info");
      const details = node("details", "model-details");
      details.append(node("summary", "", "详情"), node("code", "model-revision"));
      info.append(node("strong", "", MODEL_INFO[id].name), node("p", "model-state"), details, node("p", "model-state-error"));
      const controls = node("div", "model-controls");
      for (const action of ["load", "unload"]) {
        const button = node("button", "", action === "load" ? "加载" : "释放");
        button.type = "button"; button.dataset.modelAction = action; button.dataset.model = id;
        button.addEventListener("click", () => modelAction(id, action)); controls.append(button);
      }
      row.append(info, controls); ui.models.append(row);
    }
    const stateText = STATUS_NAMES[model.status] || String(model.status || "未知状态");
    const bytes = Number(model.downloadBytes);
    row.querySelector(".model-state").textContent = `${stateText}${Number.isFinite(bytes) && bytes > 0 ? ` · ${(bytes / 1024 / 1024).toFixed(1)} MB` : ""}`;
    row.querySelector(".model-revision").textContent = model.revision || "";
    row.querySelector(".model-details").hidden = !model.revision;
    const error = row.querySelector(".model-state-error");
    error.dataset.error = "true"; error.textContent = model.error ? errorText(model.error) : "";
    row.querySelectorAll("button").forEach((button) => { button.disabled = state.busy || button.dataset.operating === "true" || ["loading", "downloading", "evaluating", "running"].includes(model.status); });
  }
}

async function refreshHealth() {
  if (state.healthPending) return;
  state.healthPending = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const data = await parseResponse(await fetch("/api/v1/health", { signal: controller.signal, cache: "no-store", credentials: "same-origin" }));
    ui.connection.textContent = "已连接"; ui.connection.dataset.state = "ready";
    renderModels(data.models);
  } catch (_) {
    ui.connection.textContent = "未连接"; ui.connection.dataset.state = "error";
    if (!ui.models.childElementCount) renderModels([]);
  } finally { clearTimeout(timeout); state.healthPending = false; }
}

async function modelAction(id, action) {
  if (state.busy) return;
  const row = ui.models.querySelector(`[data-model="${id}"]`);
  if ([...row.querySelectorAll("button")].some((button) => button.dataset.operating === "true")) return;
  const buttons = [...row.querySelectorAll("button")];
  for (const button of buttons) { button.disabled = true; button.dataset.operating = "true"; }
  row.querySelector(".model-state").textContent = action === "load" ? "加载中…" : "释放中…";
  message(ui.modelError, "");
  state.operationCount += 1; updatePolling();
  try { await post(`/api/v1/models/${id}/${action}`, {}); }
  catch (error) { message(ui.modelError, `${MODEL_INFO[id].name}：${errorText(error)}`); }
  finally {
    for (const button of buttons) { button.dataset.operating = "false"; button.disabled = state.busy; }
    state.operationCount -= 1; updatePolling(); await refreshHealth();
  }
}

const apiExample = [
  'const { token } = await fetch("/api/v1/session").then(r => r.json());',
  'const result = await fetch("/api/v1/evaluate", {',
  '  method: "POST",',
  '  headers: { "Content-Type": "application/json",',
  '    "Authorization": `Bearer ${token}` },',
  '  body: JSON.stringify({',
  '    text: "可以反对观点，但请尊重发言的人。",',
  '    models: ["cold", "horizon", "minilm"],',
  '    topicLabels: ["人身攻击", "正常讨论", "体育讨论"],',
  '    hypothesisTemplate: "这段文字涉及{}。"',
  '  })',
  '}).then(r => r.json());',
  "console.log(result.results);"
].join("\n");
$("#api-example").textContent = apiExample;
$("#copy-api-button").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(apiExample); $("#copy-status").textContent = "已复制"; }
  catch (_) { $("#copy-status").textContent = "复制失败"; }
});
ui.text.addEventListener("input", updateInput);
document.querySelectorAll('input[name="models"]').forEach((input) => input.addEventListener("change", updateInput));
document.querySelectorAll("[data-sample]").forEach((button) => button.addEventListener("click", () => { ui.text.value = SAMPLES[button.dataset.sample]; updateInput(); ui.text.focus(); }));
document.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", () => { ui.template.value = button.dataset.template === "en" ? "This text is about {}." : "这段文字涉及{}。"; ui.template.focus(); }));
ui.threshold.addEventListener("input", () => { ui.thresholdValue.textContent = `${Math.round(Number(ui.threshold.value) * 100)}%`; state.cards.forEach(updatePreview); });
ui.run.addEventListener("click", runComparison);
ui.cancel.addEventListener("click", () => { state.cancelled = true; ui.cancel.disabled = true; if (state.controller) state.controller.abort(); ui.runStatus.textContent = "正在取消…"; });
$("#clear-button").addEventListener("click", () => { if (state.busy) return; state.cards.clear(); state.resultText = ""; ui.results.replaceChildren(); ui.empty.hidden = false; ui.runStatus.textContent = "等待输入"; });
$("#refresh-button").addEventListener("click", refreshHealth);
window.addEventListener("pagehide", () => { if (state.controller) state.controller.abort(); if (state.healthTimer) clearInterval(state.healthTimer); });
updateInput();
refreshHealth();
