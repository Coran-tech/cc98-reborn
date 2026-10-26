(() => {
  "use strict";
  const core = globalThis.CC98RebornSemanticFilterCore;
  if (!core) return;
  const LIMIT = 32, CACHE_LIMIT = 256, TTL = 300000, REQUEST_TIMEOUT = 65000;
  const CONNECTION_KEY = "cc98RebornSemanticConnection:v1", STATE_KEY = "cc98RebornSemanticState:v1";
  const cache = new Map(), issues = new Map();
  let inputs = new WeakMap(), queue = [], active = null, generation = 0, nextId = 0;
  let config = core.normalize({}), configSignature = "", settingsSignature = "", enabled = false;
  let currentScope = "", currentRoute = "", paused = document.visibilityState === "hidden", resumeNeeded = false;
  let retryAt = 0, failures = 0, filterTimer = 0, statusTimer = 0, contextTimer = 0;
  const prefix = "semantic-" + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const messages = {
    NETWORK_ERROR: "无法连接本地语义服务，稍后重试；正文继续显示",
    SERVICE_UNAVAILABLE: "无法连接本地语义服务，稍后重试；正文继续显示",
    TIMEOUT: "本地语义检测超时，稍后重试；正文继续显示",
    AUTH_REQUIRED: "本地语义服务尚未授权；正文继续显示",
    BAD_TOKEN: "本地语义服务授权已失效，请重新连接；正文继续显示",
    NO_TOKEN: "请先连接本地语义服务；正文继续显示",
    NOT_CONNECTED: "请先连接本地语义服务；正文继续显示",
    PERMISSION_REQUIRED: "请先授权本地语义服务；正文继续显示",
    PERMISSION_DENIED: "本地语义服务权限已关闭；正文继续显示",
    DISABLED: "语义屏蔽已关闭；正文继续显示",
    INVALID_RESPONSE: "本地语义服务响应无效；正文继续显示",
    STALE_CONFIG: "语义设置已变化，本次结果未应用",
    STALE_SETTINGS: "语义设置已变化，本次结果未应用",
    CONNECTION_CHANGED: "本地语义服务连接已变化，本次结果未应用",
    CANCELLED: "本次语义检测已取消；正文继续显示",
    BUSY: "本地语义服务繁忙，稍后重试；正文继续显示",
    UNAVAILABLE: "本地语义检测不可用，稍后重试；正文继续显示",
    TOO_LONG: "已跳过超过 10000 字符的正文，避免截取后误判",
    TRUNCATED: "部分正文超过模型 token 上限，已保留原文",
    QUEUE_FULL: "等待语义检测的发言较多，未排队的正文继续显示"
  };

  // Synchronous SHA-256 permits a completed cache hit during rendering, without
  // retaining complete post text as a Map key or starting another rebuild.
  const constants = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  const encoder = new TextEncoder(), rotate = (value, bits) => (value >>> bits) | (value << (32 - bits));
  function digest(text) {
    const bytes = encoder.encode(text), padded = new Uint8Array((bytes.length + 72) & ~63);
    padded.set(bytes); padded[bytes.length] = 128;
    const view = new DataView(padded.buffer), words = new Uint32Array(64);
    view.setUint32(padded.length - 4, bytes.length * 8);
    const hash = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const x = words[i - 15], y = words[i - 2];
        words[i] = (words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = hash;
      for (let i = 0; i < 64; i++) {
        const one = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i] + words[i]) >>> 0;
        const two = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + one) >>> 0; d = c; c = b; b = a; a = (one + two) >>> 0;
      }
      [a,b,c,d,e,f,g,h].forEach((value, index) => { hash[index] = (hash[index] + value) >>> 0; });
    }
    return [...hash].map(value => value.toString(16).padStart(8, "0")).join("");
  }
  function scope() {
    let account = "guest";
    try {
      if (typeof getCurrentCc98WebAccount === "function") {
        const value = getCurrentCc98WebAccount();
        account = String(value?.userId || value?.userName || "guest");
      } else if (typeof getCc98AccountId === "function" && typeof getStoredCc98UserInfo === "function") {
        account = String(getCc98AccountId(getStoredCc98UserInfo()) || "guest");
      }
    } catch {}
    return String(location.origin) + ":" + account;
  }
  function route() { return String(location.pathname || "") + String(location.search || ""); }
  function status() {
    return { enabled, paused, queued: queue.length, pending: active ? 1 : 0, cacheEntries: cache.size, failures, nextRetryAt: retryAt, errors: [...issues.values()] };
  }
  function updateStatus() {
    statusTimer = 0;
    const counts = active || queue.length ? "语义检测：正在检测 " + (active ? 1 : 0) + "，等待 " + queue.length : "";
    const text = [counts, ...issues.values()].filter(Boolean).join("；");
    document.querySelectorAll("[data-semantic-rule-status]").forEach(node => { if (node.textContent !== text) node.textContent = text; });
  }
  function notifyStatus() { if (!statusTimer) statusTimer = setTimeout(updateStatus, 40); }
  function issue(code) {
    if (!issues.has(code)) { issues.set(code, messages[code] || "本地语义检测未完成；正文继续显示"); notifyStatus(); }
  }
  function notifyFilters() {
    if (filterTimer) return;
    filterTimer = setTimeout(() => {
      filterTimer = 0;
      const handled = globalThis.CC98RebornNewTopicsVirtual?.refresh?.();
      if (!handled && typeof scheduleRebuild === "function") scheduleRebuild();
      if (typeof scheduleFiltering === "function") scheduleFiltering();
      globalThis.CC98RebornConversation?.refreshFilters?.();
      globalThis.CC98RebornTopicSearch?.refreshFilters?.();
      document.dispatchEvent(new CustomEvent("cc98-content-rules-updated"));
    }, 250);
  }
  function send(message) {
    return new Promise((resolve, reject) => {
      try {
        const result = chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) reject(new Error("RUNTIME_UNAVAILABLE")); else resolve(response);
        });
        if (result?.then) result.then(resolve, reject);
      } catch (error) { reject(error); }
    });
  }
  function cancelWork() {
    generation++;
    clearTimeout(contextTimer); contextTimer = 0;
    const hadWork = Boolean(active || queue.length);
    if (active) {
      clearTimeout(active.timer);
      send({ type: "CC98_SEMANTIC_CANCEL", requestId: active.requestId }).catch(() => {});
    }
    for (const [key, entry] of cache) if (!entry.done) { entry.text = ""; cache.delete(key); }
    active = null; queue = []; notifyStatus();
    return hadWork;
  }
  function checkContext() {
    const nextScope = scope(), nextRoute = route();
    if (nextScope === currentScope && nextRoute === currentRoute) return false;
    cancelWork();
    if (nextScope !== currentScope) { cache.clear(); inputs = new WeakMap(); }
    currentScope = nextScope; currentRoute = nextRoute;
    return true;
  }
  function watchContext() {
    if (contextTimer || !active) return;
    contextTimer = setTimeout(() => {
      contextTimer = 0;
      if (!checkContext()) watchContext();
    }, 500);
  }
  function trim() {
    const now = Date.now();
    for (const [key, entry] of cache) if (entry.done && entry.expiresAt <= now) cache.delete(key);
    for (const [key, entry] of cache) {
      if (cache.size <= CACHE_LIMIT) break;
      if (entry.done) cache.delete(key);
    }
  }
  function fail(entry, code) {
    failures++; retryAt = Date.now() + Math.min(120000, 30000 * 2 ** Math.min(failures - 1, 2));
    issue(code);
    entry.done = true; entry.reason = ""; entry.expiresAt = retryAt; entry.text = "";
    for (const waiting of queue) { waiting.done = true; waiting.text = ""; waiting.reason = ""; waiting.expiresAt = retryAt; }
    queue = [];
  }
  function finish(entry, expected, response, failure) {
    if (expected !== generation || active !== entry) return;
    if (checkContext()) return;
    clearTimeout(entry.timer); clearTimeout(contextTimer); contextTimer = 0; active = null;
    if (failure) fail(entry, failure);
    else if (response?.requestId !== entry.requestId || response?.configSignature !== configSignature) fail(entry, "STALE_CONFIG");
    else if (response.ok !== true) fail(entry, typeof response.error === "string" ? response.error : response.error?.code || "INVALID_RESPONSE");
    else {
      const result = response.result?.results?.[0];
      entry.done = true; entry.expiresAt = Date.now() + TTL; entry.reason = "";
      if (!result || result.error) fail(entry, result?.error?.code || "INVALID_RESPONSE");
      else if (result.truncated === true) issue("TRUNCATED");
      else {
        try { entry.reason = core.match(response.result, config) || ""; }
        catch { fail(entry, "INVALID_RESPONSE"); }
      }
      if (entry.expiresAt > retryAt) { failures = 0; retryAt = 0; }
      if (entry.reason) notifyFilters();
    }
    trim(); notifyStatus(); pump();
  }
  function pump() {
    if (!enabled || paused || active || retryAt > Date.now()) return;
    if (checkContext() || !queue.length) return;
    const entry = queue.shift(), expected = generation;
    active = entry; entry.requestId = prefix + "-" + (++nextId);
    entry.timer = setTimeout(() => {
      send({ type: "CC98_SEMANTIC_CANCEL", requestId: entry.requestId }).catch(() => {});
      finish(entry, expected, null, "TIMEOUT");
    }, REQUEST_TIMEOUT);
    watchContext(); notifyStatus();
    send({ type: "CC98_SEMANTIC_ANALYZE", requestId: entry.requestId, text: entry.text }).then(response => finish(entry, expected, response), () => finish(entry, expected, null, "NETWORK_ERROR"));
    entry.text = "";
  }
  function reason(item, post = false) {
    if (!enabled || paused || !item || typeof item !== "object" || (item.type !== "post" && !post) || !globalThis.CC98RebornContentFilter?.ownText) return "";
    checkContext();
    let text;
    try { text = globalThis.CC98RebornContentFilter.ownText(item).trim(); } catch { return ""; }
    if (!text) return "";
    if (text.length > 10000) { issue("TOO_LONG"); return ""; }
    const identity = item.content && typeof item.content === "object" ? item.content : item;
    let saved = inputs.get(identity);
    if (!saved || saved.text !== text) { saved = { text, hash: digest(text) }; inputs.set(identity, saved); }
    const key = currentScope + "\u0000" + configSignature + "\u0000" + saved.hash;
    let entry = cache.get(key);
    if (entry?.done && entry.expiresAt <= Date.now()) { cache.delete(key); entry = null; }
    if (entry) { cache.delete(key); cache.set(key, entry); return entry.done ? entry.reason : ""; }
    if (retryAt > Date.now()) return "";
    if (queue.length + (active ? 1 : 0) >= LIMIT) { issue("QUEUE_FULL"); return ""; }
    entry = { text, done: false, reason: "", expiresAt: 0, requestId: "", timer: 0 };
    cache.set(key, entry); queue.push(entry); trim(); pump();
    return "";
  }
  function sync(settings) {
    checkContext();
    let normalized;
    try { normalized = core.normalize(settings || {}); } catch { normalized = core.normalize({}); }
    const nextConfigSignature = core.signature(normalized);
    const nextEnabled = settings?.enabled !== false && normalized.semanticFilterEnabled === true;
    const next = String(nextEnabled) + ":" + nextConfigSignature;
    if (next === settingsSignature) { updateStatus(); return; }
    const hadMatches = [...cache.values()].some(entry => entry.reason);
    cancelWork(); cache.clear(); inputs = new WeakMap(); issues.clear(); failures = 0; retryAt = 0;
    config = normalized; configSignature = nextConfigSignature; settingsSignature = next; enabled = nextEnabled;
    if (hadMatches) notifyFilters();
    updateStatus();
  }
  function pause() { paused = true; resumeNeeded = cancelWork() || resumeNeeded; }
  function resume() {
    paused = document.visibilityState === "hidden";
    checkContext(); notifyStatus();
    if (!paused && resumeNeeded && enabled) { resumeNeeded = false; notifyFilters(); }
  }
  function connectionChanged(changes, area) {
    if (area !== "local" || !changes || ![CONNECTION_KEY, STATE_KEY].some(key => Object.prototype.hasOwnProperty.call(changes, key))) return;
    // Inspect only changed key names. Tokens remain private to the background.
    const hadMatches = [...cache.values()].some(entry => entry.reason);
    const hadWork = cancelWork();
    cache.clear(); inputs = new WeakMap(); issues.clear(); failures = 0; retryAt = 0;
    if (paused) resumeNeeded = resumeNeeded || hadMatches || hadWork;
    else if (enabled || hadMatches) notifyFilters();
    updateStatus();
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") pause(); else resume(); });
  addEventListener("pagehide", () => { pause(); clearTimeout(filterTimer); filterTimer = 0; clearTimeout(statusTimer); statusTimer = 0; });
  addEventListener("pageshow", resume);
  addEventListener("popstate", checkContext);
  addEventListener("hashchange", checkContext);
  addEventListener("storage", checkContext);
  globalThis.chrome?.storage?.onChanged?.addListener(connectionChanged);
  globalThis.CC98RebornSemanticFilter = { sync, reason, errors: () => [...issues.values()], status };
})();
