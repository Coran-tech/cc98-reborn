(function (root) {
  "use strict";

  const INTERVAL = 60_000;
  const TIMEOUT = 15_000;
  const CACHE_KEY = "cc98RebornHomeIndex:v1";
  function counts(row) {
    const result = {};
    for (const key of ["replyCount", "hitCount"]) {
      let value = row?.[key];
      if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
      if (Number.isSafeInteger(value) && value >= 0) result[key] = value;
    }
    return result;
  }

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
        boardName: item.boardName,
        ...counts(item)
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

  // /config/index need not carry any counters. Ask the native batch endpoint
  // first; some deployments return only id/title/deletion status there.
  function createDetailReader(host, base, isActive, paint) {
    const cache = new Map();
    let owner = "",
      requested = [],
      job = null,
      timer = null,
      retryAt = 0;
    const now = () => host.Date.now();
    function authorization() {
      try {
        const expiry = Number(host.localStorage.getItem("accessToken_expirationTime"));
        if (expiry && expiry * 1000 <= now()) return "";
        const value = (host.localStorage.getItem("accessToken") || "").replace(/^str-/, "");
        return /^Bearer\s+\S+$/i.test(value) ? value : "";
      } catch {
        return "";
      }
    }
    function cancel() {
      host.clearTimeout(timer);
      timer = null;
      job?.abort();
      job = null;
    }
    function stop() {
      cancel();
      requested = [];
      cache.clear();
      owner = "";
      retryAt = 0;
    }
    function update(ids) {
      ids = [...new Set(ids)]
        .filter((id) => Number.isSafeInteger(id) && id > 0)
        .sort((a, b) => a - b)
        .slice(0, 10);
      const auth = authorization();
      if (owner !== auth) {
        stop();
        owner = auth;
      }
      if (requested.join() !== ids.join()) {
        cancel();
        requested = [...ids];
      }
      for (const id of cache.keys()) if (!ids.includes(id)) cache.delete(id);
      if (
        !base ||
        !auth ||
        !ids.length ||
        host.document?.hidden ||
        !isActive() ||
        job ||
        timer != null ||
        now() < retryAt
      )
        return;
      const missing = ids.filter((id) => (cache.get(id)?.next || 0) <= now());
      if (!missing.length) return;
      timer = host.setTimeout(() => {
        timer = null;
        void load(missing, auth);
      }, 400);
    }
    async function load(ids, auth) {
      const controller = new host.AbortController();
      job = controller;
      const valid = () =>
        !controller.signal.aborted &&
        isActive() &&
        !host.document?.hidden &&
        authorization() === auth;
      const check = () => {
        if (!valid()) throw new Error("detail read canceled");
      };
      const deadline = host.setTimeout(() => controller.abort(), 25_000);
      const get = async (path) => {
        check();
        const response = await host.fetch(base + path, {
          headers: { Authorization: auth, Accept: "application/json" },
          signal: controller.signal,
          credentials: /(?:^|\.)webvpn\.zju\.edu\.cn$/.test(host.location.hostname)
            ? "include"
            : "same-origin",
          redirect: "error",
          cache: "no-store"
        });
        check();
        if (!response.ok) {
          if (response.status === 429) {
            const wait = response.headers.get("Retry-After");
            retryAt = Math.max(
              now() + INTERVAL,
              (/^\d+$/.test(wait) ? now() + Number(wait) * 1000 : Date.parse(wait)) || 0
            );
          }
          throw Object.assign(new Error("detail read failed"), { status: response.status });
        }
        const data = await response.json();
        check();
        return data;
      };
      const save = (id, fields) =>
        cache.set(id, { ...cache.get(id), ...fields, next: now() + 5 * INTERVAL });
      try {
        const rows = await get("/topic/basic?" + ids.map((id) => "id=" + id).join("&"));
        if (!Array.isArray(rows)) throw new Error("invalid topic list");
        const partial = [];
        for (const id of ids) {
          const row = rows.find((item) => item?.id === id);
          if (!row || row.isDeleted) {
            cache.set(id, { next: now() + 5 * INTERVAL });
            continue;
          }
          const fields = counts(row);
          if (fields.replyCount === undefined || fields.hitCount === undefined) {
            partial.push(id);
            cache.set(id, { ...cache.get(id), ...fields, next: 0 });
          } else save(id, fields);
        }
        paint();
        for (const id of partial) {
          // No simultaneous per-topic reads, and no downloading post bodies.
          await new Promise((resolve) => {
            const done = () => {
              host.clearTimeout(t);
              controller.signal.removeEventListener("abort", done);
              resolve();
            };
            const t = host.setTimeout(done, 700);
            controller.signal.addEventListener("abort", done, { once: true });
          });
          check();
          try {
            const row = await get("/topic/" + id);
            if (row?.id === id && !row.isDeleted) save(id, counts(row));
            else cache.set(id, { next: now() + 5 * INTERVAL });
          } catch (error) {
            if (![403, 404].includes(error.status)) throw error;
            cache.set(id, { next: now() + 5 * INTERVAL });
          }
          paint();
        }
      } catch (error) {
        if (valid()) {
          retryAt = Math.max(retryAt, now() + INTERVAL);
          if ([401, 403].includes(error.status)) {
            cache.clear();
            paint();
          }
        }
      } finally {
        host.clearTimeout(deadline);
        if (job === controller) job = null;
      }
    }
    return {
      update,
      stop,
      pause: cancel,
      current: () => (owner && owner === authorization() ? cache : undefined)
    };
  }

  function create({ onUpdate, onDetails = () => {}, isActive }, host = root) {
    let snapshot = { onlineUserCount: null, hotTopic: [], checkedAt: 0 };
    let active = false,
      timer = null,
      request = null,
      revision = 0,
      failures = 0;
    const base = apiBase(host.location);
    const details = createDetailReader(host, base, isActive, onDetails);
    const visibility = () => {
      if (host.document.hidden) details.pause();
      else publish();
    };
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
      if (event.key === "accessToken" || event.key === null) {
        if (active) publish();
        return;
      }
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
      host.document?.addEventListener("visibilitychange", visibility);
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
      host.document?.removeEventListener("visibilitychange", visibility);
      details.stop();
    }
    return { start, stop, details, getSnapshot: () => snapshot };
  }

  root.CC98RebornHomeLive = { create, normalizeIndex, apiBase };
  if (typeof module === "object" && module.exports) module.exports = root.CC98RebornHomeLive;
})(globalThis);
