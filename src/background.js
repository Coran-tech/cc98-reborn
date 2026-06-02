const CC98_COOKIE_DOMAINS = [
  "cc98.org",
  "www.cc98.org",
  "api.cc98.org",
  "account.cc98.org",
  "file.cc98.org",
  "www-cc98-org-s.webvpn.zju.edu.cn"
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

function getCookieRemovalUrl(cookie) {
  const domain = String(cookie.domain || "").replace(/^\./, "");
  const path = cookie.path || "/";
  const protocol = cookie.secure ? "https" : "http";
  return `${protocol}://${domain}${path.startsWith("/") ? path : `/${path}`}`;
}

function getCookieDedupKey(cookie) {
  return [
    cookie.storeId,
    cookie.name,
    cookie.domain,
    cookie.path,
    JSON.stringify(cookie.partitionKey || null)
  ].join("\n");
}

function getAllCc98Cookies() {
  return Promise.all(CC98_COOKIE_DOMAINS.map((domain) => (
    new Promise((resolve, reject) => {
      chrome.cookies.getAll({ domain }, (cookies) => {
        const error = chrome.runtime.lastError?.message;
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve(cookies || []);
      });
    })
  ))).then((groups) => {
    const seen = new Set();
    return groups.flat().filter((cookie) => {
      const key = getCookieDedupKey(cookie);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  });
}

function removeCookie(cookie) {
  const details = {
    url: getCookieRemovalUrl(cookie),
    name: cookie.name,
    storeId: cookie.storeId
  };
  if (cookie.partitionKey) {
    details.partitionKey = cookie.partitionKey;
  }
  return new Promise((resolve) => {
    chrome.cookies.remove(details, (removed) => {
      resolve(Boolean(removed) && !chrome.runtime.lastError);
    });
  });
}

async function handleClearCc98Cookies(sendResponse) {
  try {
    const cookies = await getAllCc98Cookies();
    const results = await Promise.allSettled(cookies.map(removeCookie));
    const removed = results.filter((result) => result.status === "fulfilled" && result.value).length;
    const failed = results.length - removed;
    sendResponse({
      ok: true,
      total: cookies.length,
      removed,
      failed
    });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error?.message || String(error)
    });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CC98_REBORN_DOWNLOAD_FILE") {
    return handleDownloadFile(message, sendResponse);
  }

  if (message?.type === "CC98_REBORN_CLEAR_COOKIES") {
    handleClearCc98Cookies(sendResponse);
    return true;
  }

  return false;
});
