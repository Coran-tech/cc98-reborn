(function () {
  "use strict";
  const prefix = "cc98-reborn-topic-drawer:v1:";
  const channel = "CC98_REBORN_TOPIC_DRAWER";
  const marker = /^cc98-reborn-topic-drawer:v1:[a-z0-9-]{20,80}$/i;
  const topicId = (url) => url.pathname.match(/\/topic\/(\d+)(?:\/|$)/i)?.[1] || "";
  const download = (link) => link.hasAttribute("download")
    || link.closest(".download-file, .cc98-rebuild-download-button, [data-cc98-rebuild-no-new-tab], .cc98-image-viewer");
  const child = window.top !== window;
  if (child) {
    // Hidden conversation/search probes must never start another full runtime.
    if (window.parent !== window.top || !marker.test(window.name)) return;
    const token = window.name.slice(prefix.length);
    document.documentElement.classList.add("cc98-topic-drawer-child");
    const post = (type, extra = {}) => parent.postMessage({ channel, token, type, ...extra }, location.origin);
    let originTopic = topicId(new URL(location.href));
    addEventListener("message", (event) => {
      if (event.source !== parent || event.origin !== location.origin || event.data?.channel !== channel
        || event.data.token !== token || event.data.type !== "context" || !/^\d+$/.test(event.data.topicId)) return;
      originTopic = event.data.topicId;
    });
    post("loading");
    let observer, timer, lastState = "", disposed = false;
    function report() {
      if (disposed) return;
      const app = document.querySelector("#cc98-comfort-app");
      if (!app?.querySelector(".cc98-rebuild-post, .cc98-rebuild-native-editor, .cc98-rebuild-hero, .cc98-rebuild-route-status")) return;
      const title = app.querySelector("h1")?.textContent?.trim() || document.title;
      const state = `${location.href}\n${title}`;
      if (state === lastState) return;
      lastState = state;
      post("ready", { href: location.href, title });
    }
    function queueReport() {
      if (!timer) timer = setTimeout(() => { timer = 0; report(); }, 100);
    }
    function startObserver() {
      if (disposed || observer) return;
      observer = new MutationObserver(queueReport);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      report();
    }
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.("a[href]");
      if (!link || download(link)) return;
      if (typeof getLinkedImageAction === "function" && getLinkedImageAction(getImageViewerEventImage(event))) return;
      const raw = link.getAttribute("href")?.trim();
      if (!raw || raw === "#") return;
      let url;
      try { url = new URL(link.href, location.href); } catch { return; }
      if (!/^https?:$/.test(url.protocol)) return;
      if (link.closest(".cc98-image-link-menu") && typeof closeImageLinkMenu === "function") closeImageLinkMenu();
      const currentTopic = topicId(new URL(location.href)) || originTopic;
      // Quote links sometimes contain a legacy page-local hash. Reuse the
      // reader's canonical floor URL rather than losing that correction here.
      const quote = typeof getOriginalPostQuoteTargetFromLink === "function" ? getOriginalPostQuoteTargetFromLink(link) : null;
      if (quote) url = new URL(quote.href, location.href);
      const sameTopic = url.origin === location.origin && currentTopic && topicId(url) === currentTopic;
      const editAction = url.origin === location.origin && /\/editor\/edit\/\d+(?:\/|$)/i.test(url.pathname)
        && link.closest(".comment1, .cc98-rebuild-post-actions") && !link.closest(".cc98-rebuild-post-body, .cc98-rebuild-signature");
      const localHash = url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash;
      if (sameTopic || editAction || localHash) {
        // The conversation popup owns its floor links and keeps navigation in
        // that popup; pagination/ordinary quote floors stay in this document.
        if (sameTopic && link.closest(".cc98-rebuild-conversation-layer") && link.dataset.cc98ConversationFloor) return;
        event.preventDefault(); event.stopImmediatePropagation();
        const floor = quote?.floor || (typeof getSameTopicFloorFromLink === "function" ? getSameTopicFloorFromLink(link) : null);
        if (sameTopic && floor && typeof scrollToRebuiltFloor === "function" && scrollToRebuiltFloor(floor, { updateHash: true })) return;
        location.assign(url.href);
        return;
      }
      // Non-thread navigation belongs to the browser, not this restricted
      // frame. The parent validates the actual user click before leaving.
      if (!event.isTrusted) return;
      event.preventDefault(); event.stopImmediatePropagation();
      post("navigate", { href: url.href, fromHref: location.href });
    }, true);
    document.addEventListener("keydown", (event) => {
      // Let inner dialogs/editors handle Escape before closing the outer pane.
      if (event.key !== "Escape" || event.defaultPrevented || event.target.closest?.("input, textarea, [contenteditable]")) return;
      const floating = [...document.querySelectorAll(".cc98-rebuild-conversation-layer, .cc98-topic-search-layer, .ant-modal-wrap, #cc98-comfort-image-viewer, #cc98-image-link-menu")];
      if (floating.some(element => !element.hidden && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden")) return;
      post("close");
    });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    else startObserver();
    addEventListener("pagehide", () => { disposed = true; observer?.disconnect(); clearTimeout(timer); });
    addEventListener("pageshow", () => {
      if (disposed) { disposed = false; observer = null; lastState = ""; startObserver(); }
      else report();
    });
    // The local simulator embeds the runtime itself; production uses a targeted
    // injection rather than enabling every extension script in every iframe.
    if (!globalThis.__CC98_LOCAL_BOOTSTRAP__) {
      chrome.runtime.sendMessage({ type: "CC98_REBORN_INIT_TOPIC_DRAWER", token }, (result) => {
        const error = chrome.runtime.lastError;
        if (error || !result?.ok) post("error");
        else queueReport();
      });
    }
    return;
  }

  let enabled = false, openLinksInNewTab = false, view = null, preferredWidth = 0;
  function node(tag, className, text) {
    const value = document.createElement(tag);
    value.className = className;
    if (text !== undefined) value.textContent = text;
    return value;
  }
  function plain(event) { return !event.button && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey; }
  function changeParentLayout(change) {
    const virtual = globalThis.CC98RebornNewTopicsVirtual?.prepareResize?.();
    const state = !virtual && typeof captureSeamlessRebuildScrollState === "function" ? captureSeamlessRebuildScrollState() : null;
    change();
    if (state) restoreSeamlessRebuildScrollState(state, undefined, true);
  }
  function syncTools(split) {
    document.querySelectorAll("#cc98-comfort-app details.cc98-rebuild-topics-side-column").forEach(tools => {
      if (split && !tools.dataset.cc98DrawerCompact) { tools.open = false; tools.dataset.cc98DrawerCompact = "true"; }
      else if (!split) { tools.open = true; delete tools.dataset.cc98DrawerCompact; }
    });
  }
  function setWidth(width) {
    if (!view) return;
    const split = innerWidth > 700;
    const max = Math.max(280, innerWidth - (split ? 320 : 0));
    const min = Math.min(520, max);
    view.width = Math.round(Math.max(min, Math.min(max, width)));
    view.layer.style.setProperty("--cc98-drawer-width", `${view.width}px`);
    changeParentLayout(() => {
      const root = document.documentElement;
      root.style.setProperty("--cc98-drawer-width", `${view.width}px`);
      root.classList.add("cc98-topic-drawer-open");
      root.classList.toggle("cc98-topic-drawer-split", split);
      syncTools(split);
    });
    view.resizer.setAttribute("aria-valuemin", String(min));
    view.resizer.setAttribute("aria-valuemax", String(max));
    view.resizer.setAttribute("aria-valuenow", String(view.width));
  }
  function endDrag() {
    if (!view?.drag) return;
    const id = view.drag;
    view.drag = 0;
    preferredWidth = view.width;
    view.layer.classList.remove("cc98-topic-drawer-dragging");
    if (view.resizer.hasPointerCapture(id)) view.resizer.releasePointerCapture(id);
  }
  function close({ restoreFocus = true, keepLayout = false } = {}) {
    if (!view) return;
    endDrag();
    const old = view;
    view = null;
    clearTimeout(old.timeout);
    cancelAnimationFrame(old.resizeFrame);
    old.controller.abort();
    // Removing the browsing context stops its React app, media, observers and
    // network readers. No hidden iframe or detached page is retained.
    old.frame.remove();
    old.layer.remove();
    if (typeof requestSecurityWatermarkRedraw === "function") requestSecurityWatermarkRedraw();
    if (!keepLayout) changeParentLayout(() => {
      const root = document.documentElement;
      root.classList.remove("cc98-topic-drawer-open", "cc98-topic-drawer-split");
      root.style.removeProperty("--cc98-drawer-width");
      syncTools(false);
    });
    const opener = old.opener.deref();
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
  }
  function showError() {
    if (!view) return;
    view.status.textContent = "侧窗加载未完成，可重新加载或在新标签页打开。";
    view.retry.hidden = false;
    view.layer.classList.add("cc98-topic-drawer-error");
  }
  function open(link, url) {
    const app = document.getElementById("cc98-comfort-app");
    if (!app) return;
    const previousWidth = view?.width;
    close({ restoreFocus: false, keepLayout: true });
    const token = crypto.randomUUID();
    const controller = new AbortController(), options = { signal: controller.signal };
    const layer = node("div", "cc98-topic-drawer-layer");
    const panel = node("section", "cc98-topic-drawer-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "帖子侧窗");
    const header = node("header", "cc98-topic-drawer-header");
    const openerTitle = link.textContent.trim();
    const heading = node("span", "cc98-topic-drawer-title", openerTitle);
    const newTab = node("a", "cc98-topic-drawer-new-tab", "新标签页打开");
    newTab.href = url.href; newTab.target = "_blank"; newTab.rel = "noopener";
    const dismiss = node("button", "cc98-topic-drawer-close", "×");
    dismiss.type = "button"; dismiss.setAttribute("aria-label", "关闭帖子侧窗");
    header.append(heading, newTab, dismiss);
    const content = node("div", "cc98-topic-drawer-content");
    const frame = node("iframe", "cc98-topic-drawer-frame");
    frame.name = prefix + token; frame.title = "帖子内容";
    // No top-navigation grant: the parent validates and routes clicks that
    // leave the current thread; native replies can navigate only this frame.
    frame.setAttribute("sandbox", "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals");
    frame.src = url.href;
    const loading = node("div", "cc98-topic-drawer-loading");
    const status = node("p", "cc98-topic-drawer-status", "正在加载帖子…");
    status.setAttribute("role", "status");
    const retry = node("button", "cc98-topic-drawer-retry", "重新加载");
    retry.type = "button"; retry.hidden = true;
    loading.append(status, retry); content.append(frame, loading);
    const resizer = node("div", "cc98-topic-drawer-resizer");
    resizer.tabIndex = 0; resizer.setAttribute("role", "separator");
    resizer.setAttribute("aria-label", "调整帖子侧窗宽度");
    resizer.setAttribute("aria-orientation", "vertical");
    const collapse = node("button", "cc98-topic-drawer-collapse");
    collapse.type = "button";
    collapse.title = "收起侧拉窗";
    collapse.setAttribute("aria-label", "收起侧拉窗");
    collapse.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
    // A sibling, not a child of the drag handle: pressing it never starts a resize.
    panel.append(header, content, resizer, collapse); layer.append(panel);
    // Reuse the reader's scroll action so pending reading anchors cannot undo
    // an explicit return to the top. Keep it outside the collapsed tools.
    const backTop = createRebuiltBackToTopControl();
    backTop.className = "cc98-topic-drawer-back-top";
    backTop.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 16V9c0-3 4-7 4-7s4 4 4 7v7H8Z"/><circle cx="12" cy="9" r="1.5"/><path d="m8 11-3 4v4l3-2m8-6 3 4v4l-3-2M10 19l-1 3m3-3v2m2-2 1 3"/></svg>';
    layer.append(backTop);
    // Parent feeds can now update while the drawer is open. Do not retain a
    // replaced parent tree merely to restore focus when this pane closes.
    view = { layer, frame, opener: new WeakRef(link), heading, newTab, status, retry, resizer, token,
      controller, parentHref: location.href, topicHref: url.href, width: 0, drag: 0, resizeFrame: 0, timeout: 0 };
    setWidth(previousWidth || preferredWidth || Math.max(720, innerWidth * .72));
    document.body.append(layer);
    if (typeof requestSecurityWatermarkRedraw === "function") requestSecurityWatermarkRedraw();
    dismiss.focus({ preventScroll: true });
    dismiss.addEventListener("click", () => close(), options);
    collapse.addEventListener("click", () => close(), options);
    retry.addEventListener("click", () => { if (view) { view.frame.src = view.newTab.href; armTimeout(); } }, options);
    function armTimeout() {
      if (!view) return;
      clearTimeout(view.timeout);
      layer.classList.remove("cc98-topic-drawer-ready", "cc98-topic-drawer-error");
      status.textContent = "正在加载帖子…"; retry.hidden = true;
      view.timeout = setTimeout(showError, 30000);
    }
    function observeNavigationClicks() {
      try {
        const childWindow = frame.contentWindow;
        const childDocument = frame.contentDocument;
        if (!view || !childDocument || view.navigationDocument === childDocument) return;
        view.navigationDocument = childDocument;
        // Observe the real click before the child's document capture handler.
        // A page script posting a forged message alone cannot navigate the top.
        childWindow.addEventListener("click", (event) => {
          if (!view || !event.isTrusted || event.defaultPrevented || !plain(event)) return;
          view.navigationClick = null;
          const anchor = event.target.closest?.("a[href]");
          if (!anchor || download(anchor)) return;
          view.navigationClick = { target: anchor.href, document: frame.contentDocument, href: childWindow.location.href, at: performance.now() };
        }, { capture: true, signal: controller.signal });
      } catch { /* Cross-origin documents cannot request parent navigation. */ }
    }
    frame.addEventListener("load", () => {
      observeNavigationClicks();
      // A same-origin native document may have navigated before its bootstrap
      // reports ready; never reveal an unstyled page in the meantime.
      try {
        if (!frame.contentDocument?.querySelector("#cc98-comfort-app")) armTimeout();
      } catch { showError(); }
    }, options);
    resizer.addEventListener("pointerdown", (event) => {
      if (event.button) return;
      event.preventDefault(); view.drag = event.pointerId;
      resizer.setPointerCapture(event.pointerId);
      layer.classList.add("cc98-topic-drawer-dragging");
    }, options);
    resizer.addEventListener("pointermove", (event) => {
      if (!view?.drag) return;
      view.nextWidth = innerWidth - event.clientX;
      if (!view.resizeFrame) view.resizeFrame = requestAnimationFrame(() => {
        if (view) { view.resizeFrame = 0; setWidth(view.nextWidth); }
      });
    }, options);
    resizer.addEventListener("pointerup", endDrag, options);
    resizer.addEventListener("pointercancel", endDrag, options);
    resizer.addEventListener("lostpointercapture", endDrag, options);
    resizer.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      setWidth(event.key === "Home" ? 0 : event.key === "End" ? innerWidth : view.width + (event.key === "ArrowLeft" ? 1 : -1) * (event.shiftKey ? 80 : 20));
      preferredWidth = view.width;
    }, options);
    addEventListener("resize", () => setWidth(preferredWidth || view.width), options);
    addEventListener("message", (event) => {
      if (!view || event.source !== frame.contentWindow || event.origin !== url.origin) return;
      const data = event.data;
      if (data?.channel !== channel || data.token !== token) return;
      if (data.type === "close") { close(); return; }
      if (data.type === "loading") {
        view.navigationClick = null;
        observeNavigationClicks();
        frame.contentWindow.postMessage({ channel, token, type: "context", topicId: topicId(url) }, url.origin);
        armTimeout(); return;
      }
      if (data.type === "navigate") {
        const click = view.navigationClick;
        view.navigationClick = null;
        if (!click || performance.now() - click.at > 1500) return;
        let target;
        try {
          target = new URL(data.href);
          if (!/^https?:$/.test(target.protocol) || target.username || target.password
            || frame.contentDocument !== click.document || frame.contentWindow.location.href !== click.href
            || data.fromHref !== click.href || click.target !== target.href
            || (target.origin === url.origin && topicId(target) === topicId(url))) return;
        } catch { return; }
        if (openLinksInNewTab) window.open(target.href, "_blank", target.origin === location.origin ? "noopener" : "noopener,noreferrer");
        else location.assign(target.href);
        return;
      }
      if (data.type === "error") { clearTimeout(view.timeout); showError(); return; }
      if (data.type !== "ready") return;
      let target;
      try { target = new URL(data.href, url); } catch { return; }
      if (target.origin !== url.origin) return;
      observeNavigationClicks();
      clearTimeout(view.timeout);
      heading.textContent = data.title || openerTitle; newTab.href = target.href;
      if (typeof requestSecurityWatermarkRedraw === "function") requestSecurityWatermarkRedraw();
      layer.classList.remove("cc98-topic-drawer-error");
      layer.classList.add("cc98-topic-drawer-ready");
    }, options);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.target.closest?.("input, textarea, [contenteditable]")) return;
      event.preventDefault(); close();
    }, options);
    addEventListener("popstate", () => {
      if (view && view.parentHref !== location.href) close({ restoreFocus: false });
    }, options);
    addEventListener("pagehide", () => close({ restoreFocus: false }), options);
    armTimeout();
  }
  document.addEventListener("click", (event) => {
    if (!enabled || event.defaultPrevented || !plain(event)) return;
    const link = event.target.closest?.("a.cc98-rebuild-card-title[href]");
    // Use the rebuilt topic-card contract rather than a route allowlist, so
    // every feed (including dynamically appended cards) shares one behavior.
    if (!link?.closest("#cc98-comfort-app") || !link.closest(".cc98-rebuild-card")) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/\/topic\/\d+(?:\/|$)/i.test(url.pathname)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    open(link, url);
  }, true);
  globalThis.CC98RebornTopicDrawer = {
    sync(settings) {
      enabled = Boolean(settings?.enabled && settings.rebuildUi && settings.topicDrawerEnabled !== false);
      openLinksInNewTab = Boolean(settings?.openLinksInNewTab);
      if (view && (!enabled || view.parentHref !== location.href)) close({ restoreFocus: false });
    }, close,
    getTopicHref: () => view?.topicHref || ""
  };
})();
