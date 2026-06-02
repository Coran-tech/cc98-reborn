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

const fields = {
  enabled: document.querySelector("#enabled"),
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
  reset: document.querySelector("#reset")
};

let settings = { ...DEFAULT_SETTINGS };
let isHydrating = false;

function readRadio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value ?? DEFAULT_SETTINGS[name];
}

function writeRadio(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) {
    input.checked = true;
  }
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
    theme: readRadio("theme"),
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
  chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

function bind() {
  document.querySelectorAll("input, textarea, select").forEach((input) => {
    input.addEventListener("input", save);
    input.addEventListener("change", save);
  });

  fields.reset.addEventListener("click", () => {
    hydrate(DEFAULT_SETTINGS);
    chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
  });
}

chrome.storage.local.get(STORAGE_KEY, (result) => {
  hydrate(result[STORAGE_KEY]);
  bind();
});
