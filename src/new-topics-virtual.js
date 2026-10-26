(() => {
  "use strict";
  if (globalThis.CC98RebornNewTopicsVirtual?.dispose) globalThis.CC98RebornNewTopicsVirtual.dispose();
  else globalThis.CC98RebornNewTopicsVirtual?.destroy?.();
  let view = null, full = false, resumeState = null;
  const lifecycle = new AbortController();
  const GAP = 10;
  const SOURCE_SELECTOR = ".focus-topic-topicArea, .card-topic-area-middle";
  const EMPTY_SETTLE_MS = 320;
  const fields = ["type", "title", "href", "board", "boardHref", "user", "uid", "avatar", "meta", "hoverMeta", "replyCount", "viewCount", "viewMode"];
  const clean = item => {
    const value = {};
    for (const key of fields) value[key] = String(item?.[key] ?? "");
    value.media = (Array.isArray(item?.media) ? item.media : []).slice(0, 6).filter(media => media?.src).map(media => ({ src: String(media.src), alt: String(media.alt || "") }));
    return value;
  };
  function eligible() {
    try {
      return (typeof isNewTopicsPage === "function" ? isNewTopicsPage() : /\/newTopics(?:\/|$)/i.test(location.pathname))
        && (typeof lastSettings === "undefined" || lastSettings?.enabled && lastSettings.rebuildUi);
    } catch { return false; }
  }
  function pageKey() { return location.origin + ":" + location.pathname + location.search; }
  function blocked() {
    return Boolean(document.querySelector("#cc98-comfort-image-viewer"));
  }
  function estimate(item, width) {
    let height = 140;
    if (item.media.length) {
      const columns = item.media.length === 1 ? 1 : [2, 4].includes(item.media.length) ? 2 : 3;
      const mediaWidth = Math.max(160, width - 36);
      height += item.media.length === 1 ? Math.min(360, mediaWidth * 9 / 16) + 14 : Math.ceil(item.media.length / columns) * Math.max(112, (mediaWidth / columns) * 3 / 4) + 14;
    }
    return height + GAP;
  }
  function prefix(v) {
    const sums = new Float64Array(v.records.length + 1);
    for (let i = 0; i < v.records.length; i++) sums[i + 1] = sums[i] + v.records[i].height;
    v.sums = sums;
  }
  function indexAt(v, offset) {
    let low = 0, high = v.records.length;
    while (low < high) { const mid = (low + high) >>> 1; if (v.sums[mid + 1] <= offset) low = mid + 1; else high = mid; }
    return Math.min(Math.max(0, v.records.length - 1), low);
  }
  function viewportInset() {
    return Math.max(0, Math.min(innerHeight, document.querySelector("#cc98-comfort-app .cc98-rebuild-topbar")?.getBoundingClientRect().bottom || 0));
  }
  function anchorTop(saved) { return saved.top + viewportInset() - (saved.inset || 0); }
  function anchor(v) {
    if (!v?.feed.isConnected) return null;
    let candidate = null, partial = null;
    const inset = viewportInset();
    for (const [key, node] of v.mounted) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= inset || rect.top >= innerHeight) continue;
      const value = { key, top: rect.top, inset };
      if (rect.top >= inset && (!candidate || rect.top < candidate.top)) candidate = value;
      else if (!partial || rect.top > partial.top) partial = value;
    }
    return candidate || partial;
  }
  function restore(v, saved) {
    if (!saved || blocked() || !v.feed.isConnected) return;
    const node = v.mounted.get(saved.key);
    if (!node) return;
    const delta = node.getBoundingClientRect().top - anchorTop(saved);
    if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, left: 0, behavior: "instant" });
  }
  function protectedKeys(v) {
    const protectedRows = new Set();
    const active = document.activeElement;
    const selection = document.getSelection();
    const ranges = selection && !selection.isCollapsed ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index)) : [];
    for (const [key, node] of v.mounted) {
      if (active && active !== document.body && node.contains(active)) protectedRows.add(key);
      if (ranges.some(range => { try { return range.intersectsNode(node); } catch { return false; } })) protectedRows.add(key);
    }
    return protectedRows;
  }
  function setPinned(node, top, pinned) {
    if (pinned) {
      node.dataset.cc98VirtualPinned = "true";
      node.dataset.cc98VirtualOffset = String(top);
      node.style.position = "absolute"; node.style.top = top + "px";
      node.style.left = "0"; node.style.width = "100%";
    } else if (node.dataset.cc98VirtualPinned) {
      delete node.dataset.cc98VirtualPinned;
      for (const key of ["position", "top", "left", "width"]) node.style.removeProperty(key);
    }
  }
  function remove(v, key, node) {
    for (const [frame, pending] of v.pendingMedia) if (pending.key === key || node.contains(frame)) cancelMedia(v, frame);
    v.resize?.unobserve(node);
    node.remove(); v.mounted.delete(key);
  }
  function paint(record) {
    const reason = typeof shouldBlockRebuiltItem === "function" ? shouldBlockRebuiltItem(record.item) : "";
    const revealed = typeof isBlacklistItemRevealed === "function" && isBlacklistItemRevealed(record.item);
    const saved = typeof isReadLaterSaved === "function" && isReadLaterSaved(record.item);
    const placeholder = typeof lastSettings === "undefined" ? "" : lastSettings?.placeholderText || "";
    return JSON.stringify([record.stamp, reason, Boolean(revealed), Boolean(saved), placeholder]);
  }
  const cardParts = [".cc98-rebuild-read-later-button", ".cc98-rebuild-card-top", ".cc98-rebuild-card-title", ".cc98-rebuild-topic-media-grid", ".cc98-rebuild-card-meta", ".cc98-rebuild-hover-meta"];
  function patchPart(card, template, selector) {
    const current = card.querySelector(":scope > " + selector), next = template.querySelector(":scope > " + selector);
    if (!next) { current?.remove(); return; }
    if (!current) {
      const after = cardParts.slice(cardParts.indexOf(selector) + 1).map(part => card.querySelector(":scope > " + part)).find(Boolean);
      card.insertBefore(next, after || null); return;
    }
    for (const attribute of [...current.attributes]) {
      if (!next.hasAttribute(attribute.name) && !attribute.name.startsWith("data-cc98")) current.removeAttribute(attribute.name);
    }
    for (const attribute of next.attributes) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
    if (current.childNodes.length !== next.childNodes.length || [...current.childNodes].some((child, index) => !child.isEqualNode(next.childNodes[index]))) current.replaceChildren(...next.childNodes);
  }
  function cancelMedia(v, frame) {
    const pending = v.pendingMedia.get(frame);
    if (!pending) return;
    v.pendingMedia.delete(frame);
    pending.image.onload = pending.image.onerror = null;
    pending.image.removeAttribute("src");
  }
  function queueMedia(v, frame, media, key) {
    const current = v.pendingMedia.get(frame);
    if (current?.src === media.src) { current.alt = media.alt; return; }
    cancelMedia(v, frame);
    const image = new Image();
    const pending = { key, src: media.src, alt: media.alt, image, previous: frame.querySelector("img"), ready: false };
    v.pendingMedia.set(frame, pending);
    image.decoding = "async";
    image.onload = async () => {
      try { if (image.decode) await image.decode(); }
      catch { if (v.pendingMedia.get(frame) === pending) cancelMedia(v, frame); return; }
      if (view !== v || v.pendingMedia.get(frame) !== pending || !image.naturalWidth) return;
      pending.ready = true; schedule(v);
    };
    image.onerror = () => { if (v.pendingMedia.get(frame) === pending) cancelMedia(v, frame); };
    image.src = media.src;
  }
  function flushMedia(v, protections) {
    for (const [frame, pending] of v.pendingMedia) {
      const record = v.byKey.get(pending.key);
      if (!frame.isConnected || !v.feed.contains(frame) || !record?.item.media.some(media => media.src === pending.src)) { cancelMedia(v, frame); continue; }
      if (!pending.ready || protections.has(pending.key)) continue;
      const previous = frame.querySelector("img");
      if (previous !== pending.previous) { cancelMedia(v, frame); continue; }
      const image = pending.image;
      image.onload = image.onerror = null;
      for (const attribute of previous.attributes) if (attribute.name !== "src") image.setAttribute(attribute.name, attribute.value);
      image.alt = pending.alt;
      image.addEventListener("load", () => updateImageFrameStatus(image));
      image.addEventListener("error", () => updateImageFrameStatus(image));
      previous.replaceWith(image);
      updateImageFrameStatus(image);
      v.pendingMedia.delete(frame); v.needsMeasure = true;
    }
  }
  function patchMedia(v, card, record) {
    let gallery = card.querySelector(":scope > .cc98-rebuild-topic-media-grid");
    const wanted = record.item.media;
    if (!wanted.length) {
      if (gallery) { for (const frame of gallery.children) cancelMedia(v, frame); gallery.remove(); }
      return;
    }
    if (!gallery) {
      gallery = document.createElement("div");
      gallery.setAttribute("aria-label", "主题媒体预览");
      card.insertBefore(gallery, card.querySelector(":scope > .cc98-rebuild-card-meta, :scope > .cc98-rebuild-hover-meta"));
    }
    gallery.className = "cc98-rebuild-topic-media-grid count-" + Math.min(6, wanted.length);
    const frames = [...gallery.children], used = new Set(), ordered = [];
    const source = frame => { const image = frame.querySelector("img"); return image ? getViewerImageSrc(image) : ""; };
    wanted.forEach((media, index) => {
      let frame = frames.find(candidate => !used.has(candidate) && source(candidate) === media.src)
        || frames.find(candidate => !used.has(candidate) && v.pendingMedia.get(candidate)?.src === media.src);
      if (!frame) {
        frame = [frames[index], ...frames].find(candidate => candidate && !used.has(candidate) && !wanted.some(value => value.src === source(candidate)));
      }
      if (!frame) {
        const holder = renderTopicCardMedia({ media: [media] });
        setupRebuiltImagePlaceholders(holder); frame = holder.firstElementChild;
      } else {
        const image = frame.querySelector("img");
        if (source(frame) === media.src) {
          cancelMedia(v, frame);
          if (image.alt !== media.alt) image.alt = media.alt;
        } else if (image.complete && image.naturalWidth > 0) queueMedia(v, frame, media, record.key);
        else {
          cancelMedia(v, frame);
          if (image.getAttribute("src") !== media.src) image.src = media.src;
          image.alt = media.alt; updateImageFrameStatus(image);
        }
      }
      used.add(frame); ordered.push(frame);
    });
    for (const frame of frames) if (!used.has(frame)) { cancelMedia(v, frame); frame.remove(); }
    let before = null;
    for (let index = ordered.length - 1; index >= 0; index--) {
      const frame = ordered[index];
      if (frame.parentElement !== gallery || frame.nextSibling !== before) gallery.insertBefore(frame, before);
      before = frame;
    }
  }
  function patchCard(v, card, record) {
    if (!record.rendered || card.classList.contains("cc98-rebuild-blocked")) return false;
    // Build only the text/control template. Creating fresh image elements even
    // for a view-count update discards the currently displayed decoded images.
    const template = renderTopicCard({ ...record.item, media: [] });
    if (template.classList.contains("cc98-rebuild-blocked")) return false;
    for (const selector of cardParts) if (selector !== ".cc98-rebuild-topic-media-grid") patchPart(card, template, selector);
    for (const className of ["cc98-rebuild-topic-card-view", "cc98-rebuild-topic-media-only-view"]) card.classList.toggle(className, template.classList.contains(className));
    card.classList.toggle("has-read-later", template.classList.contains("has-read-later"));
    const readLater = card.querySelector(":scope > .cc98-rebuild-read-later-button");
    if (readLater) readLater.cc98TopicItem = record.item;
    patchMedia(v, card, record);
    return true;
  }
  function measure(v) {
    if (view !== v || !v.feed.isConnected || blocked()) { v.needsMeasure = true; return; }
    const saved = v.resizeAnchor || anchor(v);
    v.resizeAnchor = null;
    let changed = false;
    for (const [key, node] of v.mounted) {
      const record = v.byKey.get(key);
      if (!record) continue;
      const height = node.getBoundingClientRect().height + (record.index === v.records.length - 1 ? 0 : GAP);
      if (height > 0 && Math.abs(height - record.height) > 0.5) { record.height = height; record.measured = true; changed = true; }
    }
    v.needsMeasure = false;
    if (changed) { prefix(v); spacers(v); restore(v, saved); }
    v.visualAnchor = anchor(v);
    schedule(v);
  }
  function spacers(v) {
    v.top.style.height = (full ? 0 : v.sums[v.start] || 0) + "px";
    v.bottom.style.height = (full ? 0 : Math.max(0, v.sums[v.records.length] - (v.sums[v.end] || 0))) + "px";
    for (const [key, node] of v.mounted) if (node.dataset.cc98VirtualPinned) {
      const record = v.byKey.get(key);
      setPinned(node, record ? v.sums[record.index] : Number(node.dataset.cc98VirtualOffset) || 0, true);
    }
  }
  function render(v, force = false) {
    if (view !== v || v.rendering) return;
    if (!eligible()) { destroy(); return; }
    if (!v.feed.isConnected) { if (v.activated) destroy(); return; }
    v.activated = true;
    if (blocked()) { v.deferred = true; v.force ||= force; return; }
    v.deferred = false; force ||= v.force; v.force = false;
    const saved = v.restoreOnRender || v.resizeAnchor || anchor(v);
    v.resizeAnchor = null;
    const rect = v.feed.getBoundingClientRect();
    const reestimated = v.widthDirty || Math.abs(rect.width - v.width) > 1;
    if (reestimated) {
      v.widthDirty = false; v.width = rect.width || v.width;
      for (const record of v.records) { record.height = estimate(record.item, v.width); record.measured = false; }
      prefix(v); spacers(v); v.needsMeasure = true;
    }
    // Width changes invalidate estimates above the viewport. Keep the saved row
    // inside the next window before removing any old cards, then measure it.
    if ((v.restoreOnRender || v.reconcile || reestimated) && saved && v.byKey.has(saved.key)) {
      const offset = v.sums[v.byKey.get(saved.key).index];
      const delta = v.feed.getBoundingClientRect().top + offset - anchorTop(saved);
      if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, left: 0, behavior: "instant" });
    }
    v.restoreOnRender = null; v.reconcile = false;
    const top = v.feed.getBoundingClientRect().top;
    const start = full ? 0 : indexAt(v, Math.max(0, -top - innerHeight * 2));
    const end = full ? v.records.length : Math.min(v.records.length, indexAt(v, Math.max(0, -top + innerHeight * 3)) + 1);
    const protections = protectedKeys(v);
    flushMedia(v, protections);
    if (!force && start === v.start && end === v.end && !v.needsMeasure
      && [...v.mounted].every(([key, node]) => (!node.dataset.cc98VirtualPinned || protections.has(key)) && (!v.byKey.get(key)?.dirty || protections.has(key)))) return;
    v.rendering = true;
    v.start = start; v.end = end;
    for (const [key, node] of v.mounted) {
      const record = v.byKey.get(key), inWindow = record && record.index >= start && record.index < end;
      if (!inWindow && !protections.has(key)) remove(v, key, node);
      else if (record) { node.dataset.cc98VirtualOffset = String(v.sums[record.index]); setPinned(node, v.sums[record.index], !inWindow); }
      else setPinned(node, Number(node.dataset.cc98VirtualOffset) || 0, true);
    }
    let before = v.bottom;
    for (let i = end - 1; i >= start; i--) {
      const record = v.records[i];
      if (force) record.dirty = true;
      let node = v.mounted.get(record.key);
      if (!node || (force || record.dirty) && !protections.has(record.key)) {
        const nextPaint = paint(record);
        if (!node || record.paint !== nextPaint) {
          if (!node || !patchCard(v, node, record)) {
            const next = renderTopicCard(record.item);
            next.dataset.itemKey = record.key;
            next.dataset.cc98VirtualIndex = String(i);
            if (typeof setupRebuiltImagePlaceholders === "function") setupRebuiltImagePlaceholders(next);
            if (!node || !node.isEqualNode(next)) {
              if (node) remove(v, record.key, node);
              node = next; v.mounted.set(record.key, node);
              v.resize?.observe(node);
            }
          }
          record.paint = nextPaint; record.rendered = record.item;
        }
        record.dirty = false;
      }
      setPinned(node, 0, false);
      node.style.marginBottom = (i === v.records.length - 1 ? 0 : GAP) + "px";
      if (node.nextSibling !== before) v.feed.insertBefore(node, before);
      before = node;
    }
    spacers(v); restore(v, saved); v.visualAnchor = anchor(v); v.rendering = false;
    syncButtons();
    // Commit actual row heights and spacer corrections before this frame is
    // painted, rather than exposing estimated layout for one frame.
    measure(v);
  }
  function schedule(v, force = false) {
    if (view !== v) return;
    v.force ||= force;
    if (v.frame) return;
    v.frame = requestAnimationFrame(() => { v.frame = 0; render(v, v.force); });
  }
  function assign(v, items, previous) {
    const records = [], byKey = new Map();
    let changed = items.length !== v.records.length;
    items.forEach((raw, index) => {
      const item = clean(raw), key = "topic:" + item.href;
      if (!item.href || byKey.has(key)) return;
      const stamp = JSON.stringify(item), old = previous?.get(key);
      const same = old?.stamp === stamp;
      const record = { item, key, stamp, index: records.length, height: old ? old.height : estimate(item, v.width), measured: Boolean(old?.measured), dirty: !same || old?.dirty, paint: old?.paint, rendered: old?.rendered };
      if (!same || old?.index !== record.index) changed = true;
      records.push(record); byKey.set(key, record);
      const readLater = v.mounted.get(key)?.querySelector(":scope > .cc98-rebuild-read-later-button");
      if (readLater) readLater.cc98TopicItem = item;
    });
    v.records = records; v.byKey = byKey; prefix(v);
    return changed;
  }
  function update(feed, items, options = {}) {
    const v = view;
    if (!v || v.feed !== feed) return mount(feed, items);
    if (!items.length && v.records.length && !options.allowEmpty) { queueSource(v); return true; }
    if (items.length) v.emptySince = 0;
    const changed = assign(v, items, v.byKey);
    // A queued data update must not retain coordinates from before a later
    // wheel event. render() captures the live row immediately before mutation.
    if (changed || options.refresh) { v.reconcile ||= changed; v.needsMeasure = true; schedule(v, true); }
    return true;
  }
  function syncButtons() {
    document.querySelectorAll("[data-new-topics-virtual-toggle]").forEach(button => {
      button.textContent = full ? "恢复按需显示" : "显示全部";
      button.setAttribute("aria-pressed", String(full));
    });
  }
  function nativeSources(v) {
    const sources = [...document.querySelectorAll(SOURCE_SELECTOR)].filter(node => !node.closest("#cc98-comfort-app"));
    if (v.sourceObserver && sources.length === v.sources.length && sources.every((source, index) => source === v.sources[index])) return false;
    v.sourceObserver?.disconnect();
    v.sources = sources; v.emptySince = 0;
    v.sourceObserver ||= new MutationObserver(() => queueSource(v));
    for (const source of sources) v.sourceObserver.observe(source, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["src", "srcset", "poster", "aria-busy", "data-loading"] });
    return true;
  }
  function queueSource(v, delay = 120) {
    if (view !== v || v.sourceTimer) return;
    v.sourceTimer = setTimeout(() => {
      v.sourceTimer = 0;
      if (view !== v || !eligible()) return;
      if (blocked()) { v.nativeDirty = true; return; }
      nativeSources(v);
      const items = getTopicItems();
      if (items.length) { update(v.feed, items); return; }
      const explicitEmpty = [...document.querySelectorAll(".noResultText, .focus-empty, [class*='emptyResult'], [class*='noResult']")].some(node => !node.closest("#cc98-comfort-app") && node.textContent.trim());
      const pending = document.readyState === "loading"
        || document.querySelector("#cc98-comfort-app .cc98-rebuild-new-topic-controls.is-syncing")
        || v.sources.some(node => node.closest('[aria-busy="true"], [data-loading="true"]'));
      // The native bottom spinner exists even when idle. Only explicit busy
      // state, absent source roots, or a short replacement transaction defer an
      // empty list; a completed empty response must remove stale cards too.
      if (pending || !v.sources.length && !explicitEmpty) {
        v.emptySince = 0;
        if (pending) queueSource(v, 240);
        return;
      }
      v.emptySince ||= Date.now();
      const remaining = EMPTY_SETTLE_MS - (Date.now() - v.emptySince);
      if (remaining > 0) { queueSource(v, remaining); return; }
      update(v.feed, [], { allowEmpty: true });
    }, delay);
  }
  function sourceRootsChanged(v, records) {
    return records.some(record => {
      if (record.type === "attributes") return v.sources.includes(record.target) || record.target.matches?.(SOURCE_SELECTOR) && !record.target.closest("#cc98-comfort-app");
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1
        && node.id !== "cc98-comfort-app" && !node.closest("#cc98-comfort-app")
        && (node.matches(SOURCE_SELECTOR) || node.querySelector(SOURCE_SELECTOR)));
    });
  }
  function mount(feed, items) {
    if (!eligible() || !feed) return false;
    const old = view, sameRoute = old?.page === pageKey(), carry = sameRoute ? new Map(old.byKey) : null, saved = sameRoute ? anchor(old) : null;
    destroy(false);
    const v = { feed, page: pageKey(), records: [], byKey: new Map(), mounted: new Map(), pendingMedia: new Map(), sources: [], emptySince: 0, width: old?.width || 720, start: -1, end: -1, frame: 0, measureFrame: 0, sourceTimer: 0, force: true, activated: false, deferred: false, rendering: false, needsMeasure: true, nativeDirty: false, restoreOnRender: saved, controller: new AbortController() };
    view = v;
    for (const side of ["top", "bottom"]) {
      const spacer = document.createElement("div");
      spacer.dataset.cc98VirtualSpacer = side; spacer.setAttribute("aria-hidden", "true");
      spacer.className = "cc98-new-topics-virtual-spacer"; v[side] = spacer;
    }
    feed.dataset.cc98Virtual = "true"; feed.replaceChildren(v.top, v.bottom);
    assign(v, items, carry);
    v.bottom.style.height = (v.sums[v.records.length] || 0) + "px";
    const options = { signal: v.controller.signal };
    window.addEventListener("scroll", () => { v.visualAnchor = anchor(v); v.resizeAnchor = null; schedule(v); }, { ...options, passive: true });
    window.addEventListener("resize", () => { v.resizeAnchor ||= v.visualAnchor; v.widthDirty = true; schedule(v, true); }, { ...options, passive: true });
    document.addEventListener("selectionchange", () => schedule(v), options);
    document.addEventListener("focusout", () => schedule(v), options);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(v, true); }, options);
    feed.addEventListener("load", () => { v.resizeAnchor ||= v.visualAnchor; v.needsMeasure = true; schedule(v); }, { ...options, capture: true });
    if (typeof ResizeObserver === "function") v.resize = new ResizeObserver(entries => {
      if (entries.some(entry => entry.target === feed && Math.abs(entry.contentRect.width - v.width) > 1)) v.widthDirty = true;
      v.resizeAnchor ||= v.visualAnchor; v.needsMeasure = true; schedule(v);
    });
    v.resize?.observe(feed);
    v.life = new MutationObserver(records => {
      if (view !== v) return;
      if (!v.feed.isConnected && v.activated || !eligible()) { destroy(); return; }
      if (sourceRootsChanged(v, records) && nativeSources(v)) queueSource(v);
      const relevant = records.some(record => record.target === document.documentElement || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.id === "cc98-comfort-image-viewer" || node.classList?.contains("cc98-topic-drawer-layer"))));
      if (relevant && !blocked()) {
        if (v.nativeDirty) { v.nativeDirty = false; queueSource(v); }
        schedule(v, v.deferred);
      }
    });
    v.life.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    nativeSources(v); schedule(v, true); syncButtons();
    return true;
  }
  function refresh() {
    if (!view || !eligible() || view.page !== pageKey() || !view.feed.isConnected) return false;
    schedule(view, true); return true;
  }
  function toggleAll() {
    if (!view) return;
    full = !full; view.needsMeasure = true; schedule(view, true); syncButtons();
  }
  function destroy(reset = true) {
    const v = view; view = null;
    if (reset) full = false;
    if (!v) return;
    v.controller.abort(); v.resize?.disconnect(); v.life?.disconnect(); v.sourceObserver?.disconnect();
    cancelAnimationFrame(v.frame); cancelAnimationFrame(v.measureFrame); clearTimeout(v.sourceTimer);
    for (const frame of v.pendingMedia.keys()) cancelMedia(v, frame);
    v.mounted.clear(); v.byKey.clear(); v.records = []; v.sources = [];
  }
  function sync(settings) { if (!settings?.enabled || !settings.rebuildUi || !eligible()) destroy(); }
  function gallery(image) {
    const v = view;
    if (!v?.feed.contains(image)) return null;
    const row = image.closest("[data-item-key]"), key = row?.dataset.itemKey, activeSrc = typeof getViewerImageSrc === "function" ? getViewerImageSrc(image) : image.src;
    const activeSlot = [...(row?.querySelectorAll(".cc98-rebuild-topic-media-image") || [])].indexOf(image);
    const items = []; let index = -1;
    for (const record of v.records) {
      const reason = typeof shouldBlockRebuiltItem === "function" ? shouldBlockRebuiltItem(record.item) : "";
      if (reason && !(typeof isBlacklistItemRevealed === "function" && isBlacklistItemRevealed(record.item))) continue;
      for (const [slot, media] of record.item.media.entries()) {
        const active = record.key === key && slot === activeSlot;
        if (active) index = items.length;
        items.push({ src: active ? activeSrc : media.src, alt: active ? image.alt : media.alt });
      }
    }
    return index >= 0 ? { items, index } : null;
  }
  function status() {
    return { active: Boolean(view), total: view?.records.length || 0, mounted: view?.mounted.size || 0, pendingMedia: view?.pendingMedia.size || 0, start: view?.start ?? 0, end: view?.end ?? 0, full, paused: Boolean(view && blocked()), pinned: view ? [...view.mounted.values()].filter(node => node.dataset.cc98VirtualPinned).length : 0 };
  }
  function dispose() { resumeState = null; lifecycle.abort(); destroy(); }
  addEventListener("pagehide", () => {
    resumeState = view ? { page: view.page, anchor: anchor(view), full } : null;
    destroy();
  }, { signal: lifecycle.signal });
  addEventListener("pageshow", event => {
    if (!event.persisted || view || !eligible()) return;
    const feed = document.querySelector('#cc98-comfort-app [data-feed-kind="topics"][data-cc98-virtual="true"]');
    if (!feed || typeof getTopicItems !== "function") return;
    const saved = resumeState?.page === pageKey() ? resumeState : null;
    full = Boolean(saved?.full);
    if (mount(feed, getTopicItems()) && saved?.anchor) view.restoreOnRender = saved.anchor;
    resumeState = null;
  }, { signal: lifecycle.signal });
  addEventListener("popstate", () => { if (!eligible()) { resumeState = null; destroy(); } }, { signal: lifecycle.signal });
  function prepareResize() {
    if (!view) return false;
    view.resizeAnchor ||= anchor(view);
    return true;
  }
  globalThis.CC98RebornNewTopicsVirtual = { mount, update, destroy, dispose, toggleAll, isFull: () => full, refresh, sync, gallery, status, prepareResize };
})();
