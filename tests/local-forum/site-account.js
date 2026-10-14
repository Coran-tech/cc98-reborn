(function installCc98LocalAccountApp() {
  "use strict";

  if (!globalThis.__CC98_LOCAL_BOOTSTRAP__) return;

  const ACCOUNT_ROUTES = /^\/(?:usercenter(?:\/|$)|logon(?:\/|$)|register(?:\/|$)|account\/password(?:\/|$)|sitemanage(?:\/|$))/i;
  const ERROR_MESSAGES = {
    active_user_not_found: "目标账号不存在或已被停用。",
    cannot_remove_last_site_admin: "不能移除最后一名站务管理员。",
    cannot_suspend_last_site_admin: "不能停用最后一名站务管理员。",
    cannot_suspend_self: "不能停用当前正在使用的账号。",
    invalid_credentials: "用户名或密码不正确。",
    invalid_password: "当前密码不正确。",
    invalid_status: "账号状态无效。",
    login_required: "请先登录后再继续。",
    password_characters: "密码包含不支持的字符。",
    password_too_long: "密码不能超过 128 个字符。",
    password_too_short: "密码至少需要 8 个字符。",
    permission_denied: "当前账号没有执行此操作的权限。",
    registration_disabled: "管理员暂时关闭了账号注册。",
    registration_invite_required: "请输入邀请码。",
    registration_invite_invalid: "邀请码不正确。",
    registration_invite_unavailable: "当前注册策略需要邀请码，但管理员尚未配置邀请码。",
    username_characters: "用户名只能包含中英文、数字、下划线或连字符，且不能含空格。",
    username_length: "用户名长度应为 2 至 32 个字符。",
    username_taken: "这个用户名已经被使用。",
    user_not_found: "没有找到这个账号。"
  };

  const state = {
    context: null,
    renderId: 0
  };

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function button(text, className = "", handler = null) {
    const node = element("button", className, text);
    node.type = "button";
    if (handler) node.addEventListener("click", handler);
    return node;
  }

  function link(text, href, className = "") {
    const node = element("a", className, text);
    node.href = href;
    return node;
  }

  function field(labelText, input) {
    const label = element("label", "cc98-local-account-field");
    label.append(element("span", "", labelText), input);
    return label;
  }

  function setStatus(node, message = "", tone = "") {
    if (!(node instanceof HTMLElement)) return;
    node.textContent = message;
    node.dataset.tone = tone;
    node.hidden = !message;
  }

  function friendlyError(value) {
    const key = String(value?.message || value || "unknown_error").trim();
    return ERROR_MESSAGES[key] || key.replace(/_/g, " ") || "操作失败，请稍后重试。";
  }

  async function api(pathname, options = {}) {
    const headers = new Headers(options.headers || {});
    const body = options.body;
    if (body !== undefined && !(body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(pathname, {
      ...options,
      headers,
      body: body === undefined || body instanceof FormData || typeof body === "string"
        ? body
        : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store"
    });
    const contentType = response.headers.get("content-type") || "";
    let payload;
    if (contentType.includes("application/json")) payload = await response.json();
    else payload = await response.text();
    if (!response.ok) {
      throw new Error(typeof payload === "object" && payload ? payload.error : (payload || `http_${response.status}`));
    }
    return payload;
  }

  function currentRoutePath() {
    return String(location.pathname || "/").replace(/\/+$/, "") || "/";
  }

  function safeNext(value, fallback = "/") {
    try {
      const target = new URL(String(value || fallback), location.origin);
      if (target.origin !== location.origin || target.pathname === "/null") return fallback;
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return fallback;
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "--";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date).replace(/\//g, "-");
  }

  function setExpiringLocalValue(key, value, lifetimeSeconds) {
    localStorage.setItem(key, `str-${value}`);
    localStorage.setItem(`${key}_expirationTime`, String(Math.floor(Date.now() / 1000) + lifetimeSeconds));
  }

  function cacheForumUser(user) {
    if (!user) return;
    localStorage.setItem("userInfo", `obj-${JSON.stringify(user)}`);
    localStorage.setItem("userInfo_expirationTime", String(Math.floor(Date.now() / 1000) + 30 * 86400));
    localStorage.setItem("shouldNotRefreshUserInfo", "str-true");
  }

  function persistForumSession(result) {
    const user = result?.user;
    if (!user) return;
    clearForumSession();
    cacheForumUser(user);
    if (globalThis.__CC98_LOCAL_STRICT_AUTH__ === true) {
      setExpiringLocalValue("accessToken", "Bearer cc98-local-cookie-session", 86400);
      setExpiringLocalValue("refresh_token", "cc98-local-cookie-session", 30 * 86400);
    } else if (result.access_token) {
      setExpiringLocalValue("accessToken", `${result.token_type || "Bearer"} ${result.access_token}`, Number(result.expires_in) || 86400);
      if (result.refresh_token) {
        setExpiringLocalValue("refresh_token", result.refresh_token, Number(result.refresh_expires_in) || 30 * 86400);
      }
    } else {
      setExpiringLocalValue("accessToken", "Bearer cc98-local-test", 86400);
      setExpiringLocalValue("refresh_token", "cc98-local-test-refresh", 30 * 86400);
    }
  }

  function clearForumSession() {
    [
      "userInfo",
      "userInfo_expirationTime",
      "accessToken",
      "accessToken_expirationTime",
      "access_token",
      "access_token_expirationTime",
      "refresh_token",
      "refresh_token_expirationTime",
      "shouldNotRefreshUserInfo"
    ].forEach((key) => localStorage.removeItem(key));
  }

  function routeDescriptor(pathname = currentRoutePath()) {
    if (/^\/logon(?:\/|$)/i.test(pathname)) return { kind: "login", title: "登录本地论坛" };
    if (/^\/register(?:\/|$)/i.test(pathname)) return { kind: "register", title: "注册本地账号" };
    if (/^\/sitemanage(?:\/|$)/i.test(pathname)) return { kind: "admin", title: "站务管理" };
    if (/^\/(?:account\/password|usercenter\/security)(?:\/|$)/i.test(pathname)) {
      return { kind: "password", title: "修改密码" };
    }
    if (/\/config(?:\/|$)/i.test(pathname)) return { kind: "profile", title: "修改资料" };
    if (/\/mytopics(?:\/|$)/i.test(pathname)) return { kind: "topics", title: "我的主题" };
    if (/\/myposts(?:\/|$)/i.test(pathname)) return { kind: "posts", title: "我的回复" };
    if (/\/myhistory(?:\/|$)/i.test(pathname)) return { kind: "history", title: "我的足迹" };
    if (/\/myfavorites(?:\/|$)/i.test(pathname)) return { kind: "favorites", title: "我的收藏" };
    if (/\/myfollowings(?:\/|$)/i.test(pathname)) return { kind: "followings", title: "我的关注" };
    if (/\/myfans(?:\/|$)/i.test(pathname)) return { kind: "fans", title: "我的粉丝" };
    return { kind: "overview", title: "个人中心" };
  }

  async function loadContext(force = false) {
    if (!state.context || force) state.context = await api("/__local/account-context");
    return state.context;
  }

  function pageHeading(kicker, title, description = "") {
    const heading = element("header", "cc98-local-account-heading");
    heading.append(element("p", "cc98-rebuild-kicker", kicker), element("h1", "", title));
    if (description) heading.append(element("p", "cc98-local-account-lead", description));
    return heading;
  }

  function authCard(title, description = "") {
    const card = element("section", "cc98-local-auth-card");
    card.append(element("h2", "", title));
    if (description) card.append(element("p", "cc98-local-account-muted", description));
    return card;
  }

  function createPasswordInput(name, autocomplete) {
    const input = element("input");
    input.type = "password";
    input.name = name;
    input.minLength = 8;
    input.maxLength = 128;
    input.required = true;
    input.autocomplete = autocomplete;
    return input;
  }

  async function withBusy(control, busyText, task) {
    const controls = control instanceof HTMLFormElement
      ? [...control.querySelectorAll("button, input, select, textarea")]
      : [control];
    const submit = control instanceof HTMLFormElement ? control.querySelector("button[type='submit']") : control;
    const originalText = submit?.textContent || "";
    controls.forEach((item) => { item.disabled = true; });
    if (submit) submit.textContent = busyText;
    try {
      return await task();
    } finally {
      controls.forEach((item) => { item.disabled = false; });
      if (submit) submit.textContent = originalText;
    }
  }

  async function renderLogin(root) {
    const context = await loadContext(true);
    const params = new URLSearchParams(location.search);
    const next = safeNext(params.get("next"), "/");
    root.append(pageHeading("LOCAL IDENTITY", "登录本地论坛", "账号与帖子、收藏、关注和管理权限均由本地后端统一提供。"));
    const layout = element("div", "cc98-local-auth-layout");
    const card = authCard(params.get("switch") === "1" ? "切换账号" : "账号登录");
    const notice = element("p", "cc98-local-account-notice");
    if (params.get("changed") === "1") setStatus(notice, "密码已修改，旧会话已经撤销，请重新登录。", "success");
    else if (params.get("loggedout") === "1") setStatus(notice, "已经退出当前登录会话。", "success");
    else notice.hidden = true;
    card.append(notice);

    if (context.currentUser) {
      const current = element("div", "cc98-local-auth-current");
      const avatar = element("img");
      avatar.src = context.currentUser.portraitUrl || "/static/images/default_avatar_boy.png";
      avatar.alt = "";
      const copy = element("div");
      copy.append(
        element("span", "", context.authenticated ? "当前登录" : "当前模拟账号"),
        element("strong", "", context.currentUser.name),
        element("small", "", `UID ${context.currentUser.id}`)
      );
      current.append(avatar, copy);
      card.append(current);
    }

    const form = element("form", "cc98-local-auth-form");
    const username = element("input");
    username.name = "username";
    username.required = true;
    username.maxLength = 32;
    username.autocomplete = "username";
    username.placeholder = "用户名";
    const password = createPasswordInput("password", "current-password");
    password.placeholder = "密码";
    const status = element("p", "cc98-local-account-notice");
    status.hidden = true;
    const submit = button("登录", "cc98-local-primary");
    submit.type = "submit";
    form.append(field("用户名", username), field("密码", password), status, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(status);
      try {
        const result = await withBusy(form, "正在登录...", () => api("/auth/login", {
          method: "POST",
          body: { username: username.value.trim(), password: password.value }
        }));
        persistForumSession(result);
        state.context = null;
        location.assign(next);
      } catch (error) {
        setStatus(status, friendlyError(error), "error");
        password.focus();
        password.select();
      }
    });
    card.append(form);

    const actions = element("div", "cc98-local-auth-links");
    actions.append(link("注册新账号", `/register?next=${encodeURIComponent(next)}`));
    if (context.currentUser) actions.append(link("进入个人中心", "/usercenter"));
    card.append(actions);
    layout.append(card);

    if (context.mode === "compatibility" && context.users.length) {
      const quick = authCard("快速切换", "兼容模式允许直接选择一个有效模拟账号，不需要输入密码。严谨验证登录逻辑时可在控制台开启严格登录模式。");
      const select = element("select");
      context.users.filter((user) => user.status === "active").forEach((user) => {
        const option = element("option", "", `${user.name} · UID ${user.id}`);
        option.value = String(user.id);
        option.selected = user.id === context.currentUser?.id;
        select.append(option);
      });
      const quickStatus = element("p", "cc98-local-account-notice");
      quickStatus.hidden = true;
      const switchButton = button("使用此账号", "cc98-local-secondary", async () => {
        setStatus(quickStatus);
        try {
          await withBusy(switchButton, "正在切换...", () => api("/__local/current-user", {
            method: "PUT",
            body: { userId: Number(select.value) }
          }));
          clearForumSession();
          state.context = null;
          location.assign(next);
        } catch (error) {
          setStatus(quickStatus, friendlyError(error), "error");
        }
      });
      quick.append(field("模拟账号", select), quickStatus, switchButton);
      layout.append(quick);
    }
    root.append(layout);
  }

  async function renderRegister(root) {
    const context = await loadContext(true);
    const params = new URLSearchParams(location.search);
    const next = safeNext(params.get("next"), "/usercenter");
    root.append(pageHeading("LOCAL IDENTITY", "注册本地账号", "账号信息只保存在当前模拟论坛的数据文件中。"));
    const card = authCard("创建账号", context.registration.enabled === false ? "当前已关闭公开注册。站务账号仍可在管理页面创建用户。" : "注册完成后会进入新账号的个人中心。");
    card.classList.add("cc98-local-auth-card-single");
    const form = element("form", "cc98-local-auth-form cc98-local-register-form");
    const username = element("input");
    username.name = "username";
    username.required = true;
    username.minLength = 2;
    username.maxLength = 32;
    username.autocomplete = "username";
    const email = element("input");
    email.name = "emailAddress";
    email.type = "email";
    email.maxLength = 160;
    email.autocomplete = "email";
    const password = createPasswordInput("password", "new-password");
    const confirm = createPasswordInput("confirmPassword", "new-password");
    const inviteCode = element("input");
    inviteCode.name = "inviteCode";
    inviteCode.autocomplete = "off";
    inviteCode.maxLength = 128;
    inviteCode.hidden = context.registration.requireInvite !== true;
    inviteCode.required = context.registration.requireInvite === true;
    const status = element("p", "cc98-local-account-notice");
    status.hidden = true;
    const submit = button("注册并进入论坛", "cc98-local-primary");
    submit.type = "submit";
    submit.disabled = context.registration.enabled === false && !context.isAdmin;
    form.append(
      field("用户名", username),
      field("邮箱（可选）", email),
      field("密码", password),
      field("确认密码", confirm),
      ...(context.registration.requireInvite === true ? [field("邀请码", inviteCode)] : []),
      status,
      submit
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(status);
      if (password.value !== confirm.value) {
        setStatus(status, "两次输入的密码不一致。", "error");
        confirm.focus();
        return;
      }
      try {
        const result = await withBusy(form, "正在创建...", () => api("/auth/register", {
          method: "POST",
          body: {
            username: username.value.trim(),
            emailAddress: email.value.trim(),
            password: password.value,
            inviteCode: inviteCode.value.trim(),
            switchToNewAccount: true
          }
        }));
        persistForumSession(result);
        state.context = null;
        if (result.createdByAdmin && context.mode === "strict") {
          location.assign(`/logOn?switch=1&next=${encodeURIComponent(next)}`);
        } else {
          location.assign(next);
        }
      } catch (error) {
        setStatus(status, friendlyError(error), "error");
      }
    });
    card.append(form, element("p", "cc98-local-auth-footnote", "已有账号？"));
    card.lastElementChild.append(" ", link("返回登录", `/logOn?next=${encodeURIComponent(next)}`));
    root.append(card);
  }

  async function renderPassword(root) {
    const context = await loadContext(true);
    if (!context.currentUser) {
      location.replace(`/logOn?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    root.append(pageHeading("ACCOUNT SECURITY", "修改密码", "修改成功后会撤销这个账号的旧会话，并返回登录页。"));
    const card = authCard(`账号：${context.currentUser.name}`, `UID ${context.currentUser.id}`);
    card.classList.add("cc98-local-auth-card-single");
    const form = element("form", "cc98-local-auth-form");
    const current = createPasswordInput("currentPassword", "current-password");
    const next = createPasswordInput("newPassword", "new-password");
    const confirm = createPasswordInput("confirmPassword", "new-password");
    const status = element("p", "cc98-local-account-notice");
    status.hidden = true;
    const submit = button("确认修改", "cc98-local-primary");
    submit.type = "submit";
    form.append(field("当前密码", current), field("新密码", next), field("确认新密码", confirm), status, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(status);
      if (next.value !== confirm.value) {
        setStatus(status, "两次输入的新密码不一致。", "error");
        confirm.focus();
        return;
      }
      if (current.value === next.value) {
        setStatus(status, "新密码不能与当前密码相同。", "error");
        next.focus();
        return;
      }
      try {
        await withBusy(form, "正在修改...", () => api("/auth/change-password", {
          method: "PUT",
          body: { currentPassword: current.value, newPassword: next.value }
        }));
        clearForumSession();
        state.context = null;
        location.assign("/logOn?changed=1&next=%2Fusercenter");
      } catch (error) {
        setStatus(status, friendlyError(error), "error");
      }
    });
    card.append(form);
    root.append(card);
  }

  function accountNav(activeKind, isAdmin) {
    const nav = element("nav", "cc98-local-account-nav");
    const items = [
      ["overview", "主页", "/usercenter", "fa-home"],
      ["profile", "修改资料", "/usercenter/config", "fa-cog"],
      ["topics", "我的主题", "/usercenter/mytopics", "fa-file-text-o"],
      ["posts", "我的回复", "/usercenter/myposts", "fa-reply"],
      ["history", "我的足迹", "/usercenter/myhistory", "fa-history"],
      ["favorites", "我的收藏", "/usercenter/myfavorites", "fa-star"],
      ["followings", "我的关注", "/usercenter/myfollowings", "fa-heart"],
      ["fans", "我的粉丝", "/usercenter/myfans", "fa-users"],
      ["password", "账号安全", "/usercenter/security", "fa-shield"]
    ];
    if (isAdmin) items.push(["admin", "站务管理", "/sitemanage", "fa-wrench"]);
    items.forEach(([kind, label, href, icon]) => {
      const item = link(label, href, kind === activeKind ? "is-active" : "");
      const iconNode = element("i", `fa ${icon}`);
      iconNode.setAttribute("aria-hidden", "true");
      item.prepend(iconNode);
      nav.append(item);
    });
    return nav;
  }

  function roleLabel(user) {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    if (roles.includes("siteAdmin")) return "站务管理员";
    if (roles.includes("boardModerator")) return "版主";
    return user?.displayTitle || user?.privilege || "正式用户";
  }

  function profileHeader(context) {
    const user = context.currentUser;
    const header = element("section", "cc98-local-profile-header");
    const avatar = element("img");
    avatar.src = user.portraitUrl || user.photourl || "/static/images/default_avatar_boy.png";
    avatar.alt = `${user.name} 的头像`;
    const identity = element("div", "cc98-local-profile-identity");
    identity.append(element("p", "cc98-rebuild-kicker", "LOCAL ACCOUNT"), element("h1", "", user.name));
    const chips = element("div", "cc98-local-profile-chips");
    chips.append(element("span", "", `UID ${user.id}`), element("span", "", roleLabel(user)));
    if (user.status && user.status !== "active") chips.append(element("span", "is-danger", user.status));
    identity.append(chips);
    const controls = element("div", "cc98-local-profile-controls");
    if (context.canSwitchAccounts) {
      const select = element("select");
      context.users.filter((item) => item.status === "active").forEach((item) => {
        const option = element("option", "", `${item.name} · ${item.id}`);
        option.value = String(item.id);
        option.selected = item.id === user.id;
        select.append(option);
      });
      const switchButton = button("切换", "cc98-local-secondary", async () => {
        if (Number(select.value) === user.id) return;
        try {
          await withBusy(switchButton, "切换中...", () => api("/__local/current-user", {
            method: "PUT",
            body: { userId: Number(select.value) }
          }));
          clearForumSession();
          state.context = null;
          location.reload();
        } catch (error) {
          window.alert(friendlyError(error));
        }
      });
      controls.append(select, switchButton);
    } else {
      controls.append(link("切换账号", `/logOn?switch=1&next=${encodeURIComponent(location.pathname + location.search)}`, "cc98-local-button-link"));
    }
    const logout = button(context.authenticated ? "退出登录" : "返回登录", "cc98-local-quiet", async () => {
      if (context.authenticated) {
        try { await api("/auth/logout", { method: "POST" }); } catch { }
      }
      clearForumSession();
      state.context = null;
      location.assign("/logOn?loggedout=1");
    });
    controls.append(logout);
    header.append(avatar, identity, controls);
    return header;
  }

  function stat(label, value) {
    const item = element("div", "cc98-local-account-stat");
    item.append(element("span", "", label), element("strong", "", value ?? 0));
    return item;
  }

  function contentHeader(title, description = "") {
    const heading = element("div", "cc98-local-account-section-heading");
    const copy = element("div");
    copy.append(element("h2", "", title));
    if (description) copy.append(element("p", "", description));
    heading.append(copy);
    return heading;
  }

  function emptyState(text) {
    return element("p", "cc98-local-account-empty", text);
  }

  function refreshAdminMetrics() {
    try {
      globalThis.__cc98LocalAdminMetricsRefresh?.();
    } catch {
      // The full console also uses this module without the forum status strip.
    }
  }

  function topicRow(topic, meta = "") {
    const row = element("article", "cc98-local-account-list-row");
    const copy = element("div");
    copy.append(link(topic.title || "（无标题）", `/topic/${topic.id}`, "cc98-local-account-row-title"));
    copy.append(element("p", "", meta || `${formatDate(topic.time || topic.lastPostTime)} · 浏览 ${topic.hitCount || 0} · 回复 ${topic.replyCount || 0}`));
    row.append(copy, link("查看", `/topic/${topic.id}`, "cc98-local-row-action"));
    return row;
  }

  function stripUbb(value) {
    return String(value || "")
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  async function renderOverview(panel, context) {
    const user = context.currentUser;
    panel.append(contentHeader("账号概览", "资料、权限和论坛活动均来自当前本地后端。"));
    const stats = element("div", "cc98-local-account-stats");
    stats.append(
      stat("主题与回复", user.postCount || 0),
      stat("粉丝", user.fanCount || 0),
      stat("关注", user.followCount || 0),
      stat("风评", user.popularity || 0)
    );
    panel.append(stats);
    const details = element("dl", "cc98-local-profile-details");
    [
      ["账号头衔", roleLabel(user)],
      ["最后登录", formatDate(user.lastLogOnTime)],
      ["注册时间", formatDate(user.registerTime || user.createdAt)],
      ["邮箱", user.emailAddress || "未填写"],
      ["QQ", user.qq || "未填写"],
      ["个人简介", user.introduction || "还没有个人简介"]
    ].forEach(([name, value]) => {
      details.append(element("dt", "", name), element("dd", "", value));
    });
    panel.append(details);
    const activity = element("section", "cc98-local-account-subsection");
    activity.append(contentHeader("最近活动"));
    try {
      const [topics, postResult] = await Promise.all([
        api("/me/recent-topic?from=0&size=4"),
        api("/me/recent-post?from=0&size=4")
      ]);
      const posts = Array.isArray(postResult?.data) ? postResult.data : [];
      if (!topics.length && !posts.length) activity.append(emptyState("还没有公开的主题或回复。"));
      topics.forEach((topic) => activity.append(topicRow(topic)));
      posts.slice(0, Math.max(0, 4 - topics.length)).forEach((post) => {
        activity.append(topicRow({ id: post.topicId, title: post.title }, `${formatDate(post.time)} · #${post.floor} · ${stripUbb(post.content)}`));
      });
    } catch (error) {
      activity.append(emptyState(friendlyError(error)));
    }
    panel.append(activity);
  }

  async function renderProfileForm(panel, context) {
    const user = context.currentUser;
    panel.append(contentHeader("修改资料", "保存后，论坛头像、个人信息与签名档会立即使用新数据。"));
    const form = element("form", "cc98-local-profile-form");
    const email = element("input");
    email.type = "email";
    email.maxLength = 160;
    email.value = user.emailAddress || "";
    const qq = element("input");
    qq.inputMode = "numeric";
    qq.maxLength = 24;
    qq.value = user.qq || "";
    const birthday = element("input");
    birthday.type = "date";
    birthday.value = String(user.birthday || "").slice(0, 10);
    const gender = element("select");
    [[0, "保密"], [1, "男"], [2, "女"]].forEach(([value, label]) => {
      const option = element("option", "", label);
      option.value = String(value);
      option.selected = Number(user.gender || 0) === value;
      gender.append(option);
    });
    const introduction = element("textarea");
    introduction.rows = 4;
    introduction.maxLength = 1000;
    introduction.value = user.introduction || "";
    const signature = element("textarea");
    signature.rows = 8;
    signature.maxLength = 8000;
    signature.spellcheck = false;
    signature.value = user.signatureCode || "";
    const portrait = element("input");
    // Forum portraits may use either an absolute URL or a local /static path.
    // type=url rejects the latter and silently prevents the whole form submit.
    portrait.type = "text";
    portrait.inputMode = "url";
    portrait.maxLength = 1000;
    portrait.value = user.portraitUrl || user.photourl || "";
    const upload = element("input");
    upload.type = "file";
    upload.accept = "image/png,image/jpeg,image/gif,image/webp";
    const uploadRow = element("div", "cc98-local-profile-upload");
    const uploadButton = button("上传头像", "cc98-local-secondary", async () => {
      if (!upload.files?.[0]) {
        upload.click();
        return;
      }
      const data = new FormData();
      data.append("file", upload.files[0], upload.files[0].name);
      try {
        const urls = await withBusy(uploadButton, "上传中...", () => api("/file/portrait", { method: "POST", body: data }));
        if (Array.isArray(urls) && urls[0]) portrait.value = urls[0];
        setStatus(status, "头像已上传，保存资料后会在全部页面同步。", "success");
      } catch (error) {
        setStatus(status, friendlyError(error), "error");
      }
    });
    upload.addEventListener("change", () => {
      if (upload.files?.length) uploadButton.click();
    });
    uploadRow.append(upload, uploadButton);
    const status = element("p", "cc98-local-account-notice");
    status.hidden = true;
    const submit = button("保存资料", "cc98-local-primary");
    submit.type = "submit";
    const grid = element("div", "cc98-local-profile-grid");
    grid.append(field("邮箱", email), field("QQ", qq), field("生日", birthday), field("性别", gender));
    form.append(grid, field("头像地址", portrait), uploadRow, field("个人简介", introduction), field("签名档 UBB", signature), status, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(status);
      try {
        const nextUser = await withBusy(form, "正在保存...", () => api("/me", {
          method: "PUT",
          body: {
            emailAddress: email.value.trim(),
            qq: qq.value.trim(),
            birthday: birthday.value,
            gender: Number(gender.value),
            introduction: introduction.value,
            signatureCode: signature.value,
            portraitUrl: portrait.value.trim(),
            photourl: portrait.value.trim()
          }
        }));
        const mergedUser = { ...state.context.currentUser, ...nextUser, roles: state.context.currentUser.roles };
        state.context.currentUser = mergedUser;
        cacheForumUser(mergedUser);
        const portraitUrl = mergedUser.portraitUrl || mergedUser.photourl || "/static/images/default_avatar_boy.png";
        document.querySelectorAll(".cc98-local-profile-header > img, .cc98-rebuild-forced-user-entry .topBarUserImg img").forEach((image) => {
          if (image instanceof HTMLImageElement) image.src = portraitUrl;
        });
        setStatus(status, "资料已保存。", "success");
      } catch (error) {
        setStatus(status, friendlyError(error), "error");
      }
    });
    panel.append(form);
  }

  async function renderTopicList(panel, descriptor) {
    const config = {
      topics: ["我的主题", "/me/recent-topic?from=0&size=100", "还没有发表公开主题。"],
      favorites: ["我的收藏", "/topic/me/favorite?from=0&size=100", "还没有收藏主题。"],
      history: ["我的足迹", "/me/browsing-record?from=0&size=100", "还没有浏览记录。"]
    }[descriptor.kind];
    panel.append(contentHeader(config[0]));
    try {
      const result = await api(config[1]);
      const items = Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : []);
      if (!items.length) panel.append(emptyState(config[2]));
      items.forEach((topic) => panel.append(topicRow(topic, descriptor.kind === "history" ? `浏览于 ${formatDate(topic.browseTime)}` : "")));
    } catch (error) {
      panel.append(emptyState(friendlyError(error)));
    }
  }

  async function renderPostList(panel) {
    panel.append(contentHeader("我的回复"));
    try {
      const result = await api("/me/recent-post?from=0&size=100");
      const posts = Array.isArray(result?.data) ? result.data : [];
      if (!posts.length) panel.append(emptyState("还没有发表公开回复。"));
      posts.forEach((post) => {
        const row = element("article", "cc98-local-account-list-row");
        const copy = element("div");
        copy.append(link(post.title || `主题 ${post.topicId}`, `/topic/${post.topicId}#${post.floor}`, "cc98-local-account-row-title"));
        copy.append(element("p", "", `${formatDate(post.time)} · #${post.floor} · ${stripUbb(post.content)}`));
        row.append(copy, link("定位", `/topic/${post.topicId}#${post.floor}`, "cc98-local-row-action"));
        panel.append(row);
      });
    } catch (error) {
      panel.append(emptyState(friendlyError(error)));
    }
  }

  async function renderPeopleList(panel, kind) {
    panel.append(contentHeader(kind === "followings" ? "我的关注" : "我的粉丝"));
    try {
      const ids = await api(kind === "followings" ? "/me/followee?from=0&size=100" : "/me/follower?from=0&size=100");
      const users = await Promise.all((Array.isArray(ids) ? ids : []).map((id) => api(`/user/${id}`)));
      if (!users.length) panel.append(emptyState(kind === "followings" ? "还没有关注用户。" : "还没有粉丝。"));
      users.forEach((user) => {
        const row = element("article", "cc98-local-person-row");
        const avatar = element("img");
        avatar.src = user.portraitUrl || "/static/images/default_avatar_boy.png";
        avatar.alt = "";
        const copy = element("div");
        copy.append(link(user.name, `/user/id/${user.id}`, "cc98-local-account-row-title"));
        copy.append(element("p", "", `UID ${user.id} · 帖数 ${user.postCount || 0} · 粉丝 ${user.fanCount || 0}`));
        const actions = element("div", "cc98-local-person-actions");
        actions.append(link("私信", `/message/message?id=${user.id}`, "cc98-local-row-action"));
        if (kind === "followings") {
          actions.append(button("取消关注", "cc98-local-quiet", async (event) => {
            try {
              await withBusy(event.currentTarget, "处理中...", () => api(`/me/followee/${user.id}`, { method: "DELETE" }));
              row.remove();
            } catch (error) {
              window.alert(friendlyError(error));
            }
          }));
        }
        row.append(avatar, copy, actions);
        panel.append(row);
      });
    } catch (error) {
      panel.append(emptyState(friendlyError(error)));
    }
  }

  async function renderUserCenter(root, descriptor) {
    const context = await loadContext(true);
    if (!context.currentUser) {
      location.replace(`/logOn?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    root.append(profileHeader(context));
    const layout = element("div", "cc98-local-account-layout");
    const panel = element("main", "cc98-local-account-panel");
    panel.setAttribute("aria-live", "polite");
    layout.append(accountNav(descriptor.kind, context.isAdmin), panel);
    root.append(layout);
    if (descriptor.kind === "overview") await renderOverview(panel, context);
    else if (descriptor.kind === "profile") await renderProfileForm(panel, context);
    else if (["topics", "favorites", "history"].includes(descriptor.kind)) await renderTopicList(panel, descriptor);
    else if (descriptor.kind === "posts") await renderPostList(panel);
    else if (["followings", "fans"].includes(descriptor.kind)) await renderPeopleList(panel, descriptor.kind);
  }

  function roleCheckbox(role, label, user) {
    const wrapper = element("label", "cc98-local-admin-check");
    const input = element("input");
    input.type = "checkbox";
    input.dataset.role = role;
    input.checked = Array.isArray(user.roles) && user.roles.includes(role);
    wrapper.append(input, element("span", "", label));
    return wrapper;
  }

  function adminUserRow(user, context, reload) {
    const row = element("tr");
    row.dataset.userId = String(user.id);
    const identity = element("td", "cc98-local-admin-user");
    const avatar = element("img");
    avatar.src = user.portraitUrl || "/static/images/default_avatar_boy.png";
    avatar.alt = "";
    const copy = element("span");
    copy.append(element("strong", "", user.name), element("small", "", `UID ${user.id}`));
    identity.append(avatar, copy);
    const roleCell = element("td", "cc98-local-admin-roles");
    roleCell.append(roleCheckbox("boardModerator", "版主", user), roleCheckbox("siteAdmin", "站务", user));
    const statusCell = element("td");
    const statusSelect = element("select");
    [["active", "正常"], ["suspended", "暂停"], ["disabled", "停用"]].forEach(([value, label]) => {
      const option = element("option", "", label);
      option.value = value;
      option.selected = user.status === value;
      statusSelect.append(option);
    });
    statusCell.append(statusSelect);
    const passwordCell = element("td");
    const password = element("input");
    password.type = "password";
    password.minLength = 8;
    password.maxLength = 128;
    password.placeholder = "新密码";
    password.autocomplete = "new-password";
    passwordCell.append(password);
    const actionCell = element("td", "cc98-local-admin-actions");
    const save = button("保存", "cc98-local-secondary", async () => {
      const roles = ["member"];
      roleCell.querySelectorAll("input[data-role]:checked").forEach((input) => roles.push(input.dataset.role));
      try {
        await withBusy(save, "保存中...", async () => {
          await api(`/auth/users/${user.id}/roles`, { method: "PUT", body: { roles } });
          await api(`/auth/users/${user.id}/status`, { method: "PUT", body: { status: statusSelect.value } });
        });
        await reload(`账号 ${user.name} 已更新。`);
      } catch (error) {
        window.alert(friendlyError(error));
      }
    });
    const reset = button("重置密码", "cc98-local-quiet", async () => {
      if (password.value.length < 8) {
        password.focus();
        window.alert("请先输入至少 8 位的新密码。");
        return;
      }
      try {
        await withBusy(reset, "重置中...", () => api(`/auth/users/${user.id}/password`, {
          method: "PUT",
          body: { password: password.value }
        }));
        password.value = "";
        await reload(`账号 ${user.name} 的密码已重置。`);
      } catch (error) {
        window.alert(friendlyError(error));
      }
    });
    actionCell.append(save, reset);
    if (context.canSwitchAccounts && user.status === "active") {
      actionCell.append(button("切换", "cc98-local-quiet", async (event) => {
        try {
          await withBusy(event.currentTarget, "切换中...", () => api("/__local/current-user", { method: "PUT", body: { userId: user.id } }));
          clearForumSession();
          state.context = null;
          location.assign("/usercenter");
        } catch (error) {
          window.alert(friendlyError(error));
        }
      }));
    }
    row.append(identity, roleCell, statusCell, passwordCell, actionCell);
    return row;
  }

  async function renderAdminConsole(host) {
    host.replaceChildren();
    const status = element("p", "cc98-local-account-notice");
    status.hidden = true;
    host.append(status);
    try {
      const context = await loadContext(true);
      if (!context.currentUser) {
        host.append(emptyState("请先登录站务账号。"));
        return;
      }
      if (!context.isAdmin) {
        host.append(emptyState("当前账号没有站务管理权限。"));
        return;
      }
      const toolbar = element("div", "cc98-local-admin-toolbar");
      const title = element("div");
      title.append(element("h2", "", "站务快捷管理"), element("p", "", "直接在论坛页面维护账号、注册策略和近期主题。"));
      toolbar.append(title, link("打开完整控制台", "/__local/console#accounts", "cc98-local-button-link"));
      host.prepend(toolbar);

      const createSection = element("section", "cc98-local-admin-subsection");
      createSection.append(element("h3", "", "创建账号与注册策略"));
      const createForm = element("form", "cc98-local-admin-create");
      const name = element("input");
      name.placeholder = "新用户名";
      name.required = true;
      name.minLength = 2;
      name.maxLength = 32;
      const password = createPasswordInput("adminPassword", "new-password");
      password.placeholder = "初始密码（至少 8 位）";
      const createButton = button("创建账号", "cc98-local-primary");
      createButton.type = "submit";
      const registration = element("label", "cc98-local-admin-toggle");
      const registrationInput = element("input");
      registrationInput.type = "checkbox";
      registrationInput.checked = context.registration.enabled !== false;
      registration.append(registrationInput, element("span", "", "允许公开注册"));
      const inviteToggle = element("label", "cc98-local-admin-toggle");
      const inviteInput = element("input");
      inviteInput.type = "checkbox";
      inviteInput.checked = context.registration.requireInvite === true;
      inviteToggle.append(inviteInput, element("span", "", "需要邀请码"));
      const inviteCode = element("input");
      inviteCode.type = "text";
      inviteCode.maxLength = 128;
      inviteCode.placeholder = "邀请码（可选）";
      try {
        const registrationConfig = await api("/auth/registration");
        inviteCode.value = registrationConfig.inviteCode || "";
        inviteInput.checked = registrationConfig.requireInvite === true;
      } catch (error) {
        setStatus(status, friendlyError(error), "error");
      }
      const saveRegistration = button("保存注册策略", "cc98-local-secondary", async () => {
        try {
          await withBusy(saveRegistration, "保存中...", () => api("/auth/registration", {
            method: "PUT",
            body: {
              enabled: registrationInput.checked,
              requireInvite: inviteInput.checked,
              inviteCode: inviteCode.value.trim()
            }
          }));
          setStatus(status, "注册策略已保存。", "success");
        } catch (error) {
          setStatus(status, friendlyError(error), "error");
        }
      });
      const createAccountRow = element("div", "cc98-local-admin-create-row");
      createAccountRow.append(name, password, createButton);
      const registrationRow = element("div", "cc98-local-admin-create-row cc98-local-admin-registration-row");
      registrationRow.append(registration, inviteToggle, inviteCode, saveRegistration);
      createForm.append(createAccountRow, registrationRow);
      createForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await withBusy(createForm, "创建中...", () => api("/auth/register", {
            method: "POST",
            body: { username: name.value.trim(), password: password.value, adminCreate: true }
          }));
          name.value = "";
          password.value = "";
          await renderAdminConsole(host);
          setStatus(host.querySelector(".cc98-local-account-notice"), "账号已创建。", "success");
        } catch (error) {
          setStatus(status, friendlyError(error), "error");
        }
      });
      createSection.append(createForm);
      host.append(createSection);

      const usersSection = element("section", "cc98-local-admin-subsection");
      usersSection.append(element("h3", "", "用户与权限"));
      const tableWrap = element("div", "cc98-local-admin-table-wrap");
      const table = element("table", "cc98-local-admin-table");
      const head = element("thead");
      const headRow = element("tr");
      ["用户", "角色", "状态", "新密码", "操作"].forEach((label) => headRow.append(element("th", "", label)));
      head.append(headRow);
      const body = element("tbody");
      const reload = async (message = "") => {
        state.context = null;
        await renderAdminConsole(host);
        refreshAdminMetrics();
        if (message) setStatus(host.querySelector(".cc98-local-account-notice"), message, "success");
      };
      context.users.forEach((user) => body.append(adminUserRow(user, context, reload)));
      table.append(head, body);
      tableWrap.append(table);
      usersSection.append(tableWrap);
      host.append(usersSection);

      const topicsSection = element("section", "cc98-local-admin-subsection");
      topicsSection.append(element("h3", "", "近期主题"));
      const topics = await api("/__local/topics?from=0&size=20");
      const topicList = element("div", "cc98-local-admin-topic-list");
      const values = Array.isArray(topics?.data) ? topics.data : [];
      if (!values.length) topicList.append(emptyState("没有可管理的主题。"));
      values.forEach((topic) => {
        const row = element("article", "cc98-local-admin-topic-row");
        const copy = element("div");
        copy.append(link(topic.title || `主题 ${topic.id}`, `/topic/${topic.id}`, "cc98-local-account-row-title"));
        copy.append(element("p", "", `#${topic.id} · ${topic.userName || "未知用户"} · ${formatDate(topic.time)}`));
        const actions = element("div", "cc98-local-admin-actions");
        const topicAction = (label, action, active) => button(active ? `取消${label}` : label, "cc98-local-quiet", async (event) => {
          try {
            await withBusy(event.currentTarget, "处理中...", () => api(`/topic/${topic.id}/${action}`, {
              method: active ? "DELETE" : "PUT",
              body: action === "top" ? { topState: 1 } : {}
            }));
            await renderAdminConsole(host);
          } catch (error) {
            window.alert(friendlyError(error));
          }
        });
        actions.append(
          topicAction("锁定", "lock", topic.state === 1),
          topicAction("置顶", "top", Boolean(topic.topState)),
          topicAction("精华", "best", Boolean(topic.bestState))
        );
        if (topic.deleted) {
          actions.append(button("恢复", "cc98-local-secondary", async (event) => {
            try {
              await withBusy(event.currentTarget, "恢复中...", () => api(`/__local/topics/${topic.id}/restore`, { method: "PUT" }));
              await renderAdminConsole(host);
            } catch (error) { window.alert(friendlyError(error)); }
          }));
        } else {
          actions.append(button("删除", "cc98-local-danger", async (event) => {
            if (!window.confirm(`确定删除主题“${topic.title}”？可在完整控制台恢复。`)) return;
            try {
              await withBusy(event.currentTarget, "删除中...", () => api(`/topic/${topic.id}`, { method: "DELETE" }));
              await renderAdminConsole(host);
            } catch (error) { window.alert(friendlyError(error)); }
          }));
        }
        row.append(copy, actions);
        topicList.append(row);
      });
      topicsSection.append(topicList);
      host.append(topicsSection);
      refreshAdminMetrics();
    } catch (error) {
      setStatus(status, friendlyError(error), "error");
    }
  }

  async function renderAdminPage(root) {
    const context = await loadContext(true);
    if (!context.currentUser) {
      location.replace(`/logOn?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    root.append(profileHeader(context));
    const layout = element("div", "cc98-local-account-layout");
    const panel = element("main", "cc98-local-account-panel");
    panel.setAttribute("aria-live", "polite");
    layout.append(accountNav("admin", context.isAdmin), panel);
    root.append(layout);
    await renderAdminConsole(panel);
  }

  function render(app) {
    const root = element("section", "cc98-local-account-root");
    root.dataset.cc98LocalAccountRoot = "true";
    root.append(element("div", "cc98-local-account-loading", "正在读取本地账号数据..."));
    app.append(root);
    const renderId = ++state.renderId;
    const descriptor = routeDescriptor();
    document.title = `${descriptor.title} - CC98 本地论坛`;
    Promise.resolve().then(async () => {
      root.replaceChildren();
      if (descriptor.kind === "login") await renderLogin(root);
      else if (descriptor.kind === "register") await renderRegister(root);
      else if (descriptor.kind === "password") await renderPassword(root);
      else if (descriptor.kind === "admin") await renderAdminPage(root);
      else await renderUserCenter(root, descriptor);
      globalThis.CC98RebornUserNotes?.mount(root);
    }).catch((error) => {
      if (renderId !== state.renderId || !root.isConnected) return;
      root.replaceChildren(pageHeading("LOCAL ACCOUNT", "账号页面加载失败"), emptyState(friendlyError(error)));
      root.append(button("重新加载", "cc98-local-primary", () => location.reload()));
    });
  }

  globalThis.CC98LocalAccountApp = {
    handlesRoute(pathname) {
      return ACCOUNT_ROUTES.test(String(pathname || ""));
    },
    render,
    renderAdminConsole
  };
})();
