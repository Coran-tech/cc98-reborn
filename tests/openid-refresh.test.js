const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { webcrypto } = require("crypto");

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    }
  };
}

function createStorageArea(values) {
  return {
    values,
    get(keys, callback) {
      const names = Array.isArray(keys) ? keys : [keys];
      const result = {};
      names.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          result[key] = values[key];
        }
      });
      callback(result);
    },
    set(next, callback) {
      Object.assign(values, next);
      callback?.();
    },
    remove(keys, callback) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete values[key]);
      callback?.();
    }
  };
}

async function run() {
  const localValues = {
    "cc98RebornOpenIdBinding:v1": {
      bound: true,
      userId: "795406",
      userName: "Coran",
      watermarkIdPrefix: "oldwater",
      authTransport: "direct",
      matchedWebAccount: {
        userId: "795406",
        userName: "Coran"
      },
      profileRefreshAttemptedAt: 1
    },
    "cc98RebornOpenIdRefreshCredential:v1": {
      version: 1,
      userId: "795406",
      refreshToken: "refresh-old",
      scope: "openid profile cc98-api read-user-info offline_access",
      authTransport: "direct",
      updatedAt: 1
    }
  };
  const sessionValues = {};
  const alarms = new Map();
  alarms.set("cc98-reborn-openid-profile-refresh", {
    name: "cc98-reborn-openid-profile-refresh",
    periodInMinutes: 1,
    scheduledTime: Date.now() + 60 * 1000
  });
  const alarmEvent = createEvent();
  let authFlowCalls = 0;
  const requests = [];

  const chrome = {
    runtime: {
      lastError: null,
      getManifest: () => ({ version: "0.0.0-test" }),
      onInstalled: createEvent(),
      onStartup: createEvent(),
      onMessage: createEvent()
    },
    storage: {
      local: createStorageArea(localValues),
      session: createStorageArea(sessionValues)
    },
    alarms: {
      onAlarm: alarmEvent,
      get(name, callback) {
        callback(alarms.get(name) || null);
      },
      create(name, options) {
        alarms.set(name, {
          name,
          periodInMinutes: options.periodInMinutes,
          scheduledTime: Date.now() + options.delayInMinutes * 60 * 1000
        });
      },
      clear(name, callback) {
        callback(alarms.delete(name));
      }
    },
    identity: {
      getRedirectURL: () => "https://extension.test/callback",
      launchWebAuthFlow(_options, callback) {
        authFlowCalls += 1;
        callback();
      }
    },
    tabs: {
      onUpdated: createEvent(),
      onRemoved: createEvent(),
      create() {},
      remove(_id, callback) {
        callback?.();
      },
      query(_query, callback) {
        callback([]);
      },
      reload(_id, _options, callback) {
        callback?.();
      },
      sendMessage(_id, _message, callback) {
        callback?.(null);
      }
    },
    downloads: {
      download(_options, callback) {
        callback?.(1);
      }
    },
    browsingData: {
      remove(_options, _types, callback) {
        callback?.();
      }
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {}
    }
  };

  const fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    throw new Error(`Unexpected request: ${url}`);
  };

  const sourcePath = path.join(__dirname, "..", "src", "background.js");
  const source = `${fs.readFileSync(sourcePath, "utf8")}
globalThis.__openidRefreshTest = {
  performOpenIdBindingProfileRefresh,
  ensureOpenIdProfileRefreshAlarm,
  refreshEnabled: OPENID_PROFILE_REFRESH_ENABLED,
  scopes: CC98_OPENID_SCOPES
};`;
  const context = {
    chrome,
    fetch,
    Response,
    URL,
    URLSearchParams,
    TextEncoder,
    Uint8Array,
    crypto: webcrypto,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    setTimeout,
    clearTimeout,
    console
  };
  vm.runInNewContext(source, context, { filename: sourcePath });
  await new Promise((resolve) => setImmediate(resolve));

  const result = await context.__openidRefreshTest.performOpenIdBindingProfileRefresh({ force: true });
  assert.strictEqual(context.__openidRefreshTest.refreshEnabled, false);
  assert.strictEqual(context.__openidRefreshTest.scopes.includes("offline_access"), false);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.refreshed, false);
  assert.strictEqual(result.reason, "local-binding-only");
  assert.strictEqual(result.binding.watermarkIdPrefix, "oldwater");
  assert.strictEqual(result.binding.profileRefreshAttemptedAt, undefined);
  assert.strictEqual(localValues["cc98RebornOpenIdRefreshCredential:v1"], undefined);
  assert.strictEqual(sessionValues["cc98RebornOpenIdAccessCredential:v1"], undefined);
  assert.strictEqual(authFlowCalls, 0);
  assert.strictEqual(requests.length, 0);

  await context.__openidRefreshTest.ensureOpenIdProfileRefreshAlarm();
  assert.strictEqual(alarms.has("cc98-reborn-openid-profile-refresh"), false);
  console.log("openid-local-binding: ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
