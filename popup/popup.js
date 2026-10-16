const STORAGE_KEY = "cc98ComfortSettings";
const OPENID_BINDING_STORAGE_KEY = "cc98RebornOpenIdBinding:v1";
const RELEASES_PAGE_URL = "https://github.com/Coran-tech/cc98-reborn/releases";
const BLACKLIST_ROUTE_HASH = "#cc98-reborn-blacklist";
const BLACKLIST_PAGE_URL = `https://www.cc98.org/${BLACKLIST_ROUTE_HASH}`;
const ThemeCore = globalThis.CC98RebornThemeCore;
const EMBEDDED_PARENT_ORIGIN = getEmbeddedParentOrigin();
const IS_EMBEDDED = Boolean(EMBEDDED_PARENT_ORIGIN);
const EXTENSION_MANIFEST = chrome.runtime.getManifest?.() || {};
const DISPLAY_VERSION = EXTENSION_MANIFEST.version_name || EXTENSION_MANIFEST.version || "";

function getEmbeddedParentOrigin() {
  if (new URLSearchParams(location.search).get("embedded") !== "1" || window.parent === window) return "";
  try {
    // Chromium provides the actual parent origin even when the referrer is omitted.
    const value = location.ancestorOrigins?.[0] || document.referrer;
    const parent = new URL(value);
    if (!/^https?:$/.test(parent.protocol)) return "";
    if (/^(?:www\.)?cc98\.org$/i.test(parent.hostname)
      || /(?:^|\.)webvpn\.zju\.edu\.cn$/i.test(parent.hostname)) {
      return parent.origin;
    }
  } catch {
    // Unverified or unrelated frames do not get a messaging channel.
  }
  return "";
}

function postEmbeddedMessage(message) {
  if (!IS_EMBEDDED) return false;
  window.parent.postMessage(message, EMBEDDED_PARENT_ORIGIN);
  return true;
}

function initializeEmbeddedLayout() {
  if (!IS_EMBEDDED) return;
  document.documentElement.classList.add("cc98-reborn-embedded");
  document.querySelector("#settingsSubtitle").textContent = "插件设置 · 修改后自动保存";
  const panel = document.querySelector(".popup");
  let previousHeight = 0;
  let resizeFrame = 0;
  const queueSize = () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      // Measure the content, not viewport-backed scrollHeight, so closing a group shrinks the frame.
      const height = Math.min(20000, Math.max(320, Math.ceil(panel.getBoundingClientRect().height) + 2));
      if (height !== previousHeight) {
        previousHeight = height;
        postEmbeddedMessage({ type: "cc98-reborn:settings-size", height });
      }
    });
  };
  const observer = new ResizeObserver(queueSize);
  observer.observe(panel);
  window.addEventListener("resize", queueSize);
  window.addEventListener("load", queueSize);
  window.addEventListener("pageshow", queueSize);
  document.fonts?.ready.then(queueSize);
  queueSize();
}

const DEFAULT_SETTINGS = {
  enabled: true,
  ...ThemeCore.DEFAULTS,
  ...globalThis.CC98RebornSemanticFilterCore?.DEFAULTS,
  density: "comfortable",
  fontScale: 110,
  emojiScale: 200,
  neutralizeNativeSkin: true,
  rebuildUi: true,
  roundUi: true,
  cornerRadius: 10,
  prewarmPostImages: false,
  imageLoadDuration: 2100,
  previsitFirstPageForTopicImages: true,
  openLinksInNewTab: false,
  topicDrawerEnabled: true,
  sideTopbar: false,
  replyRebornTail: true,
  questionMarkEnabled: false,
  minimalMode: false,
  homeHotOnly: true,
  expandTopicCardsByDefault: false,
  softenAvatars: true,
  hideSticky: false,
  focusReading: false,
  aiSearchSuggestEnabled: false,
  aiSearchSuggestProvider: "openai",
  aiSearchSuggestEndpoint: "",
  aiSearchSuggestModel: "",
  aiSearchSuggestApiKey: "",
  externalAiSearchConsent: false,
  advancedFuzzySearch: false,
  blockedBoards: "",
  blockedTitleKeywords: "",
  blockedUserIds: "",
  blockedContentRules: "[]",
  placeholderText: "已根据你的屏蔽规则折叠一条内容"
};

