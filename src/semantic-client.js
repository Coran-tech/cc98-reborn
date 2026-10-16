(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornSemanticClient = api;
})(globalThis, function (root) {
  "use strict";

  // This client is deliberately dormant until health() or analyze() is called.
  // It does not read settings, credentials, files, or forum documents.
  const BASE_URL = "http://127.0.0.1:8766";
  const SCHEMA_VERSION = 1;
  const MODEL_IDS = Object.freeze(["cold", "horizon", "minilm"]);
  const MAX_RESPONSE_BYTES = 256 * 1024;
  const MAX_TEXT_LENGTH = 10000;
  const SCORE_TYPES = Object.freeze(["softmax", "independent-sigmoid", "independent-nli-entailment", "exclusive-nli-entailment"]);

  class SemanticClientError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "SemanticClientError";
      this.code = code;
    }
  }
  function fail(code, message) { throw new SemanticClientError(code, message); }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
  function boundedString(value, length) {
    return typeof value === "string" && value.length > 0 && value.length <= length && !/[\u0000-\u001f\u007f]/.test(value);
  }
  function validScore(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1; }
  function validTemplate(value) {
    return boundedString(value, 200) && (value.match(/\{\}/g) || []).length === 1 && !/[{}]/.test(value.replace("{}", ""));
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function serviceError(value) {
    if (boundedString(value, 2000)) return value;
    if (!object(value) || !boundedString(value.code, 100) || !boundedString(value.message, 2000)) {
      fail("INVALID_RESPONSE", "Invalid semantic error");
    }
    return { code: value.code, message: value.message };
  }
  function optionalMetadata(source, target) {
    if (source.scoreType !== undefined) {
      if (!SCORE_TYPES.includes(source.scoreType)) fail("INVALID_RESPONSE", "Invalid semantic score type");
      target.scoreType = source.scoreType;
    }
    for (const key of ["inputTokens", "processedTokens", "maxInputTokens", "inputCharacters"]) {
      if (source[key] === undefined) continue;
      const maximum = key === "inputCharacters" ? MAX_TEXT_LENGTH : 1000000;
      if (!Number.isSafeInteger(source[key]) || source[key] < (key === "maxInputTokens" ? 1 : 0) || source[key] > maximum) {
        fail("INVALID_RESPONSE", "Invalid semantic token metadata");
      }
      target[key] = source[key];
    }
    if (target.processedTokens !== undefined && target.maxInputTokens !== undefined && target.processedTokens > target.maxInputTokens) {
      fail("INVALID_RESPONSE", "Processed tokens exceed model capacity");
    }
    for (const key of ["inferenceMs", "loadMs", "originalElapsedMs"]) {
      if (source[key] === undefined) continue;
      if (typeof source[key] !== "number" || !Number.isFinite(source[key]) || source[key] < 0 || source[key] > 3600000) {
        fail("INVALID_RESPONSE", "Invalid semantic timing metadata");
      }
      target[key] = source[key];
    }
    for (const key of ["loadedNow", "cached", "multiLabel"]) {
      if (source[key] === undefined) continue;
      if (typeof source[key] !== "boolean") fail("INVALID_RESPONSE", "Invalid semantic boolean metadata");
      target[key] = source[key];
    }
    for (const [key, maximum] of [["repository", 200], ["device", 40], ["dtype", 40]]) {
      if (source[key] === undefined) continue;
      if (!boundedString(source[key], maximum)) fail("INVALID_RESPONSE", "Invalid semantic text metadata");
      target[key] = source[key];
    }
    if (source.hypothesisTemplate !== undefined) {
      if (!validTemplate(source.hypothesisTemplate)) fail("INVALID_RESPONSE", "Invalid semantic hypothesis template");
      target.hypothesisTemplate = source.hypothesisTemplate;
    }
    if (source.topicLabels !== undefined) {
      if (!Array.isArray(source.topicLabels) || source.topicLabels.length < 2 || source.topicLabels.length > 12
        || source.topicLabels.some(label => !boundedString(label, 60)) || new Set(source.topicLabels).size !== source.topicLabels.length) {
        fail("INVALID_RESPONSE", "Invalid semantic topic metadata");
      }
      target.topicLabels = source.topicLabels.slice();
    }
  }
  function integerOption(options, key, fallback, minimum, maximum) {
    const value = options[key] === undefined ? fallback : options[key];
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail("INVALID_OPTIONS", "Invalid " + key);
    return value;
  }
  function validateLabels(value, required) {
    if (value === undefined && !required) return [];
    if (!Array.isArray(value) || (value.length !== 0 || required) && (value.length < 2 || value.length > 12)) {
      fail("INVALID_INPUT", "Topic labels must contain 2 to 12 labels");
    }
    const labels = value.map(label => {
      if (typeof label !== "string") fail("INVALID_INPUT", "Invalid topic label");
      const normalized = label.trim();
      if (!boundedString(normalized, 60)) fail("INVALID_INPUT", "Topic labels must contain 1 to 60 characters");
      return normalized;
    });
    if (new Set(labels.map(label => label.toLocaleLowerCase())).size !== labels.length) fail("INVALID_INPUT", "Topic labels must be distinct");
    return labels;
  }
  function validateAnalysis(value, model, configuration) {
    if (!object(value) || value.schemaVersion !== SCHEMA_VERSION || !boundedString(value.requestId, 128)
      || !Array.isArray(value.results) || value.results.length !== 1) fail("INVALID_RESPONSE", "Invalid semantic response envelope");
    const result = value.results[0];
    if (!object(result) || result.model !== model || !boundedString(result.revision, 512) || !boundedString(result.task, 80)
      || !Array.isArray(result.labels) || result.labels.length > 64 || (!result.error && !result.labels.length)
      || typeof result.truncated !== "boolean" || typeof result.elapsedMs !== "number" || !Number.isFinite(result.elapsedMs)
      || result.elapsedMs < 0 || result.elapsedMs > 3600000) fail("INVALID_RESPONSE", "Invalid semantic model result");
    const labels = result.labels.map(entry => {
      if (!object(entry) || !boundedString(entry.label, 128) || !validScore(entry.score)) fail("INVALID_RESPONSE", "Invalid semantic label score");
      const normalized = { label: entry.label, score: entry.score };
      if (entry.title !== undefined) {
        if (!boundedString(entry.title, 128)) fail("INVALID_RESPONSE", "Invalid semantic label title");
        normalized.title = entry.title;
      }
      return normalized;
    });
    if (new Set(labels.map(entry => entry.label)).size !== labels.length) fail("INVALID_RESPONSE", "Duplicate semantic labels");
    const normalized = {
      model: result.model, revision: result.revision, task: result.task, labels,
      elapsedMs: result.elapsedMs, truncated: result.truncated
    };
    if (result.toxicityScore !== undefined) {
      if (!validScore(result.toxicityScore)) fail("INVALID_RESPONSE", "Invalid toxicity score");
      normalized.toxicityScore = result.toxicityScore;
    }
    if (result.error !== undefined) normalized.error = serviceError(result.error);
    optionalMetadata(result, normalized);
    if (model === "minilm" && configuration) {
      for (const key of ["hypothesisTemplate", "multiLabel"]) {
        if (configuration[key] !== undefined && normalized[key] !== undefined && configuration[key] !== normalized[key]) {
          fail("INVALID_RESPONSE", "Semantic response configuration does not match the request");
        }
      }
      if (normalized.topicLabels !== undefined && JSON.stringify(configuration.topicLabels) !== JSON.stringify(normalized.topicLabels)) {
        fail("INVALID_RESPONSE", "Semantic response labels do not match the request");
      }
    }
    return { schemaVersion: SCHEMA_VERSION, requestId: value.requestId, results: [normalized] };
  }
  function validateHealth(value) {
    if (!object(value) || value.schemaVersion !== SCHEMA_VERSION) fail("INVALID_RESPONSE", "Invalid semantic health response");
    if (value.models !== undefined) {
      if (!Array.isArray(value.models) || value.models.length > MODEL_IDS.length) fail("INVALID_RESPONSE", "Invalid health models");
      const ids = new Set();
      for (const model of value.models) {
        const id = model?.id ?? model?.model;
        if (!object(model) || !MODEL_IDS.includes(id) || ids.has(id)
          || model.revision !== undefined && !boundedString(model.revision, 512)) fail("INVALID_RESPONSE", "Invalid health model revision");
        ids.add(id);
      }
    }
    return value;
  }

  function createClient(options = {}) {
    if (!object(options)) fail("INVALID_OPTIONS", "Client options must be an object");
    for (const key of ["url", "baseUrl", "baseURL", "endpoint", "origin"]) {
      if (Object.prototype.hasOwnProperty.call(options, key)) fail("INVALID_OPTIONS", "The semantic service address is fixed");
    }
    const fetcher = options.fetch === undefined ? root.fetch?.bind(root) : options.fetch;
    if (typeof fetcher !== "function") fail("INVALID_OPTIONS", "Fetch is unavailable");
    const timeoutMs = integerOption(options, "timeoutMs", 20000, 1, 60000);
    const cacheTtlMs = integerOption(options, "cacheTtlMs", 5 * 60 * 1000, 0, 60 * 60 * 1000);
    const maxCacheEntries = integerOption(options, "maxCacheEntries", 64, 0, 256);
    const maxCacheBytes = integerOption(options, "maxCacheBytes", 512 * 1024, 0, 4 * 1024 * 1024);
    const maxPending = integerOption(options, "maxPending", 4, 1, 16);
    const now = options.now || Date.now;
    if (typeof now !== "function") fail("INVALID_OPTIONS", "Invalid clock");
    const crypto = options.crypto === undefined ? root.crypto : options.crypto;
    const token = options.token;
    const cache = new Map(), revisions = new Map();
    let cacheBytes = 0, active = 0, cacheGeneration = 0;
    function auth() {
      if (typeof token !== "string" || !token || token.length > 1024 || /[^\x21-\x7e]/.test(token)) {
        fail("AUTH_REQUIRED", "A local service token is required");
      }
      return "Bearer " + token;
    }
    function clearCache() { cache.clear(); cacheBytes = 0; cacheGeneration++; }
    function removeEntry(key) {
      const entry = cache.get(key);
      if (entry) { cacheBytes -= entry.bytes; cache.delete(key); }
    }
    function revisionChanged(model, revision) {
      if (revisions.get(model) === revision) return;
      revisions.set(model, revision);
      for (const [key, entry] of cache) if (entry.model === model && entry.revision !== revision) removeEntry(key);
    }
    function cached(key) {
      const entry = cache.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) { removeEntry(key); return null; }
      cache.delete(key); cache.set(key, entry);
      return clone(entry.value);
    }
    function remember(key, value, model, generation) {
      if (!key || !cacheTtlMs || !maxCacheEntries || !maxCacheBytes || value.results[0].error || generation !== cacheGeneration) return;
      const bytes = (key.length + JSON.stringify(value).length) * 2;
      if (bytes > maxCacheBytes) return;
      removeEntry(key);
      cache.set(key, { value: clone(value), model, revision: value.results[0].revision, expiresAt: now() + cacheTtlMs, bytes });
      cacheBytes += bytes;
      while (cache.size > maxCacheEntries || cacheBytes > maxCacheBytes) removeEntry(cache.keys().next().value);
    }
    async function digest(text) {
      // If Web Crypto is unavailable, skip caching rather than retain plaintext
      // keys or risk serving another text's result after a weak-hash collision.
      if (!crypto?.subtle?.digest || typeof root.TextEncoder !== "function") return "";
      try {
        const hash = await crypto.subtle.digest("SHA-256", new root.TextEncoder().encode(text));
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
      } catch { return ""; }
    }
    function requestOptions(value) {
      if (value === undefined) return {};
      if (!object(value) || value.refresh !== undefined && typeof value.refresh !== "boolean") fail("INVALID_INPUT", "Invalid request options");
      const signal = value.signal;
      if (signal !== undefined && (!signal || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function")) {
        fail("INVALID_INPUT", "Invalid cancellation signal");
      }
      if (signal?.aborted) fail("ABORTED", "Semantic request was cancelled");
      return value;
    }
    async function readJson(response, signal) {
      if (!response || typeof response.ok !== "boolean") fail("INVALID_RESPONSE", "Invalid service response");
      function httpError(details) {
        const error = new SemanticClientError("HTTP_ERROR", "Local semantic service returned HTTP " + response.status);
        if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) error.httpStatus = response.status;
        if (details !== undefined) error.serviceError = serviceError(details);
        throw error;
      }
      const length = response.headers?.get?.("content-length");
      if (length && (/^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES)) fail("RESPONSE_TOO_LARGE", "Semantic response is too large");
      const contentType = response.headers?.get?.("content-type");
      if (contentType && !/^application\/(?:json|[\w.-]+\+json)(?:\s*;|$)/i.test(contentType)) {
        if (!response.ok) httpError();
        fail("INVALID_RESPONSE", "Semantic response must be JSON");
      }
      let text;
      if (response.body?.getReader && typeof root.TextDecoder === "function") {
        const reader = response.body.getReader(), chunks = [];
        let size = 0;
        const cancel = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
        signal.addEventListener("abort", cancel, { once: true });
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > MAX_RESPONSE_BYTES) { cancel(); fail("RESPONSE_TOO_LARGE", "Semantic response is too large"); }
            chunks.push(part.value);
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          try { text = new root.TextDecoder("utf-8", { fatal: true }).decode(bytes); }
          catch { fail("INVALID_RESPONSE", "Semantic response is not valid UTF-8"); }
        } finally {
          signal.removeEventListener("abort", cancel);
          try { reader.releaseLock(); } catch {}
        }
      } else {
        if (typeof response.text !== "function") fail("INVALID_RESPONSE", "Invalid service response body");
        text = await response.text();
        if (typeof text !== "string" || text.length > MAX_RESPONSE_BYTES || new root.TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
          fail("RESPONSE_TOO_LARGE", "Semantic response is too large");
        }
      }
      let value;
      try { value = JSON.parse(text); }
      catch {
        if (!response.ok) httpError();
        fail("INVALID_RESPONSE", "Semantic response contains invalid JSON");
      }
      if (!response.ok) httpError(object(value) ? value.error : undefined);
      if (object(value) && value.error !== undefined && value.results === undefined) {
        if (value.schemaVersion !== SCHEMA_VERSION) fail("INVALID_RESPONSE", "Invalid semantic error response version");
        const error = new SemanticClientError("SERVICE_ERROR", "The local semantic service reported an error");
        error.serviceError = serviceError(value.error);
        throw error;
      }
      return value;
    }
    async function request(path, body, inputOptions) {
      const settings = requestOptions(inputOptions), authorization = auth();
      if (active >= maxPending) fail("BUSY", "Too many local semantic requests");
      const controller = new root.AbortController();
      let timer, cancelReason, rejectCancellation;
      const cancellation = new Promise((resolve, reject) => { rejectCancellation = reject; });
      const cancel = code => {
        if (cancelReason) return;
        cancelReason = new SemanticClientError(code, code === "TIMEOUT" ? "Local semantic request timed out" : "Semantic request was cancelled");
        controller.abort(); rejectCancellation(cancelReason);
      };
      const onAbort = () => cancel("ABORTED");
      settings.signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => cancel("TIMEOUT"), timeoutMs);
      active++;
      try {
        const headers = { Accept: "application/json", Authorization: authorization };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        const operation = Promise.resolve().then(async () => {
          const response = await fetcher(BASE_URL + path, {
            method: body === undefined ? "GET" : "POST", headers,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal
          });
          return readJson(response, controller.signal);
        });
        return await Promise.race([operation, cancellation]);
      } catch (error) {
        if (cancelReason) throw cancelReason;
        if (error instanceof SemanticClientError) throw error;
        fail("NETWORK_ERROR", "Unable to connect to the local semantic service");
      } finally {
        clearTimeout(timer); settings.signal?.removeEventListener("abort", onAbort); active--;
      }
    }
    async function health(inputOptions) {
      const value = validateHealth(await request("/api/v1/health", undefined, inputOptions));
      for (const model of value.models || []) if (model.revision !== undefined) revisionChanged(model.id ?? model.model, model.revision);
      return clone(value);
    }
    async function analyze(input, inputOptions) {
      const settings = requestOptions(inputOptions);
      auth();
      if (!object(input) || typeof input.text !== "string" || !input.text.trim() || input.text.length > MAX_TEXT_LENGTH
        || !MODEL_IDS.includes(input.model)) fail("INVALID_INPUT", "Expected text of 1 to 10000 characters and a supported model");
      const text = input.text, model = input.model;
      const labels = validateLabels(input.topicLabels, model === "minilm");
      const configuration = { topicLabels: labels };
      if (input.hypothesisTemplate !== undefined) {
        if (!validTemplate(input.hypothesisTemplate)) fail("INVALID_INPUT", "Hypothesis template must contain exactly one {} within 200 characters");
        configuration.hypothesisTemplate = input.hypothesisTemplate;
      }
      if (input.multiLabel !== undefined) {
        if (typeof input.multiLabel !== "boolean") fail("INVALID_INPUT", "multiLabel must be a boolean");
        configuration.multiLabel = input.multiLabel;
      }
      const generation = cacheGeneration, hash = await digest(text);
      requestOptions(settings);
      const keyFor = revision => hash && revision ? JSON.stringify([model, revision, labels, configuration.hypothesisTemplate ?? null, configuration.multiLabel ?? null, hash]) : "";
      const key = keyFor(revisions.get(model));
      if (key && !settings.refresh) { const hit = cached(key); if (hit) return hit; }
      const value = validateAnalysis(await request("/api/v1/evaluate", {
        schemaVersion: SCHEMA_VERSION, text, models: [model], ...configuration
      }, settings), model, configuration);
      revisionChanged(model, value.results[0].revision);
      remember(keyFor(value.results[0].revision), value, model, generation);
      return clone(value);
    }
    return Object.freeze({ health, analyze, clearCache });
  }

  return Object.freeze({ createClient, SemanticClientError, BASE_URL, SCHEMA_VERSION, MODEL_IDS, MAX_RESPONSE_BYTES, MAX_TEXT_LENGTH });
});
