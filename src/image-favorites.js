(() => {
  "use strict";
  const core = globalThis.CC98RebornImageFavoritesCore;
  if (!core) return;
  const subscribers = new Set(), PAGE_SIZE = 24;
  let owner = "", generation = 0, revision = 0, items = [], loaded = false, loading = null;
  let router = null, region = null, page = 1, renderedKey = "", lastError = "";

  function currentOwner() {
    try {
      if (typeof hasVisibleCc98GuestLoginEntry === "function" && hasVisibleCc98GuestLoginEntry()) return "";
      return core.uid(typeof getCurrentReadLaterUserId === "function" ? getCurrentReadLaterUserId() : "");
    } catch { return ""; }
  }
  function snapshot() { return items.map(item => ({ ...item })); }
  function changed() {
    render();
    for (const listener of subscribers) { try { listener(snapshot()); } catch {} }
  }
  function syncOwner() {
    const next = currentOwner();
    if (next === owner) return;
    owner = next; generation += 1; revision += 1; items = []; loaded = false; loading = null;
    lastError = ""; page = 1; renderedKey = "";
    // Hidden cards may contain unsaved notes from the previous account.
    region?.querySelector(".cc98-image-favorites-grid")?.replaceChildren();
    changed();
  }
  function storageGet(key) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (result, error) => { if (done) return; done = true; error ? reject(new Error(error.message || String(error))) : resolve(result); };
      try { chrome.storage.local.get(key, result => finish(result, chrome.runtime.lastError))?.then?.(result => finish(result), error => finish(undefined, error)); }
      catch (error) { finish(undefined, error); }
    });
  }
  function send(message) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (result, error) => {
        if (done) return; done = true;
        if (error || !result?.ok) reject(new Error(error?.message || result?.error || "图片收藏保存失败，请重新加载插件后重试"));
        else resolve(result);
      };
      try { chrome.runtime.sendMessage(message, result => finish(result, chrome.runtime.lastError))?.then?.(result => finish(result), error => finish(undefined, error)); }
      catch (error) { finish(undefined, error); }
    });
  }
  async function list() {
    syncOwner();
    if (!owner) throw new Error("请先登录 CC98 后使用图片收藏");
    if (loaded) return snapshot();
    if (loading) return loading;
    const token = generation, capturedOwner = owner, key = core.storageKey(owner), startRevision = revision;
    lastError = ""; render();
    loading = storageGet(key).then(records => {
      syncOwner();
      if (token !== generation || capturedOwner !== owner) throw new Error("登录账号已变化，请重试");
      if (revision === startRevision) { items = core.normalize(records[key]); loaded = true; lastError = ""; changed(); }
      return snapshot();
    }).catch(error => {
      if (token === generation) { lastError = `图片收藏读取失败：${error.message}`; render(); }
      throw error;
    }).finally(() => { if (token === generation) loading = null; });
    return loading;
  }
  async function mutate(action, data) {
    const capturedOwner = currentOwner();
    await list();
    if (!capturedOwner || currentOwner() !== capturedOwner || owner !== capturedOwner) throw new Error("登录账号已变化，请重试");
    const token = generation, startRevision = revision;
    const result = await send({ type: "CC98_IMAGE_FAVORITES", owner: capturedOwner, action, ...data });
    syncOwner();
    if (token !== generation || owner !== capturedOwner || result.owner !== capturedOwner) throw new Error("登录账号已变化，请重试");
    if (revision === startRevision) { items = core.normalize(result.items); loaded = true; revision += 1; changed(); }
    return snapshot();
  }
  function element(tag, className, text) {
    const node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  function button(text, className, handler) {
    const node = element("button", `cc98-image-favorites-button ${className || ""}`, text); node.type = "button";
    node.addEventListener("click", handler); return node;
  }
  function status(message, error = false) {
    const target = region?.querySelector(".cc98-image-favorites-status");
    if (target) { target.textContent = message; target.hidden = !message; target.classList.toggle("is-error", error); }
  }
  function makeCard(entry) {
    const card = element("article", "cc98-image-favorites-card"); card.dataset.favoriteUrl = entry.url;
    const view = button("", "cc98-image-favorites-view", event => {
      event.preventDefault(); event.stopPropagation();
      if (typeof openImageViewer === "function") openImageViewer(image);
    });
    const image = element("img", "cc98-image-favorites-thumbnail");
    image.src = entry.url; image.alt = entry.note || "收藏图片"; image.loading = "lazy"; image.decoding = "async";
    image.dataset.cc98FavoriteImage = "true";
    image.dataset.cc98FavoriteSourceHref = entry.sourceHref; image.dataset.cc98FavoriteSourceTitle = entry.sourceTitle;
    view.setAttribute("aria-label", `查看图片：${entry.note || "收藏图片"}`); view.append(image);
    const note = element("p", "cc98-image-favorites-note", entry.note || "未设置备注");
    note.classList.toggle("is-empty", !entry.note);
    const actions = element("div", "cc98-image-favorites-actions");
    const form = element("form", "cc98-image-favorites-note-form"); form.hidden = true;
    const input = element("input", "cc98-image-favorites-note-input"); input.type = "text"; input.maxLength = core.MAX_NOTE;
    input.setAttribute("aria-label", "图片备注"); input.value = entry.note;
    const save = button("保存", "", () => {}); save.type = "submit";
    const cancel = button("取消", "", () => { form.hidden = true; actions.hidden = false; note.hidden = false; edit.focus({ preventScroll: true }); });
    form.append(input, save, cancel);
    const edit = button("备注", "cc98-image-favorites-edit", () => {
      input.value = items.find(item => item.url === entry.url)?.note || "";
      form.hidden = false; actions.hidden = true; note.hidden = true; input.focus({ preventScroll: true });
    });
    form.addEventListener("submit", async event => {
      event.preventDefault(); save.disabled = true; cancel.disabled = true;
      try { await mutate("note", { url: entry.url, note: input.value }); form.hidden = true; actions.hidden = false; note.hidden = false; status("已保存备注"); edit.focus({ preventScroll: true }); }
      catch (error) { status(error.message, true); }
      finally { save.disabled = false; cancel.disabled = false; }
    });
    form.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); cancel.click(); } });
    actions.append(edit);
    if (entry.sourceHref) {
      const source = element("a", "cc98-image-favorites-button cc98-image-favorites-source", "来源帖子");
      source.href = typeof makeAbsoluteCc98Url === "function" ? makeAbsoluteCc98Url(new URL(entry.sourceHref).pathname + new URL(entry.sourceHref).hash) : entry.sourceHref;
      source.title = entry.sourceTitle || source.href;
      actions.append(source);
    }
    actions.append(button("删除", "cc98-image-favorites-delete", async event => {
      const control = event.currentTarget; control.disabled = true;
      try { await mutate("remove", { url: entry.url }); status("已删除收藏"); }
      catch (error) { control.disabled = false; status(error.message, true); }
    }));
    card.append(view, note, actions, form); return card;
  }
  function render() {
    if (!region?.isConnected) return;
    const count = region.querySelector(".cc98-image-favorites-count");
    if (count.textContent !== String(items.length)) count.textContent = String(items.length);
    // Read only the count until first expansion; subsequent folds retain cards,
    // note drafts and pagination without reloading the images.
    if (!region.open && !renderedKey) return;
    const grid = region.querySelector(".cc98-image-favorites-grid"), empty = region.querySelector(".cc98-image-favorites-empty");
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE)); page = Math.min(page, totalPages);
    const emptyText = !owner ? "登录后查看图片收藏" : lastError || (!loaded ? "正在读取…" : "暂无图片收藏");
    empty.hidden = loaded && items.length > 0;
    if (empty.textContent !== emptyText) empty.textContent = emptyText;
    region.querySelector(".cc98-image-favorites-retry").hidden = !lastError;
    const selected = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const key = `${owner}:${page}:${JSON.stringify(selected)}`;
    if (key !== renderedKey) {
      const old = new Map([...grid.children].map(card => [card.dataset.favoriteUrl, card]));
      for (const card of old.values()) if (!selected.some(entry => entry.url === card.dataset.favoriteUrl)) card.remove();
      selected.forEach((entry, index) => {
        const card = old.get(entry.url) || makeCard(entry);
        const note = card.querySelector(".cc98-image-favorites-note"), image = card.querySelector("img");
        note.textContent = entry.note || "未设置备注"; note.classList.toggle("is-empty", !entry.note);
        note.title = entry.note;
        image.alt = entry.note || "收藏图片";
        card.querySelector(".cc98-image-favorites-view").setAttribute("aria-label", `查看图片：${entry.note || "收藏图片"}`);
        if (grid.children[index] !== card) grid.insertBefore(card, grid.children[index] || null);
      });
      renderedKey = key;
    }
    const pagination = region.querySelector(".cc98-image-favorites-pages"); pagination.hidden = totalPages <= 1;
    const pageLabel = pagination.querySelector("span");
    if (pageLabel.textContent !== `${page} / ${totalPages}`) pageLabel.textContent = `${page} / ${totalPages}`;
    pagination.querySelector(".is-previous").disabled = page <= 1; pagination.querySelector(".is-next").disabled = page >= totalPages;
  }
  function createRegion() {
    const node = element("details", "cc98-image-favorites-region"); node.setAttribute("aria-label", "图片收藏");
    const heading = element("summary", "cc98-image-favorites-header");
    heading.append(element("h2", "", "图片收藏"), element("span", "cc98-image-favorites-count", "0"));
    const body = element("div", "cc98-image-favorites-body");
    const grid = element("div", "cc98-image-favorites-grid"), empty = element("p", "cc98-image-favorites-empty");
    const retry = button("重试", "cc98-image-favorites-retry", () => { list().catch(() => {}); }); retry.hidden = true;
    const message = element("p", "cc98-image-favorites-status"); message.hidden = true; message.setAttribute("role", "status");
    const pages = element("nav", "cc98-image-favorites-pages"); pages.setAttribute("aria-label", "图片收藏分页");
    const turn = delta => { page += delta; render(); node.scrollIntoView({ block: "start", behavior: "instant" }); };
    pages.append(button("上一页", "is-previous", () => turn(-1)), element("span"), button("下一页", "is-next", () => turn(1)));
    body.append(empty, retry, grid, pages, message);
    node.append(heading, body);
    node.addEventListener("toggle", () => { if (node.open) render(); });
    return node;
  }
  function mount(source) {
    if (source) router = source;
    syncOwner();
    const path = typeof getCurrentCc98RoutePath === "function" ? getCurrentCc98RoutePath() : location.pathname;
    const enabled = typeof lastSettings === "undefined" || (lastSettings?.enabled && lastSettings?.rebuildUi);
    if (!enabled || !/^\/usercenter\/myfavorites(?:\/|$)/i.test(path) || !router?.isConnected) {
      region?.remove(); region = null; renderedKey = ""; return;
    }
    if (!region?.isConnected || !router.contains(region)) {
      region?.remove(); region = createRegion(); router.prepend(region); renderedKey = ""; render();
    }
    if (owner && !loaded && !loading) list().catch(() => {});
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    syncOwner();
    const change = changes[core.storageKey(owner)];
    if (change) { revision += 1; items = core.normalize(change.newValue); loaded = true; lastError = ""; changed(); }
    if (changes.cc98ComfortSettings) mount();
  });
  window.addEventListener("storage", event => {
    if (event.key === "userInfo" || event.key === null) { syncOwner(); if (region) mount(); }
  });
  globalThis.CC98RebornImageFavorites = Object.freeze({
    mount, list,
    getItems() { syncOwner(); return snapshot(); },
    has(url) { syncOwner(); return items.some(item => item.url === core.imageUrl(url)); },
    isReady() { syncOwner(); return Boolean(owner && loaded); },
    toggle(item) { return mutate("toggle", { item }); },
    setNote(url, note) { return mutate("note", { url, note }); },
    remove(url) { return mutate("remove", { url }); },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); }
  });
})();
