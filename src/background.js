const UPDATE_STATUS_STORAGE_KEY = "cc98RebornUpdateStatus:v1";
const UPDATE_STARTUP_NOTICE_SESSION_KEY = "cc98RebornUpdateStartupNoticeShown:v1";
const UPDATE_CHECK_ALARM_NAME = "cc98-reborn-update-check";
const UPDATE_CHECK_INTERVAL_MINUTES = 6 * 60;
const UPDATE_CHECK_MIN_INTERVAL_MS = 30 * 60 * 1000;
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
  "http://cc98.org",
  "http://www.cc98.org",
  "http://api.cc98.org",
  "http://openid.cc98.org",
  "http://account.cc98.org",
  "http://file.cc98.org"
];
const CC98_TAB_URL_PATTERNS = [
  "*://cc98.org/*",
  "*://*.cc98.org/*",
  "*://www-cc98-org-s.webvpn.zju.edu.cn/*"
];

function isCc98Url(url) {
  return /\.cc98\.org$/i.test(url.hostname)
    || url.hostname === "cc98.org"
    || url.hostname === "www-cc98-org-s.webvpn.zju.edu.cn";
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

chrome.runtime.onInstalled.addListener(setupUpdateChecker);
chrome.runtime.onStartup.addListener(setupUpdateChecker);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === UPDATE_CHECK_ALARM_NAME) {
    checkForUpdates().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CC98_REBORN_DOWNLOAD_FILE") {
    return handleDownloadFile(message, sendResponse);
  }

  if (message?.type === "CC98_REBORN_CLEAR_CC98_SITE_DATA") {
    clearCc98SiteData().then(sendResponse);
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
