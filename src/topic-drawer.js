(function () {
  "use strict";
  const prefix = "cc98-reborn-topic-drawer:v1:";
  const channel = "CC98_REBORN_TOPIC_DRAWER";
  const marker = /^cc98-reborn-topic-drawer:v1:[a-z0-9-]{20,80}$/i;
  const child = window.top !== window;
  if (child) {
    // Hidden conversation/search probes must never start another full runtime.
    if (window.parent !== window.top || !marker.test(window.name)) return;
    const token = window.name.slice(prefix.length);
    document.documentElement.classList.add("cc98-topic-drawer-child");
    const post = (type, extra = {}) => parent.postMessage({ channel, token, type, ...extra }, location.origin);
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
      if (!link || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      // Rebuilt pagination and native React links stay inside this real page,
      // even when the user's normal link preference is a new browser tab.
      if (url.origin === location.origin && /\/(?:topic|editor)\//i.test(url.pathname)) {
        link.target = "_self";
        if (link.closest("#cc98-comfort-app") && !link.closest(".cc98-rebuild-post-body, .cc98-rebuild-signature")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          location.assign(url.href);
        }
      }
    }, true);
    document.addEventListener("keydown", (event) => {
      // Let inner dialogs/editors handle Escape before closing the outer pane.
      if (event.key !== "Escape" || event.defaultPrevented || event.target.closest?.("input, textarea, [contenteditable]")) return;
      const floating = [...document.querySelectorAll(".cc98-rebuild-conversation-layer, .cc98-topic-search-layer, .ant-modal-wrap, #cc98-comfort-image-viewer")];
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

  let enabled = false, view = null, preferredWidth = 0;
  function node(tag, className, text) {
    const value = document.createElement(tag);
    value.className = className;
    if (text !== undefined) value.textContent = text;
    return value;
  }
  function plain(event) { return !event.button && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey; }
  function setWidth(width) {
    if (!view) return;
    const max = Math.max(280, innerWidth - (innerWidth > 700 ? 72 : 0));
    const min = Math.min(520, max);
    view.width = Math.round(Math.max(min, Math.min(max, width)));
    view.layer.style.setProperty("--cc98-drawer-width", `${view.width}px`);
    document.documentElement.style.setProperty("--cc98-drawer-width", `${view.width}px`);
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
  function close({ restoreFocus = true } = {}) {
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
    old.app.inert = old.inert;
    document.documentElement.classList.remove("cc98-topic-drawer-open", "cc98-topic-drawer-had-scrollbar");
    document.documentElement.style.removeProperty("--cc98-drawer-width");
    old.app.style.removeProperty("--cc98-drawer-fold-origin");
    if (restoreFocus && old.opener.isConnected) old.opener.focus({ preventScroll: true });
  }
  function showError() {
    if (!view) return;
    view.status.textContent = "侧窗加载未完成，可重新加载或在新标签页打开。";
    view.retry.hidden = false;
    view.layer.classList.add("cc98-topic-drawer-error");
  }
  function open(link, url) {
    close({ restoreFocus: false });
    const app = document.getElementById("cc98-comfort-app");
    if (!app) return;
    const token = crypto.randomUUID();
    const controller = new AbortController(), options = { signal: controller.signal };
    const layer = node("div", "cc98-topic-drawer-layer");
    const backdrop = node("button", "cc98-topic-drawer-backdrop");
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "关闭帖子侧窗，返回列表");
    const panel = node("section", "cc98-topic-drawer-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "帖子侧窗");
    const header = node("header", "cc98-topic-drawer-header");
    const heading = node("span", "cc98-topic-drawer-title", link.textContent.trim());
    const newTab = node("a", "cc98-topic-drawer-new-tab", "新标签页打开");
    newTab.href = url.href; newTab.target = "_blank"; newTab.rel = "noopener";
    const dismiss = node("button", "cc98-topic-drawer-close", "×");
    dismiss.type = "button"; dismiss.setAttribute("aria-label", "关闭帖子侧窗");
    header.append(heading, newTab, dismiss);
    const content = node("div", "cc98-topic-drawer-content");
    const frame = node("iframe", "cc98-topic-drawer-frame");
    frame.name = prefix + token; frame.title = "帖子内容";
    // Do not grant _top navigation: only the pane should navigate on replies.
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
    panel.append(header, content, resizer); layer.append(backdrop, panel);
    view = { layer, frame, app, opener: link, heading, newTab, status, retry, resizer, token,
      controller, inert: app.inert, parentHref: location.href, width: 0, drag: 0, resizeFrame: 0, timeout: 0 };
    app.inert = true;
    app.style.setProperty("--cc98-drawer-fold-origin", `${scrollY + innerHeight / 2}px`);
    document.documentElement.classList.toggle("cc98-topic-drawer-had-scrollbar", innerWidth > document.documentElement.clientWidth);
    document.documentElement.classList.add("cc98-topic-drawer-open");
    setWidth(preferredWidth || Math.max(720, innerWidth * .72));
    document.body.append(layer);
    dismiss.focus({ preventScroll: true });
    backdrop.addEventListener("click", () => close(), options);
    dismiss.addEventListener("click", () => close(), options);
    retry.addEventListener("click", () => { if (view) { view.frame.src = view.newTab.href; armTimeout(); } }, options);
    function armTimeout() {
      if (!view) return;
      clearTimeout(view.timeout);
      layer.classList.remove("cc98-topic-drawer-ready", "cc98-topic-drawer-error");
      status.textContent = "正在加载帖子…"; retry.hidden = true;
      view.timeout = setTimeout(showError, 30000);
    }
    frame.addEventListener("load", () => {
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
      if (data.type === "loading") { armTimeout(); return; }
      if (data.type === "error") { clearTimeout(view.timeout); showError(); return; }
      if (data.type !== "ready") return;
      let target;
      try { target = new URL(data.href, url); } catch { return; }
      if (target.origin !== url.origin) return;
      clearTimeout(view.timeout);
      heading.textContent = data.title || link.textContent.trim(); newTab.href = target.href;
      layer.classList.remove("cc98-topic-drawer-error");
      layer.classList.add("cc98-topic-drawer-ready");
    }, options);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      // Keep tab focus inside the dialog, including its independent page.
      if (event.key === "Tab" && event.shiftKey && event.target === newTab) { event.preventDefault(); resizer.focus(); }
      else if (event.key === "Tab" && !event.shiftKey && event.target === resizer) { event.preventDefault(); newTab.focus(); }
    }, { ...options, capture: true });
    addEventListener("popstate", () => close({ restoreFocus: false }), options);
    addEventListener("pagehide", () => close({ restoreFocus: false }), options);
    armTimeout();
  }
  document.addEventListener("click", (event) => {
    if (!enabled || event.defaultPrevented || !plain(event)) return;
    const link = event.target.closest?.("a.cc98-rebuild-card-title[href]");
    if (!link?.closest("#cc98-comfort-app")) return;
    const newTopics = typeof isNewTopicsPage === "function" && isNewTopicsPage();
    const hot = link.closest('[data-home-section-kind="hot"], .cc98-rebuild-home-hot-section');
    if (!newTopics && !hot) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/\/topic\/\d+(?:\/|$)/i.test(url.pathname)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    open(link, url);
  }, true);
  globalThis.CC98RebornTopicDrawer = {
    holdsPage() { return Boolean(view && enabled && view.parentHref === location.href); },
    sync(settings) {
      enabled = Boolean(settings?.enabled && settings.rebuildUi && settings.topicDrawerEnabled !== false);
      if (view && (!enabled || view.parentHref !== location.href)) close({ restoreFocus: false });
    }, close
  };
})();
