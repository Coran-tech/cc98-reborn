const STORAGE_KEY = "cc98ComfortSettings";

const DEFAULT_SETTINGS = {
  enabled: true,
  theme: "soft",
  density: "comfortable",
  fontScale: 100,
  emojiScale: 100,
  neutralizeNativeSkin: true,
  rebuildUi: true,
  roundUi: true,
  cornerRadius: 10,
  imageLoadDuration: 2100,
  previsitFirstPageForTopicImages: false,
  minimalMode: false,
  homeHotOnly: false,
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
  placeholderText: "已根据你的屏蔽规则折叠一条内容"
};

const THEME_LABELS = {
  soft: "暖纸",
  mist: "清雾",
  night: "夜读",
  sage: "竹影",
  lake: "湖蓝",
  rose: "蔷薇",
  graphite: "石墨",
  midnight: "星夜",
  wine: "绛夜"
};

const PRIMARY_THEME_IDS = new Set(["soft", "mist", "night"]);
const THEME_IDS = new Set(Object.keys(THEME_LABELS));

const fields = {
  enabled: document.querySelector("#enabled"),
  themeMoreToggle: document.querySelector("#themeMoreToggle"),
  themeMoreCurrent: document.querySelector("#themeMoreCurrent"),
  themeMoreMenu: document.querySelector("#themeMoreMenu"),
  homeHotOnly: document.querySelector("#homeHotOnly"),
  previsitFirstPageForTopicImages: document.querySelector("#previsitFirstPageForTopicImages"),
  fontScale: document.querySelector("#fontScale"),
  fontScaleOutput: document.querySelector("#fontScaleOutput"),
  emojiScale: document.querySelector("#emojiScale"),
  emojiScaleOutput: document.querySelector("#emojiScaleOutput"),
  imageLoadDuration: document.querySelector("#imageLoadDuration"),
  imageLoadDurationOutput: document.querySelector("#imageLoadDurationOutput"),
  blockedBoards: document.querySelector("#blockedBoards"),
  blockedTitleKeywords: document.querySelector("#blockedTitleKeywords"),
  blockedUserIds: document.querySelector("#blockedUserIds"),
  placeholderText: document.querySelector("#placeholderText"),
  clearCookies: document.querySelector("#clearCookies"),
  cookieStatus: document.querySelector("#cookieStatus"),
  reset: document.querySelector("#reset")
};

let settings = { ...DEFAULT_SETTINGS };
let isHydrating = false;

function readRadio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value ?? DEFAULT_SETTINGS[name];
}

function normalizeTheme(value) {
  return THEME_IDS.has(value) ? value : DEFAULT_SETTINGS.theme;
}

function writeRadio(name, value) {
  const normalizedValue = name === "theme" ? normalizeTheme(value) : value;
  const input = document.querySelector(`input[name="${name}"][value="${normalizedValue}"]`);
  if (input) {
    input.checked = true;
  }
}

function setThemeMenuOpen(open) {
  if (!fields.themeMoreMenu || !fields.themeMoreToggle) {
    return;
  }
  fields.themeMoreMenu.hidden = !open;
  fields.themeMoreToggle.setAttribute("aria-expanded", String(open));
}

function updateThemeDisplay() {
  const theme = normalizeTheme(readRadio("theme"));
  if (fields.themeMoreCurrent) {
    fields.themeMoreCurrent.textContent = `当前：${THEME_LABELS[theme]}`;
  }
  if (fields.themeMoreToggle) {
    fields.themeMoreToggle.classList.toggle("is-active", !PRIMARY_THEME_IDS.has(theme));
  }
  document.body.dataset.popupTheme = theme;
}

function formatDuration(ms) {
  return `${(Number(ms) / 1000).toFixed(1)}s`;
}

function hydrate(nextSettings) {
  isHydrating = true;
  settings = { ...DEFAULT_SETTINGS, ...nextSettings };

  fields.enabled.checked = settings.enabled;
  fields.homeHotOnly.checked = settings.homeHotOnly;
  fields.previsitFirstPageForTopicImages.checked = settings.previsitFirstPageForTopicImages;
  writeRadio("theme", settings.theme);
  updateThemeDisplay();
  fields.fontScale.value = settings.fontScale;
  fields.fontScaleOutput.value = `${settings.fontScale}%`;
  fields.emojiScale.value = settings.emojiScale;
  fields.emojiScaleOutput.value = `${settings.emojiScale}%`;
  fields.imageLoadDuration.value = settings.imageLoadDuration;
  fields.imageLoadDurationOutput.value = formatDuration(settings.imageLoadDuration);
  fields.blockedBoards.value = settings.blockedBoards;
  fields.blockedTitleKeywords.value = settings.blockedTitleKeywords;
  fields.blockedUserIds.value = settings.blockedUserIds;
  fields.placeholderText.value = settings.placeholderText;

  isHydrating = false;
}

