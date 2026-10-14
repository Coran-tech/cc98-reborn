(function () {
  "use strict";

  const core = globalThis.CC98RebornFavoriteShareCore;
  const serviceFactory = globalThis.CC98RebornFavoriteShareService;
  let active = null;

  function element(tag, className, text, key) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    if (key) node.dataset.favoriteShare = key;
    return node;
  }

  function button(text, key, action) {
    const node = element("button", "cc98-favorite-share-button", text, key);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }

  function scope() {
    return `${location.origin}:${getCc98AccountId(getStoredCc98UserInfo()) || "guest"}`;
  }

  function route() {
    return getCurrentCc98RoutePath();
  }

  function apiBase() {
    // Never accept an API host from the imported string or transmit the forum
    // token to a configurable third-party endpoint.
    if (/^(?:127\.0\.0\.1|localhost)$/.test(location.hostname)) return location.origin;
    if (/(?:^|\.)webvpn\.zju\.edu\.cn$/.test(location.hostname)) {
      return "https://webvpn.zju.edu.cn/https/77726476706e69737468656265737421f1e748d22433310830079bab";
    }
    if (/^(?:www\.)?cc98\.org$/.test(location.hostname)) return "https://api.cc98.org";
    throw new Error("请在 CC98 收藏页面使用此功能");
  }

  function assertSession(session) {
    if (active !== session || scope() !== session.scope || route() !== session.route
      || localStorage.getItem("accessToken") !== session.tokenSnapshot) {
      const error = new Error("页面或登录账号已变化，请重新打开分享收藏夹");
      error.code = "ACCOUNT_CHANGED";
      error.status = 401;
      throw error;
    }
  }

  function authorization() {
    const value = String(localStorage.getItem("accessToken") || "").replace(/^str-/, "");
    const expiration = Number(localStorage.getItem("accessToken_expirationTime") || 0);
    if (!/^Bearer\s+\S+$/i.test(value) || (expiration && expiration * 1000 <= Date.now())) {
      const error = new Error("登录已过期，请刷新 CC98 页面后重试");
      error.status = 401;
      throw error;
    }
    return value;
  }

  function makeService(session) {
    return serviceFactory.create({
      request: async (path, options = {}) => {
        assertSession(session);
        const method = options.method || "GET";
        const allowed = method === "GET"
          ? /^\/(?:me\/favorite-topic-group|topic\/me\/favorite\?[^#]*|topic\/\d+\/isfavorite)$/.test(path)
          : method === "PUT" && /^\/me\/favorite\/\d+\?groupid=\d+$/.test(path);
        if (!allowed) throw new Error("无效的收藏请求");
        const response = await fetch(`${apiBase()}${path}`, {
          method, signal: options.signal, headers: { Authorization: authorization(), Accept: "application/json" },
          credentials: /(?:^|\.)webvpn\.zju\.edu\.cn$/.test(location.hostname) ? "include" : "same-origin",
          redirect: "error", cache: "no-store"
        });
        assertSession(session);
        return response;
      }
    });
  }

  function setStatus(session, message, error = false) {
    session.status.textContent = message;
    session.status.classList.toggle("is-error", error);
  }

  function hasSelectedGroup(session, select) {
    return session.groups.some((group) => String(group.id) === select.value);
  }

  function setBusy(session, busy) {
    session.busy = busy;
    session.panel.setAttribute("aria-busy", String(busy));
    for (const control of session.panel.querySelectorAll("button, select, textarea")) {
      const key = control.dataset.favoriteShare;
      if (["close", "stop", "output"].includes(key)) continue;
      control.disabled = busy;
    }
    session.stop.hidden = !busy;
    session.stop.disabled = false;
    if (!busy) {
      session.exportButton.disabled = !hasSelectedGroup(session, session.exportGroup);
      session.targetGroup.disabled = !session.groups.length;
      session.exportGroup.disabled = !session.groups.length;
      session.importButton.disabled = !hasSelectedGroup(session, session.targetGroup) || !session.decoded?.topics.length;
      session.copy.disabled = !session.output.value;
      session.retry.hidden = !session.retryTopics.length;
      session.retry.disabled = !hasSelectedGroup(session, session.targetGroup) || !session.retryTopics.length;
    }
  }

  async function operation(session, action) {
    if (session.busy) return;
    session.controller = new AbortController();
    setBusy(session, true);
    try {
      assertSession(session);
      await action(session.controller.signal);
    } catch (error) {
      if (active === session) setStatus(session, error.name === "AbortError" ? "已停止" : error.message, error.name !== "AbortError");
    } finally {
      if (active === session) setBusy(session, false);
    }
  }

  function fillGroups(session) {
    const requested = Number(session.route.match(/\/group\/(\d+)/)?.[1] || 0);
    for (const select of [session.exportGroup, session.targetGroup]) {
      const previous = select.value;
      const hadOptions = select.options.length > 0;
      select.replaceChildren();
      for (const group of session.groups) {
        const option = element("option", "", `${group.name}${Number.isFinite(group.count) ? `（${group.count}）` : ""}`);
        option.value = String(group.id);
        select.append(option);
      }
      if (hadOptions && session.groups.some((group) => String(group.id) === previous)) {
        select.value = previous;
      } else if (hadOptions) {
        const placeholder = element("option", "", "原分组已不可用，请重新选择");
        placeholder.value = "";
        placeholder.disabled = true;
        select.prepend(placeholder);
        select.value = "";
        if (select === session.targetGroup) {
          session.retryTopics = [];
          session.retry.hidden = true;
          session.view.hidden = true;
          session.result.replaceChildren();
        } else {
          session.output.value = "";
        }
      } else if (session.groups.some((group) => Number(group.id) === requested)) {
        select.value = String(requested);
      }
    }
  }

  function loadGroups(session) {
    return operation(session, async (signal) => {
      setStatus(session, "正在读取收藏分组…");
      session.groups = await session.service.listGroups({ signal });
      assertSession(session);
      fillGroups(session);
      setStatus(session, session.groups.length ? "选择收藏分组，或粘贴分享字符串开始导入。" : "没有可用的收藏分组，请刷新页面后重试。", !session.groups.length);
    });
  }

  function exportGroup(session) {
    return operation(session, async (signal) => {
      session.output.value = "";
      const id = Number(session.exportGroup.value);
      const group = session.groups.find((item) => Number(item.id) === id);
      if (!group) throw new Error("请选择要分享的收藏分组");
      setStatus(session, "正在读取完整收藏分组…");
      const topics = await session.service.exportGroup(id, { signal,
        onProgress: (progress) => setStatus(session, `正在读取「${group.name}」：已读取 ${progress.loaded} 条…`)
      });
      assertSession(session);
      session.output.value = core.encode({ name: group.name, topics });
      setStatus(session, `已生成「${group.name}」的分享字符串，共 ${topics.length} 条收藏。`);
    });
  }

  async function copyOutput(session) {
    try {
      if (!session.output.value) return;
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(session.output.value);
      setStatus(session, "分享字符串已复制");
    } catch {
      if (active !== session) return;
      session.output.focus();
      session.output.select();
      if (document.execCommand("copy")) setStatus(session, "分享字符串已复制");
      else setStatus(session, "字符串已选中，请按 Ctrl+C 复制。");
    }
  }

  function resetPreview(session) {
    session.decoded = null;
    session.retryTopics = [];
    session.preview.replaceChildren();
    session.result.replaceChildren();
    session.importButton.disabled = true;
    session.retry.hidden = true;
    session.view.hidden = true;
  }

  function decodeInput(session) {
    resetPreview(session);
    try {
      const data = core.decode(session.input.value);
      session.decoded = data;
      const heading = element("p", "cc98-favorite-share-preview-title", `${data.name || "未命名收藏夹"} · ${data.topics.length} 条收藏`);
      const list = element("ol", "cc98-favorite-share-list");
      for (const topic of data.topics.slice(0, 50)) {
        const row = element("li");
        const link = element("a", "", topic.title || `帖子 ${topic.id}`);
        link.href = makeAbsoluteCc98Url(`/topic/${topic.id}`);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        row.append(link, element("span", "cc98-favorite-share-topic-id", `#${topic.id}`));
        list.append(row);
      }
      session.preview.append(heading, list);
      if (data.topics.length > 50) session.preview.append(element("p", "cc98-favorite-share-hint", "仅预览前 50 条，导入包含全部帖子。"));
      session.importButton.disabled = !data.topics.length || !hasSelectedGroup(session, session.targetGroup);
      setStatus(session, data.topics.length
        ? `解析成功${data.duplicates ? `，已合并 ${data.duplicates} 条重复记录` : ""}。请选择目标分组后开始导入。`
        : "这个分享收藏夹是空的。");
    } catch (error) {
      setStatus(session, error.message, true);
    }
  }

  function importTopics(session, retry = false) {
    const topics = retry ? session.retryTopics : session.decoded?.topics;
    if (!topics?.length) return;
    const groupId = Number(session.targetGroup.value);
    const group = session.groups.find((item) => Number(item.id) === groupId);
    if (!group) return setStatus(session, "请选择目标收藏分组", true);
    return operation(session, async (signal) => {
      session.result.replaceChildren();
      session.retryTopics = [];
      session.retry.hidden = true;
      setStatus(session, `正在导入到「${group.name}」…`);
      const result = await session.service.importTopics(topics, groupId, { signal,
        onProgress: (progress) => setStatus(session, `正在导入 ${progress.completed}/${progress.total}：新增 ${progress.added}，已有 ${progress.skipped}，失败 ${progress.failed}`)
      });
      if (active !== session) return;
      const remaining = [...result.failed, ...result.pending];
      session.retryTopics = [...new Map(remaining.map((item) => [String(item.id), { id: String(item.id), title: item.title || "" }])).values()];
      session.targetId = groupId;
      session.view.hidden = !result.added.length && !result.skipped.length;
      const stopped = result.stopped ? result.reason : "";
      const summary = `${stopped ? "已暂停" : "导入完成"}：新增 ${result.added.length} 条，已有 ${result.skipped.length} 条，失败 ${result.failed.length} 条，待处理 ${result.pending.length} 条。`;
      setStatus(session, summary + (stopped ? ` ${stopped}` : ""), Boolean(result.failed.length || stopped));
      if (result.retryAfter) session.result.append(element("p", "cc98-favorite-share-hint", `请等待 ${result.retryAfter} 秒后再重试。`));
      if (remaining.length) {
        const details = element("details", "cc98-favorite-share-failures");
        details.append(element("summary", "", `查看失败或待处理的帖子（${remaining.length}）`));
        const list = element("ul", "cc98-favorite-share-list");
        remaining.slice(0, 100).forEach((item) => list.append(element("li", "", `${item.title || `帖子 ${item.id}`} · ${item.reason || "待处理"}`)));
        details.append(list);
        if (remaining.length > 100) details.append(element("p", "cc98-favorite-share-hint", "仅显示前 100 条；重试会处理全部失败及待处理的帖子。"));
        session.result.append(details);
      }
    });
  }

  function close() {
    if (!active) return;
    const session = active;
    active = null;
    session.controller?.abort();
    clearInterval(session.guard);
    document.removeEventListener("keydown", session.onKeydown, true);
    session.layer.remove();
    session.trigger?.focus({ preventScroll: true });
  }

  function open(trigger) {
    if (!core || !serviceFactory) return;
    close();
    const layer = element("div", "cc98-favorite-share-layer");
    const panel = element("section", "cc98-favorite-share-dialog");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "cc98-favorite-share-title");
    const header = element("header", "cc98-favorite-share-header");
    const title = element("h2", "", "分享收藏夹");
    title.id = "cc98-favorite-share-title";
    const closeButton = button("×", "close", close);
    closeButton.setAttribute("aria-label", "关闭分享收藏夹");
    header.append(title, closeButton);
    const tabs = element("nav", "cc98-favorite-share-tabs");
    tabs.setAttribute("aria-label", "分享方式");
    const body = element("div", "cc98-favorite-share-body");
    const exportPanel = element("section", "cc98-favorite-share-section");
    const importPanel = element("section", "cc98-favorite-share-section");
    importPanel.hidden = true;
    const session = { layer, panel, trigger, scope: scope(), route: route(), tokenSnapshot: localStorage.getItem("accessToken"),
      groups: [], retryTopics: [], decoded: null, busy: false };
    active = session;
    const switchTab = (mode) => {
      if (session.busy) return;
      exportPanel.hidden = mode !== "export";
      importPanel.hidden = mode !== "import";
      exportTab.setAttribute("aria-pressed", String(mode === "export"));
      importTab.setAttribute("aria-pressed", String(mode === "import"));
    };
    const exportTab = button("导出收藏夹", "tab-export", () => switchTab("export"));
    const importTab = button("导入收藏夹", "tab-import", () => switchTab("import"));
    exportTab.setAttribute("aria-pressed", "true");
    importTab.setAttribute("aria-pressed", "false");
    tabs.append(exportTab, importTab);

    const field = (parent, labelText, tag, key) => {
      const label = element("label", "cc98-favorite-share-field");
      const control = element(tag, "", undefined, key);
      label.append(element("span", "", labelText), control);
      parent.append(label);
      return control;
    };
    session.exportGroup = field(exportPanel, "要分享的收藏分组", "select", "export-group");
    exportPanel.append(element("p", "cc98-favorite-share-hint", "导出所选分组的全部分页，包含分组名称、帖子编号和标题。"));
    session.exportButton = button("生成分享字符串", "export", () => exportGroup(session));
    exportPanel.append(session.exportButton);
    session.output = field(exportPanel, "分享字符串", "textarea", "output");
    session.output.readOnly = true;
    session.output.rows = 5;
    session.output.placeholder = "生成后即可复制给其他人";
    session.copy = button("复制字符串", "copy", () => copyOutput(session));
    exportPanel.append(session.copy);
    session.exportGroup.addEventListener("change", () => { session.output.value = ""; setBusy(session, false); });

    session.input = field(importPanel, "粘贴分享字符串", "textarea", "input");
    session.input.rows = 5;
    session.input.maxLength = core.MAX_SHARE_LENGTH;
    session.input.placeholder = "CC98F1.…";
    session.input.spellcheck = false;
    session.input.addEventListener("input", () => { resetPreview(session); setStatus(session, "点击解析，查看分享收藏夹内容。"); });
    importPanel.append(button("解析字符串", "decode", () => decodeInput(session)));
    session.preview = element("div", "cc98-favorite-share-preview", undefined, "preview");
    importPanel.append(session.preview);
    session.targetGroup = field(importPanel, "导入到收藏分组", "select", "target-group");
    session.targetGroup.addEventListener("change", () => {
      session.retryTopics = [];
      session.retry.hidden = true;
      session.view.hidden = true;
      session.result.replaceChildren();
      setBusy(session, false);
    });
    importPanel.append(element("p", "cc98-favorite-share-hint", "已收藏的帖子会跳过，并保留原分组。"));
    const actions = element("div", "cc98-favorite-share-actions");
    session.importButton = button("开始导入", "import", () => importTopics(session));
    session.retry = button("重试失败 / 继续剩余", "retry", () => importTopics(session, true));
    session.retry.hidden = true;
    session.view = button("查看目标分组", "view", () => {
      const href = makeAbsoluteCc98Url(`/usercenter/myfavorites/order/2/group/${session.targetId}/1`);
      close();
      location.assign(href);
    });
    session.view.hidden = true;
    actions.append(session.importButton, session.retry, session.view);
    importPanel.append(actions);
    session.result = element("div", "cc98-favorite-share-result", undefined, "result");
    importPanel.append(session.result);
    body.append(exportPanel, importPanel);
    const footer = element("footer", "cc98-favorite-share-footer");
    session.status = element("p", "cc98-favorite-share-status", "", "status");
    session.status.setAttribute("role", "status");
    session.status.setAttribute("aria-live", "polite");
    session.stop = button("停止", "stop", () => {
      session.controller?.abort();
      session.stop.disabled = true;
      setStatus(session, "正在停止；已完成的收藏会保留。", false);
    });
    const reloadGroups = button("刷新分组", "reload-groups", () => loadGroups(session));
    footer.append(session.status, session.stop, reloadGroups);
    panel.append(header, tabs, body, footer);
    layer.append(panel);
    layer.addEventListener("click", (event) => { if (event.target === layer) close(); });
    layer.addEventListener("wheel", (event) => {
      if (!body.contains(event.target)) event.preventDefault();
      event.stopPropagation();
    }, { passive: false });
    session.onKeydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll("button, select, textarea, a[href], summary")].filter((node) => !node.disabled && node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", session.onKeydown, true);
    session.guard = setInterval(() => {
      if (scope() !== session.scope || route() !== session.route || localStorage.getItem("accessToken") !== session.tokenSnapshot
        || !layer.isConnected || lastSettings?.enabled === false) close();
    }, 500);
    session.service = makeService(session);
    document.body.append(layer);
    closeButton.focus({ preventScroll: true });
    loadGroups(session);
  }

  function mount(router) {
    const existing = router.querySelector("[data-favorite-share-open]");
    if (!/^\/usercenter\/myfavorites(?:\/|$)/i.test(route())) {
      existing?.remove();
      return;
    }
    if (existing || !core || !serviceFactory) return;
    const trigger = button("分享收藏夹", "open", () => open(trigger));
    trigger.dataset.favoriteShareOpen = "true";
    trigger.classList.add("cc98-favorite-share-entry");
    const operator = router.querySelector(".user-post-operator");
    if (operator) operator.append(trigger);
    else router.prepend(trigger);
  }

  globalThis.CC98RebornFavoriteShare = { open, close, mount };
})();
