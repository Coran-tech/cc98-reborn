const UPDATE_STATUS_STORAGE_KEY = "cc98RebornUpdateStatus:v1";
const UPDATE_STARTUP_NOTICE_SESSION_KEY = "cc98RebornUpdateStartupNoticeShown:v1";
const OPENID_BINDING_STORAGE_KEY = "cc98RebornOpenIdBinding:v1";
const OPENID_WEBVPN_PENDING_STORAGE_KEY = "cc98RebornOpenIdWebVpnPending:v1";
const OPENID_WEBVPN_PENDING_TTL_MS = 10 * 60 * 1000;
const OPENID_PROFILE_REFRESH_ALARM_NAME = "cc98-reborn-openid-profile-refresh";
const OPENID_PROFILE_REFRESH_INTERVAL_MINUTES = 60;
const OPENID_PROFILE_REFRESH_MIN_INTERVAL_MS = 55 * 60 * 1000;
const UPDATE_CHECK_ALARM_NAME = "cc98-reborn-update-check";
const UPDATE_CHECK_INTERVAL_MINUTES = 6 * 60;
const UPDATE_CHECK_MIN_INTERVAL_MS = 30 * 60 * 1000;
const CC98_OPENID_CLIENT_ID = "9ca359c2-4112-44de-6177-08debd80dfb1";
const CC98_OPENID_AUTHORIZE_URL = "https://openid.cc98.org/connect/authorize";
const CC98_OPENID_TOKEN_URL = "https://openid.cc98.org/connect/token";
const CC98_OPENID_USERINFO_URL = "https://openid.cc98.org/connect/userinfo";
const CC98_API_ME_URL = "https://api.cc98.org/me";
const CC98_WEBVPN_OPENID_REDIRECT_URI = "https://www.cc98.org/";
const CC98_OPENID_SCOPES = ["openid", "profile", "cc98-api", "read-user-info"];
const CC98_WEBVPN_ORIGIN = "https://webvpn.zju.edu.cn";
const CC98_WEBVPN_HOST_TOKENS = Object.freeze({
  "openid.cc98.org": "77726476706e69737468656265737421ffe744922e3426537d51d1e2974724",
  "api.cc98.org": "77726476706e69737468656265737421f1e748d22433310830079bab"
});
const RELEASES_API_URL = "https://api.github.com/repos/Coran-tech/cc98-reborn/releases/latest";
const RELEASES_LIST_API_URL = "https://api.github.com/repos/Coran-tech/cc98-reborn/releases?per_page=1";
const RELEASES_LATEST_PAGE_URL = "https://github.com/Coran-tech/cc98-reborn/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/Coran-tech/cc98-reborn/releases";
const RELEASES_MIRROR_API_URL = "https://gh-proxy.com/https://api.github.com/repos/Coran-tech/cc98-reborn/releases/latest";
const CC98_SITE_DATA_ORIGINS = [
  "https://cc98.org",
  "https://www.cc98.org",
  "https://api.cc98.org",
  "https://openid.cc98.org",
  "https://account.cc98.org",
  "https://file.cc98.org",
  "https://www-cc98-org-s.webvpn.zju.edu.cn",
  "https://webvpn.zju.edu.cn",
  "http://cc98.org",
  "http://www.cc98.org",
  "http://api.cc98.org",
  "http://openid.cc98.org",
  "http://account.cc98.org",
  "http://file.cc98.org",
  "http://webvpn.zju.edu.cn"
];
const CC98_OPENID_SESSION_ORIGINS = [
  "https://openid.cc98.org",
  "http://openid.cc98.org"
];
const CC98_TAB_URL_PATTERNS = [
  "*://cc98.org/*",
  "*://*.cc98.org/*",
  "*://www-cc98-org-s.webvpn.zju.edu.cn/*",
  "*://*.webvpn.zju.edu.cn/*"
];
let openIdProfileRefreshPromise = null;
let pendingOpenIdWebVpnFlow = null;
let openIdWebVpnCallbackPromise = null;

function isCc98Url(url) {
  return /\.cc98\.org$/i.test(url.hostname)
    || url.hostname === "cc98.org"
    || /(?:^|\.)webvpn\.zju\.edu\.cn$/i.test(url.hostname);
}

function handleDownloadFile(message, sendResponse) {
  let url;
  try {
    url = new URL(message.url);
  } catch {
    sendResponse({ ok: false, error: "invalid-url" });
    return false;
  }

  if (!isCc98Url(url)) {
    sendResponse({ ok: false, error: "unsupported-host" });
    return false;
  }

  chrome.downloads.download({
    url: url.href,
    saveAs: false,
    conflictAction: "uniquify"
  }, (downloadId) => {
    const error = chrome.runtime.lastError?.message;
    sendResponse({
      ok: Boolean(downloadId) && !error,
      downloadId,
      error
    });
  });

  return true;
}

function removeBrowsingData(options, dataTypes) {
  return new Promise((resolve) => {
    if (!chrome.browsingData?.remove) {
      resolve({ ok: false, error: "browsingData-unavailable" });
      return;
    }
    chrome.browsingData.remove(options, dataTypes, () => {
      const error = chrome.runtime.lastError?.message || "";
      resolve({ ok: !error, error });
    });
  });
}

function queryCc98Tabs() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: CC98_TAB_URL_PATTERNS }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

function reloadTab(tabId) {
  return new Promise((resolve) => {
    if (!Number.isFinite(tabId)) {
      resolve(false);
      return;
    }
    chrome.tabs.reload(tabId, { bypassCache: true }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function reloadCc98Tabs() {
  const tabs = await queryCc98Tabs();
  let reloaded = 0;
  for (const tab of tabs) {
    // Sequential reloads avoid transient browser API throttling on many open CC98 tabs.
    // eslint-disable-next-line no-await-in-loop
    if (await reloadTab(tab.id)) {
      reloaded += 1;
    }
  }
  return reloaded;
}

function queryActiveTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    if (!Number.isFinite(tabId)) {
      resolve({ ok: false, error: "invalid-tab" });
      return;
    }
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message || "tab-message-failed" });
        return;
      }
      resolve(response || { ok: false, error: "empty-response" });
    });
  });
}