function collect() {
  return {
    enabled: fields.enabled.checked,
    theme: normalizeTheme(readRadio("theme")),
    density: DEFAULT_SETTINGS.density,
    fontScale: Number(fields.fontScale.value),
    emojiScale: Number(fields.emojiScale.value),
    neutralizeNativeSkin: DEFAULT_SETTINGS.neutralizeNativeSkin,
    rebuildUi: DEFAULT_SETTINGS.rebuildUi,
    roundUi: DEFAULT_SETTINGS.roundUi,
    cornerRadius: DEFAULT_SETTINGS.cornerRadius,
    imageLoadDuration: Number(fields.imageLoadDuration.value),
    previsitFirstPageForTopicImages: fields.previsitFirstPageForTopicImages.checked,
    minimalMode: DEFAULT_SETTINGS.minimalMode,
    homeHotOnly: fields.homeHotOnly.checked,
    softenAvatars: DEFAULT_SETTINGS.softenAvatars,
    focusReading: DEFAULT_SETTINGS.focusReading,
    hideSticky: DEFAULT_SETTINGS.hideSticky,
    aiSearchSuggestEnabled: false,
    aiSearchSuggestProvider: settings.aiSearchSuggestProvider || DEFAULT_SETTINGS.aiSearchSuggestProvider,
    aiSearchSuggestEndpoint: settings.aiSearchSuggestEndpoint || DEFAULT_SETTINGS.aiSearchSuggestEndpoint,
    aiSearchSuggestModel: settings.aiSearchSuggestModel || DEFAULT_SETTINGS.aiSearchSuggestModel,
    aiSearchSuggestApiKey: settings.aiSearchSuggestApiKey || DEFAULT_SETTINGS.aiSearchSuggestApiKey,
    externalAiSearchConsent: false,
    advancedFuzzySearch: false,
    blockedBoards: fields.blockedBoards.value,
    blockedTitleKeywords: fields.blockedTitleKeywords.value,
    blockedUserIds: fields.blockedUserIds.value,
    placeholderText: fields.placeholderText.value
  };
}

function save() {
  if (isHydrating) {
    return;
  }

  settings = collect();
  fields.fontScaleOutput.value = `${settings.fontScale}%`;
  fields.emojiScaleOutput.value = `${settings.emojiScale}%`;
  fields.imageLoadDurationOutput.value = formatDuration(settings.imageLoadDuration);
  updateThemeDisplay();
  chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

function setCookieStatus(text) {
  if (fields.cookieStatus) {
    fields.cookieStatus.textContent = text;
  }
}

function clearCc98Cookies() {
  if (!window.confirm("确定清除 CC98 Cookie？这通常会让当前账号退出登录。")) {
    return;
  }
  if (fields.clearCookies) {
    fields.clearCookies.disabled = true;
  }
  setCookieStatus("正在清除 CC98 Cookie...");
  chrome.runtime.sendMessage({ type: "CC98_REBORN_CLEAR_COOKIES" }, (response) => {
    const error = chrome.runtime.lastError?.message;
    if (fields.clearCookies) {
      fields.clearCookies.disabled = false;
    }
    if (error || !response?.ok) {
      setCookieStatus(`清除失败：${error || response?.error || "未知错误"}`);
      return;
    }
    setCookieStatus(`已清除 ${response.removed || 0} / ${response.total || 0} 个 CC98 Cookie。刷新页面后生效。`);
  });
}

function bind() {
  document.querySelectorAll("input, textarea, select").forEach((input) => {
    input.addEventListener("input", save);
    input.addEventListener("change", save);
  });

  fields.themeMoreToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    setThemeMenuOpen(fields.themeMoreMenu?.hidden ?? true);
  });

  fields.themeMoreMenu?.addEventListener("change", () => {
    updateThemeDisplay();
    setThemeMenuOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (!fields.themeMoreMenu || fields.themeMoreMenu.hidden) {
      return;
    }
    if (fields.themeMoreMenu.contains(event.target) || fields.themeMoreToggle?.contains(event.target)) {
      return;
    }
    setThemeMenuOpen(false);
  });

  fields.reset.addEventListener("click", () => {
    hydrate(DEFAULT_SETTINGS);
    chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
  });

  fields.clearCookies?.addEventListener("click", clearCc98Cookies);
}

chrome.storage.local.get(STORAGE_KEY, (result) => {
  hydrate(result[STORAGE_KEY]);
  bind();
});