const fields = {
  enabled: document.querySelector("#enabled"),
  aboutToggle: document.querySelector("#aboutToggle"),
  aboutPopover: document.querySelector("#aboutPopover"),
  aboutVersion: document.querySelector("#aboutVersion"),
  themeCurrentTone: document.querySelector("#themeCurrentTone"),
  themeSchedule: document.querySelector("#themeSchedule"),
  themeDayStart: document.querySelector("#themeDayStart"),
  themeNightStart: document.querySelector("#themeNightStart"),
  themeScheduleError: document.querySelector("#themeScheduleError"),
  themePalettes: document.querySelector("#themePalettes"),
  themeCustomControls: document.querySelector("#themeCustomControls"),
  themeCustomPrimary: document.querySelector("#themeCustomPrimary"),
  themeCustomPrimaryHex: document.querySelector("#themeCustomPrimaryHex"),
  themeCustomSecondary: document.querySelector("#themeCustomSecondary"),
  themeCustomSecondaryHex: document.querySelector("#themeCustomSecondaryHex"),
  themeCustomColorError: document.querySelector("#themeCustomColorError"),
  homeHotOnly: document.querySelector("#homeHotOnly"),
  expandTopicCardsByDefault: document.querySelector("#expandTopicCardsByDefault"),
  prewarmPostImages: document.querySelector("#prewarmPostImages"),
  previsitFirstPageForTopicImages: document.querySelector("#previsitFirstPageForTopicImages"),
  openLinksInNewTab: document.querySelector("#openLinksInNewTab"),
  topicDrawerEnabled: document.querySelector("#topicDrawerEnabled"),
  sideTopbar: document.querySelector("#sideTopbar"),
  replyRebornTail: document.querySelector("#replyRebornTail"),
  questionMarkEnabled: document.querySelector("#questionMarkEnabled"),
  fontScale: document.querySelector("#fontScale"),
  fontScaleOutput: document.querySelector("#fontScaleOutput"),
  emojiScale: document.querySelector("#emojiScale"),
  emojiScaleOutput: document.querySelector("#emojiScaleOutput"),
  imageLoadDuration: document.querySelector("#imageLoadDuration"),
  imageLoadDurationOutput: document.querySelector("#imageLoadDurationOutput"),
  updateTopNotice: document.querySelector("#updateTopNotice"),
  updateTopText: document.querySelector("#updateTopText"),
  updateCard: document.querySelector(".update-card"),
  updateStatus: document.querySelector("#updateStatus"),
  updateCurrentVersion: document.querySelector("#updateCurrentVersion"),
  updateLatestVersion: document.querySelector("#updateLatestVersion"),
  updateCheck: document.querySelector("#updateCheck"),
  updateOpen: document.querySelector("#updateOpen"),
  openidStatus: document.querySelector("#openidStatus"),
  openidMeta: document.querySelector("#openidMeta"),
  openidBind: document.querySelector("#openidBind"),
  openidExitAccount: document.querySelector("#openidExitAccount"),
  openidLogout: document.querySelector("#openidLogout"),
  clearCc98Data: document.querySelector("#clearCc98Data"),
  clearCc98DataStatus: document.querySelector("#clearCc98DataStatus"),
  clearCc98DataConfirm: document.querySelector("#clearCc98DataConfirm"),
  confirmClearCc98Data: document.querySelector("#confirmClearCc98Data"),
  cancelClearCc98Data: document.querySelector("#cancelClearCc98Data"),
  blacklistSummary: document.querySelector("#blacklistSummary"),
  openBlacklist: document.querySelector("#openBlacklist"),
  reset: document.querySelector("#reset")
};

let settings = { ...DEFAULT_SETTINGS };
let isHydrating = false;
let latestReleaseUrl = RELEASES_PAGE_URL;
let settingsSaveTimer = null;
let pendingSettingsPatch = {};
let savingSettingsPatch = null;
let scheduleDraft = null;
let themeColorDraft = {};
let stopThemeWatch = null;
const CUSTOM_COLOR_KEYS = ["themeCustomPrimary", "themeCustomSecondary"];

function readRadio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value ?? DEFAULT_SETTINGS[name];
}

function writeRadio(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) {
    input.checked = true;
  }
}

function renderThemePalettes() {
  const palettes = [
    ...ThemeCore.PALETTES.filter((palette) => palette.id !== "custom"),
    { id: "custom", primary: settings.themeCustomPrimary, secondary: settings.themeCustomSecondary }
  ];
  for (const [index, palette] of palettes.entries()) {
    const label = document.createElement("label");
    const custom = palette.id === "custom";
    label.classList.toggle("theme-palette-custom", custom);
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "themePalette";
    input.value = palette.id;
    const description = custom ? "自定义配色" : `配色 ${index + 1}，主色 ${palette.primary}，副色 ${palette.secondary}`;
    input.setAttribute("aria-label", description);
    label.title = description;
    const card = document.createElement("span");
    const swatches = document.createElement("i");
    swatches.className = "theme-swatches";
    swatches.setAttribute("aria-hidden", "true");
    for (const color of [palette.primary, palette.secondary]) {
      const dot = document.createElement("i");
      dot.style.backgroundColor = color;
      swatches.append(dot);
    }
    card.append(swatches);
    if (custom) {
      const name = document.createElement("strong");
      name.textContent = "自定义";
      card.append(name);
    }
    label.append(input, card);
    fields.themePalettes.append(label);
  }
}

