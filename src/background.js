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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CC98_REBORN_DOWNLOAD_FILE") {
    return handleDownloadFile(message, sendResponse);
  }

  return false;
});