function dedupeTabs(tabs) {
  const seen = new Set();
  return tabs.filter((tab) => {
    if (!Number.isFinite(tab?.id) || seen.has(tab.id)) {
      return false;
    }
    seen.add(tab.id);
    return true;
  });
}

function isCc98WebPageTabUrl(value) {
  try {
    const url = new URL(value || "");
    return /^(?:www\.)?cc98\.org$/i.test(url.hostname)
      || /(?:^|\.)webvpn\.zju\.edu\.cn$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isWebVpnPageUrl(value) {
  try {
    return /(?:^|\.)webvpn\.zju\.edu\.cn$/i.test(new URL(value || "").hostname);
  } catch {
    return false;
  }
}

async function findCurrentCc98WebAccount() {
  const tabs = dedupeTabs([
    ...await queryActiveTabs(),
    ...await queryCc98Tabs()
  ]);
  let fallback = null;
  for (const tab of tabs) {
    if (!isCc98WebPageTabUrl(tab.url)) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await sendTabMessage(tab.id, { type: "CC98_REBORN_GET_CURRENT_WEB_ACCOUNT" });
    if (!result?.ok || !result.account) {
      continue;
    }
    if (result.account.userId) {
      return {
        ok: true,
        account: result.account,
        tabId: tab.id,
        authTransport: isWebVpnPageUrl(tab.url) ? "webvpn" : "direct"
      };
    }
    fallback = fallback || {
      ok: true,
      account: result.account,
      tabId: tab.id,
      authTransport: isWebVpnPageUrl(tab.url) ? "webvpn" : "direct",
      warning: "uid-missing"
    };
  }
  return fallback || {
    ok: false,
    error: "未找到已登录且已加载插件的 CC98 标签页。请打开或刷新一个已登录的 CC98 页面后再绑定。"
  };
}

async function exitCurrentCc98WebAccount() {
  const found = await findCurrentCc98WebAccount();
  if (!found?.ok || !Number.isFinite(found.tabId)) {
    return found;
  }
  const result = await sendTabMessage(found.tabId, { type: "CC98_REBORN_EXIT_CURRENT_ACCOUNT" });
  return result?.ok ? { ok: true, tabId: found.tabId } : result;
}

async function clearCc98SiteData() {
  const removed = await removeBrowsingData({
    origins: CC98_SITE_DATA_ORIGINS,
    originTypes: {
      unprotectedWeb: true,
      protectedWeb: true
    }
  }, {
    cookies: true,
    localStorage: true,
    indexedDB: true,
    cacheStorage: true,
    serviceWorkers: true
  });
  if (!removed.ok) {
    return removed;
  }
  const reloadedTabs = await reloadCc98Tabs();
  return {
    ok: true,
    origins: CC98_SITE_DATA_ORIGINS.length,
    reloadedTabs
  };
}

async function clearCc98OpenIdSessionData() {
  const removed = await removeBrowsingData({
    origins: CC98_OPENID_SESSION_ORIGINS,
    originTypes: {
      unprotectedWeb: true,
      protectedWeb: true
    }
  }, {
    cookies: true,
    localStorage: true,
    indexedDB: true,
    cacheStorage: true,
    serviceWorkers: true
  });
  return {
    ok: Boolean(removed.ok),
    error: removed.error || "",
    origins: CC98_OPENID_SESSION_ORIGINS.length
  };
}

function readLocalStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function writeLocalStorage(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });
}

function readSessionStorage(keys) {
  return new Promise((resolve) => {
    if (!chrome.storage.session) {
      resolve({});
      return;
    }
    chrome.storage.session.get(keys, (result) => resolve(result || {}));
  });
}

function writeSessionStorage(values) {
  return new Promise((resolve) => {
    if (!chrome.storage.session) {
      resolve();
      return;
    }
    chrome.storage.session.set(values, () => resolve());
  });
}

function removeSessionStorage(keys) {
  return new Promise((resolve) => {
    if (!chrome.storage.session) {
      resolve();
      return;
    }
    chrome.storage.session.remove(keys, () => resolve());
  });
}

function removeLocalStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

function base64UrlFromBytes(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

async function createCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlFromBytes(new Uint8Array(digest));
}

function launchWebAuthFlow(url, { interactive = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!chrome.identity?.launchWebAuthFlow) {
      reject(new Error("identity-unavailable"));
      return;
    }
    chrome.identity.launchWebAuthFlow({ url, interactive }, (redirectUrl) => {
      const error = chrome.runtime.lastError?.message;
      if (error) {
        reject(new Error(error));
        return;
      }
      if (!redirectUrl) {
        reject(new Error("empty-redirect-url"));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

function launchWebVpnTabAuthFlow(url, { interactive = true } = {}) {
  return new Promise((resolve, reject) => {
    let authTabId = null;
    let settled = false;
    const timeoutMs = interactive ? 5 * 60 * 1000 : 30 * 1000;

    const cleanup = ({ closeTab = true } = {}) => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      chrome.tabs.onRemoved.removeListener(handleTabRemoved);
      clearTimeout(timeoutId);
      if (pendingOpenIdWebVpnFlow?.complete === finish) {
        pendingOpenIdWebVpnFlow.complete = null;
      }
      if (closeTab && Number.isFinite(authTabId)) {
        chrome.tabs.remove(authTabId, () => {
          void chrome.runtime.lastError;
        });
      }
    };

    const finish = (callbackUrl) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(callbackUrl);
    };

    const fail = (error, options = {}) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup(options);
      reject(error instanceof Error ? error : new Error(String(error || "webvpn-authorization-failed")));
    };

    const inspectUrl = (candidate) => {
      if (!candidate) {
        return false;
      }
      const recovered = recoverPendingOpenIdWebVpnCallback(candidate);
      if (!recovered.ok) {
        return false;
      }
      finish(recovered.redirectUrl);
      return true;
    };

    function handleTabUpdated(tabId, changeInfo, tab) {
      if (tabId !== authTabId) {
        return;
      }
      inspectUrl(changeInfo.url || tab?.url || "");
    }

    function handleTabRemoved(tabId) {
      if (tabId === authTabId) {
        fail(new Error("webvpn authorization tab was closed"), { closeTab: false });
      }
    }

    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
    if (pendingOpenIdWebVpnFlow) {
      pendingOpenIdWebVpnFlow.complete = finish;
    }
    const timeoutId = setTimeout(() => {
      fail(new Error("webvpn authorization timed out"));
    }, timeoutMs);

    chrome.tabs.create({ url, active: interactive }, (tab) => {
      const error = chrome.runtime.lastError?.message;
      if (error || !Number.isFinite(tab?.id)) {
        fail(new Error(error || "webvpn authorization tab could not be created"), { closeTab: false });
        return;
      }
      authTabId = tab.id;
      inspectUrl(tab.url || "");
    });
  });
}

function getAuthRedirectParams(redirectUrl) {
  const candidates = [String(redirectUrl || "")];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = decodeURIComponent(candidates[candidates.length - 1]);
      if (decoded === candidates[candidates.length - 1]) {
        break;
      }
      candidates.push(decoded);
    } catch {
      break;
    }
  }
  const params = new URLSearchParams();
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const sources = [
        new URLSearchParams(url.search),
        new URLSearchParams(url.hash.replace(/^#/, ""))
      ];
      for (const source of sources) {
        for (const [key, value] of source) {
          if (!params.has(key)) {
            params.set(key, value);
          }
        }
      }
    } catch {
      // Try the next decoded representation.
    }
  }
  return params;
}

