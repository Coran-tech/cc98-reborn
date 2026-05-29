chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CC98_REBORN_DOWNLOAD_FILE") {
    return false;
  }

  let url;
  try {
    url = new URL(message.url);
  } catch {
    sendResponse({ ok: false, error: "invalid-url" });
    return false;
  }

  if (!/\.cc98\.org$/i.test(url.hostname) && url.hostname !== "cc98.org") {
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
});