function setAboutPopoverOpen(open) {
  if (!fields.aboutPopover || !fields.aboutToggle) {
    return;
  }
  fields.aboutPopover.hidden = !open;
  fields.aboutToggle.setAttribute("aria-expanded", String(open));
}

function hydrateAboutVersion() {
  if (!fields.aboutVersion) {
    return;
  }
  fields.aboutVersion.textContent = DISPLAY_VERSION;
}

function updateThemeDisplay() {
  const tone = ThemeCore.apply(document.documentElement, settings);
  fields.themeCurrentTone.textContent = `当前${tone === "dark" ? "黑夜" : "白昼"}`;
  fields.themeSchedule.hidden = settings.themeMode !== "auto";
  fields.themeCustomControls.hidden = settings.themePalette !== "custom";
  const customCard = fields.themePalettes.querySelector(".theme-palette-custom");
  const dots = customCard?.querySelectorAll(".theme-swatches i");
  if (dots?.length === 2) {
    dots[0].style.backgroundColor = settings.themeCustomPrimary;
    dots[1].style.backgroundColor = settings.themeCustomSecondary;
    const description = `自定义配色，主色 ${settings.themeCustomPrimary}，副色 ${settings.themeCustomSecondary}`;
    customCard.title = description;
    customCard.querySelector("input").setAttribute("aria-label", description);
  }
}

function validateThemeColors() {
  const colors = {};
  const invalid = [];
  for (const key of CUSTOM_COLOR_KEYS) {
    const input = fields[`${key}Hex`];
    const color = ThemeCore.normalizeColor(input.value);
    const label = key === "themeCustomPrimary" ? "主色" : "副色";
    const error = color ? "" : `${label}请输入 #RGB 或 #RRGGBB 格式的颜色。`;
    input.setAttribute("aria-invalid", String(!color));
    input.setCustomValidity(error);
    if (color) colors[key] = color;
    else invalid.push(label);
  }
  fields.themeCustomColorError.textContent = invalid.length
    ? `${invalid.join("、")}请输入 #RGB 或 #RRGGBB 格式的颜色。` : "";
  fields.themeCustomColorError.hidden = !invalid.length;
  return colors;
}

function hydrateThemeColors() {
  for (const key of CUSTOM_COLOR_KEYS) {
    const draft = Object.hasOwn(themeColorDraft, key) ? themeColorDraft[key] : settings[key];
    fields[`${key}Hex`].value = draft;
    fields[key].value = ThemeCore.normalizeColor(draft, settings[key]);
  }
  validateThemeColors();
}

function editThemeColor(event) {
  if (isHydrating) return;
  const input = event.target;
  const key = input.dataset.themeColor;
  if (!CUSTOM_COLOR_KEYS.includes(key)) return;
  if (input.type === "color") {
    delete themeColorDraft[key];
    fields[`${key}Hex`].value = input.value;
  } else {
    themeColorDraft[key] = input.value;
    const color = ThemeCore.normalizeColor(input.value);
    if (color) fields[key].value = color;
  }
  save(event);
}

function restartThemeWatch() {
  stopThemeWatch?.();
  stopThemeWatch = ThemeCore.watch(() => settings, updateThemeDisplay);
}

function validateThemeSchedule() {
  const day = fields.themeDayStart.value;
  const night = fields.themeNightStart.value;
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const error = !validTime.test(day) || !validTime.test(night)
    ? "请填写完整的白昼和黑夜开始时间。"
    : day === night ? "白昼和黑夜的开始时间不能相同。" : "";
  fields.themeScheduleError.textContent = error;
  fields.themeScheduleError.hidden = !error;
  for (const input of [fields.themeDayStart, fields.themeNightStart]) {
    input.setAttribute("aria-invalid", String(Boolean(error)));
    input.setCustomValidity(error);
  }
  return !error;
}

function formatDuration(ms) {
  return `${(Number(ms) / 1000).toFixed(1)}s`;
}

function updatePostImagePrewarmControls() {
  const enabled = Boolean(fields.prewarmPostImages?.checked);
  if (fields.imageLoadDuration) {
    fields.imageLoadDuration.disabled = !enabled;
  }
  const range = fields.imageLoadDuration?.closest(".range");
  range?.classList.toggle("is-disabled", !enabled);
  range?.setAttribute("aria-disabled", String(!enabled));
}