function recoverPendingOpenIdWebVpnCallback(value, pending = pendingOpenIdWebVpnFlow) {
  if (!pending || pending.expiresAt < Date.now()) {
    return { ok: false, error: "no-pending-webvpn-openid-flow" };
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(value, CC98_WEBVPN_ORIGIN);
  } catch {
    return { ok: false, error: "invalid-webvpn-callback-url" };
  }
  const expectedRedirectUrl = new URL(pending.redirectUri);
  const isDirectExtensionCallback = sourceUrl.origin === expectedRedirectUrl.origin
    && sourceUrl.pathname === expectedRedirectUrl.pathname;
  if (!isWebVpnPageUrl(sourceUrl.href) && !isDirectExtensionCallback) {
    return { ok: false, error: "not-openid-callback" };
  }

  const params = getAuthRedirectParams(sourceUrl.href);
  if (params.get("state") !== pending.state) {
    return { ok: false, error: "webvpn-callback-state-mismatch" };
  }
  if (!params.get("code") && !params.get("error")) {
    return { ok: false, error: "webvpn-callback-result-missing" };
  }

  const redirectUrl = new URL(pending.redirectUri);
  ["code", "state", "error", "error_description", "session_state", "iss"].forEach((key) => {
    const result = params.get(key);
    if (result) {
      redirectUrl.searchParams.set(key, result);
    }
  });
  return { ok: true, redirectUrl: redirectUrl.href };
}

async function readPersistedOpenIdWebVpnFlow() {
  const stored = await readSessionStorage(OPENID_WEBVPN_PENDING_STORAGE_KEY);
  const pending = stored[OPENID_WEBVPN_PENDING_STORAGE_KEY];
  if (
    !pending
    || pending.authTransport !== "webvpn"
    || !pending.state
    || !pending.redirectUri
    || !pending.codeVerifier
    || Number(pending.expiresAt) < Date.now()
  ) {
    if (pending) {
      await removeSessionStorage(OPENID_WEBVPN_PENDING_STORAGE_KEY);
    }
    return null;
  }
  return pending;
}

function persistOpenIdWebVpnFlow(pending) {
  return writeSessionStorage({
    [OPENID_WEBVPN_PENDING_STORAGE_KEY]: pending
  });
}

function clearPersistedOpenIdWebVpnFlow() {
  return removeSessionStorage(OPENID_WEBVPN_PENDING_STORAGE_KEY);
}

function normalizeOpenIdAuthTransport(value) {
  return value === "webvpn" ? "webvpn" : "direct";
}

function getOpenIdTransportUrl(value, authTransport = "direct") {
  const directUrl = new URL(value);
  if (normalizeOpenIdAuthTransport(authTransport) !== "webvpn") {
    return directUrl.href;
  }
  const hostToken = CC98_WEBVPN_HOST_TOKENS[directUrl.hostname.toLowerCase()];
  if (!hostToken) {
    throw new Error(`webvpn: unsupported host ${directUrl.hostname}`);
  }
  const protocol = directUrl.protocol.replace(/:$/, "").toLowerCase();
  return `${CC98_WEBVPN_ORIGIN}/${protocol}/${hostToken}${directUrl.pathname}${directUrl.search}${directUrl.hash}`;
}

async function exchangeOpenIdCode(code, codeVerifier, redirectUri, authTransport = "direct") {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CC98_OPENID_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });
  const response = await fetch(getOpenIdTransportUrl(CC98_OPENID_TOKEN_URL, authTransport), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store",
    credentials: normalizeOpenIdAuthTransport(authTransport) === "webvpn" ? "include" : "omit"
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const reason = payload.error_description || payload.error || payload.raw || `HTTP ${response.status}`;
    throw new Error(`token: ${reason}`);
  }
  if (!payload.access_token) {
    throw new Error("token: missing access_token");
  }
  return payload;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function describeOpenIdPayload(payload, status) {
  const reason = payload?.error_description || payload?.error || payload?.message || payload?.raw || `HTTP ${status}`;
  return String(reason).replace(/\s+/g, " ").trim().slice(0, 220) || `HTTP ${status}`;
}

async function fetchJsonWithBearer(url, accessToken, label, { retries = 0, authTransport = "direct" } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(getOpenIdTransportUrl(url, authTransport), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      cache: "no-store",
      credentials: normalizeOpenIdAuthTransport(authTransport) === "webvpn" ? "include" : "omit"
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (response.ok) {
      return payload;
    }
    lastError = new Error(`${label}: ${describeOpenIdPayload(payload, response.status)}`);
    if (response.status < 500 || attempt >= retries) {
      throw lastError;
    }
    await wait(350 * (attempt + 1));
  }
  throw lastError || new Error(`${label}: request failed`);
}

async function fetchCc98Me(accessToken, authTransport = "direct") {
  return fetchJsonWithBearer(CC98_API_ME_URL, accessToken, "me", {
    retries: 2,
    authTransport
  });
}

