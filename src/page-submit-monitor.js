(() => {
  if (window.__cc98RebornSubmitMonitorInstalled) {
    return;
  }
  window.__cc98RebornSubmitMonitorInstalled = true;

  const MESSAGE_SOURCE = "cc98-reborn-submit-monitor";

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
