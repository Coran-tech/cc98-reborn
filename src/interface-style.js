(function (host) {
  "use strict";
  // Decorations contain no text nodes. They cannot become quoted post text,
  // alter native handlers, or enter an editor's source/selection.
  const frameSelector = [
    "#cc98-comfort-app .cc98-rebuild-topbar",
    "#cc98-comfort-app .cc98-rebuild-hero",
    "#cc98-comfort-app .cc98-rebuild-board-hero",
    "#cc98-comfort-app .cc98-rebuild-post",
    "#cc98-comfort-app .cc98-rebuild-native-editor",
    ".cc98-rebuild-conversation-dialog",
    ".cc98-rebuild-conversation-post",
    ".cc98-favorite-share-dialog",
    ".cc98-user-note-dialog",
    ".cc98-rebuild-post-author-card",
    ".cc98-rebuild-openid-bind-dialog",
    ".cc98-rebuild-convert-dialog",
    ".cc98-topic-search-dialog"
  ].join(",");
  // Portal-mounted UI is outside #cc98-comfort-app. Keep one inventory so
  // dynamic menus and dialogs receive the same style and clean up together.
  const surfaceSelector = [
    ".cc98-rebuild-post-author-card", ".cc98-rebuild-side-topbar-menu", ".cc98-rebuild-side-rail-menu",
    ".cc98-rebuild-search-type-menu", ".cc98-rebuild-search-suggestions", ".cc98-rebuild-search-history",
    ".cc98-rebuild-color-popover", ".cc98-rebuild-font-size-popover",
    ".cc98-rebuild-message-emoji-panel", ".cc98-rebuild-editor-emoji-panel",
    ".cc98-rebuild-toast", ".cc98-rebuild-route-status", ".cc98-comfort-loading-panel",
    ".cc98-rebuild-openid-bind-dialog", ".cc98-rebuild-convert-dialog",
    ".cc98-rebuild-conversation-dialog", ".cc98-favorite-share-dialog", ".cc98-user-note-dialog",
    ".cc98-topic-search-dialog", ".cc98-topic-drawer-panel",
    ".cc98-local-syntax-popover", ".cc98-local-syntax-tour-dialog",
    ".cc98-question-privacy-dialog", ".cc98-question-notice", "#cc98-comfort-image-viewer",
    ".ant-modal-content", ".ant-select-dropdown", ".ant-dropdown-menu", ".ant-menu-submenu-popup",
    ".ant-popover-inner", ".ant-tooltip-inner", ".ant-message-notice-content", ".ant-notification-notice",
    ".react-mde-dropdown", ".tagBoxSub"
  ].join(",");
  const floatingGlyphs = [
    [".cc98-topic-drawer-close", "[X]"],
    [".cc98-topic-search-close", "[X]"],
    [".cc98-rebuild-conversation-close, .cc98-rebuild-convert-close, .cc98-rebuild-toast-close, .cc98-local-syntax-tour-close, .ant-modal-close, .ant-notification-notice-close, .cc98-favorite-share-button[data-favorite-share='close'], .cc98-user-note-button[data-user-note='close'], .cc98-image-viewer-close", "[X]"],
    [".cc98-image-viewer-prev", "[<]"], [".cc98-image-viewer-next", "[>]"], [".cc98-image-viewer-save", "[SAVE]"]
  ];
  const glyphSelector = [
    ".cc98-rebuild-icon-action", ".cc98-rebuild-vote-action",
    ".cc98-message-pin", ".cc98-rebuild-read-later-button"
  ].join(",");
  const glyphs = { "评分": "[+/-]", "私信": "[M]", "引用": "[Q]", "追踪": "[T]", "编辑": "[E]", "查看对话": "[THREAD]" };
  const toolbarLabels = [
    [/bilibili|哔哩/i, "[Bili]"], [/加粗|bold/i, "B"], [/斜体|italic/i, "I"],
    [/下划线|underline/i, "U"], [/删除线|strike/i, "S"],
    [/左对齐|align.*left/i, "L"], [/居中|align.*center/i, "C"], [/右对齐|align.*right/i, "R"],
    [/回复后可见|隐藏|hide/i, "[HIDE]"], [/表情|emoji/i, "[EMO]"],
    [/url|链接|link/i, "[URL]"], [/图片|image|picture/i, "[IMG]"], [/视频|video/i, "[VID]"],
    [/音频|audio/i, "[AUD]"], [/文件|file|upload/i, "[FILE]"],
    [/撤销|undo/i, "[UNDO]"], [/重做|redo/i, "[REDO]"], [/预览|preview/i, "[PREV]"]
  ];
  const toolbarSelector = '.cc98-rebuild-native-editor .ubb-button, .cc98-rebuild-native-editor .cc98-rebuild-font-size-apply';
  const controlSelector = [glyphSelector, toolbarSelector, ...floatingGlyphs.map(([selector]) => selector)].join(',');
  const inventorySelector = [frameSelector, surfaceSelector, controlSelector].join(',');
  const authoredSelector = '[contenteditable], .cc98-rebuild-post-body, .cc98-rebuild-signature, .cc98-rebuild-conversation-body, .ubb-preview, .mde-preview-content';
  const frames = new Map();
  const frameMetrics = new WeakMap();
  const pendingRoots = new Set();
  const pendingResizes = new Set();
  let pruneFrames = false;
  let active = false;
  let mutationObserver = null;
  let resizeObserver = null;
  let queued = 0;
  let charWidth = 0;

  function labelFor(node) {
    if (node.matches(".cc98-rebuild-topbar")) return "CC98 / BBS";
    if (node.matches(".cc98-rebuild-hero, .cc98-rebuild-board-hero")) return "BULLETIN BOARD";
    if (node.matches(".cc98-rebuild-native-editor")) return "COMPOSE";
    if (node.matches(".cc98-rebuild-conversation-dialog")) return "THREAD VIEW";
    if (node.matches(".cc98-favorite-share-dialog")) return "BOOKMARKS";
    if (node.matches(".cc98-user-note-dialog")) return "USER NOTE";
    if (node.matches(".cc98-rebuild-post-author-card")) return "USER";
    if (node.matches(".cc98-rebuild-openid-bind-dialog")) return "ACCOUNT";
    if (node.matches(".cc98-rebuild-convert-dialog")) return "CONVERT";
    if (node.matches(".cc98-topic-search-dialog")) return "FULL TEXT SEARCH";
    const floor = node.dataset.postFloor || node.dataset.conversationKey?.split(":").pop();
    return /^\d+$/.test(floor || "") ? `POST #${floor}` : "POST";
  }

  function measureCharacter() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = "12px Consolas, 'Courier New', monospace";
    charWidth = context.measureText("-").width || 7.2;
  }

  function updateFrame(node, decoration, width, height, frameLabel) {
    if (width < 40 || height < 24) return;
    const signature = `${width}:${height}:${charWidth}:${frameLabel}`;
    if (frameMetrics.get(decoration) === signature) return;
    frameMetrics.set(decoration, signature);
    const cols = Math.max(3, Math.floor(width / charWidth));
    const label = ` ${frameLabel} `;
    const top = cols > label.length + 6
      ? `+--${label}${"-".repeat(cols - label.length - 4)}+`
      : `+${"-".repeat(cols - 2)}+`;
    const bottom = `+${"-".repeat(cols - 2)}+`;
    const sides = Array(Math.min(4096, Math.max(1, Math.ceil((height - 24) / 16)))).fill("|").join("\n");
    const rules = [top, bottom, sides, sides];
    [...decoration.children].forEach((part, index) => {
      if (part.dataset.rule !== rules[index]) part.dataset.rule = rules[index];
    });
  }

  function eachIn(root, selector, visit) {
    if (root instanceof Element && root.matches(selector)) visit(root);
    root.querySelectorAll(selector).forEach(visit);
  }

  function scan(root) {
    eachIn(root, surfaceSelector, node => {
      if (!node.closest(authoredSelector) && !node.hasAttribute('data-cc98-ascii-surface')) {
        node.setAttribute("data-cc98-ascii-surface", "");
      }
    });
    floatingGlyphs.forEach(([selector, label]) => {
      eachIn(root, selector, node => {
        if (node.closest("[data-cc98-ascii-surface]") && node.dataset.cc98AsciiControl !== label) node.setAttribute("data-cc98-ascii-control", label);
      });
    });
    eachIn(root, frameSelector, (node) => {
      if (node.closest("[contenteditable], .cc98-ascii-decoration")) return;
      let decoration = frames.get(node);
      if (!decoration || decoration.parentElement !== node) {
        node.querySelectorAll(":scope > .cc98-ascii-decoration").forEach(old => old.remove());
        decoration = document.createElement("span");
        decoration.className = "cc98-ascii-decoration";
        decoration.setAttribute("aria-hidden", "true");
        for (const side of ["top", "bottom", "left", "right"]) {
          const part = document.createElement("i");
          part.className = `cc98-ascii-${side}`;
          decoration.append(part);
        }
        node.setAttribute("data-cc98-ascii-frame", "");
        node.append(decoration);
        frames.set(node, decoration);
        resizeObserver?.observe(node);
      }
      pendingResizes.add(node);
    });
    eachIn(root, glyphSelector, (control) => {
      if (control.closest("[contenteditable]")) return;
      let glyph;
      if (control.matches(".cc98-rebuild-vote-action")) glyph = control.dataset.actionKind === "dislike" ? "v" : "^";
      else if (control.matches(".cc98-message-pin")) glyph = control.getAttribute("aria-pressed") === "true" ? "[*]" : "[P]";
      else if (control.matches(".cc98-rebuild-read-later-button")) glyph = control.classList.contains("is-saved") ? "[*]" : "[+]";
      else glyph = glyphs[control.title] || "[...]";
      if (control.dataset.cc98AsciiGlyph !== glyph) control.dataset.cc98AsciiGlyph = glyph;
    });
    eachIn(root, toolbarSelector, control => {
      if (control.closest('[contenteditable]') || control.matches('.ubb-button-fontSize, .ubb-button-color')) return;
      const signature = [control.title, control.getAttribute('aria-label'), control.className].filter(Boolean).join(' ');
      const label = control.matches('.cc98-rebuild-font-size-apply') ? 'T' : toolbarLabels.find(([pattern]) => pattern.test(signature))?.[1];
      // The native Unicode label is used by editor commands. Keep it intact;
      // only the separate ASCII attribute supplies the visual replacement.
      if (label && control.dataset.cc98AsciiToolbarLabel !== label) control.dataset.cc98AsciiToolbarLabel = label;
    });
  }

  function flush() {
    queued = 0;
    if (!active || !document.body) return;
    if (!charWidth) measureCharacter();
    if (pruneFrames) {
      for (const node of frames.keys()) if (!node.isConnected) {
        resizeObserver?.unobserve(node); frames.delete(node); pendingResizes.delete(node);
      }
      pruneFrames = false;
    }
    const roots = [...pendingRoots]; pendingRoots.clear();
    roots.forEach(root => { if (root === document || root.isConnected) scan(root); });
    // Finish geometry reads before changing any character rules. Resizing one
    // post never requires discovering every control in the document again.
    const measurements = [...pendingResizes].filter(node => node.isConnected && frames.has(node))
      .map(node => [node, frames.get(node), node.clientWidth, node.clientHeight, labelFor(node)]);
    pendingResizes.clear();
    measurements.forEach(args => updateFrame(...args));
  }

  function schedule() {
    if (active && !queued) queued = requestAnimationFrame(flush);
  }

  function queue(root = document) {
    if (!active) return;
    if (root === document) pendingRoots.clear();
    else {
      for (const current of pendingRoots) {
        if (current === document || current.contains(root)) return;
        if (root.contains(current)) pendingRoots.delete(current);
      }
    }
    pendingRoots.add(root);
    schedule();
  }

  function onMutations(records) {
    for (const record of records) {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (!target || target.closest('.cc98-ascii-decoration') || target.closest(authoredSelector)) continue;
      if (record.type === 'attributes') {
        if (target.matches(inventorySelector)) queue(target);
        continue;
      }
      const control = target.closest(controlSelector);
      if (control) queue(control);
      for (const node of record.addedNodes) {
        if (!(node instanceof Element) || node.matches('.cc98-ascii-decoration') || node.closest(authoredSelector)) continue;
        if (node.matches(inventorySelector) || node.querySelector(inventorySelector)) queue(node);
      }
      if ([...record.removedNodes].some(node => node instanceof Element && !node.matches('.cc98-ascii-decoration'))) {
        pruneFrames = true; schedule();
      }
    }
  }

  function stop() {
    active = false;
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    mutationObserver = resizeObserver = null;
    if (queued) cancelAnimationFrame(queued);
    queued = 0;
    document.querySelectorAll(".cc98-ascii-decoration").forEach(node => node.remove());
    document.querySelectorAll("[data-cc98-ascii-frame], [data-cc98-ascii-glyph], [data-cc98-ascii-toolbar-label], [data-cc98-ascii-surface], [data-cc98-ascii-control]").forEach(node => {
      node.removeAttribute("data-cc98-ascii-frame");
      node.removeAttribute("data-cc98-ascii-glyph");
      node.removeAttribute("data-cc98-ascii-toolbar-label");
      node.removeAttribute("data-cc98-ascii-surface");
      node.removeAttribute("data-cc98-ascii-control");
    });
    frames.clear();
    pendingRoots.clear(); pendingResizes.clear(); pruneFrames = false;
  }

  function sync(settings) {
    const next = settings?.enabled !== false && settings?.themeStyle === "ascii";
    if (!next) { if (active) stop(); return; }
    if (!active) {
      active = true;
      resizeObserver = new ResizeObserver(entries => {
        entries.forEach(entry => pendingResizes.add(entry.target)); schedule();
      });
      mutationObserver = new MutationObserver(onMutations);
      mutationObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
        attributeFilter: ["aria-pressed", "data-action-kind", "data-post-floor", "title"] });
      document.fonts?.ready.then(() => { charWidth = 0; queue(); });
    }
    queue();
  }
  host.CC98RebornInterfaceStyle = Object.freeze({ sync });
})(globalThis);