async function fetchOpenIdUserInfo(accessToken, authTransport = "direct") {
  return fetchJsonWithBearer(CC98_OPENID_USERINFO_URL, accessToken, "userinfo", {
    retries: 1,
    authTransport
  });
}

async function fetchCc98Profile(accessToken, authTransport = "direct") {
  try {
    const profile = await fetchCc98Me(accessToken, authTransport);
    return {
      ...profile,
      _cc98RebornProfileSource: "api-me"
    };
  } catch (meError) {
    try {
      const profile = await fetchOpenIdUserInfo(accessToken, authTransport);
      return {
        ...profile,
        _cc98RebornProfileSource: "openid-userinfo",
        _cc98RebornProfileWarning: meError?.message || "me failed; watermark unavailable"
      };
    } catch (userInfoError) {
      const meMessage = meError?.message || "me failed";
      const userInfoMessage = userInfoError?.message || "userinfo failed";
      throw new Error(`${meMessage}; ${userInfoMessage}`);
    }
  }
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeProfileKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getProfileContainers(profile) {
  const containers = [];
  const add = (value) => {
    if (value && typeof value === "object" && !containers.includes(value)) {
      containers.push(value);
    }
  };
  add(profile);
  ["data", "user", "currentUser", "current_user", "profile", "me", "result", "value"].forEach((key) => {
    add(profile?.[key]);
  });
  return containers;
}

function findProfileValueDeep(value, keys, depth = 0, seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  const normalizedKeys = new Set(keys.map(normalizeProfileKey));
  for (const [key, child] of Object.entries(value)) {
    if (normalizedKeys.has(normalizeProfileKey(key)) && child !== undefined && child !== null && child !== "") {
      return child;
    }
  }
  for (const preferredKey of ["data", "user", "currentUser", "current_user", "profile", "me", "result", "value"]) {
    const child = value[preferredKey];
    const found = findProfileValueDeep(child, keys, depth + 1, seen);
    if (found !== undefined && found !== null && found !== "") {
      return found;
    }
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findProfileValueDeep(child, keys, depth + 1, seen);
      if (found !== undefined && found !== null && found !== "") {
        return found;
      }
    }
    return undefined;
  }
  for (const child of Object.values(value)) {
    const found = findProfileValueDeep(child, keys, depth + 1, seen);
    if (found !== undefined && found !== null && found !== "") {
      return found;
    }
  }
  return undefined;
}

function pickProfileValue(profile, keys) {
  for (const container of getProfileContainers(profile)) {
    for (const [key, value] of Object.entries(container)) {
      if (keys.some((candidate) => normalizeProfileKey(candidate) === normalizeProfileKey(key))
        && value !== undefined
        && value !== null
        && value !== "") {
        return value;
      }
    }
  }
  return findProfileValueDeep(profile, keys);
}

function normalizeOpenIdBinding(profile, tokenPayload = {}) {
  const userId = pickProfileValue(profile, ["id", "userId", "uid", "userID", "user_id", "cc98Id", "cc98UserId", "cc98_user_id", "sub"]);
  const userName = pickProfileValue(profile, ["name", "userName", "username", "nickName", "displayName", "preferred_username"]);
  const portraitUrl = pickProfileValue(profile, ["portraitUrl", "avatarUrl", "avatar", "picture", "headImg"]);
  const watermarkId = String(pickProfileValue(profile, ["watermarkId", "watermark_id", "watermark", "watermarkID"]) || "");
  return {
    ok: true,
    bound: true,
    provider: "cc98",
    userId: userId === undefined ? "" : String(userId),
    userName: userName === undefined ? "" : String(userName),
    portraitUrl: portraitUrl === undefined ? "" : String(portraitUrl),
    watermarkIdPrefix: watermarkId ? watermarkId.slice(0, 8) : "",
    profileSource: profile._cc98RebornProfileSource || "api-me",
    profileWarning: watermarkId ? "" : (profile._cc98RebornProfileWarning || "OpenID /me \u672a\u8fd4\u56de watermarkId"),
    scope: tokenPayload.scope || CC98_OPENID_SCOPES.join(" "),
    boundAt: Date.now()
  };
}

function normalizeAccountId(value) {
  return String(value ?? "").trim();
}

function normalizeAccountName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeExpectedAccountForStorage(account) {
  if (!account) {
    return null;
  }
  return {
    userId: normalizeAccountId(
      account.userId
      ?? account.id
      ?? account.uid
      ?? account.userID
      ?? account.cc98Id
      ?? account.cc98UserId
    ),
    userName: String(
      account.userName
      ?? account.name
      ?? account.username
      ?? account.nickName
      ?? account.displayName
      ?? ""
    ).trim()
  };
}

function accountsReferToSameCc98User(left, right) {
  if (!left || !right) {
    return false;
  }
  const leftId = normalizeAccountId(left.userId ?? left.id ?? left.uid ?? left.userID ?? left.cc98Id ?? left.cc98UserId ?? left.sub);
  const rightId = normalizeAccountId(right.userId ?? right.id ?? right.uid ?? right.userID ?? right.cc98Id ?? right.cc98UserId ?? right.sub);
  if (leftId && rightId) {
    return leftId === rightId;
  }
  const leftName = normalizeAccountName(left.userName ?? left.name ?? left.username ?? left.nickName ?? left.displayName);
  const rightName = normalizeAccountName(right.userName ?? right.name ?? right.username ?? right.nickName ?? right.displayName);
  return Boolean(leftName && rightName && leftName === rightName);
}

