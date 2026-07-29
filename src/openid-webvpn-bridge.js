(() => {
  const OPENID_WEBVPN_HOST_TOKEN = "77726476706e69737468656265737421ffe744922e3426537d51d1e2974724";
  const MAX_SCAN_DURATION_MS = 30 * 1000;
  const SCAN_INTERVAL_MS = 120;

  function decodeRepeatedly(value) {
    let decoded = String(value || "");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) {
          break;
        }
        decoded = next;
      } catch {
        break;
      }
    }
    return decoded;
  }

  function hasOAuthResult(value) {
    const decoded = decodeRepeatedly(value);
    return /(?:^|[?&#])state=[^&#\s]+/i.test(decoded)
      && /(?:^|[?&#])(?:code|error)=[^&#\s]+/i.test(decoded);
  }

  function cleanCandidate(value) {
    return String(value || "").replace(/[?;:,)\]}\u3002\u3001\uff0c\uff01\uff1b\uff1a\uff09]+$/g, "");
  }

  function extractCallbackCandidate() {
    if (hasOAuthResult(location.href)) {
      return location.href;
    }
    const text = String(
      document.body?.innerText
      || document.documentElement?.textContent
      || ""
    ).slice(-30000);
    const direct = text.match(/https:\/\/[a-z0-9-]+\.chromiumapp\.org\/\?[^\s<>"']+/i);
    if (direct && hasOAuthResult(direct[0])) {
      return cleanCandidate(direct[0]);
    }
    const proxied = text.match(/\/https\/[a-f0-9]+\/\?[^\s<>"']+/i);
    if (proxied && hasOAuthResult(proxied[0])) {
      return new URL(cleanCandidate(proxied[0]), location.origin).href;
    }
    return "";
  }

  const isOpenIdProxyPage = location.pathname.toLowerCase().includes(OPENID_WEBVPN_HOST_TOKEN);
  if (!isOpenIdProxyPage && !hasOAuthResult(location.href)) {
    return;
  }

  let stopped = false;
  let scanTimer = 0;
  let observer = null;
  let messageInFlight = false;
  const deadline = Date.now() + MAX_SCAN_DURATION_MS;

  function stop() {
    stopped = true;
    clearTimeout(scanTimer);
    observer?.disconnect();
    observer = null;
  }

  function scheduleScan() {
    if (stopped || Date.now() >= deadline || scanTimer) {
      if (Date.now() >= deadline) {
        stop();
      }
      return;
    }
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      scan();
    }, SCAN_INTERVAL_MS);
  }

  function scan() {
    if (stopped || messageInFlight) {
      return;
    }
    const candidate = extractCallbackCandidate();
    if (!candidate) {
      scheduleScan();
      return;
    }
    messageInFlight = true;
    chrome.runtime.sendMessage({
      type: "CC98_REBORN_OPENID_WEBVPN_CALLBACK",
      url: candidate
    }, (result) => {
      messageInFlight = false;
      if (chrome.runtime.lastError) {
        scheduleScan();
        return;
      }
      if (!result?.ok) {
        stop();
        return;
      }
      stop();
    });
  }

  function observeDocument() {
    if (observer || !document.documentElement) {
      return;
    }
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  observeDocument();
  document.addEventListener("DOMContentLoaded", () => {
    observeDocument();
    scan();
  }, { once: true });
  scan();
})();
