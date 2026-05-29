// Deferred: this bridge is not referenced by manifest.json while the official
// CC98 OAuth flow is pending. Keep it as implementation notes only.
(() => {
  if (window.__cc98RebornWatermarkBridgeInstalled) {
    return;
  }
  window.__cc98RebornWatermarkBridgeInstalled = true;

  const isMeUrl = (value) => {
    try {
      const raw = typeof value === "string" ? value : (value && value.url) || "";
      const url = new URL(raw, location.href);
      return url.hostname === "api.cc98.org" && url.pathname.replace(/\/+$/, "") === "/me";
    } catch {
      return false;
    }
  };

  const emit = (payload) => {
    const code = String(payload && payload.watermarkId || "").trim().slice(0, 8);
    if (!/^[a-z0-9]{8}$/i.test(code)) {
      return;
    }
    window.postMessage({ source: "CC98_REBORN_WATERMARK_BRIDGE", code }, location.origin);
  };

  const inspectResponse = (response) => {
    try {
      if (!response || !response.ok || !isMeUrl(response.url)) {
        return;
      }
      response.clone().json().then(emit).catch(() => {});
    } catch {
      // Keep the native request untouched.
    }
  };

  if (typeof window.fetch === "function") {
    const nativeFetch = window.fetch;
    window.fetch = function cc98RebornWatermarkFetch(input) {
      const result = nativeFetch.apply(this, arguments);
      try {
        Promise.resolve(result).then((response) => {
          if (isMeUrl(input) || isMeUrl(response && response.url)) {
            inspectResponse(response);
          }
        }).catch(() => {});
      } catch {
        // Keep the native request untouched.
      }
      return result;
    };
  }

  if (typeof window.XMLHttpRequest === "function") {
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function cc98RebornWatermarkOpen(_method, url) {
      try {
        this.__cc98RebornWatermarkUrl = url;
        this.addEventListener("loadend", () => {
          try {
            const targetUrl = this.responseURL || this.__cc98RebornWatermarkUrl;
            if (!isMeUrl(targetUrl) || this.status < 200 || this.status >= 300 || typeof this.responseText !== "string") {
              return;
            }
            emit(JSON.parse(this.responseText));
          } catch {
            // Keep the native request untouched.
          }
        }, { once: true });
      } catch {
        // Keep the native request untouched.
      }
      return nativeOpen.apply(this, arguments);
    };
  }
})();
