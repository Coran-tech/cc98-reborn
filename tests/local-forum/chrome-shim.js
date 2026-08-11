(function installCc98RebornLocalTestShim() {
  const listeners = [];
  const requestedTheme = new URLSearchParams(window.location.search).get("__cc98Theme");
  const theme = new Set(["soft", "mist", "night", "sage", "lake", "rose", "graphite", "midnight", "wine"])
    .has(requestedTheme)
    ? requestedTheme
    : "soft";
  const storage = {
    cc98ComfortSettings: {
      enabled: true,
      rebuildUi: true,
      theme,
      density: "comfortable",
      fontScale: 100,
      emojiScale: 100,
      neutralizeNativeSkin: true,
      prewarmPostImages: false,
      previsitFirstPageForTopicImages: false,
      replyRebornTail: false
    },
    "cc98RebornOpenIdBinding:v1": {
      ok: true,
      bound: true,
      provider: "cc98-local-test",
      userId: "795406",
      userName: "LocalTester",
      watermarkIdPrefix: "LOCAL001",
      boundAt: Date.now()
    }
  };

  function selectStorage(keys) {
    if (keys == null) {
      return { ...storage };
    }
    if (typeof keys === "string") {
      return { [keys]: storage[keys] };
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, storage[key]]));
    }
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [
        key,
        Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback
      ])
    );
  }

  function notifyStorageChanges(nextValues, removedKeys) {
    const changes = {};
    Object.entries(nextValues || {}).forEach(([key, value]) => {
      changes[key] = { oldValue: storage[key], newValue: value };
    });
    (removedKeys || []).forEach((key) => {
      changes[key] = { oldValue: storage[key], newValue: undefined };
    });
    listeners.forEach((listener) => listener(changes, "local"));
  }

  const localStorageApi = {
    get(keys, callback) {
      const result = selectStorage(keys);
      if (typeof callback === "function") {
        queueMicrotask(() => callback(result));
      }
      return Promise.resolve(result);
    },
    set(values, callback) {
      notifyStorageChanges(values, []);
      Object.assign(storage, values || {});
      if (typeof callback === "function") {
        queueMicrotask(callback);
      }
      return Promise.resolve();
    },
    remove(keys, callback) {
      const list = Array.isArray(keys) ? keys : [keys];
      notifyStorageChanges({}, list);
      list.forEach((key) => delete storage[key]);
      if (typeof callback === "function") {
        queueMicrotask(callback);
      }
      return Promise.resolve();
    },
    clear(callback) {
      const keys = Object.keys(storage);
      notifyStorageChanges({}, keys);
      keys.forEach((key) => delete storage[key]);
      if (typeof callback === "function") {
        queueMicrotask(callback);
      }
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
        listeners.push(listener);
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
      if (typeof callback === "function") {
        queueMicrotask(() => callback(response));
      }
      return Promise.resolve(response);
    },
    onMessage: {
      addListener() {}
    }
  };
  globalThis.chrome = chromeApi;

  const userInfo = {
    id: 795406,
    name: "LocalTester",
    portraitUrl: "/static/images/default_avatar_girl.png",
    privilege: "\u6b63\u5f0f\u7528\u6237",
    displayTitle: "\u672c\u5730\u6d4b\u8bd5\u7528\u6237",
    displayTitleId: 0,
    postCount: 1234,
    fanCount: 42,
    followCount: 18,
    popularity: 7,
    prestige: 1,
    gender: 1,
    theme: 4,
    isVerified: true,
    lockState: 0,
    lastLogOnTime: new Date().toISOString()
  };
  localStorage.setItem("version", "3.5.0");
  localStorage.setItem("userInfo", `obj-${JSON.stringify(userInfo)}`);
  localStorage.setItem("accessToken", "str-Bearer%20cc98-local-test");
  localStorage.setItem("refresh_token", "str-cc98-local-test-refresh");
  localStorage.setItem("shouldNotRefreshUserInfo", "str-true");
})();