function parseList(value) {
  return String(value ?? "")
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function updateBlacklistSummary() {
  if (!fields.blacklistSummary) {
    return;
  }
  const boardCount = parseList(settings.blockedBoards).length;
  const keywordCount = (globalThis.CC98RebornContentFilterCore?.splitTitleRules?.(settings.blockedTitleKeywords) || parseList(settings.blockedTitleKeywords)).length;
  const userCount = parseList(settings.blockedUserIds).length;
  let contentCount = 0;
  try { contentCount = JSON.parse(settings.blockedContentRules || "[]").length || 0; } catch {}
  fields.blacklistSummary.textContent = "当前 " + userCount + " 个用户 ID、" + keywordCount + " 条标题规则、" + boardCount + " 个版面规则、" + contentCount + " 条内容规则。语义屏蔽：" + (settings.semanticFilterEnabled === true ? "开启" : "关闭");
}

function openBlacklistPage() {
  if (postEmbeddedMessage({ type: "cc98-reborn:settings-open-blacklist" })) return;
  const openUrl = (url) => {
    try {
      chrome.tabs?.create?.({ url });
      window.close();
    } catch {
      location.href = url;
    }
  };
  const getFallbackUrl = (activeUrl) => {
    try {
      const parsed = new URL(activeUrl);
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === "www.cc98.org" || hostname === "cc98.org") {
        return `${parsed.origin}/${BLACKLIST_ROUTE_HASH}`;
      }
      if (hostname === "www-cc98-org-s.webvpn.zju.edu.cn") {
        return `${parsed.origin}/${BLACKLIST_ROUTE_HASH}`;
      }
    } catch {
      // Use the canonical direct address below.
    }
    return BLACKLIST_PAGE_URL;
  };
  try {
    chrome.tabs?.query?.({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs?.[0];
      const fallbackUrl = getFallbackUrl(activeTab?.url || "");
      if (!Number.isFinite(activeTab?.id) || typeof chrome.tabs?.sendMessage !== "function") {
        openUrl(fallbackUrl);
        return;
      }
      try {
        chrome.tabs.sendMessage(activeTab.id, {
          type: "CC98_REBORN_GET_BLACKLIST_PAGE_HREF"
        }, (response) => {
          const runtimeError = chrome.runtime.lastError;
          const href = !runtimeError && response?.ok && response.href
            ? response.href
            : fallbackUrl;
          openUrl(href);
        });
      } catch {
        openUrl(fallbackUrl);
      }
    });
  } catch {
    openUrl(BLACKLIST_PAGE_URL);
  }
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: "empty-response" });
      });
    } catch (error) {
      resolve({ ok: false, error: error?.message || "send-failed" });
    }
  });
}

function sendActiveTabMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs?.query?.({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        const tabId = tabs?.[0]?.id;
        if (!tabId) {
          resolve({ ok: false, error: "no-active-tab" });
          return;
        }
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "empty-response" });
        });
      });
    } catch (error) {
      resolve({ ok: false, error: error?.message || "send-tab-message-failed" });
    }
  });
}

