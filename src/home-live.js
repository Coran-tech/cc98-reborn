(function (root) {
  "use strict";

  const INTERVAL = 60_000;
  const TIMEOUT = 15_000;
  const CACHE_KEY = "cc98RebornHomeIndex:v1";

  function normalizeIndex(data) {
    if (!data || typeof data !== "object") return null;
    const onlineUserCount =
      Number.isSafeInteger(data.onlineUserCount) && data.onlineUserCount >= 0
        ? data.onlineUserCount
        : null;
    let hotTopic = null;
    if (
      Array.isArray(data.hotTopic) &&
      data.hotTopic.every(
        (item) =>
          item &&
          Number.isSafeInteger(item.id) &&
          item.id > 0 &&
          typeof item.title === "string" &&
          item.title.trim() &&
          Number.isSafeInteger(item.boardId) &&
          item.boardId > 0 &&
          typeof item.boardName === "string"
      )
    ) {
      hotTopic = data.hotTopic.slice(0, 10).map((item) => ({
        id: item.id,
        title: item.title,
        boardId: item.boardId,
        boardName: item.boardName
      }));
      if (new Set(hotTopic.map((item) => item.id)).size !== hotTopic.length) hotTopic = null;
    }
    return onlineUserCount !== null || hotTopic !== null ? { onlineUserCount, hotTopic } : null;
  }

  function apiBase(location) {
    if (/^(?:www\.)?cc98\.org$/.test(location.hostname)) return "https://api.cc98.org";
    if (/(?:^|\.)webvpn\.zju\.edu\.cn$/.test(location.hostname)) {
      return "https://webvpn.zju.edu.cn/https/77726476706e69737468656265737421f1e748d22433310830079bab";
    }
    if (/^(?:localhost|127\.0\.0\.1)$/.test(location.hostname)) return location.origin;
    return "";
  }

  function create({ onUpdate, isActive }, host = root) {
    let snapshot = { onlineUserCount: null, hotTopic: [], checkedAt: 0 };
    let active = false,
      timer = null,
      request = null,
      revision = 0,
      failures = 0;
    const base = apiBase(host.location);
    const now = () => host.Date.now();
    const valid = (epoch) => active && revision === epoch && isActive();
    function read(key, native = false) {
      try {
        const text = host.localStorage.getItem(key);
        return JSON.parse(native && text?.startsWith("obj-") ? text.slice(4) : text || "null");
      } catch {
        return null;
      }
    }
    function merge(data, checkedAt) {
      const next = normalizeIndex(data);
      if (!next) return false;
      snapshot = {
        onlineUserCount: next.onlineUserCount ?? snapshot.onlineUserCount,
        // An empty hot list is a normal intermediate result during recalculation.
        hotTopic: next.hotTopic?.length ? next.hotTopic : snapshot.hotTopic,
        checkedAt: Number.isFinite(checkedAt) ? Math.min(now(), Math.max(0, checkedAt)) : 0
      };
      return true;
    }
    function loadCache() {
      const cached = read(CACHE_KEY);
      if (cached && cached.checkedAt >= snapshot.checkedAt) merge(cached, cached.checkedAt);
      // Reuse the native homepage response when it has just been loaded. Never
      // write native storage or touch its login/session data.
      const native = read("mainPageData", true);
      let nativeAt = 0;
      try {
        nativeAt =
          Number(host.localStorage.getItem("mainPageData_expirationTime")) * 1000 - INTERVAL;
      } catch {
        /* Storage can be disabled. */
      }
      if (nativeAt > snapshot.checkedAt) merge(native, nativeAt);
      else if (!snapshot.hotTopic.length && snapshot.onlineUserCount === null) merge(native, 0);
      if (!snapshot.hotTopic.length) {
        const previous = read("mainPageHotTopic", true);
        merge({ hotTopic: previous }, snapshot.checkedAt);
      }
    }
    function publish() {
      if (active && isActive()) onUpdate(snapshot);
    }
    function schedule(delay) {
      host.clearTimeout(timer);
      if (active) timer = host.setTimeout(poll, Math.max(0, delay));
    }
    function onStorage(event) {
      if (event.key !== CACHE_KEY || !active || !isActive()) return;
      loadCache();
      publish();
      if (!request) schedule(Math.max(0, snapshot.checkedAt + INTERVAL - now()));
    }
    async function poll() {
      timer = null;
      if (!active || !isActive()) {
        stop();
        return;
      }
      if (request) return;
      const epoch = revision;
      const controller = new host.AbortController();
      request = controller;
      let delay = INTERVAL;
      const timeout = host.setTimeout(() => controller.abort(), TIMEOUT);
      try {
        const update = async () => {
          if (!valid(epoch)) return;
          loadCache();
          if (snapshot.checkedAt > 0 && now() - snapshot.checkedAt < INTERVAL) return;
          const response = await host.fetch(base + "/config/index", {
            method: "GET",
            headers: { Accept: "application/json" },
            credentials: /(?:^|\.)webvpn\.zju\.edu\.cn$/.test(host.location.hostname)
              ? "include"
              : "omit",
            cache: "no-store",
            redirect: "error",
            signal: controller.signal
          });
          if (!valid(epoch)) return;
          if (!response.ok) {
            const retry = response.headers.get("Retry-After");
            const retryMs =
              retry && /^\d+(?:\.\d+)?$/.test(retry)
                ? Number(retry) * 1000
                : Date.parse(retry) - now();
            if (Number.isFinite(retryMs) && retryMs > 0)
              delay = Math.min(2_147_483_647, Math.max(INTERVAL, retryMs));
            throw new Error(`Homepage request failed: ${response.status}`);
          }
          const data = await response.json();
          if (!valid(epoch)) return;
          if (!merge(data, now())) throw new Error("Invalid homepage response");
          try {
            host.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
          } catch {
            /* In-memory updates still work. */
          }
        };
        // Same-origin tabs share one response rather than polling in parallel.
        if (host.navigator?.locks?.request) {
          await host.navigator.locks.request(CACHE_KEY, { signal: controller.signal }, update);
        } else {
          await update();
        }
        if (!valid(epoch)) return;
        failures = 0;
        publish();
        delay = Math.max(1000, snapshot.checkedAt + INTERVAL - now());
      } catch {
        if (!valid(epoch)) return;
        failures = Math.min(failures + 1, 4);
        delay = Math.max(delay, Math.min(5 * INTERVAL, INTERVAL * 2 ** (failures - 1)));
      } finally {
        host.clearTimeout(timeout);
        if (request === controller) request = null;
        if (valid(epoch)) schedule(delay);
      }
    }
    function start() {
      if (active || !base || !isActive()) return;
      active = true;
      revision++;
      failures = 0;
      loadCache();
      publish();
      host.addEventListener("storage", onStorage);
      schedule(Math.max(0, snapshot.checkedAt + INTERVAL - now()));
    }
    function stop() {
      active = false;
      revision++;
      host.clearTimeout(timer);
      timer = null;
      request?.abort();
      request = null;
      host.removeEventListener("storage", onStorage);
    }
    return { start, stop, getSnapshot: () => snapshot };
  }

  root.CC98RebornHomeLive = { create, normalizeIndex, apiBase };
  if (typeof module === "object" && module.exports) module.exports = root.CC98RebornHomeLive;
})(globalThis);
