(() => {
  "use strict";
  let bound = false, hover = null, activeImage = null;
  const library = () => globalThis.CC98RebornImageFavorites;

  function source(item) {
    const node = item?.node;
    const card = node?.closest?.(".cc98-rebuild-card");
    const titleLink = card?.querySelector(".cc98-rebuild-card-title");
    const conversation = node?.closest?.(".cc98-rebuild-conversation-post");
    const reply = node?.closest?.("[data-cc98-reply-href]");
    let sourceHref = item?.sourceHref || node?.dataset.cc98FavoriteSourceHref
      || titleLink?.href || conversation?.querySelector(".cc98-rebuild-conversation-link")?.href
      || reply?.dataset.cc98ReplyHref || "";
    if (!sourceHref && /\/topic\/\d+/.test(typeof getCurrentCc98RoutePath === "function" ? getCurrentCc98RoutePath() : location.pathname)) {
      sourceHref = location.href.split("#")[0];
      const floor = node?.closest?.("[data-post-floor]")?.dataset.postFloor;
      if (floor) sourceHref += `#${floor}`;
    }
    if (sourceHref && typeof makeAbsoluteCc98Url === "function") sourceHref = makeAbsoluteCc98Url(sourceHref);
    const sourceTitle = item?.sourceTitle || node?.dataset.cc98FavoriteSourceTitle
      || titleLink?.textContent || (sourceHref ? document.title.replace(/\s*[-–|]\s*CC98论坛.*$/, "") : "");
    return { url: item?.src || (node ? getViewerImageSrc(node) : ""), sourceHref, sourceTitle };
  }

  function refresh(button) {
    const data = source(button.__cc98FavoriteItem);
    const saved = Boolean(data.url && library()?.has(data.url));
    const label = saved ? "取消图片收藏" : "收藏图片";
    if (button.getAttribute("aria-pressed") !== String(saved)) button.setAttribute("aria-pressed", String(saved));
    if (button.title !== label) { button.title = label; button.setAttribute("aria-label", label); }
  }

  function refreshControls() {
    document.querySelectorAll(".cc98-image-favorite-button").forEach(refresh);
  }

  function createButton(extraClass) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cc98-image-favorite-button ${extraClass}`;
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91Z"/></svg>';
    button.addEventListener("click", async event => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (button.disabled) return;
      const data = source(button.__cc98FavoriteItem);
      button.disabled = true;
      try {
        await library().toggle(data);
      } catch (error) {
        if (typeof showRebuiltTransientToast === "function") showRebuiltTransientToast(button, error.message || "图片收藏失败");
      } finally {
        button.disabled = false;
        refreshControls();
      }
    });
    // The page's image/link handlers must not consume activation of the star.
    button.addEventListener("pointerdown", event => event.stopPropagation());
    refresh(button);
    return button;
  }

  function hide() {
    if (hover) hover.hidden = true;
    activeImage = null;
  }

  function candidate(image) {
    if (!(image instanceof HTMLImageElement) || !image.isConnected
      || !image.closest("#cc98-comfort-app, .cc98-rebuild-conversation-dialog")
      || image.closest("[contenteditable], .ubb-editor, .cc98-rebuild-native-editor, .cc98-image-favorites-region")) return false;
    if (typeof lastSettings !== "undefined" && (!lastSettings?.enabled || !lastSettings?.rebuildUi)) return false;
    // Existing emojis are already reusable in the six native categories. Only
    // forum-hosted images enter URL-based favorites, never extension assets.
    return isImageViewerCandidate(image) && /^https?:/i.test(getViewerImageSrc(image));
  }

  function show(image) {
    if (!candidate(image) || document.querySelector("#cc98-comfort-image-viewer")) { hide(); return; }
    const rect = image.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 24) { hide(); return; }
    if (!hover) {
      hover = createButton("cc98-image-favorite-hover");
      hover.hidden = true;
      document.body.append(hover);
    }
    activeImage = image;
    hover.__cc98FavoriteItem = { node: image };
    hover.style.left = `${Math.max(4, Math.min(innerWidth - 40, rect.right - 38))}px`;
    hover.style.top = `${Math.max(4, Math.min(innerHeight - 40, rect.top + 6))}px`;
    hover.hidden = false;
    refresh(hover);
    library()?.list().then(refreshControls).catch(() => {});
  }

  function bind() {
    if (bound || !library()) return;
    bound = true;
    library().subscribe(refreshControls);
    // One delegated control, not a wrapper/listener for every image. Lazy loads,
    // virtualized cards and conversation windows work without a subtree scan.
    document.addEventListener("pointerover", event => {
      if (hover?.contains(event.target)) return;
      const image = event.target?.closest?.("img");
      if (candidate(image)) show(image);
      else if (!hover?.contains(document.activeElement)) hide();
    }, true);
    document.addEventListener("pointerout", event => {
      if (event.target !== activeImage && !hover?.contains(event.target)) return;
      if (event.relatedTarget === activeImage || hover?.contains(event.relatedTarget)) return;
      if (!hover?.contains(document.activeElement)) hide();
    }, true);
    document.addEventListener("focusin", event => {
      if (hover?.contains(event.target)) return;
      const image = event.target?.matches?.("img") ? event.target : event.target?.querySelector?.("img.cc98-rebuild-content-image");
      if (candidate(image)) show(image);
      else hide();
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); }, true);
    for (const type of ["scroll", "resize", "pagehide", "popstate", "hashchange"]) window.addEventListener(type, hide, { capture: true, passive: true });
  }

  function viewerButton() {
    bind(); hide();
    if (!library()) return null;
    const button = createButton("cc98-image-viewer-favorite");
    library().list().then(refreshControls).catch(() => {});
    return button;
  }

  function setViewerItem(button, item) {
    if (!button) return;
    button.__cc98FavoriteItem = item;
    refresh(button);
  }

  globalThis.CC98RebornImageFavoriteControls = Object.freeze({ bind, viewerButton, setViewerItem });
})();