function formatUpdateTime(timestamp) {
  const time = Number(timestamp);
  if (!time) {
    return "";
  }
  const date = new Date(time);
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateTime(timestamp) {
  const time = Number(timestamp);
  if (!time) {
    return "";
  }
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function setUpdateStatus(status = {}) {
  const currentVersion = DISPLAY_VERSION || status.currentVersion || "";
  const latestVersion = status.latestVersion || "";
  latestReleaseUrl = status.releaseUrl || RELEASES_PAGE_URL;
  const checkedAt = formatUpdateTime(status.checkedAt);
  let state = "idle";
  let text = "\u5c1a\u672a\u68c0\u67e5\u66f4\u65b0";
  if (status.checking) {
    state = "checking";
    text = "\u6b63\u5728\u68c0\u67e5\u66f4\u65b0\u2026";
  } else if (status.hasUpdate) {
    state = "available";
    text = `\u53d1\u73b0\u65b0\u7248\u672c v${latestVersion}`;
  } else if (status.ok) {
    state = "current";
    text = checkedAt ? `\u5df2\u662f\u6700\u65b0\u7248\u672c\u3000${checkedAt}` : "\u5df2\u662f\u6700\u65b0\u7248\u672c";
  } else if (status.error) {
    state = "error";
    text = `\u68c0\u67e5\u5931\u8d25\uff1a${status.error}`;
  }

  if (fields.updateCard) {
    fields.updateCard.dataset.state = state;
  }
  if (fields.updateStatus) {
    fields.updateStatus.textContent = text;
  }
  if (fields.updateCurrentVersion) {
    const label = /^beta\s/i.test(currentVersion) ? currentVersion : `v${currentVersion}`;
    fields.updateCurrentVersion.textContent = currentVersion ? `\u5f53\u524d ${label}` : "";
  }
  if (fields.updateLatestVersion) {
    fields.updateLatestVersion.textContent = latestVersion ? `\u6700\u65b0 v${latestVersion}` : "";
  }
  if (fields.updateOpen) {
    fields.updateOpen.hidden = !status.hasUpdate;
  }
  if (fields.updateTopNotice) {
    fields.updateTopNotice.hidden = !status.hasUpdate;
  }
  if (fields.updateTopText && status.hasUpdate) {
    fields.updateTopText.textContent = latestVersion ? `\u53d1\u73b0\u65b0\u7248\u672c v${latestVersion}` : "\u53d1\u73b0\u65b0\u7248\u672c";
  }
}

async function requestUpdateStatus(force = false) {
  if (fields.updateCheck) {
    fields.updateCheck.disabled = true;
  }
  setUpdateStatus({ checking: true, currentVersion: chrome.runtime.getManifest?.().version || "" });
  const status = await sendRuntimeMessage({
    type: force ? "CC98_REBORN_CHECK_UPDATE" : "CC98_REBORN_GET_UPDATE_STATUS",
    force
  });
  setUpdateStatus(status);
  if (!force && (!status?.checkedAt || Date.now() - Number(status.checkedAt) > 30 * 60 * 1000)) {
    const freshStatus = await sendRuntimeMessage({ type: "CC98_REBORN_CHECK_UPDATE", force: false });
    setUpdateStatus(freshStatus);
  }
  if (fields.updateCheck) {
    fields.updateCheck.disabled = false;
  }
}

function setOpenIdUi(result = {}) {
  const binding = result.binding;
  const isBound = Boolean(result.ok && binding?.bound);
  if (fields.openidStatus) {
    fields.openidStatus.hidden = isBound;
    fields.openidStatus.dataset.state = result.error ? "error" : (isBound ? "bound" : "idle");
    fields.openidStatus.textContent = result.error
      ? `\u7ed1\u5b9a\u5931\u8d25\uff1a${result.error}`
      : "\u672a\u7ed1\u5b9a";
  }
  if (fields.openidMeta) {
    fields.openidMeta.hidden = !isBound;
    fields.openidMeta.innerHTML = "";
    if (isBound) {
      [
        `\u5df2\u7ed1\u5b9a ${binding.userName || "CC98 \u7528\u6237"}`,
        `UID ${binding.userId || "\u672a\u77e5"}`,
        `\u7ed1\u5b9a\u65f6\u95f4 ${formatDateTime(binding.boundAt) || "\u672a\u77e5"}`
      ].forEach((text) => {
        const item = document.createElement("span");
        item.textContent = text;
        fields.openidMeta.append(item);
      });
    }
  }
  if (fields.openidBind) {
    fields.openidBind.hidden = isBound;
    fields.openidBind.disabled = false;
    fields.openidBind.textContent = "\u7ed1\u5b9a CC98";
  }
  if (fields.openidExitAccount) {
    fields.openidExitAccount.disabled = false;
  }
  if (fields.openidLogout) {
    fields.openidLogout.hidden = !isBound;
    fields.openidLogout.disabled = false;
  }
}

async function requestOpenIdState() {
  const result = await sendRuntimeMessage({ type: "CC98_REBORN_OPENID_GET_STATE" });
  setOpenIdUi(result);
}

async function bindOpenId() {
  if (fields.openidBind) {
    fields.openidBind.disabled = true;
  }
  if (fields.openidExitAccount) {
    fields.openidExitAccount.disabled = true;
  }
  if (fields.openidStatus) {
    fields.openidStatus.dataset.state = "pending";
    fields.openidStatus.textContent = "\u6b63\u5728\u786e\u8ba4\u5f53\u524d CC98 \u7f51\u9875\u8d26\u53f7\u2026";
  }
  const accountResult = await sendRuntimeMessage({ type: "CC98_REBORN_FIND_CURRENT_WEB_ACCOUNT" });
  if (!accountResult?.ok || !accountResult.account) {
    setOpenIdUi({
      ok: false,
      error: accountResult?.error || "\u8bf7\u5148\u6253\u5f00\u5df2\u767b\u5f55\u7684 CC98 \u9875\u9762\uff0c\u518d\u7ed1\u5b9a\u540c\u4e00\u8d26\u53f7\u7684 OpenID\u3002"
    });
    return;
  }
  if (!accountResult.account.userId) {
    setOpenIdUi({
      ok: false,
      error: "\u5f53\u524d CC98 \u9875\u9762\u672a\u80fd\u8bfb\u53d6\u5230 UID\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u518d\u7ed1\u5b9a\u3002"
    });
    return;
  }
  if (fields.openidStatus) {
    fields.openidStatus.dataset.state = "pending";
    fields.openidStatus.textContent = "\u6b63\u5728\u6253\u5f00 CC98 OpenID \u6388\u6743\u2026";
  }
  const result = await sendRuntimeMessage({
    type: "CC98_REBORN_OPENID_LOGIN",
    expectedAccount: accountResult.account,
    authTransport: accountResult.authTransport || "direct"
  });
  setOpenIdUi(result);
}

async function exitCurrentAccount() {
  if (fields.openidExitAccount) {
    fields.openidExitAccount.disabled = true;
  }
  if (fields.openidBind) {
    fields.openidBind.disabled = true;
  }
  if (fields.openidLogout) {
    fields.openidLogout.disabled = true;
  }
  if (fields.openidStatus) {
    fields.openidStatus.dataset.state = "pending";
    fields.openidStatus.textContent = "\u6b63\u5728\u9000\u51fa\u5f53\u524d CC98 \u7f51\u9875\u8d26\u53f7\u2026";
  }
  const result = await sendRuntimeMessage({ type: "CC98_REBORN_EXIT_CURRENT_WEB_ACCOUNT" });
  if (result?.ok) {
    if (fields.openidStatus) {
      fields.openidStatus.dataset.state = "pending";
      fields.openidStatus.textContent = "\u5df2\u53d1\u8d77\u9000\u51fa\uff0c\u9875\u9762\u5c06\u8df3\u8f6c\u5230\u767b\u5f55\u9875\u3002";
    }
    if (!IS_EMBEDDED) window.setTimeout(() => window.close(), 450);
    return;
  }
  if (fields.openidStatus) {
    fields.openidStatus.dataset.state = "error";
    fields.openidStatus.textContent = `\u9000\u51fa\u5931\u8d25\uff1a${result?.error || "\u8bf7\u5148\u6253\u5f00\u5df2\u767b\u5f55\u7684 CC98 \u9875\u9762\u3002"}`;
  }
  if (fields.openidExitAccount) {
    fields.openidExitAccount.disabled = false;
  }
  if (fields.openidBind && !fields.openidBind.hidden) {
    fields.openidBind.disabled = false;
  }
  if (fields.openidLogout && !fields.openidLogout.hidden) {
    fields.openidLogout.disabled = false;
  }
}

async function logoutOpenId() {
  if (fields.openidLogout) {
    fields.openidLogout.disabled = true;
  }
  const result = await sendRuntimeMessage({ type: "CC98_REBORN_OPENID_LOGOUT" });
  setOpenIdUi(result);
}

function setClearCc98DataStatus(text, state = "idle") {
  if (!fields.clearCc98DataStatus) {
    return;
  }
  fields.clearCc98DataStatus.textContent = text;
  fields.clearCc98DataStatus.dataset.state = state;
}

async function clearCc98SiteData(confirmed = false) {
  if (IS_EMBEDDED && !confirmed) {
    fields.clearCc98DataConfirm.hidden = false;
    fields.clearCc98Data.setAttribute("aria-expanded", "true");
    fields.cancelClearCc98Data.focus();
    return;
  }
  if (!IS_EMBEDDED && !window.confirm("这会用于刷新十大；同时会抹掉本地存储的稍后再看、版面置顶与草稿等数据，请谨慎。确定继续吗？")) {
    return;
  }
  fields.clearCc98DataConfirm.hidden = true;
  fields.clearCc98Data.setAttribute("aria-expanded", "false");
  if (fields.clearCc98Data) {
    fields.clearCc98Data.disabled = true;
  }
  setClearCc98DataStatus("正在清除 CC98 Cookie 和站点数据…", "pending");
  const result = await sendRuntimeMessage({ type: "CC98_REBORN_CLEAR_CC98_SITE_DATA" });
  if (result?.ok) {
    const tabText = Number(result.reloadedTabs) > 0 ? `，已刷新 ${result.reloadedTabs} 个 CC98 标签页` : "";
    setClearCc98DataStatus(`已清除 CC98 Cookie 和本地站点数据${tabText}。`, "success");
  } else {
    setClearCc98DataStatus(`清除失败：${result?.error || "unknown-error"}`, "error");
  }
  if (fields.clearCc98Data) {
    fields.clearCc98Data.disabled = false;
  }
}

function hydrate(nextSettings) {
  isHydrating = true;
  settings = { ...DEFAULT_SETTINGS, ...nextSettings, ...ThemeCore.normalize(nextSettings) };

  fields.enabled.checked = settings.enabled;
  fields.homeHotOnly.checked = settings.homeHotOnly;
  fields.expandTopicCardsByDefault.checked = settings.expandTopicCardsByDefault;
  fields.prewarmPostImages.checked = settings.prewarmPostImages;
  fields.previsitFirstPageForTopicImages.checked = settings.previsitFirstPageForTopicImages;
  fields.openLinksInNewTab.checked = settings.openLinksInNewTab;
  fields.topicDrawerEnabled.checked = settings.topicDrawerEnabled;
  fields.sideTopbar.checked = settings.sideTopbar;
  fields.replyRebornTail.checked = settings.replyRebornTail;
  fields.questionMarkEnabled.checked = settings.questionMarkEnabled === true;
  writeRadio("themeMode", settings.themeMode);
  writeRadio("themeStyle", settings.themeStyle);
  writeRadio("themePalette", settings.themePalette);
  fields.themeDayStart.value = scheduleDraft?.day ?? settings.themeDayStart;
  fields.themeNightStart.value = scheduleDraft?.night ?? settings.themeNightStart;
  validateThemeSchedule();
  hydrateThemeColors();
  updateThemeDisplay();
  restartThemeWatch();
  fields.fontScale.value = settings.fontScale;
  fields.fontScaleOutput.value = `${settings.fontScale}%`;
  fields.emojiScale.value = settings.emojiScale;
  fields.emojiScaleOutput.value = `${settings.emojiScale}%`;
  fields.imageLoadDuration.value = settings.imageLoadDuration;
  fields.imageLoadDurationOutput.value = formatDuration(settings.imageLoadDuration);
  updatePostImagePrewarmControls();
  updateBlacklistSummary();

  isHydrating = false;
}

function collect() {
  return {
    ...settings,
    enabled: fields.enabled.checked,
    themeMode: readRadio("themeMode"),
    themeStyle: readRadio("themeStyle"),
    themePalette: readRadio("themePalette"),
    ...validateThemeColors(),
    ...(validateThemeSchedule() ? {
      themeDayStart: fields.themeDayStart.value,
      themeNightStart: fields.themeNightStart.value
    } : {}),
    fontScale: Number(fields.fontScale.value),
    emojiScale: Number(fields.emojiScale.value),
    prewarmPostImages: fields.prewarmPostImages.checked,
    imageLoadDuration: Number(fields.imageLoadDuration.value),
    previsitFirstPageForTopicImages: fields.previsitFirstPageForTopicImages.checked,
    openLinksInNewTab: fields.openLinksInNewTab.checked,
    topicDrawerEnabled: fields.topicDrawerEnabled.checked,
    sideTopbar: fields.sideTopbar.checked,
    replyRebornTail: fields.replyRebornTail.checked,
    questionMarkEnabled: fields.questionMarkEnabled.checked,
    homeHotOnly: fields.homeHotOnly.checked,
    expandTopicCardsByDefault: fields.expandTopicCardsByDefault.checked
  };
}

function persistSettings() {
  settingsSaveTimer = null;
  if (savingSettingsPatch || !Object.keys(pendingSettingsPatch).length) {
    return;
  }
  savingSettingsPatch = pendingSettingsPatch;
  pendingSettingsPatch = {};
  // Read just before writing so a theme edit preserves settings changed in the page.
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    if (chrome.runtime.lastError) {
      pendingSettingsPatch = { ...savingSettingsPatch, ...pendingSettingsPatch };
      savingSettingsPatch = null;
      return;
    }
    const current = result[STORAGE_KEY] || {};
    const next = { ...DEFAULT_SETTINGS, ...current, ...ThemeCore.normalize(current), ...savingSettingsPatch };
    chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
      if (chrome.runtime.lastError) {
        pendingSettingsPatch = { ...savingSettingsPatch, ...pendingSettingsPatch };
        savingSettingsPatch = null;
        return;
      }
      savingSettingsPatch = null;
      if (Object.keys(pendingSettingsPatch).length) {
        persistSettings();
      }
    });
  });
}