function requireSameCc98UserId(binding, expectedAccount) {
  const expectedId = normalizeAccountId(expectedAccount?.userId ?? expectedAccount?.id ?? expectedAccount?.uid ?? expectedAccount?.userID ?? expectedAccount?.cc98Id ?? expectedAccount?.cc98UserId);
  const actualId = normalizeAccountId(binding?.userId ?? binding?.id ?? binding?.uid ?? binding?.userID ?? binding?.cc98Id ?? binding?.cc98UserId);
  if (!expectedId) {
    throw new Error("\u65e0\u6cd5\u786e\u8ba4\u5f53\u524d CC98 \u7f51\u9875\u8d26\u53f7 UID\uff0c\u8bf7\u5148\u5237\u65b0\u5df2\u767b\u5f55\u7684 CC98 \u9875\u9762\u540e\u518d\u7ed1\u5b9a\u3002");
  }
  if (!actualId) {
    throw new Error("OpenID /me \u672a\u8fd4\u56de UID\uff0c\u65e0\u6cd5\u9a8c\u8bc1\u662f\u5426\u4e3a\u540c\u4e00\u8d26\u53f7\u3002");
  }
  if (actualId !== expectedId) {
    throw new Error(`OpenID \u6388\u6743\u8d26\u53f7\u4e0e\u5f53\u524d CC98 \u7f51\u9875\u8d26\u53f7\u4e0d\u4e00\u81f4\uff1aUID ${actualId} / ${expectedId}`);
  }
}

async function getOpenIdBinding() {
  const result = await readLocalStorage(OPENID_BINDING_STORAGE_KEY);
  const binding = result[OPENID_BINDING_STORAGE_KEY];
  return binding?.bound ? { ok: true, binding } : { ok: true, binding: null };
}

async function requestCc98OpenIdBinding({
  forceLogin = false,
  interactive = true,
  authTransport = "direct",
  expectedAccount = null,
  resumeMode = "request"
} = {}) {
  const normalizedTransport = normalizeOpenIdAuthTransport(authTransport);
  const redirectUri = normalizedTransport === "webvpn"
    ? CC98_WEBVPN_OPENID_REDIRECT_URI
    : chrome.identity.getRedirectURL();
  const state = randomBase64Url(24);
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const authorizeUrl = new URL(CC98_OPENID_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", CC98_OPENID_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", CC98_OPENID_SCOPES.join(" "));
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  if (forceLogin) {
    authorizeUrl.searchParams.set("prompt", "login consent");
    authorizeUrl.searchParams.set("max_age", "0");
  } else if (!interactive) {
    authorizeUrl.searchParams.set("prompt", "none");
  }
  const authFlowUrl = getOpenIdTransportUrl(authorizeUrl.href, normalizedTransport);
  if (normalizedTransport === "webvpn") {
    const createdAt = Date.now();
    const persistedPending = {
      version: 1,
      state,
      redirectUri,
      codeVerifier,
      authTransport: "webvpn",
      expectedAccount: normalizeExpectedAccountForStorage(expectedAccount),
      resumeMode: resumeMode === "refresh" ? "refresh" : "bind",
      createdAt,
      expiresAt: createdAt + OPENID_WEBVPN_PENDING_TTL_MS
    };
    pendingOpenIdWebVpnFlow = {
      ...persistedPending,
      complete: null
    };
    await persistOpenIdWebVpnFlow(persistedPending);
  }
  let redirectUrl;
  try {
    redirectUrl = normalizedTransport === "webvpn"
      ? await launchWebVpnTabAuthFlow(authFlowUrl, { interactive })
      : await launchWebAuthFlow(authFlowUrl, { interactive });
  } catch (error) {
    if (normalizedTransport === "webvpn") {
      pendingOpenIdWebVpnFlow = null;
      await clearPersistedOpenIdWebVpnFlow();
    }
    throw new Error(`${normalizedTransport} authorize: ${error?.message || "authorization failed"}`);
  }
  if (normalizedTransport === "webvpn") {
    pendingOpenIdWebVpnFlow = null;
  }
  try {
    const redirectedParams = getAuthRedirectParams(redirectUrl);
    const returnedState = redirectedParams.get("state");
    if (returnedState !== state) {
      throw new Error("state-mismatch");
    }
    const error = redirectedParams.get("error");
    if (error) {
      throw new Error(redirectedParams.get("error_description") || error);
    }
    const code = redirectedParams.get("code");
    if (!code) {
      throw new Error("missing-code");
    }
    const tokenPayload = await exchangeOpenIdCode(
      code,
      codeVerifier,
      redirectUri,
      normalizedTransport
    );
    const profile = await fetchCc98Profile(tokenPayload.access_token, normalizedTransport);
    return normalizeOpenIdBinding(profile, tokenPayload);
  } finally {
    if (normalizedTransport === "webvpn") {
      await clearPersistedOpenIdWebVpnFlow();
    }
  }
}

function prepareOpenIdBindingForStorage(binding, expectedAccount, authTransport) {
  const nextBinding = { ...binding };
  if (expectedAccount) {
    requireSameCc98UserId(nextBinding, expectedAccount);
    nextBinding.matchedWebAccount = {
      ...normalizeExpectedAccountForStorage(expectedAccount),
      matchedAt: Date.now()
    };
  }
  nextBinding.storageMode = "local-readonly";
  nextBinding.authTransport = normalizeOpenIdAuthTransport(authTransport);
  nextBinding.verifiedBy = "openid-api-me";
  nextBinding.verifiedAt = Date.now();
  nextBinding.profileRefreshAttemptedAt = nextBinding.verifiedAt;
  if (nextBinding.profileSource === "api-me") {
    nextBinding.profileRefreshedAt = nextBinding.verifiedAt;
  }
  nextBinding.profileRefreshError = "";
  return nextBinding;
}

async function loginWithCc98OpenId(expectedAccount = null, { authTransport = "direct" } = {}) {
  const normalizedTransport = normalizeOpenIdAuthTransport(authTransport);
  let binding = await requestCc98OpenIdBinding({
    forceLogin: false,
    authTransport: normalizedTransport,
    expectedAccount,
    resumeMode: "bind"
  });
  if (expectedAccount) {
    try {
      requireSameCc98UserId(binding, expectedAccount);
    } catch (firstError) {
      await clearCc98OpenIdSessionData();
      binding = await requestCc98OpenIdBinding({
        forceLogin: true,
        authTransport: normalizedTransport,
        expectedAccount,
        resumeMode: "bind"
      });
      try {
        requireSameCc98UserId(binding, expectedAccount);
      } catch {
        throw firstError;
      }
    }
  }
  binding = prepareOpenIdBindingForStorage(binding, expectedAccount, normalizedTransport);
  await writeLocalStorage({ [OPENID_BINDING_STORAGE_KEY]: binding });
  return { ok: true, binding };
}

