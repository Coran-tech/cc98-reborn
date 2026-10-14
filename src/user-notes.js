(function () {
  "use strict";

  const core = globalThis.CC98RebornUserNotesCore;
  if (!core) return;

  const references = new Map();
  let owner = "";
  let generation = 0;
  let cache = new Map();
  let versions = new Map();
  let active = null;
  let guard = null;

  function enabled() {
    return document.documentElement.classList.contains("cc98-comfort")
      && (typeof lastSettings === "undefined" || lastSettings?.enabled !== false);
  }

  function currentOwner() {
    try {
      if (typeof hasVisibleCc98GuestLoginEntry === "function" && hasVisibleCc98GuestLoginEntry()) return "";
      return core.normalizeUid(typeof getCurrentReadLaterUserId === "function" ? getCurrentReadLaterUserId() : "");
    } catch { return ""; }
  }

  function route() {
    return typeof getCurrentCc98RoutePath === "function" ? getCurrentCc98RoutePath() : location.pathname;
  }

  function element(tag, className, text, key) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    if (key) node.dataset.userNote = key;
    return node;
  }

  function button(text, key, action) {
    const node = element("button", "cc98-user-note-button", text, key);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }

  function storage(method, argument) {
    return new Promise((resolve, reject) => {
      const api = globalThis.chrome?.storage?.local;
      if (!api || typeof api[method] !== "function") {
        reject(new Error("无法访问插件存储，请重新加载插件后重试"));
        return;
      }
      let settled = false;
      const finish = (value, error) => {
        if (settled) return;
        settled = true;
        if (error) reject(new Error(error.message || String(error)));
        else resolve(value);
      };
      try {
        const result = api[method](argument, (value) => finish(value, globalThis.chrome?.runtime?.lastError));
        if (result?.then) result.then((value) => finish(value), (error) => finish(undefined, error));
      } catch (error) { finish(undefined, error); }
    });
  }

  function close() {
    const session = active;
    if (!session) return;
    active = null;
    session.layer.remove();
    document.removeEventListener("keydown", session.onKey, true);
    if (session.trigger?.isConnected && enabled()) session.trigger.focus({ preventScroll: true });
  }

  function refreshScope() {
    const next = enabled() ? currentOwner() : "";
    if (next !== owner) {
      owner = next;
      generation += 1;
      cache = new Map();
      versions = new Map();
      close();
    }
    if (active && (!enabled() || active.owner !== owner || active.route !== route() || !active.trigger.isConnected)) close();
    return owner;
  }

  function readNote(uid, retry = false) {
    if (!owner) return Promise.resolve("");
    const known = cache.get(uid);
    if (known?.loaded) return Promise.resolve(known.value);
    if (known?.promise) return known.promise;
    if (known?.error && !retry) return Promise.reject(known.error);
    const capturedOwner = owner;
    const capturedGeneration = generation;
    const capturedVersion = versions.get(uid) || 0;
    const key = core.storageKey(capturedOwner, uid);
    const entry = { value: "", loaded: false, error: null, promise: null };
    entry.promise = storage("get", key).then((result) => {
      refreshScope();
      if (owner !== capturedOwner || generation !== capturedGeneration) throw new Error("登录账号已变化");
      if ((versions.get(uid) || 0) === capturedVersion) {
        entry.value = core.normalizeNote(result?.[key]);
        entry.loaded = true;
        entry.promise = null;
        cache.set(uid, entry);
      }
      const value = cache.get(uid)?.value || "";
      renderAll();
      return value;
    }).catch((error) => {
      if (owner === capturedOwner && generation === capturedGeneration && (versions.get(uid) || 0) === capturedVersion) {
        entry.error = error;
        entry.promise = null;
        cache.set(uid, entry);
        renderAll();
      }
      throw error;
    });
    cache.set(uid, entry);
    return entry.promise;
  }

  function ensureGuard() {
    if (guard) return;
    guard = setInterval(() => {
      sync();
      if (!references.size && !active) { clearInterval(guard); guard = null; }
    }, 500);
  }

  function removeReference(container) {
    const reference = references.get(container);
    if (reference) reference.holder?.remove();
    references.delete(container);
  }

  function render(reference) {
    if (!owner || !enabled()) {
      reference.holder?.remove();
      reference.holder = null;
      return;
    }
    const note = cache.get(reference.uid)?.value || "";
    if (!note && !reference.editor) {
      reference.holder?.remove();
      reference.holder = null;
      return;
    }
    if (!reference.holder?.isConnected) {
      const holder = element("span", "cc98-user-note-inline cc98-user-note-ui", undefined, "owned");
      holder.dataset.userNoteUid = reference.uid;
      const label = element("span", "cc98-user-note-label", "", "label");
      label.dataset.userNoteUid = reference.uid;
      holder.append(label);
      if (reference.editor) {
        const edit = button("备注", "edit", (event) => {
          event.preventDefault();
          event.stopPropagation();
          open(reference, edit);
        });
        edit.dataset.userNoteUid = reference.uid;
        edit.classList.add("cc98-user-note-edit");
        holder.append(edit);
        reference.edit = edit;
      }
      reference.label = label;
      reference.holder = holder;
      reference.container.append(holder);
    }
    if (reference.label.textContent !== note) reference.label.textContent = note;
    if (reference.label.hidden !== !note) reference.label.hidden = !note;
    if (reference.label.title !== note) reference.label.title = note;
    const error = cache.get(reference.uid)?.error;
    if (reference.edit) {
      const text = note ? "编辑备注" : "备注";
      const title = error ? "备注读取失败，点击重试" : `为 ${reference.name || `UID ${reference.uid}`} 设置本地备注`;
      if (reference.edit.textContent !== text) reference.edit.textContent = text;
      if (reference.edit.title !== title) reference.edit.title = title;
      if (reference.edit.getAttribute("aria-label") !== title) reference.edit.setAttribute("aria-label", title);
    }
  }

  function renderAll() {
    for (const [container, reference] of references) {
      if (!container.isConnected || reference.route !== route()) { removeReference(container); continue; }
      render(reference);
    }
  }

  function attach(container, identity, editor) {
    if (!(container instanceof Element)) return;
    const uid = core.normalizeUid(identity.uid);
    if (!uid || identity.anonymous || !enabled()) { removeReference(container); return; }
    refreshScope();
    let reference = references.get(container);
    if (!reference || reference.uid !== uid || reference.editor !== editor) {
      removeReference(container);
      reference = { container, uid, name: String(identity.name || ""), editor, holder: null, route: route() };
      references.set(container, reference);
    } else { reference.name = String(identity.name || ""); reference.route = route(); }
    render(reference);
    if (owner) readNote(uid).catch(() => {});
    ensureGuard();
  }

  function decorateAuthor(container, identity = {}) {
    attach(container, identity, false);
  }

  function uidFromLink(link) {
    const href = link?.getAttribute("href") || "";
    return core.normalizeUid(href.match(/\/user\/id\/([1-9]\d*)(?:[/?#]|$)/i)?.[1]);
  }

  function cleanName(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    clone.querySelectorAll(".cc98-user-note-inline, button, [class*='inline-action'], [class*='follow-action']").forEach((child) => child.remove());
    const direct = [...clone.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.nodeValue || "").join("").trim();
    return direct || clone.querySelector("a[href*='/user/']")?.textContent.trim() || clone.textContent.trim();
  }

  function mount(router) {
    sync();
    if (!enabled() || !(router instanceof Element)) return;
    const path = route();
    if (/\/usercenter\/myfollowings(?:\/|$)/i.test(path)) {
      router.querySelectorAll(".user-center-myfollowings-user, .cc98-local-person-row").forEach((row) => {
        const links = [...row.querySelectorAll("a[href*='/user/id/']")];
        const link = links.find((candidate) => !candidate.querySelector("img") && candidate.textContent.trim()) || links[0];
        const uid = uidFromLink(link);
        const target = row.querySelector(".user-center-myfollowings-user-id") || link?.parentElement;
        if (target) attach(target, { uid, name: link?.textContent.trim() || "" }, true);
      });
    }
    if (/\/user\/(?:id|name)\//i.test(path)) {
      const profile = router.querySelector(".user-profile");
      const nameLine = profile?.querySelector("#userId > p:first-child");
      if (nameLine) {
        const visibleUid = core.normalizeUid(profile.querySelector("#userId > p:nth-child(2)")?.textContent.match(/(?:\bUID|用户\s*ID)\s*[:：]?\s*([1-9]\d*)/i)?.[1]);
        let messageUid = "";
        for (const link of profile.querySelectorAll("a[href*='/message/message']")) {
          try {
            const url = new URL(link.getAttribute("href"), location.href);
            if (url.origin !== location.origin) continue;
            messageUid = core.normalizeUid(url.searchParams.get("id"));
            if (messageUid) break;
          } catch { /* Ignore malformed native links. */ }
        }
        const routeUid = core.normalizeUid(path.match(/\/user\/id\/([1-9]\d*)(?:[/?#]|$)/i)?.[1]);
        const domUid = visibleUid || messageUid;
        const name = cleanName(nameLine);
        const routeNameMatch = path.match(/\/user\/name\/([^/?#]+)/i);
        let routeName = "";
        try { routeName = routeNameMatch ? decodeURIComponent(routeNameMatch[1]) : ""; } catch { /* Invalid route names cannot confirm identity. */ }
        const mismatch = (routeUid && domUid && routeUid !== domUid)
          || (visibleUid && messageUid && visibleUid !== messageUid)
          || (routeNameMatch && (!routeName || routeName.toLocaleLowerCase() !== name.toLocaleLowerCase()));
        if (mismatch) removeReference(nameLine);
        else attach(nameLine, { uid: domUid || routeUid, name }, true);
      }
      const localName = router.querySelector(".cc98-local-profile-identity h1");
      if (localName) {
        const profileHeader = localName.closest(".cc98-local-profile-header");
        const uid = core.normalizeUid(profileHeader?.querySelector(".cc98-local-profile-chips")?.textContent.match(/\bUID\s*([1-9]\d*)/i)?.[1]);
        attach(localName, { uid, name: cleanName(localName) }, true);
      }
    }
  }

  function sync() {
    refreshScope();
    if (!enabled()) {
      close();
      for (const container of references.keys()) removeReference(container);
      return;
    }
    renderAll();
    if (owner) for (const reference of references.values()) readNote(reference.uid).catch(() => {});
  }

  function sessionValid(session) {
    refreshScope();
    return active === session && owner === session.owner && enabled() && session.route === route();
  }

  function status(session, message, error = false) {
    if (active !== session) return;
    if (session.status.textContent !== message) session.status.textContent = message;
    session.status.classList.toggle("is-error", error);
  }

  function setBusy(session, busy) {
    session.busy = busy;
    session.input.disabled = busy || !session.loaded;
    session.save.disabled = busy || !session.loaded;
    session.clear.disabled = busy || !session.loaded || !session.existing;
    session.panel.setAttribute("aria-busy", String(busy));
  }

  async function save(session, clear = false) {
    if (!sessionValid(session) || session.busy || !session.loaded) return;
    const note = clear ? "" : core.normalizeNote(session.input.value);
    session.input.value = note;
    setBusy(session, true);
    status(session, "正在保存...");
    const key = core.storageKey(session.owner, session.uid);
    const writeVersion = (versions.get(session.uid) || 0) + 1;
    versions.set(session.uid, writeVersion);
    try {
      if (note) await storage("set", { [key]: note });
      else await storage("remove", key);
      if (!sessionValid(session)) return;
      if ((versions.get(session.uid) || 0) === writeVersion) cache.set(session.uid, { value: note, loaded: true });
      renderAll();
      close();
    } catch (error) {
      if (!sessionValid(session)) return;
      status(session, `保存失败：${error.message || "无法写入插件存储"}，请重试`, true);
      setBusy(session, false);
    }
  }

  function open(reference, trigger) {
    refreshScope();
    if (!owner || !enabled()) return;
    close();
    const layer = element("div", "cc98-user-note-layer", undefined, "owned");
    const panel = element("section", "cc98-user-note-dialog", undefined, "dialog");
    panel.dataset.userNoteUid = reference.uid;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "编辑用户备注");
    const header = element("div", "cc98-user-note-header");
    header.append(element("h2", "", "编辑用户备注"));
    const closeButton = button("×", "close", close);
    closeButton.setAttribute("aria-label", "关闭");
    header.append(closeButton);
    const body = element("div", "cc98-user-note-body");
    body.append(element("p", "cc98-user-note-identity", `${reference.name || "用户"} · UID ${reference.uid}`));
    const field = element("label", "cc98-user-note-field");
    field.append(element("span", "", "备注"));
    const input = element("input", "", undefined, "input");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = "给这位用户设置一个便于辨认的备注";
    input.setAttribute("aria-describedby", "cc98-user-note-hint");
    field.append(input);
    const hint = element("p", "cc98-user-note-hint", `仅自己可见，保存在此浏览器的插件中，最多 ${core.MAX_LENGTH} 字。`);
    hint.id = "cc98-user-note-hint";
    const count = element("span", "cc98-user-note-count", `0 / ${core.MAX_LENGTH}`);
    const progress = element("p", "cc98-user-note-status", "正在读取备注...", "status");
    progress.setAttribute("role", "status");
    body.append(field, count, hint, progress);
    const footer = element("div", "cc98-user-note-footer");
    const session = { owner, uid: reference.uid, route: route(), layer, panel, trigger, input, status: progress, loaded: false, busy: false, existing: "" };
    const clearButton = button("清除备注", "clear", () => save(session, true));
    const cancelButton = button("取消", "cancel", close);
    const saveButton = button("保存", "save", () => save(session));
    session.save = saveButton;
    session.clear = clearButton;
    footer.append(clearButton, element("span", "cc98-user-note-footer-spacer"), cancelButton, saveButton);
    panel.append(header, body, footer);
    layer.append(panel);
    active = session;
    document.body.append(layer);
    setBusy(session, false);
    const updateCount = () => {
      const value = Array.from(input.value).slice(0, core.MAX_LENGTH).join("");
      if (input.value !== value) input.value = value;
      count.textContent = `${Array.from(value).length} / ${core.MAX_LENGTH}`;
    };
    input.addEventListener("input", (event) => { if (!event.isComposing) updateCount(); });
    input.addEventListener("compositionend", updateCount);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); save(session); }
    });
    layer.addEventListener("click", (event) => { if (event.target === layer) close(); });
    session.onKey = (event) => {
      if (active !== session) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll("button, input")].filter((node) => !node.disabled && !node.hidden);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", session.onKey, true);
    closeButton.focus({ preventScroll: true });
    readNote(reference.uid, true).then((note) => {
      if (!sessionValid(session)) return;
      session.loaded = true;
      session.existing = note;
      input.value = note;
      updateCount();
      status(session, "");
      setBusy(session, false);
      input.focus({ preventScroll: true });
    }).catch((error) => {
      if (!sessionValid(session)) return;
      status(session, `读取失败：${error.message || "无法读取插件存储"}，请关闭后重试`, true);
    });
    ensureGuard();
  }

  globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    refreshScope();
    let changed = false;
    for (const [key, value] of Object.entries(changes)) {
      const parsed = core.parseStorageKey(key);
      if (!parsed || parsed.ownerUid !== owner) continue;
      versions.set(parsed.targetUid, (versions.get(parsed.targetUid) || 0) + 1);
      cache.set(parsed.targetUid, { value: core.normalizeNote(value.newValue), loaded: true });
      changed = true;
    }
    if (changed) renderAll();
  });

  globalThis.CC98RebornUserNotes = { mount, decorateAuthor, sync, close };
})();
