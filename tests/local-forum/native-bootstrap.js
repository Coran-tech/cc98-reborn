(function installCc98LocalNativeBootstrap() {
  "use strict";

  const bootstrap = globalThis.__CC98_LOCAL_BOOTSTRAP__ || {};
  const strictAuth = globalThis.__CC98_LOCAL_STRICT_AUTH__ === true;
  const user = bootstrap.user || null;
  const nowSeconds = Math.floor(Date.now() / 1000);

  // LogOn.tsx assigns the cached redirect value directly to location.href.
  // A fresh visit to /logOn has no value, which the browser turns into
  // /null after a successful login. Preserve real return targets while making
  // the empty native-login case return to the forum home page.
  if (/^\/logon(?:\/|$)/i.test(location.pathname)) {
    const redirect = localStorage.getItem("logOnRedirectUrl");
    if (!redirect || redirect === "null" || redirect === "undefined") {
      localStorage.setItem("logOnRedirectUrl", "/");
    }
  }

  function setLocalValue(key, value, lifetimeSeconds) {
    const encoded = typeof value === "object"
      ? `obj-${JSON.stringify(value)}`
      : `str-${value}`;
    localStorage.setItem(key, encoded);
    if (lifetimeSeconds > 0) {
      localStorage.setItem(`${key}_expirationTime`, String(nowSeconds + lifetimeSeconds));
    } else {
      localStorage.removeItem(`${key}_expirationTime`);
    }
  }

  function clearAccountSession() {
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

  function localObject(key, fallback = null) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return raw.startsWith("obj-") ? JSON.parse(raw.slice(4)) : fallback;
    } catch {
      return fallback;
    }
  }

  function installMessageSettingBridge() {
    const settingNames = new Set([
      "responseSetting",
      "attmeSetting",
      "systemSetting",
      "messageSetting",
      "postSetting"
    ]);
    const defaults = { response: "是", attme: "是", system: "是", message: "是", post: "否" };
    const keyForName = (name) => name.replace(/Setting$/, "");
    const draft = { ...defaults, ...(localObject("noticeSetting", {}) || {}) };
    const selectRadio = (name, value) => {
      document.querySelectorAll(`input[type="radio"][name="${name}"]`).forEach((radio) => {
        radio.checked = radio.value === value;
        radio.removeAttribute("checked");
        if (radio.checked) radio.setAttribute("checked", "checked");
      });
    };
    const applyStoredSettings = () => {
      if (!/^\/message\/setting(?:\/|$)/i.test(location.pathname)) return;
      settingNames.forEach((name) => {
        selectRadio(name, draft[keyForName(name)]);
      });
    };
    document.addEventListener("click", (event) => {
      const radio = event.target instanceof HTMLInputElement ? event.target : null;
      if (!radio || radio.type !== "radio" || !settingNames.has(radio.name)) return;
      event.stopImmediatePropagation();
      draft[keyForName(radio.name)] = radio.value;
      queueMicrotask(() => selectRadio(radio.name, radio.value));
      radio.focus();
    }, true);
    document.addEventListener("click", (event) => {
      const save = event.target instanceof Element ? event.target.closest("button.message-setting-btn") : null;
      if (!save) return;
      settingNames.forEach((name) => selectRadio(name, draft[keyForName(name)]));
      localStorage.setItem("noticeSetting", `obj-${JSON.stringify(draft)}`);
    }, true);
    applyStoredSettings();
    new MutationObserver(applyStoredSettings).observe(document.documentElement, { childList: true, subtree: true });
  }

  function installLocalAccountLinks() {
    const rewrite = () => {
      document.querySelectorAll("a[href]").forEach((anchor) => {
        let target;
        try {
          target = new URL(anchor.href, location.href);
        } catch {
          return;
        }
        if (target.hostname.toLowerCase() !== "account.cc98.org") return;
        const label = anchor.textContent.trim();
        anchor.href = /注册|认证|激活/.test(label) ? "/register" : "/account/password";
        anchor.removeAttribute("target");
        anchor.removeAttribute("rel");
      });
    };
    rewrite();
    new MutationObserver(rewrite).observe(document.documentElement, { childList: true, subtree: true });
  }

  function installAccountSecurityLink() {
    const addLink = () => {
      const list = document.querySelector("#userCenterNavigation > ul");
      if (!list || list.querySelector('[data-cc98-local-account-security="true"]')) return;
      const divider = document.createElement("hr");
      divider.dataset.cc98LocalAccountSecurity = "true";
      const item = document.createElement("li");
      item.dataset.cc98LocalAccountSecurity = "true";
      const anchor = document.createElement("a");
      anchor.href = "/usercenter/security";
      anchor.className = "fa-shield";
      const label = document.createElement("div");
      label.className = "center-nav-item";
      label.textContent = "账号安全";
      anchor.append(label);
      item.append(anchor);
      list.append(divider, item);
    };
    addLink();
    new MutationObserver(addLink).observe(document.documentElement, { childList: true, subtree: true });
  }

  // The native Forum bundle owns all rendering and interaction. This file only
  // supplies the same local identity that a completed OpenID login would have
  // placed in localStorage; it deliberately does not expose chrome.* or touch DOM.
  localStorage.setItem("version", "3.5.0");
  ["boardsInfo", "CurrentRecommendedTopics", "LastRecommendedTopics", "mainPageData"]
    .forEach((key) => localStorage.removeItem(key));
  installLocalAccountLinks();
  installAccountSecurityLink();

  if (!user) {
    clearAccountSession();
    return;
  }

  setLocalValue("userInfo", user, 30 * 86400);
  setLocalValue("refresh_token", strictAuth ? "cc98-local-cookie-session" : "cc98-local-test-refresh", 30 * 86400);
  if (!strictAuth) {
    setLocalValue("accessToken", "Bearer cc98-local-test", 86400);
  } else {
    // The upstream Forum uses the presence of this value as its login flag.
    // The backend recognizes the sentinel and authenticates the request from
    // the HttpOnly local session cookie instead of treating it as a real token.
    setLocalValue("accessToken", "Bearer cc98-local-cookie-session", 86400);
  }
  setLocalValue("shouldNotRefreshUserInfo", true, 0);
  installMessageSettingBridge();

  if (strictAuth) {
    // Header.tsx only clears localStorage when its native log-off item is used.
    // Observe that transition and revoke the matching server-side cookie
    // session before the page leaves for the home route.
    let hadForumSession = Boolean(localStorage.getItem("accessToken") || localStorage.getItem("refresh_token"));
    const nativeStorageRemove = Storage.prototype.removeItem;
    const nativeStorageClear = Storage.prototype.clear;
    let logoutRequestStarted = false;
    const revokeLocalSession = () => {
      if (!hadForumSession) return;
      hadForumSession = false;
      if (logoutRequestStarted) return;
      logoutRequestStarted = true;
      let queued = false;
      try {
        queued = navigator.sendBeacon("/auth/logout");
      } catch {
        queued = false;
      }
      if (!queued) {
        void fetch("/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          cache: "no-store"
        }).catch(() => {});
      }
    };
    Storage.prototype.removeItem = function removeItemWithLocalLogoutBridge(key) {
      const sessionKey = key === "accessToken" || key === "refresh_token" || key === "userInfo";
      const result = nativeStorageRemove.call(this, key);
      if (this === localStorage && sessionKey && hadForumSession) {
        const stillLoggedIn = Boolean(localStorage.getItem("accessToken") || localStorage.getItem("refresh_token"));
        if (!stillLoggedIn) revokeLocalSession();
      }
      return result;
    };
    Storage.prototype.clear = function clearWithLocalLogoutBridge() {
      const shouldRevoke = this === localStorage && hadForumSession;
      const result = nativeStorageClear.call(this);
      if (shouldRevoke) revokeLocalSession();
      return result;
    };

    const handleNativeLogout = (event) => {
      const item = event.target instanceof Element ? event.target.closest("li") : null;
      if (!item || item.textContent.trim() !== "退出登录") return;
      revokeLocalSession();
    };
    document.addEventListener("click", handleNativeLogout, true);

    const markLogoutItems = () => {
      document.querySelectorAll("li").forEach((item) => {
        if (item.textContent.trim() !== "退出登录" || item.dataset.cc98LocalLogoutBound === "true") return;
        item.dataset.cc98LocalLogoutBound = "true";
      });
    };
    markLogoutItems();
    new MutationObserver(markLogoutItems).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
