const STORAGE_KEY = "cc98ComfortSettings";
const RELEASES_PAGE_URL = "https://github.com/Coran-tech/cc98-reborn/releases";

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
  updateTopNotice: document.querySelector("#updateTopNotice"),
  updateTopText: document.querySelector("#updateTopText"),
  updateCard: document.querySelector(".update-card"),
  updateStatus: document.querySelector("#updateStatus"),
  updateCurrentVersion: document.querySelector("#updateCurrentVersion"),
  updateLatestVersion: document.querySelector("#updateLatestVersion"),
  updateCheck: document.querySelector("#updateCheck"),
  updateOpen: document.querySelector("#updateOpen"),
  blockedBoards: document.querySelector("#blockedBoards"),
  blockedTitleKeywords: document.querySelector("#blockedTitleKeywords"),
  blockedUserIds: document.querySelector("#blockedUserIds"),
  placeholderText: document.querySelector("#placeholderText"),
  reset: document.querySelector("#reset")
};

let settings = { ...DEFAULT_SETTINGS };
let isHydrating = false;
let latestReleaseUrl = RELEASES_PAGE_URL;

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

function formatUpdateTime(timestamp) {
  const time = Number(timestamp);
  if (!time) {
    return "";
  }
  const date = new Date(time);
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function setUpdateStatus(status = {}) {
  const currentVersion = status.currentVersion || chrome.runtime.getManifest?.().version || "";
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
    fields.updateCurrentVersion.textContent = currentVersion ? `\u5f53\u524d v${currentVersion}` : "";
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
}

chrome.storage.local.get(STORAGE_KEY, (result) => {
  hydrate(result[STORAGE_KEY]);
  bind();
  requestUpdateStatus(false);
});
