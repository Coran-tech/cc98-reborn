(() => {
  "use strict";

  const DEFAULT_SETTINGS = {
    enabled: true, theme: "soft", density: "comfortable", fontScale: 100, emojiScale: 100,
    neutralizeNativeSkin: true, rebuildUi: true, roundUi: true, cornerRadius: 10,
    prewarmPostImages: false, imageLoadDuration: 2100, previsitFirstPageForTopicImages: false,
    openLinksInNewTab: false, sideTopbar: false, replyRebornTail: true, minimalMode: false,
    homeHotOnly: false, expandTopicCardsByDefault: false, softenAvatars: true, hideSticky: false,
    focusReading: false, aiSearchSuggestEnabled: false, aiSearchSuggestProvider: "openai",
    aiSearchSuggestEndpoint: "", aiSearchSuggestModel: "", aiSearchSuggestApiKey: "",
    externalAiSearchConsent: false, advancedFuzzySearch: false, blockedBoards: "",
    blockedTitleKeywords: "", blockedUserIds: "", placeholderText: "已根据你的屏蔽规则折叠一条内容"
  };
  const $ = (id) => document.getElementById(id);
  const state = {
    token: sessionStorage.getItem("cc98-local-admin-token") || "",
    users: [],
    boards: [],
    extensionValues: {},
    columns: []
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }
  function headers(json = false) {
    return {
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(json ? { "Content-Type": "application/json" } : {})
    };
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {
      cache: "no-store",
      ...options,
      headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) }
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("json") ? await response.json() : await response.text();
    if (!response.ok) throw new Error(body?.error || body || `HTTP ${response.status}`);
    return body;
  }
  function show(id, visible) { $(id).classList.toggle("hidden", !visible); }
  function setMessage(id, value, ok = false) {
    const element = $(id);
    element.textContent = value || "";
    element.className = `message${value ? ok ? " ok" : " error" : ""}`;
  }
  function formatDate(value) {
    if (!value) return "";
    try { return new Date(value).toLocaleString("zh-CN", { hour12: false }); } catch { return String(value); }
  }
  function confirmAction(message) {
    const dialog = $("confirm-template").content.firstElementChild.cloneNode(true);
    dialog.querySelector("[data-confirm-message]").textContent = message;
    document.body.append(dialog);
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => {
        resolve(dialog.returnValue === "confirm");
        dialog.remove();
      }, { once: true });
      dialog.showModal();
    });
  }
  function setLoggedIn(value) {
    show("login-view", !value);
    show("console-view", value);
    show("logout", value);
  }
  function fillUserSelect(select, selected) {
    select.innerHTML = state.users.map((user) => `<option value="${user.id}"${String(user.id) === String(selected) ? " selected" : ""}>${escapeHtml(user.name)} · UID ${user.id}</option>`).join("");
  }
  function setPanel(name) {
    document.querySelectorAll("[data-panel]").forEach((button) => button.classList.toggle("active", button.dataset.panel === name));
    document.querySelectorAll("[data-panel-content]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panelContent === name));
    if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  }

  async function loadOverview() {
    try {
      const [health, selected] = await Promise.all([api("/__test/health"), api("/__local/current-user")]);
      const backend = health.backend || {};
      const values = [
        ["进程", health.pid], ["运行时间", `${health.uptimeSeconds}s`], ["请求", health.requests],
        ["用户", backend.users], ["版面", backend.boards], ["主题", backend.topics],
        ["回复", backend.posts], ["会话", backend.activeSessions], ["数据版本", `schema ${backend.schemaVersion}`]
      ];
      $("metrics").innerHTML = values.map(([label, value]) => `<div class="metric"><small>${label}</small><strong>${escapeHtml(value ?? "--")}</strong></div>`).join("");
      fillUserSelect($("active-user"), selected.userId);
      $("server-pill").textContent = "本地服务正常";
      $("server-pill").classList.add("ok");
      setMessage("overview-message", `最近写入：${formatDate(backend.updatedAt)}`, true);
    } catch (error) {
      $("server-pill").textContent = "服务异常";
      $("server-pill").classList.remove("ok");
      setMessage("overview-message", error.message);
    }
  }

  async function loadUsers() {
    state.users = await api("/auth/users");
    const currentExtensionUser = $("extension-user").value;
    fillUserSelect($("extension-user"), currentExtensionUser || state.users[0]?.id);
    fillUserSelect($("active-user"), $("active-user").value || state.users[0]?.id);
    $("user-list").innerHTML = state.users.map((user) => {
      const displayTitle = String(user.displayTitle || "").trim();
      const titles = [
        user.privilege ? `<span class="tag ${user.privilege === "管理员" ? "admin" : ""}">${escapeHtml(user.privilege)}</span>` : "",
        displayTitle && displayTitle !== user.privilege ? `<span class="tag">${escapeHtml(displayTitle)}</span>` : "",
        ...(user.boardMasterTitles || []).map((title) => `<span class="tag mod">${escapeHtml(title.boardName)}版主</span>`)
      ].join("");
      return `<tr data-user-id="${user.id}">
        <td><strong>${escapeHtml(user.name)}</strong><br><small>UID ${user.id}</small></td>
        <td>${titles}</td>
        <td><div class="role-list">
          <label><input type="checkbox" data-role="siteAdmin" ${(user.roles || []).includes("siteAdmin") ? "checked" : ""}>站务</label>
          <label><input type="checkbox" data-role="boardModerator" ${(user.roles || []).includes("boardModerator") ? "checked" : ""}>版主</label>
        </div></td>
        <td><select data-user-status><option value="active"${user.status === "active" ? " selected" : ""}>正常</option><option value="suspended"${user.status === "suspended" ? " selected" : ""}>暂停</option><option value="disabled"${user.status === "disabled" ? " selected" : ""}>禁用</option></select></td>
        <td><div class="form-actions"><button data-save-user>保存权限</button><button data-edit-title>编辑头衔</button><button data-reset-password>重置密码</button><button data-user-sessions>会话</button></div></td>
      </tr>`;
    }).join("");
    await loadRegistration();
  }

  async function loadRegistration() {
    const config = await api("/auth/registration");
    $("registration-enabled").checked = config.enabled !== false;
    $("registration-invite").checked = Boolean(config.requireInvite);
    $("registration-invite-code").value = config.inviteCode || "";
  }

  function syncRangeOutputs() {
    $("extension-form").querySelectorAll('input[type="range"]').forEach((input) => {
      const output = document.querySelector(`[data-output="${input.name}"]`);
      if (!output) return;
      output.value = input.name === "imageLoadDuration" ? `${input.value}ms` : input.name === "cornerRadius" ? `${input.value}px` : `${input.value}%`;
    });
  }
  function hydrateExtensionSettings(values) {
    const settings = { ...DEFAULT_SETTINGS, ...(values.cc98ComfortSettings || {}) };
    const form = $("extension-form");
    Object.entries(settings).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (!field) return;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value ?? "";
    });
    syncRangeOutputs();
  }
  async function loadExtension() {
    try {
      const userId = $("extension-user").value || state.users[0]?.id;
      const result = await api(`/__local/extension-storage/${userId}`);
      state.extensionValues = result.values || {};
      hydrateExtensionSettings(state.extensionValues);
      $("extension-raw").value = JSON.stringify(state.extensionValues, null, 2);
      setMessage("extension-message", `已读取 ${result.userName} 的 ${Object.keys(state.extensionValues).length} 个键，共 ${result.bytes} 字节`, true);
    } catch (error) { setMessage("extension-message", error.message); }
  }
  function readExtensionSettings() {
    const result = {};
    const form = $("extension-form");
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      const field = form.elements.namedItem(key);
      if (!field) return;
      if (field.type === "checkbox") result[key] = field.checked;
      else if (field.type === "range" || field.type === "number") result[key] = Number(field.value);
      else result[key] = field.value;
    });
    result.aiSearchSuggestEndpoint = "";
    result.aiSearchSuggestModel = "";
    result.aiSearchSuggestApiKey = "";
    result.externalAiSearchConsent = false;
    return result;
  }
  async function saveExtensionValues(values, replace = false) {
    const userId = $("extension-user").value;
    return api(`/__local/extension-storage/${userId}`, {
      method: replace ? "PUT" : "PATCH",
      body: JSON.stringify(replace ? { replace: true, values } : { values })
    });
  }

  async function loadBoards() {
    state.boards = await api("/__local/boards");
    $("topic-board").innerHTML = '<option value="0">全部版面</option>' + state.boards.filter((board) => !board.deleted).map((board) => `<option value="${board.id}">${escapeHtml(board.name)}</option>`).join("");
    $("board-list").innerHTML = state.boards.map((board) => `<article class="record" data-board-id="${board.id}">
      <div><h3>${escapeHtml(board.name)} <small>#${board.id}</small></h3><p>${board.deleted ? "已删除" : board.isLocked ? "已锁定" : "正常"} · 主题 ${board.topicCount} · 回复 ${board.postCount}</p><p>版主：${(board.moderatorUsers || []).map((user) => escapeHtml(user.name)).join("、") || "未设置"}</p></div>
      <div class="form-actions">${board.deleted ? '<button data-restore-board>恢复版面</button>' : `<button data-edit-board>编辑</button><select data-moderator-user><option value="">选择用户</option>${state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}</select><button data-add-moderator>添加版主</button><button data-remove-moderator>移除版主</button><button data-delete-board class="danger">删除</button>`}</div>
    </article>`).join("");
  }

  function fillBoardForm(board = null) {
    $("board-id").value = board?.id || "";
    $("board-name").value = board?.name || "";
    $("board-description").value = board?.bigPaper || board?.description || "";
    $("board-anonymous").value = String(board?.anonymousState || 0);
    $("board-entry").checked = board?.canEntry !== false;
    $("board-vote").checked = board?.allowVote !== false;
    $("board-locked").checked = Boolean(board?.isLocked);
  }

  async function loadTopics() {
    try {
      const params = new URLSearchParams({ from: "0", size: "80" });
      if ($("topic-keyword").value.trim()) params.set("keyword", $("topic-keyword").value.trim());
      if ($("topic-board").value !== "0") params.set("boardId", $("topic-board").value);
      const result = await api(`/__local/topics?${params}`);
      $("topic-list").innerHTML = result.data.map((topic) => `<tr data-topic-id="${topic.id}">
        <td><a href="/topic/${topic.id}/1" target="_blank" rel="noopener">${escapeHtml(topic.title)}</a><br><small>#${topic.id} · ${topic.replyCount} 回复 · ${topic.hitCount} 浏览</small></td>
        <td>${escapeHtml(topic.boardName)}</td>
        <td>${escapeHtml(topic.userName || "匿名")}<br><small>${formatDate(topic.time)}</small></td>
        <td>${topic.deleted ? '<span class="tag admin">已删除</span>' : ""}${topic.state === 1 ? '<span class="tag admin">锁定</span>' : ""}${topic.topState ? '<span class="tag">置顶</span>' : ""}${topic.bestState ? '<span class="tag mod">精华</span>' : ""}</td>
        <td><div class="form-actions">
          ${topic.deleted ? '<button data-topic-action="restore">恢复</button>' : '<button data-topic-action="lock">' + (topic.state === 1 ? "解锁" : "锁定") + '</button><button data-topic-action="best">' + (topic.bestState ? "取消精华" : "设为精华") + '</button><button data-topic-action="top">' + (topic.topState ? "取消置顶" : "置顶") + '</button><button data-topic-action="delete" class="danger">删除</button>'}
        </div></td>
      </tr>`).join("");
      setMessage("topic-message", `共找到 ${result.count} 个主题`, true);
    } catch (error) { setMessage("topic-message", error.message); }
  }

  async function loadHomepage() {
    const config = await api("/__local/site-config");
    $("announcement").value = config.announcement || "";
    state.columns = [
      ...(config.indexColumns || []),
      ...(config.advertisements || []),
      ...(config.specialOffers || [])
    ];
    $("column-list").innerHTML = state.columns.map((column) => `<article class="record" data-column-id="${column.id}">
      <div><h3>${escapeHtml(column.title || "未命名栏目")}</h3><p>类型 ${column.type} · ${column.enable === false ? "停用" : "启用"} · ${escapeHtml(column.url || "无链接")}</p></div>
      <div class="form-actions"><button data-edit-column>编辑</button><button data-delete-column class="danger">删除</button></div>
    </article>`).join("");
  }
  function fillColumnForm(column = null) {
    $("column-id").value = column?.id || "";
    $("column-type").value = String(column?.type || 1);
    $("column-title").value = column?.title || "";
    $("column-url").value = column?.url || "";
    $("column-image").value = column?.imageUrl || "";
    $("column-content").value = column?.content || "";
    $("column-enabled").checked = column?.enable !== false;
  }

  async function loadSessions() {
    const sessions = await api("/auth/sessions");
    $("session-list").innerHTML = sessions.length ? sessions.map((session) => `<div><strong>${escapeHtml(session.userName)}</strong> · ${formatDate(session.lastSeenAt)} <button data-revoke-session="${escapeHtml(session.id)}">撤销</button></div>`).join("") : "<div>没有活动会话</div>";
  }

  async function bootstrap() {
    if (!state.token) return setLoggedIn(false);
    try {
      const session = await api("/auth/session");
      if (!session.authenticated || !(session.user.roles || []).includes("siteAdmin")) throw new Error("permission_denied");
      setLoggedIn(true);
      await loadUsers();
      await Promise.all([loadOverview(), loadExtension(), loadBoards(), loadTopics(), loadHomepage()]);
    } catch {
      state.token = "";
      sessionStorage.removeItem("cc98-local-admin-token");
      setLoggedIn(false);
    }
  }

  document.querySelector(".section-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-panel]");
    if (button) setPanel(button.dataset.panel);
  });
  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: $("username").value, password: $("password").value })
      });
      if (!(result.user?.roles || []).includes("siteAdmin")) throw new Error("该账号不是站务管理员");
      state.token = result.access_token;
      sessionStorage.setItem("cc98-local-admin-token", state.token);
      setLoggedIn(true);
      setMessage("login-message", "");
      await loadUsers();
      await Promise.all([loadOverview(), loadExtension(), loadBoards(), loadTopics(), loadHomepage()]);
    } catch (error) { setMessage("login-message", error.message); }
  });
  $("logout").addEventListener("click", async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    state.token = "";
    sessionStorage.removeItem("cc98-local-admin-token");
    setLoggedIn(false);
  });
  $("refresh-overview").addEventListener("click", loadOverview);
  $("apply-active-user").addEventListener("click", async () => {
    try {
      await api("/__local/current-user", { method: "PUT", body: JSON.stringify({ userId: Number($("active-user").value) }) });
      setMessage("overview-message", "模拟登录账号已切换，刷新论坛标签后生效。", true);
      await loadOverview();
    } catch (error) { setMessage("overview-message", error.message); }
  });
  $("extension-form").addEventListener("input", syncRangeOutputs);
  $("extension-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await saveExtensionValues({ cc98ComfortSettings: readExtensionSettings() });
      state.extensionValues = result.values;
      $("extension-raw").value = JSON.stringify(result.values, null, 2);
      setMessage("extension-message", "插件设置已保存并推送到论坛标签。", true);
    } catch (error) { setMessage("extension-message", error.message); }
  });
  $("extension-user").addEventListener("change", loadExtension);
  $("reload-extension").addEventListener("click", loadExtension);
  $("reset-extension-settings").addEventListener("click", () => { hydrateExtensionSettings({ cc98ComfortSettings: DEFAULT_SETTINGS }); });
  $("save-extension-raw").addEventListener("click", async () => {
    try {
      const values = JSON.parse($("extension-raw").value);
      if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("根节点必须是 JSON 对象");
      const result = await saveExtensionValues(values, true);
      state.extensionValues = result.values;
      hydrateExtensionSettings(result.values);
      $("extension-raw").value = JSON.stringify(result.values, null, 2);
      setMessage("extension-message", "原始存储已覆盖。", true);
    } catch (error) { setMessage("extension-message", error.message); }
  });
  $("clear-extension-storage").addEventListener("click", async () => {
    if (!await confirmAction("重置该用户的全部插件本地数据？稍后再看、搜索历史等也会清除。")) return;
    try {
      await api(`/__local/extension-storage/${$("extension-user").value}`, { method: "DELETE" });
      await loadExtension();
      setMessage("extension-message", "插件存储已恢复为本地默认值。", true);
    } catch (error) { setMessage("extension-message", error.message); }
  });
  $("register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/auth/register", { method: "POST", body: JSON.stringify({ username: $("new-username").value, password: $("new-password").value, adminCreate: true }) });
      $("new-username").value = ""; $("new-password").value = "";
      await loadUsers();
      setMessage("account-message", "账号创建成功。", true);
    } catch (error) { setMessage("account-message", error.message); }
  });
  $("reload-users").addEventListener("click", loadUsers);
  $("user-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const row = button.closest("[data-user-id]");
    const userId = Number(row.dataset.userId);
    try {
      if (button.hasAttribute("data-save-user")) {
        const roles = ["member", ...[...row.querySelectorAll("[data-role]:checked")].map((input) => input.dataset.role)];
        await api(`/auth/users/${userId}/roles`, { method: "PUT", body: JSON.stringify({ roles }) });
        await api(`/auth/users/${userId}/status`, { method: "PUT", body: JSON.stringify({ status: row.querySelector("[data-user-status]").value }) });
        setMessage("account-message", "角色与状态已保存。", true);
      } else if (button.hasAttribute("data-edit-title")) {
        const user = state.users.find((item) => item.id === userId);
        const displayTitle = prompt("输入展示头衔（不会授予权限）：", user?.displayTitle || "");
        if (displayTitle == null) return;
        await api(`/auth/users/${userId}/profile`, { method: "PUT", body: JSON.stringify({ displayTitle }) });
        setMessage("account-message", "展示头衔已更新。", true);
      } else if (button.hasAttribute("data-reset-password")) {
        const password = prompt("输入新密码（至少 8 位）：");
        if (!password) return;
        await api(`/auth/users/${userId}/password`, { method: "PUT", body: JSON.stringify({ password }) });
        setMessage("account-message", "密码已重置，该用户会话已撤销。", true);
      } else if (button.hasAttribute("data-user-sessions")) {
        await loadSessions();
        setPanel("accounts");
      }
      await loadUsers();
      await loadBoards();
    } catch (error) { setMessage("account-message", error.message); }
  });
  $("registration-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/auth/registration", { method: "PUT", body: JSON.stringify({
        enabled: $("registration-enabled").checked,
        requireInvite: $("registration-invite").checked,
        inviteCode: $("registration-invite-code").value.trim()
      }) });
      setMessage("account-message", "注册策略已保存。", true);
    } catch (error) { setMessage("account-message", error.message); }
  });
  $("load-sessions").addEventListener("click", loadSessions);
  $("session-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-revoke-session]");
    if (!button || !await confirmAction("撤销这个登录会话？")) return;
    try { await api(`/auth/sessions/${encodeURIComponent(button.dataset.revokeSession)}`, { method: "DELETE" }); await loadSessions(); }
    catch (error) { setMessage("account-message", error.message); }
  });
  $("board-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("board-id").value;
    const body = {
      name: $("board-name").value, description: $("board-description").value, bigPaper: $("board-description").value,
      anonymousState: Number($("board-anonymous").value), canEntry: $("board-entry").checked,
      allowVote: $("board-vote").checked, isLocked: $("board-locked").checked
    };
    try {
      await api(id ? `/board/${id}` : "/board", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
      fillBoardForm();
      await loadBoards();
      setMessage("board-message", "版面已保存。", true);
    } catch (error) { setMessage("board-message", error.message); }
  });
  $("clear-board-form").addEventListener("click", () => fillBoardForm());
  $("reload-boards").addEventListener("click", loadBoards);
  $("board-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const record = button.closest("[data-board-id]");
    const board = state.boards.find((item) => item.id === Number(record.dataset.boardId));
    const select = record.querySelector("[data-moderator-user]");
    try {
      if (button.hasAttribute("data-edit-board")) fillBoardForm(board);
      if (button.hasAttribute("data-restore-board")) {
        await api(`/__local/boards/${board.id}/restore`, { method: "PUT" });
        await loadBoards();
        setMessage("board-message", "版面已恢复。", true);
      }
      if (button.hasAttribute("data-add-moderator") || button.hasAttribute("data-remove-moderator")) {
        if (!select?.value) throw new Error("请先选择用户");
        await api(`/board/${board.id}/moderators`, { method: button.hasAttribute("data-add-moderator") ? "PUT" : "DELETE", body: JSON.stringify({ userId: Number(select.value) }) });
        await Promise.all([loadBoards(), loadUsers()]);
        setMessage("board-message", "版主归属已更新。", true);
      }
      if (button.hasAttribute("data-delete-board")) {
        if (!await confirmAction(`删除版面“${board.name}”？其主题将不再对读者可见。`)) return;
        await api(`/board/${board.id}`, { method: "DELETE" });
        await loadBoards();
        setMessage("board-message", "版面已软删除。", true);
      }
    } catch (error) { setMessage("board-message", error.message); }
  });
  $("topic-search-form").addEventListener("submit", (event) => { event.preventDefault(); void loadTopics(); });
  $("topic-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-topic-action]");
    if (!button) return;
    const topicId = Number(button.closest("[data-topic-id]").dataset.topicId);
    const action = button.dataset.topicAction;
    try {
      if (action === "restore") await api(`/__local/topics/${topicId}/restore`, { method: "PUT" });
      else if (action === "delete") {
        if (!await confirmAction("删除这个主题？这是软删除，可以从控制台恢复。")) return;
        await api(`/topic/${topicId}`, { method: "DELETE" });
      } else {
        const topic = (await api(`/__local/topics?from=0&size=200`)).data.find((item) => item.id === topicId);
        const active = action === "lock" ? topic.state === 1 : action === "best" ? topic.bestState : topic.topState;
        await api(`/topic/${topicId}/${action}`, {
          method: active ? "DELETE" : "PUT",
          body: JSON.stringify(action === "top" ? { topState: 1 } : {})
        });
      }
      await loadTopics();
      setMessage("topic-message", "主题状态已更新。", true);
    } catch (error) { setMessage("topic-message", error.message); }
  });
  $("announcement-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/__local/site-config", { method: "PUT", body: JSON.stringify({ announcement: $("announcement").value }) });
      setMessage("homepage-message", "全站公告已保存。", true);
    } catch (error) { setMessage("homepage-message", error.message); }
  });
  $("clear-home-cache").addEventListener("click", async () => {
    try { await api("/config/index/update", { method: "PUT", body: "{}" }); setMessage("homepage-message", "首页数据已标记刷新，重新打开首页即可读取。", true); }
    catch (error) { setMessage("homepage-message", error.message); }
  });
  $("column-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("column-id").value;
    const body = {
      type: Number($("column-type").value), title: $("column-title").value,
      url: $("column-url").value, imageUrl: $("column-image").value,
      content: $("column-content").value, enable: $("column-enabled").checked
    };
    try {
      await api(id ? `/index/column/${id}` : "/index/column", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
      fillColumnForm();
      await loadHomepage();
      setMessage("homepage-message", "首页栏目已保存。", true);
    } catch (error) { setMessage("homepage-message", error.message); }
  });
  $("clear-column-form").addEventListener("click", () => fillColumnForm());
  $("column-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const id = Number(button.closest("[data-column-id]").dataset.columnId);
    const column = state.columns.find((item) => item.id === id);
    if (button.hasAttribute("data-edit-column")) return fillColumnForm(column);
    if (button.hasAttribute("data-delete-column") && await confirmAction("删除这个首页栏目？")) {
      try { await api(`/index/column/${id}`, { method: "DELETE" }); await loadHomepage(); setMessage("homepage-message", "栏目已删除。", true); }
      catch (error) { setMessage("homepage-message", error.message); }
    }
  });
  $("integrity").addEventListener("click", async () => {
    try { const result = await api("/__test/integrity"); $("diagnostic-output").textContent = JSON.stringify(result, null, 2); show("diagnostic-output", true); setMessage("data-message", result.ok ? "数据完整。" : `发现 ${result.issueCount} 个问题。`, result.ok); }
    catch (error) { setMessage("data-message", error.message); }
  });
  $("backup").addEventListener("click", async () => {
    try { const result = await api("/__test/backup", { method: "POST" }); setMessage("data-message", `备份完成：${result.name}`, true); }
    catch (error) { setMessage("data-message", error.message); }
  });
  $("export").addEventListener("click", async () => {
    try {
      const response = await fetch("/__test/export", { headers: headers() });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "cc98-local-forum.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) { setMessage("data-message", error.message); }
  });
  $("load-audit").addEventListener("click", async () => {
    try {
      const result = await api("/auth/audit?from=0&size=100");
      $("audit-list").innerHTML = result.data.map((item) => `<tr><td>${formatDate(item.time)}</td><td>${escapeHtml(item.actorUserName)}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(`${item.targetType}:${item.targetId}`)}</td></tr>`).join("");
      setMessage("data-message", `读取到 ${result.count} 条审计记录。`, true);
    } catch (error) { setMessage("data-message", error.message); }
  });
  $("reset").addEventListener("click", async () => {
    if (!await confirmAction("恢复种子数据？当前论坛数据与插件存储会被覆盖。")) return;
    try { await api("/__test/reset", { method: "POST" }); await loadUsers(); await Promise.all([loadOverview(), loadExtension(), loadBoards(), loadTopics(), loadHomepage()]); setMessage("data-message", "已恢复种子数据。", true); }
    catch (error) { setMessage("data-message", error.message); }
  });
  $("restore").addEventListener("click", async () => {
    const file = $("restore-file").files[0];
    if (!file) return setMessage("data-message", "请选择 JSON 文件。");
    if (!await confirmAction("恢复选中的备份？当前数据会先自动备份。")) return;
    try {
      const data = JSON.parse(await file.text());
      const result = await api("/__test/restore", { method: "POST", body: JSON.stringify({ data }) });
      setMessage("data-message", result.integrity.ok ? "恢复完成，数据完整。" : "恢复完成，但存在完整性问题。", result.integrity.ok);
      await loadUsers(); await Promise.all([loadOverview(), loadExtension(), loadBoards(), loadTopics(), loadHomepage()]);
    } catch (error) { setMessage("data-message", error.message); }
  });

  syncRangeOutputs();
  const initialPanel = location.hash.slice(1);
  if (document.querySelector(`[data-panel="${CSS.escape(initialPanel)}"]`)) setPanel(initialPanel);
  void bootstrap();
})();