function save(event) {
  if (isHydrating) {
    return;
  }

  const isTimeEdit = event?.target?.matches("input[type='time']");
  if (isTimeEdit) {
    scheduleDraft = { day: fields.themeDayStart.value, night: fields.themeNightStart.value };
    if (!validateThemeSchedule()) {
      return;
    }
    scheduleDraft = null;
  }
  const next = collect();
  for (const [key, value] of Object.entries(next)) {
    if (value !== settings[key]) {
      pendingSettingsPatch[key] = value;
    }
  }
  settings = next;
  fields.fontScaleOutput.value = `${settings.fontScale}%`;
  fields.emojiScaleOutput.value = `${settings.emojiScale}%`;
  fields.imageLoadDurationOutput.value = formatDuration(settings.imageLoadDuration);
  updatePostImagePrewarmControls();
  updateThemeDisplay();
  restartThemeWatch();
  updateBlacklistSummary();
  window.clearTimeout(settingsSaveTimer);
  if (event?.type === "input") {
    settingsSaveTimer = window.setTimeout(persistSettings, 140);
  } else {
    persistSettings();
  }
}

function bind() {
  document.querySelectorAll("input, textarea, select").forEach((input) => {
    if (input.matches("[data-settings-transfer]")) return;
    if (input.matches("[data-theme-color]")) return;
    if (input.matches("input[type='range'], input[type='text'], input[type='number'], textarea")) {
      input.addEventListener("input", save);
    }
    input.addEventListener("change", save);
  });

  document.querySelectorAll("[data-theme-color]").forEach((input) => {
    input.addEventListener("input", editThemeColor);
    input.addEventListener("change", editThemeColor);
    if (input.type === "text") {
      input.addEventListener("blur", () => {
        const color = ThemeCore.normalizeColor(input.value);
        if (!color) return;
        input.value = color;
        delete themeColorDraft[input.dataset.themeColor];
        validateThemeColors();
        save({ type: "change", target: input });
      });
    }
  });

  for (const input of [fields.themeDayStart, fields.themeNightStart]) {
    input.addEventListener("input", () => {
      scheduleDraft = { day: fields.themeDayStart.value, night: fields.themeNightStart.value };
      validateThemeSchedule();
    });
  }

  window.addEventListener("pagehide", () => {
    if (!settingsSaveTimer && !Object.keys(pendingSettingsPatch).length) {
      return;
    }
    window.clearTimeout(settingsSaveTimer);
    persistSettings();
  });

  fields.aboutToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    setAboutPopoverOpen(fields.aboutPopover?.hidden ?? true);
  });

  fields.updateCheck?.addEventListener("click", () => {
    requestUpdateStatus(true);
  });

  fields.updateOpen?.addEventListener("click", () => {
    sendRuntimeMessage({
      type: "CC98_REBORN_OPEN_RELEASES",
      url: latestReleaseUrl || RELEASES_PAGE_URL
    });
  });

  fields.updateTopNotice?.addEventListener("click", () => {
    sendRuntimeMessage({
      type: "CC98_REBORN_OPEN_RELEASES",
      url: latestReleaseUrl || RELEASES_PAGE_URL
    });
  });

  fields.openidBind?.addEventListener("click", () => {
    bindOpenId();
  });

  fields.openidExitAccount?.addEventListener("click", () => {
    exitCurrentAccount();
  });

  fields.openidLogout?.addEventListener("click", () => {
    logoutOpenId();
  });

  fields.clearCc98Data?.addEventListener("click", () => {
    clearCc98SiteData();
  });

  fields.confirmClearCc98Data?.addEventListener("click", () => {
    clearCc98SiteData(true);
  });

  fields.cancelClearCc98Data?.addEventListener("click", () => {
    fields.clearCc98DataConfirm.hidden = true;
    fields.clearCc98Data.setAttribute("aria-expanded", "false");
    fields.clearCc98Data.focus();
  });

  fields.openBlacklist?.addEventListener("click", () => {
    openBlacklistPage();
  });

  document.addEventListener("click", (event) => {
    if (fields.aboutPopover && !fields.aboutPopover.hidden) {
      if (!fields.aboutPopover.contains(event.target) && !fields.aboutToggle?.contains(event.target)) {
        setAboutPopoverOpen(false);
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setAboutPopoverOpen(false);
      if (!fields.clearCc98DataConfirm.hidden) {
        fields.clearCc98DataConfirm.hidden = true;
        fields.clearCc98Data.setAttribute("aria-expanded", "false");
        fields.clearCc98Data.focus();
      }
    }
  });

  fields.reset.addEventListener("click", () => {
    window.clearTimeout(settingsSaveTimer);
    scheduleDraft = null;
    themeColorDraft = {};
    pendingSettingsPatch = { ...DEFAULT_SETTINGS };
    hydrate(DEFAULT_SETTINGS);
    persistSettings();
  });
}

initializeEmbeddedLayout();

chrome.storage.local.get(STORAGE_KEY, (result) => {
  renderThemePalettes();
  hydrateAboutVersion();
  hydrate(result[STORAGE_KEY]);
  bind();
  requestOpenIdState();
  requestUpdateStatus(false);
});

chrome.storage.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  if (changes?.[STORAGE_KEY]) {
    const current = changes[STORAGE_KEY].newValue || {};
    hydrate({ ...current, ...ThemeCore.normalize(current), ...savingSettingsPatch, ...pendingSettingsPatch });
  }
  if (changes?.[OPENID_BINDING_STORAGE_KEY]) {
    const binding = changes[OPENID_BINDING_STORAGE_KEY].newValue;
    setOpenIdUi({
      ok: true,
      binding: binding?.bound ? binding : null
    });
  }
});