function closeTabQuietly(tabId) {
  return new Promise((resolve) => {
    if (!Number.isFinite(tabId)) {
      resolve(false);
      return;
    }
    chrome.tabs.remove(tabId, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function persistResumedOpenIdWebVpnBinding(binding, pending) {
  const existing = (await getOpenIdBinding()).binding;
  if (pending.resumeMode === "refresh" && existing?.bound) {
    if (binding.profileSource !== "api-me" || !binding.watermarkIdPrefix) {
      throw new Error("OpenID /me did not return a usable watermarkId");
    }
    requireSameCc98UserId(binding, existing.matchedWebAccount || existing);
    const refreshedAt = Date.now();
    const nextBinding = {
      ...existing,
      userId: binding.userId || existing.userId,
      userName: binding.userName || existing.userName,
      portraitUrl: binding.portraitUrl || existing.portraitUrl,
      watermarkIdPrefix: binding.watermarkIdPrefix,
      profileSource: "api-me",
      profileWarning: "",
      scope: binding.scope || existing.scope,
      storageMode: "local-readonly",
      authTransport: "webvpn",
      verifiedBy: "openid-api-me",
      verifiedAt: refreshedAt,
      profileRefreshedAt: refreshedAt,
      profileRefreshAttemptedAt: refreshedAt,
      profileRefreshError: ""
    };
    await writeLocalStorage({ [OPENID_BINDING_STORAGE_KEY]: nextBinding });
    return nextBinding;
  }

  const nextBinding = prepareOpenIdBindingForStorage(
    binding,
    pending.expectedAccount || null,
    "webvpn"
  );
  await writeLocalStorage({ [OPENID_BINDING_STORAGE_KEY]: nextBinding });
  return nextBinding;
}

async function resumePersistedOpenIdWebVpnFlow(recovered, pending, authTabId) {
  try {
    const params = getAuthRedirectParams(recovered.redirectUrl);
    const error = params.get("error");
    if (error) {
      throw new Error(params.get("error_description") || error);
    }
    const code = params.get("code");
    if (!code) {
      throw new Error("missing-code");
    }
    const tokenPayload = await exchangeOpenIdCode(
      code,
      pending.codeVerifier,
      pending.redirectUri,
      "webvpn"
    );
    const profile = await fetchCc98Profile(tokenPayload.access_token, "webvpn");
    const binding = await persistResumedOpenIdWebVpnBinding(
      normalizeOpenIdBinding(profile, tokenPayload),
      pending
    );
    await closeTabQuietly(authTabId);
    return {
      ok: true,
      binding,
      resumed: true
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "webvpn-openid-resume-failed"
    };
  } finally {
    await clearPersistedOpenIdWebVpnFlow();
  }
}

async function handleOpenIdWebVpnCallback(value, sender = {}) {
  const memoryPending = pendingOpenIdWebVpnFlow?.expiresAt >= Date.now()
    ? pendingOpenIdWebVpnFlow
    : null;
  const pending = memoryPending || await readPersistedOpenIdWebVpnFlow();
  const recovered = recoverPendingOpenIdWebVpnCallback(value, pending);
  if (!recovered.ok) {
    return recovered;
  }

  if (memoryPending && typeof memoryPending.complete === "function") {
    memoryPending.complete(recovered.redirectUrl);
    return {
      ...recovered,
      resumed: false
    };
  }

  if (!openIdWebVpnCallbackPromise) {
    openIdWebVpnCallbackPromise = resumePersistedOpenIdWebVpnFlow(
      recovered,
      pending,
      sender.tab?.id
    ).finally(() => {
      openIdWebVpnCallbackPromise = null;
    });
  }
  return openIdWebVpnCallbackPromise;
}

function isOpenIdWebVpnCallbackNavigation(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const directRedirect = new URL(CC98_WEBVPN_OPENID_REDIRECT_URI);
  const isSupportedCallback = isWebVpnPageUrl(url.href)
    || (
      url.origin === directRedirect.origin
      && url.pathname === directRedirect.pathname
    );
  if (!isSupportedCallback) {
    return false;
  }
  const params = getAuthRedirectParams(url.href);
  return Boolean(
    params.get("state")
    && (params.get("code") || params.get("error"))
  );
}

function handleOpenIdWebVpnNavigation(details) {
  if (
    details?.frameId !== 0
    || !Number.isFinite(details?.tabId)
    || !isOpenIdWebVpnCallbackNavigation(details?.url)
  ) {
    return;
  }
  handleOpenIdWebVpnCallback(details.url, {
    tab: { id: details.tabId }
  }).catch(() => {});
}

function handleOpenIdWebVpnTabUpdated(tabId, changeInfo, tab) {
  const url = changeInfo?.url || tab?.url || "";
  if (!Number.isFinite(tabId) || !isOpenIdWebVpnCallbackNavigation(url)) {
    return;
  }
  handleOpenIdWebVpnCallback(url, {
    tab: { id: tabId }
  }).catch(() => {});
}

async function performOpenIdBindingProfileRefresh({ force = false } = {}) {
  const current = await getOpenIdBinding();
  const binding = current.binding;
  if (!binding?.bound) {
    return { ok: true, binding: null, refreshed: false, reason: "not-bound" };
  }

  const now = Date.now();
  const lastAttemptAt = Number(
    binding.profileRefreshAttemptedAt
    || binding.profileRefreshedAt
    || binding.verifiedAt
    || binding.boundAt
    || 0
  );
  if (!force && lastAttemptAt && now - lastAttemptAt < OPENID_PROFILE_REFRESH_MIN_INTERVAL_MS) {
    return { ok: true, binding, refreshed: false, reason: "fresh" };
  }

  try {
    const refreshed = await requestCc98OpenIdBinding({
      forceLogin: false,
      interactive: false,
      authTransport: normalizeOpenIdAuthTransport(binding.authTransport),
      expectedAccount: binding.matchedWebAccount || binding,
      resumeMode: "refresh"
    });
    if (refreshed.profileSource !== "api-me" || !refreshed.watermarkIdPrefix) {
      throw new Error("OpenID /me did not return a usable watermarkId");
    }
    requireSameCc98UserId(refreshed, binding.matchedWebAccount || binding);

    const refreshedAt = Date.now();
    const nextBinding = {
      ...binding,
      userId: refreshed.userId || binding.userId,
      userName: refreshed.userName || binding.userName,
      portraitUrl: refreshed.portraitUrl || binding.portraitUrl,
      watermarkIdPrefix: refreshed.watermarkIdPrefix,
      profileSource: "api-me",
      profileWarning: "",
      scope: refreshed.scope || binding.scope,
      storageMode: "local-readonly",
      verifiedBy: "openid-api-me",
      verifiedAt: refreshedAt,
      profileRefreshedAt: refreshedAt,
      profileRefreshAttemptedAt: refreshedAt,
      profileRefreshError: ""
    };
    await writeLocalStorage({ [OPENID_BINDING_STORAGE_KEY]: nextBinding });
    return { ok: true, binding: nextBinding, refreshed: true };
  } catch (error) {
    const failedAt = Date.now();
    const message = String(error?.message || "openid-profile-refresh-failed").slice(0, 240);
    const latest = (await getOpenIdBinding()).binding;
    const originalId = normalizeAccountId(binding.userId);
    const latestId = normalizeAccountId(latest?.userId);
    if (latest?.bound && (!originalId || !latestId || originalId === latestId)) {
      const nextBinding = {
        ...latest,
        profileRefreshAttemptedAt: failedAt,
        profileRefreshError: message
      };
      await writeLocalStorage({ [OPENID_BINDING_STORAGE_KEY]: nextBinding });
      return { ok: false, binding: nextBinding, refreshed: false, error: message };
    }
    return { ok: false, binding: latest || binding, refreshed: false, error: message };
  }
}

function refreshOpenIdBindingProfile(options = {}) {
  if (openIdProfileRefreshPromise) {
    return openIdProfileRefreshPromise;
  }
  openIdProfileRefreshPromise = performOpenIdBindingProfileRefresh(options)
    .finally(() => {
      openIdProfileRefreshPromise = null;
    });
  return openIdProfileRefreshPromise;
}

async function logoutCc98OpenId() {
  pendingOpenIdWebVpnFlow = null;
  await clearPersistedOpenIdWebVpnFlow();
  await removeLocalStorage(OPENID_BINDING_STORAGE_KEY);
  const session = await clearCc98OpenIdSessionData();
  return {
    ok: true,
    binding: null,
    openIdSessionCleared: Boolean(session.ok),
    openIdSessionError: session.error || ""
  };
}

function normalizeVersion(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split(/[+-]/)[0]
    .split(".")
    .map((part) => Number.parseInt(part.replace(/\D.*$/, ""), 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(left, right) {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  const length = Math.max(a.length, b.length, 3);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) {
      return delta > 0 ? 1 : -1;
    }
  }
  return 0;
}

function getCurrentVersion() {
  return chrome.runtime.getManifest().version;
}

async function updateActionBadge(status) {
  try {
    if (status?.hasUpdate) {
      await chrome.action.setBadgeText({ text: "NEW" });
      await chrome.action.setBadgeBackgroundColor({ color: "#3f746d" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch {
    // Badge updates are best-effort.
  }
}

function normalizeUpdateStatus(status = {}) {
  const currentVersion = getCurrentVersion();
  const latestVersion = status.latestVersion || currentVersion;
  return {
    ok: Boolean(status.ok),
    checking: false,
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl: status.releaseUrl || RELEASES_PAGE_URL,
    releaseName: status.releaseName || "",
    source: status.source || "",
    checkedAt: Number(status.checkedAt) || 0,
    error: status.error || ""
  };
}

async function getStoredUpdateStatus() {
  const result = await readLocalStorage(UPDATE_STATUS_STORAGE_KEY);
  const status = normalizeUpdateStatus(result[UPDATE_STATUS_STORAGE_KEY]);
  await updateActionBadge(status);
  return status;
}

function getVersionFromReleaseObject(release) {
  return String(release?.tag_name || release?.name || "")
    .trim()
    .replace(/^v/i, "");
}

function normalizeReleaseUrl(url) {
  return typeof url === "string" && /^https:\/\/github\.com\/Coran-tech\/cc98-reborn\/releases/i.test(url)
    ? url
    : RELEASES_PAGE_URL;
}

async function fetchJsonRelease(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/vnd.github+json"
    },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`${options.label || "json"} HTTP ${response.status}`);
  }
  const payload = await response.json();
  const release = Array.isArray(payload) ? payload[0] : payload;
  const latestVersion = getVersionFromReleaseObject(release);
  if (!latestVersion) {
    throw new Error(`${options.label || "json"} empty-release`);
  }
  return {
    latestVersion,
    releaseUrl: normalizeReleaseUrl(release?.html_url),
    releaseName: release?.name || release?.tag_name || "",
    source: options.label || "json"
  };
}

async function fetchHtmlLatestRelease(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "text/html"
    },
    cache: "no-store",
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`${options.label || "html"} HTTP ${response.status}`);
  }
  const resolvedUrl = response.url || "";
  const resolvedMatch = resolvedUrl.match(/\/releases\/tag\/v?([^/?#]+)/i);
  if (resolvedMatch?.[1]) {
    return {
      latestVersion: resolvedMatch[1],
      releaseUrl: normalizeReleaseUrl(resolvedUrl),
      releaseName: `v${resolvedMatch[1]}`,
      source: options.label || "html"
    };
  }
  const html = await response.text();
  const match = html.match(/\/Coran-tech\/cc98-reborn\/releases\/tag\/v?([^"'<>?\s]+)/i);
  if (!match?.[1]) {
    throw new Error(`${options.label || "html"} empty-release`);
  }
  return {
    latestVersion: match[1],
    releaseUrl: `https://github.com/Coran-tech/cc98-reborn/releases/tag/v${match[1]}`,
    releaseName: `v${match[1]}`,
    source: options.label || "html"
  };
}

async function fetchLatestReleaseInfo() {
  const attempts = [
    () => fetchJsonRelease(RELEASES_API_URL, { label: "github-latest-api" }),
    () => fetchJsonRelease(RELEASES_LIST_API_URL, { label: "github-list-api" }),
    () => fetchHtmlLatestRelease(RELEASES_LATEST_PAGE_URL, { label: "github-html" }),
    () => fetchJsonRelease(RELEASES_MIRROR_API_URL, { label: "mirror-api" })
  ];
  const errors = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      errors.push(error?.message || "failed");
    }
  }
  throw new Error(errors.join(" / ") || "all-sources-failed");
}

async function checkForUpdates(options = {}) {
  const force = Boolean(options.force);
  if (!force) {
    const stored = await getStoredUpdateStatus();
    if (stored.checkedAt && Date.now() - stored.checkedAt < UPDATE_CHECK_MIN_INTERVAL_MS) {
      return stored;
    }
  }

  const currentVersion = getCurrentVersion();
  let status;
  try {
    const release = await fetchLatestReleaseInfo();
    status = normalizeUpdateStatus({
      ok: true,
      currentVersion,
      latestVersion: release.latestVersion,
      releaseUrl: release.releaseUrl || RELEASES_PAGE_URL,
      releaseName: release.releaseName || "",
      source: release.source || "",
      checkedAt: Date.now()
    });
  } catch (error) {
    const stored = await getStoredUpdateStatus();
    status = normalizeUpdateStatus({
      ...stored,
      ok: false,
      checkedAt: Date.now(),
      error: error?.message || "check-failed"
    });
  }

  await writeLocalStorage({ [UPDATE_STATUS_STORAGE_KEY]: status });
  await updateActionBadge(status);
  return status;
}

async function consumeStartupUpdateNotice() {
  const stored = await readSessionStorage(UPDATE_STARTUP_NOTICE_SESSION_KEY);
  if (stored[UPDATE_STARTUP_NOTICE_SESSION_KEY]) {
    return { show: false, status: await getStoredUpdateStatus() };
  }
  let status = await getStoredUpdateStatus();
  if (!status.checkedAt || Date.now() - status.checkedAt > UPDATE_CHECK_MIN_INTERVAL_MS) {
    status = await checkForUpdates({ force: false });
  }
  if (!status.hasUpdate) {
    return { show: false, status };
  }
  await writeSessionStorage({ [UPDATE_STARTUP_NOTICE_SESSION_KEY]: Date.now() });
  return { show: true, status };
}

function setupUpdateChecker() {
  removeSessionStorage(UPDATE_STARTUP_NOTICE_SESSION_KEY).catch(() => {});
  chrome.alarms.create(UPDATE_CHECK_ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: UPDATE_CHECK_INTERVAL_MINUTES
  });
  checkForUpdates().catch(() => {});
}

function setupOpenIdProfileRefresh() {
  chrome.alarms.create(OPENID_PROFILE_REFRESH_ALARM_NAME, {
    delayInMinutes: 2,
    periodInMinutes: OPENID_PROFILE_REFRESH_INTERVAL_MINUTES
  });
  refreshOpenIdBindingProfile().catch(() => {});
}

chrome.runtime.onInstalled.addListener(setupUpdateChecker);
chrome.runtime.onStartup.addListener(setupUpdateChecker);
chrome.runtime.onInstalled.addListener(setupOpenIdProfileRefresh);
chrome.runtime.onStartup.addListener(setupOpenIdProfileRefresh);

chrome.webNavigation?.onBeforeNavigate?.addListener(handleOpenIdWebVpnNavigation);
chrome.webNavigation?.onCommitted?.addListener(handleOpenIdWebVpnNavigation);
chrome.webNavigation?.onHistoryStateUpdated?.addListener(handleOpenIdWebVpnNavigation);
chrome.tabs.onUpdated.addListener(handleOpenIdWebVpnTabUpdated);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === UPDATE_CHECK_ALARM_NAME) {
    checkForUpdates().catch(() => {});
  } else if (alarm?.name === OPENID_PROFILE_REFRESH_ALARM_NAME) {
    refreshOpenIdBindingProfile().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CC98_REBORN_DOWNLOAD_FILE") {
    return handleDownloadFile(message, sendResponse);
  }

  if (message?.type === "CC98_REBORN_CLEAR_CC98_SITE_DATA") {
    clearCc98SiteData().then(sendResponse);
    return true;
  }

  if (message?.type === "CC98_REBORN_OPENID_GET_STATE") {
    getOpenIdBinding().then(sendResponse);
    return true;
  }

  if (message?.type === "CC98_REBORN_FIND_CURRENT_WEB_ACCOUNT") {
    findCurrentCc98WebAccount().then(sendResponse);
    return true;
  }

  if (message?.type === "CC98_REBORN_EXIT_CURRENT_WEB_ACCOUNT") {
    exitCurrentCc98WebAccount().then(sendResponse);
    return true;
  }

  if (message?.type === "CC98_REBORN_OPENID_LOGIN") {
    loginWithCc98OpenId(message.expectedAccount || null, {
      authTransport: message.authTransport
    })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || "openid-login-failed" }));
    return true;
  }

  if (message?.type === "CC98_REBORN_OPENID_WEBVPN_CALLBACK") {
    handleOpenIdWebVpnCallback(message.url, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message || "webvpn-openid-callback-failed"
      }));
    return true;
  }

  if (message?.type === "CC98_REBORN_OPENID_LOGOUT") {
    logoutCc98OpenId().then(sendResponse);
    return true;
  }

  if (message?.type === "CC98_REBORN_GET_UPDATE_STATUS") {
    getStoredUpdateStatus().then(sendResponse);
    return true;
  }

  if (message?.type === "CC98_REBORN_CHECK_UPDATE") {
    checkForUpdates({ force: Boolean(message.force) }).then(sendResponse);
    return true;
  }

  if (message?.type === "CC98_REBORN_CONSUME_STARTUP_UPDATE_NOTICE") {
    consumeStartupUpdateNotice().then(sendResponse);
    return true;
  }

  if (message?.type === "CC98_REBORN_OPEN_RELEASES") {
    const url = typeof message.url === "string" && /^https:\/\/github\.com\/Coran-tech\/cc98-reborn\/releases/i.test(message.url)
      ? message.url
      : RELEASES_PAGE_URL;
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
