(function (root, factory) {
  const core = typeof module === "object" && module.exports ? require("./semantic-filter-core.js") : root.CC98RebornSemanticFilterCore;
  const sdk = typeof module === "object" && module.exports ? require("./semantic-client.js") : root.CC98RebornSemanticClient;
  const api = factory(root, core, sdk);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornSemanticBackground = api;
})(globalThis, function (root, filterCore, clientCore) {
  "use strict";
  const SETTINGS_KEY = "cc98ComfortSettings";
  const CONNECTION_KEY = "cc98RebornSemanticConnection:v1";
  const STATE_KEY = "cc98RebornSemanticState:v1";
  const LOCAL_ORIGIN_PERMISSION = "http://127.0.0.1/*";
  const MESSAGE_PREFIX = "CC98_SEMANTIC_";
  const UI_PATHS = new Set(["/popup/semantic-settings.html", "/popup/popup.html"]);
  const tokenValid = token => typeof token === "string" && token.length >= 1 && token.length <= 1024 && !/[^\x21-\x7e]/.test(token);
  const idValid = id => typeof id === "string" && /^[a-z0-9_.:-]{1,120}$/i.test(id);

  function createBackground(options = {}) {
    const chrome = options.chrome || root.chrome, rules = options.filterCore || filterCore, sdk = options.clientCore || clientCore;
    const maxQueue = options.maxQueue || 64;
    if (!chrome?.runtime || !rules || !sdk?.createClient) throw new Error("Semantic background dependencies are unavailable");
    const ownUrl = new URL(chrome.runtime.getURL(""));
    const queue = [], jobs = new Map(), claimedDocuments = new Set();
    let active, pumping = false, generation = 0, client, clientToken = "", connecting, settingsSignature, statePublication = Promise.resolve();
    const now = options.now || Date.now;

    function response(error, requestId, configSignature) {
      return { ok: false, error, ...(idValid(requestId) ? { requestId } : {}), ...(configSignature ? { configSignature } : {}) };
    }
    function uiSender(sender) {
      try {
        const url = new URL(sender?.url || "");
        return sender.id === chrome.runtime.id && url.protocol === ownUrl.protocol && url.hostname === ownUrl.hostname
          && url.port === ownUrl.port && !url.username && !url.password && UI_PATHS.has(url.pathname);
      } catch { return false; }
    }
    function forumUrl(value) {
      try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol) && !url.username && !url.password
          && (url.hostname === "cc98.org" || url.hostname === "www.cc98.org" || url.hostname.endsWith(".webvpn.zju.edu.cn")) ? url : null;
      } catch { return null; }
    }
    function forumSender(sender) {
      return sender?.id === chrome.runtime.id && Number.isInteger(sender.tab?.id) && sender.tab.id >= 0
        && Number.isInteger(sender.frameId) && sender.frameId >= 0 && Boolean(forumUrl(sender.url));
    }
    function owner(sender) {
      return JSON.stringify([sender.tab?.id ?? "extension", sender.frameId ?? 0, sender.documentId || sender.url]);
    }
    async function trustedForum(sender) {
      if (!forumSender(sender)) return false;
      if (sender.frameId === 0) return true;
      const page = forumUrl(sender.url), parent = forumUrl(sender.tab.url);
      if (!parent || page.origin !== parent.origin || !/\/(?:topic\/\d+|editor\/(?:edit\/)?\d+)(?:\/|$)/i.test(page.pathname)
        || typeof sender.documentId !== "string" || !chrome.scripting?.executeScript) return false;
      const key = owner(sender);
      if (claimedDocuments.has(key)) return true;
      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id, documentIds: [sender.documentId] },
          func: () => window.top !== window && window.parent === window.top && globalThis.__cc98DrawerRuntimeClaimed === true
        });
        if (result[0]?.result !== true) return false;
        claimedDocuments.add(key);
        while (claimedDocuments.size > 64) claimedDocuments.delete(claimedDocuments.values().next().value);
        return true;
      } catch { return false; }
    }
    async function permission() {
      try { return await chrome.permissions.contains({ origins: [LOCAL_ORIGIN_PERMISSION] }) === true; }
      catch { return false; }
    }
    function publishState() {
      statePublication = statePublication.then(async () => {
        const [data, allowed] = await Promise.all([chrome.storage.local.get([STATE_KEY, CONNECTION_KEY]), permission()]);
        const previous = data?.[STATE_KEY]?.epoch;
        const epoch = Math.max(now(), Number.isSafeInteger(previous) && previous >= 0 ? previous + 1 : 1);
        await chrome.storage.local.set({ [STATE_KEY]: { epoch, connected: Boolean(allowed && tokenValid(data?.[CONNECTION_KEY]?.token)) } });
      }).catch(() => {});
      return statePublication;
    }
    async function snapshot() {
      const [data, allowed] = await Promise.all([chrome.storage.local.get([SETTINGS_KEY, CONNECTION_KEY]), permission()]);
      const settings = data?.[SETTINGS_KEY] || {}, config = rules.normalize(settings);
      const globalEnabled = settings.enabled === undefined || settings.enabled === true;
      const configSignature = rules.signature(config), enabled = globalEnabled && config.semanticFilterEnabled;
      if (settingsSignature === undefined) settingsSignature = String(globalEnabled) + ":" + configSignature;
      const token = data?.[CONNECTION_KEY]?.token;
      return { config, configSignature, enabled, globalEnabled, allowed, token: tokenValid(token) ? token : "" };
    }
    function safeError(error) {
      if (error?.code === "HTTP_ERROR") return error.httpStatus === 401 ? "BAD_TOKEN" : error.httpStatus === 429 ? "BUSY" : "SERVICE_REJECTED";
      const codes = { TIMEOUT: "TIMEOUT", ABORTED: "CANCELLED", INVALID_RESPONSE: "INVALID_RESPONSE", RESPONSE_TOO_LARGE: "INVALID_RESPONSE", BUSY: "BUSY", AUTH_REQUIRED: "NOT_CONNECTED" };
      return codes[error?.code] || "SERVICE_UNAVAILABLE";
    }
    function getClient(token) {
      if (!client || clientToken !== token) {
        client?.clearCache(); clientToken = token;
        client = sdk.createClient({ token, timeoutMs: 60000 });
      }
      return client;
    }
    function settle(job, result) {
      if (job.settled) return;
      job.settled = true; jobs.delete(job.key); job.resolve(result);
    }
    function abortJob(job, code) {
      job.controller?.abort();
      settle(job, response(code, job.id, job.signature));
    }
    function invalidate(code = "CANCELLED", forgetClient = false) {
      generation++;
      for (const job of jobs.values()) abortJob(job, code);
      queue.length = 0;
      client?.clearCache();
      connecting?.controller.abort(); connecting = null;
      if (forgetClient) { client = null; clientToken = ""; }
    }
    function blocked(state, test) {
      if (!state.globalEnabled || !test && !state.config.semanticFilterEnabled) return "DISABLED";
      if (!state.allowed) return "PERMISSION_REQUIRED";
      if (!state.token) return "NOT_CONNECTED";
      return "";
    }
    async function pump() {
      if (pumping) return;
      pumping = true;
      try {
        while (queue.length) {
          const job = queue.shift();
          if (job.settled) continue;
          active = job;
          try {
            const state = await snapshot();
            const error = blocked(state, job.test);
            if (job.settled) continue;
            if (error) { settle(job, response(error, job.id, state.configSignature)); continue; }
            if (job.generation !== generation || job.signature !== state.configSignature) {
              settle(job, response("STALE_SETTINGS", job.id, state.configSignature)); continue;
            }
            job.controller = new root.AbortController();
            let onAbort;
            const cancelled = new Promise((resolve, reject) => {
              onAbort = () => { const error = new Error("Cancelled"); error.code = "ABORTED"; reject(error); };
              job.controller.signal.addEventListener("abort", onAbort, { once: true });
            });
            let result;
            try {
              result = await Promise.race([getClient(state.token).analyze({
                text: job.text, model: state.config.semanticFilterModel,
                ...(state.config.semanticFilterModel === "minilm" ? {
                  topicLabels: state.config.semanticFilterLabels.split("\n"),
                  hypothesisTemplate: state.config.semanticFilterHypothesisTemplate, multiLabel: true
                } : {})
              }, { signal: job.controller.signal }), cancelled]);
            } finally { job.controller.signal.removeEventListener("abort", onAbort); }
            if (job.settled) continue;
            const latest = await snapshot();
            if (job.generation !== generation || latest.configSignature !== job.signature || blocked(latest, job.test)) {
              settle(job, response("STALE_SETTINGS", job.id, latest.configSignature)); continue;
            }
            settle(job, { ok: true, requestId: job.id, result, configSignature: job.signature });
          } catch (error) { settle(job, response(safeError(error), job.id, job.signature)); }
          finally { active = null; }
        }
      } finally { pumping = false; }
    }
    async function status() {
      const state = await snapshot();
      return { ok: true, connected: Boolean(state.token && state.allowed), permission: state.allowed, enabled: state.enabled,
        model: state.config.semanticFilterModel, threshold: state.config.semanticFilterThreshold, configSignature: state.configSignature };
    }
    async function connect(message) {
      if (!tokenValid(message.token)) return response("INVALID_TOKEN");
      if (!await permission()) return response("PERMISSION_REQUIRED");
      invalidate("CONNECTION_CHANGED", true);
      const expected = generation, controller = new root.AbortController(), candidate = sdk.createClient({ token: message.token, timeoutMs: 60000 });
      connecting = { controller };
      try {
        await candidate.health({ signal: controller.signal });
        if (generation !== expected || controller.signal.aborted || !await permission()) return response("CANCELLED");
        client = candidate; clientToken = message.token;
        await chrome.storage.local.set({ [CONNECTION_KEY]: { token: message.token, connectedAt: now() } });
        if (generation !== expected) return response("CANCELLED");
        await publishState();
        return status();
      } catch (error) { candidate.clearCache(); return response(safeError(error)); }
      finally { if (connecting?.controller === controller) connecting = null; }
    }
    async function enqueue(message, sender, test) {
      if (!idValid(message.requestId) || typeof message.text !== "string" || !message.text.trim() || message.text.length > 10000) return response("INVALID_INPUT", message.requestId);
      const state = await snapshot(), error = blocked(state, test);
      if (error) return response(error, message.requestId, state.configSignature);
      const key = owner(sender) + ":" + message.requestId;
      if (jobs.has(key)) return response("DUPLICATE_REQUEST", message.requestId, state.configSignature);
      if (jobs.size >= maxQueue) return response("BUSY", message.requestId, state.configSignature);
      return new Promise(resolve => {
        const job = { id: message.requestId, key, owner: owner(sender), tabId: sender.tab?.id, text: message.text,
          test, signature: state.configSignature, generation, resolve, settled: false };
        jobs.set(key, job); queue.push(job); void pump();
      });
    }
    async function handle(message, sender = {}) {
      if (typeof message?.type !== "string" || !message.type.startsWith(MESSAGE_PREFIX)) return undefined;
      const action = message.type.slice(MESSAGE_PREFIX.length);
      try {
        const own = uiSender(sender);
        if (["CONNECT", "DISCONNECT", "TEST"].includes(action) && !own) return response("FORBIDDEN", message.requestId);
        if (action === "CONNECT") return await connect(message);
        if (action === "DISCONNECT") {
          invalidate("DISCONNECTED", true);
          await chrome.storage.local.remove(CONNECTION_KEY);
          await publishState();
          return status();
        }
        if (action === "CANCEL") {
          if (!own && !forumSender(sender)) return response("FORBIDDEN", message.requestId);
          if (!idValid(message.requestId)) return response("INVALID_INPUT");
          const job = jobs.get(owner(sender) + ":" + message.requestId);
          if (job) abortJob(job, "CANCELLED");
          return { ok: true, cancelled: Boolean(job), requestId: message.requestId };
        }
        if (action === "TEST") return await enqueue(message, sender, true);
        if (!own && !await trustedForum(sender)) return response("FORBIDDEN", message.requestId);
        if (action === "STATUS") return await status();
        if (action === "ANALYZE" && !own) return await enqueue(message, sender, false);
        return response("UNSUPPORTED_MESSAGE", message.requestId);
      } catch { return response("UNAVAILABLE", message.requestId); }
    }
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[SETTINGS_KEY]) {
        const settings = changes[SETTINGS_KEY].newValue || {};
        const next = String(settings.enabled === undefined || settings.enabled === true) + ":" + rules.signature(settings);
        if (next !== settingsSignature) { settingsSignature = next; invalidate("STALE_SETTINGS"); }
      }
      if (changes[CONNECTION_KEY]) {
        const token = tokenValid(changes[CONNECTION_KEY].newValue?.token) ? changes[CONNECTION_KEY].newValue.token : "";
        if (token !== clientToken) { invalidate("CONNECTION_CHANGED", true); void publishState(); }
      }
    });
    chrome.permissions?.onRemoved?.addListener(() => {
      void permission().then(allowed => {
        if (!allowed) { invalidate("PERMISSION_REQUIRED", true); return publishState(); }
      });
    });
    chrome.tabs?.onRemoved?.addListener(tabId => {
      for (const job of jobs.values()) if (job.tabId === tabId) abortJob(job, "CANCELLED");
      for (const key of claimedDocuments) if (JSON.parse(key)[0] === tabId) claimedDocuments.delete(key);
    });
    return Object.freeze({ handle });
  }
  const instance = root.chrome?.runtime ? createBackground() : null;
  return Object.freeze({ createBackground, handle: (message, sender) => instance ? instance.handle(message, sender) : Promise.resolve({ ok: false, error: "UNAVAILABLE" }),
    SETTINGS_KEY, CONNECTION_KEY, STATE_KEY, LOCAL_ORIGIN_PERMISSION });
});
