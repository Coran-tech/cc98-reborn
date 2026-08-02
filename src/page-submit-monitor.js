(() => {
  function decodeLocationValue(value) {
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

  function isOpenIdAuthorizationRoute() {
    if (location.hostname === "openid.cc98.org") {
      return true;
    }
    if (!isWebVpnHost()) {
      return false;
    }
    const route = decodeLocationValue(`${location.pathname}${location.search}`);
    return /\/connect\/authorize(?:[/?#]|$)|\/(?:Account|PassKey)\/LogOn(?:[/?#]|$)/i.test(route);
  }

  function isPotentialWebVpnOpenIdCallback() {
    if (!isWebVpnHost()) {
      return false;
    }
    const result = decodeLocationValue(`${location.pathname}${location.search}${location.hash}`);
    return /(?:^|[?&#])state=[^&#]+/i.test(result)
      && /(?:^|[?&#])(?:code|error)=[^&#]+/i.test(result);
  }

  function getConfirmedWebVpnPrefixCacheKey() {
    return `cc98RebornConfirmedWebVpnPrefix:${location.origin}`;
  }

  function normalizeWebVpnProxyPrefix(prefix) {
    return String(prefix || "").replace(/\/+$/, "").toLowerCase();
  }

  function isConfirmedExternalWebVpnProxyPage() {
    if (!isWebVpnHost()) {
      return false;
    }
    const currentPrefix = getWebVpnProxyPrefixFromUrl(location.href);
    if (!currentPrefix) {
      return false;
    }
    try {
      const confirmedPrefix = sessionStorage.getItem(getConfirmedWebVpnPrefixCacheKey())
        || localStorage.getItem(getConfirmedWebVpnPrefixCacheKey())
        || "";
      return Boolean(
        confirmedPrefix
        && normalizeWebVpnProxyPrefix(currentPrefix) !== normalizeWebVpnProxyPrefix(confirmedPrefix)
      );
    } catch {
      return false;
    }
  }

  if (
    isOpenIdAuthorizationRoute()
    || isPotentialWebVpnOpenIdCallback()
    || isConfirmedExternalWebVpnProxyPage()
  ) {
    return;
  }

  if (window.__cc98RebornSubmitMonitorInstalled) {
    return;
  }
  window.__cc98RebornSubmitMonitorInstalled = true;

  const MESSAGE_SOURCE = "cc98-reborn-submit-monitor";
  const DOM_BRIDGE_EVENT = "cc98-reborn-submit-monitor-event";
  let monitorEventSequence = 0;

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
    const pathname = decodeLocationValue(parsed.pathname)
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    if (normalizedMethod === "POST" && /\/topic\/\d+\/post$/i.test(pathname)) {
      return "reply";
    }
    if (normalizedMethod === "POST" && /\/board\/\d+\/topic$/i.test(pathname)) {
      return "post";
    }
    if (/^(?:PUT|PATCH)$/i.test(normalizedMethod) && /\/post\/\d+$/i.test(pathname)) {
      return "edit";
    }
    return "";
  }

  function classifyTopicContentRequest(url, method) {
    if (String(method || "GET").toUpperCase() !== "GET") {
      return null;
    }
    const value = decodeLocationValue(String(url || ""));
    const match = value.match(/\/Topic\/(\d+)\/(hot-post|post)(?=[/?#]|$)/i);
    if (!match) {
      return null;
    }
    const fromMatch = value.match(/[?&]from=(\d+)/i);
    const sizeMatch = value.match(/[?&]size=(\d+)/i);
    return {
      topicId: match[1],
      kind: match[2].toLowerCase() === "hot-post" ? "hot" : "page",
      from: Math.max(0, Number(fromMatch?.[1]) || 0),
      size: Math.max(0, Number(sizeMatch?.[1]) || 0),
      url: String(url || "")
    };
  }

  function emitMonitorMessage(type, payload) {
    const message = {
      source: MESSAGE_SOURCE,
      type,
      payload,
      monitorEventId: `${Date.now()}:${++monitorEventSequence}:${type}`
    };
    try {
      document.dispatchEvent(new CustomEvent(DOM_BRIDGE_EVENT, {
        detail: JSON.stringify(message)
      }));
    } catch {
      // The postMessage bridge below remains available.
    }
    window.postMessage(message, location.origin);
  }

  function reportResult(payload) {
    emitMonitorMessage("editor-submit-result", payload);
  }

  function reportSubmitStart(payload) {
    emitMonitorMessage("editor-submit-start", payload);
  }

  function reportTopicContentSnapshot(request, data, responseUrl = "") {
    if (!request || !Array.isArray(data)) {
      return;
    }
    const items = data.slice(0, 60).map((item, index) => ({
      id: String(item?.id ?? item?.postId ?? ""),
      floor: Math.max(0, Number(item?.floor ?? item?.index ?? (request.kind === "page" ? request.from + index + 1 : 0)) || 0),
      content: typeof item?.content === "string" ? item.content : "",
      contentType: Number(item?.contentType) || 0,
      userId: String(item?.userId ?? ""),
      userName: String(item?.userName ?? ""),
      isAnonymous: Boolean(item?.isAnonymous),
      signatureCode: typeof item?.signatureCode === "string" ? item.signatureCode : ""
    }));
    window.postMessage({
      source: MESSAGE_SOURCE,
      type: "topic-content-snapshot",
      payload: {
        ...request,
        responseUrl: String(responseUrl || ""),
        items
      }
    }, location.origin);
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = async function monitoredFetch(input, init) {
      const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
      const requestMethod = init?.method || input?.method || "GET";
      const requestKind = classifyRequest(requestUrl, requestMethod);
      const topicContentRequest = classifyTopicContentRequest(requestUrl, requestMethod);
      if (requestKind) {
        reportSubmitStart({
          kind: requestKind,
          method: String(requestMethod).toUpperCase(),
          url: String(requestUrl || ""),
          startedAt: Date.now()
        });
      }
      try {
        const response = await nativeFetch.apply(this, arguments);
        if (topicContentRequest && response.ok) {
          response.clone().json()
            .then((data) => reportTopicContentSnapshot(
              topicContentRequest,
              data,
              response.url || String(requestUrl || "")
            ))
            .catch(() => {});
        }
        if (requestKind) {
          const result = {
            kind: requestKind,
            method: String(requestMethod).toUpperCase(),
            url: response.url || String(requestUrl || ""),
            responseUrl: response.url || "",
            location: response.headers.get("location") || "",
            status: response.status,
            ok: response.ok
          };
          if (requestKind === "post") {
            response.clone().text()
              .catch(() => "")
              .then((body) => {
                reportResult({
                  ...result,
                  body: String(body || "").slice(0, 2048)
                });
              });
          } else {
            reportResult({
              ...result,
              body: "",
              headersOnly: true
            });
          }
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
    this.__cc98RebornTopicContentRequest = classifyTopicContentRequest(url, method);
    return nativeOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function monitoredSend() {
    const request = this.__cc98RebornSubmitRequest;
    const topicContentRequest = this.__cc98RebornTopicContentRequest;
    if (topicContentRequest) {
      this.addEventListener("loadend", () => {
        if (this.status < 200 || this.status >= 300) {
          return;
        }
        try {
          const data = this.responseType === "json"
            ? this.response
            : JSON.parse(this.responseText || "[]");
          reportTopicContentSnapshot(topicContentRequest, data, this.responseURL || topicContentRequest.url);
        } catch {
          // Ignore non-JSON and incomplete responses.
        }
      }, { once: true });
    }
    if (request?.kind) {
      reportSubmitStart({
        ...request,
        startedAt: Date.now()
      });
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

  let renderedTopicSnapshotTimer = null;
  let renderedTopicSnapshotSignature = "";

  function getCurrentTopicRouteInfo() {
    const route = decodeLocationValue(`${location.pathname}${location.search}`);
    const match = route.match(/\/topic\/(\d+)(?:\/(\d+))?/i);
    if (!match) {
      return null;
    }
    const page = Math.max(1, Number(match[2]) || 1);
    return {
      topicId: match[1],
      from: (page - 1) * 10
    };
  }

  function getReactFiber(node) {
    if (!(node instanceof Element)) {
      return null;
    }
    const key = Object.keys(node).find((name) => (
      name.startsWith("__reactFiber$")
      || name.startsWith("__reactInternalInstance$")
    ));
    return key ? node[key] : null;
  }

  function collectReactPostProps(reply) {
    const candidates = [
      reply,
      ...reply.querySelectorAll(".reply-content, .substance, .signature, article")
    ];
    let postInfo = null;
    let userInfo = null;
    for (const candidate of candidates) {
      let fiber = getReactFiber(candidate);
      for (let depth = 0; fiber && depth < 24; depth += 1, fiber = fiber.return) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (!props || typeof props !== "object") {
          continue;
        }
        const possiblePost = props.postInfo && typeof props.postInfo === "object"
          ? props.postInfo
          : props;
        if (!postInfo
          && typeof possiblePost.content === "string"
          && (possiblePost.postId || possiblePost.id || possiblePost.floor)) {
          postInfo = possiblePost;
        }
        if (!userInfo && props.userInfo && typeof props.userInfo === "object") {
          userInfo = props.userInfo;
        }
        if (postInfo && userInfo) {
          return { postInfo, userInfo };
        }
      }
    }
    return { postInfo, userInfo };
  }

  function collectRenderedTopicSnapshot() {
    renderedTopicSnapshotTimer = null;
    const route = getCurrentTopicRouteInfo();
    if (!route) {
      renderedTopicSnapshotSignature = "";
      return;
    }
    const replies = [...document.querySelectorAll(".reply")]
      .filter((reply) => !reply.closest("#cc98-comfort-app"))
      .slice(0, 30);
    const items = replies.map((reply, index) => {
      const { postInfo, userInfo } = collectReactPostProps(reply);
      if (!postInfo || typeof postInfo.content !== "string") {
        return null;
      }
      return {
        id: String(postInfo.postId ?? postInfo.id ?? ""),
        floor: Math.max(0, Number(postInfo.floor) || route.from + index + 1),
        content: postInfo.content,
        contentType: Number(postInfo.contentType) || 0,
        userId: String(postInfo.userId ?? userInfo?.id ?? ""),
        userName: String(postInfo.userName ?? userInfo?.name ?? ""),
        isAnonymous: Boolean(postInfo.isAnonymous),
        signatureCode: typeof userInfo?.signatureCode === "string" ? userInfo.signatureCode : ""
      };
    }).filter(Boolean);
    if (!items.length) {
      return;
    }
    const signature = `${route.topicId}:${route.from}:${items
      .map((item) => `${item.id}:${item.floor}:${item.content.length}:${item.signatureCode.length}`)
      .join("|")}`;
    if (signature === renderedTopicSnapshotSignature) {
      return;
    }
    renderedTopicSnapshotSignature = signature;
    reportTopicContentSnapshot({
      topicId: route.topicId,
      kind: "page",
      from: route.from,
      size: items.length,
      url: location.href
    }, items, location.href);
  }

  function scheduleRenderedTopicSnapshot() {
    if (!getCurrentTopicRouteInfo()) {
      return;
    }
    clearTimeout(renderedTopicSnapshotTimer);
    renderedTopicSnapshotTimer = setTimeout(collectRenderedTopicSnapshot, 120);
  }

  const renderedTopicObserver = new MutationObserver(scheduleRenderedTopicSnapshot);
  renderedTopicObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  [0, 180, 520, 1200, 2400].forEach((delay) => {
    setTimeout(scheduleRenderedTopicSnapshot, delay);
  });
})();
