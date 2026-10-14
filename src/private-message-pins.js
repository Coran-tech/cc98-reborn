(() => {
  "use strict";
  const core = globalThis.CC98RebornPrivateMessagePinsCore;
  if (!core) return;
  let owner = "", generation = 0, pins = [], loaded = false, busy = false;
  let root = null;

  function currentOwner() {
    try {
      if (typeof hasVisibleCc98GuestLoginEntry === "function" && hasVisibleCc98GuestLoginEntry()) return "";
      return core.uid(typeof getCurrentReadLaterUserId === "function" ? getCurrentReadLaterUserId() : "");
    } catch { return ""; }
  }
  function storage(method, argument) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (value, error) => { if (done) return; done = true; error ? reject(new Error(error.message || String(error))) : resolve(value); };
      try {
        const result = chrome.storage.local[method](argument, value => finish(value, chrome.runtime.lastError));
        result?.then?.(value => finish(value), error => finish(undefined, error));
      } catch (error) { finish(undefined, error); }
    });
  }
  function pinIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", "M9 3h6l-1 7 4 4v2H6v-2l4-4-1-7ZM12 16v5");
    svg.append(path); return svg;
  }
  function rowUid(row) { return core.uid((row.id || "").match(/^contact_(\d+)$/)?.[1] || row.dataset.cc98PinnedUid); }
  function decorate(person, row, id, pinned) {
    let button = person.querySelector(":scope > .cc98-message-pin");
    if (!button) {
      button = document.createElement("button"); button.type = "button"; button.className = "cc98-message-pin"; button.append(pinIcon());
      button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); toggle(rowUid(row), person.querySelector(".message-message-pName")?.textContent || ""); });
      // Prevent the native React contact handler from selecting/reading a chat.
      button.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); });
      person.append(button);
    }
    const label = `${pinned ? "取消置顶" : "置顶私信"}：${person.querySelector(".message-message-pName")?.textContent || `UID ${id}`}`;
    if (button.title !== label) { button.title = label; button.setAttribute("aria-label", label); }
    button.setAttribute("aria-pressed", String(pinned));
    button.disabled = !owner || !loaded || busy;
    row.classList.toggle("cc98-message-is-pinned", pinned);
  }
  function makeShortcut(pin) {
    const row = document.createElement("div"); row.dataset.cc98PinnedUid = pin.uid; row.className = "cc98-message-pin-shortcut";
    const person = document.createElement("div"); person.className = "message-message-person";
    const avatar = document.createElement("span"); avatar.className = "cc98-message-pin-avatar"; avatar.textContent = Array.from(pin.name || "私")[0]; avatar.setAttribute("aria-hidden", "true");
    const info = document.createElement("div"); info.className = "message-message-pInfo";
    const name = document.createElement("div"); name.className = "message-message-pName"; name.textContent = pin.name || `UID ${pin.uid}`;
    const preview = document.createElement("div"); preview.className = "message-message-pMessage"; preview.textContent = "已置顶 · 打开私信";
    info.append(name, preview); person.append(avatar, info); row.append(person);
    row.setAttribute("role", "link"); row.tabIndex = 0;
    const open = () => { if (typeof navigateToRebuiltHref === "function") navigateToRebuiltHref(`/message/message?id=${pin.uid}`); };
    row.addEventListener("click", event => { if (event.defaultPrevented || event.target.closest("button")) return; open(); });
    row.addEventListener("keydown", event => { if (event.key === "Enter" && event.target === row) { event.preventDefault(); open(); } });
    return row;
  }
  function render() {
    if (!root?.isConnected) return;
    const enabled = typeof lastSettings === "undefined" || (lastSettings?.enabled && lastSettings?.rebuildUi);
    root.querySelectorAll(".message-message-pList").forEach(list => {
      list.classList.toggle("cc98-message-pins-list", Boolean(enabled));
      if (!enabled) {
        list.querySelectorAll(".cc98-message-pin, .cc98-message-pin-shortcut").forEach(node => node.remove());
        [...list.children].forEach(row => { row.style.removeProperty("order"); row.classList.remove("cc98-message-is-pinned"); });
        return;
      }
      const native = new Map([...list.children].filter(row => row.id.startsWith("contact_")).map(row => [rowUid(row), row]));
      list.querySelectorAll(":scope > .cc98-message-pin-shortcut").forEach(row => { if (native.has(rowUid(row)) || !pins.some(pin => pin.uid === rowUid(row))) row.remove(); });
      pins.forEach(pin => { if (!native.has(pin.uid) && ![...list.children].some(row => row.dataset.cc98PinnedUid === pin.uid)) list.append(makeShortcut(pin)); });
      [...list.children].forEach(row => {
        const id = rowUid(row), person = row.querySelector(":scope > .message-message-person");
        const index = pins.findIndex(pin => pin.uid === id);
        if (person && id) decorate(person, row, id, index >= 0);
        const order = String(index >= 0 ? index : 10000);
        if (row.style.order !== order) row.style.order = order;
      });
    });
  }
  async function toggle(id, name) {
    if (!owner || !loaded || busy || !core.uid(id)) return;
    const capturedOwner = owner, token = generation;
    busy = true; render();
    try {
      const key = core.storageKey(capturedOwner), stored = await storage("get", key);
      if (token !== generation || currentOwner() !== capturedOwner) return;
      const current = core.normalize(stored[key]);
      const next = current.some(pin => pin.uid === id) ? current.filter(pin => pin.uid !== id) : core.normalize([{ uid: id, name }, ...current]);
      await storage("set", { [key]: next });
      if (token === generation) pins = next;
    } catch (error) {
      if (typeof showRebuiltTransientToast === "function") showRebuiltTransientToast(root, `置顶保存失败：${error.message}`);
    } finally { if (token === generation) { busy = false; render(); } }
  }
  function mount(source) {
    root = source;
    const next = currentOwner();
    if (next !== owner || !loaded) {
      if (next === owner && busy) { render(); return; }
      owner = next; const token = ++generation; pins = []; loaded = false; busy = true; render();
      if (!owner) { loaded = true; busy = false; render(); return; }
      storage("get", core.storageKey(owner)).then(result => {
        if (token !== generation) return;
        pins = core.normalize(result[core.storageKey(owner)]); loaded = true;
      }).catch(() => { if (token === generation) loaded = true; }).finally(() => { if (token === generation) { busy = false; render(); } });
      return;
    }
    render();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const change = changes[core.storageKey(owner)];
    if (change) { generation += 1; pins = core.normalize(change.newValue); loaded = true; busy = false; render(); }
    if (changes.cc98ComfortSettings && root) queueMicrotask(() => mount(root));
  });
  globalThis.CC98RebornPrivateMessagePins = Object.freeze({ mount });
})();
