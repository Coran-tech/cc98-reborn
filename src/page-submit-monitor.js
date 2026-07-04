(() => {
  if (window.__cc98RebornSubmitMonitorInstalled) {
    return;
  }
  window.__cc98RebornSubmitMonitorInstalled = true;

  const MESSAGE_SOURCE = "cc98-reborn-submit-monitor";

  function isWebVpnHost(hostname = location.hostname) {
    return /(?:^|\.)webvpn\.zju\.edu\.cn$/i.test(String(hostname || ""));
  }

  function isCc98RoutePath(pathname = "") {
    return /^\/(?:boardList|boardlist|newTopics|recommendedTopics|searchBoard|usercenter|topic|board|focus|search|user|message|editor|signin|logOn)(?:\/|$|\?)/i.test(String(pathname || ""));
  }

  function getWebVpnPrefixCacheKey() {
    return `cc98RebornWebVpnPrefix:${location.origin}`;
  }

  function getWebVpnProxyPrefixFromUrl(value) {
    try {
      const url = new URL(value, location.href);
      if (!isWebVpnHost(url.hostname)) {
        return "";
      }
      const match = url.pathname.match(/^(\/https?\/[^/?#]+)(?:\/|$)/i);
      return match ? `${url.origin}${match[1].replace(/\/+$/, "")}` : "";
    } catch {
      return "";
    }
  }

  function cacheWebVpnPrefix(prefix) {
    if (!prefix || !isWebVpnHost()) {
      return;
    }
    try {
      sessionStorage.setItem(getWebVpnPrefixCacheKey(), prefix);
      localStorage.setItem(getWebVpnPrefixCacheKey(), prefix);
    } catch {
      // Ignore storage failures; current/referrer extraction may still work.
    }
  }

  function getCachedWebVpnPrefix() {
    if (!isWebVpnHost()) {
      return "";
    }
    try {
      return sessionStorage.getItem(getWebVpnPrefixCacheKey())
        || localStorage.getItem(getWebVpnPrefixCacheKey())
        || "";
    } catch {
      return "";
    }
  }

  function getCurrentWebVpnPrefix() {
    if (!isWebVpnHost()) {
      return "";
    }
    const current = getWebVpnProxyPrefixFromUrl(location.href);
    if (current) {
      cacheWebVpnPrefix(current);
      return current;
    }
    const referrer = getWebVpnProxyPrefixFromUrl(document.referrer || "");
    if (referrer) {
      cacheWebVpnPrefix(referrer);
      return referrer;
    }
    return getCachedWebVpnPrefix();
  }

  function repairWebVpnNakedCc98Url(value) {
    if (!value || !isWebVpnHost()) {
      return value;
    }
    try {
      const url = new URL(value, location.href);
      if (!isWebVpnHost(url.hostname) || getWebVpnProxyPrefixFromUrl(url.href) || !isCc98RoutePath(url.pathname)) {
        return url.href;
      }
      const prefix = getCurrentWebVpnPrefix();
      return prefix ? `${prefix}${url.pathname}${url.search}${url.hash}` : url.href;
    } catch {
      return value;
    }
  }

  function enforceCurrentWebVpnNakedRoute() {
    if (!isWebVpnHost()) {
      return false;
    }
    try {
      const url = new URL(location.href);
      if (!isCc98RoutePath(url.pathname) || getWebVpnProxyPrefixFromUrl(url.href)) {
        getCurrentWebVpnPrefix();
        return false;
      }
      const prefix = getCurrentWebVpnPrefix();
      if (!prefix) {
        return false;
      }
      const target = `${prefix}${url.pathname}${url.search}${url.hash}`;
      if (target === url.href) {
        return false;
      }
      location.replace(target);
      return true;
    } catch {
      return false;
    }
  }

  function patchWebVpnNavigation() {
    if (!isWebVpnHost()) {
      return;
    }
    getCurrentWebVpnPrefix();
    ["pushState", "replaceState"].forEach((method) => {
      const nativeMethod = history[method];
      if (typeof nativeMethod !== "function" || nativeMethod.__cc98RebornWebVpnPatched) {
        return;
      }
      const patched = function patchedWebVpnHistoryMethod(...args) {
        if (args.length >= 3 && args[2] !== undefined && args[2] !== null) {
          args[2] = repairWebVpnNakedCc98Url(String(args[2]));
        }
        return nativeMethod.apply(this, args);
      };
      patched.__cc98RebornWebVpnPatched = true;
      history[method] = patched;
    });
    try {
      const nativeAssign = Location.prototype.assign;
      if (typeof nativeAssign === "function" && !nativeAssign.__cc98RebornWebVpnPatched) {
        const patchedAssign = function patchedWebVpnAssign(url) {
          return nativeAssign.call(this, repairWebVpnNakedCc98Url(String(url || "")));
        };
        patchedAssign.__cc98RebornWebVpnPatched = true;
        Location.prototype.assign = patchedAssign;
      }
    } catch {
      // Some browsers expose Location methods as non-writable.
    }
    try {
      const nativeReplace = Location.prototype.replace;
      if (typeof nativeReplace === "function" && !nativeReplace.__cc98RebornWebVpnPatched) {
        const patchedReplace = function patchedWebVpnReplace(url) {
          return nativeReplace.call(this, repairWebVpnNakedCc98Url(String(url || "")));
        };
        patchedReplace.__cc98RebornWebVpnPatched = true;
        Location.prototype.replace = patchedReplace;
      }
    } catch {
      // Some browsers expose Location methods as non-writable.
    }
    document.addEventListener("click", (event) => {
      const link = event.target?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }
      const rawHref = link.getAttribute("href") || link.href || "";
      const fixedHref = repairWebVpnNakedCc98Url(rawHref);
      let originalHref = rawHref;
      try {
        originalHref = new URL(rawHref, location.href).href;
      } catch {
        originalHref = rawHref;
      }
      if (!fixedHref || fixedHref === originalHref) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      location.assign(fixedHref);
    }, true);
    [0, 80, 180, 360, 700, 1200, 2000].forEach((delay) => {
      setTimeout(enforceCurrentWebVpnNakedRoute, delay);
    });
  }

  patchWebVpnNavigation();

  function classifyRequest(url, method) {
    let parsed;
    try {
      parsed = new URL(url, location.href);
    } catch {
      return "";
    }
    const normalizedMethod = String(method || "GET").toUpperCase();
    const pathname = parsed.pathname.replace(/^\/api(?:\/v\d+)?/i, "");
    if (normalizedMethod === "POST" && /^\/topic\/\d+\/post\/?$/i.test(pathname)) {
      return "reply";
    }
    if (normalizedMethod === "POST" && /^\/board\/\d+\/topic\/?$/i.test(pathname)) {
      return "post";
    }
    if (/^(?:PUT|PATCH)$/i.test(normalizedMethod) && /^\/post\/\d+\/?$/i.test(pathname)) {
      return "edit";
    }
    return "";
  }

  function reportResult(payload) {
    window.postMessage({
      source: MESSAGE_SOURCE,
      type: "editor-submit-result",
      payload
    }, location.origin);
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = async function monitoredFetch(input, init) {
      const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
      const requestMethod = init?.method || input?.method || "GET";
      const requestKind = classifyRequest(requestUrl, requestMethod);
      try {
        const response = await nativeFetch.apply(this, arguments);
        if (requestKind) {
          response.clone().text()
            .catch(() => "")
            .then((body) => {
              reportResult({
                kind: requestKind,
                method: String(requestMethod).toUpperCase(),
                url: response.url || String(requestUrl || ""),
                responseUrl: response.url || "",
                location: response.headers.get("location") || "",
                status: response.status,
                ok: response.ok,
                body: String(body || "").slice(0, 2048)
              });
            });
        }
        return response;
      } catch (error) {
        if (requestKind) {
          reportResult({
            kind: requestKind,
            method: String(requestMethod).toUpperCase(),
            url: String(requestUrl || ""),
            status: 0,
            ok: false,
            networkError: true,
            body: String(error?.message || "")
          });
        }
        throw error;
      }
    };
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function monitoredOpen(method, url) {
    this.__cc98RebornSubmitRequest = {
      kind: classifyRequest(url, method),
      method: String(method || "GET").toUpperCase(),
      url: String(url || "")
    };
    return nativeOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function monitoredSend() {
    const request = this.__cc98RebornSubmitRequest;
    if (request?.kind) {
      this.addEventListener("loadend", () => {
        let body = "";
        try {
          body = typeof this.responseText === "string" ? this.responseText : "";
        } catch {
          body = "";
        }
        reportResult({
          ...request,
          url: this.responseURL || request.url,
          responseUrl: this.responseURL || "",
          location: this.getResponseHeader("location") || "",
          status: this.status,
          ok: this.status >= 200 && this.status < 300,
          networkError: this.status === 0,
          body: String(body || "").slice(0, 2048)
        });
      }, { once: true });
    }
    return nativeSend.apply(this, arguments);
  };
})();
