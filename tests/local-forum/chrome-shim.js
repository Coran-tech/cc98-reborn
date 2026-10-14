(function installCc98RebornLocalTestShim() {
  "use strict";

  const strictAuth = globalThis.__CC98_LOCAL_STRICT_AUTH__ === true;
  const bootstrap = globalThis.__CC98_LOCAL_BOOTSTRAP__ || {};
  const listeners = new Set();
  const channel = typeof BroadcastChannel === "function"
    ? new BroadcastChannel("cc98-reborn-local-extension-storage")
    : null;
  let storage = clone(bootstrap.extensionStorage || {});
  let storageVersion = String(bootstrap.extensionStorageVersion || "");
  let mutationQueue = Promise.resolve();
  let pulling = false;

  const requestedTheme = new URLSearchParams(window.location.search).get("__cc98Theme");
  const requestedThemeAllowed = new Set(["soft", "mist", "night", "sage", "lake", "rose", "graphite", "midnight", "wine"])
    .has(requestedTheme);
  if (!storage.cc98ComfortSettings || typeof storage.cc98ComfortSettings !== "object") {
    storage.cc98ComfortSettings = {
      enabled: true,
      rebuildUi: true,
      theme: requestedThemeAllowed ? requestedTheme : "soft",
      density: "comfortable",
      fontScale: 100,
      emojiScale: 100,
      neutralizeNativeSkin: true,
      prewarmPostImages: false,
      previsitFirstPageForTopicImages: false,
      replyRebornTail: false
    };
  } else if (requestedThemeAllowed) {
    storage.cc98ComfortSettings.theme = requestedTheme;
  }
  if (strictAuth && !bootstrap.user) delete storage["cc98RebornOpenIdBinding:v1"];

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function sameValue(left, right) {
    if (left === right) return true;
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }

  function selectStorage(keys) {
    if (keys == null) return clone(storage);
    if (typeof keys === "string") return { [keys]: clone(storage[keys]) };
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, clone(storage[key])]));
    }
    return Object.fromEntries(
      Object.entries(keys || {}).map(([key, fallback]) => [
        key,
        Object.prototype.hasOwnProperty.call(storage, key) ? clone(storage[key]) : clone(fallback)
      ])
    );
  }

  function makeChanges(previous, next) {
    const changes = {};
    const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
    keys.forEach((key) => {
      if (!sameValue(previous?.[key], next?.[key])) {
        changes[key] = {
          oldValue: clone(previous?.[key]),
          newValue: clone(next?.[key])
        };
      }
    });
    return changes;
  }

  function notify(changes) {
    if (!Object.keys(changes || {}).length) return;
    listeners.forEach((listener) => {
      try {
        listener(changes, "local");
      } catch (error) {
        console.error("[CC98 local storage listener]", error);
      }
    });
  }

  async function storageRequest(method, body) {
    const response = await fetch("/__local/extension-storage", {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.json())?.error || "";
      } catch {
        detail = await response.text();
      }
      throw new Error(detail || `extension_storage_http_${response.status}`);
    }
    return response.json();
  }

  function queueMutation(method, body) {
    mutationQueue = mutationQueue
      .catch(() => {})
      .then(async () => {
        const result = await storageRequest(method, body);
        storageVersion = String(result.version || storageVersion);
        channel?.postMessage({ type: "storage-updated", version: storageVersion });
      })
      .catch((error) => {
        console.warn("[CC98 local storage] 持久化失败", error);
      });
    return mutationQueue;
  }

  async function pullStorage(force = false) {
    if (pulling || document.visibilityState === "hidden" && !force) return;
    pulling = true;
    try {
      await mutationQueue.catch(() => {});
      const result = await storageRequest("GET");
      if (!force && result.version && String(result.version) === storageVersion) return;
      const next = clone(result.values || {});
      const previous = storage;
      storage = next;
      storageVersion = String(result.version || "");
      notify(makeChanges(previous, next));
    } catch (error) {
      if (force) console.warn("[CC98 local storage] 同步失败", error);
    } finally {
      pulling = false;
    }
  }

  function callbackResult(callback, value) {
    if (typeof callback === "function") queueMicrotask(() => callback(value));
  }

  const localStorageApi = {
    get(keys, callback) {
      const result = selectStorage(keys);
      callbackResult(callback, result);
      return Promise.resolve(result);
    },
    set(values, callback) {
      const previous = clone(storage);
      Object.entries(values || {}).forEach(([key, value]) => {
        storage[key] = clone(value);
      });
      notify(makeChanges(previous, storage));
      callbackResult(callback);
      queueMutation("PATCH", { values: clone(values || {}) });
      return Promise.resolve();
    },
    remove(keys, callback) {
      const list = (Array.isArray(keys) ? keys : [keys]).filter((key) => key != null).map(String);
      const previous = clone(storage);
      list.forEach((key) => delete storage[key]);
      notify(makeChanges(previous, storage));
      callbackResult(callback);
      queueMutation("PATCH", { remove: list, values: {} });
      return Promise.resolve();
    },
    clear(callback) {
      const previous = clone(storage);
      storage = {};
      notify(makeChanges(previous, storage));
      callbackResult(callback);
      queueMutation("PUT", { replace: true, values: {} });
      return Promise.resolve();
    }
  };

  function runtimeResponse(message) {
    switch (message && message.type) {
      case "CC98_REBORN_GET_UPDATE_STATUS":
      case "CC98_REBORN_CHECK_FOR_UPDATES":
        return { ok: true, hasUpdate: false, currentVersion: "0.3.4", latestVersion: "0.3.4" };
      case "CC98_REBORN_OPENID_LOGOUT":
        return { ok: true };
      default:
        return { ok: true };
    }
  }

  const chromeApi = globalThis.chrome || {};
  chromeApi.storage = {
    local: localStorageApi,
    onChanged: {
      addListener(listener) {
        if (typeof listener === "function") listeners.add(listener);
      },
      removeListener(listener) {
        listeners.delete(listener);
      },
      hasListener(listener) {
        return listeners.has(listener);
      }
    }
  };
  chromeApi.runtime = {
    id: "cc98-reborn-local-test",
    lastError: null,
    getManifest: () => ({ version: "0.3.4" }),
    getURL: (resourcePath) => `${location.origin}/__extension/${String(resourcePath || "").replace(/^\/+/, "")}`,
    sendMessage(message, callback) {
      const response = runtimeResponse(message);
      callbackResult(callback, response);
      return Promise.resolve(response);
    },
    onMessage: {
      addListener() {}
    }
  };
  globalThis.chrome = chromeApi;

  channel?.addEventListener("message", (event) => {
    if (event.data?.type === "storage-updated" && event.data.version !== storageVersion) {
      void pullStorage(true);
    }
  });
  window.setInterval(() => void pullStorage(false), 1800);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void pullStorage(true);
  });

  const userInfo = bootstrap.user || null;
  const setExpiringLocalValue = (key, value, lifetimeSeconds) => {
    localStorage.setItem(key, `str-${value}`);
    localStorage.setItem(`${key}_expirationTime`, String(Math.floor(Date.now() / 1000) + lifetimeSeconds));
  };
  const clearLocalAccountSession = () => {
    [
      "userInfo",
      "userInfo_expirationTime",
      "accessToken",
      "accessToken_expirationTime",
      "access_token",
      "access_token_expirationTime",
      "refresh_token",
      "refresh_token_expirationTime",
      "shouldNotRefreshUserInfo"
    ].forEach((key) => localStorage.removeItem(key));
  };
  ["boardsInfo", "CurrentRecommendedTopics", "LastRecommendedTopics", "mainPageData"].forEach((key) => {
    localStorage.removeItem(key);
  });
  localStorage.setItem("version", "3.5.0");
  if (userInfo) {
    localStorage.setItem("userInfo", `obj-${JSON.stringify(userInfo)}`);
    localStorage.setItem("userInfo_expirationTime", String(Math.floor(Date.now() / 1000) + 30 * 86400));
    if (!strictAuth) {
      setExpiringLocalValue("accessToken", "Bearer cc98-local-test", 86400);
      setExpiringLocalValue("refresh_token", "cc98-local-test-refresh", 30 * 86400);
    } else {
      // Strict-mode identity is owned by the HttpOnly session cookie. Always
      // replace any token left by another account so it cannot override that
      // cookie through an Authorization header on the next page.
      setExpiringLocalValue("accessToken", "Bearer cc98-local-cookie-session", 86400);
      setExpiringLocalValue("refresh_token", "cc98-local-cookie-session", 30 * 86400);
    }
    localStorage.setItem("shouldNotRefreshUserInfo", "str-true");
  } else if (strictAuth) {
    clearLocalAccountSession();
  }
})();
