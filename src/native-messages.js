(() => {
  "use strict";
  const selector = ".noticeSuccess, .send-topic-notice-success";
  const messages = new Map();
  let enabled = false;
  let layer = null;
  let resizeObserver = null;

  function remove(source) {
    const item = messages.get(source);
    if (!item) return;
    messages.delete(source);
    item.observer.disconnect();
    source.removeEventListener("animationend", item.finish);
    source.removeEventListener("animationcancel", item.finish);
    item.card.remove();
    if (!messages.size) {
      resizeObserver?.disconnect();
      resizeObserver = null;
      layer?.remove();
      layer = null;
      document.documentElement.style.removeProperty("--cc98-native-message-stack-height");
    }
  }

  function clear() {
    for (const source of messages.keys()) remove(source);
  }

  function ensureLayer() {
    if (layer?.isConnected) return layer;
    layer = document.createElement("div");
    layer.className = "cc98-native-message-layer";
    layer.setAttribute("aria-live", "polite");
    layer.setAttribute("aria-relevant", "additions text");
    document.body.append(layer);
    resizeObserver = new ResizeObserver(() => {
      if (layer) document.documentElement.style.setProperty(
        "--cc98-native-message-stack-height", `${Math.ceil(layer.getBoundingClientRect().height) + 8}px`
      );
    });
    resizeObserver.observe(layer);
    return layer;
  }

  function present(source, elapsed = 0) {
    if (!enabled || !document.body || !source.isConnected || source.classList.contains("displaynone")) return;
    const text = source.textContent || "";
    if (!text.trim()) return;
    remove(source);
    const card = document.createElement("div");
    card.className = "cc98-native-message";
    card.dataset.nativeMessageSource = source.id;
    // NoticeMessage uses its "success" class for failures and login reminders
    // too. Only SendTopicNoticeMessage has an unambiguous error contract.
    const error = source.classList.contains("send-topic-notice-success");
    card.dataset.messageKind = error ? "error" : "info";
    card.setAttribute("role", "status");
    card.setAttribute("aria-atomic", "true");
    const icon = document.createElement("span");
    icon.className = "cc98-native-message-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/>'
      + (error ? '<path d="m9 9 6 6m0-6-6 6"/>' : '<path d="M12 11v6m0-10v.01"/>') + '</svg>';
    const content = document.createElement("span");
    content.className = "cc98-native-message-text";
    content.textContent = text;
    card.append(icon, content);
    // The source keeps its native class, animation and React ownership. This
    // text-only presentation escapes the clipped native tree without moving it
    // or changing the submit monitor's computed visibility/opacity checks.
    const duration = parseFloat(getComputedStyle(source).animationDuration) || 3;
    card.style.animationDuration = `${duration}s`;
    card.style.animationDelay = `${-Math.max(0, elapsed)}s`;
    const finish = event => {
      if (event.target === source && event.animationName === "fadeOut") remove(source);
    };
    const observer = new MutationObserver(() => {
      if (!source.isConnected || source.hidden || source.classList.contains("displaynone")
        || !source.classList.contains("noticeDisplaynone")) { remove(source); return; }
      const next = source.textContent || "";
      if (!next.trim()) remove(source);
      else if (content.textContent !== next) content.textContent = next;
    });
    messages.set(source, { card, observer, finish });
    observer.observe(source, { attributes: true, attributeFilter: ["class", "hidden"], childList: true, characterData: true, subtree: true });
    source.addEventListener("animationend", finish);
    source.addEventListener("animationcancel", finish);
    card.addEventListener("animationend", event => {
      if (event.target === card && messages.get(source)?.card === card) remove(source);
    });
    ensureLayer().append(card);
  }

  function onStart(event) {
    if (event.animationName === "fadeOut" && event.target instanceof HTMLElement && event.target.matches(selector)) {
      present(event.target, event.elapsedTime);
    }
  }

  function sync(settings) {
    const next = settings?.enabled !== false;
    if (next === enabled) return;
    enabled = next;
    document.documentElement.classList.toggle("cc98-native-messages-active", enabled);
    if (!enabled) {
      document.removeEventListener("animationstart", onStart, true);
      window.removeEventListener("pagehide", clear);
      clear();
      return;
    }
    document.addEventListener("animationstart", onStart, true);
    window.addEventListener("pagehide", clear);
    // One activation scan; subsequent messages are discovered by their native
    // animation, not by observing every mutation while scrolling a long feed.
    document.querySelectorAll(selector).forEach(source => {
      const animation = source.getAnimations().find(item => item.animationName === "fadeOut" && item.playState !== "finished");
      if (animation) present(source, Number(animation.currentTime || 0) / 1000);
    });
  }

  globalThis.CC98RebornNativeMessages = Object.freeze({ sync });
})();
