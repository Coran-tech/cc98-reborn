const STORAGE_KEY = "cc98ComfortSettings";
<<<<<<< Updated upstream
const EXTENSION_VERSION = "0.1.4";
=======
const EXTENSION_VERSION = "0.1.5";
>>>>>>> Stashed changes
const LOGIN_REDIRECT_MARK_KEY = "cc98RebornLoginRedirectStartedAt";
const LOGOUT_REDIRECT_MARK_KEY = "cc98RebornLogoutRedirectStartedAt";
const FIRST_PAGE_PREVISIT_PENDING_KEY = "cc98RebornFirstPagePrevisitPending";
const FIRST_PAGE_PREVISIT_DONE_PREFIX = "cc98RebornFirstPagePrevisitDone:";
const FIRST_PAGE_PREVISIT_TTL = 5 * 60 * 1000;
const VOTE_OPTIMISTIC_COUNT_TTL = 2100;
const VOTE_OPTIMISTIC_STATE_TTL = 2600;
const HOME_HOT_RANK_CACHE_KEY_PREFIX = "cc98RebornHomeHotRanking:v1:";
const SEARCH_EMPTY_INITIAL_GRACE_MS = 2600;
const SEARCH_EMPTY_LOADING_GRACE_MS = 7000;
const EXTERNAL_AI_SEARCH_REQUIRES_EXPLICIT_CONSENT = true;
// Disabled until the official CC98 OAuth authorization flow is wired.
const WATERMARK_FEATURE_ENABLED = false;
const WATERMARK_CACHE_TTL = 30 * 60 * 1000;
const WATERMARK_DIRECTION_INTERVAL = 3600;
const WATERMARK_REVALIDATE_INTERVAL = 5 * 60 * 1000;

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

const BLOCKABLE_SELECTORS = [
  ".focus-topic",
  ".card-topic",
  ".mainPageListRow",
  ".recommendedReadingContent",
  ".specialOfferRow",
  ".card-recommendation-topic-container-item",
  ".boardContent",
  ".noImgBoardContent"
].join(",");

let lastSettings = null;
let observer = null;
let headObserver = null;
let filterQueued = false;
let isFiltering = false;
let rebuildQueued = false;
let isRebuilding = false;
let syncQueued = false;
let delayedRebuildTimers = [];
let historyPatched = false;
let autoLoadArmed = false;
let isPokingNativeScroll = false;
let lastAutoLoadAt = 0;
let lastSyncScheduledAt = 0;
let lazyPrewarmPromise = null;
let lazyPrewarmedPageKey = "";
let prewarmedSnapshotPageKey = "";
let prewarmedPostSnapshots = [];
let originalPagePrewarmPromise = null;
let originalPagePrewarmPageKey = "";
let firstPagePrevisitInProgress = false;
let loadingOverlayActive = false;
let loadingOverlayMessage = "";
let loadingOverlayWatchdog = null;
let messageTitleObserver = null;
let nativeAntUiObserver = null;
let nativeAntUiStabilizeTimer = null;
let legacyQuoteGuardObserver = null;
let imageViewerScale = 1;
let imageViewerOffsetX = 0;
let imageViewerOffsetY = 0;
let imageViewerPushedState = false;
let imageViewerItems = [];
let imageViewerIndex = -1;
let nativePostSubmitRefreshTimers = [];
let editorColorPopoverSequence = 0;
let editorColorGlobalInterceptorBound = false;
let editorFontSizePopoverSequence = 0;
let editorFontSizeGlobalInterceptorBound = false;
let legacyColorPickerObserver = null;
let legacyColorPickerInterval = null;
let loginRedirectWatcherTimer = null;
let topbarAuthRedirectBound = false;
let searchPageEmptyRecheckTimer = null;
let routeFollowupTimers = [];
let searchPageRouteKey = "";
let searchPageRouteFirstSeenAt = 0;
const originalPosterIdentityPrefetches = new Map();
const neutralizedLinks = new WeakMap();
const reparentedNativeNodes = new WeakMap();
const nativeEditorStabilizers = new WeakSet();
const nativeUserCenterStabilizers = new WeakSet();
const nativeTopbarUserStabilizers = new WeakSet();
const proxyControlSyncTimers = new WeakMap();
const searchSuggestionCache = new Map();
const homeHotRankingStates = new Map();
let searchSuggestionLastFetchAt = 0;
let searchSuggestionSequence = 0;
let aiSearchSuggestionLastFetchAt = 0;
let advancedFuzzySearchSequence = 0;
let securityWatermarkHost = null;
let securityWatermarkRoot = null;
let securityWatermarkCanvas = null;
let securityWatermarkAnimationFrame = 0;
let securityWatermarkDirectionTimer = 0;
let securityWatermarkEnsureTimer = 0;
let securityWatermarkRevalidateTimer = 0;
let securityWatermarkObserver = null;
let securityWatermarkCode = "";
let securityWatermarkCachedCode = "";
let securityWatermarkCachedAt = 0;
let securityWatermarkBridgeListenerBound = false;
let securityWatermarkOffsetX = 0;
let securityWatermarkOffsetY = 0;
let securityWatermarkLastFrameAt = 0;
let securityWatermarkDirection = { x: 0.42, y: -0.28 };

const AI_SEARCH_PROVIDER_DEFAULTS = {
  openai: {
    endpoint: "",
    model: ""
  },
  deepseek: {
    endpoint: "",
    model: ""
  }
};

const SEARCH_SPLIT_HINTS = [
  "医学院", "竺院", "信电", "计院", "临床", "口腔", "药学", "护理",
  "混合班", "选拔", "人工智能", "机器学习", "深度学习", "大模型", "计算机", "软工",
  "推免", "保研", "考研", "复试", "选课", "补选", "退课", "春夏", "秋冬",
  "大一", "大二", "大三", "大四", "体测", "补测", "免测", "跑腿", "证明",
  "1000米", "800米", "军训", "绩点", "综评", "奖学金", "转专业", "实习", "实验", "有偿",
  "ChatGPT", "Codex", "deepseek", "openai"
];

const SEARCH_SOLID_TERMS = new Set([
  "混合班", "人工智能", "机器学习", "深度学习", "大模型", "ChatGPT", "Codex", "DeepSeek", "OpenAI", "1000米", "800米"
].map((term) => term.toLowerCase()));

const SEARCH_OPTIONAL_TERMS = new Set([
  "我", "你", "他", "她", "它", "我们", "你们", "他们", "她们", "为什么", "为啥", "什么",
  "怎么", "如何", "是否", "需要", "要", "进", "去", "吗", "呢", "吧", "的", "了",
  "求问", "请问", "有没有", "有无", "关于", "咨询", "求助", "分析", "利弊", "证明", "跑腿"
]);

const SEARCH_IMPORTANT_TERMS = new Set([
  "选课", "推免", "保研", "考研", "复试", "人工智能", "机器学习", "深度学习", "大模型",
  "体测", "补测", "免测", "临床", "医学院", "竺院", "混合班", "选拔", "转专业", "绩点", "综评", "奖学金"
]);

const SEARCH_STOP_PHRASES = [
  "为什么", "为啥", "怎么", "如何", "是否", "有没有", "有无", "我", "你", "他", "她", "它",
  "我们", "你们", "他们", "她们", "需要", "想", "要", "进", "去", "上", "吗", "呢", "吧", "的", "了",
  "利弊", "分析", "求问", "请问", "关于", "咨询", "求助"
];

const TOPIC_TIME_PATTERN = "(?:刚刚|\\d+\\s*(?:秒前|分钟前|小时前|天前|周前|月前|年前)|(?:今天|昨天|前天)\\s*\\d{1,2}:\\d{2}(?::\\d{2})?|\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)?|\\d{1,2}[-/]\\d{1,2}\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)";
const TOPIC_TIME_RE = new RegExp(`^${TOPIC_TIME_PATTERN}$`);

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    density: DEFAULT_SETTINGS.density,
    neutralizeNativeSkin: DEFAULT_SETTINGS.neutralizeNativeSkin,
    rebuildUi: DEFAULT_SETTINGS.rebuildUi,
    roundUi: DEFAULT_SETTINGS.roundUi,
    cornerRadius: DEFAULT_SETTINGS.cornerRadius,
    minimalMode: DEFAULT_SETTINGS.minimalMode,
    softenAvatars: DEFAULT_SETTINGS.softenAvatars,
    focusReading: DEFAULT_SETTINGS.focusReading,
    hideSticky: DEFAULT_SETTINGS.hideSticky,
    aiSearchSuggestEnabled: false,
    advancedFuzzySearch: false,
    fontScale: clampNumber(settings.fontScale, 90, 120, DEFAULT_SETTINGS.fontScale),
    emojiScale: clampNumber(settings.emojiScale, 70, 200, DEFAULT_SETTINGS.emojiScale),
    imageLoadDuration: clampNumber(settings.imageLoadDuration, 800, 8000, DEFAULT_SETTINGS.imageLoadDuration),
    previsitFirstPageForTopicImages: Boolean(settings.previsitFirstPageForTopicImages),
    aiSearchSuggestProvider: ["openai", "deepseek"].includes(settings.aiSearchSuggestProvider)
      ? settings.aiSearchSuggestProvider
      : DEFAULT_SETTINGS.aiSearchSuggestProvider,
    aiSearchSuggestEndpoint: String(settings.aiSearchSuggestEndpoint ?? DEFAULT_SETTINGS.aiSearchSuggestEndpoint).trim(),
    aiSearchSuggestModel: String(settings.aiSearchSuggestModel ?? DEFAULT_SETTINGS.aiSearchSuggestModel).trim(),
    aiSearchSuggestApiKey: String(settings.aiSearchSuggestApiKey ?? "").trim(),
    externalAiSearchConsent: Boolean(settings.externalAiSearchConsent),
    blockedBoards: String(settings.blockedBoards ?? ""),
    blockedTitleKeywords: String(settings.blockedTitleKeywords ?? ""),
    blockedUserIds: String(settings.blockedUserIds ?? ""),
    placeholderText: String(settings.placeholderText ?? DEFAULT_SETTINGS.placeholderText).trim() || DEFAULT_SETTINGS.placeholderText
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function applySettings(settings) {
  lastSettings = normalizeSettings(settings);
  ensureSecurityWatermark();
  enforceRecentLogoutRedirectIntent();
  bindGlobalTopbarAuthRedirects();

  const root = document.documentElement;
  root.classList.toggle("cc98-comfort", lastSettings.enabled);
  root.dataset.cc98ComfortTheme = lastSettings.theme;
  root.dataset.cc98ComfortDensity = lastSettings.density;
  root.dataset.cc98ComfortAvatars = String(lastSettings.softenAvatars);
  root.dataset.cc98ComfortHideSticky = String(lastSettings.hideSticky);
  root.dataset.cc98ComfortFocus = String(lastSettings.focusReading);
  root.dataset.cc98ComfortNeutralizeSkin = String(lastSettings.neutralizeNativeSkin);
  root.dataset.cc98ComfortRebuild = String(lastSettings.rebuildUi);
  root.dataset.cc98ComfortRound = String(lastSettings.roundUi);
  root.dataset.cc98ComfortMinimal = String(lastSettings.minimalMode);
  root.dataset.cc98ComfortHomeHotOnly = String(lastSettings.homeHotOnly);
  root.dataset.cc98ComfortPrevisitFirstPage = String(lastSettings.previsitFirstPageForTopicImages);
  root.style.setProperty("--cc98-comfort-font-scale", `${lastSettings.fontScale}%`);
  root.style.setProperty("--cc98-emoji-size", `${(1.75 * lastSettings.emojiScale / 100).toFixed(3)}em`);
  root.style.setProperty("--cc98-editor-emoji-size", `${(2.2 * lastSettings.emojiScale / 100).toFixed(3)}em`);
  root.style.setProperty("--cc98-comfort-radius", `${lastSettings.cornerRadius}px`);

  scheduleFiltering();
  stabilizeEmojiRendering(document);
  scheduleRebuild();
  applyNativeSkinPolicy();
  ensureObserver();
  ensureHeadObserver();
  ensureNativeAntUiStabilizer();
  scheduleNativeAntUiStabilize();
  patchHistoryNavigation();
  handleTopicFirstPagePrevisitNavigation();
}

function loadSettings() {
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    applySettings(result[STORAGE_KEY]);
  });
}

function parseList(value) {
  return String(value ?? "")
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[【】[\]\s]/g, "")
    .toLowerCase();
}

function getBoardInfo(item) {
  const boardNode = item.querySelector(".focus-topic-board, .card-topic-boardName, .mainPageListBoardName, .boardName2, .card-recommendation-topic-detail a");
  const names = [];
  const ids = [];

  if (boardNode?.textContent) {
    names.push(boardNode.textContent);
  }

  item.querySelectorAll('a[href*="/board/"]').forEach((link) => {
    const match = link.href.match(/\/board\/(\d+)/);
    if (match) {
      ids.push(match[1]);
    }
    if (link.textContent) {
      names.push(link.textContent);
    }
  });

  return {
    names: [...new Set(names.map((name) => name.replace(/[【】[\]]/g, "").trim()).filter(Boolean))],
    ids: [...new Set(ids)]
  };
}

function getTitleText(item) {
  const titleNode = item.querySelector(".focus-topic-title, .card-topic-title, .mainPageListTitle a, .recommendedReadingTitle a, .specialOfferTitle a, .card-recommendation-topic-title a");
  return titleNode?.textContent?.trim() ?? "";
}

function getUserIds(item) {
  const ids = [];
  item.querySelectorAll('a[href*="/user/id/"]').forEach((link) => {
    const match = link.href.match(/\/user\/id\/(\d+)/);
    if (match) {
      ids.push(match[1]);
    }
  });
  return [...new Set(ids)];
}

function getFirstText(root, selector) {
  return root.querySelector(selector)?.textContent?.trim() ?? "";
}

function normalizeHref(href) {
  const value = String(href ?? "").trim();
  if (!value || value === "#") {
    return value || "#";
  }
  try {
    return new URL(value, location.origin).href;
  } catch {
    return value;
  }
}

function getFirstLink(root, selector) {
  const link = root.querySelector(selector);
  if (!link) {
    return null;
  }
  return {
    href: normalizeHref(link.getAttribute("href") || link.href || "#"),
    text: link.textContent?.trim() ?? ""
  };
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined && text !== null) {
    element.textContent = text;
  }
  return element;
}

function createLink(className, text, href) {
  const link = createElement("a", className, text || href || "打开");
  link.href = href || "#";
  const isCc98Link = href && (
    href.startsWith(location.origin)
    || href.includes("cc98.org")
    || href.includes("www-cc98-org-s.webvpn.zju.edu.cn")
  );
  if (href && href !== "#" && !isCc98Link) {
    link.target = "_blank";
    link.rel = "noreferrer";
  }
  if (isCc98Link) {
    link.addEventListener("click", () => {
      scheduleDelayedRebuilds();
    });
  }
  return link;
}

function getRebuiltFloorAnchorId(floor) {
  return `cc98-floor-${floor}`;
}

function getFloorFromHash(hash) {
  const text = decodeURIComponent(String(hash ?? "").replace(/^#/, "")).trim();
  const match = text.match(/^(?:cc98-)?floor-?(\d{1,5})$/i) || text.match(/^(\d{1,5})$/);
  const floor = Number(match?.[1]);
  return Number.isFinite(floor) && floor > 0 ? floor : null;
}

function getTopicPageFromFloor(floor) {
  return Math.floor((Math.max(1, Number(floor) || 1) - 1) / 10) + 1;
}

function buildTopicFloorHref(topicId, floor, origin = location.origin, search = "") {
  if (!topicId || !floor) {
    return "";
  }
  const page = getTopicPageFromFloor(floor);
  const suffix = page === 1 ? "" : `/${page}`;
  return `${origin}/topic/${topicId}${suffix}${search || ""}#${floor}`;
}

function getQuotedOriginalFloorFromText(text) {
  const normalized = cleanupPostText(text);
  const match = normalized.match(/\u4ee5\u4e0b\u662f\u5f15\u7528\s*(\d{1,5})\s*\u697c/)
    || normalized.match(/\u5f15\u7528\s*(\d{1,5})\s*\u697c/);
  const floor = Number(match?.[1]);
  return Number.isFinite(floor) && floor > 0 ? floor : null;
}

function getQuotedOriginalFloorForLink(link) {
  if (!(link instanceof HTMLAnchorElement)) {
    return null;
  }
  let node = link;
  for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
    const floor = getQuotedOriginalFloorFromText(node.textContent || "");
    if (floor) {
      return floor;
    }
  }
  return null;
}

function getOriginalPostQuoteTargetFromLink(link) {
  if (!(link instanceof HTMLAnchorElement)) {
    return null;
  }
  const linkText = cleanupPostText(link.textContent);
  const floor = getQuotedOriginalFloorForLink(link);
  if (!floor || (!linkText.includes("\u67e5\u770b\u539f\u5e16") && !/>>.*<</.test(linkText))) {
    return null;
  }
  let url = null;
  try {
    url = new URL(link.getAttribute("href") || link.href || "", location.href);
  } catch {
    return null;
  }
  const pageInfo = getTopicPageInfo();
  const topicId = url.pathname.match(/\/topic\/(\d+)/i)?.[1] || pageInfo?.topicId || "";
  if (!topicId) {
    return null;
  }
  const href = buildTopicFloorHref(topicId, floor, url.origin || location.origin, url.search || "");
  if (!href) {
    return null;
  }
  return { floor, href, topicId };
}

function rewriteOriginalPostQuoteLinks(root) {
  root?.querySelectorAll?.("a[href]").forEach((link) => {
    const target = getOriginalPostQuoteTargetFromLink(link);
    if (!target) {
      return;
    }
    link.href = target.href;
    link.dataset.cc98RebuildOriginalFloor = String(target.floor);
  });
}

function getRebuiltPostCardByFloor(floor) {
  const normalized = String(Number(floor));
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(normalized)
    : normalized.replace(/["\\]/g, "\\$&");
  return document.querySelector(`#cc98-comfort-app [data-post-floor="${escaped}"]`);
}

function getSameTopicFloorFromLink(link) {
  if (!(link instanceof HTMLAnchorElement)) {
    return null;
  }
  if (link.closest(".cc98-rebuild-pager")) {
    return null;
  }
  let url = null;
  try {
    url = new URL(link.getAttribute("href") || link.href || "", location.href);
  } catch {
    return null;
  }

  const floor = getFloorFromHash(url.hash);
  const pageInfo = getTopicPageInfo();
  if (!floor || !pageInfo) {
    return null;
  }

  const targetTopic = url.pathname.match(/\/topic\/(\d+)(?:\/\d+)?$/i)?.[1];
  if (targetTopic && targetTopic !== pageInfo.topicId) {
    return null;
  }
  if (!targetTopic && (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search)) {
    return null;
  }

  return getRebuiltPostCardByFloor(floor) ? floor : null;
}

function scrollToRebuiltFloor(floor, options = {}) {
  const card = getRebuiltPostCardByFloor(floor);
  if (!card) {
    return false;
  }

  card.scrollIntoView({
    behavior: options.behavior || "smooth",
    block: "start",
    inline: "nearest"
  });
  card.classList.add("is-anchor-target");
  setTimeout(() => {
    card.classList.remove("is-anchor-target");
  }, 1400);

  if (options.updateHash) {
    history.pushState(null, "", `${location.pathname}${location.search}#${floor}`);
  }
  return true;
}

function bindRebuiltFloorLinks(app) {
  app.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const link = event.target?.closest?.("a[href]");
    const quoteTarget = getOriginalPostQuoteTargetFromLink(link);
    if (quoteTarget) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!scrollToRebuiltFloor(quoteTarget.floor, { updateHash: true })) {
        navigateToRebuiltHref(quoteTarget.href);
      }
      return;
    }
    const floor = getSameTopicFloorFromLink(link);
    if (!floor) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    scrollToRebuiltFloor(floor, { updateHash: true });
  }, true);
}

function scrollToCurrentRebuiltHash() {
  const floor = getFloorFromHash(location.hash);
  if (!floor) {
    return;
  }
  requestAnimationFrame(() => {
    scrollToRebuiltFloor(floor, { behavior: "auto" });
  });
}

function createButton(className, text, onClick) {
  const button = createElement("button", className, text);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function getViewerImageSrc(image) {
  if (!(image instanceof HTMLImageElement)) {
    return "";
  }
  return makeAbsoluteCc98Url(getMediaUrl(image) || image.currentSrc || image.src || "");
}

function isImageViewerCandidate(image) {
  if (!(image instanceof HTMLImageElement) || image.classList.contains("cc98-rebuild-inline-emoji")) {
    return false;
  }
  if (!image.classList.contains("cc98-rebuild-content-image") && !image.classList.contains("cc98-rebuild-board-image")) {
    return false;
  }
  return Boolean(getViewerImageSrc(image));
}

function getImageViewerItems(activeImage) {
  const root = document.querySelector("#cc98-comfort-app") || document;
  const images = [...root.querySelectorAll("img.cc98-rebuild-content-image, img.cc98-rebuild-board-image")]
    .filter(isImageViewerCandidate);
  const items = images.map((node) => ({
    node,
    src: getViewerImageSrc(node),
    alt: node.alt || ""
  })).filter((item) => item.src);
  let index = items.findIndex((item) => item.node === activeImage);
  if (index < 0) {
    const activeSrc = getViewerImageSrc(activeImage);
    index = items.findIndex((item) => item.src === activeSrc);
  }
  if (index < 0 && activeImage instanceof HTMLImageElement) {
    const src = getViewerImageSrc(activeImage);
    if (src) {
      items.unshift({ node: activeImage, src, alt: activeImage.alt || "" });
      index = 0;
    }
  }
  return { items, index: Math.max(0, index) };
}

function updateImageViewerTransform() {
  const image = document.querySelector("#cc98-comfort-image-viewer img");
  if (image) {
    image.style.transform = `translate(${imageViewerOffsetX}px, ${imageViewerOffsetY}px) scale(${imageViewerScale})`;
  }
}

function resetImageViewerTransform() {
  imageViewerScale = 1;
  imageViewerOffsetX = 0;
  imageViewerOffsetY = 0;
  updateImageViewerTransform();
}

function zoomImageViewerAt(viewerImage, clientX, clientY, nextScale) {
  if (!(viewerImage instanceof HTMLImageElement)) {
    return;
  }
  const stage = viewerImage.closest(".cc98-image-viewer-stage");
  const stageRect = stage?.getBoundingClientRect?.();
  const currentScale = imageViewerScale || 1;
  const clampedScale = Math.min(6, Math.max(0.35, nextScale));
  if (!stageRect || Math.abs(clampedScale - currentScale) < 0.001) {
    imageViewerScale = clampedScale;
    updateImageViewerTransform();
    return;
  }
  const centerX = stageRect.left + stageRect.width / 2;
  const centerY = stageRect.top + stageRect.height / 2;
  const ratio = clampedScale / currentScale;
  imageViewerOffsetX += (1 - ratio) * (clientX - centerX - imageViewerOffsetX);
  imageViewerOffsetY += (1 - ratio) * (clientY - centerY - imageViewerOffsetY);
  imageViewerScale = clampedScale;
  updateImageViewerTransform();
}

function updateImageViewerSource(resetTransform = true) {
  const viewer = document.querySelector("#cc98-comfort-image-viewer");
  const viewerImage = viewer?.querySelector(".cc98-image-viewer-stage img");
  const item = imageViewerItems[imageViewerIndex];
  if (!(viewer instanceof HTMLElement) || !(viewerImage instanceof HTMLImageElement) || !item) {
    return;
  }
  viewerImage.src = item.src;
  viewerImage.alt = item.alt || "";
  const counter = viewer.querySelector(".cc98-image-viewer-counter");
  if (counter) {
    counter.textContent = `${imageViewerIndex + 1} / ${imageViewerItems.length}`;
  }
  viewer.querySelectorAll(".cc98-image-viewer-nav").forEach((button) => {
    button.disabled = imageViewerItems.length <= 1;
  });
  const saveButton = viewer.querySelector(".cc98-image-viewer-save");
  if (saveButton) {
    saveButton.dataset.href = item.src;
  }
  if (resetTransform) {
    resetImageViewerTransform();
  }
}

function switchImageViewer(delta) {
  if (imageViewerItems.length <= 1) {
    return;
  }
  imageViewerIndex = (imageViewerIndex + delta + imageViewerItems.length) % imageViewerItems.length;
  updateImageViewerSource(true);
}

function removeImageViewer() {
  document.querySelector("#cc98-comfort-image-viewer")?.remove();
  imageViewerPushedState = false;
  imageViewerItems = [];
  imageViewerIndex = -1;
  imageViewerScale = 1;
  imageViewerOffsetX = 0;
  imageViewerOffsetY = 0;
}

function closeImageViewer(fromHistory = false) {
  if (fromHistory || !imageViewerPushedState) {
    removeImageViewer();
    return;
  }
  history.back();
}

function openImageViewer(image) {
  const src = getViewerImageSrc(image);
  if (!src) {
    return;
  }
  const viewerData = getImageViewerItems(image);

  removeImageViewer();
  imageViewerItems = viewerData.items.length ? viewerData.items : [{ node: image, src, alt: image.alt || "" }];
  imageViewerIndex = Math.min(Math.max(0, viewerData.index), imageViewerItems.length - 1);
  const viewer = createElement("div", "cc98-image-viewer");
  viewer.id = "cc98-comfort-image-viewer";
  viewer.innerHTML = `
    <button class="cc98-image-viewer-close" type="button" aria-label="Close">×</button>
    <div class="cc98-image-viewer-stage">
      <img alt="">
    </div>
  `;
  const viewerImage = viewer.querySelector("img");
  viewerImage.src = src;
  viewerImage.alt = image.alt || "";
  const closeButton = viewer.querySelector(".cc98-image-viewer-close");
  if (closeButton) {
    closeButton.textContent = "x";
  }
  const stage = viewer.querySelector(".cc98-image-viewer-stage");
  const counter = createElement("div", "cc98-image-viewer-counter");
  const saveButton = createButton("cc98-image-viewer-save", "\u4fdd\u5b58", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const href = saveButton.dataset.href || imageViewerItems[imageViewerIndex]?.src || "";
    requestBrowserDownload(href, href);
  });
  const toolbar = createElement("div", "cc98-image-viewer-toolbar");
  toolbar.append(counter, saveButton);
  const prevButton = createButton("cc98-image-viewer-nav cc98-image-viewer-prev", "<", (event) => {
    event.preventDefault();
    event.stopPropagation();
    switchImageViewer(-1);
  });
  prevButton.setAttribute("aria-label", "Previous image");
  const nextButton = createButton("cc98-image-viewer-nav cc98-image-viewer-next", ">", (event) => {
    event.preventDefault();
    event.stopPropagation();
    switchImageViewer(1);
  });
  nextButton.setAttribute("aria-label", "Next image");
  if (stage) {
    viewer.insertBefore(toolbar, stage);
    viewer.insertBefore(prevButton, stage);
    viewer.append(nextButton);
  }
  document.body.append(viewer);
  updateImageViewerSource(true);

  history.pushState({ cc98ComfortImageViewer: true }, "", location.href);
  imageViewerPushedState = true;

  viewer.addEventListener("click", (event) => {
    if (
      event.target === viewer
      || event.target?.classList?.contains("cc98-image-viewer-stage")
      || event.target.closest(".cc98-image-viewer-close")
    ) {
      event.preventDefault();
      closeImageViewer();
    }
  });
  viewer.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 0.9;
    zoomImageViewerAt(viewerImage, event.clientX, event.clientY, imageViewerScale * factor);
  }, { passive: false });

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;
  viewerImage.draggable = false;
  viewerImage.addEventListener("dragstart", (event) => event.preventDefault());
  viewerImage.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    isDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragOriginX = imageViewerOffsetX;
    dragOriginY = imageViewerOffsetY;
    viewer.classList.add("is-dragging");
    viewerImage.setPointerCapture?.(event.pointerId);
  });
  viewerImage.addEventListener("pointermove", (event) => {
    if (!isDragging) {
      return;
    }
    imageViewerOffsetX = dragOriginX + event.clientX - dragStartX;
    imageViewerOffsetY = dragOriginY + event.clientY - dragStartY;
    updateImageViewerTransform();
  });
  const endDrag = (event) => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    viewer.classList.remove("is-dragging");
    viewerImage.releasePointerCapture?.(event.pointerId);
  };
  viewerImage.addEventListener("pointerup", endDrag);
  viewerImage.addEventListener("pointercancel", endDrag);

  const onKeydown = (event) => {
    if (!document.querySelector("#cc98-comfort-image-viewer")) {
      document.removeEventListener("keydown", onKeydown, true);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeImageViewer();
      document.removeEventListener("keydown", onKeydown, true);
    }
    if (event.key === "0") {
      resetImageViewerTransform();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      switchImageViewer(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      switchImageViewer(1);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      const href = imageViewerItems[imageViewerIndex]?.src || "";
      requestBrowserDownload(href, href);
    }
  };
  document.addEventListener("keydown", onKeydown, true);
}

function bindImageViewer(app) {
  app.addEventListener("click", (event) => {
    const image = event.target?.closest?.("img");
    if (!isImageViewerCandidate(image)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    openImageViewer(image);
  }, true);
}

function getDownloadFilename(url) {
  try {
    const pathname = new URL(url, location.href).pathname;
    return decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return "";
  }
}

function requestBrowserDownload(url, fallbackHref = url) {
  if (!url) {
    return;
  }
  try {
    chrome.runtime.sendMessage({
      type: "CC98_REBORN_DOWNLOAD_FILE",
      url,
      filename: getDownloadFilename(url)
    }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        location.href = fallbackHref || url;
      }
    });
  } catch {
    location.href = fallbackHref || url;
  }
}

function bindPostDownloadButtons(app) {
  app.addEventListener("click", (event) => {
    const link = event.target?.closest?.("a.cc98-rebuild-download-button, a.download-file");
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }
    const href = link.href || makeAbsoluteCc98Url(link.getAttribute("href") || "");
    if (!href) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    requestBrowserDownload(href, link.href);
  }, true);
}

function triggerOriginalControl(control) {
  if (!(control instanceof HTMLElement)) {
    return;
  }
  const target = control.querySelector("i, span, button, a, [role='button']") || control;
  const rect = control.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: rect.left + Math.max(1, rect.width / 2),
    clientY: rect.top + Math.max(1, rect.height / 2),
    button: 0,
    buttons: 1
  };
  if (typeof PointerEvent === "function") {
    target.dispatchEvent(new PointerEvent("pointerdown", { ...eventInit, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  }
  target.dispatchEvent(new MouseEvent("mousedown", eventInit));
  if (typeof PointerEvent === "function") {
    target.dispatchEvent(new PointerEvent("pointerup", { ...eventInit, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  }
  target.dispatchEvent(new MouseEvent("mouseup", { ...eventInit, buttons: 0 }));
  target.click();
}

function getActionKindFromText(text) {
  const value = cleanupPostText(text);
  if (value.includes("\u8d5e")) {
    return "like";
  }
  if (value.includes("\u8e29")) {
    return "dislike";
  }
  if (value.includes("\u8bc4\u5206")) {
    return "score";
  }
  return "";
}

function getPostActionKind(control, text = "") {
  if (control?.classList?.contains("upup")) {
    return "like";
  }
  if (control?.classList?.contains("downdown")) {
    return "dislike";
  }
  const title = control?.querySelector?.("[title]")?.getAttribute("title") || control?.getAttribute?.("title") || "";
  return getActionKindFromText(`${text} ${title} ${control?.textContent || ""}`);
}

function legacyLoosePostActionActive(control, kind = "") {
  if (!(control instanceof HTMLElement)) {
    return false;
  }
  const icon = control.querySelector("i, .fa");
  const hints = [
    control.className,
    icon?.className,
    control.getAttribute("aria-pressed"),
    control.getAttribute("data-active"),
    control.getAttribute("data-selected"),
    control.getAttribute("data-voted"),
    control.getAttribute("title"),
    icon?.getAttribute("title"),
    control.textContent
  ].join(" ");
  if (/active|selected|checked|pressed|liked|disliked|voted|true|is-on|is-active/i.test(hints)) {
    return true;
  }
  if (/取消|已/.test(hints) && (hints.includes("\u8d5e") || hints.includes("\u8e29"))) {
    return true;
  }
  if (kind === "like" && /\bfa-thumbs-up\b/.test(hints) && !/\bfa-thumbs-o-up\b/.test(hints)) {
    return true;
  }
  if (kind === "dislike" && /\bfa-thumbs-down\b/.test(hints) && !/\bfa-thumbs-o-down\b/.test(hints)) {
    return true;
  }
  const colorHint = [control.getAttribute("style"), icon?.getAttribute("style")].join(" ");
  if (kind && /color\s*:/i.test(colorHint) && !/(?:gray|grey|#000|black|inherit|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/i.test(colorHint)) {
    return true;
  }
  return false;
}

function isPostActionActive(control, kind = "") {
  if (!(control instanceof HTMLElement) || (kind !== "like" && kind !== "dislike")) {
    return false;
  }
  const icon = control.querySelector("i, .fa");
  const hints = [control.className, icon?.className].join(" ");
  if (kind === "like") {
    return control.classList.contains("red-color")
      || (/\bfa-thumbs-up\b/.test(hints) && !/\bfa-thumbs-o-up\b/.test(hints));
  }
  return control.classList.contains("red-color")
    || (/\bfa-thumbs-down\b/.test(hints) && !/\bfa-thumbs-o-down\b/.test(hints));
}

function getOppositeVoteKind(kind) {
  if (kind === "like") {
    return "dislike";
  }
  if (kind === "dislike") {
    return "like";
  }
  return "";
}

function getActionVoteKind(action) {
  return action?.kind || getPostActionKind(action?.control, action?.text || "");
}

function getOppositeVoteAction(action) {
  const kind = getActionVoteKind(action);
  const oppositeKind = getOppositeVoteKind(kind);
  return oppositeKind ? action?.voteGroup?.[oppositeKind] : null;
}

function getVoteGroupNativeKind(group) {
  if (!group) {
    return "";
  }
  const likeActive = isPostActionActive(group.like?.control, "like");
  const dislikeActive = isPostActionActive(group.dislike?.control, "dislike");
  if (likeActive && !dislikeActive) {
    return "like";
  }
  if (dislikeActive && !likeActive) {
    return "dislike";
  }
  if (likeActive && dislikeActive) {
    return group.lastDesiredKind === "dislike" ? "dislike" : "like";
  }
  return "";
}

function setVoteGroupDesiredKind(group, kind) {
  if (!group) {
    return;
  }
  group.desiredKind = kind === "like" || kind === "dislike" ? kind : "";
  group.lastDesiredKind = group.desiredKind;
  group.desiredUntil = Date.now() + VOTE_OPTIMISTIC_STATE_TTL;
  group.transitionToken = (group.transitionToken || 0) + 1;
}

function getVoteGroupDisplayKind(group) {
  if (!group) {
    return "";
  }
  const nativeKind = getVoteGroupNativeKind(group);
  if (Object.prototype.hasOwnProperty.call(group, "desiredKind")) {
    const desiredKind = group.desiredKind || "";
    if (nativeKind === desiredKind || Date.now() >= (group.desiredUntil || 0)) {
      delete group.desiredKind;
      delete group.desiredUntil;
      return nativeKind;
    }
    return desiredKind;
  }
  return nativeKind;
}

function waitForNativeVoteState(action, active, timeout = 900) {
  const kind = getActionVoteKind(action);
  if (kind !== "like" && kind !== "dislike") {
    return Promise.resolve(false);
  }
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const current = isPostActionActive(action.control, kind);
      if (current === active) {
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeout) {
        resolve(false);
        return;
      }
      window.setTimeout(check, 60);
    };
    check();
  });
}

function settleVoteGroupNativeState(group, desiredKind, token) {
  if (!group || group.transitionToken !== token) {
    return;
  }
  const nativeKind = getVoteGroupNativeKind(group);
  if (nativeKind === desiredKind) {
    return;
  }
  if (!desiredKind && nativeKind) {
    triggerOriginalControl(group[nativeKind]?.control);
    return;
  }
  if (desiredKind && nativeKind && nativeKind !== desiredKind) {
    const wrongAction = group[nativeKind];
    triggerOriginalControl(wrongAction?.control);
    waitForNativeVoteState(wrongAction, false, 900).then(() => {
      if (group.transitionToken !== token) {
        return;
      }
      if (!isPostActionActive(group[desiredKind]?.control, desiredKind)) {
        triggerOriginalControl(group[desiredKind]?.control);
      }
    });
    return;
  }
  if (desiredKind && !nativeKind) {
    triggerOriginalControl(group[desiredKind]?.control);
  }
}

function triggerVoteNativeTransition(action, oppositeAction, oppositeWasNativeActive) {
  const group = action?.voteGroup;
  const token = group?.transitionToken || 0;
  const actionKind = getActionVoteKind(action);
  if (!oppositeWasNativeActive) {
    triggerOriginalControl(action.control);
    return;
  }
  triggerOriginalControl(oppositeAction.control);
  waitForNativeVoteState(oppositeAction, false, 1200).then(() => {
    if (group && group.transitionToken !== token) {
      return;
    }
    if (!isPostActionActive(action.control, actionKind)) {
      triggerOriginalControl(action.control);
    }
  });
}

function getVoteActionNativeCount(action) {
  if (!action) {
    return 0;
  }
  const countText = cleanupPostText(action.control?.querySelector?.(".commentProp")?.textContent || "");
  const text = countText || cleanupPostText(getActionText(action.control) || action.text || "");
  const match = text.match(/-?\d+/);
  return match ? Math.max(0, Number(match[0]) || 0) : 0;
}

function getVoteActionDisplayCount(action) {
  if (!action) {
    return 0;
  }
  if (Number.isFinite(action.optimisticCount) && Date.now() < (action.optimisticUntil || 0)) {
    return action.optimisticCount;
  }
  return getVoteActionNativeCount(action);
}

function getVoteActionLabel(action, kind = "") {
  const text = cleanupPostText(getActionText(action?.control) || action?.text || "");
  const label = text.replace(/\s*-?\d+\s*$/, "").trim();
  if (label) {
    return label;
  }
  return kind === "dislike" ? "\u8e29" : "\u8d5e";
}

function formatVoteActionText(action, count) {
  const kind = getActionVoteKind(action);
  const label = getVoteActionLabel(action, kind);
  return `${label} ${Math.max(0, Number(count) || 0)}`;
}

function setVoteActionCountText(action, count) {
  if (!action) {
    return;
  }
  const text = formatVoteActionText(action, count);
  if (action.proxyButton) {
    action.proxyButton.textContent = text;
  }
}

function setVoteActionOptimisticCount(action, count) {
  if (!action) {
    return;
  }
  action.optimisticCount = Math.max(0, Number(count) || 0);
  action.optimisticUntil = Date.now() + VOTE_OPTIMISTIC_COUNT_TTL;
  setVoteActionCountText(action, action.optimisticCount);
}

function getVoteActionSyncedText(action, nativeText) {
  const kind = getActionVoteKind(action);
  if (kind !== "like" && kind !== "dislike") {
    return nativeText;
  }
  if (Number.isFinite(action.optimisticCount)) {
    const nativeCount = getVoteActionNativeCount(action);
    if (nativeCount === action.optimisticCount || Date.now() >= (action.optimisticUntil || 0)) {
      delete action.optimisticCount;
      delete action.optimisticUntil;
      return formatVoteActionText(action, nativeCount);
    }
    return formatVoteActionText(action, action.optimisticCount);
  }
  return formatVoteActionText(action, getVoteActionNativeCount(action));
}

function applyOptimisticVoteCounts(action, shouldBeActive, oppositeAction, oppositeWasActive) {
  const currentCount = getVoteActionDisplayCount(action);
  setVoteActionOptimisticCount(action, currentCount + (shouldBeActive ? 1 : -1));
  if (shouldBeActive && oppositeWasActive && oppositeAction) {
    setVoteActionOptimisticCount(oppositeAction, getVoteActionDisplayCount(oppositeAction) - 1);
  }
}

function setNativeVoteControlVisual(control, kind, active) {
  // Keep the original CC98 controls as the source of truth; mutating them can
  // invert the site's own click/toggle logic.
  void control;
  void kind;
  void active;
}

function setProxyVoteControlVisual(button, kind, active) {
  if (!(button instanceof HTMLElement) || (kind !== "like" && kind !== "dislike")) {
    return;
  }
  button.dataset.actionKind = kind;
  button.classList.toggle("is-like", kind === "like");
  button.classList.toggle("is-dislike", kind === "dislike");
  button.classList.toggle("is-active", Boolean(active));
  button.setAttribute("aria-pressed", String(Boolean(active)));
}

function setVoteActionVisual(action, active) {
  const kind = getActionVoteKind(action);
  if (kind !== "like" && kind !== "dislike") {
    return;
  }
  setNativeVoteControlVisual(action.control, kind, active);
  setProxyVoteControlVisual(action.proxyButton, kind, active);
}

function isVoteActionVisuallyActive(action) {
  const kind = getActionVoteKind(action);
  if (kind !== "like" && kind !== "dislike") {
    return false;
  }
  if (action.voteGroup) {
    return getVoteGroupDisplayKind(action.voteGroup) === kind;
  }
  return isPostActionActive(action.control, kind);
}

function enforceVoteGroupMutualExclusion(action) {
  const kind = getActionVoteKind(action);
  const group = action?.voteGroup;
  if (!group || (kind !== "like" && kind !== "dislike")) {
    return;
  }
  const displayKind = getVoteGroupDisplayKind(group);
  setVoteActionVisual(group.like, displayKind === "like");
  setVoteActionVisual(group.dislike, displayKind === "dislike");
}

function syncProxyControlDisplay(proxy, action) {
  const nativeText = action.displayText || getActionText(action.control) || action.text;
  const text = getVoteActionSyncedText(action, nativeText);
  proxy.textContent = text;
  const normalized = text.replace(/\s+\d+$/, "");
  proxy.dataset.actionType = normalized;
  const kind = getActionVoteKind(action) || getPostActionKind(action.control, text);
  if (kind) {
    proxy.dataset.actionKind = kind;
  } else {
    delete proxy.dataset.actionKind;
  }
  const isVoteAction = kind === "like" || kind === "dislike";
  const isActive = isVoteAction && isVoteActionVisuallyActive(action);
  proxy.classList.toggle("is-active", Boolean(isActive));
  proxy.classList.toggle("is-like", kind === "like");
  proxy.classList.toggle("is-dislike", kind === "dislike");
  proxy.setAttribute("aria-pressed", String(Boolean(isActive)));
  if (isVoteAction) {
    setNativeVoteControlVisual(action.control, kind, isActive);
    enforceVoteGroupMutualExclusion(action);
  }
}

function applyOptimisticPostActionState(button, action) {
  const kind = getPostActionKind(action.control, action.text);
  if (kind !== "like" && kind !== "dislike") {
    return;
  }
  button.dataset.actionKind = kind;
  button.classList.toggle("is-like", kind === "like");
  button.classList.toggle("is-dislike", kind === "dislike");
  button.classList.add("is-pending");
  button.setAttribute("aria-busy", "true");
}

function clearProxyControlSyncTimers(button) {
  const timers = proxyControlSyncTimers.get(button);
  if (!timers) {
    return;
  }
  timers.forEach((timer) => window.clearTimeout(timer));
  proxyControlSyncTimers.delete(button);
}

function scheduleProxyControlDisplaySync(button, action, delays, clearPendingAfter = 0) {
  clearProxyControlSyncTimers(button);
  const timers = delays.map((delay, index) => window.setTimeout(() => {
    if (!button.isConnected) {
      clearProxyControlSyncTimers(button);
      return;
    }
    syncProxyControlDisplay(button, action);
    if (delay >= clearPendingAfter || index === delays.length - 1) {
      button.classList.remove("is-pending");
      button.removeAttribute("aria-busy");
    }
    if (index === delays.length - 1) {
      proxyControlSyncTimers.delete(button);
    }
  }, delay));
  proxyControlSyncTimers.set(button, timers);
}

function isTopicShareAction(action) {
  return action?.scope === "topic" && cleanupPostText(action.text).includes("\u5206\u4eab\u5e16\u5b50\u94fe\u63a5");
}

function fallbackCopyTextToClipboard(text) {
  if (!text || !document.body) {
    return false;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.append(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

async function copyTextToClipboard(text) {
  if (!text) {
    return false;
  }
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopyTextToClipboard(text);
    }
  }
  return fallbackCopyTextToClipboard(text);
}

function showRebuiltTransientToast(anchor, text) {
  if (!document.body) {
    return;
  }
  const toast = createElement("div", "cc98-rebuild-toast", text);
  document.body.append(toast);
  const anchorRect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : null;
  const toastRect = toast.getBoundingClientRect();
  const margin = 12;
  let top = anchorRect ? anchorRect.top - toastRect.height - 10 : margin;
  if (top < margin && anchorRect) {
    top = anchorRect.bottom + 10;
  }
  const left = anchorRect
    ? anchorRect.left + anchorRect.width / 2 - toastRect.width / 2
    : window.innerWidth / 2 - toastRect.width / 2;
  toast.style.top = `${Math.max(margin, Math.min(window.innerHeight - toastRect.height - margin, top))}px`;
  toast.style.left = `${Math.max(margin, Math.min(window.innerWidth - toastRect.width - margin, left))}px`;
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  window.setTimeout(() => toast.classList.remove("is-visible"), 1100);
  window.setTimeout(() => toast.remove(), 1500);
}

function renderProxyControl(action) {
  if (action.href && action.href !== "#") {
    return createLink("cc98-rebuild-mini-action", action.text, action.href);
  }
  let lastActivatedAt = 0;
  const button = createButton("cc98-rebuild-mini-action", action.text, (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    const now = Date.now();
    const actionKind = getPostActionKind(action.control, action.text);
    const isVoteAction = actionKind === "like" || actionKind === "dislike";
    const activationGap = isVoteAction ? 180 : 420;
    if (now - lastActivatedAt < activationGap) {
      return;
    }
    lastActivatedAt = now;
    const isPostAction = action.scope === "post" || Boolean(action.control?.closest?.(".reply"));
    const isNativeOverlayAction = isPostAction || action.scope === "topic";
    const oppositeAction = isVoteAction ? getOppositeVoteAction(action) : null;
    if (isVoteAction) {
      const wasActive = isVoteActionVisuallyActive(action);
      const shouldBeActive = !wasActive;
      const oppositeKind = getActionVoteKind(oppositeAction);
      const oppositeWasVisuallyActive = shouldBeActive && oppositeAction && isVoteActionVisuallyActive(oppositeAction);
      const oppositeWasActive = shouldBeActive && oppositeAction && isPostActionActive(oppositeAction.control, oppositeKind);
      if (action.voteGroup) {
        setVoteGroupDesiredKind(action.voteGroup, shouldBeActive ? actionKind : "");
      }
      setVoteActionVisual(oppositeAction, false);
      setVoteActionVisual(action, shouldBeActive);
      applyOptimisticVoteCounts(action, shouldBeActive, oppositeAction, oppositeWasVisuallyActive);
      if (oppositeWasActive) {
        triggerVoteNativeTransition(action, oppositeAction, true);
      } else {
        triggerOriginalControl(action.control);
      }
      if (action.voteGroup && oppositeWasActive) {
        const token = action.voteGroup.transitionToken || 0;
        const desiredKind = shouldBeActive ? actionKind : "";
        [1300, 2600].forEach((delay) => {
          window.setTimeout(() => settleVoteGroupNativeState(action.voteGroup, desiredKind, token), delay);
        });
      }
    } else {
      applyOptimisticPostActionState(button, action);
      triggerOriginalControl(action.control);
      if (isTopicShareAction(action)) {
        copyTextToClipboard(location.href).finally(() => {
          showRebuiltTransientToast(button, "\u590d\u5236\u6210\u529f");
        });
      }
    }
    if (isNativeOverlayAction) {
      scheduleNativeAntUiStabilize();
    } else {
      scheduleDelayedRebuilds();
    }
    button.classList.add("is-pending");
    const syncDelays = isVoteAction
      ? [35, 90, 170, 320, 620, 1000, 1400, 1800, 2200, 3000, 4200]
      : [120, 360, 900, 1800];
    scheduleProxyControlDisplaySync(button, action, syncDelays, isVoteAction ? 620 : 360);
    if (isVoteAction && oppositeAction?.proxyButton) {
      scheduleProxyControlDisplaySync(oppositeAction.proxyButton, oppositeAction, syncDelays, 90);
    }
  });
  button.addEventListener("pointerdown", (event) => {
    if (event.button === 0) {
      button.classList.add("is-pressing");
    }
  });
  ["pointerup", "pointercancel", "mouseleave", "blur"].forEach((type) => {
    button.addEventListener(type, () => {
      button.classList.remove("is-pressing");
    });
  });
  action.proxyButton = button;
  syncProxyControlDisplay(button, action);
  return button;
}

function makeAbsoluteCc98Url(href) {
  if (!href) {
    return "";
  }
  try {
    return new URL(href, location.origin).href;
  } catch {
    return href;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLazyPrewarmPageKey() {
  return `${location.pathname}${location.search}`;
}

function getRoutePageKey(url = location.href) {
  try {
    const parsed = new URL(url, location.href);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return `${location.origin}${location.pathname}${location.search}`;
  }
}

function stripUrlHash(href) {
  try {
    const url = new URL(href, location.href);
    url.hash = "";
    return url.href;
  } catch {
    return String(href ?? "").replace(/#.*/, "");
  }
}

function navigateToRebuiltHref(href) {
  const target = makeAbsoluteCc98Url(href);
  if (!target) {
    scheduleDelayedRebuilds();
    return;
  }

  const targetWithoutHash = stripUrlHash(target);
  const currentWithoutHash = stripUrlHash(location.href);
  if (targetWithoutHash === currentWithoutHash) {
    try {
      const url = new URL(target, location.href);
      if (url.hash && url.hash !== location.hash) {
        history.pushState(null, "", `${location.pathname}${location.search}${url.hash}`);
      }
    } catch {
      // Hash navigation is best-effort.
    }
    scrollToCurrentRebuiltHash();
    scheduleDelayedRebuilds();
    return;
  }

  location.assign(target);
}

function scheduleRouteFollowup(targetHref, startedRouteKey = getRoutePageKey()) {
  routeFollowupTimers.forEach((timer) => window.clearTimeout(timer));
  routeFollowupTimers = [];
  const targetRouteKey = getRoutePageKey(targetHref);
  if (!targetRouteKey) {
    return;
  }
  routeFollowupTimers = [80, 180, 360, 700, 1200, 1900, 3000, 4600].map((delay, index, delays) => (
    window.setTimeout(() => {
      const currentRouteKey = getRoutePageKey();
      if (currentRouteKey === targetRouteKey || currentRouteKey !== startedRouteKey) {
        searchPageRouteKey = "";
        scheduleFiltering();
        scheduleRebuild();
        scheduleSync();
      }
      if (index === delays.length - 1) {
        routeFollowupTimers = [];
      }
    }, delay)
  ));
}

function getTopicRouteInfo(url = location.href) {
  try {
    const parsed = new URL(url, location.href);
    const match = parsed.pathname.match(/\/topic\/(\d+)(?:\/(\d+))?\/?$/i)
      || parsed.pathname.match(/\/topic\/(\d+)(?:\/(\d+))?/i);
    if (!match) {
      return null;
    }
    const topicId = match[1];
    const current = Math.max(1, Number(match[2] || 1));
    const suffix = current === 1 ? "" : `/${current}`;
    return {
      topicId,
      current,
      href: parsed.href,
      routeKey: `${parsed.origin}/topic/${topicId}${suffix}${parsed.search}`,
      firstHref: `${parsed.origin}/topic/${topicId}${parsed.search}`
    };
  } catch {
    return null;
  }
}

function readSessionJson(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeSessionJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session previsit is best-effort.
  }
}

function removeSessionItem(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Session previsit is best-effort.
  }
}

function getFirstPagePrevisitDoneKey(routeInfo) {
  if (!routeInfo?.topicId || routeInfo.current <= 1) {
    return "";
  }
  return `${FIRST_PAGE_PREVISIT_DONE_PREFIX}${routeInfo.topicId}:${routeInfo.current}:${encodeURIComponent(routeInfo.routeKey)}`;
}

function hasFreshFirstPagePrevisit(routeInfo) {
  const key = getFirstPagePrevisitDoneKey(routeInfo);
  if (!key) {
    return false;
  }
  const timestamp = Number(sessionStorage.getItem(key) || 0);
  return Number.isFinite(timestamp) && Date.now() - timestamp < FIRST_PAGE_PREVISIT_TTL;
}

function markFreshFirstPagePrevisit(routeInfo) {
  const key = getFirstPagePrevisitDoneKey(routeInfo);
  if (!key) {
    return;
  }
  try {
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // Session previsit is best-effort.
  }
}

function getPendingFirstPagePrevisit() {
  const pending = readSessionJson(FIRST_PAGE_PREVISIT_PENDING_KEY);
  if (!pending?.topicId || !pending.targetHref || !pending.targetRouteKey || !pending.startedAt) {
    removeSessionItem(FIRST_PAGE_PREVISIT_PENDING_KEY);
    return null;
  }
  if (Date.now() - Number(pending.startedAt) > FIRST_PAGE_PREVISIT_TTL) {
    removeSessionItem(FIRST_PAGE_PREVISIT_PENDING_KEY);
    return null;
  }
  return pending;
}

function waitForOriginalReplyRender(timeout = 3600) {
  return new Promise((resolve) => {
    if (document.querySelector(".reply")) {
      resolve(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(".reply")) {
        observer.disconnect();
        window.clearTimeout(timer);
        resolve(true);
      }
    });
    const target = document.querySelector("#root") || document.body || document.documentElement;
    observer.observe(target, { childList: true, subtree: true });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeout);
  });
}

function startFirstPagePrevisitReturn(pending) {
  if (firstPagePrevisitInProgress) {
    return true;
  }
  firstPagePrevisitInProgress = true;
  showLoadingOverlay("\u6b63\u5728\u9884\u70ed\u5e16\u5b50\u7b2c\u4e00\u9875...");

  (async () => {
    await waitForDomReady();
    await Promise.race([
      waitForOriginalReplyRender(),
      wait(4200)
    ]);
    const identity = getOriginalPosterIdentityFromRoot(document);
    if (identity) {
      setCachedOriginalPosterIdentity(pending.topicId, identity);
    }
    await wait(260);
  })()
    .catch(() => {})
    .finally(() => {
      const targetInfo = getTopicRouteInfo(pending.targetHref);
      if (targetInfo) {
        markFreshFirstPagePrevisit(targetInfo);
      }
      removeSessionItem(FIRST_PAGE_PREVISIT_PENDING_KEY);
      showLoadingOverlay("\u6b63\u5728\u8fd4\u56de\u539f\u9875\u9762\u52a0\u8f7d\u56fe\u7247...");
      location.replace(pending.targetHref);
    });

  return true;
}

function handleTopicFirstPagePrevisitNavigation() {
  if (!lastSettings) {
    return Boolean(getPendingFirstPagePrevisit());
  }

  if (!lastSettings?.enabled || !lastSettings.previsitFirstPageForTopicImages) {
    firstPagePrevisitInProgress = false;
    removeSessionItem(FIRST_PAGE_PREVISIT_PENDING_KEY);
    return false;
  }

  const routeInfo = getTopicRouteInfo();
  if (!routeInfo) {
    firstPagePrevisitInProgress = false;
    removeSessionItem(FIRST_PAGE_PREVISIT_PENDING_KEY);
    return false;
  }

  const pending = getPendingFirstPagePrevisit();
  if (pending) {
    if (routeInfo.routeKey === pending.targetRouteKey) {
      if (firstPagePrevisitInProgress) {
        return true;
      }
      markFreshFirstPagePrevisit(routeInfo);
      removeSessionItem(FIRST_PAGE_PREVISIT_PENDING_KEY);
      return false;
    }
    if (routeInfo.topicId === pending.topicId && routeInfo.current === 1) {
      return startFirstPagePrevisitReturn(pending);
    }
    removeSessionItem(FIRST_PAGE_PREVISIT_PENDING_KEY);
  }

  if (routeInfo.current <= 1 || hasFreshFirstPagePrevisit(routeInfo)) {
    return false;
  }

  writeSessionJson(FIRST_PAGE_PREVISIT_PENDING_KEY, {
    topicId: routeInfo.topicId,
    targetHref: routeInfo.href,
    targetRouteKey: routeInfo.routeKey,
    targetPage: routeInfo.current,
    startedAt: Date.now()
  });
  firstPagePrevisitInProgress = true;
  showLoadingOverlay("\u6b63\u5728\u5148\u8bbf\u95ee\u5e16\u5b50\u7b2c\u4e00\u9875...");
  location.replace(routeInfo.firstHref);
  return true;
}

function dispatchNativeLazySignals() {
  const scrollEvent = new Event("scroll", { bubbles: true });
  window.dispatchEvent(scrollEvent);
  document.dispatchEvent(scrollEvent);
  document.querySelector("#root")?.dispatchEvent(scrollEvent);
  window.dispatchEvent(new Event("resize"));
}

function eagerNativeImage(image) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  const src = getMediaUrl(image);
  if (src) {
    image.src = makeAbsoluteCc98Url(src);
  }
  image.loading = "eager";
  image.decoding = "async";
}

function waitForNativeImage(image, timeout = 900) {
  if (!(image instanceof HTMLImageElement) || image.complete) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      image.removeEventListener("load", done);
      image.removeEventListener("error", done);
      resolve();
    };
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
    setTimeout(done, timeout);
  });
}

async function prewarmNativeLazyMedia() {
  const pageKey = getLazyPrewarmPageKey();
  if (lazyPrewarmedPageKey === pageKey) {
    return;
  }
  if (lazyPrewarmPromise) {
    return lazyPrewarmPromise;
  }

  lazyPrewarmPromise = (async () => {
    const root = document.querySelector("#root");
    const originalRootScrollTop = root?.scrollTop ?? 0;
    const originalRootScrollLeft = root?.scrollLeft ?? 0;
    document.documentElement.dataset.cc98ComfortPrewarming = "true";

    try {
      await wait(120);
      const media = [...document.querySelectorAll([
        "#root .reply-content .substance img",
        "#root .reply-content .substance [style*='url(']",
        "#root .signature img",
        "#root .signature [style*='url(']",
        "#root article img",
        "#root article [style*='url(']"
      ].join(","))]
        .filter((node) => node instanceof Element && !node.closest("#cc98-comfort-app"));

      [...root?.querySelectorAll("img") ?? []].forEach(eagerNativeImage);
      dispatchNativeLazySignals();

      for (const node of media) {
        node.scrollIntoView?.({ block: "center", inline: "nearest" });
        if (node instanceof HTMLImageElement) {
          eagerNativeImage(node);
        }
        dispatchNativeLazySignals();
        await wait(70);
      }

      root?.scrollTo?.({ top: root.scrollHeight, left: 0, behavior: "auto" });
      dispatchNativeLazySignals();
      await wait(180);

      await Promise.all([...root?.querySelectorAll("img") ?? []]
        .filter((image) => image instanceof HTMLImageElement)
        .map((image) => waitForNativeImage(image)));
      lazyPrewarmedPageKey = pageKey;
    } finally {
      root?.scrollTo?.({ top: originalRootScrollTop, left: originalRootScrollLeft, behavior: "auto" });
      dispatchNativeLazySignals();
      delete document.documentElement.dataset.cc98ComfortPrewarming;
      lazyPrewarmPromise = null;
    }
  })();

  return lazyPrewarmPromise;
}

function getNativeScrollTargets() {
  const root = document.querySelector("#root");
  return [...new Set([
    window,
    document.scrollingElement,
    document.documentElement,
    document.body,
    root
  ].filter(Boolean))];
}

function getScrollTargetMaxTop(target) {
  if (target === window) {
    const height = Math.max(
      document.body?.scrollHeight ?? 0,
      document.documentElement?.scrollHeight ?? 0
    );
    return Math.max(0, height - window.innerHeight);
  }
  return Math.max(0, target.scrollHeight - target.clientHeight);
}

function scrollNativeTargetTo(target, top) {
  if (target === window) {
    window.scrollTo({ top, left: 0, behavior: "auto" });
    return;
  }
  target.scrollTop = top;
  target.scrollLeft = 0;
  target.dispatchEvent(new Event("scroll", { bubbles: true }));
}

async function scrollOriginalPageForLazyMedia(duration = 2100, shouldStop = () => false) {
  const durationMs = clampNumber(duration, 800, 8000, DEFAULT_SETTINGS.imageLoadDuration);
  const steps = Math.max(6, Math.min(40, Math.round(durationMs / 120)));
  const delay = Math.max(40, Math.round(durationMs / steps));
  getNativeScrollTargets().forEach((target) => scrollNativeTargetTo(target, 0));
  dispatchNativeLazySignals();
  await wait(80);

  for (let step = 1; step <= steps; step += 1) {
    if (shouldStop()) {
      return;
    }
    const progress = step / steps;
    getNativeScrollTargets().forEach((target) => {
      scrollNativeTargetTo(target, getScrollTargetMaxTop(target) * progress);
    });
    document.querySelectorAll("img").forEach(eagerNativeImage);
    dispatchNativeLazySignals();
    await wait(delay);
  }

  if (shouldStop()) {
    return;
  }
  getNativeScrollTargets().forEach((target) => {
    scrollNativeTargetTo(target, getScrollTargetMaxTop(target));
  });
  document.querySelectorAll("img").forEach(eagerNativeImage);
  dispatchNativeLazySignals();
  await wait(180);
}

function collectSnapshotMedia(root) {
  const media = [];
  const seen = new Set();
  root?.querySelectorAll("img").forEach((image) => {
    const src = getNonDecorativeImageSrc(image);
    if (!src || isEmojiImageUrl(src) || isDownloadFileUrl(src)) {
      return;
    }
    const key = normalizeMediaKey(src);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    media.push({ src, alt: image.alt || "" });
  });
  return media;
}

function collectPrewarmedPostSnapshots() {
  return getPostItems()
    .map((item) => ({
      id: item.id,
      index: item.index,
      media: collectSnapshotMedia(item.content)
    }))
    .filter((item) => item.media.length > 0);
}

function findPrewarmedPostSnapshot(id, index) {
  if (prewarmedSnapshotPageKey !== getLazyPrewarmPageKey()) {
    return null;
  }
  return prewarmedPostSnapshots.find((snapshot) => {
    return (id && snapshot.id === id) || (index && snapshot.index === index);
  }) ?? null;
}

function applyPrewarmedPostSnapshot(content, snapshot) {
  if (!content || !snapshot?.media?.length) {
    return;
  }
  ensurePostMediaCoverage(content, snapshot.media);
}

function applyImportantStyle(element, styles) {
  Object.entries(styles).forEach(([property, value]) => {
    element.style.setProperty(property, value, "important");
  });
}

function normalizeSecurityWatermarkCode(value) {
  const code = String(value ?? "").trim().slice(0, 8);
  return /^[a-z0-9]{8}$/i.test(code) ? code : "";
}

function extractSecurityWatermarkCodeFromValue(value, depth = 0) {
  if (depth > 4 || value == null) {
    return "";
  }
  if (typeof value === "string") {
    const direct = normalizeSecurityWatermarkCode(value);
    if (direct && value.length >= 16) {
      return direct;
    }
    const trimmed = value.trim();
    if (!/^[{[]/.test(trimmed)) {
      return "";
    }
    try {
      return extractSecurityWatermarkCodeFromValue(JSON.parse(trimmed), depth + 1);
    } catch {
      return "";
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const code = extractSecurityWatermarkCodeFromValue(item, depth + 1);
      if (code) {
        return code;
      }
    }
    return "";
  }
  if (typeof value !== "object") {
    return "";
  }
  for (const key of ["watermarkId", "watermark", "watermark_id"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    const code = normalizeSecurityWatermarkCode(value[key]);
    if (code) {
      return code;
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (!/(watermark|user|me|profile|current)/i.test(key)) {
      continue;
    }
    const code = extractSecurityWatermarkCodeFromValue(child, depth + 1);
    if (code) {
      return code;
    }
  }
  return "";
}

function getStoredSecurityWatermarkCode() {
  try {
    const preferredKeys = ["userInfo", "currentUser", "me", "profile"];
    for (const key of preferredKeys) {
      const code = extractSecurityWatermarkCodeFromValue(localStorage.getItem(key));
      if (code) {
        return code;
      }
    }
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      if (!/(watermark|userinfo|currentuser|profile|me|user)/i.test(key)) {
        continue;
      }
      const code = extractSecurityWatermarkCodeFromValue(localStorage.getItem(key));
      if (code) {
        return code;
      }
    }
  } catch {
    return "";
  }
  return "";
}

function handleSecurityWatermarkBridgeMessage(event) {
  if (event.source !== window || event.data?.source !== "CC98_REBORN_WATERMARK_BRIDGE") {
    return;
  }
  const code = rememberSecurityWatermarkCode(event.data?.code);
  if (code) {
    startSecurityWatermark(code);
  }
}

function bindSecurityWatermarkBridgeListener() {
  if (securityWatermarkBridgeListenerBound) {
    return;
  }
  securityWatermarkBridgeListenerBound = true;
  window.addEventListener("message", handleSecurityWatermarkBridgeMessage);
}

function injectSecurityWatermarkPageBridge() {
  if (!WATERMARK_FEATURE_ENABLED) {
    return;
  }
  bindSecurityWatermarkBridgeListener();
}

function readCachedSecurityWatermarkCode() {
  if (!securityWatermarkCachedCode || Date.now() - securityWatermarkCachedAt > WATERMARK_CACHE_TTL) {
    return "";
  }
  return normalizeSecurityWatermarkCode(securityWatermarkCachedCode);
}

function writeCachedSecurityWatermarkCode(code) {
  const normalized = normalizeSecurityWatermarkCode(code);
  if (!normalized) {
    return;
  }
  securityWatermarkCachedCode = normalized;
  securityWatermarkCachedAt = Date.now();
}

function clearCachedSecurityWatermarkCode() {
  securityWatermarkCachedCode = "";
  securityWatermarkCachedAt = 0;
}

function rememberSecurityWatermarkCode(code) {
  const normalized = normalizeSecurityWatermarkCode(code);
  if (normalized) {
    writeCachedSecurityWatermarkCode(normalized);
  }
  return normalized;
}

function getSecurityWatermarkCode({ force = false } = {}) {
  if (!force) {
    const cached = readCachedSecurityWatermarkCode();
    if (cached && hasFreshCc98LoginSession()) {
      return Promise.resolve(cached);
    }
  }
  const storedCode = rememberSecurityWatermarkCode(getStoredSecurityWatermarkCode());
  if (storedCode) {
    return Promise.resolve(storedCode);
  }
  return Promise.resolve(readCachedSecurityWatermarkCode());
}

function getSecurityWatermarkParent() {
  return document.documentElement || document.body;
}

function applySecurityWatermarkHostStyle(host) {
  if (!(host instanceof HTMLElement)) {
    return;
  }
  applyImportantStyle(host, {
    all: "initial",
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    margin: "0",
    padding: "0",
    border: "0",
    display: "block",
    overflow: "hidden",
    "pointer-events": "none",
    "user-select": "none",
    "-webkit-user-select": "none",
    "z-index": "2147483647",
    contain: "strict",
    isolation: "isolate"
  });
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("inert", "");
}

function ensureSecurityWatermarkHost() {
  if (securityWatermarkHost?.isConnected && securityWatermarkCanvas) {
    const parent = getSecurityWatermarkParent();
    if (parent) {
      parent.append(securityWatermarkHost);
    }
    applySecurityWatermarkHostStyle(securityWatermarkHost);
    return true;
  }
  const parent = getSecurityWatermarkParent();
  if (!parent) {
    return false;
  }
  document.querySelectorAll("cc98-reborn-watermark").forEach((node) => {
    if (node !== securityWatermarkHost) {
      node.remove();
    }
  });
  const host = document.createElement("cc98-reborn-watermark");
  applySecurityWatermarkHostStyle(host);
  securityWatermarkRoot = host.attachShadow({ mode: "closed" });
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  applyImportantStyle(canvas, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    display: "block",
    margin: "0",
    padding: "0",
    border: "0",
    background: "transparent",
    "pointer-events": "none",
    "user-select": "none",
    "-webkit-user-select": "none"
  });
  securityWatermarkRoot.append(canvas);
  parent.append(host);
  securityWatermarkHost = host;
  securityWatermarkCanvas = canvas;
  resizeSecurityWatermarkCanvas();
  return true;
}

function resizeSecurityWatermarkCanvas() {
  const canvas = securityWatermarkCanvas;
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 0);
  const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
  const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const pixelWidth = Math.ceil(width * ratio);
  const pixelHeight = Math.ceil(height * ratio);
  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
  }
  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
  }
  canvas.dataset.pixelRatio = String(ratio);
}

function chooseSecurityWatermarkDirection() {
  const angle = Math.random() * Math.PI * 2;
  const speed = 18 + Math.random() * 18;
  securityWatermarkDirection = {
    x: Math.cos(angle) * speed,
    y: Math.sin(angle) * speed
  };
}

function drawSecurityWatermarkFrame(frameAt = performance.now()) {
  const canvas = securityWatermarkCanvas;
  const code = normalizeSecurityWatermarkCode(securityWatermarkCode);
  if (!(canvas instanceof HTMLCanvasElement) || !code || !canvas.isConnected) {
    securityWatermarkAnimationFrame = 0;
    return;
  }
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    securityWatermarkAnimationFrame = 0;
    return;
  }
  const ratio = Number(canvas.dataset.pixelRatio || window.devicePixelRatio || 1) || 1;
  const width = canvas.width / ratio;
  const height = canvas.height / ratio;
  const delta = securityWatermarkLastFrameAt
    ? Math.min(0.08, Math.max(0, (frameAt - securityWatermarkLastFrameAt) / 1000))
    : 0;
  securityWatermarkLastFrameAt = frameAt;
  securityWatermarkOffsetX += securityWatermarkDirection.x * delta;
  securityWatermarkOffsetY += securityWatermarkDirection.y * delta;

  const tileX = 224;
  const tileY = 154;
  const offsetX = ((securityWatermarkOffsetX % tileX) + tileX) % tileX;
  const offsetY = ((securityWatermarkOffsetY % tileY) + tileY) % tileY;
  const margin = Math.max(width, height);

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.translate(-width / 2, -height / 2);
  ctx.font = "700 22px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
  for (let y = -margin + offsetY; y < height + margin; y += tileY) {
    for (let x = -margin + offsetX; x < width + margin; x += tileX) {
      ctx.fillText(code, x, y);
    }
  }
  ctx.restore();
  securityWatermarkAnimationFrame = requestAnimationFrame(drawSecurityWatermarkFrame);
}

function startSecurityWatermarkAnimation() {
  if (!securityWatermarkAnimationFrame) {
    securityWatermarkLastFrameAt = 0;
    securityWatermarkAnimationFrame = requestAnimationFrame(drawSecurityWatermarkFrame);
  }
  if (!securityWatermarkDirectionTimer) {
    chooseSecurityWatermarkDirection();
    securityWatermarkDirectionTimer = window.setInterval(chooseSecurityWatermarkDirection, WATERMARK_DIRECTION_INTERVAL);
  }
}

function stopSecurityWatermark() {
  securityWatermarkCode = "";
  if (securityWatermarkAnimationFrame) {
    cancelAnimationFrame(securityWatermarkAnimationFrame);
    securityWatermarkAnimationFrame = 0;
  }
  if (securityWatermarkDirectionTimer) {
    window.clearInterval(securityWatermarkDirectionTimer);
    securityWatermarkDirectionTimer = 0;
  }
  securityWatermarkHost?.remove();
  securityWatermarkHost = null;
  securityWatermarkRoot = null;
  securityWatermarkCanvas = null;
}

function observeSecurityWatermarkHost() {
  if (securityWatermarkObserver || !document.documentElement) {
    return;
  }
  securityWatermarkObserver = new MutationObserver(() => {
    if (securityWatermarkCode && !securityWatermarkHost?.isConnected) {
      ensureSecurityWatermarkHost();
      startSecurityWatermarkAnimation();
    }
  });
  securityWatermarkObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function startSecurityWatermark(code) {
  const normalized = normalizeSecurityWatermarkCode(code);
  if (!normalized) {
    stopSecurityWatermark();
    return;
  }
  securityWatermarkCode = normalized;
  if (!ensureSecurityWatermarkHost()) {
    return;
  }
  resizeSecurityWatermarkCanvas();
  startSecurityWatermarkAnimation();
  observeSecurityWatermarkHost();
  window.addEventListener("resize", resizeSecurityWatermarkCanvas, { passive: true });
  if (!securityWatermarkEnsureTimer) {
    securityWatermarkEnsureTimer = window.setInterval(() => {
      if (!securityWatermarkCode) {
        return;
      }
      ensureSecurityWatermarkHost();
      resizeSecurityWatermarkCanvas();
      startSecurityWatermarkAnimation();
    }, 900);
  }
}

function ensureSecurityWatermark(options = {}) {
  if (!WATERMARK_FEATURE_ENABLED) {
    stopSecurityWatermark();
    return;
  }
  getSecurityWatermarkCode(options).then((code) => {
    if (code) {
      startSecurityWatermark(code);
    } else {
      stopSecurityWatermark();
    }
  });
  if (!securityWatermarkRevalidateTimer) {
    securityWatermarkRevalidateTimer = window.setInterval(() => {
      ensureSecurityWatermark({ force: true });
    }, WATERMARK_REVALIDATE_INTERVAL);
  }
}

function ensureLoadingOverlayElement() {
  let overlay = document.querySelector("#cc98-comfort-loading");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "cc98-comfort-loading";
    overlay.innerHTML = `
      <div class="cc98-comfort-loading-panel">
        <div class="cc98-comfort-loading-spinner" aria-hidden="true"></div>
        <div class="cc98-comfort-loading-title"></div>
        <div class="cc98-comfort-loading-subtitle"></div>
      </div>
    `;
  }

  const parent = document.body || document.documentElement;
  if (overlay.parentElement !== parent) {
    parent.append(overlay);
  }

  const isNight = document.documentElement.dataset.cc98ComfortTheme === "night";
  applyImportantStyle(overlay, {
    position: "fixed",
    inset: "0",
    "z-index": "2147483647",
    display: "grid",
    "place-items": "center",
    "pointer-events": "auto",
    opacity: "1",
    visibility: "visible",
    background: isNight ? "#15191d" : "#f4f6f5"
  });

  const panel = overlay.querySelector(".cc98-comfort-loading-panel");
  if (panel) {
    applyImportantStyle(panel, {
      display: "grid",
      visibility: "visible",
      opacity: "1"
    });
  }

  overlay.querySelector(".cc98-comfort-loading-title").textContent = loadingOverlayMessage;
  overlay.querySelector(".cc98-comfort-loading-subtitle").textContent = "\u539f\u7248\u9875\u9762\u6b63\u5728\u906e\u7f69\u540e\u9762\u9884\u70ed\uff0c\u5b8c\u6210\u540e\u4f1a\u81ea\u52a8\u663e\u793a\u5b8c\u6574\u9605\u8bfb\u754c\u9762\u3002";
  overlay.hidden = false;
  overlay.removeAttribute("aria-hidden");
  return overlay;
}

function showLoadingOverlay(message = "\u6b63\u5728\u52a0\u8f7d\u5e16\u5b50\u56fe\u7247...") {
  loadingOverlayActive = true;
  loadingOverlayMessage = message;
  ensureLoadingOverlayElement();
  if (!loadingOverlayWatchdog) {
    loadingOverlayWatchdog = setInterval(() => {
      if (loadingOverlayActive) {
        ensureLoadingOverlayElement();
      }
    }, 120);
  }
}

function hideLoadingOverlay() {
  loadingOverlayActive = false;
  if (loadingOverlayWatchdog) {
    clearInterval(loadingOverlayWatchdog);
    loadingOverlayWatchdog = null;
  }
  document.querySelector("#cc98-comfort-loading")?.remove();
}

function hideLoadingOverlayWhenReady(root) {
  const finish = () => {
    requestAnimationFrame(() => {
      hideLoadingOverlay();
      scrollToCurrentRebuiltHash();
      setTimeout(scrollToCurrentRebuiltHash, 120);
    });
  };
  const overlay = document.querySelector("#cc98-comfort-loading");
  if (!overlay) {
    finish();
    return;
  }
  const images = [...root.querySelectorAll("img")]
    .filter((image) => image instanceof HTMLImageElement);
  Promise.all(images.map((image) => waitForNativeImage(image, 1300)))
    .finally(finish);
}

function waitForDomReady() {
  if (document.readyState !== "loading") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });
}

function withTimeout(promise, timeout, label) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeout);
  });
  return Promise.race([promise, timeoutPromise])
    .finally(() => {
      clearTimeout(timeoutId);
    });
}

function shouldPrewarmOriginalBeforeRebuild() {
  return lastSettings?.enabled
    && lastSettings.rebuildUi
    && getPageKind() === "post"
    && lazyPrewarmedPageKey !== getLazyPrewarmPageKey();
}

function startOriginalPagePrewarm() {
  const pageKey = getLazyPrewarmPageKey();
  if (originalPagePrewarmPageKey === pageKey && originalPagePrewarmPromise) {
    return originalPagePrewarmPromise;
  }

  originalPagePrewarmPageKey = pageKey;
  const root = document.documentElement;
  showLoadingOverlay();
  document.querySelector("#cc98-comfort-app")?.remove();
  root.classList.remove("cc98-comfort", "cc98-comfort-rebuild-active");
  root.dataset.cc98ComfortRebuildReady = "false";
  root.dataset.cc98ComfortOriginalPrewarming = "true";

  const timeoutMs = clampNumber(lastSettings?.imageLoadDuration, 800, 8000, DEFAULT_SETTINGS.imageLoadDuration) + 3500;
  let prewarmAborted = false;
  const prewarmWork = (async () => {
    await waitForDomReady();
    if (prewarmAborted) {
      return;
    }
    await wait(450);
    if (prewarmAborted) {
      return;
    }
    await scrollOriginalPageForLazyMedia(lastSettings.imageLoadDuration, () => prewarmAborted);
    if (prewarmAborted) {
      return;
    }
    showLoadingOverlay("\u6b63\u5728\u6574\u7406\u9605\u8bfb\u754c\u9762...");
    prewarmedSnapshotPageKey = "";
    prewarmedPostSnapshots = [];
    const snapshots = collectPrewarmedPostSnapshots();
    if (prewarmAborted) {
      return;
    }
    prewarmedSnapshotPageKey = pageKey;
    prewarmedPostSnapshots = snapshots;
  })();
  prewarmWork.catch(() => {});

  originalPagePrewarmPromise = withTimeout(prewarmWork, timeoutMs, "CC98 original page prewarm")
    .catch((error) => {
      prewarmAborted = true;
      console.warn("[CC98 Reborn] original page prewarm failed", error);
    })
    .finally(() => {
      prewarmAborted = true;
      lazyPrewarmedPageKey = pageKey;
      getNativeScrollTargets().forEach((target) => scrollNativeTargetTo(target, 0));
      dispatchNativeLazySignals();
      root.classList.toggle("cc98-comfort", Boolean(lastSettings?.enabled));
      delete root.dataset.cc98ComfortOriginalPrewarming;
      originalPagePrewarmPromise = null;
      scheduleRebuild();
    });

  return originalPagePrewarmPromise;
}

function updateImageFrameStatus(image) {
  const frame = image.closest(".cc98-rebuild-image-frame");
  if (!frame) {
    return;
  }
  if (!image.src) {
    frame.dataset.status = "failed";
    return;
  }
  if (image.complete && image.naturalWidth > 0) {
    frame.dataset.status = "loaded";
    return;
  }
  if (image.complete && image.naturalWidth === 0) {
    frame.dataset.status = "failed";
    return;
  }
  frame.dataset.status = "loading";
}

function removeDownloadImageFrame(image) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  const restored = image.closest(".cc98-rebuild-restored-media");
  const frame = image.closest(".cc98-rebuild-image-frame");
  if (frame) {
    frame.remove();
  } else {
    image.remove();
  }
  if (restored && !restored.querySelector("img, video, a")) {
    restored.remove();
  }
}

function setupRebuiltImagePlaceholders(root) {
  root.querySelectorAll("img.cc98-rebuild-content-image").forEach((image) => {
    if (isDownloadFileUrl(image.src || getMediaUrl(image))) {
      removeDownloadImageFrame(image);
      return;
    }
    if (image.closest(".cc98-rebuild-image-frame")) {
      updateImageFrameStatus(image);
      return;
    }
    const frame = createElement("div", "cc98-rebuild-image-frame");
    frame.dataset.status = "loading";
    const status = createElement("span", "cc98-rebuild-image-status", "加载中");
    image.before(frame);
    frame.append(image, status);
    image.addEventListener("load", () => updateImageFrameStatus(image));
    image.addEventListener("error", () => updateImageFrameStatus(image));
    updateImageFrameStatus(image);
  });
}

function startPostLazyFallbackPrewarm() {
  if (getPageKind() !== "post") {
    return;
  }
  if (lazyPrewarmedPageKey === getLazyPrewarmPageKey()) {
    return;
  }
  prewarmNativeLazyMedia()
    .then(() => {
      scheduleRebuild();
    })
    .catch((error) => {
      console.warn("[CC98 Reborn] lazy prewarm failed", error);
      document.querySelectorAll("#cc98-comfort-app .cc98-rebuild-image-frame[data-status='loading']")
        .forEach((frame) => {
          frame.dataset.status = "failed";
        });
    });
}

function getPageKind() {
  if (document.querySelector(".errorState")) {
    return "error";
  }
  if (/\/topic\/\d+/i.test(location.pathname)) {
    return "post";
  }
  if (location.pathname.includes("search")) {
    return "search";
  }
  if (/\/editor\/postTopic\/\d+/i.test(location.pathname) || document.querySelector(".createTopic")) {
    return "editor";
  }
  if (/\/logOn/i.test(location.pathname) || document.querySelector(".login")) {
    return "login";
  }
  if (location.pathname.includes("/signin") || document.querySelector(".sign-in")) {
    return "signin";
  }
  if (location.pathname.includes("/message") || document.querySelector(".message-root, .message")) {
    return "message";
  }
  if (document.querySelector(".boardList")) {
    return "boardList";
  }
  if (/\/board\/\d+/i.test(location.pathname) && document.querySelector(".board-body, .board-postItem-body")) {
    return "board";
  }
  if (document.querySelector(".user-center")) {
    return "userCenter";
  }
  if (document.querySelector(".focus-topic, .card-topic")) {
    return document.title.includes("搜索") ? "search" : "topics";
  }
  if (document.querySelector(".mainPage")) {
    return "home";
  }
  return "generic";
}

function getPageTitle() {
  const kind = getPageKind();
  const topicTitle = (() => {
    if (/\/focus/i.test(location.pathname)) {
      return "关注";
    }
    if (/\/recommendedTopics/i.test(location.pathname)) {
      return "精选";
    }
    return "新帖";
  })();
  const map = {
    home: "首页",
    boardList: "版面列表",
    board: getFirstText(document, ".board-head-name") || document.title.replace(" - CC98论坛", "") || "版面",
    editor: "发表主题",
    login: "登录",
    signin: "签到",
    error: getFirstText(document, ".errorText") || document.title.replace(" - CC98论坛", "") || "出错了",
    message: "消息",
    topics: topicTitle,
    search: "搜索结果",
    post: document.title.replace(" - CC98论坛", "") || "帖子",
    userCenter: "个人中心",
    generic: document.title.replace(" - CC98论坛", "") || "CC98"
  };
  return map[kind] ?? "CC98";
}

function parseTopicMetaText(text) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return { meta: "", author: "", replyCount: "" };
  }

  const timePattern = TOPIC_TIME_PATTERN;
  const replyInfo = raw.match(new RegExp(`(?:标签[:：]\\s*(.*?)\\s*/\\s*(.*?)\\s*)?(${timePattern})\\s+(\\d+)\\s*最后回复[:：]\\s*(.*?)\\s*(${timePattern})(?:\\s|$)`));
  if (replyInfo) {
    const [, tag, author, _postedAt, replyCount, lastReplyUser, lastReplyAt] = replyInfo;
    const tagText = tag ? `🏷️标签: ${tag.trim()} / ${author?.trim() || ""} ` : "";
    return {
      meta: "",
      hoverMeta: `${tagText}⏰️最后回复: ${lastReplyAt.trim()} ${lastReplyUser.trim()} 💬回复数: ${replyCount.trim()}`,
      author: author?.trim() || "",
      replyCount: replyCount.trim(),
      lastReplyUser: lastReplyUser.trim(),
      lastReplyAt: lastReplyAt.trim(),
      hasDetails: true
    };
  }

  const cardInfo = raw.match(new RegExp(`^(\\d+)\\s+(\\d+)\\s*最后回复[:：]\\s*(.*?)\\s*(${timePattern})(?:\\s|$)`));
  if (cardInfo) {
    const [, viewCount, replyCount, lastReplyUser, lastReplyAt] = cardInfo;
    return {
      meta: "",
      hoverMeta: `⏰️最后回复: ${lastReplyAt.trim()} ${lastReplyUser.trim()} 💬回复数: ${replyCount.trim()} 👁️浏览数: ${viewCount.trim()}`,
      author: "",
      replyCount: replyCount.trim(),
      viewCount: viewCount.trim(),
      lastReplyUser: lastReplyUser.trim(),
      lastReplyAt: lastReplyAt.trim(),
      hasDetails: true
    };
  }

  const searchInfo = raw.match(new RegExp(`^(${timePattern})\\s+(\\d+)\\s*最后回复[:：]\\s*(.+?)\\s*$`));
  if (searchInfo) {
    const [, listedAt, viewCount, lastReplyUser] = searchInfo;
    return {
      meta: "",
      hoverMeta: `⏰️时间: ${listedAt.trim()} 👁️浏览数: ${viewCount.trim()} 最后回复: ${lastReplyUser.trim()}`,
      author: "",
      replyCount: "",
      viewCount: viewCount.trim(),
      lastReplyUser: lastReplyUser.trim(),
      lastReplyAt: listedAt.trim(),
      hasDetails: true
    };
  }

  const dateSummary = raw.match(/^(\d{4}-\d{1,2}-\d{1,2})(.+)$/);
  if (dateSummary && !/(?:最后回复|回复|回帖)/.test(raw)) {
    return {
      meta: `📅日期: ${dateSummary[1].trim()} ✏️摘要: ${dateSummary[2].trim()}`,
      author: "",
      replyCount: "",
      hasDetails: true
    };
  }

  const replyMatch = raw.match(/(\d+)\s*(?:最后回复|回复|回帖)/);
  const authorMatch = raw.match(new RegExp(`/\\s*(.*?)\\s*${timePattern}`));
  return {
    meta: raw,
    author: authorMatch?.[1]?.trim() ?? "",
    replyCount: replyMatch?.[1]?.trim() ?? "",
    hasDetails: Boolean(authorMatch || replyMatch)
  };
}

function getTopicInfoText(topic) {
  const info = topic.querySelector(".focus-topic-info, .card-topic-info");
  if (!info) {
    return "";
  }
  const childTexts = [...info.children]
    .map((child) => child.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter(Boolean);
  return (childTexts.length > 1 ? childTexts.join(" ") : info.textContent ?? "").trim();
}

function getTopicInfoParts(topic) {
  const info = topic.querySelector(".focus-topic-info, .card-topic-info");
  if (!info) {
    return null;
  }
  const parts = [...info.children]
    .filter((child) => !child.classList?.contains("displaynone"))
    .map((child) => ({
      node: child,
      text: child.textContent?.replace(/\s+/g, " ").trim() ?? ""
    }))
    .filter((part) => part.text);
  return { info, parts };
}

function getFirstNumber(text) {
  return String(text ?? "").match(/\d+/)?.[0] ?? "";
}

function isTopicTimeText(text) {
  return TOPIC_TIME_RE.test(normalizeSuggestionText(text));
}

function stripTopicLabel(text) {
  return String(text ?? "").replace(/^标签[:：]\s*/, "").trim();
}

function parseStructuredTopicMeta(topic) {
  const parsed = getTopicInfoParts(topic);
  if (!parsed) {
    return null;
  }
  const { info, parts } = parsed;
  if (info.classList.contains("card-topic-info") && parts.length >= 4) {
    const viewCount = getFirstNumber(parts[0].text);
    const replyCount = getFirstNumber(parts[1].text);
    const lastReplyPart = parts.find((part) => part.text.includes("最后回复"));
    const lastReplyUser = getFirstLink(lastReplyPart?.node ?? info, 'a[href*="/user/"]')?.text
      || lastReplyPart?.text.replace(/最后回复[:：]\s*/, "").trim()
      || "";
    const lastReplyAt = parts[3].text;
    if (viewCount && replyCount && lastReplyUser && lastReplyAt) {
      return {
        meta: "",
        hoverMeta: `⏰️最后回复: ${lastReplyAt} ${lastReplyUser} 💬回复数: ${replyCount} 👁️浏览数: ${viewCount}`,
        author: "",
        replyCount,
        viewCount,
        lastReplyUser,
        lastReplyAt,
        hasDetails: true
      };
    }
  }
  if (info.classList.contains("focus-topic-info") && parts.length >= 3) {
    const tagPart = parts.find((part) => /^标签[:：]/.test(part.text));
    const timePart = parts.find((part) => isTopicTimeText(part.text));
    const viewPart = parts.find((part) => {
      if (part === tagPart || part === timePart || part.text.includes("最后回复")) {
        return false;
      }
      return Boolean(getFirstNumber(part.text));
    });
    const listedAt = timePart?.text || "";
    const tag = stripTopicLabel(tagPart?.text || "");
    const viewCount = getFirstNumber(viewPart?.text);
    const lastReplyPart = parts.find((part) => part.text.includes("最后回复"));
    const lastReplyUser = getFirstLink(lastReplyPart?.node ?? info, 'a[href*="/user/"]')?.text
      || lastReplyPart?.text.replace(/最后回复[:：]\s*/, "").trim()
      || "";
    if ((listedAt || tag) && viewCount && lastReplyUser) {
      const hoverMeta = [
        tag ? `🏷️标签: ${tag}` : "",
        listedAt ? `⏰️时间: ${listedAt}` : "",
        `👁️浏览数: ${viewCount}`,
        `最后回复: ${lastReplyUser}`
      ].filter(Boolean).join(" ");
      return {
        meta: "",
        hoverMeta,
        author: "",
        replyCount: "",
        viewCount,
        lastReplyUser,
        lastReplyAt: listedAt,
        hasDetails: true
      };
    }
  }
  return null;
}

function getTopicItems(root = document) {
  const items = [];
  const seen = new Set();
  root.querySelectorAll(".focus-topic, .card-topic").forEach((topic) => {
    const titleLink = getFirstLink(topic, ".focus-topic-title, .card-topic-title");
    if (!titleLink?.href || seen.has(titleLink.href)) {
      return;
    }
    seen.add(titleLink.href);

    const board = getFirstLink(topic, '.focus-topic-right[href*="/board/"], .card-topic-boardName a[href*="/board/"]');
    const user = getFirstLink(topic, '.focus-topic-left[href*="/user/id/"], .card-topic-userName[href*="/user/id/"]');
    const avatar = topic.querySelector("img")?.src ?? "";
    const parsedMeta = parseStructuredTopicMeta(topic) ?? parseTopicMetaText(getTopicInfoText(topic));
    const uidMatch = user?.href?.match(/\/user\/id\/(\d+)/);
    items.push({
      type: "topic",
      title: titleLink.text,
      href: titleLink.href,
      board: board?.text ?? "",
      boardHref: board?.href ?? "",
      user: user?.text || getFirstText(topic, ".focus-topic-userName, .card-topic-userName") || parsedMeta.author,
      uid: uidMatch?.[1] ?? "",
      avatar,
      meta: parsedMeta.meta,
      hoverMeta: parsedMeta.hoverMeta,
      replyCount: parsedMeta.replyCount,
      viewCount: parsedMeta.viewCount || ""
    });
  });
  return items;
}

function getPostTitle() {
  const selectors = [
    ".topic-title",
    ".post-title",
    ".title",
    "h1",
    "h2"
  ];
  for (const selector of selectors) {
    const text = getFirstText(document, selector);
    if (text && text.length > 1 && !["CC98论坛", "首页"].includes(text)) {
      return text;
    }
  }
  return document.title.replace(" - CC98论坛", "") || "帖子正文";
}

function cleanupPostText(text) {
  return String(text ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function getOwnMediaUrl(node) {
  const attrs = [
    "src",
    "href",
    "data-src",
    "data-original",
    "data-url",
    "data-img",
    "data-image",
    "data-origin",
    "data-original-src",
    "data-lazy-src",
    "data-actualsrc",
    "data-full",
    "data-full-src",
    "data-file",
    "data-href"
  ];
  for (const attr of attrs) {
    const value = node.getAttribute?.(attr);
    if (value && !value.startsWith("data:") && value !== "#") {
      return value;
    }
  }
  const srcset = node.getAttribute?.("srcset") || node.getAttribute?.("data-srcset");
  if (srcset) {
    const first = srcset.split(",").map((item) => item.trim().split(/\s+/)[0]).find(Boolean);
    if (first) {
      return first;
    }
  }
  const background = node.getAttribute?.("style")?.match(/url\(["']?([^"')]+)["']?\)/i)?.[1];
  return background || "";
}

function getMediaUrl(node) {
  const ownUrl = getOwnMediaUrl(node);
  if (ownUrl) {
    return ownUrl;
  }

  const source = node.closest?.("picture")?.querySelector("source[srcset], source[data-srcset], source[src], source[data-src]");
  if (source) {
    return getMediaUrl(source);
  }

  const parent = node.parentElement;
  if (parent && parent !== node.closest?.("article")) {
    return getMediaUrl(parent);
  }

  return "";
}

function isImageUrl(url) {
  return /\.(?:png|jpe?g|gif|webp|bmp|avif)(?:[?#].*)?$/i.test(String(url ?? ""));
}

function isAudioUrl(url) {
  return /\.(?:mp3|m4a|wav|flac|aac|ogg|opus)(?:[?#].*)?$/i.test(String(url ?? ""));
}

function isDownloadFileUrl(url) {
  const value = String(url ?? "");
  return /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv|tsv|md)(?:[?#].*)?$/i.test(value)
    || (/\/v4-upload\/d\//i.test(value) && !isAudioUrl(value) && !isImageUrl(value));
}

function isDecorativeFrameImageUrl(url) {
  const raw = String(url ?? "").replace(/\\/g, "/");
  if (!raw) {
    return false;
  }
  if (/\/static\/images\/(?:%E7%9B%B8%E6%A1%86|\u76f8\u6846)\//i.test(raw)) {
    return true;
  }
  let pathname = raw;
  try {
    pathname = decodeURIComponent(new URL(raw, location.origin).pathname).replace(/\\/g, "/");
  } catch {
    try {
      pathname = decodeURIComponent(raw).replace(/\\/g, "/");
    } catch {
      pathname = raw;
    }
  }
  return /\/static\/images\/\u76f8\u6846\//i.test(pathname);
}

function getNonDecorativeImageSrc(image) {
  if (!(image instanceof HTMLImageElement)) {
    return "";
  }
  const src = makeAbsoluteCc98Url(getMediaUrl(image) || image.currentSrc || image.src || "");
  return src && !isDecorativeFrameImageUrl(src) ? src : "";
}

function removeDecorativeFrameImages(root = document) {
  const images = [
    ...(root instanceof HTMLImageElement ? [root] : []),
    ...(root.querySelectorAll?.("img") ?? [])
  ];
  images.forEach((image) => {
    if (!(image instanceof HTMLImageElement)) {
      return;
    }
    const rawSrc = image.getAttribute("src")
      || image.getAttribute("data-src")
      || image.currentSrc
      || image.src
      || getOwnMediaUrl(image);
    if (isDecorativeFrameImageUrl(rawSrc)) {
      image.remove();
    }
  });
}

function isProbablyPostImageUrl(url) {
  const value = String(url ?? "");
  if (isDownloadFileUrl(value)) {
    return false;
  }
  return isImageUrl(value) || /(?:^|\/\/)file\.cc98\.org\/v4-upload\/[pi]\//i.test(value);
}

function isVideoUrl(url) {
  return /\.(?:mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i.test(String(url ?? ""));
}

function isProbablyPostVideoUrl(url) {
  return isVideoUrl(url) || /(?:^|\/\/)file\.cc98\.org\/.*\/v\//i.test(String(url ?? ""));
}

function isAPlayerElement(node) {
  return Boolean(node?.closest?.(".aplayer, .cc98-rebuild-audio-player"));
}

function extractAudioUrlFromText(text) {
  const match = String(text ?? "").match(/(?:https?:\/\/[^\s<>"']+|\/[^\s<>"']+)\.(?:mp3|m4a|wav|flac|aac|ogg|opus)(?:[?#][^\s<>"']*)?/i);
  return match ? makeAbsoluteCc98Url(match[0]) : "";
}

function getAPlayerAudioUrl(player) {
  if (!(player instanceof Element)) {
    return "";
  }
  const mediaNode = player.querySelector("audio[src], source[src], a[href]");
  const mediaUrl = mediaNode ? getMediaUrl(mediaNode) : "";
  if (isAudioUrl(mediaUrl)) {
    return makeAbsoluteCc98Url(mediaUrl);
  }
  for (const node of player.querySelectorAll(".aplayer-title, .aplayer-list-title, [class*='title']")) {
    const url = extractAudioUrlFromText(node.textContent);
    if (url) {
      return url;
    }
  }
  return extractAudioUrlFromText(player.textContent);
}

function getAudioTitleFromUrl(url) {
  try {
    const filename = decodeURIComponent(new URL(url, location.href).pathname.split("/").filter(Boolean).pop() || "");
    return filename || "\u97f3\u9891";
  } catch {
    return "\u97f3\u9891";
  }
}

function createAudioPlayerFromUrl(url, title = "") {
  const src = makeAbsoluteCc98Url(url);
  const player = createElement("div", "cc98-rebuild-audio-player");
  const cover = createElement("div", "cc98-rebuild-audio-cover", "");
  cover.setAttribute("aria-hidden", "true");
  const body = createElement("div", "cc98-rebuild-audio-body");
  body.append(createElement("div", "cc98-rebuild-audio-title", title || getAudioTitleFromUrl(src)));
  const audio = document.createElement("audio");
  audio.className = "cc98-rebuild-audio-control";
  audio.src = src;
  audio.controls = true;
  audio.preload = "metadata";
  body.append(audio);
  const download = createLink("cc98-rebuild-download-button cc98-rebuild-audio-download", "\u4e0b\u8f7d\u97f3\u9891", src);
  download.setAttribute("download", "");
  body.append(download);
  player.append(cover, body);
  return player;
}

function isImageCarrierNode(node) {
  const haystack = [
    node.getAttribute?.("class"),
    node.getAttribute?.("id"),
    ...[...node.attributes ?? []].map((attr) => attr.name)
  ].join(" ");
  return /\b(?:image|img|photo|picture|pic|thumb|upload|attachment|preview)\b/i.test(haystack);
}

function isVideoCarrierNode(node) {
  const haystack = [
    node.getAttribute?.("class"),
    node.getAttribute?.("id"),
    ...[...node.attributes ?? []].map((attr) => attr.name)
  ].join(" ");
  return /\b(?:video|player|dplayer|media)\b/i.test(haystack);
}

function createContentImageFromUrl(url, alt = "") {
  const image = document.createElement("img");
  image.src = url;
  image.alt = alt;
  return image;
}

function createContentVideoFromUrl(url) {
  const video = document.createElement("video");
  video.className = "cc98-rebuild-content-video";
  video.src = makeAbsoluteCc98Url(url);
  video.controls = true;
  video.preload = "metadata";
  video.playsInline = true;
  return video;
}

function normalizeMediaKey(url) {
  return String(url ?? "")
    .replace(/^https?:/, "")
    .replace(/([?#]).*$/, "")
    .trim();
}

function isEmojiImageUrl(url) {
  const filename = decodeURIComponent(String(url ?? "").split(/[/?#]/).filter(Boolean).pop() || "");
  return /^\d{1,6}\.png$/i.test(filename)
    || /^[a-z]{4,6}\.png$/i.test(filename)
    || /^[a-z]{4,7}\d+\.png$/i.test(filename)
    || /^[a-z]{2,5}\d{2,5}\.png$/i.test(filename)
    || /^[a-z]{2,5}\d{2,5}\.gif$/i.test(filename)
    || /emoji|emoticon|face/i.test(String(url ?? ""));
}

function isTransparentAcEmojiUrl(url) {
  const value = String(url ?? "");
  const filename = decodeURIComponent(value.split(/[/?#]/).filter(Boolean).pop() || "");
  if (/\/mahjong\//i.test(value)) {
    return false;
  }
  return /^(?:\d{2}|\d{4})\.png$/i.test(filename);
}

function markRebuiltEmojiImage(image, src = image?.src) {
  if (!(image instanceof HTMLImageElement)) {
    return false;
  }
  if (!isEmojiImageUrl(src)) {
    image.classList.add("cc98-rebuild-content-image");
    return false;
  }
  image.classList.add("cc98-rebuild-inline-emoji");
  image.classList.remove("cc98-rebuild-content-image");
  if (isTransparentAcEmojiUrl(src)) {
    image.classList.add("cc98-rebuild-invertible-emoji");
  } else {
    image.classList.remove("cc98-rebuild-invertible-emoji");
  }
  return true;
}

function markInlineEmojiContainers(root) {
  root.querySelectorAll("img.cc98-rebuild-inline-emoji").forEach((image) => {
    let parent = image.parentElement;
    while (parent && parent !== root && parent.childElementCount === 1 && cleanupPostText(parent.textContent) === "") {
      if (!/^(DIV|SPAN|P)$/i.test(parent.tagName)) {
        break;
      }
      parent.classList.add("cc98-rebuild-inline-emoji-wrap");
      parent = parent.parentElement;
    }
  });
}

function isEmojiOnlyNode(node) {
  if (node?.nodeType === Node.TEXT_NODE) {
    return !cleanupPostText(node.nodeValue);
  }
  if (!(node instanceof Element)) {
    return false;
  }
  if (node.tagName === "BR") {
    return true;
  }
  if (node.tagName === "IMG") {
    const src = getMediaUrl(node) || node.currentSrc || node.src || "";
    return isEmojiImageUrl(src);
  }
  if (!/^(A|DIV|SPAN|P)$/i.test(node.tagName)) {
    return false;
  }
  return [...node.childNodes].every(isEmojiOnlyNode);
}

function isEmojiOnlyParagraph(node) {
  return node instanceof HTMLElement
    && /^P$/i.test(node.tagName)
    && Boolean(node.querySelector("img"))
    && [...node.childNodes].every(isEmojiOnlyNode);
}

function mergeEmojiOnlyParagraphRuns(root) {
  const articles = [
    ...(root instanceof HTMLElement && root.matches("article, .cc98-rebuild-post-body article") ? [root] : []),
    ...(root.querySelectorAll?.(".cc98-rebuild-post-body article, article") ?? [])
  ];
  [...new Set(articles)].forEach((article) => {
    let mergeTarget = null;
    [...article.children].forEach((child) => {
      if (!(child instanceof HTMLElement)) {
        return;
      }
      if (isEmojiOnlyParagraph(child)) {
        if (mergeTarget instanceof HTMLElement) {
          while (child.firstChild) {
            mergeTarget.append(child.firstChild);
          }
          child.remove();
          return;
        }
        mergeTarget = child;
        child.classList.add("cc98-rebuild-emoji-line");
        return;
      }
      mergeTarget = child.matches("p, .cc98-rebuild-text-line") ? child : null;
    });
  });
}

function isInlineEmojiOnlyElement(node) {
  if (!(node instanceof Element)) {
    return false;
  }
  let hasEmoji = false;
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (cleanupPostText(child.nodeValue)) {
        return false;
      }
      continue;
    }
    if (!(child instanceof Element)) {
      return false;
    }
    if (child.tagName === "IMG") {
      const src = getMediaUrl(child) || child.currentSrc || child.src || "";
      if (!isEmojiImageUrl(src)) {
        return false;
      }
      hasEmoji = true;
      continue;
    }
    if (!/^(DIV|SPAN|P)$/i.test(child.tagName) || !isInlineEmojiOnlyElement(child)) {
      return false;
    }
    hasEmoji = true;
  }
  return hasEmoji;
}

function isInlineEmojiFlowNode(node, root) {
  if (node.nodeType === Node.TEXT_NODE) {
    return !isJunkPostLine(cleanupPostText(node.nodeValue));
  }
  if (!(node instanceof Element) || isSkippablePostElement(node)) {
    return false;
  }
  if (node.tagName === "BR") {
    return true;
  }
  if (node.tagName === "IMG") {
    return isEmojiImageUrl(getMediaUrl(node) || node.currentSrc || node.src || "");
  }
  if (node.matches("video, source, iframe, canvas, table, ul, ol, blockquote, pre")) {
    return false;
  }
  if (isQuoteElement(node)) {
    return false;
  }
  const styleDisplay = (node.getAttribute("style") || "").match(/display\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() || "";
  const isInlineContainer = node === root
    || /^(A|SPAN|B|I|U|S|DEL|EM|STRONG|SMALL|MARK|FONT)$/i.test(node.tagName)
    || styleDisplay === "inline"
    || isInlineEmojiOnlyElement(node);
  if (!isInlineContainer) {
    return false;
  }
  return [...node.childNodes].every((child) => isInlineEmojiFlowNode(child, root));
}

function buildInlineEmojiFlowPostContent(root) {
  if (!(root instanceof Element) || !root.querySelector("img")) {
    return null;
  }
  const hasEmoji = [...root.querySelectorAll("img")]
    .some((image) => isEmojiImageUrl(getMediaUrl(image) || image.currentSrc || image.src || ""));
  if (!hasEmoji || !isInlineEmojiFlowNode(root, root)) {
    return null;
  }

  const article = document.createElement("article");
  const line = createElement("p", "cc98-rebuild-text-line cc98-rebuild-inline-emoji-flow");
  const appendText = (value) => {
    const text = String(value ?? "").replace(/\s+/g, " ");
    if (!text.trim()) {
      return;
    }
    line.append(document.createTextNode(text));
  };
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.nodeValue);
      return;
    }
    if (!(node instanceof Element)) {
      return;
    }
    if (node.tagName === "BR") {
      line.append(document.createTextNode(" "));
      return;
    }
    if (node.tagName === "IMG") {
      const src = getMediaUrl(node) || node.currentSrc || node.src || "";
      if (!isEmojiImageUrl(src)) {
        return;
      }
      const image = createContentImageFromUrl(makeAbsoluteCc98Url(src), node.alt || "");
      markRebuiltEmojiImage(image, src);
      line.append(image);
      return;
    }
    node.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  if (!line.childNodes.length) {
    return null;
  }
  article.append(line);
  stabilizeEmojiRendering(article);
  return article;
}

function stabilizeEmojiRendering(root = document) {
  const images = [
    ...(root instanceof HTMLImageElement ? [root] : []),
    ...(root.querySelectorAll?.("img") ?? [])
  ];
  images.forEach((image) => {
    if (!(image instanceof HTMLImageElement)) {
      return;
    }
    const src = getMediaUrl(image) || image.currentSrc || image.src || "";
    if (!isEmojiImageUrl(src)) {
      return;
    }
    markRebuiltEmojiImage(image, src);
  });
  markInlineEmojiContainers(root instanceof Document ? root.body || root.documentElement : root);
  mergeEmojiOnlyParagraphRuns(root instanceof Document ? root.body || root.documentElement : root);
}

function isSkippablePostElement(node) {
  if (!(node instanceof Element)) {
    return false;
  }
  return node.matches([
    "script",
    "style",
    "button",
    "input",
    "textarea",
    "select",
    '[role="button"]',
    '[class*="signature"]',
    '[class*="Signature"]',
    ".awardInfo",
    '[class*="awardInfo"]',
    '[class*="AwardInfo"]',
    '[class*="score"]',
    '[class*="Score"]',
    '[class*="rate"]',
    '[class*="Rate"]',
    '[class*="wealth"]',
    '[class*="Wealth"]',
    '[class*="follow"]',
    '[class*="Follow"]',
    '[class*="message"]',
    '[class*="Message"]',
    '[class*="operation"]',
    '[class*="Operation"]',
    '[class*="toolbar"]',
    '[class*="Toolbar"]'
  ].join(","));
}

function isJunkPostLine(line) {
  return !line
    || /^(帖数|粉丝|威望|最后登录)\s*\d*/.test(line)
    || /^发表于\s+/.test(line)
    || /^(关注|私信|评分|追踪|回复|举报|引用|编辑)$/.test(line)
    || /^[+-]?\d+$/.test(line);
}

function isBlockPostElement(node) {
  return node instanceof Element && /^(ARTICLE|SECTION|DIV|P|BLOCKQUOTE|PRE|UL|OL|LI|TABLE|TR|BR|HR)$/i.test(node.tagName);
}

function isQuoteElement(node) {
  if (!(node instanceof Element)) {
    return false;
  }
  const text = cleanupPostText(node.textContent);
  const style = node.getAttribute("style") || "";
  return /^以下是引用\d+楼/.test(text)
    || text.includes(">>查看原帖<<")
    || (text.includes("以下是引用") && /background-color|border/i.test(style));
}

function normalizeRichContentNode(root, options = {}) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll("script, style, button, input, textarea, select, [role='button'], .awardInfo, [class*='awardInfo'], [class*='AwardInfo']").forEach((node) => node.remove());
  if (!options.keepSignatureChildren) {
    clone.querySelectorAll('[class*="signature"], [class*="Signature"]').forEach((node) => node.remove());
  }
  clone.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || link.href || "";
    link.href = makeAbsoluteCc98Url(href);
    if (!link.href.startsWith(location.origin)) {
      link.target = "_blank";
      link.rel = "noreferrer";
    }
  });
  rewriteOriginalPostQuoteLinks(clone);
  clone.querySelectorAll("img").forEach((image) => {
    const src = getNonDecorativeImageSrc(image);
    if (!src) {
      image.remove();
      return;
    }
    if (src) {
      image.src = makeAbsoluteCc98Url(src);
    }
    image.removeAttribute("srcset");
    markRebuiltEmojiImage(image, image.src);
  });
  markInlineEmojiContainers(clone);
  return clone;
}

function renderQuoteBox(node) {
  const box = createElement("div", "cc98-rebuild-quote-box");
  const content = normalizeRichContentNode(node);
  content.removeAttribute("style");
  content.classList.add("cc98-rebuild-quote-content");
  box.append(content);
  return box;
}

function appendInlineUbbText(target, text) {
  const source = String(text ?? "");
  const tokenPattern = /\[(\/?)(b|i|u|s|del|url|color|size|align)(?:=([^\]]+))?\]|\[img\]([\s\S]*?)\[\/img\]/ig;
  const stack = [{ tag: "", node: target }];
  let lastIndex = 0;

  const appendText = (value) => {
    if (value) {
      stack.at(-1).node.append(document.createTextNode(value));
    }
  };

  const makeNode = (tag, value = "") => {
    if (tag === "b") {
      return document.createElement("strong");
    }
    if (tag === "i") {
      return document.createElement("em");
    }
    if (tag === "u") {
      const node = document.createElement("span");
      node.style.setProperty("text-decoration", "underline", "important");
      return node;
    }
    if (tag === "s") {
      return document.createElement("s");
    }
    if (tag === "del") {
      return document.createElement("del");
    }
    if (tag === "url") {
      const node = document.createElement("a");
      node.href = makeAbsoluteCc98Url(value || "#");
      node.dataset.cc98UbbExplicitUrl = value ? "true" : "false";
      if (!node.href.startsWith(location.origin)) {
        node.target = "_blank";
        node.rel = "noreferrer";
      }
      return node;
    }
    if (tag === "color") {
      const node = document.createElement("span");
      if (/^#[0-9a-f]{3,8}$|^[a-z]+$|^rgb/i.test(value)) {
        node.style.setProperty("color", value, "important");
      }
      return node;
    }
    const node = document.createElement("span");
    if (tag === "size") {
      const size = Math.min(7, Math.max(1, Number(value) || 3));
      node.style.setProperty("font-size", `${0.72 + size * 0.14}em`, "important");
    }
    if (tag === "align" && /^(left|center|right)$/i.test(value)) {
      node.style.setProperty("display", "block", "important");
      node.style.setProperty("text-align", value.toLowerCase(), "important");
    }
    return node;
  };

  source.replace(tokenPattern, (match, closing, tag, value, imageUrl, offset) => {
    appendText(source.slice(lastIndex, offset));
    lastIndex = offset + match.length;
    if (imageUrl) {
      const src = imageUrl.trim();
      if (src) {
        const image = createContentImageFromUrl(makeAbsoluteCc98Url(src), "");
        markRebuiltEmojiImage(image, src);
        stack.at(-1).node.append(image);
      }
      return match;
    }
    const normalizedTag = String(tag || "").toLowerCase();
    if (closing) {
      const index = stack.map((item) => item.tag).lastIndexOf(normalizedTag);
      if (index > 0) {
        const closedNode = stack[index].node;
        if (normalizedTag === "url" && closedNode instanceof HTMLAnchorElement) {
          const textHref = (closedNode.textContent || "").trim();
          if (closedNode.dataset.cc98UbbExplicitUrl !== "true" && /^(?:https?:)?\/\/|^\/|^www\./i.test(textHref)) {
            closedNode.href = makeAbsoluteCc98Url(/^www\./i.test(textHref) ? `https://${textHref}` : textHref);
            if (!closedNode.href.startsWith(location.origin)) {
              closedNode.target = "_blank";
              closedNode.rel = "noreferrer";
            }
          }
          delete closedNode.dataset.cc98UbbExplicitUrl;
        }
        stack.length = index;
      }
      return match;
    }
    const node = makeNode(normalizedTag, value || "");
    stack.at(-1).node.append(node);
    stack.push({ tag: normalizedTag, node });
    return match;
  });
  appendText(source.slice(lastIndex));
  target.querySelectorAll?.("a[data-cc98-ubb-explicit-url]").forEach((link) => {
    delete link.dataset.cc98UbbExplicitUrl;
  });
}

function parseInlineUbbTextNodes(root) {
  if (!root) {
    return root;
  }
  const ubbPattern = /\[(?:\/?(?:b|i|u|s|del|url|color|size|align|img)(?:=[^\]]+)?)\]/i;
  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue || "";
      if (!ubbPattern.test(text)) {
        return NodeFilter.FILTER_REJECT;
      }
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, textarea, select, button, code, pre")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  textNodes.forEach((textNode) => {
    const parsed = document.createElement("span");
    appendInlineUbbText(parsed, textNode.nodeValue || "");
    const fragment = document.createDocumentFragment();
    while (parsed.firstChild) {
      fragment.append(parsed.firstChild);
    }
    textNode.replaceWith(fragment);
  });
  return root;
}

function strengthenInlineTextStyles(root) {
  if (!root) {
    return;
  }
  const props = ["color", "font-size", "text-align", "text-decoration", "display"];
  const styledNodes = [
    ...(root instanceof Element && root.hasAttribute("style") ? [root] : []),
    ...root.querySelectorAll("[style]")
  ];
  styledNodes.forEach((node) => {
    props.forEach((prop) => {
      const value = node.style.getPropertyValue(prop);
      if (value) {
        node.style.setProperty(prop, value, "important");
      }
    });
  });
}

function buildReadablePostContent(contentNode) {
  const output = document.createElement("article");
  let paragraph = null;

  const ensureParagraph = () => {
    if (!paragraph) {
      paragraph = createElement("p", "cc98-rebuild-text-line");
      output.append(paragraph);
    }
    return paragraph;
  };

  const flushParagraph = () => {
    if (paragraph && !cleanupPostText(paragraph.textContent) && !paragraph.querySelector("img")) {
      paragraph.remove();
    }
    paragraph = null;
  };

  const appendText = (text) => {
    String(text ?? "")
      .split(/\n+/)
      .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
      .filter((line) => !isJunkPostLine(line))
      .forEach((line) => {
        const p = ensureParagraph();
        if (p.textContent && !/[（(《【\[\s]$/.test(p.textContent)) {
          p.append(document.createTextNode(" "));
        }
        appendInlineUbbText(p, line);
      });
  };

  const appendImage = (src, alt = "") => {
    if (!src) {
      return;
    }
    if (isDecorativeFrameImageUrl(src)) {
      return;
    }
    const image = createContentImageFromUrl(src, alt);
    if (isEmojiImageUrl(src)) {
      markRebuiltEmojiImage(image, src);
      ensureParagraph().append(image);
      return;
    }
    flushParagraph();
    markRebuiltEmojiImage(image, src);
    output.append(image);
  };

  const appendVideo = (src) => {
    if (!src) {
      return;
    }
    flushParagraph();
    output.append(createContentVideoFromUrl(src));
  };

  const appendAudioPlayer = (node) => {
    const src = getAPlayerAudioUrl(node);
    if (!src) {
      return false;
    }
    const title = cleanupPostText(node.querySelector?.(".aplayer-title, .aplayer-list-title")?.textContent);
    flushParagraph();
    output.append(createAudioPlayerFromUrl(src, title));
    return true;
  };

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.nodeValue);
      return;
    }
    if (!(node instanceof Element) || isSkippablePostElement(node)) {
      return;
    }
    if (node.classList?.contains("aplayer")) {
      if (appendAudioPlayer(node)) {
        return;
      }
    }
    if (isVideoCarrierNode(node) && node.querySelector("video, source")) {
      appendVideo(getMediaUrl(node.querySelector("video, source")));
      return;
    }
    if (isQuoteElement(node)) {
      flushParagraph();
      output.append(renderQuoteBox(node));
      return;
    }
    if (node.tagName === "BR") {
      flushParagraph();
      return;
    }
    if (node.tagName === "IMG") {
      appendImage(getMediaUrl(node), node.alt || cleanupPostText(node.textContent));
      return;
    }
    if (node.tagName === "VIDEO" || node.tagName === "SOURCE") {
      appendVideo(getMediaUrl(node));
      return;
    }
    if (node.tagName === "A") {
      const href = node.href || node.getAttribute("href") || "";
      if (isProbablyPostVideoUrl(href) && !node.querySelector("video")) {
        appendVideo(href);
        return;
      }
      if ((isProbablyPostImageUrl(href) || isImageCarrierNode(node)) && !node.querySelector("img")) {
        appendImage(href, cleanupPostText(node.textContent));
        return;
      }
    }

    const nodeMedia = getOwnMediaUrl(node);
    const hasChildImage = Boolean(node.querySelector("img"));
    const hasChildVideo = Boolean(node.querySelector("video, source"));
    const hasBackgroundImage = /url\(/i.test(node.getAttribute("style") || "");
    if (!hasChildVideo && nodeMedia && (isProbablyPostVideoUrl(nodeMedia) || isVideoCarrierNode(node))) {
      appendVideo(nodeMedia);
      return;
    }
    if (!hasChildImage && nodeMedia && (isProbablyPostImageUrl(nodeMedia) || isImageCarrierNode(node) || hasBackgroundImage)) {
      appendImage(nodeMedia, cleanupPostText(node.textContent));
      return;
    }

    node.childNodes.forEach((child) => walk(child));
    if (isBlockPostElement(node) && !isInlineEmojiOnlyElement(node)) {
      flushParagraph();
    }
  };

  contentNode.childNodes.forEach((node) => walk(node));
  markInlineEmojiContainers(output);
  flushParagraph();
  return output;
}

function collectPostMediaSources(root) {
  const sources = [];
  const seen = new Set();
  root.querySelectorAll("img, a[href], [style*='url('], [data-src], [data-original], [data-url], [data-img], [data-image], [data-full], [data-full-src], [data-file], [data-href]").forEach((node) => {
    if (!(node instanceof Element) || node.closest('[class*="signature"], [class*="Signature"]')) {
      return;
    }
    if (isAPlayerElement(node)) {
      return;
    }
    const src = getMediaUrl(node);
    if (!src || isDecorativeFrameImageUrl(src) || isEmojiImageUrl(src) || isDownloadFileUrl(src) || (!isProbablyPostImageUrl(src) && !isImageCarrierNode(node))) {
      return;
    }
    const key = normalizeMediaKey(src);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    sources.push({ src, alt: cleanupPostText(node.textContent) });
  });
  return sources;
}

function materializeAudioPlayers(clone) {
  clone.querySelectorAll(".aplayer").forEach((player) => {
    const src = getAPlayerAudioUrl(player);
    if (!src) {
      return;
    }
    const title = cleanupPostText(player.querySelector(".aplayer-title, .aplayer-list-title")?.textContent);
    player.replaceWith(createAudioPlayerFromUrl(src, title));
  });
}

function materializePostMedia(clone) {
  clone.querySelectorAll("img").forEach((image) => {
    if (isAPlayerElement(image)) {
      return;
    }
    const src = getMediaUrl(image);
    if (isDecorativeFrameImageUrl(src)) {
      image.remove();
      return;
    }
    if (src) {
      image.src = src;
    }
    image.removeAttribute("srcset");
  });

  clone.querySelectorAll("a[href]").forEach((link) => {
    if (isAPlayerElement(link)) {
      return;
    }
    const href = link.href || link.getAttribute("href") || "";
    if (isDecorativeFrameImageUrl(href)) {
      link.remove();
      return;
    }
    if ((!isProbablyPostImageUrl(href) && !isImageCarrierNode(link)) || link.querySelector("img")) {
      return;
    }
    const image = createContentImageFromUrl(href, cleanupPostText(link.textContent));
    link.textContent = "";
    link.append(image);
  });

  clone.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof Element) || ["IMG", "A", "SOURCE", "PICTURE"].includes(node.tagName)) {
      return;
    }
    if (isAPlayerElement(node)) {
      return;
    }
    if (node.querySelector("img")) {
      return;
    }
    const src = getOwnMediaUrl(node);
    const hasBackgroundImage = /url\(/i.test(node.getAttribute("style") || "");
    if (!src || isDecorativeFrameImageUrl(src) || (!isProbablyPostImageUrl(src) && !isImageCarrierNode(node) && !hasBackgroundImage)) {
      return;
    }
    const image = createContentImageFromUrl(src, cleanupPostText(node.textContent));
    if (cleanupPostText(node.textContent)) {
      node.append(image);
      return;
    }
    node.replaceChildren(image);
  });
}

function classifyPostImages(clone) {
  clone.querySelectorAll("img").forEach((image) => {
    if (isAPlayerElement(image)) {
      image.remove();
      return;
    }
    const src = getMediaUrl(image);
    if (isDecorativeFrameImageUrl(src)) {
      image.remove();
      return;
    }
    if (isDownloadFileUrl(src)) {
      removeDownloadImageFrame(image);
      return;
    }
    if (src) {
      image.src = src;
    }
    markRebuiltEmojiImage(image, src);
  });
  markInlineEmojiContainers(clone);
}

function ensurePostMediaCoverage(clone, originalSources) {
  if (!originalSources.length) {
    return;
  }

  const present = new Set([...clone.querySelectorAll("img")]
    .map((image) => normalizeMediaKey(getMediaUrl(image) || image.src))
    .filter(Boolean));
  const missing = originalSources.filter((item) => !present.has(normalizeMediaKey(item.src)));
  const imageMissing = missing.filter((item) => !isDecorativeFrameImageUrl(item.src) && !isDownloadFileUrl(item.src) && isProbablyPostImageUrl(item.src));
  if (!imageMissing.length) {
    return;
  }

  const wrap = createElement("div", "cc98-rebuild-restored-media");
  imageMissing.forEach((item) => {
    const image = createContentImageFromUrl(item.src, item.alt);
    image.classList.add("cc98-rebuild-content-image");
    wrap.append(image);
  });
  clone.append(wrap);
}

function normalizeClonedPostNode(clone) {
  clone.querySelectorAll("[hidden], [aria-hidden='true']").forEach((node) => {
    node.removeAttribute("hidden");
    node.removeAttribute("aria-hidden");
  });

  clone.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof Element)) {
      return;
    }
    node.removeAttribute("style");
    node.removeAttribute("class");
    node.removeAttribute("width");
    node.removeAttribute("height");
    node.removeAttribute("loading");
    node.removeAttribute("decoding");
  });
  clone.removeAttribute?.("style");
  clone.removeAttribute?.("class");
}

function removePostChromeNodes(clone) {
  clone.querySelectorAll([
    "script",
    "style",
    "button",
    "input",
    "textarea",
    "select",
    '[role="button"]',
    '[class*="signature"]',
    '[class*="Signature"]',
    ".awardInfo",
    '[class*="awardInfo"]',
    '[class*="AwardInfo"]',
    '[class*="score"]',
    '[class*="Score"]',
    '[class*="rate"]',
    '[class*="Rate"]',
    '[class*="wealth"]',
    '[class*="Wealth"]',
    '[class*="follow"]',
    '[class*="Follow"]',
    '[class*="message"]',
    '[class*="Message"]',
    '[class*="operation"]',
    '[class*="Operation"]',
    '[class*="toolbar"]',
    '[class*="Toolbar"]'
  ].join(",")).forEach((node) => node.remove());
}

function normalizePostContentClone(clone) {
  clone.querySelectorAll("[hidden], [aria-hidden='true']").forEach((node) => {
    node.removeAttribute("hidden");
    node.removeAttribute("aria-hidden");
  });

  clone.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof Element)) {
      return;
    }
    [...node.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name)) {
        node.removeAttribute(attribute.name);
      }
    });
    node.removeAttribute("loading");
    node.removeAttribute("decoding");
    if (node.getAttribute("style") === "") {
      node.removeAttribute("style");
    }
  });

  clone.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || link.href || "";
    link.href = makeAbsoluteCc98Url(href);
    const normalizedHref = link.href || "";
    const linkText = cleanupPostText(link.textContent);
    const isDownloadFile = link.classList.contains("download-file")
      || /\/v4-upload\/d\//i.test(normalizedHref)
      || /点击下载文件|下载文件|download/i.test(linkText);
    if (isDownloadFile && !isAudioUrl(normalizedHref)) {
      link.classList.add("cc98-rebuild-download-button");
      link.setAttribute("download", "");
      link.setAttribute("rel", "noreferrer");
      if (!linkText || /点击下载文件|下载文件/i.test(linkText)) {
        link.textContent = "下载文件";
      }
    }
    if (!link.href.startsWith(location.origin)) {
      link.target = "_blank";
      link.rel = "noreferrer";
    }
  });
  rewriteOriginalPostQuoteLinks(clone);
}

function isLegacyQuoteStyle(style, text = "") {
  const compactStyle = String(style || "").toLowerCase().replace(/\s+/g, "");
  const hasLightQuoteBackground = /background(?:-color)?:rgb\(245,250,255\)/.test(compactStyle)
    || /background(?:-color)?:rgba\(245,250,255,1\)/.test(compactStyle)
    || /background(?:-color)?:#f5faff/.test(compactStyle);
  const hasLegacyBorder = /border:1pxsolid(?:rgb\(204,204,204\)|#ccc|#cccccc)/.test(compactStyle);
  const hasLegacyScrollBox = /max-height:800px/.test(compactStyle) && /overflow-y:auto/.test(compactStyle);
  const hasQuoteText = /(?:\u4ee5\u4e0b\u662f\u5f15\u7528|\u67e5\u770b\u539f\u5e16)/.test(String(text || ""));
  return hasLightQuoteBackground || (hasLegacyBorder && hasLegacyScrollBox) || (hasQuoteText && hasLegacyScrollBox);
}

function forceLegacyQuoteStyle(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }
  node.classList.add("cc98-rebuild-legacy-quote");
  node.style.setProperty("box-sizing", "border-box", "important");
  node.style.setProperty("width", "100%", "important");
  node.style.setProperty("margin", "0.85em 0", "important");
  node.style.setProperty("padding", "10px 17px", "important");
  node.style.setProperty("max-height", "800px", "important");
  node.style.setProperty("overflow-y", "auto", "important");
  node.style.setProperty("border-width", "1px", "important");
  node.style.setProperty("border-style", "solid", "important");
  node.style.setProperty("border-color", "var(--cc98-comfort-border, rgba(148, 163, 184, 0.35))", "important");
  node.style.setProperty("border-left-width", "3px", "important");
  node.style.setProperty("border-left-style", "solid", "important");
  node.style.setProperty("border-left-color", "var(--cc98-comfort-accent, rgb(126, 188, 224))", "important");
  node.style.setProperty("border-radius", "8px", "important");
  node.style.setProperty("background", "var(--cc98-rebuild-legacy-quote-bg, var(--cc98-comfort-surface-2, rgb(245, 250, 255)))", "important");
  node.style.setProperty("background-color", "var(--cc98-rebuild-legacy-quote-bg, var(--cc98-comfort-surface-2, rgb(245, 250, 255)))", "important");
  node.style.setProperty("background-image", "none", "important");
  node.style.setProperty("color", "var(--cc98-comfort-text, rgb(229, 236, 242))", "important");
}

function isForcedLegacyQuoteNode(node) {
  if (!(node instanceof HTMLElement) || !node.classList.contains("cc98-rebuild-legacy-quote")) {
    return false;
  }
  const compactStyle = (node.getAttribute("style") || "").toLowerCase().replace(/\s+/g, "");
  return /background(?:-color)?:var\(--cc98-rebuild-legacy-quote-bg/.test(compactStyle)
    || /background(?:-color)?:rgb\(0,0,0\)/.test(compactStyle);
}

function forceLegacyQuotesInRebuiltRoot(root = document) {
  const candidates = new Set();
  const addCandidates = (scope) => {
    if (!(scope instanceof Element)) {
      return;
    }
    if (scope.matches(".cc98-rebuild-post-body") || Boolean(scope.closest(".cc98-rebuild-post-body"))) {
      if (scope.matches("[style], .cc98-rebuild-legacy-quote")) {
        candidates.add(scope);
      }
      scope.querySelectorAll?.("[style], .cc98-rebuild-legacy-quote").forEach((node) => {
        candidates.add(node);
      });
      return;
    }
    if (scope.matches(".cc98-rebuild-post-body [style], .cc98-rebuild-post-body .cc98-rebuild-legacy-quote")) {
      candidates.add(scope);
    }
    scope.querySelectorAll?.(".cc98-rebuild-post-body [style], .cc98-rebuild-post-body .cc98-rebuild-legacy-quote").forEach((node) => {
      candidates.add(node);
    });
  };
  if (root instanceof Document) {
    document.querySelectorAll("#cc98-comfort-app").forEach(addCandidates);
  } else {
    addCandidates(root);
  }

  let changed = 0;
  candidates.forEach((node) => {
    if (!(node instanceof HTMLElement) || isForcedLegacyQuoteNode(node)) {
      return;
    }
    const style = node.getAttribute("style") || "";
    const text = cleanupPostText(node.textContent);
    const compactStyle = style.toLowerCase().replace(/\s+/g, "");
    const hasQuoteRgb = compactStyle.includes("245,250,255");
    if (!hasQuoteRgb && !isLegacyQuoteStyle(style, text) && !node.classList.contains("cc98-rebuild-legacy-quote")) {
      return;
    }
    forceLegacyQuoteStyle(node);
    changed += 1;
  });
  return changed;
}

function installLegacyQuoteGuard(app) {
  legacyQuoteGuardObserver?.disconnect();
  legacyQuoteGuardObserver = null;
  if (!(app instanceof HTMLElement)) {
    return;
  }

  const scan = () => {
    if (document.contains(app)) {
      forceLegacyQuotesInRebuiltRoot(app);
    }
  };
  scan();
  [60, 250, 900, 2000].forEach((delay) => {
    setTimeout(scan, delay);
  });
}

function rewriteLegacyQuoteInlineStyles(root) {
  const styledNodes = [
    ...(root instanceof HTMLElement && root.hasAttribute("style") ? [root] : []),
    ...(root.querySelectorAll?.("[style]") ?? [])
  ];
  styledNodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const style = node.getAttribute("style") || "";
    const text = cleanupPostText(node.textContent);
    const isTarget = style.includes("background-color: rgb(245, 250, 255)")
      || /background-color\s*:\s*rgb\(\s*245\s*,\s*250\s*,\s*255\s*\)/i.test(style)
      || (/border\s*:\s*1px\s+solid\s+rgb\(\s*204\s*,\s*204\s*,\s*204\s*\)/i.test(style)
        && /max-height\s*:\s*800px/i.test(style)
        && /overflow-y\s*:\s*auto/i.test(style))
      || (/以下是引用|查看原帖/.test(text) && /border\s*:|max-height\s*:\s*800px/i.test(style));
    if (!isTarget && !isLegacyQuoteStyle(style, text)) {
      return;
    }
    forceLegacyQuoteStyle(node);
  });
}

function stabilizePostQuoteBlocks(root) {
  root.querySelectorAll?.("div").forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const style = node.getAttribute("style") || "";
    rewriteLegacyQuoteInlineStyles(node);
    const text = cleanupPostText(node.textContent);
    const nextStyle = node.getAttribute("style") || "";
    if (isLegacyQuoteStyle(style, text) || isLegacyQuoteStyle(nextStyle, text)) {
      forceLegacyQuoteStyle(node);
      return;
    }
    const hasLegacyQuoteBackground = /background(?:-color)?\s*:\s*(?:rgb\(\s*245\s*,\s*250\s*,\s*255\s*\)|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|#252c32)/i.test(nextStyle);
    const hasLegacyQuoteShape = /border\s*:/i.test(nextStyle) && /max-height\s*:\s*800px/i.test(nextStyle);
    const isLegacyQuote = hasLegacyQuoteBackground || (hasLegacyQuoteShape && /以下是引用|引用\d+楼|查看原帖/.test(text));
    if (!isLegacyQuote) {
      return;
    }
    forceLegacyQuoteStyle(node);
  });
}

function isMeaningfulPostContent(root) {
  return Boolean(root?.querySelector?.("img, video, source, iframe, a[href], blockquote, pre, code"))
    || cleanupPostText(root?.textContent).length > 0;
}

function sanitizeClonedPostContent(contentNode) {
  const clone = contentNode.cloneNode(true);
  removeDecorativeFrameImages(clone);
  removePostChromeNodes(clone);
  rewriteLegacyQuoteInlineStyles(clone);
  materializeAudioPlayers(clone);
  materializePostMedia(clone);
  normalizePostContentClone(clone);
  rewriteLegacyQuoteInlineStyles(clone);
  classifyPostImages(clone);
  stabilizePostQuoteBlocks(clone);
  stabilizeEmojiRendering(clone);
  return isMeaningfulPostContent(clone) ? clone : null;
}

function getMarkdownPreviewContentNode(root) {
  if (!(root instanceof Element)) {
    return null;
  }
  if (root.matches(".mde-preview-content, .markdown-body, .markdown-preview")) {
    return root;
  }
  return root.querySelector(".markdown-container .mde-preview-content, .mde-preview .mde-preview-content, .mde-preview-content, .markdown-body, .markdown-preview");
}

function sanitizePostContent(contentNode) {
  removeDecorativeFrameImages(contentNode);
  const originalMediaSources = collectPostMediaSources(contentNode);
  const markdownPreview = getMarkdownPreviewContentNode(contentNode);

  if (markdownPreview) {
    const markdownClone = sanitizeClonedPostContent(markdownPreview);
    if (markdownClone) {
      ensurePostMediaCoverage(markdownClone, originalMediaSources);
      stabilizeEmojiRendering(markdownClone);
      return markdownClone;
    }
  }

  const clone = sanitizeClonedPostContent(contentNode);
  if (clone) {
    ensurePostMediaCoverage(clone, originalMediaSources);
    stabilizeEmojiRendering(clone);
    return clone;
  }

  const readable = buildReadablePostContent(contentNode);
  ensurePostMediaCoverage(readable, originalMediaSources);
  stabilizeEmojiRendering(readable);
  return readable;
}

function getTopicPageInfo() {
  const match = location.pathname.match(/\/topic\/(\d+)(?:\/(\d+))?/i);
  if (!match) {
    return null;
  }

  const topicId = match[1];
  const current = Math.max(1, Number(match[2] || 1));
  const pages = new Map([[1, buildTopicPageHref(topicId, 1)]]);
  document.querySelectorAll(`a[href*="/topic/${topicId}"]`).forEach((link) => {
    const href = link.href || link.getAttribute("href") || "";
    const pageMatch = href.match(new RegExp(`/topic/${topicId}(?:/(\\d+))?`, "i"));
    if (!pageMatch) {
      return;
    }
    const page = Math.max(1, Number(pageMatch[1] || 1));
    pages.set(page, stripUrlHash(href));
  });

  const maxKnown = Math.max(current, ...pages.keys());
  const canGoNext = pages.has(current + 1) || maxKnown > current;
  [current - 1, current].forEach((page) => {
    if (page >= 1 && !pages.has(page)) {
      pages.set(page, buildTopicPageHref(topicId, page));
    }
  });
  if (canGoNext && !pages.has(current + 1)) {
    pages.set(current + 1, buildTopicPageHref(topicId, current + 1));
  }

  return { topicId, current, maxKnown, canGoNext, pages };
}

function buildTopicPageHref(topicId, page) {
  const normalizedPage = Math.max(1, Number(page) || 1);
  const suffix = normalizedPage === 1 ? "" : `/${normalizedPage}`;
  return `${location.origin}/topic/${topicId}${suffix}`;
}

function getBoardPageHref(page) {
  const match = location.pathname.match(/\/board\/(\d+)(?:\/(\d+))?/i);
  if (!match) {
    return "";
  }
  const normalizedPage = Math.max(1, Number(page) || 1);
  const suffix = normalizedPage === 1 ? "" : `/${normalizedPage}`;
  return `${location.origin}/board/${match[1]}${suffix}`;
}

function findPostContentNode(post) {
  if (post.matches?.("article") && !post.closest(".signature")) {
    return post;
  }
  return post.querySelector(".reply-content .substance > article")
    || post.querySelector(".reply-content .substance .markdown-container .mde-preview-content")
    || post.querySelector(".reply-content .substance .mde-preview-content")
    || post.querySelector(".reply-content .substance .markdown-container")
    || post.querySelector(".substance > article")
    || post.querySelector(".substance .markdown-container .mde-preview-content")
    || post.querySelector(".substance .mde-preview-content")
    || post.querySelector(".substance .markdown-container")
    || post.querySelector(".markdown-container .mde-preview-content, .mde-preview .mde-preview-content, .mde-preview-content")
    || [...post.querySelectorAll("article")].find((article) => !article.closest(".signature"))
    || null;
}

function getPostFloorNumber(post, index) {
  const readNumber = (value, patterns) => {
    for (const pattern of patterns) {
      const match = String(value ?? "").match(pattern);
      const number = Number(match?.[1]);
      if (Number.isFinite(number) && number > 0 && number < 100000) {
        return number;
      }
    }
    return null;
  };

  const floorText = cleanupPostText(post.querySelector(".reply-floor")?.textContent);
  const explicitFloor = readNumber(floorText, [/^#?\s*(\d{1,5})$/]);
  if (explicitFloor) {
    return explicitFloor;
  }

  const directValues = [
    post.getAttribute("data-floor"),
    post.getAttribute("data-index"),
    ...[...post.querySelectorAll("[data-floor], [data-index]")].flatMap((node) => [
      node.getAttribute("data-floor"),
      node.getAttribute("data-index")
    ])
  ];
  for (const value of directValues) {
    const number = readNumber(value, [/^#?\s*(\d{1,5})$/]);
    if (number) {
      return number;
    }
  }

  const markedValues = [
    post.id,
    post.getAttribute("data-id"),
    ...[...post.querySelectorAll("[id]")].map((node) => node.id)
  ];
  for (const value of markedValues) {
    const number = readNumber(value, [
      /(?:^|[_\-\s])(?:floor|post|reply|hot)[_\-\s#]*(\d{1,5})(?:$|[^\d])/i
    ]);
    if (number) {
      return number;
    }
  }

  for (const link of post.querySelectorAll("a[href*='#']")) {
    const number = readNumber(link.getAttribute("href"), [/#(\d{1,5})(?:$|[^\d])/]);
    if (number) {
      return number;
    }
  }

  for (const node of post.querySelectorAll("*")) {
    const text = cleanupPostText(node.textContent);
    const number = readNumber(text, [
      /^#\s*(\d{1,5})(?:\s|$)/,
      /(?:^|\s)(\d{1,5})\s*(?:楼|F)(?:\s|$)/i
    ]);
    if (number) {
      return number;
    }
  }

  const page = getTopicPageInfo()?.current ?? 1;
  const estimatedPostsPerPage = 10;
  return (Math.max(1, page) - 1) * estimatedPostsPerPage + index + 1;
}

function isHotPostNode(post) {
  const id = post?.id || post?.getAttribute?.("data-id") || "";
  return /^hot[_-]\d+/i.test(id)
    || Boolean(post?.querySelector?.('img[src*="/hot.png"], img[src$="hot.png"], img[src*="hot"]'));
}

function isLightDefaultAvatarUrl(src) {
  const raw = String(src ?? "");
  if (/\/static\/images\/default_avatar_(?:boy|girl)\.png/i.test(raw)) {
    return true;
  }
  if (/%E5%BF%83%E7%81%B5%E5%A4%B4%E5%83%8F\.gif/i.test(raw)
    || /\/static\/images\/心灵头像\.gif$/i.test(raw)) {
    return true;
  }
  let pathname = "";
  try {
    pathname = decodeURIComponent(new URL(raw, location.origin).pathname);
  } catch {
    try {
      pathname = decodeURIComponent(raw);
    } catch {
      pathname = raw;
    }
  }
  return /\/static\/images\/心灵头像\.gif$/i.test(pathname)
    || (/\/static\/images\/.*\.(?:gif|png|webp)$/i.test(pathname)
      && /(?:心灵头像|心灵|心|default|anonymous|avatar)/i.test(pathname));
}

function getPostAvatar(post, userHref = "") {
  const findImageSrc = (selector) => {
    for (const image of post.querySelectorAll(selector)) {
      const src = getNonDecorativeImageSrc(image);
      if (src) {
        return src;
      }
    }
    return "";
  };
  const avatar = findImageSrc(".userPortrait, img[class*='portrait'], img[class*='avatar']");
  if (avatar) {
    return avatar;
  }
  let userPath = "";
  try {
    userPath = userHref ? new URL(userHref, location.origin).pathname : "";
  } catch {
    userPath = "";
  }
  const linkedAvatar = userPath ? findImageSrc(`a[href*="${userPath}"] img`) : "";
  if (linkedAvatar) {
    return linkedAvatar;
  }
  return findImageSrc("img");
}

function getAnonymousPostCode(post) {
  if (!(post instanceof Element)) {
    return "";
  }
  const readCode = (text) => {
    const match = cleanupPostText(text).match(/\u533f\u540d\s*([0-9a-z]{4,12})/i);
    return match?.[1]?.toUpperCase() || "";
  };

  const scopedNodes = [
    ...post.querySelectorAll(".userMessage-left, .userMessage, [class*='anonymous'], [class*='Anonymous'], [style*='font-weight']")
  ].filter((node) => {
    return node instanceof HTMLElement
      && !node.closest(".reply-content, .substance, .signature, .cc98-rebuild-post-body");
  });

  for (const node of scopedNodes) {
    const code = readCode(node.textContent);
    if (code) {
      return code;
    }
  }
  return readCode(post.querySelector(".userMessage")?.textContent || "");
}

function getPostAuthorIdentity(item) {
  if (!item) {
    return "";
  }
  if (item.anonymousCode) {
    return `anonymous:${item.anonymousCode}`;
  }
  if (item.uid) {
    return `uid:${item.uid}`;
  }
  if (item.userHref) {
    try {
      return `href:${new URL(item.userHref, location.origin).pathname.toLowerCase()}`;
    } catch {
      return `href:${String(item.userHref).toLowerCase()}`;
    }
  }
  return item.user ? `name:${normalizeText(item.user)}` : "";
}

function getOriginalPosterIdentityCacheKey(topicId) {
  return topicId ? `cc98RebornOriginalPosterIdentity:v2:${topicId}` : "";
}

function getCachedOriginalPosterIdentity(topicId) {
  const key = getOriginalPosterIdentityCacheKey(topicId);
  if (!key) {
    return "";
  }
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function setCachedOriginalPosterIdentity(topicId, identity) {
  const key = getOriginalPosterIdentityCacheKey(topicId);
  if (!key || !identity) {
    return;
  }
  try {
    localStorage.setItem(key, identity);
  } catch {
    // OP badge cache is best-effort.
  }
}

function getPostIdentityFromNode(post) {
  const user = getFirstLink(post, 'a[href*="/user/id/"], a[href*="/user/name/"]');
  const uidMatch = user?.href?.match(/\/user\/id\/(\d+)/);
  const userHref = makeAbsoluteCc98Url(user?.href || (uidMatch?.[1] ? `/user/id/${uidMatch[1]}` : ""));
  const anonymousCode = getAnonymousPostCode(post);
  return getPostAuthorIdentity({
    anonymousCode,
    uid: uidMatch?.[1] ?? "",
    userHref: anonymousCode ? "" : userHref,
    user: anonymousCode ? "" : (user?.text || getFirstText(post, '[class*="userName"], [class*="UserName"], [class*="author"], [class*="Author"]'))
  });
}

function getOriginalPosterIdentityFromRoot(root) {
  if (!root?.querySelectorAll) {
    return "";
  }
  const replies = [...root.querySelectorAll(".reply")]
    .filter((node) => !node.closest("#cc98-comfort-app"))
    .filter((node) => node instanceof HTMLElement && !isHotPostNode(node));
  if (!replies.length) {
    return "";
  }
  const firstFloor = replies.find((post, index) => Number(getPostFloorNumber(post, index)) === 1);
  return getPostIdentityFromNode(firstFloor || replies[0]);
}

function readOriginalPosterIdentityFromStaticHtml(html) {
  if (!html) {
    return "";
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return getOriginalPosterIdentityFromRoot(doc);
}

function fetchOriginalPosterIdentityFromHtml(topicInfo) {
  return fetch(buildTopicPageHref(topicInfo.topicId, 1), {
    credentials: "include",
    cache: "no-store"
  })
    .then((response) => response.ok ? response.text() : "")
    .then(readOriginalPosterIdentityFromStaticHtml)
    .catch(() => "");
}

function fetchOriginalPosterIdentityFromRenderedPage(topicInfo) {
  return new Promise((resolve) => {
    const host = document.body || document.documentElement;
    if (!host) {
      resolve("");
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("data-cc98-reborn-op-prefetch", "true");
    iframe.title = "CC98 original poster prefetch";
    Object.assign(iframe.style, {
      position: "fixed",
      left: "-10000px",
      top: "-10000px",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
      visibility: "hidden",
      border: "0"
    });

    let settled = false;
    let pollTimer = 0;
    let timeoutTimer = 0;

    const finish = (identity = "") => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(timeoutTimer);
      iframe.remove();
      resolve(identity);
    };

    const readRenderedIdentity = () => {
      let doc = null;
      try {
        doc = iframe.contentDocument || iframe.contentWindow?.document || null;
      } catch {
        return "";
      }
      return getOriginalPosterIdentityFromRoot(doc);
    };

    const tryRead = () => {
      const identity = readRenderedIdentity();
      if (identity) {
        finish(identity);
      }
    };

    iframe.addEventListener("load", () => {
      tryRead();
      pollTimer = window.setInterval(tryRead, 180);
    }, { once: true });

    timeoutTimer = window.setTimeout(() => finish(""), 6500);
    iframe.src = `${buildTopicPageHref(topicInfo.topicId, 1)}#cc98-reborn-op-probe`;
    host.appendChild(iframe);
  });
}

async function fetchOriginalPosterIdentityFromFirstPage(topicInfo) {
  const staticIdentity = await fetchOriginalPosterIdentityFromHtml(topicInfo);
  if (staticIdentity) {
    return staticIdentity;
  }
  return fetchOriginalPosterIdentityFromRenderedPage(topicInfo);
}

function scheduleOriginalPosterIdentityPrefetch(topicInfo) {
  if (!topicInfo?.topicId || getCachedOriginalPosterIdentity(topicInfo.topicId)) {
    return;
  }
  if (originalPosterIdentityPrefetches.has(topicInfo.topicId)) {
    return;
  }
  const promise = fetchOriginalPosterIdentityFromFirstPage(topicInfo)
    .then((identity) => {
      if (!identity) {
        return;
      }
      setCachedOriginalPosterIdentity(topicInfo.topicId, identity);
      scheduleRebuild();
      setTimeout(scheduleSync, 180);
    })
    .catch(() => {
      // If the first page cannot be fetched, simply avoid showing a false OP badge.
    })
    .finally(() => {
      originalPosterIdentityPrefetches.delete(topicInfo.topicId);
    });
  originalPosterIdentityPrefetches.set(topicInfo.topicId, promise);
}

function markOriginalPosterItems(items) {
  const topicInfo = getTopicPageInfo();
  let originalIdentity = "";
  const firstFloor = items.find((item) => !item.isHot && Number(item.index) === 1);
  if (firstFloor) {
    originalIdentity = getPostAuthorIdentity(firstFloor);
    setCachedOriginalPosterIdentity(topicInfo?.topicId, originalIdentity);
  } else {
    originalIdentity = getCachedOriginalPosterIdentity(topicInfo?.topicId);
    if (!originalIdentity && topicInfo?.current === 1) {
      const firstVisiblePost = items.find((item) => !item.isHot) || items[0];
      originalIdentity = getPostAuthorIdentity(firstVisiblePost);
      setCachedOriginalPosterIdentity(topicInfo.topicId, originalIdentity);
    }
    if (!originalIdentity) {
      scheduleOriginalPosterIdentityPrefetch(topicInfo);
    }
  }
  if (!originalIdentity) {
    return items;
  }
  items.forEach((item) => {
    item.isOriginalPoster = getPostAuthorIdentity(item) === originalIdentity;
  });
  return items;
}

function getActionText(control) {
  const title = control.querySelector?.("[title]")?.getAttribute("title") || control.getAttribute?.("title") || "";
  const text = cleanupPostText(control.textContent);
  if (/赞/.test(title) || control.classList?.contains("upup")) {
    const count = cleanupPostText(control.querySelector?.(".commentProp")?.textContent);
    return count ? `赞 ${count}` : "赞";
  }
  if (/踩/.test(title) || control.classList?.contains("downdown")) {
    const count = cleanupPostText(control.querySelector?.(".commentProp")?.textContent);
    return count ? `踩 ${count}` : "踩";
  }
  return text;
}

function collectPostActions(post) {
  const controls = [
    ...post.querySelectorAll(".upup, .downdown, .operation1, button, a")
  ].filter((control) => {
    if (!(control instanceof HTMLElement) || control.closest(".signature")) {
      return false;
    }
    if (control.tagName === "BUTTON" && control.closest("a")) {
      return false;
    }
    if (control.classList.contains("operation1") && control.querySelector("a[href]")) {
      return false;
    }
    return true;
  });

  const seen = new Set();
  const actions = [];
  controls.forEach((control) => {
    const text = getActionText(control);
    const href = control instanceof HTMLAnchorElement ? makeAbsoluteCc98Url(control.href || control.getAttribute("href") || "") : "";
    const normalized = text.replace(/\s+\d+$/, "");
    if (!/^(赞|踩|关注|取关|取消关注|私信|评分|追踪)$/.test(normalized)) {
      return;
    }
    const stableKind = /^(关注|取关|取消关注)$/.test(normalized) ? "关注" : normalized;
    const key = stableKind === "私信" ? "私信" : `${stableKind}:${href || control.id || actions.length}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    actions.push({ text, href, control, scope: "post" });
  });
  const voteGroup = {};
  actions.forEach((action) => {
    const kind = getPostActionKind(action.control, action.text);
    action.kind = kind;
    if ((kind === "like" || kind === "dislike") && !voteGroup[kind]) {
      voteGroup[kind] = action;
    }
  });
  if (voteGroup.like || voteGroup.dislike) {
    actions.forEach((action) => {
      if (action.kind === "like" || action.kind === "dislike") {
        action.voteGroup = voteGroup;
      }
    });
  }
  return actions.slice(0, 8);
}

function hasRenderablePostContent(contentNode) {
  if (!contentNode) {
    return false;
  }
  const text = cleanupPostText(contentNode.innerText || contentNode.textContent);
  return text.length > 0 || Boolean(contentNode.querySelector("img, a[href], [style*='url('], [data-src], [data-original], [data-url], [data-img], [data-image]"));
}

function getPostSignatureContent(post) {
  const signatureArticle = post.querySelector(".signature > article, .signature article");
  if (!signatureArticle) {
    return null;
  }
  const signature = normalizeRichContentNode(signatureArticle, { keepSignatureChildren: true });
  parseInlineUbbTextNodes(signature);
  strengthenInlineTextStyles(signature);
  markInlineEmojiContainers(signature);
  stabilizeEmojiRendering(signature);
  signature.classList.add("cc98-rebuild-signature-content");
  return signature;
}

function getPostAwardRows(post) {
  const awardInfo = post.querySelector(".awardInfo, [class*='awardInfo'], [class*='AwardInfo']");
  if (!(awardInfo instanceof Element)) {
    return [];
  }
  const rows = [...awardInfo.querySelectorAll(".tagSize")];
  const rowNodes = rows.length
    ? rows
    : [...awardInfo.children].filter((node) => node.matches?.(".good, .bad"));
  return rowNodes.map((row) => {
    const user = cleanupPostText(row.querySelector?.(".userName")?.textContent);
    const operation = cleanupPostText(row.querySelector?.(".grades")?.textContent);
    const reason = cleanupPostText(row.querySelector?.(".credit")?.textContent);
    return { user, operation, reason };
  }).filter((row) => row.user || row.operation || row.reason);
}

function renderPostAwardTable(rows) {
  if (!rows?.length) {
    return null;
  }
  const section = createElement("section", "cc98-rebuild-awards");
  section.append(createElement("div", "cc98-rebuild-awards-title", "\u8bc4\u5206\u8bb0\u5f55"));
  const table = document.createElement("table");
  table.className = "cc98-rebuild-awards-table";
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  ["\u7528\u6237", "\u64cd\u4f5c", "\u7406\u7531"].forEach((label) => {
    header.append(createElement("th", "", label));
  });
  thead.append(header);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const operationClass = /-\s*\d/.test(row.operation) ? "cc98-rebuild-award-negative" : (/\+\s*\d/.test(row.operation) ? "cc98-rebuild-award-positive" : "");
    tr.append(createElement("td", "", row.user || "-"));
    tr.append(createElement("td", operationClass, row.operation || "-"));
    tr.append(createElement("td", "", row.reason || "-"));
    tbody.append(tr);
  });
  table.append(thead, tbody);
  section.append(table);
  return section;
}

function getAwardReputationDelta(rows) {
  return (rows || []).reduce((total, row) => {
    const operation = cleanupPostText(row.operation);
    if (!operation.includes("\u98ce\u8bc4\u503c")) {
      return total;
    }
    const match = operation.match(/([+-]?\d+)/);
    return total + (Number(match?.[1]) || 0);
  }, 0);
}

function formatAwardDelta(delta) {
  const number = Number(delta) || 0;
  return number > 0 ? `+${number}` : String(number);
}

function applyAwardDeltaToActions(actions, rows) {
  if (!Array.isArray(actions) || !rows?.length) {
    return actions;
  }
  const delta = getAwardReputationDelta(rows);
  actions.forEach((action) => {
    const label = cleanupPostText(action.text).replace(/\s+[+-]?\d+\s*$/, "");
    if (label === "\u8bc4\u5206" || label.includes("\u8bc4\u5206")) {
      action.displayText = `\u8bc4\u5206 ${formatAwardDelta(delta)}`;
    }
  });
  return actions;
}

function getPostItems() {
  const directReplies = [...document.querySelectorAll(".reply")]
    .filter((node) => !node.closest("#cc98-comfort-app"))
    .filter((node) => hasRenderablePostContent(findPostContentNode(node)));

  const selectors = [
    '[class*="floor"]',
    '[class*="Floor"]',
    '[class*="post"]',
    '[class*="Post"]',
    '[class*="reply"]',
    '[class*="Reply"]'
  ].join(",");
  const candidates = directReplies.length > 0
    ? directReplies
    : [...document.querySelectorAll(selectors)]
      .filter((node) => !node.closest("#cc98-comfort-app"))
      .filter((node) => hasRenderablePostContent(findPostContentNode(node)));

  const compact = [];
  candidates.forEach((candidate) => {
    if (compact.some((existing) => existing.contains(candidate))) {
      return;
    }
    for (let index = compact.length - 1; index >= 0; index -= 1) {
      if (candidate.contains(compact[index])) {
        compact.splice(index, 1);
      }
    }
    compact.push(candidate);
  });

  const items = compact.map((post, index) => {
    const contentNode = findPostContentNode(post);
    if (!contentNode) {
      return null;
    }
    const user = getFirstLink(post, 'a[href*="/user/id/"], a[href*="/user/name/"]');
    const uidMatch = user?.href?.match(/\/user\/id\/(\d+)/);
    const userHref = makeAbsoluteCc98Url(user?.href || (uidMatch?.[1] ? `/user/id/${uidMatch[1]}` : ""));
    const anonymousCode = getAnonymousPostCode(post);
    const avatar = getPostAvatar(post, userHref);
    const content = sanitizePostContent(contentNode);
    const signature = getPostSignatureContent(post);
    const awards = getPostAwardRows(post);
    const text = cleanupPostText(content.innerText);
    const publishedAt = cleanupPostText(post.innerText).match(/发表于\s+([0-9:-]+\s+[0-9:]+)/)?.[1] ?? "";
    const actions = collectPostActions(post);
    applyAwardDeltaToActions(actions, awards);
    const isHot = isHotPostNode(post);
    const floorNumber = getPostFloorNumber(post, index);
    const id = post.id || post.getAttribute("data-id") || `floor-${floorNumber}-${text.slice(0, 24)}`;
    applyPrewarmedPostSnapshot(content, findPrewarmedPostSnapshot(id, floorNumber));
    return {
      type: "post",
      id,
      index: floorNumber,
      user: anonymousCode ? "CC98 \u7528\u6237" : (user?.text || getFirstText(post, '[class*="userName"], [class*="UserName"], [class*="author"], [class*="Author"]') || "CC98 \u7528\u6237"),
      userHref: anonymousCode ? "" : userHref,
      uid: uidMatch?.[1] ?? "",
      anonymousCode,
      avatar,
      text,
      content,
      signature,
      awards,
      publishedAt,
      actions,
      isHot
    };
  }).filter((item) => item && (item.text.length > 0 || item.content?.querySelector("img")));
  markOriginalPosterItems(items);
  const favoriteAction = getTopicToolbarActions().favorite;
  const favoriteTarget = favoriteAction ? (items.find((item) => !item.isHot) || items[0]) : null;
  if (favoriteTarget) {
    favoriteTarget.actions = insertTopicFavoriteAction(favoriteTarget.actions, favoriteAction);
  }

  if (items.length > 0) {
    return items;
  }

  const article = document.querySelector("#root article");
  const text = cleanupPostText(article?.innerText);
  return text ? [{ type: "post", id: "article", index: 1, user: "CC98", uid: "", avatar: "", text, content: sanitizePostContent(article), signature: null, awards: [], publishedAt: "", actions: [] }] : [];
}

function getTopicToolbarActions() {
  const controls = [...document.querySelectorAll(".topicInfo-info .followTopic, .topicInfo-title .followTopic, .topicInfo-info [class~='followTopic'], .topicInfo-title [class~='followTopic']")]
    .filter((control) => control instanceof HTMLElement && !control.closest("#cc98-comfort-app"));
  const makeAction = (control, fallbackText) => {
    if (!(control instanceof HTMLElement)) {
      return null;
    }
    return {
      text: cleanupPostText(control.textContent) || fallbackText,
      href: "",
      control,
      scope: "topic"
    };
  };
  const favoriteControl = controls.find((control) => /^(?:收藏|取消收藏|已收藏)$/.test(cleanupPostText(control.textContent)));
  const shareControl = controls.find((control) => cleanupPostText(control.textContent).includes("分享帖子链接"));
  return {
    favorite: makeAction(favoriteControl, "收藏"),
    share: makeAction(shareControl, "分享帖子链接")
  };
}

function insertTopicFavoriteAction(actions, favoriteAction) {
  if (!favoriteAction || !Array.isArray(actions)) {
    return actions || [];
  }
  if (actions.some((action) => /^(?:收藏|取消收藏|已收藏)$/.test(cleanupPostText(action.text).replace(/\s+\d+$/, "")))) {
    return actions;
  }
  const insertAfter = actions.reduce((last, action, index) => {
    const label = cleanupPostText(action.text).replace(/\s+\d+$/, "");
    return /^(?:关注|取关|取消关注|私信)$/.test(label) ? index : last;
  }, -1);
  const nextActions = [...actions];
  nextActions.splice(insertAfter + 1, 0, favoriteAction);
  return nextActions;
}

function getTopicToolbarActions() {
  const controls = [...document.querySelectorAll(".topicInfo-info .followTopic, .topicInfo-title .followTopic, .topicInfo-info [class~='followTopic'], .topicInfo-title [class~='followTopic']")]
    .filter((control) => control instanceof HTMLElement && !control.closest("#cc98-comfort-app"));
  const makeAction = (control, fallbackText) => {
    if (!(control instanceof HTMLElement)) {
      return null;
    }
    return {
      text: cleanupPostText(control.textContent) || fallbackText,
      href: "",
      control,
      scope: "topic"
    };
  };
  const favoriteControl = controls.find((control) => /^(?:收藏|取消收藏|已收藏)$/.test(cleanupPostText(control.textContent)));
  const shareControl = controls.find((control) => cleanupPostText(control.textContent).includes("分享帖子链接"));
  return {
    favorite: makeAction(favoriteControl, "收藏"),
    share: makeAction(shareControl, "分享帖子链接")
  };
}

function insertTopicFavoriteAction(actions, favoriteAction) {
  if (!favoriteAction || !Array.isArray(actions)) {
    return actions || [];
  }
  if (actions.some((action) => /^(?:收藏|取消收藏|已收藏)$/.test(cleanupPostText(action.text).replace(/\s+\d+$/, "")))) {
    return actions;
  }
  const insertAfter = actions.reduce((last, action, index) => {
    const label = cleanupPostText(action.text).replace(/\s+\d+$/, "");
    return /^(?:关注|取关|取消关注|私信)$/.test(label) ? index : last;
  }, -1);
  const nextActions = [...actions];
  nextActions.splice(insertAfter + 1, 0, favoriteAction);
  return nextActions;
}

function isHomeAnnouncementDetailText(text) {
  return /详情请戳|詳情請戳|详情|詳情/i.test(cleanupPostText(text).replace(/\s+/g, ""));
}

function collectAnnouncementDomLines(root) {
  const lines = [{ text: "", links: [] }];
  const current = () => lines[lines.length - 1];
  const pushText = (text) => {
    String(text ?? "").split(/\n/).forEach((part, index) => {
      if (index > 0) {
        lines.push({ text: "", links: [] });
      }
      current().text += part;
    });
  };
  const pushLink = (link) => {
    const href = normalizeHref(link.getAttribute("href") || link.href || "");
    const text = cleanupPostText(link.textContent || "");
    pushText(link.textContent || "");
    if (href && href !== "#") {
      current().links.push({ href, text });
    }
  };
  const finishLine = () => {
    if (cleanupPostText(current().text) || current().links.length) {
      lines.push({ text: "", links: [] });
    }
  };
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.nodeValue || "");
      return;
    }
    if (!(node instanceof HTMLElement)) {
      return;
    }
    if (node.tagName === "BR") {
      finishLine();
      return;
    }
    if (node.tagName === "A") {
      pushLink(node);
      return;
    }
    const isBlock = /^(P|DIV|LI|SECTION|ARTICLE)$/i.test(node.tagName);
    if (isBlock && cleanupPostText(current().text)) {
      finishLine();
    }
    node.childNodes.forEach(walk);
    if (isBlock) {
      finishLine();
    }
  };
  root.childNodes.forEach(walk);
  return lines
    .map((line) => ({
      text: cleanupPostText(line.text),
      links: line.links.filter((link) => link.href)
    }))
    .filter((line) => line.text || line.links.length);
}

function collectHomeAnnouncementItems(root) {
  const domLines = collectAnnouncementDomLines(root);
  if (!domLines.length) {
    return (root.innerText || "")
      .split("\n")
      .map((line) => cleanupPostText(line).replace(/详情请戳|詳情請戳/g, "").trim())
      .filter(Boolean)
      .map((title) => ({ title, href: "" }));
  }
  return domLines.map((line) => {
    const detailLink = line.links.find((link) => isHomeAnnouncementDetailText(link.text));
    const fallbackLink = line.links.find((link) => !isHomeAnnouncementDetailText(link.text));
    const title = line.text
      .replace(/详情请戳|詳情請戳/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return {
      title: title || cleanupPostText(fallbackLink?.text || detailLink?.text || ""),
      href: detailLink?.href || fallbackLink?.href || ""
    };
  }).filter((item) => item.title);
}

function getHomeSections() {
  const sections = [];
  const announcement = document.querySelector(".announcementContent article");
  if (announcement) {
    const lines = collectHomeAnnouncementItems(announcement).slice(0, 8);
    sections.push({
      title: "全站公告",
      kind: "notice",
      items: lines
    });
  }

  document.querySelectorAll(".mainPageList").forEach((section) => {
    const title = getFirstText(section, ".mainPageTitleText") || "主题";
    const items = [...section.querySelectorAll(".mainPageListRow")].map((row) => {
      const titleLink = getFirstLink(row, ".mainPageListTitle a");
      const boardLink = getFirstLink(row, '.mainPageListBoardName a[href*="/board/"]');
      const parsedMeta = parseTopicMetaText(row.textContent);
      return {
        type: "topic",
        title: titleLink?.text ?? row.textContent.trim(),
        href: titleLink?.href ?? "",
        board: boardLink?.text?.replace(/[【】[\]]/g, "") ?? "",
        boardHref: boardLink?.href ?? "",
        user: parsedMeta.hasDetails ? parsedMeta.author : "",
        meta: parsedMeta.hasDetails ? parsedMeta.meta : "",
        hoverMeta: parsedMeta.hasDetails ? parsedMeta.hoverMeta : "",
        replyCount: parsedMeta.hasDetails ? parsedMeta.replyCount : ""
      };
    }).filter((item) => item.title);
    if (items.length > 0) {
      sections.push({ title, kind: "topics", items });
    }
  });
  return sections;
}

function isHotHomeSection(section) {
  const title = normalizeText(section?.title || "");
  return title.includes(normalizeText("\u70ed\u95e8\u8bdd\u9898"))
    || title.includes(normalizeText("\u70ed\u95e8"));
}

function getHomeHotRankCacheKey(section) {
  return `${HOME_HOT_RANK_CACHE_KEY_PREFIX}${normalizeText(section?.title || "hot") || "hot"}`;
}

function getHomeHotRankItemKey(item) {
  if (item?.href) {
    try {
      const url = new URL(item.href, location.origin);
      return `${url.origin}${url.pathname}`.toLowerCase();
    } catch {
      return String(item.href).split(/[?#]/)[0].toLowerCase();
    }
  }
  return `title:${normalizeText(item?.title || "")}`;
}

function makeHomeHotRankEntries(items) {
  return (items || []).slice(0, 10).map((item, index) => ({
    key: getHomeHotRankItemKey(item),
    title: item.title || "",
    href: item.href || "",
    rank: index + 1
  })).filter((entry) => entry.key && entry.key !== "title:");
}

function readHomeHotRankCache(section) {
  try {
    const parsed = JSON.parse(localStorage.getItem(getHomeHotRankCacheKey(section)) || "{}");
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return entries.filter((entry) => entry?.key && Number(entry.rank) > 0);
  } catch {
    return [];
  }
}

function writeHomeHotRankCache(section, entries) {
  try {
    localStorage.setItem(getHomeHotRankCacheKey(section), JSON.stringify({
      savedAt: Date.now(),
      entries
    }));
  } catch {
    // Ranking movement is cosmetic; ignore storage failures.
  }
}

function getHomeHotRankSignature(entries) {
  return entries.map((entry) => `${entry.key}:${entry.rank}`).join("|");
}

function getHomeHotItemsWithRankMovement(section) {
  const entries = makeHomeHotRankEntries(section.items);
  const signature = getHomeHotRankSignature(entries);
  const cacheKey = getHomeHotRankCacheKey(section);
  const state = homeHotRankingStates.get(cacheKey);
  if (state?.signature === signature) {
    return (section.items || []).map((item) => {
      const movement = state.movements.get(getHomeHotRankItemKey(item));
      return {
        ...item,
        rankMovement: movement?.type || "",
        rankDelta: movement?.delta || 0,
        rankMovementAnimated: false
      };
    });
  }

  const previous = readHomeHotRankCache(section);
  const previousByKey = new Map(previous.map((entry) => [entry.key, entry]));
  const movements = new Map();
  if (previous.length > 0) {
    entries.forEach((entry) => {
      const oldRank = Number(previousByKey.get(entry.key)?.rank || 0);
      if (!oldRank) {
        movements.set(entry.key, { type: "new", delta: 0 });
        return;
      }
      if (oldRank > entry.rank) {
        movements.set(entry.key, { type: "up", delta: oldRank - entry.rank });
      } else if (oldRank < entry.rank) {
        movements.set(entry.key, { type: "down", delta: entry.rank - oldRank });
      }
    });
  }
  writeHomeHotRankCache(section, entries);
  homeHotRankingStates.set(cacheKey, { signature, movements, consumed: true });
  return (section.items || []).map((item) => {
    const movement = movements.get(getHomeHotRankItemKey(item));
    return {
      ...item,
      rankMovement: movement?.type || "",
      rankDelta: movement?.delta || 0,
      rankMovementAnimated: Boolean(movement)
    };
  });
}

function getBoardSections() {
  return [...document.querySelectorAll(".anArea")].map((area) => {
    const title = area.id || getFirstText(area, ".areaName") || "版面";
    const boards = [...area.querySelectorAll(".boardContent, .noImgBoardContent")].map((board) => {
      const link = getFirstLink(board, 'a[href*="/board/"]');
      const image = board.querySelector("img")?.src ?? "";
      const info = getFirstText(board, ".boardInfo").replace(/\s+/g, " ");
      return {
        title: getFirstText(board, ".boardName2") || link?.text || "版面",
        href: link?.href ?? "",
        image,
        meta: info
      };
    }).filter((board) => board.title);
    return { title, boards };
  }).filter((section) => section.boards.length > 0);
}

function getBoardPageStats(head) {
  return [...head.querySelectorAll(".board-head-information")].map((valueNode) => {
    const row = valueNode.closest(".row") ?? valueNode.parentElement;
    const labelNode = row?.querySelector(".ant-tag-has-color, span:first-child");
    return {
      label: labelNode?.textContent?.trim() ?? "",
      value: valueNode.textContent?.trim() ?? ""
    };
  }).filter((item) => item.label || item.value);
}

function getBoardPageData() {
  const root = document.querySelector(".board-body");
  const head = root?.querySelector(".board-head-body") ?? document;
  const name = getFirstText(head, ".board-head-name") || document.title.replace(" - CC98论坛", "") || "版面";
  const avatar = head.querySelector(".board-avatar")?.src ?? "";
  const intro = [...head.querySelectorAll("div")]
    .map((node) => node.childNodes.length <= 1 ? node.textContent?.replace(/\s+/g, " ").trim() ?? "" : "")
    .find((text) => text.startsWith("版面简介"))
    ?.replace(/^版面简介[:：]\s*/, "") ?? "";
  const moderators = [...head.querySelectorAll('a[href*="/user/name/"], a[href*="/user/id/"]')]
    .map((link) => ({ text: link.textContent?.trim() ?? "", href: link.href }))
    .filter((item) => item.text);
  const noticeNode = head.querySelector(".ant-collapse-content article");
  const notice = noticeNode ? sanitizePostContent(noticeNode) : null;
  const followButton = [...head.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("关注"));
  const postTopicLink = getFirstLink(root ?? document, '.board-head-bar a[href*="/editor/postTopic/"]');
  const adAnchor = [...(root ?? document).querySelectorAll(".board-head-bar a[href]")]
    .find((link) => link.querySelector("img"));
  const adLink = adAnchor ? { href: adAnchor.href } : null;
  const adImage = root?.querySelector(".board-head-bar img")?.src ?? "";
  const filters = [...document.querySelectorAll(".board-postItem-head-option")]
    .map((control) => ({ text: control.textContent?.trim() ?? "", control }))
    .filter((item) => item.text);
  const footerActions = [...document.querySelectorAll(".board-body > .row button, .board-body button")]
    .filter((button) => !button.closest(".board-head-body") && !button.closest(".board-head-bar"))
    .map((control) => ({ text: control.textContent?.trim() ?? "", control }))
    .filter((item) => item.text);
  return {
    name,
    avatar,
    intro,
    moderators,
    stats: getBoardPageStats(head),
    notice,
    followAction: followButton ? { text: followButton.textContent?.trim() || "关注", control: followButton } : null,
    postTopic: postTopicLink,
    ad: adImage ? { image: adImage, href: adLink?.href || "" } : null,
    filters,
    footerActions
  };
}

function getBoardTopicItems() {
  return [...document.querySelectorAll(".board-postItem-body")]
    .filter((node) => !node.closest("#cc98-comfort-app"))
    .map((row) => {
      const titleLink = getFirstLink(row, '.board-postItem-title > a[href*="/topic/"]');
      if (!titleLink?.href) {
        return null;
      }
      const pageLinks = [...row.querySelectorAll('.board-postItem-title a[href*="/topic/"]')]
        .slice(1)
        .map((link) => ({ text: link.textContent?.trim() ?? "", href: link.href }))
        .filter((item) => item.text);
      const userLink = getFirstLink(row, '.board-postItem-userName[href*="/user/"], .board-postItem-userName a[href*="/user/"]');
      const userText = userLink?.text || getFirstText(row, ".board-postItem-userName");
      const tags = [...row.querySelectorAll(".board-postItem-tags .ant-tag")].map((tag) => tag.textContent?.trim() ?? "").filter(Boolean);
      const lastReplyLink = row.querySelector('.board-postItem-lastReply')?.closest("a");
      const lastReplySpans = [...row.querySelectorAll(".board-postItem-lastReply span")].map((span) => span.textContent?.trim() ?? "").filter(Boolean);
      const icon = row.querySelector(".board-postItem-icon img")?.src ?? "";
      const isPinned = /top-/i.test(icon) || titleLink.text.includes("公告");
      return {
        type: "topic",
        title: titleLink.text,
        href: titleLink.href,
        user: userText,
        userHref: userLink?.href ?? "",
        viewCount: tags[0] ?? "",
        replyCount: tags[1] ?? "",
        lastReplyUser: lastReplySpans[0] ?? "",
        lastReplyAt: lastReplySpans[1] ?? "",
        lastReplyHref: lastReplyLink?.href ?? "",
        pageLinks,
        icon,
        isPinned,
        board: getFirstText(document, ".board-head-name"),
        boardHref: location.href
      };
    })
    .filter(Boolean);
}

function getUserCenterData() {
  const navItems = [...document.querySelectorAll(".user-center-navigation a")].map((link) => ({
    title: link.textContent.trim(),
    href: link.href
  })).filter((item) => item.title);
  const heading = getFirstText(document, ".user-theme-info h2, .user-center-head p, h2") || "个人中心";
  const summary = [...document.querySelectorAll(".user-center-router p, .user-center-router label")]
    .map((node) => node.textContent.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 8);
  const actions = [...document.querySelectorAll(".user-center-router button")]
    .map((button) => button.textContent.trim())
    .filter(Boolean)
    .slice(0, 32);
  return { navItems, heading, summary, actions };
}

function getNativeTopbar() {
  const root = document.querySelector("#root") ?? document;
  return root.querySelector(".topBar-mainPage, .topBar, .header, .headerWithoutImage");
}

function getNativeUserEntry() {
  const topbar = getNativeTopbar();
  if (!topbar) {
    return null;
  }
  const topbarRight = topbar.querySelector(".topBarRight");
  if (topbarRight instanceof HTMLElement) {
    return topbarRight;
  }
  const direct = topbar.querySelector([
    ".topBarUser",
    ".topBarUserInfo",
    ".topBarUserImg",
    ".topbar-user",
    ".top-bar-user",
    "[class*='topBarUser']",
    "[class*='userInfo']"
  ].join(","));
  if (direct instanceof HTMLElement) {
    return direct.closest("a, button, [role='button'], .topBarUser, .topBarUserInfo, .topBarUserImg, [class*='topBarUser'], [class*='userInfo']") || direct;
  }
  const userImage = topbar.querySelector("a[href*='/user/'] img, img[class*='avatar'], img[class*='portrait'], img[src*='avatar'], img[src*='portrait']");
  if (userImage instanceof HTMLElement) {
    return userImage.closest("a, button, [role='button'], div, span") || userImage;
  }
  const userLink = topbar.querySelector("a[href*='/user/'], a[href*='userCenter'], a[href*='usercenter']");
  return userLink instanceof HTMLElement ? userLink : null;
}

function attachNativeTopbarDropdowns(nativeEntry) {
  if (!(nativeEntry instanceof HTMLElement)) {
    return;
  }
  const normalizeDropdown = (node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    if (node.classList.contains("topBarUserCenter-mainPage")) {
      node.classList.add("topBarUserCenter");
    }
    if (node.classList.contains("topBarMessageDetails-mainPage")) {
      node.classList.add("topBarMessageDetails");
    }
  };
  nativeEntry.querySelectorAll(".topBarUserCenter-mainPage, .topBarMessageDetails-mainPage").forEach(normalizeDropdown);
  [
    [".topBarUserCenter, .topBarUserCenter-mainPage", "topBarUserCenter"],
    [".topBarMessageDetails, .topBarMessageDetails-mainPage", "topBarMessageDetails"]
  ].forEach(([selector, baseClass]) => {
    const existingDropdown = nativeEntry.querySelector(selector);
    if (existingDropdown && !existingDropdown.classList.contains("cc98-rebuild-forced-topbar-menu")) {
      normalizeDropdown(existingDropdown);
      return;
    }
    const dropdown = [...document.querySelectorAll(selector)]
      .find((node) => node instanceof HTMLElement && !node.closest("#cc98-comfort-app"));
    if (dropdown instanceof HTMLElement) {
      rememberReparentedNativeNode(dropdown);
      dropdown.classList.add(baseClass);
      normalizeDropdown(dropdown);
      if (existingDropdown) {
        existingDropdown.replaceWith(dropdown);
      } else {
        nativeEntry.append(dropdown);
      }
    }
  });
}

function createForcedTopbarUserMenu() {
  const menu = createElement("div", "topBarUserCenter cc98-rebuild-forced-topbar-menu");
  const source = [...document.querySelectorAll(".topBarUserCenter, .topBarUserCenter-mainPage")]
    .find((node) => node instanceof HTMLElement && !node.closest("#cc98-comfort-app"));
  if (source instanceof HTMLElement) {
    rememberReparentedNativeNode(source);
    source.classList.add("topBarUserCenter");
    return source;
  }

  const list = document.createElement("ul");
  list.style.display = "inherit";
  [
    ["/usercenter", "\u4e2a\u4eba\u4e2d\u5fc3"],
    ["/signin", "\u5df2\u7b7e\u5230"]
  ].forEach(([href, text]) => {
    const link = document.createElement("a");
    link.href = makeAbsoluteCc98Url(href);
    const item = document.createElement("li");
    item.textContent = text;
    link.append(item);
    list.append(link);
  });
  const logout = document.createElement("li");
  logout.textContent = "\u9000\u51fa\u767b\u5f55";
  logout.dataset.cc98ForcedLogout = "true";
  list.append(logout);
  menu.append(list);
  return menu;
}

function isLogoutMenuText(text) {
  const value = cleanupPostText(text);
  return value.includes("\u9000\u51fa\u767b\u5f55") || value.includes("\u9000\u51fa");
}

function findNativeLogoutControl() {
  return [...document.querySelectorAll(".topBarUserCenter li, .topBarUserCenter-mainPage li, .topBarUserCenter a, .topBarUserCenter-mainPage a")]
    .find((node) => node instanceof HTMLElement
      && !node.closest("#cc98-comfort-app")
      && isLogoutMenuText(node.textContent));
}

function forceTopbarAuthNavigation(authLink, event) {
  if (!(authLink instanceof HTMLAnchorElement)) {
    return false;
  }
  const href = authLink.getAttribute("href") || authLink.href || "";
  const text = cleanupPostText(authLink.textContent);
  if (/\/logon\/?$/i.test(href) || /\/logon(?:[?#/]|$)/i.test(href) || text.includes("\u767b\u5f55")) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    location.assign("https://www.cc98.org/logOn");
    return true;
  }
  if (/account\.cc98\.org/i.test(href) || text.includes("\u6ce8\u518c")) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    location.assign("https://account.cc98.org/");
    return true;
  }
  return false;
}

function bindGlobalTopbarAuthRedirects() {
  if (topbarAuthRedirectBound) {
    return;
  }
  topbarAuthRedirectBound = true;
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const authLink = target.closest(".topBarUserInfo .topBarText a[href], .topBarText a[href], .cc98-rebuild-guest-user-entry a[href]");
    if (forceTopbarAuthNavigation(authLink, event)) {
      return;
    }
    const logoutControl = target.closest(".topBarUserCenter li, .topBarUserCenter-mainPage li, .topBarUserCenter a, .topBarUserCenter-mainPage a, [data-cc98-forced-logout='true']");
    if (logoutControl instanceof HTMLElement && isLogoutMenuText(logoutControl.textContent)) {
      scheduleLogoutRedirect();
    }
  }, true);
}

function parseStoredJsonLoose(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const starts = [...new Set([0, 2, 4, raw.indexOf("{"), raw.indexOf("[")].filter((index) => index >= 0))];
  for (const start of starts) {
    try {
      let parsed = JSON.parse(raw.slice(start));
      if (typeof parsed === "string" && /^[\s[{"]/.test(parsed)) {
        parsed = JSON.parse(parsed);
      }
      return parsed;
    } catch {
      // Try the next likely prefix.
    }
  }
  return null;
}

function getStoredCc98UserInfo() {
  try {
    const parsed = parseStoredJsonLoose(localStorage.getItem("userInfo"));
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed.user || parsed.currentUser || parsed.profile || parsed.data || parsed;
  } catch {
    return null;
  }
}

function readFirstObjectValue(source, keys) {
  if (!source || typeof source !== "object") {
    return "";
  }
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function getStoredCc98UserName() {
  const info = getStoredCc98UserInfo();
  return readFirstObjectValue(info, ["name", "userName", "username", "nickName", "nickname"]) || "个人中心";
}

function getStoredCc98UserAvatar() {
  const info = getStoredCc98UserInfo();
  const avatar = readFirstObjectValue(info, ["portraitUrl", "portrait", "avatarUrl", "avatar", "photoUrl", "faceUrl", "face"]);
  return avatar ? makeAbsoluteCc98Url(avatar) : "";
}

function createForcedTopbarUserEntry() {
  const entry = createElement("div", "cc98-rebuild-native-user-entry cc98-rebuild-forced-user-entry");
  entry.tabIndex = 0;
  const userInfo = createElement("div", "topBarUserInfo cc98-rebuild-forced-user-info");
  const avatarUrl = getStoredCc98UserAvatar();
  if (avatarUrl) {
    const avatarWrap = createElement("div", "topBarUserImg");
    const avatar = document.createElement("img");
    avatar.src = avatarUrl;
    avatar.alt = "";
    avatarWrap.append(avatar);
    userInfo.append(avatarWrap);
  }
  const label = createElement("span", "topBarUserName cc98-rebuild-native-user-name-link", getStoredCc98UserName());
  label.setAttribute("role", "link");
  label.tabIndex = 0;
  userInfo.append(label);
  entry.append(userInfo, createForcedTopbarUserMenu());
  return prepareNativeTopbarUserEntry(entry);
}

function prepareNativeTopbarUserEntry(nativeEntry) {
  if (!(nativeEntry instanceof HTMLElement)) {
    return null;
  }
  rememberReparentedNativeNode(nativeEntry);
  nativeEntry.classList.add("cc98-rebuild-native-user-entry");
  nativeEntry.classList.toggle(
    "cc98-rebuild-guest-user-entry",
    Boolean(nativeEntry.querySelector('a[href*="/logOn"], a[href*="/logon"], a[href*="account.cc98.org"]'))
  );
  attachNativeTopbarDropdowns(nativeEntry);

  if (!nativeTopbarUserStabilizers.has(nativeEntry)) {
    nativeTopbarUserStabilizers.add(nativeEntry);
    nativeEntry.addEventListener("click", (event) => {
      const authLink = event.target?.closest?.(".topBarUserInfo a[href], .topBarText a[href], .cc98-rebuild-guest-user-entry a[href]");
      if (forceTopbarAuthNavigation(authLink, event)) {
        return;
      }
      if (authLink instanceof HTMLAnchorElement) {
        const href = authLink.getAttribute("href") || authLink.href || "";
        const text = cleanupPostText(authLink.textContent);
        if (/logon|logOn/i.test(href) || text.includes("登录")) {
          event.preventDefault();
          event.stopPropagation();
          location.href = "https://www.cc98.org/logOn";
          return;
        }
        if (/account\.cc98\.org/i.test(href) || text.includes("注册")) {
          event.preventDefault();
          event.stopPropagation();
          location.href = makeAbsoluteCc98Url(href);
          return;
        }
      }
      const link = event.target?.closest?.(".messageTopBar[href], .topBarMessage a[href], .topBarUserCenter a[href], .topBarUserCenter-mainPage a[href], .topBarMessageDetails a[href], .topBarMessageDetails-mainPage a[href]");
      const menuItem = event.target?.closest?.(".topBarUserCenter li, .topBarUserCenter-mainPage li, .topBarUserCenter a, .topBarUserCenter-mainPage a");
      const forcedLogout = event.target?.closest?.("[data-cc98-forced-logout='true']");
      const isLogoutAction = Boolean(forcedLogout)
        || (menuItem instanceof HTMLElement && isLogoutMenuText(menuItem.textContent));
      if (isLogoutAction) {
        if (forcedLogout) {
          const sourceLogout = findNativeLogoutControl();
          if (sourceLogout instanceof HTMLElement) {
            triggerOriginalControl(sourceLogout);
          }
          event.preventDefault();
          event.stopPropagation();
        }
        scheduleLogoutRedirect();
      }
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }
      if (isLogoutAction) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      location.href = makeAbsoluteCc98Url(link.getAttribute("href") || link.href);
    }, true);
  }

  const userName = nativeEntry.querySelector(".topBarUserName, [class*='UserName'], [class*='userName']");
  if (userName instanceof HTMLElement && userName.dataset.cc98TopbarUserBound !== "true") {
    userName.dataset.cc98TopbarUserBound = "true";
    userName.classList.add("cc98-rebuild-native-user-name-link");
    userName.setAttribute("role", "link");
    userName.tabIndex = 0;
    const goUserCenter = (event) => {
      event.preventDefault();
      event.stopPropagation();
      location.href = `${location.origin}/usercenter`;
    };
    userName.addEventListener("click", goUserCenter);
    userName.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        goUserCenter(event);
      }
    });
  }
  return nativeEntry;
}

function stabilizeTopbarUserEntry(app = document.querySelector("#cc98-comfort-app")) {
  const actions = app?.querySelector?.(".cc98-rebuild-actions");
  if (!(actions instanceof HTMLElement)) {
    return;
  }
  const existing = actions.querySelector(".cc98-rebuild-native-user-entry");
  if (existing instanceof HTMLElement && !existing.classList.contains("cc98-rebuild-forced-user-entry")) {
    prepareNativeTopbarUserEntry(existing);
    return;
  }

  const nativeEntry = prepareNativeTopbarUserEntry(getNativeUserEntry());
  if (nativeEntry) {
    const fallback = actions.querySelector(".cc98-rebuild-user-fallback, .cc98-rebuild-forced-user-entry");
    if (fallback && fallback !== nativeEntry) {
      fallback.replaceWith(nativeEntry);
    } else {
      actions.append(nativeEntry);
    }
    return;
  }

  if (app?.dataset?.pageKind === "home" || getPageKind() === "home") {
    const forcedEntry = createForcedTopbarUserEntry();
    if (forcedEntry) {
      const fallback = actions.querySelector(".cc98-rebuild-user-fallback, .cc98-rebuild-forced-user-entry");
      if (fallback) {
        fallback.replaceWith(forcedEntry);
      } else {
        actions.append(forcedEntry);
      }
    }
  }
}

function renderTopbarUserEntry() {
  const nativeEntry = prepareNativeTopbarUserEntry(getNativeUserEntry());
  if (nativeEntry) {
    return nativeEntry;
  }
  if (hasFreshCc98LoginSession()) {
    return createForcedTopbarUserEntry();
  }
  const fallback = createLink("cc98-rebuild-user-fallback", "个人", `${location.origin}/userCenter`);
  fallback.setAttribute("aria-label", "个人中心");
  return fallback;
}

function shouldBlockRebuiltItem(item) {
  if (!lastSettings) {
    return "";
  }

  const blockedBoards = parseList(lastSettings.blockedBoards);
  const blockedKeywords = parseList(lastSettings.blockedTitleKeywords);
  const blockedUserIds = parseList(lastSettings.blockedUserIds).map((uid) => uid.replace(/\D/g, "")).filter(Boolean);
  const matchedBoard = blockedBoards.find((rule) => item.board && normalizeText(item.board).includes(normalizeText(rule)));
  if (matchedBoard) {
    return `版面：${matchedBoard}`;
  }
  const matchedKeyword = blockedKeywords.find((keyword) => item.title?.toLowerCase().includes(keyword.toLowerCase()));
  if (matchedKeyword) {
    return `关键词：${matchedKeyword}`;
  }
  const matchedUid = blockedUserIds.find((uid) => item.uid === uid);
  if (matchedUid) {
    return `UID：${matchedUid}`;
  }
  return "";
}

function renderBlockedPlaceholder(reason) {
  const placeholder = createElement("article", "cc98-rebuild-card cc98-rebuild-blocked");
  placeholder.append(createElement("div", "cc98-rebuild-card-title", `${lastSettings.placeholderText} · ${reason}`));
  return placeholder;
}

function renderTopicCard(item) {
  const reason = shouldBlockRebuiltItem(item);
  if (reason) {
    return renderBlockedPlaceholder(reason);
  }

  const card = createElement("article", "cc98-rebuild-card");
  const top = createElement("div", "cc98-rebuild-card-top");
  if (item.board) {
    top.append(createLink("cc98-rebuild-chip", item.board, item.boardHref));
  }
  if (item.user) {
    const user = createElement("span", "cc98-rebuild-muted", item.uid ? `${item.user} · ${item.uid}` : item.user);
    top.append(user);
  }
  card.append(top);
  card.append(createLink("cc98-rebuild-card-title", item.title, item.href));
  if (item.meta) {
    card.append(createElement("p", "cc98-rebuild-card-meta", item.meta));
  }
  if (item.hoverMeta || item.user || item.replyCount) {
    const hoverMeta = createElement("div", "cc98-rebuild-hover-meta");
    if (item.hoverMeta) {
      hoverMeta.append(createElement("span", "", item.hoverMeta));
    } else if (item.user) {
      hoverMeta.append(createElement("span", "", `发帖人: ${item.user}`));
    }
    if (!item.hoverMeta && item.replyCount) {
      hoverMeta.append(createElement("span", "", `回复数: ${item.replyCount}`));
    }
    card.append(hoverMeta);
  }
  if (item.rank) {
    card.classList.add("has-rank");
    const rank = createElement("span", "cc98-rebuild-rank", String(item.rank));
    rank.style.setProperty("--cc98-rank-hue", String(((Number(item.rank) - 1) * 32) % 360));
    card.append(rank);
    if (item.rankMovement) {
      card.classList.add(`cc98-rebuild-rank-${item.rankMovement}`);
      const motionText = item.rankMovement === "new"
        ? "\u65b0"
        : `${item.rankMovement === "up" ? "\u2191" : "\u2193"}${item.rankDelta || ""}`;
      const motionClass = [
        "cc98-rebuild-rank-motion",
        `cc98-rebuild-rank-motion-${item.rankMovement}`,
        item.rankMovementAnimated ? "is-animated" : ""
      ].filter(Boolean).join(" ");
      const motion = createElement("span", motionClass, motionText);
      const motionLabel = item.rankMovement === "up"
        ? `\u6392\u540d\u4e0a\u5347 ${item.rankDelta || 0}`
        : (item.rankMovement === "down" ? `\u6392\u540d\u4e0b\u964d ${item.rankDelta || 0}` : "\u65b0\u589e\u70ed\u95e8");
      motion.setAttribute("aria-label", motionLabel);
      card.append(motion);
    }
  }
  return card;
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightElementTerms(element, terms) {
  if (!element || !terms?.length) {
    return;
  }
  const normalizedTerms = [...new Set(terms.map((term) => normalizeSuggestionText(term)).filter((term) => term.length >= 2))]
    .sort((a, b) => b.length - a.length);
  if (!normalizedTerms.length) {
    return;
  }
  const pattern = new RegExp(`(${normalizedTerms.map(escapeRegExp).join("|")})`, "gi");
  const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !pattern.test(node.nodeValue)) {
        pattern.lastIndex = 0;
        return NodeFilter.FILTER_REJECT;
      }
      pattern.lastIndex = 0;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walk.nextNode()) {
    nodes.push(walk.currentNode);
  }
  nodes.forEach((node) => {
    const fragment = document.createDocumentFragment();
    const text = node.nodeValue;
    let lastIndex = 0;
    text.replace(pattern, (match, _term, offset) => {
      if (offset > lastIndex) {
        fragment.append(document.createTextNode(text.slice(lastIndex, offset)));
      }
      fragment.append(createElement("mark", "cc98-rebuild-search-hit", match));
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < text.length) {
      fragment.append(document.createTextNode(text.slice(lastIndex)));
    }
    node.replaceWith(fragment);
  });
}

function renderHighlightedTopicCard(item, terms) {
  const card = renderTopicCard(item);
  highlightElementTerms(card.querySelector(".cc98-rebuild-card-title"), terms);
  highlightElementTerms(card.querySelector(".cc98-rebuild-card-meta"), terms);
  highlightElementTerms(card.querySelector(".cc98-rebuild-hover-meta"), terms);
  return card;
}

function renderPostCard(item) {
  const card = createElement("article", "cc98-rebuild-card cc98-rebuild-post");
  card.dataset.itemKey = `post:${item.id}`;
  card.classList.toggle("cc98-rebuild-hot-post", Boolean(item.isHot));
  const floor = Number(item.index);
  if (!item.isHot && Number.isFinite(floor) && floor > 0) {
    card.id = getRebuiltFloorAnchorId(floor);
    card.dataset.postFloor = String(floor);
    const originalAnchor = createElement("span", "cc98-rebuild-floor-anchor");
    originalAnchor.id = String(floor);
    originalAnchor.setAttribute("aria-hidden", "true");
    card.append(originalAnchor);
  }
  const header = createElement("div", "cc98-rebuild-post-header");
  if (item.avatar) {
    const avatar = createElement("img", "cc98-rebuild-avatar");
    avatar.src = item.avatar;
    avatar.alt = "";
    if (isLightDefaultAvatarUrl(item.avatar)) {
      avatar.classList.add("cc98-rebuild-avatar-light-default");
      avatar.dataset.cc98LightDefaultAvatar = "true";
    }
    if (item.userHref) {
      const avatarLink = createLink("cc98-rebuild-avatar-link", "", item.userHref);
      avatarLink.setAttribute("aria-label", `${item.user}的主页`);
      avatarLink.textContent = "";
      if (avatar.classList.contains("cc98-rebuild-avatar-light-default")) {
        avatarLink.classList.add("cc98-rebuild-avatar-light-default-link");
      }
      avatarLink.append(avatar);
      header.append(avatarLink);
    } else {
      header.append(avatar);
    }
  }
  const byline = createElement("div", "");
  const userLine = createElement("div", "cc98-rebuild-post-user-line");
  const displayUser = item.anonymousCode ? `${item.user || "CC98 \u7528\u6237"} \u00b7 ${item.anonymousCode}` : item.user;
  if (item.userHref) {
    userLine.append(createLink("cc98-rebuild-post-user", displayUser, item.userHref));
  } else {
    userLine.append(createElement("span", "cc98-rebuild-post-user", displayUser));
  }
  if (item.isOriginalPoster) {
    userLine.append(createElement("span", "cc98-rebuild-op-badge", "\u697c\u4e3b"));
  }
  byline.append(userLine);
  if (item.isHot) {
    byline.append(createElement("div", "cc98-rebuild-muted cc98-rebuild-hot-label", "🔥热评"));
  } else {
    byline.append(createElement("div", "cc98-rebuild-muted", item.uid ? `#${item.index} · UID ${item.uid}` : `#${item.index}`));
  }
  header.append(byline);
  card.append(header);

  const body = createElement("div", "cc98-rebuild-post-body");
  if (item.content) {
    body.append(item.content);
  } else {
    item.text.split("\n").filter(Boolean).forEach((line) => {
      body.append(createElement("p", "", line));
    });
  }
  rewriteLegacyQuoteInlineStyles(body);
  stabilizePostQuoteBlocks(body);
  forceLegacyQuotesInRebuiltRoot(body);
  stabilizeEmojiRendering(body);
  requestAnimationFrame(() => {
    rewriteLegacyQuoteInlineStyles(body);
    stabilizePostQuoteBlocks(body);
    forceLegacyQuotesInRebuiltRoot(body);
    stabilizeEmojiRendering(body);
  });
  card.append(body);

  const awardTable = renderPostAwardTable(item.awards);
  if (awardTable) {
    card.append(awardTable);
  }

  if (item.signature) {
    const signatureWrap = createElement("section", "cc98-rebuild-signature");
    signatureWrap.append(item.signature);
    card.append(signatureWrap);
  }

  if (item.publishedAt || item.actions?.length) {
    const footer = createElement("div", "cc98-rebuild-post-footer");
    if (item.publishedAt) {
      footer.append(createElement("span", "cc98-rebuild-muted", `发表于 ${item.publishedAt}`));
    }
    if (item.actions?.length) {
      const actionWrap = createElement("div", "cc98-rebuild-post-actions");
      item.actions.forEach((action) => {
        actionWrap.append(renderProxyControl(action));
      });
      item.actions.forEach(enforceVoteGroupMutualExclusion);
      footer.append(actionWrap);
    }
    card.append(footer);
  }

  return card;
}

function renderPostPager() {
  const pageInfo = getTopicPageInfo();
  if (!pageInfo) {
    return null;
  }

  const pager = createElement("nav", "cc98-rebuild-pager");
  pager.setAttribute("aria-label", "帖子页码");

  const appendPageLink = (label, page, className = "") => {
    const href = stripUrlHash(pageInfo.pages.get(page) || buildTopicPageHref(pageInfo.topicId, page));
    const link = createLink(`cc98-rebuild-page-link ${className}`.trim(), label, href);
    if (page === pageInfo.current) {
      link.classList.add("is-current");
      link.setAttribute("aria-current", "page");
    }
    pager.append(link);
  };

  if (pageInfo.current > 1) {
    appendPageLink("上一页", pageInfo.current - 1, "cc98-rebuild-page-prev");
  }

  const pageNumbers = new Set([1, pageInfo.current - 2, pageInfo.current - 1, pageInfo.current, pageInfo.maxKnown]);
  if (pageInfo.canGoNext) {
    pageNumbers.add(pageInfo.current + 1);
  }
  if (pageInfo.maxKnown > pageInfo.current + 1) {
    pageNumbers.add(pageInfo.current + 2);
  }
  [...pageNumbers]
    .filter((page) => page >= 1 && page <= Math.max(pageInfo.maxKnown, pageInfo.current + 2))
    .sort((a, b) => a - b)
    .forEach((page, index, pages) => {
      if (index > 0 && page - pages[index - 1] > 1) {
        pager.append(createElement("span", "cc98-rebuild-page-gap", "..."));
      }
      appendPageLink(String(page), page);
    });

  if (pageInfo.canGoNext) {
    appendPageLink("下一页", pageInfo.current + 1, "cc98-rebuild-page-next");
  }

  const form = createElement("form", "cc98-rebuild-page-jump");
  const input = createElement("input", "");
  input.type = "number";
  input.min = "1";
  input.value = String(pageInfo.current);
  input.setAttribute("aria-label", "跳转到页码");
  const button = createElement("button", "", "跳转");
  button.type = "submit";
  form.append(input, button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const page = Math.max(1, Number(input.value) || pageInfo.current);
    navigateToRebuiltHref(pageInfo.pages.get(page) || buildTopicPageHref(pageInfo.topicId, page));
  });
  pager.append(form);
  const shareAction = getTopicToolbarActions().share;
  if (shareAction) {
    const shareButton = renderProxyControl(shareAction);
    shareButton.classList.add("cc98-rebuild-pager-action");
    pager.append(shareButton);
  }

  return pager;
}

function renderBoardPager(position = "top") {
  const pagers = [...document.querySelectorAll(".board-pagination")];
  const source = position === "bottom" ? pagers[pagers.length - 1] : pagers[0];
  if (!source) {
    return null;
  }
  const pager = createElement("nav", "cc98-rebuild-pager cc98-rebuild-board-pager");
  pager.setAttribute("aria-label", "版面页码");
  [...source.querySelectorAll("li")].forEach((item) => {
    if (item.classList.contains("ant-pagination-options")) {
      const quickInput = item.querySelector("input");
      if (!quickInput) {
        return;
      }
      const form = createElement("form", "cc98-rebuild-page-jump");
      const input = createElement("input", "");
      input.type = "number";
      input.min = "1";
      input.setAttribute("aria-label", "跳转到页码");
      const button = createElement("button", "", "跳转");
      button.type = "submit";
      form.append(input, button);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        quickInput.value = input.value;
        ["input", "change"].forEach((type) => quickInput.dispatchEvent(new Event(type, { bubbles: true })));
        quickInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        quickInput.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        quickInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        const fallbackHref = getBoardPageHref(input.value);
        if (fallbackHref) {
          window.setTimeout(() => {
            if (stripUrlHash(location.href) !== stripUrlHash(fallbackHref)) {
              navigateToRebuiltHref(fallbackHref);
            }
          }, 180);
        }
        scheduleDelayedRebuilds();
      });
      pager.append(form);
      return;
    }
    const text = item.textContent?.replace(/•+/g, "...").replace(/\s+/g, " ").trim();
    const label = text || item.getAttribute("title") || "";
    if (!label) {
      return;
    }
    const isDisabled = item.classList.contains("ant-pagination-disabled");
    const isCurrent = item.classList.contains("ant-pagination-item-active");
    const button = createButton("cc98-rebuild-page-link", label, () => {
      if (isDisabled || isCurrent) {
        return;
      }
      triggerOriginalControl(item);
      scheduleDelayedRebuilds();
    });
    if (isCurrent) {
      button.classList.add("is-current");
      button.setAttribute("aria-current", "page");
    }
    if (isDisabled) {
      button.disabled = true;
      button.classList.add("is-disabled");
    }
    pager.append(button);
  });
  return pager.children.length ? pager : null;
}

function renderBoardTopicCard(item) {
  const reason = shouldBlockRebuiltItem(item);
  if (reason) {
    return renderBlockedPlaceholder(reason);
  }
  const card = createElement("article", "cc98-rebuild-card cc98-rebuild-board-topic");
  if (item.isPinned) {
    card.classList.add("is-pinned");
  }
  const marker = createElement("span", "cc98-rebuild-board-topic-marker", item.isPinned ? "置顶" : "主题");
  const main = createElement("div", "cc98-rebuild-board-topic-main");
  const titleRow = createElement("div", "cc98-rebuild-board-topic-title-row");
  titleRow.append(createLink("cc98-rebuild-card-title", item.title, item.href));
  if (item.pageLinks?.length) {
    const pages = createElement("div", "cc98-rebuild-board-topic-pages");
    item.pageLinks.slice(0, 8).forEach((page) => pages.append(createLink("cc98-rebuild-chip", page.text, page.href)));
    titleRow.append(pages);
  }
  main.append(titleRow);
  const meta = createElement("div", "cc98-rebuild-board-topic-meta");
  if (item.user) {
    meta.append(item.userHref ? createLink("cc98-rebuild-muted", `作者: ${item.user}`, item.userHref) : createElement("span", "cc98-rebuild-muted", `作者: ${item.user}`));
  }
  if (item.viewCount) {
    meta.append(createElement("span", "cc98-rebuild-muted", `👁️点击: ${item.viewCount}`));
  }
  if (item.replyCount) {
    meta.append(createElement("span", "cc98-rebuild-muted", `💬回复: ${item.replyCount}`));
  }
  if (item.lastReplyUser || item.lastReplyAt) {
    const lastText = `最后回复: ${[item.lastReplyUser, item.lastReplyAt].filter(Boolean).join(" / ")}`;
    meta.append(item.lastReplyHref ? createLink("cc98-rebuild-muted", lastText, item.lastReplyHref) : createElement("span", "cc98-rebuild-muted", lastText));
  }
  main.append(meta);
  card.append(marker, main);
  return card;
}

function renderBoardPage(app) {
  const data = getBoardPageData();
  const summary = createElement("section", "cc98-rebuild-board-hero");
  if (data.avatar) {
    const avatar = createElement("img", "cc98-rebuild-board-hero-avatar");
    avatar.src = data.avatar;
    avatar.alt = "";
    summary.append(avatar);
  }
  const body = createElement("div", "cc98-rebuild-board-hero-body");
  body.append(createElement("p", "cc98-rebuild-kicker", "Board"));
  body.append(createElement("h1", "", data.name));
  if (data.intro) {
    body.append(createElement("p", "cc98-rebuild-card-meta", data.intro));
  }
  if (data.moderators.length) {
    const mods = createElement("div", "cc98-rebuild-board-mods");
    mods.append(createElement("span", "cc98-rebuild-muted", "版主"));
    data.moderators.slice(0, 12).forEach((mod) => mods.append(createLink("cc98-rebuild-chip", mod.text, mod.href)));
    body.append(mods);
  }
  summary.append(body);
  if (data.stats.length || data.followAction) {
    const aside = createElement("div", "cc98-rebuild-board-stats");
    data.stats.forEach((stat) => {
      const item = createElement("div", "cc98-rebuild-board-stat");
      item.append(createElement("span", "", stat.label));
      item.append(createElement("strong", "", stat.value));
      aside.append(item);
    });
    if (data.followAction) {
      aside.append(renderProxyControl(data.followAction));
    }
    summary.append(aside);
  }
  app.append(summary);

  if (data.notice) {
    const notice = createElement("section", "cc98-rebuild-board-notice");
    const details = createElement("details", "");
    details.open = false;
    details.append(createElement("summary", "", "版面说明"));
    data.notice.classList.add("cc98-rebuild-post-body");
    details.append(data.notice);
    notice.append(details);
    app.append(notice);
  }

  const toolbar = createElement("section", "cc98-rebuild-board-toolbar");
  if (data.postTopic?.href) {
    toolbar.append(createLink("cc98-rebuild-action", "发主题", data.postTopic.href));
  }
  data.filters.forEach((filter) => toolbar.append(renderProxyControl(filter)));
  app.append(toolbar);

  const topPager = renderBoardPager("top");
  if (topPager) {
    app.append(topPager);
  }

  const feed = createElement("section", "cc98-rebuild-feed cc98-rebuild-board-topic-feed");
  feed.dataset.feedKind = "boardTopics";
  getBoardTopicItems().forEach((item) => {
    const card = renderBoardTopicCard(item);
    card.dataset.itemKey = `board-topic:${item.href}`;
    feed.append(card);
  });
  app.append(feed);

  const bottomPager = renderBoardPager("bottom");
  if (bottomPager) {
    app.append(bottomPager);
  }

  if (data.footerActions.length) {
    const footerActions = createElement("section", "cc98-rebuild-board-footer-actions");
    data.footerActions.forEach((action) => footerActions.append(renderProxyControl(action)));
    app.append(footerActions);
  }
}

function rememberReparentedNativeNode(node) {
  if (!node || reparentedNativeNodes.has(node)) {
    return;
  }
  reparentedNativeNodes.set(node, {
    parent: node.parentNode,
    nextSibling: node.nextSibling
  });
}

function restoreNativeNode(node) {
  if (!node) {
    return;
  }
  node.classList.remove(
    "cc98-rebuild-native-editor",
    "cc98-rebuild-native-reply",
    "cc98-rebuild-native-user-nav",
    "cc98-rebuild-native-user-router",
    "cc98-rebuild-native-user-entry",
    "cc98-rebuild-native-message",
    "cc98-rebuild-native-signin",
    "cc98-rebuild-native-login",
    "cc98-rebuild-native-login-announcement"
  );
  const previous = reparentedNativeNodes.get(node);
  if (previous?.parent?.isConnected) {
    previous.parent.insertBefore(node, previous.nextSibling?.parentNode === previous.parent ? previous.nextSibling : null);
    reparentedNativeNodes.delete(node);
    return;
  }
  const main = document.querySelector("#root .main-container") ?? document.querySelector("#root") ?? document.body;
  const footer = main.querySelector?.(".footer");
  if (footer?.parentElement === main) {
    main.insertBefore(node, footer);
  } else {
    main.append(node);
  }
  reparentedNativeNodes.delete(node);
}

function restoreReparentedNativeNodes(app) {
  app?.querySelectorAll?.(".createTopic.cc98-rebuild-native-editor, #sendTopicInfo.cc98-rebuild-native-reply, .user-center-navigation.cc98-rebuild-native-user-nav, .user-center-router.cc98-rebuild-native-user-router, .cc98-rebuild-native-user-entry, .cc98-rebuild-native-message, .cc98-rebuild-native-signin, .cc98-rebuild-native-login, .cc98-rebuild-native-login-announcement")
    .forEach((node) => restoreNativeNode(node));
}

function getEditorPageData() {
  const editor = document.querySelector(".createTopic");
  const breadcrumbLinks = [...(editor?.querySelectorAll(".row:first-child a[href]") ?? [])]
    .map((link) => ({ text: link.textContent?.trim() ?? "", href: link.href }))
    .filter((item) => item.text);
  const board = [...breadcrumbLinks].reverse().find((item) => /\/board\/\d+/i.test(item.href));
  return {
    editor,
    board,
    titlePlaceholder: editor?.querySelector(".createTopicTitle input")?.getAttribute("placeholder") ?? "请输入标题"
  };
}

function labelEditorToolbarButtons(editor) {
  const labels = new Map([
    ["加粗", "B"],
    ["斜体", "I"],
    ["下划线", "U"],
    ["删除线", "S"],
    ["左对齐", "左"],
    ["居中", "中"],
    ["右对齐", "右"],
    ["回复后可见", "隐"],
    ["插入表情", "☺"],
    ["插入url", "链"],
    ["插入图片", "图"],
    ["插入视频", "影"],
    ["插入Bilibili视频", "Bili"],
    ["插入音频", "音"],
    ["上传文件", "文"],
    ["撤销", "↶"],
    ["重做", "↷"],
    ["切换预览", "预"]
  ]);
  editor.querySelectorAll(".ubb-button").forEach((control) => {
    const title = control.getAttribute("title") || control.querySelector?.("[title]")?.getAttribute("title") || "";
    const label = labels.get(title);
    if (label && !control.textContent.trim()) {
      control.dataset.cc98ToolbarLabel = label;
    }
  });
  editor.querySelector(".ubb-button-fontSize")?.setAttribute("data-cc98-toolbar-label", "T↕");
  editor.querySelector(".ubb-button-color")?.setAttribute("data-cc98-toolbar-label", "色");
}

function labelEditorToolbarButtonsWithUnicode(editor) {
  const labelRules = [
    [/加粗|bold/i, "B"],
    [/斜体|italic/i, "I"],
    [/下划线|underline/i, "U"],
    [/删除线|strike/i, "S"],
    [/左对齐|align.*left/i, "左"],
    [/居中|align.*center/i, "中"],
    [/右对齐|align.*right/i, "右"],
    [/回复后可见|隐藏|hide/i, "隐"],
    [/表情|emoji/i, "☺"],
    [/url|链接|link/i, "🔗"],
    [/图片|image|picture/i, "图"],
    [/bilibili|哔哩/i, "Bili"],
    [/视频|video/i, "▶"],
    [/音频|audio/i, "♪"],
    [/文件|file|upload/i, "文"],
    [/撤销|undo/i, "↶"],
    [/重做|redo/i, "↷"],
    [/预览|preview/i, "预"]
  ];
  editor.querySelectorAll(".ubb-button").forEach((control) => {
    const title = [
      control.getAttribute("title"),
      control.getAttribute("aria-label"),
      control.querySelector?.("[title]")?.getAttribute("title"),
      control.className
    ].filter(Boolean).join(" ");
    const label = labelRules.find(([pattern]) => pattern.test(title))?.[1];
    if (label) {
      control.dataset.cc98ToolbarLabel = label;
    }
  });
  editor.querySelector(".ubb-button-fontSize")?.setAttribute("data-cc98-toolbar-label", "T↕");
  editor.querySelector(".ubb-button-color")?.setAttribute("data-cc98-toolbar-label", "色");
  editor.querySelectorAll("button.fa-check, button[class*='fa-check']").forEach((button) => {
    button.dataset.cc98EditorLabel = "✓";
  });
  editor.querySelectorAll("button.fa-remove, button.fa-times, button[class*='fa-remove'], button[class*='fa-times']").forEach((button) => {
    button.dataset.cc98EditorLabel = "×";
  });
}

function hideMarkdownEditorEntrances(editor) {
  editor.querySelectorAll("#post-topic-changeMode, .changeEditor, button, a, [role='button']").forEach((control) => {
    const signature = [
      control.id,
      control.className,
      control.getAttribute?.("title"),
      control.getAttribute?.("aria-label"),
      control.textContent
    ].filter(Boolean).join(" ");
    if (!/(?:post-topic-changeMode|changeEditor|markdown|切换.*编辑|切换.*模式)/i.test(signature)) {
      return;
    }
    control.classList.add("cc98-rebuild-markdown-entry");
    control.hidden = true;
    control.style.setProperty("display", "none", "important");
  });
}

function getNativeEditorPassthroughControl(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  const control = target.closest(".cc98-rebuild-native-editor .ubb-buttons .ubb-button, .cc98-rebuild-native-editor .ubb-buttons label[for='ubbFileUpload']");
  if (!(control instanceof HTMLElement)) {
    return null;
  }
  if (control.closest(".ubb-button-fontSize, .ubb-button-color, .cc98-rebuild-font-size-button, .cc98-rebuild-color-button")) {
    return null;
  }
  const signature = [
    control.className,
    control.getAttribute("title"),
    control.getAttribute("aria-label"),
    control.getAttribute("for"),
    control.dataset.cc98ToolbarLabel,
    control.textContent
  ].filter(Boolean).join(" ");
  return /(?:fa-link|fa-picture-o|fa-film|fa-music|fa-file|bilibili|bili|url|image|picture|video|audio|file|upload|ubbFileUpload)/i.test(signature)
    ? control
    : null;
}

function getNativeEditorTextarea(editor) {
  const textareas = [...editor.querySelectorAll("textarea")]
    .filter((textarea) => textarea instanceof HTMLTextAreaElement);
  return textareas.find((textarea) => {
    const rect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }) || textareas[0] || null;
}

const EDITOR_COLOR_PRESETS = [
  "#000000", "#666666", "#ffffff", "#ff0000",
  "#ff7a00", "#f2c200", "#00a65a", "#00a1d6",
  "#1677ff", "#722ed1", "#eb2f96", "#8b5a2b"
];

const EDITOR_FONT_SIZE_VALUES = ["1", "2", "3", "4", "5", "6", "7"];

function normalizeHexColor(value, fallback = "#ff0000") {
  const text = String(value ?? "").trim();
  const shortHex = text.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHex) {
    return `#${shortHex.slice(1).map((part) => part + part).join("")}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(text)) {
    return text.toLowerCase();
  }
  const rgb = text.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) {
    return `#${rgb.slice(1, 4).map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, "0")).join("")}`;
  }
  return fallback;
}

function hexToRgb(color) {
  const hex = normalizeHexColor(color).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Number(value) || 0)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function stopEditorColorEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function ensureLegacyColorPickerKillStyle() {
  if (document.getElementById("cc98-rebuild-kill-legacy-color-picker-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "cc98-rebuild-kill-legacy-color-picker-style";
  style.textContent = `
    .sp-container,
    .sp-picker-container,
    .sp-palette-container,
    .cc98-rebuild-legacy-color-picker-hidden {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .cc98-rebuild-color-popover {
      position: fixed !important;
      z-index: 2147483647 !important;
    }
    .cc98-rebuild-color-popover[hidden] {
      display: none !important;
    }
  `;
  (document.head || document.documentElement || document.body)?.append(style);
}

function getEditorColorTriggerButton(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  const direct = target.closest(".ubb-button-color, .cc98-rebuild-color-button");
  if (direct instanceof HTMLElement) {
    return direct;
  }
  const legacy = target.closest(".sp-replacer, .sp-preview, .sp-dd, .ubb-color-picker, [class*='ubb-button-color']");
  if (!(legacy instanceof HTMLElement)) {
    return null;
  }
  return legacy.closest(".ubb-button-color, .cc98-rebuild-color-button") || legacy;
}

function getEditorColorPanels(button) {
  return [...document.querySelectorAll(".cc98-rebuild-color-popover")]
    .filter((panel) => panel instanceof HTMLElement && (panel.__cc98ColorButton === button || button?.contains?.(panel)));
}

function suppressLegacyEditorColorPickers(scope = document) {
  ensureLegacyColorPickerKillStyle();
  document.querySelectorAll(".sp-container, .sp-picker-container, .sp-palette-container").forEach((node) => {
    if (node instanceof HTMLElement) {
      node.classList.add("cc98-rebuild-legacy-color-picker-hidden");
      node.hidden = true;
      node.style.setProperty("display", "none", "important");
      node.style.setProperty("visibility", "hidden", "important");
      node.style.setProperty("pointer-events", "none", "important");
    }
  });
  scope?.querySelectorAll?.("input[type='color'], input.cc98-rebuild-native-color-input").forEach((input) => {
    if (input instanceof HTMLInputElement) {
      try {
        input.type = "hidden";
      } catch {
        input.style.setProperty("display", "none", "important");
      }
      input.hidden = true;
      input.tabIndex = -1;
      input.style.setProperty("display", "none", "important");
      input.style.setProperty("pointer-events", "none", "important");
    }
  });
}

function ensureLegacyColorPickerSuppressor() {
  ensureLegacyColorPickerKillStyle();
  suppressLegacyEditorColorPickers(document);
  if (!legacyColorPickerObserver) {
    legacyColorPickerObserver = new MutationObserver((records) => {
      const shouldSuppress = records.some((record) => {
        return [...record.addedNodes].some((node) => {
          return node instanceof Element && (
            node.matches?.(".sp-container, .sp-picker-container, .sp-palette-container, .sp-replacer, .ubb-button-color, .ubb-color-picker")
            || Boolean(node.querySelector?.(".sp-container, .sp-picker-container, .sp-palette-container, .sp-replacer, .ubb-button-color, .ubb-color-picker"))
          );
        });
      });
      if (shouldSuppress) {
        window.setTimeout(() => suppressLegacyEditorColorPickers(document), 0);
      }
    });
    legacyColorPickerObserver.observe(document.documentElement || document, { childList: true, subtree: true });
  }
  if (!legacyColorPickerInterval) {
    legacyColorPickerInterval = window.setInterval(() => suppressLegacyEditorColorPickers(document), 700);
  }
}

function findEditorForColorButton(button) {
  return button?.closest?.(".cc98-rebuild-native-editor, .createTopic, #sendTopicInfo, .sendTopicInfo, .reply-input, .ubb-editor, form")
    || document.querySelector(".cc98-rebuild-native-editor, .createTopic, #sendTopicInfo")
    || null;
}

function positionEditorColorPopover(button, panel) {
  if (!(button instanceof HTMLElement) || !(panel instanceof HTMLElement) || panel.hidden) {
    return;
  }
  const rect = button.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(328, Math.max(280, window.innerWidth - margin * 2));
  panel.style.setProperty("width", `${width}px`, "important");
  panel.style.setProperty("min-width", `${width}px`, "important");
  const panelHeight = panel.offsetHeight || 252;
  const belowTop = rect.bottom + 10;
  const aboveTop = rect.top - panelHeight - 10;
  const top = belowTop + panelHeight + margin <= window.innerHeight
    ? belowTop
    : Math.max(margin, aboveTop);
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left));
  panel.style.setProperty("top", `${top}px`, "important");
  panel.style.setProperty("left", `${left}px`, "important");
}

function positionEditorFontSizePopover(button, panel) {
  if (!(button instanceof HTMLElement) || !(panel instanceof HTMLElement) || panel.hidden) {
    return;
  }
  const rect = button.getBoundingClientRect();
  const margin = 12;
  const width = 162;
  const panelHeight = panel.offsetHeight || 252;
  const belowTop = rect.bottom + 8;
  const aboveTop = rect.top - panelHeight - 8;
  const top = belowTop + panelHeight + margin <= window.innerHeight
    ? belowTop
    : Math.max(margin, aboveTop);
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left));
  panel.style.setProperty("top", `${top}px`, "important");
  panel.style.setProperty("left", `${left}px`, "important");
}

function getEditorColorButtonValue(button) {
  const input = button?.querySelector?.(":scope > .cc98-rebuild-native-color-input")
    || getEditorColorPanels(button)[0]?.querySelector?.(".cc98-rebuild-color-popover-input");
  const preview = button?.querySelector?.(".sp-preview-inner, .sp-preview");
  return normalizeHexColor(input?.value || preview?.style?.backgroundColor || preview?.style?.color || "#ff0000");
}

function updateEditorColorButtonPreview(button, color) {
  const normalized = normalizeHexColor(color);
  const rgb = hexToRgb(normalized);
  getEditorColorPanels(button).forEach((panel) => {
    if (panel instanceof HTMLElement) {
      panel.dataset.cc98CurrentColor = normalized;
    }
  });
  [
    ...(button?.querySelectorAll?.(".cc98-rebuild-native-color-input") ?? []),
    ...getEditorColorPanels(button).flatMap((panel) => [...panel.querySelectorAll(".cc98-rebuild-color-popover-input")])
  ].forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.value = normalized;
    }
  });
  getEditorColorPanels(button).flatMap((panel) => [...panel.querySelectorAll("[data-cc98-color-channel]")]).forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.value = String(rgb[input.dataset.cc98ColorChannel] ?? 0);
    }
  });
  [
    ...(button?.querySelectorAll?.(".sp-preview-inner, .sp-preview") ?? []),
    ...getEditorColorPanels(button).flatMap((panel) => [...panel.querySelectorAll(".cc98-rebuild-color-popover-swatch")])
  ].forEach((node) => {
    if (node instanceof HTMLElement) {
      node.style.setProperty("background-color", normalized, "important");
    }
  });
  getEditorColorPanels(button).flatMap((panel) => [...panel.querySelectorAll(".cc98-rebuild-color-preset")]).forEach((preset) => {
    if (preset instanceof HTMLElement) {
      preset.classList.toggle("is-active", normalizeHexColor(preset.dataset.cc98ColorPreset) === normalized);
    }
  });
}

function getColorPopoverValue(panel, button) {
  return normalizeHexColor(
    panel?.dataset?.cc98CurrentColor
      || panel?.querySelector?.(".cc98-rebuild-color-popover-input")?.value
      || getEditorColorButtonValue(button)
  );
}

function getStoredEditorSelection(button, textarea) {
  const start = Number(button?.dataset?.cc98ColorSelectionStart);
  const end = Number(button?.dataset?.cc98ColorSelectionEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  const max = textarea.value.length;
  return {
    start: Math.max(0, Math.min(max, start)),
    end: Math.max(0, Math.min(max, end))
  };
}

function rememberEditorSelection(editor, button) {
  const textarea = getNativeEditorTextarea(editor);
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return;
  }
  button.dataset.cc98ColorSelectionStart = String(Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length);
  button.dataset.cc98ColorSelectionEnd = String(Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : textarea.selectionStart);
}

function applyEditorColor(editor, color, selection = null) {
  const textarea = getNativeEditorTextarea(editor);
  if (!(textarea instanceof HTMLTextAreaElement) || !/^#[0-9a-f]{6}$/i.test(color)) {
    return false;
  }
  const start = Number.isFinite(selection?.start)
    ? selection.start
    : (Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length);
  const end = Number.isFinite(selection?.end)
    ? selection.end
    : (Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start);
  const selected = textarea.value.slice(start, end);
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const wrapped = selected
    ? `[color=${color}]${selected}[/color]`
    : `[color=${color}][/color]`;
  textarea.value = `${before}${wrapped}${after}`;
  const caret = selected ? start + wrapped.length : start + `[color=${color}]`.length;
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(caret, caret);
  ["input", "change"].forEach((type) => {
    textarea.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  });
  scheduleNativeEditorStabilize(editor);
  return true;
}

function getEditorFontSizeSelect(button) {
  return button?.querySelector?.("select") || null;
}

function normalizeEditorFontSizeValue(value, fallback = "3") {
  const text = String(value ?? "").trim();
  return EDITOR_FONT_SIZE_VALUES.includes(text) ? text : fallback;
}

function getEditorFontSizeValue(button) {
  const select = getEditorFontSizeSelect(button);
  return normalizeEditorFontSizeValue(select?.value, "");
}

function getStoredEditorFontSizeSelection(button, textarea) {
  const start = Number(button?.dataset?.cc98FontSizeSelectionStart);
  const end = Number(button?.dataset?.cc98FontSizeSelectionEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  const max = textarea.value.length;
  return {
    start: Math.max(0, Math.min(max, start)),
    end: Math.max(0, Math.min(max, end))
  };
}

function rememberEditorFontSizeSelection(editor, button) {
  const textarea = getNativeEditorTextarea(editor);
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return;
  }
  button.dataset.cc98FontSizeSelectionStart = String(Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length);
  button.dataset.cc98FontSizeSelectionEnd = String(Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : textarea.selectionStart);
}

function applyEditorFontSize(editor, size, selection = null) {
  const normalized = normalizeEditorFontSizeValue(size, "");
  const textarea = getNativeEditorTextarea(editor);
  if (!(textarea instanceof HTMLTextAreaElement) || !normalized) {
    return false;
  }
  const start = Number.isFinite(selection?.start)
    ? selection.start
    : (Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length);
  const end = Number.isFinite(selection?.end)
    ? selection.end
    : (Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start);
  const selected = textarea.value.slice(start, end);
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const wrapped = selected
    ? `[size=${normalized}]${selected}[/size]`
    : `[size=${normalized}][/size]`;
  textarea.value = `${before}${wrapped}${after}`;
  const caret = selected ? start + wrapped.length : start + `[size=${normalized}]`.length;
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(caret, caret);
  ["input", "change"].forEach((type) => {
    textarea.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  });
  scheduleNativeEditorStabilize(editor);
  return true;
}

function ensureNativeColorInput(editor, button) {
  let input = button.querySelector(":scope > .cc98-rebuild-native-color-input");
  if (!(input instanceof HTMLInputElement)) {
    input = document.createElement("input");
    input.type = "hidden";
    input.className = "cc98-rebuild-native-color-input";
    input.value = getEditorColorButtonValue(button);
    input.title = "选择文字颜色";
    input.setAttribute("aria-label", "选择文字颜色");
    button.append(input);
  }
  if (input.type !== "hidden") {
    try {
      input.type = "hidden";
    } catch {
      input.style.setProperty("display", "none", "important");
    }
  }
  input.hidden = true;
  input.tabIndex = -1;
  input.style.setProperty("display", "none", "important");
  input.style.setProperty("pointer-events", "none", "important");
  input.onpointerdown = (event) => {
    stopEditorColorEvent(event);
    openEditorColorPicker(button, editor);
  };
  input.onclick = (event) => {
    stopEditorColorEvent(event);
    openEditorColorPicker(button, editor);
  };
  input.oninput = null;
  input.onchange = null;
  suppressLegacyEditorColorPickers(button);
  return input;
}

function closeEditorColorPopovers(exceptPanel = null) {
  suppressLegacyEditorColorPickers();
  document.querySelectorAll(".cc98-rebuild-color-popover").forEach((panel) => {
    if (panel === exceptPanel) {
      return;
    }
    panel.hidden = true;
    panel.__cc98ColorButton?.classList?.remove("cc98-rebuild-color-button-open");
    panel.closest(".ubb-button-color")?.classList.remove("cc98-rebuild-color-button-open");
  });
}

function closeEditorFontSizePopovers(exceptPanel = null) {
  document.querySelectorAll(".cc98-rebuild-font-size-popover").forEach((panel) => {
    if (panel === exceptPanel) {
      return;
    }
    panel.hidden = true;
    panel.__cc98FontSizeButton?.classList?.remove("cc98-rebuild-font-size-button-open");
  });
}

function updateEditorFontSizePreview(button, size) {
  const normalized = normalizeEditorFontSizeValue(size, "");
  const select = getEditorFontSizeSelect(button);
  if (select instanceof HTMLSelectElement && normalized) {
    select.value = normalized;
  }
  button?.querySelectorAll?.(".cc98-rebuild-font-size-trigger").forEach((trigger) => {
    if (trigger instanceof HTMLElement) {
      trigger.textContent = normalized || "字号";
    }
  });
  document.querySelectorAll(".cc98-rebuild-font-size-popover").forEach((panel) => {
    if (panel.__cc98FontSizeButton !== button) {
      return;
    }
    panel.querySelectorAll(".cc98-rebuild-font-size-option").forEach((option) => {
      if (option instanceof HTMLElement) {
        option.classList.toggle("is-active", option.dataset.cc98FontSizeValue === normalized);
      }
    });
  });
}

function ensureEditorFontSizePopover(editor, button) {
  if (!button.dataset.cc98FontSizePopoverId) {
    editorFontSizePopoverSequence += 1;
    button.dataset.cc98FontSizePopoverId = `cc98-rebuild-font-size-popover-${editorFontSizePopoverSequence}`;
  }
  let panel = document.getElementById(button.dataset.cc98FontSizePopoverId);
  if (panel instanceof HTMLElement && panel.querySelector(".cc98-rebuild-font-size-option")) {
    panel.__cc98Editor = editor;
    panel.__cc98FontSizeButton = button;
    return panel;
  }
  panel?.remove();
  panel = createElement("div", "cc98-rebuild-font-size-popover");
  panel.id = button.dataset.cc98FontSizePopoverId;
  panel.__cc98Editor = editor;
  panel.__cc98FontSizeButton = button;
  panel.hidden = true;
  panel.setAttribute("role", "menu");
  panel.setAttribute("aria-label", "\u5b57\u53f7");
  EDITOR_FONT_SIZE_VALUES.forEach((size) => {
    const option = createElement("button", "cc98-rebuild-font-size-option", size);
    option.type = "button";
    option.dataset.cc98FontSizeValue = size;
    option.setAttribute("role", "menuitem");
    option.addEventListener("click", () => {
      const textarea = getNativeEditorTextarea(editor);
      const selection = textarea instanceof HTMLTextAreaElement ? getStoredEditorFontSizeSelection(button, textarea) : null;
      updateEditorFontSizePreview(button, size);
      applyEditorFontSize(editor, size, selection);
      panel.hidden = true;
      button.classList.remove("cc98-rebuild-font-size-button-open");
    });
    panel.append(option);
  });
  ["pointerdown", "mousedown", "mouseup", "click"].forEach((type) => {
    panel.addEventListener(type, (event) => event.stopPropagation());
  });
  document.body.append(panel);
  updateEditorFontSizePreview(button, getEditorFontSizeValue(button));
  return panel;
}

function ensureEditorColorPopover(editor, button) {
  button.querySelectorAll(":scope > .cc98-rebuild-color-popover").forEach((oldPanel) => oldPanel.remove());
  if (!button.dataset.cc98ColorPopoverId) {
    editorColorPopoverSequence += 1;
    button.dataset.cc98ColorPopoverId = `cc98-rebuild-color-popover-${editorColorPopoverSequence}`;
  }
  let panel = document.getElementById(button.dataset.cc98ColorPopoverId);
  if (panel instanceof HTMLElement) {
    const existingInput = panel.querySelector(".cc98-rebuild-color-popover-input");
    if (
      panel.querySelector(".cc98-rebuild-color-popover-channels")
      && panel.querySelector(".cc98-rebuild-color-presets")
      && existingInput instanceof HTMLInputElement
      && existingInput.type !== "color"
    ) {
      panel.__cc98Editor = editor;
      panel.__cc98ColorButton = button;
      return panel;
    }
    panel.remove();
  }

  panel = createElement("div", "cc98-rebuild-color-popover");
  panel.id = button.dataset.cc98ColorPopoverId;
  panel.dataset.cc98EditorColorPanel = "true";
  panel.__cc98Editor = editor;
  panel.__cc98ColorButton = button;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "\u6587\u5b57\u989c\u8272");
  panel.hidden = true;
  const row = createElement("div", "cc98-rebuild-color-popover-row");
  const swatch = createElement("span", "cc98-rebuild-color-popover-swatch");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "cc98-rebuild-color-popover-input";
  input.value = getEditorColorButtonValue(button);
  input.maxLength = 7;
  input.spellcheck = false;
  input.inputMode = "text";
  input.setAttribute("aria-label", "color");
  row.append(swatch, input);

  const presets = createElement("div", "cc98-rebuild-color-presets");
  EDITOR_COLOR_PRESETS.forEach((color) => {
    const preset = document.createElement("button");
    preset.type = "button";
    preset.className = "cc98-rebuild-color-preset";
    preset.dataset.cc98ColorPreset = color;
    preset.title = color.toUpperCase();
    preset.setAttribute("aria-label", color.toUpperCase());
    preset.style.setProperty("--cc98-preset-color", color);
    preset.append(createElement("span", "cc98-rebuild-color-preset-swatch"));
    presets.append(preset);
  });

  const channels = createElement("div", "cc98-rebuild-color-popover-channels");
  ["r", "g", "b"].forEach((channel) => {
    const channelRow = createElement("label", "cc98-rebuild-color-channel");
    const label = createElement("span", "", channel.toUpperCase());
    const range = document.createElement("input");
    range.type = "range";
    range.min = "0";
    range.max = "255";
    range.dataset.cc98ColorChannel = channel;
    range.className = "cc98-rebuild-color-channel-range";
    const number = document.createElement("input");
    number.type = "number";
    number.min = "0";
    number.max = "255";
    number.dataset.cc98ColorChannel = channel;
    number.className = "cc98-rebuild-color-channel-number";
    channelRow.append(label, range, number);
    channels.append(channelRow);
  });

  const actions = createElement("div", "cc98-rebuild-color-popover-actions");
  const cancel = createElement("button", "cc98-rebuild-color-popover-cancel", "\u53d6\u6d88");
  const ok = createElement("button", "cc98-rebuild-color-popover-ok", "\u786e\u5b9a");
  cancel.type = "button";
  ok.type = "button";
  actions.append(cancel, ok);
  panel.append(row, presets, channels, actions);

  ["pointerdown", "mousedown", "mouseup", "click", "input", "change"].forEach((type) => {
    panel.addEventListener(type, (event) => {
      event.stopPropagation();
    });
  });
  const syncFromHex = () => {
    const normalized = normalizeHexColor(input.value, getColorPopoverValue(panel, button));
    updateEditorColorButtonPreview(button, normalized);
  };
  const syncFromChannels = (event) => {
    const source = event?.currentTarget;
    if (source instanceof HTMLInputElement && source.dataset.cc98ColorChannel) {
      const channel = source.dataset.cc98ColorChannel;
      const value = Math.max(0, Math.min(255, Number(source.value) || 0));
      source.value = String(value);
      panel.querySelectorAll(`[data-cc98-color-channel="${channel}"]`).forEach((control) => {
        if (control instanceof HTMLInputElement && control !== source) {
          control.value = String(value);
        }
      });
    }
    const values = {};
    ["r", "g", "b"].forEach((channel) => {
      const control = panel.querySelector(`.cc98-rebuild-color-channel-range[data-cc98-color-channel="${channel}"]`);
      values[channel] = control instanceof HTMLInputElement ? Number(control.value) : 0;
    });
    updateEditorColorButtonPreview(button, rgbToHex(values.r, values.g, values.b));
  };
  input.addEventListener("input", syncFromHex);
  presets.querySelectorAll(".cc98-rebuild-color-preset").forEach((preset) => {
    preset.addEventListener("click", () => {
      updateEditorColorButtonPreview(button, preset.dataset.cc98ColorPreset || "#ff0000");
    });
  });
  panel.querySelectorAll("[data-cc98-color-channel]").forEach((control) => {
    control.addEventListener("input", syncFromChannels);
    control.addEventListener("change", syncFromChannels);
  });
  cancel.addEventListener("click", () => {
    updateEditorColorButtonPreview(button, panel.dataset.cc98PreviousColor || getEditorColorButtonValue(button));
    panel.hidden = true;
    button.classList.remove("cc98-rebuild-color-button-open");
    suppressLegacyEditorColorPickers();
  });
  ok.addEventListener("click", () => {
    const textarea = getNativeEditorTextarea(editor);
    const selection = textarea instanceof HTMLTextAreaElement ? getStoredEditorSelection(button, textarea) : null;
    const color = getColorPopoverValue(panel, button);
    if (applyEditorColor(editor, color, selection)) {
      updateEditorColorButtonPreview(button, color);
    }
    panel.hidden = true;
    button.classList.remove("cc98-rebuild-color-button-open");
    suppressLegacyEditorColorPickers();
  });

  document.body.append(panel);
  updateEditorColorButtonPreview(button, input.value);
  return panel;
}

function stabilizeEditorColorButton(editor) {
  ensureLegacyColorPickerSuppressor();
  bindGlobalEditorColorInterceptor();
  suppressLegacyEditorColorPickers(editor);
  const colorButtons = new Set();
  editor.querySelectorAll(".ubb-button-color, .cc98-rebuild-color-button").forEach((button) => {
    if (button instanceof HTMLElement) {
      colorButtons.add(button);
    }
  });
  editor.querySelectorAll(".sp-replacer, .ubb-color-picker").forEach((node) => {
    const button = getEditorColorTriggerButton(node);
    if (button instanceof HTMLElement) {
      colorButtons.add(button);
    }
  });
  colorButtons.forEach((button) => {
    button.classList.add("cc98-rebuild-color-button");
    ensureNativeColorInput(editor, button);
    ensureEditorColorPopover(editor, button);
    const replacer = button.querySelector(".sp-replacer");
    if (replacer) {
      replacer.style.setProperty("pointer-events", "none", "important");
    }
    button.querySelectorAll("input[type='color']").forEach((input) => {
      if (input instanceof HTMLInputElement) {
        try {
          input.type = "hidden";
        } catch {
          input.style.setProperty("display", "none", "important");
        }
      }
    });
  });
}

function openEditorFontSizePicker(button, editor = button?.closest?.(".cc98-rebuild-native-editor")) {
  if (!(button instanceof HTMLElement) || !(editor instanceof HTMLElement)) {
    return false;
  }
  const panel = ensureEditorFontSizePopover(editor, button);
  rememberEditorFontSizeSelection(editor, button);
  updateEditorFontSizePreview(button, getEditorFontSizeValue(button));
  closeEditorFontSizePopovers(panel);
  panel.hidden = false;
  button.classList.add("cc98-rebuild-font-size-button-open");
  positionEditorFontSizePopover(button, panel);
  window.setTimeout(() => positionEditorFontSizePopover(button, panel), 0);
  return true;
}

function bindGlobalEditorFontSizeInterceptor() {
  if (editorFontSizeGlobalInterceptorBound) {
    return;
  }
  editorFontSizeGlobalInterceptorBound = true;
  const handleFontSizeEvent = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (getNativeEditorPassthroughControl(target)) {
      return;
    }
    if (target.closest(".cc98-rebuild-font-size-popover")) {
      return;
    }
    const button = target.closest(".ubb-button-fontSize, .cc98-rebuild-font-size-button");
    if (!button) {
      if (event.type === "pointerdown" || event.type === "mousedown") {
        closeEditorFontSizePopovers();
      }
      return;
    }
    const editor = button.closest(".cc98-rebuild-native-editor, .createTopic, #sendTopicInfo, .sendTopicInfo, .reply-input, .ubb-editor, form");
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openEditorFontSizePicker(button, editor);
  };
  ["pointerdown", "mousedown", "click"].forEach((type) => {
    document.addEventListener(type, handleFontSizeEvent, true);
  });
  ["scroll", "resize"].forEach((type) => {
    window.addEventListener(type, () => {
      document.querySelectorAll(".cc98-rebuild-font-size-popover:not([hidden])").forEach((panel) => {
        if (panel instanceof HTMLElement) {
          positionEditorFontSizePopover(panel.__cc98FontSizeButton, panel);
        }
      });
    }, true);
  });
}

function stabilizeEditorFontSizeButton(editor) {
  bindGlobalEditorFontSizeInterceptor();
  editor.querySelectorAll(".ubb-button-fontSize").forEach((button) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }
    button.classList.add("cc98-rebuild-font-size-button");
    const select = getEditorFontSizeSelect(button);
    if (select instanceof HTMLSelectElement) {
      select.tabIndex = -1;
      select.setAttribute("aria-hidden", "true");
      select.style.setProperty("display", "none", "important");
    }
    let trigger = button.querySelector(":scope > .cc98-rebuild-font-size-trigger");
    if (!(trigger instanceof HTMLButtonElement)) {
      trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "cc98-rebuild-font-size-trigger";
      trigger.setAttribute("aria-label", "\u5b57\u53f7");
      button.append(trigger);
    }
    trigger.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEditorFontSizePicker(button, editor);
    };
    trigger.onpointerdown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      rememberEditorFontSizeSelection(editor, button);
    };
    ensureEditorFontSizePopover(editor, button);
    updateEditorFontSizePreview(button, getEditorFontSizeValue(button));
  });
}

function stabilizeEditorEmojiImages(editor) {
  stabilizeEmojiRendering(editor);
}

function isEditorEmojiButtonTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  const control = target.closest(".ubb-emoji-button, .ubb-button");
  if (!(control instanceof HTMLElement)) {
    return false;
  }
  const signature = [
    control.className,
    control.getAttribute("title"),
    control.getAttribute("aria-label"),
    control.dataset.cc98ToolbarLabel,
    control.textContent
  ].filter(Boolean).join(" ");
  return /(?:表情|emoji|emoticon|smile|fa-smile|fa-meh|☺)/i.test(signature);
}

function setEditorEmojiPanelOpen(editor, open) {
  if (!(editor instanceof HTMLElement)) {
    return;
  }
  editor.classList.toggle("cc98-rebuild-emoji-panel-open", Boolean(open));
}

function closeEditorEmojiPanelSoon(editor) {
  if (!(editor instanceof HTMLElement)) {
    return;
  }
  window.setTimeout(() => {
    setEditorEmojiPanelOpen(editor, false);
  }, 90);
}

function dispatchMouseSequence(target) {
  ["pointerdown", "mousedown", "mouseup", "click"].forEach((type) => {
    const EventClass = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    target.dispatchEvent(new EventClass(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    }));
  });
}

function openEditorColorPicker(colorButton, editor = colorButton?.closest?.(".cc98-rebuild-native-editor")) {
  if (!(colorButton instanceof HTMLElement)) {
    return false;
  }
  if (!(editor instanceof HTMLElement)) {
    return false;
  }
  const panel = ensureEditorColorPopover(editor, colorButton);
  const previousColor = getEditorColorButtonValue(colorButton);
  panel.dataset.cc98PreviousColor = previousColor;
  updateEditorColorButtonPreview(colorButton, previousColor);
  rememberEditorSelection(editor, colorButton);
  suppressLegacyEditorColorPickers(editor);
  closeEditorColorPopovers(panel);
  panel.hidden = false;
  colorButton.classList.add("cc98-rebuild-color-button-open");
  positionEditorColorPopover(colorButton, panel);
  window.setTimeout(() => {
    suppressLegacyEditorColorPickers(editor);
    positionEditorColorPopover(colorButton, panel);
    panel.querySelector(".cc98-rebuild-color-popover-input")?.focus?.({ preventScroll: true });
  }, 0);
  return true;
}

function bindGlobalEditorColorInterceptor() {
  if (editorColorGlobalInterceptorBound) {
    return;
  }
  editorColorGlobalInterceptorBound = true;
  const handleColorEvent = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (getNativeEditorPassthroughControl(target)) {
      return;
    }
    ensureLegacyColorPickerKillStyle();
    const panel = target.closest(".cc98-rebuild-color-popover");
    if (panel) {
      return;
    }
    const colorButton = getEditorColorTriggerButton(target);
    if (!colorButton) {
      if (event.type === "pointerdown" || event.type === "mousedown") {
        closeEditorColorPopovers();
      }
      return;
    }
    const editor = findEditorForColorButton(colorButton);
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    stopEditorColorEvent(event);
    suppressLegacyEditorColorPickers(editor);
    openEditorColorPicker(colorButton, editor);
  };
  ["pointerdown", "touchstart", "mousedown", "mouseup", "click"].forEach((type) => {
    document.addEventListener(type, handleColorEvent, true);
  });
  ["scroll", "resize"].forEach((type) => {
    window.addEventListener(type, () => {
      suppressLegacyEditorColorPickers();
      document.querySelectorAll(".cc98-rebuild-color-popover:not([hidden])").forEach((panel) => {
        if (panel instanceof HTMLElement) {
          positionEditorColorPopover(panel.__cc98ColorButton, panel);
        }
      });
    }, true);
  });
}

function getExplicitTextColor(node) {
  if (!(node instanceof HTMLElement)) {
    return "";
  }
  if (node.style?.color) {
    return node.style.color.trim();
  }
  const colorAttribute = node.getAttribute("color");
  if (colorAttribute) {
    return colorAttribute.trim();
  }
  const styleAttribute = node.getAttribute("style") || "";
  const match = styleAttribute.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  return match?.[1]?.trim() || "";
}

function hasInlineUbbFormatting(text) {
  return /\[(?:\/?)(?:b|i|u|s|del|color|size|align)(?:=[^\]]+)?\]/i.test(String(text ?? ""));
}

function buildNativeEditorUbbPreview(source) {
  const article = document.createElement("article");
  article.className = "cc98-rebuild-ubb-preview-rendered";
  String(source ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .forEach((block) => {
      const paragraph = createElement("p", "cc98-rebuild-text-line");
      block.split(/\n/).forEach((line, index) => {
        if (index > 0) {
          paragraph.append(document.createElement("br"));
        }
        appendInlineUbbText(paragraph, line);
      });
      article.append(paragraph);
    });
  return article;
}

function getEditorSourceText(editor) {
  const textarea = getNativeEditorTextarea(editor);
  return textarea?.value || "";
}

function stabilizeEditorPreviewFormatting(editor) {
  const previewSelectors = [
    ".editor-preview",
    ".for-preview",
    ".markdown-preview",
    ".preview",
    ".mde-preview-content",
    ".ubb-preview"
  ].join(",");
  const sourceText = getEditorSourceText(editor);
  const shouldRenderUbbPreview = hasInlineUbbFormatting(sourceText);
  const sourceHash = shouldRenderUbbPreview ? String(sourceText.length) + ":" + sourceText.slice(0, 96) + ":" + sourceText.slice(-96) : "";
  editor.querySelectorAll(previewSelectors).forEach((preview) => {
    if (shouldRenderUbbPreview && preview instanceof HTMLElement && preview.dataset.cc98UbbPreviewSource !== sourceHash) {
      preview.dataset.cc98UbbPreviewSource = sourceHash;
      preview.replaceChildren(buildNativeEditorUbbPreview(sourceText));
    }
    const spreadClass = (node, className) => {
      node.classList.add(className);
      node.querySelectorAll("*").forEach((child) => child.classList?.add(className));
    };
    const spreadVariable = (node, className, variableName, value) => {
      node.classList.add(className);
      node.style.setProperty(variableName, value);
      node.querySelectorAll("*").forEach((child) => {
        if (!(child instanceof HTMLElement)) {
          return;
        }
        child.classList.add(className);
        child.style.setProperty(variableName, value);
      });
    };
    preview.querySelectorAll("*").forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const color = getExplicitTextColor(node);
      if (color) {
        spreadVariable(node, "cc98-rebuild-preview-colored", "--cc98-preview-color", color);
      }
      const tagName = node.tagName.toLowerCase();
      const styleText = node.getAttribute("style") || "";
      const textDecoration = `${node.style.textDecoration} ${node.style.textDecorationLine} ${styleText}`;
      if (tagName === "u" || /underline/i.test(textDecoration)) {
        spreadClass(node, "cc98-rebuild-preview-underline");
      }
      if (tagName === "s" || tagName === "del" || tagName === "strike" || /line-through|text-decoration\s*:\s*.*(?:del|through)/i.test(textDecoration)) {
        spreadClass(node, "cc98-rebuild-preview-strike");
      }
      if (tagName === "b" || tagName === "strong" || /font-weight\s*:\s*(?:bold|[6-9]00)/i.test(styleText)) {
        spreadClass(node, "cc98-rebuild-preview-bold");
      }
      if (tagName === "i" || tagName === "em" || /font-style\s*:\s*italic/i.test(styleText)) {
        spreadClass(node, "cc98-rebuild-preview-italic");
      }
      const textAlign = node.style.textAlign || styleText.match(/text-align\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
      if (/^(left|center|right)$/i.test(textAlign)) {
        spreadVariable(node, "cc98-rebuild-preview-align", "--cc98-preview-align", textAlign.toLowerCase());
      }
      const fontSize = node.style.fontSize || node.getAttribute("size") || "";
      if (fontSize) {
        const normalizedSize = /^\d+$/.test(fontSize)
          ? `${0.72 + Math.min(7, Math.max(1, Number(fontSize))) * 0.14}em`
          : fontSize;
        spreadVariable(node, "cc98-rebuild-preview-size", "--cc98-preview-size", normalizedSize);
      }
    });
  });
}

function stabilizeNativeEditor(editor) {
  if (!editor) {
    return;
  }
  editor.classList.add("cc98-rebuild-native-editor");
  labelEditorToolbarButtons(editor);
  labelEditorToolbarButtonsWithUnicode(editor);
  hideMarkdownEditorEntrances(editor);
  stabilizeEditorFontSizeButton(editor);
  stabilizeEditorColorButton(editor);
  stabilizeEditorEmojiImages(editor);
  stabilizeEditorPreviewFormatting(editor);
  editor.querySelectorAll(".ubb-editor, .markdown-editor, .for-container, .for-editor, .for-toolbar, .for-preview, .editor-preview, .CodeMirror, textarea")
    .forEach((node) => node.classList.add("cc98-rebuild-editor-surface"));
}

function scheduleNativeEditorStabilize(editor) {
  [60, 220, 620].forEach((delay) => {
    setTimeout(() => stabilizeNativeEditor(editor), delay);
  });
}

function schedulePostSubmitPageRefresh() {
  nativePostSubmitRefreshTimers.forEach((timer) => window.clearTimeout(timer));
  nativePostSubmitRefreshTimers = [3200, 5200, 8200].map((delay) => {
    return window.setTimeout(() => {
      location.reload();
    }, delay);
  });
}

function bindNativeEditorStabilizer(editor) {
  if (!editor) {
    return;
  }
  stabilizeNativeEditor(editor);
  if (nativeEditorStabilizers.has(editor)) {
    return;
  }
  nativeEditorStabilizers.add(editor);
  editor.addEventListener("pointerdown", (event) => {
    if (isEditorEmojiButtonTarget(event.target)) {
      return;
    }
    if (!event.target?.closest?.(".ubb-emoji")) {
      setEditorEmojiPanelOpen(editor, false);
    }
    if (getNativeEditorPassthroughControl(event.target)) {
      return;
    }
    const colorButton = getEditorColorTriggerButton(event.target);
    const fontSizeButton = event.target?.closest?.(".ubb-button-fontSize, .cc98-rebuild-font-size-button");
    if (!colorButton && !event.target?.closest?.(".cc98-rebuild-color-popover")) {
      closeEditorColorPopovers();
    }
    if (!fontSizeButton && !event.target?.closest?.(".cc98-rebuild-font-size-popover")) {
      closeEditorFontSizePopovers();
    }
    if (!colorButton || event.target?.closest?.(".cc98-rebuild-color-popover, .sp-container, .sp-picker-container")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openEditorColorPicker(colorButton, editor);
  }, true);
  editor.addEventListener("click", (event) => {
    if (event.target?.closest?.("#post-topic-button")) {
      schedulePostSubmitPageRefresh();
    }
    if (event.target?.closest?.(".ubb-emoji img")) {
      closeEditorEmojiPanelSoon(editor);
      return;
    }
    if (event.target?.closest?.(".ubb-emoji")) {
      return;
    }
    if (isEditorEmojiButtonTarget(event.target)) {
      const shouldOpen = !editor.classList.contains("cc98-rebuild-emoji-panel-open");
      setEditorEmojiPanelOpen(editor, shouldOpen);
      scheduleNativeEditorStabilize(editor);
      return;
    }
    if (!event.target?.closest?.(".ubb-emoji")) {
      setEditorEmojiPanelOpen(editor, false);
    }
    if (getNativeEditorPassthroughControl(event.target)) {
      scheduleNativeEditorStabilize(editor);
      return;
    }
    const colorButton = getEditorColorTriggerButton(event.target);
    if (colorButton && !event.target?.closest?.(".cc98-rebuild-color-popover, .sp-container, .sp-picker-container")) {
      if (openEditorColorPicker(colorButton, editor)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    window.setTimeout(() => stabilizeNativeEditor(editor), 40);
    const control = event.target?.closest?.(".changeEditor, #post-topic-changeMode, [title*='Preview'], .fa-window-maximize");
    if (control) {
      scheduleNativeEditorStabilize(editor);
    }
  }, true);
  editor.addEventListener("submit", () => {
    schedulePostSubmitPageRefresh();
  }, true);
  const editorObserver = new MutationObserver(() => scheduleNativeEditorStabilize(editor));
  editorObserver.observe(editor, {
    childList: true,
    subtree: true
  });
}

function renderEditorPage(app) {
  const data = getEditorPageData();
  const hero = createElement("section", "cc98-rebuild-editor-hero");
  hero.append(createElement("p", "cc98-rebuild-kicker", "Compose"));
  hero.append(createElement("h1", "", "发表主题"));
  const meta = createElement("div", "cc98-rebuild-editor-meta");
  if (data.board?.href) {
    meta.append(createLink("cc98-rebuild-chip", data.board.text, data.board.href));
  }
  meta.append(createElement("span", "cc98-rebuild-muted", data.titlePlaceholder));
  hero.append(meta);
  hero.querySelector("h1")?.remove();
  app.append(hero);

  if (!data.editor) {
    const fallback = createElement("section", "cc98-rebuild-section");
    fallback.append(createElement("h2", "", "正在等待编辑器"));
    fallback.append(createElement("p", "cc98-rebuild-card-meta", "原页面编辑器还没有加载完成，稍后会自动更新。"));
    app.append(fallback);
    return;
  }

  rememberReparentedNativeNode(data.editor);
  bindNativeEditorStabilizer(data.editor);
  app.append(data.editor);
}

function renderPostReplyEditor(app) {
  const reply = document.querySelector("#sendTopicInfo");
  if (!reply || reply.closest("#cc98-comfort-app")) {
    return;
  }
  rememberReparentedNativeNode(reply);
  reply.classList.add("cc98-rebuild-native-reply");
  bindNativeEditorStabilizer(reply);

  const panel = createElement("section", "cc98-rebuild-reply-panel");
  const header = createElement("div", "cc98-rebuild-reply-panel-header");
  header.append(createElement("h2", "", "回复"));
  panel.append(header, reply);
  app.append(panel);
}

function renderMessagePage(app) {
  const source = document.querySelector(".message-root") || document.querySelector(".message");
  const title = getFirstText(document, ".message-message-wTitle")
    || getFirstText(document, ".message-title")
    || document.title.replace(/-?CC98论坛/i, "").trim()
    || "消息";

  const hero = createElement("section", "cc98-rebuild-message-hero");
  const heroTop = createElement("div", "cc98-rebuild-message-hero-top");
  heroTop.append(createElement("p", "cc98-rebuild-kicker", "Messages"));
  hero.append(heroTop);
  hero.append(createElement("h1", "", title));
  const heroTitle = hero.querySelector("h1");
  app.append(hero);

  if (!source) {
    const fallback = createElement("section", "cc98-rebuild-empty-state");
    fallback.append(createElement("h2", "", "消息页面还没有加载完成"));
    fallback.append(createElement("p", "", "稍后会自动更新，也可以点击刷新。"));
    app.append(fallback);
    return;
  }

  rememberReparentedNativeNode(source);
  source.classList.add("cc98-rebuild-native-message");
  app.append(source);
  bindMessageTitleSync(source, heroTitle, heroTop);
}

function getMessagePageTitle(root = document) {
  return getFirstText(root, ".message-message-wTitle")
    || getFirstText(root, ".message-title")
    || document.title.replace(/-?\s*CC98.*$/i, "").trim()
    || "\u6d88\u606f";
}

function syncMessageReadAllProxy(source, heroTop) {
  if (!(source instanceof HTMLElement) || !(heroTop instanceof HTMLElement)) {
    return;
  }
  const originalWrap = source.querySelector(".readAllMessage");
  const originalControl = originalWrap?.querySelector?.("button, a, [role='button']") || originalWrap;
  let proxy = heroTop.querySelector(".cc98-rebuild-message-read-all-proxy");
  if (!(originalControl instanceof HTMLElement)) {
    proxy?.remove();
    return;
  }
  originalWrap.classList.add("cc98-rebuild-message-read-all-source");
  if (!(proxy instanceof HTMLButtonElement)) {
    proxy = createButton("cc98-rebuild-message-read-all-proxy", "\u5168\u90e8\u6807\u4e3a\u5df2\u8bfb", (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const sourceButton = source.querySelector(".readAllMessage button, .readAllMessage a, .readAllMessage [role='button']") || source.querySelector(".readAllMessage");
      if (sourceButton instanceof HTMLElement) {
        triggerOriginalControl(sourceButton);
      }
    });
    heroTop.append(proxy);
  }
  const label = cleanupPostText(originalControl.textContent || originalWrap.textContent) || "\u5168\u90e8\u6807\u4e3a\u5df2\u8bfb";
  proxy.textContent = label;
  proxy.disabled = Boolean(originalControl.matches?.(":disabled, [disabled], [aria-disabled='true']"));
}

function stabilizeNativeMessageSurfaces(source) {
  if (!(source instanceof HTMLElement)) {
    return;
  }
  const cleanSelectors = [
    ".message",
    ".message-content",
    ".message-right",
    ".message-response",
    ".message-system",
    ".message-setting",
    ".message-message",
    ".message-message-people",
    ".message-message-window",
    ".message-message-pList",
    ".message-response-box-middle",
    ".message-response-box-middle1",
    ".message-response-box-middle-title",
    ".message-response-box-middle-content",
    ".message-box-content",
    ".message-system-box-content",
    ".message-message-pInfo",
    ".message-message-pMessage",
    ".message-message-wContent",
    ".message-message-wcContent"
  ].join(",");
  source.querySelectorAll(cleanSelectors).forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.classList.add("cc98-rebuild-message-surface-clean");
    const styleText = node.getAttribute("style") || "";
    if (/background(?:-color)?\s*:\s*(?:white|#fff(?:fff)?|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/i.test(styleText)) {
      node.style.setProperty("background", "transparent", "important");
      node.style.setProperty("background-color", "transparent", "important");
      node.style.setProperty("background-image", "none", "important");
    }
  });
}

function bindMessageTitleSync(source, heroTitle, heroTop) {
  messageTitleObserver?.disconnect();
  messageTitleObserver = null;
  if (!source || !heroTitle) {
    return;
  }

  const syncTitle = () => {
    const title = getMessagePageTitle(source);
    if (title && heroTitle.textContent !== title) {
      heroTitle.textContent = title;
    }
  };

  let titleSyncTimer = null;
  const scheduleTitleSync = (delay = 80) => {
    window.clearTimeout(titleSyncTimer);
    titleSyncTimer = window.setTimeout(() => {
      syncTitle();
      syncMessageReadAllProxy(source, heroTop);
      stabilizeNativeMessageSurfaces(source);
    }, delay);
  };

  source.addEventListener("click", (event) => {
    const person = event.target?.closest?.(".message-message-person");
    if (!person || !source.contains(person)) {
      return;
    }
    const name = getFirstText(person, ".message-message-pName");
    if (name) {
      heroTitle.textContent = `\u4e0e ${name} \u7684\u79c1\u4fe1`;
    }
    scheduleTitleSync(180);
    window.setTimeout(syncTitle, 650);
  }, true);

  messageTitleObserver = new MutationObserver(() => scheduleTitleSync());
  messageTitleObserver.observe(source, { childList: true, subtree: true, characterData: true });
  syncTitle();
  syncMessageReadAllProxy(source, heroTop);
  stabilizeNativeMessageSurfaces(source);
}

function renderSignInPage(app) {
  const source = document.querySelector(".sign-in");
  const hero = createElement("section", "cc98-rebuild-signin-hero");
  hero.append(createElement("p", "cc98-rebuild-kicker", "Check In"));
  hero.append(createElement("h1", "", "论坛签到"));
  app.append(hero);

  if (!source) {
    const fallback = createElement("section", "cc98-rebuild-empty-state");
    fallback.append(createElement("h2", "", "签到页面还没有加载完成"));
    fallback.append(createElement("p", "", "稍后会自动更新，也可以点击刷新。"));
    app.append(fallback);
    return;
  }

  rememberReparentedNativeNode(source);
  source.classList.add("cc98-rebuild-native-signin", "cc98-rebuild-native-editor");
  bindNativeEditorStabilizer(source);
  app.append(source);
}

function renderLoginPage(app) {
  const login = document.querySelector(".login");

  if (!login) {
    const fallback = createElement("section", "cc98-rebuild-empty-state");
    fallback.append(createElement("h2", "", "登录页还没有加载完成"));
    fallback.append(createElement("p", "", "稍后会自动刷新重建，也可以点击顶部刷新。"));
    app.append(fallback);
    return;
  }

  const layout = createElement("section", "cc98-rebuild-login-layout");
  layout.append(createElement("h1", "cc98-rebuild-login-title", "登录到 CC98"));
  if (login instanceof HTMLElement) {
    rememberReparentedNativeNode(login);
    login.classList.add("cc98-rebuild-native-login");
    login.querySelectorAll("img").forEach((image) => image.remove());
    bindLoginRedirect(login);
    layout.append(login);
  }
  app.append(layout);
}

function hasFreshCc98LoginSession() {
  try {
    const expiration = Number.parseInt(localStorage.getItem("refresh_token_expirationTime") || "", 10);
    return Number.isFinite(expiration) && expiration * 1000 > Date.now();
  } catch {
    return false;
  }
}

function redirectToCc98Home() {
  if (location.href === "https://www.cc98.org/") {
    return;
  }
  location.assign("https://www.cc98.org/");
}

function isCc98LoginPath() {
  try {
    return new URL(location.href).pathname.replace(/\/+$/, "").toLowerCase() === "/logon";
  } catch {
    return /\/logOn\/?$/i.test(location.href);
  }
}

function redirectToCc98Login() {
  if (location.hostname === "www.cc98.org" && isCc98LoginPath()) {
    return;
  }
  location.assign("https://www.cc98.org/logOn");
}

function markLogoutRedirectIntent() {
  try {
    sessionStorage.setItem(LOGOUT_REDIRECT_MARK_KEY, String(Date.now()));
  } catch {
    // Session storage may be unavailable; timed redirects below still run.
  }
}

function hasRecentLogoutRedirectIntent() {
  try {
    const markedAt = Number.parseInt(sessionStorage.getItem(LOGOUT_REDIRECT_MARK_KEY) || "", 10);
    return Number.isFinite(markedAt) && Date.now() - markedAt <= 12000;
  } catch {
    return false;
  }
}

function clearLikelyCc98LoginState() {
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && /token|expirationtime|userinfo|currentuser|login/i.test(key)) {
        keys.push(key);
      }
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Native logout is still allowed to continue.
  }
}

function enforceRecentLogoutRedirectIntent() {
  if (hasRecentLogoutRedirectIntent() && !isCc98LoginPath()) {
    window.setTimeout(redirectToCc98Login, 0);
  }
}

function scheduleLogoutRedirect() {
  markLogoutRedirectIntent();
  window.setTimeout(clearLikelyCc98LoginState, 80);
  [650, 1500, 3000, 5200].forEach((delay) => {
    window.setTimeout(redirectToCc98Login, delay);
  });
}

function clearLoginRedirectWatcher() {
  if (loginRedirectWatcherTimer) {
    window.clearInterval(loginRedirectWatcherTimer);
    loginRedirectWatcherTimer = null;
  }
}

function startLoginRedirectWatcher() {
  if (hasFreshCc98LoginSession()) {
    redirectToCc98Home();
    return;
  }
  const startedAt = Date.now();
  try {
    sessionStorage.setItem(LOGIN_REDIRECT_MARK_KEY, String(startedAt));
  } catch {
    // Session storage can be unavailable in restricted contexts; polling still works.
  }
  clearLoginRedirectWatcher();
  loginRedirectWatcherTimer = window.setInterval(() => {
    const markedAt = (() => {
      try {
        return Number.parseInt(sessionStorage.getItem(LOGIN_REDIRECT_MARK_KEY) || "", 10);
      } catch {
        return startedAt;
      }
    })();
    const effectiveStart = Number.isFinite(markedAt) ? markedAt : startedAt;
    if (Date.now() - effectiveStart > 30000) {
      clearLoginRedirectWatcher();
      try {
        sessionStorage.removeItem(LOGIN_REDIRECT_MARK_KEY);
      } catch {
        // Ignore storage cleanup failures.
      }
      return;
    }
    if (hasFreshCc98LoginSession()) {
      clearLoginRedirectWatcher();
      try {
        sessionStorage.removeItem(LOGIN_REDIRECT_MARK_KEY);
      } catch {
        // Ignore storage cleanup failures.
      }
      redirectToCc98Home();
    }
  }, 250);
}

function bindLoginRedirect(login) {
  if (!(login instanceof HTMLElement) || login.dataset.cc98LoginRedirectBound === "true") {
    return;
  }
  login.dataset.cc98LoginRedirectBound = "true";
  const form = login.querySelector("form");
  const submitButton = login.querySelector("button[type='submit']");
  const armRedirect = () => {
    window.setTimeout(startLoginRedirectWatcher, 0);
  };
  form?.addEventListener("submit", armRedirect, true);
  submitButton?.addEventListener("click", armRedirect, true);

  try {
    const markedAt = Number.parseInt(sessionStorage.getItem(LOGIN_REDIRECT_MARK_KEY) || "", 10);
    if (Number.isFinite(markedAt) && Date.now() - markedAt <= 30000) {
      startLoginRedirectWatcher();
    }
  } catch {
    // No-op.
  }
}

function getUserCenterActiveTitle() {
  return document.querySelector(".user-center-navigation-active .center-nav-item, [aria-current='page'] .center-nav-item")?.textContent?.trim()
    || getFirstText(document, ".user-theme-info h2, .user-center-head p, .user-center-router h2")
    || "个人中心";
}

function updateUserCenterHero(app = document.querySelector("#cc98-comfort-app")) {
  const title = app?.querySelector(".cc98-rebuild-user-hero h1");
  if (title) {
    title.textContent = getUserCenterActiveTitle();
  }
}

function getAvatarConfigBlock(node) {
  return node?.closest?.(".user-center-config-avatar") ?? null;
}

function activateAvatarCrop(input) {
  const block = getAvatarConfigBlock(input);
  if (block) {
    block.classList.add("cc98-avatar-crop-active");
  }
}

function deactivateAvatarCrop(control) {
  const block = getAvatarConfigBlock(control);
  if (block) {
    block.classList.remove("cc98-avatar-crop-active");
  }
}

function stabilizeUserCenterFavoriteActions(router) {
  router.querySelectorAll(".ant-dropdown-link.ant-dropdown-trigger").forEach((link) => {
    const isFavoriteAction = Boolean(
      link.closest(".user-center-myfavorites, .user-center-myfavorite, .user-favorites, .user-post-content")
      || link.querySelector(".anticon-unordered-list")
    );
    if (!isFavoriteAction) {
      return;
    }
    const wrapper = link.parentElement;
    if (!wrapper || !router.contains(wrapper)) {
      return;
    }
    wrapper.classList.add("cc98-rebuild-favorite-action-offset");
    wrapper.style.setProperty("transform", "translate(700px, 0px)", "important");
    wrapper.style.setProperty("white-space", "nowrap", "important");
    wrapper.style.setProperty("margin", "0", "important");
  });
}

function stabilizeUserCenterSearchButtons(router) {
  router.querySelectorAll(".ant-input-search-button").forEach((button) => {
    const nestedButton = button.querySelector(":scope button");
    if (!nestedButton) {
      return;
    }
    const text = nestedButton.textContent?.replace(/\s+/g, "") || button.textContent?.replace(/\s+/g, "") || "搜索";
    button.classList.add("cc98-rebuild-flat-search-button");
    button.textContent = "";
    const label = createElement("span", "", text);
    button.append(label);
    button.style.removeProperty("width");
  });
}

function stabilizeUserProfileBadges(router, avatar) {
  const badge = router.querySelector(".user-badge");
  if (!(badge instanceof HTMLElement)) {
    return;
  }

  badge.classList.add("cc98-rebuild-profile-badge-panel");
  badge.setAttribute("aria-label", "\u7528\u6237\u5934\u8854");
  [...badge.children].forEach((item) => {
    if (!(item instanceof HTMLElement)) {
      return;
    }
    item.classList.add("cc98-rebuild-profile-badge-item");
    const ownColor = item.style.color;
    if (ownColor) {
      item.style.setProperty("color", ownColor, "important");
      item.classList.add("cc98-rebuild-profile-badge-item-colored");
    }
    item.querySelectorAll("[style]").forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const color = node.style.color;
      if (color) {
        node.style.setProperty("color", color, "important");
        item.classList.add("cc98-rebuild-profile-badge-item-colored");
      }
    });
  });

  if (avatar instanceof HTMLElement) {
    const messageAction = avatar.querySelector(".cc98-rebuild-profile-message-action");
    if (badge.parentElement !== avatar) {
      avatar.insertBefore(badge, messageAction?.parentElement === avatar ? messageAction : null);
    }
    const avatarImage = avatar.querySelector(".user-avatar-img, img");
    const syncBadgeHeight = () => {
      const rect = avatarImage instanceof HTMLElement ? avatarImage.getBoundingClientRect() : null;
      if (rect && rect.height >= 96) {
        badge.style.setProperty("--cc98-profile-avatar-height", `${Math.round(rect.height)}px`);
      }
    };
    syncBadgeHeight();
    requestAnimationFrame(syncBadgeHeight);
    if (avatarImage instanceof HTMLImageElement && badge.dataset.cc98BadgeImageBound !== "true") {
      badge.dataset.cc98BadgeImageBound = "true";
      avatarImage.addEventListener("load", syncBadgeHeight);
    }
  }
}

function stabilizeUserProfileStats(router) {
  const stabilizeProfileHeader = () => {
    const profile = router.querySelector(".user-profile");
    const avatar = router.querySelector(".user-center-exact > .user-avatar, .user-avatar");
    const userId = profile?.querySelector("#userId");
    if (!(profile instanceof HTMLElement) || !(avatar instanceof HTMLElement) || !(userId instanceof HTMLElement)) {
      return;
    }

    avatar.classList.add("cc98-rebuild-profile-hero");
    profile.classList.add("cc98-rebuild-profile-info");
    userId.classList.add("cc98-rebuild-profile-user-id");

    const messageLink = [...userId.querySelectorAll("a")]
      .find((link) => cleanupPostText(link.textContent) === "\u79c1\u4fe1");
    if (messageLink instanceof HTMLElement) {
      messageLink.classList.add("cc98-rebuild-profile-message-action");
      messageLink.querySelector("button")?.classList.add("cc98-rebuild-profile-message-button");
      if (messageLink.parentElement !== avatar) {
        avatar.append(messageLink);
      }
    }
    stabilizeUserProfileBadges(router, avatar);
  };

  stabilizeProfileHeader();

  const normalizeStatItem = (item) => {
    if (!(item instanceof HTMLElement)) {
      return;
    }
    item.classList.add("cc98-rebuild-profile-stat-card");
    const label = item.querySelector(":scope > .user-profile-info, :scope > .ant-tag-has-color");
    const labelText = cleanupPostText(label?.textContent);
    if (label instanceof HTMLElement) {
      label.classList.add("cc98-rebuild-profile-stat-label");
    }
    const isRegisterTime = labelText === "\u6ce8\u518c\u65f6\u95f4";
    const isLastLogin = labelText === "\u6700\u540e\u767b\u5f55";
    item.classList.toggle("cc98-rebuild-profile-stat-long", isRegisterTime || isLastLogin);
    item.classList.toggle("cc98-rebuild-profile-stat-register-time", isRegisterTime);
    item.classList.toggle("cc98-rebuild-profile-stat-last-login", isLastLogin);
    let value = item.querySelector(":scope > .cc98-rebuild-profile-stat-value");
    if (!(value instanceof HTMLElement)) {
      value = createElement("span", "cc98-rebuild-profile-stat-value");
      item.append(value);
    }
    [...item.childNodes].forEach((node) => {
      if (node === label || node === value) {
        return;
      }
      if (node.nodeType === Node.TEXT_NODE && !cleanupPostText(node.nodeValue)) {
        node.remove();
        return;
      }
      value.append(node);
    });
  };

  router.querySelectorAll(".user-profile #userGenderAndBirthday").forEach((grid) => {
    if (!(grid instanceof HTMLElement)) {
      return;
    }
    grid.classList.add("cc98-rebuild-profile-stat-grid");
    [...grid.children].forEach((item) => {
      if (item instanceof HTMLElement && item.matches("p, .row")) {
        normalizeStatItem(item);
      }
    });
    grid.classList.toggle(
      "cc98-rebuild-profile-stat-grid-has-long",
      Boolean(grid.querySelector(".cc98-rebuild-profile-stat-long"))
    );
  });

  router.querySelectorAll(".user-profile .row").forEach((row) => {
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const label = row.querySelector(".ant-tag-has-color");
    const value = row.querySelector(".board-head-information");
    if (!(label instanceof HTMLElement) || !(value instanceof HTMLElement)) {
      return;
    }
    const labelText = cleanupPostText(label.textContent);
    if (!labelText) {
      return;
    }
    row.classList.add("cc98-rebuild-profile-like-stat");
    label.classList.add("cc98-rebuild-profile-stat-label");
    value.classList.add("cc98-rebuild-profile-stat-value");
    row.style.setProperty("margin", "0", "important");
    row.style.setProperty("margin-right", "0", "important");
    const grid = row.closest(".user-profile")?.querySelector("#userGenderAndBirthday");
    if (!(grid instanceof HTMLElement) || row.parentElement === grid) {
      return;
    }
    const postCountItem = [...grid.children].find((item) => cleanupPostText(item.textContent).startsWith("\u53d1\u5e16\u6570"));
    if (postCountItem?.parentElement === grid) {
      postCountItem.after(row);
    } else {
      grid.prepend(row);
    }
    normalizeStatItem(row);
  });
}

function stabilizeUserDescriptionSignatures(router) {
  router.querySelectorAll(".user-description article").forEach((article) => {
    if (!(article instanceof HTMLElement)) {
      return;
    }
    const rawText = article.textContent || "";
    const hasRawUbb = /\[(?:\/?(?:b|i|u|s|del|url|color|size|align|img)(?:=[^\]]+)?)\]/i.test(rawText);
    if (hasRawUbb && article.dataset.cc98ProfileSignatureUbbSource !== rawText) {
      article.dataset.cc98ProfileSignatureUbbSource = rawText;
      const fragment = document.createDocumentFragment();
      rawText.split(/\n/).forEach((line, index) => {
        if (index > 0) {
          fragment.append(document.createElement("br"));
        }
        const span = document.createElement("span");
        appendInlineUbbText(span, line);
        while (span.firstChild) {
          fragment.append(span.firstChild);
        }
      });
      article.replaceChildren(fragment);
    }
    article.classList.add("cc98-rebuild-profile-signature-content", "cc98-rebuild-signature-content");
    parseInlineUbbTextNodes(article);
    strengthenInlineTextStyles(article);
    markInlineEmojiContainers(article);
    stabilizeEmojiRendering(article);
  });
}

function stabilizeNativeUserCenter(router) {
  router.querySelectorAll(".user-center-config-avatar").forEach((block) => {
    if (!block.classList.contains("cc98-avatar-crop-active")) {
      block.classList.remove("cc98-avatar-crop-active");
    }
  });
  stabilizeUserCenterFavoriteActions(router);
  stabilizeUserCenterSearchButtons(router);
  stabilizeUserProfileStats(router);
  stabilizeUserDescriptionSignatures(router);
}

function bindNativeUserCenterStabilizer(router) {
  if (!router || nativeUserCenterStabilizers.has(router)) {
    return;
  }
  nativeUserCenterStabilizers.add(router);
  stabilizeNativeUserCenter(router);
  router.addEventListener("change", (event) => {
    const input = event.target?.closest?.('input[type="file"]#uploadAvatar, input[type="file"][accept*="image"]');
    if (!input) {
      return;
    }
    if (input.files?.length || input.value) {
      activateAvatarCrop(input);
    }
  }, true);
  router.addEventListener("click", (event) => {
    const defaultAvatarButton = event.target?.closest?.("#chooseDefaultAvatar");
    if (defaultAvatarButton) {
      deactivateAvatarCrop(defaultAvatarButton);
    }
  }, true);
  let userCenterStabilizeTimer = null;
  const scheduleUserCenterStabilize = () => {
    window.clearTimeout(userCenterStabilizeTimer);
    userCenterStabilizeTimer = window.setTimeout(() => stabilizeNativeUserCenter(router), 80);
  };
  const userCenterObserver = new MutationObserver(scheduleUserCenterStabilize);
  userCenterObserver.observe(router, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });
}

function getAntSimplePaginationState(pagination) {
  const pager = pagination.querySelector(".ant-pagination-simple-pager");
  const input = pager?.querySelector("input");
  const title = pager?.getAttribute("title") || "";
  const text = cleanupPostText(pager?.textContent || title);
  const titleMatch = title.match(/(\d+)\s*\/\s*(\d+)/);
  const textMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
  const total = Number(titleMatch?.[2] || textMatch?.[2] || text.match(/\/\s*(\d+)/)?.[1] || 1);
  const current = Number(input?.value || titleMatch?.[1] || textMatch?.[1] || 1);
  return {
    input,
    current: Math.max(1, current || 1),
    total: Math.max(1, total || 1),
    prev: pagination.querySelector(".ant-pagination-prev"),
    next: pagination.querySelector(".ant-pagination-next")
  };
}

function submitAntSimplePage(input, page) {
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }
  input.focus({ preventScroll: true });
  input.value = String(Math.max(1, Number(page) || 1));
  ["input", "change"].forEach((type) => input.dispatchEvent(new Event(type, { bubbles: true, cancelable: true })));
  ["keydown", "keypress", "keyup"].forEach((type) => {
    input.dispatchEvent(new KeyboardEvent(type, {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));
  });
  input.blur();
  scheduleDelayedRebuilds();
  scheduleNativeAntUiStabilize();
  return true;
}

function rebuildAntSimplePagination(pagination) {
  if (!(pagination instanceof HTMLElement)) {
    return;
  }
  const container = pagination.closest(".ant-list-pagination") || pagination.parentElement;
  if (!(container instanceof HTMLElement)) {
    return;
  }
  container.classList.add("cc98-rebuild-ant-pagination-host");
  pagination.classList.add("cc98-rebuild-ant-pagination-source");

  const state = getAntSimplePaginationState(pagination);
  let proxy = container.querySelector(":scope > .cc98-rebuild-ant-simple-pager");
  if (!(proxy instanceof HTMLElement)) {
    proxy = createElement("form", "cc98-rebuild-ant-simple-pager");
    container.append(proxy);
  }

  const prevDisabled = state.prev?.classList.contains("ant-pagination-disabled") || state.prev?.getAttribute("aria-disabled") === "true";
  const nextDisabled = state.next?.classList.contains("ant-pagination-disabled") || state.next?.getAttribute("aria-disabled") === "true";
  const stateKey = [state.current, state.total, prevDisabled ? "p0" : "p1", nextDisabled ? "n0" : "n1"].join(":");
  if (proxy.dataset.cc98PaginationState === stateKey) {
    return;
  }
  proxy.dataset.cc98PaginationState = stateKey;
  proxy.replaceChildren();

  const prevButton = createElement("button", "cc98-rebuild-ant-page-arrow", "‹");
  prevButton.type = "button";
  prevButton.disabled = Boolean(prevDisabled);
  prevButton.setAttribute("aria-label", "上一页");
  prevButton.addEventListener("click", () => {
    if (prevButton.disabled) {
      return;
    }
    triggerOriginalControl(state.prev);
    scheduleDelayedRebuilds();
    scheduleNativeAntUiStabilize();
  });

  const pageInput = createElement("input", "cc98-rebuild-ant-page-input");
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.max = String(state.total);
  pageInput.value = String(state.current);
  pageInput.setAttribute("aria-label", "跳转到页码");

  const total = createElement("span", "cc98-rebuild-ant-page-total", `/ ${state.total}`);

  const nextButton = createElement("button", "cc98-rebuild-ant-page-arrow", "›");
  nextButton.type = "button";
  nextButton.disabled = Boolean(nextDisabled);
  nextButton.setAttribute("aria-label", "下一页");
  nextButton.addEventListener("click", () => {
    if (nextButton.disabled) {
      return;
    }
    triggerOriginalControl(state.next);
    scheduleDelayedRebuilds();
    scheduleNativeAntUiStabilize();
  });

  proxy.onsubmit = (event) => {
    event.preventDefault();
    submitAntSimplePage(state.input, pageInput.value);
  };
  proxy.append(prevButton, pageInput, total, nextButton);
}

function getAntPaginationButtonLabel(item) {
  if (!(item instanceof HTMLElement)) {
    return "";
  }
  if (item.classList.contains("ant-pagination-prev")) {
    return "<";
  }
  if (item.classList.contains("ant-pagination-next")) {
    return ">";
  }
  if (item.classList.contains("ant-pagination-jump-prev") || item.classList.contains("ant-pagination-jump-next")) {
    return "...";
  }
  return cleanupPostText(item.textContent).replace(/\u2022/g, ".") || cleanupPostText(item.getAttribute("title"));
}

function rebuildAntFullPagination(pagination) {
  if (!(pagination instanceof HTMLElement) || pagination.classList.contains("ant-pagination-simple")) {
    return;
  }
  if (!pagination.closest(".ant-modal-content")) {
    return;
  }
  const container = pagination.closest(".ant-list-pagination") || pagination.parentElement;
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const items = [...pagination.querySelectorAll(":scope > li")].filter((item) => {
    return item instanceof HTMLElement && !item.classList.contains("ant-pagination-options");
  });
  if (items.length === 0) {
    return;
  }

  container.classList.add("cc98-rebuild-ant-pagination-host");
  pagination.classList.add("cc98-rebuild-ant-pagination-source");

  let proxy = container.querySelector(":scope > .cc98-rebuild-ant-full-pager");
  if (!(proxy instanceof HTMLElement)) {
    proxy = createElement("nav", "cc98-rebuild-ant-full-pager");
    proxy.setAttribute("aria-label", "pagination");
    container.append(proxy);
  }

  const stateKey = items.map((item) => [
    item.className,
    item.getAttribute("title") || "",
    cleanupPostText(item.textContent)
  ].join("|")).join(";");
  if (proxy.dataset.cc98PaginationState === stateKey) {
    return;
  }
  proxy.dataset.cc98PaginationState = stateKey;
  proxy.replaceChildren();

  items.forEach((item) => {
    const label = getAntPaginationButtonLabel(item);
    if (!label) {
      return;
    }
    const isDisabled = item.classList.contains("ant-pagination-disabled") || item.getAttribute("aria-disabled") === "true";
    const isCurrent = item.classList.contains("ant-pagination-item-active");
    const isJump = item.classList.contains("ant-pagination-jump-prev") || item.classList.contains("ant-pagination-jump-next");
    const button = createElement("button", "cc98-rebuild-ant-page-button", label);
    button.type = "button";
    button.disabled = Boolean(isDisabled);
    button.title = item.getAttribute("title") || label;
    if (isCurrent) {
      button.classList.add("is-current");
      button.setAttribute("aria-current", "page");
    }
    if (isDisabled) {
      button.classList.add("is-disabled");
    }
    if (isJump) {
      button.classList.add("is-jump");
    }
    if (item.classList.contains("ant-pagination-prev") || item.classList.contains("ant-pagination-next")) {
      button.classList.add("is-arrow");
    }
    button.addEventListener("click", () => {
      if (button.disabled || isCurrent) {
        return;
      }
      triggerOriginalControl(item.querySelector("a") || item);
      scheduleDelayedRebuilds();
      scheduleNativeAntUiStabilize();
    });
    proxy.append(button);
  });
}

function cleanupAntFullPaginationOutsideModals() {
  document.querySelectorAll(".cc98-rebuild-ant-full-pager").forEach((proxy) => {
    if (!proxy.closest(".ant-modal-content")) {
      proxy.remove();
    }
  });
  document.querySelectorAll(".ant-pagination.cc98-rebuild-ant-pagination-source:not(.ant-pagination-simple)").forEach((pagination) => {
    if (!pagination.closest(".ant-modal-content")) {
      pagination.classList.remove("cc98-rebuild-ant-pagination-source");
    }
  });
}

function stabilizeNativeAntUi() {
  if (!lastSettings?.enabled) {
    return;
  }
  stabilizeEmojiRendering(document);
  cleanupAntFullPaginationOutsideModals();
  const nativeRoot = document.querySelector("#root");
  nativeRoot?.querySelectorAll(".ant-list, .ant-list-item, .ant-list-item-meta, .ant-list-item-content, .ant-list-item-meta-content").forEach((node) => {
    node.classList.add("cc98-rebuild-native-ant-list");
  });
  nativeRoot?.querySelectorAll(".ant-list-pagination .ant-pagination-simple, .ant-pagination.ant-pagination-simple").forEach(rebuildAntSimplePagination);
  document.querySelectorAll(".ant-modal-content .ant-list, .ant-modal-content .ant-list-item, .ant-modal-content .ant-list-item-meta, .ant-modal-content .ant-list-item-content, .ant-modal-content .ant-list-item-meta-content").forEach((node) => {
    node.classList.add("cc98-rebuild-native-ant-list");
  });
  document.querySelectorAll(".ant-modal-content .ant-list-pagination .ant-pagination-simple, .ant-modal-content .ant-pagination.ant-pagination-simple").forEach(rebuildAntSimplePagination);
  document.querySelectorAll(".ant-modal-content .ant-list-pagination .ant-pagination:not(.ant-pagination-simple)").forEach(rebuildAntFullPagination);
}

function scheduleNativeAntUiStabilize() {
  window.clearTimeout(nativeAntUiStabilizeTimer);
  nativeAntUiStabilizeTimer = window.setTimeout(stabilizeNativeAntUi, 80);
}

function ensureNativeAntUiStabilizer() {
  if (nativeAntUiObserver || !document.body) {
    return;
  }
  nativeAntUiObserver = new MutationObserver(scheduleNativeAntUiStabilize);
  nativeAntUiObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "value", "aria-disabled"]
  });
  stabilizeNativeAntUi();
}

function renderHome(app) {
  const sections = getHomeSections();
  const hotOnly = Boolean(lastSettings?.homeHotOnly);
  const hotSections = sections.filter(isHotHomeSection);
  const visibleSections = hotOnly && hotSections.length > 0 ? hotSections : sections;
  if (hotOnly && visibleSections.length > 0) {
    const hero = createElement("section", "cc98-rebuild-hero cc98-rebuild-home-hot-hero");
    hero.append(createElement("p", "cc98-rebuild-kicker", `Reborn View · v${EXTENSION_VERSION}`));
    hero.append(createElement("h1", "", visibleSections[0].title));
    app.append(hero);
  }
  const grid = createElement("div", "cc98-rebuild-section-grid");
  if (hotOnly) {
    grid.classList.add("cc98-rebuild-home-hot-grid");
  }
  visibleSections.forEach((section) => {
    const block = createElement("section", "cc98-rebuild-section");
    const hotSection = isHotHomeSection(section);
    if (!hotOnly) {
      const header = createElement("div", "cc98-rebuild-section-heading");
      header.append(createElement("h2", "", section.title));
      block.append(header);
    }
    if (hotOnly && hotSection) {
      block.classList.add("cc98-rebuild-home-hot-section");
    }
    const list = createElement("div", "cc98-rebuild-list");
    const rankedItems = hotSection ? getHomeHotItemsWithRankMovement(section) : section.items;
    const visibleItemLimit = hotOnly && hotSection ? 10 : 12;
    rankedItems.slice(0, visibleItemLimit).forEach((item, index) => {
      list.append(renderTopicCard({
        ...item,
        rank: hotSection && index < 10 ? index + 1 : 0
      }));
    });
    block.append(list);
    grid.append(block);
  });
  app.append(grid);
}

function getSearchRouteAge() {
  const routeKey = getRoutePageKey();
  if (searchPageRouteKey !== routeKey) {
    searchPageRouteKey = routeKey;
    searchPageRouteFirstSeenAt = Date.now();
  }
  return Date.now() - searchPageRouteFirstSeenAt;
}

function hasNativeSearchLoadingSignal() {
  return Boolean(document.querySelector([
    ".ant-spin-spinning",
    ".ant-spin-nested-loading .ant-spin",
    ".ant-spin-blur",
    "[class*='loading']",
    "[class*='Loading']",
    "[class*='loadMore']",
    "[id*='loading']",
    "[id*='Loading']"
  ].join(",")));
}

function shouldDeferSearchEmptyState() {
  if (getPageKind() !== "search") {
    return false;
  }
  const age = getSearchRouteAge();
  if (document.readyState === "loading") {
    return true;
  }
  if (age < SEARCH_EMPTY_INITIAL_GRACE_MS) {
    return true;
  }
  return hasNativeSearchLoadingSignal() && age < SEARCH_EMPTY_LOADING_GRACE_MS;
}

function scheduleSearchEmptyRecheck() {
  window.clearTimeout(searchPageEmptyRecheckTimer);
  const age = getSearchRouteAge();
  const nextDelay = Math.max(260, Math.min(900, SEARCH_EMPTY_INITIAL_GRACE_MS - age + 80));
  searchPageEmptyRecheckTimer = window.setTimeout(scheduleRebuild, nextDelay);
}

function renderSearchPendingState(app) {
  scheduleSearchEmptyRecheck();
  const section = createElement("section", "cc98-rebuild-empty-state cc98-rebuild-search-pending");
  section.append(createElement("div", "cc98-rebuild-search-pending-spinner"));
  section.append(createElement("h2", "", "\u6b63\u5728\u7b49\u5f85\u641c\u7d22\u7ed3\u679c"));
  section.append(createElement("p", "", "\u539f\u9875\u9762\u8fd8\u5728\u52a0\u8f7d\uff0c\u7a0d\u540e\u4f1a\u81ea\u52a8\u5237\u65b0\u7ed3\u679c\u533a\u3002"));
  app.append(section);
}

function renderTopics(app) {
  const topics = getTopicItems();
  const searchKeyword = getPageKind() === "search" ? getCurrentSearchKeyword() : "";
  const fuzzyTerms = searchKeyword && lastSettings?.advancedFuzzySearch ? tokenizeSearchQuery(searchKeyword) : [];
  const fallbackFuzzyTerms = fuzzyTerms.length ? fuzzyTerms : [normalizeSuggestionText(searchKeyword)].filter(Boolean);
  const useAdvancedFuzzy = Boolean(lastSettings?.advancedFuzzySearch && (
    fuzzyTerms.length >= 2
    || (lastSettings?.aiSearchSuggestEnabled && normalizeSuggestionText(searchKeyword).length >= 4)
  ));
  if (!topics.length && getPageKind() === "search") {
    if (shouldDeferSearchEmptyState()) {
      renderSearchPendingState(app);
      return;
    }
    if (useAdvancedFuzzy) {
      const feed = createElement("section", "cc98-rebuild-feed");
      feed.dataset.feedKind = "search-fuzzy";
      app.append(createAdvancedFuzzySearchPanel(searchKeyword, fallbackFuzzyTerms, feed, []));
      app.append(feed);
      return;
    }
    const message = cleanupPostText(document.querySelector(".noResultText")?.textContent)
      || "抱歉呢前辈，没有找到你想要的帖子哦~";
    const section = createElement("section", "cc98-rebuild-empty-state");
    section.append(createElement("h2", "", "没有找到结果"));
    section.append(createElement("p", "", message.replace(/^-+|-+$/g, "").trim() || "抱歉呢前辈，没有找到你想要的帖子哦~"));
    app.append(section);
    return;
  }
  const feed = createElement("section", "cc98-rebuild-feed");
  feed.dataset.feedKind = "topics";
  if (useAdvancedFuzzy) {
    feed.dataset.feedKind = "search-fuzzy";
    app.append(createAdvancedFuzzySearchPanel(searchKeyword, fallbackFuzzyTerms, feed, topics));
  }
  if (!useAdvancedFuzzy) {
    topics.forEach((item) => {
      const card = renderTopicCard(item);
      card.dataset.itemKey = `topic:${item.href}`;
      feed.append(card);
    });
  }
  app.append(feed);
}

function renderPost(app) {
  const topPager = renderPostPager();
  if (topPager) {
    app.append(topPager);
  }
  const feed = createElement("section", "cc98-rebuild-feed cc98-rebuild-post-feed");
  feed.dataset.feedKind = "post";
  getPostItems().forEach((item) => {
    const card = renderPostCard(item);
    card.dataset.itemKey = `post:${item.id}`;
    feed.append(card);
  });
  app.append(feed);
  const bottomPager = renderPostPager();
  if (bottomPager) {
    app.append(bottomPager);
  }
  renderPostReplyEditor(app);
}

function renderBoards(app) {
  const sections = getBoardSections();
  sections.forEach((section) => {
    const block = createElement("section", "cc98-rebuild-section");
    block.append(createElement("h2", "", section.title));
    const grid = createElement("div", "cc98-rebuild-board-grid");
    section.boards.forEach((board) => {
      const card = createElement("article", "cc98-rebuild-board");
      if (board.image) {
        const image = createElement("img", "cc98-rebuild-board-image");
        image.src = board.image;
        image.alt = "";
        card.append(image);
      }
      card.append(createLink("cc98-rebuild-card-title", board.title, board.href));
      if (board.meta) {
        card.append(createElement("p", "cc98-rebuild-card-meta", board.meta));
      }
      grid.append(card);
    });
    block.append(grid);
    app.append(block);
  });
}

function renderUserCenter(app) {
  const navSource = document.querySelector(".user-center-navigation");
  const router = document.querySelector(".user-center-router");
  const activeTitle = getUserCenterActiveTitle();

  const hero = createElement("section", "cc98-rebuild-user-hero");
  hero.append(createElement("p", "cc98-rebuild-kicker", "User Center"));
  hero.append(createElement("h1", "", activeTitle));
  app.append(hero);

  if (!navSource || !router) {
    const data = getUserCenterData();
    const originalButtons = [...document.querySelectorAll(".user-center-router button")];
    const layout = createElement("div", "cc98-rebuild-user-layout");
    const nav = createElement("nav", "cc98-rebuild-user-nav");
    data.navItems.forEach((item) => nav.append(createLink("", item.title, item.href)));
    const main = createElement("section", "cc98-rebuild-section");
    main.append(createElement("h2", "", data.heading));
    data.summary.forEach((line) => main.append(createElement("p", "cc98-rebuild-card-meta", line)));
    if (data.actions.length > 0) {
      const actionGrid = createElement("div", "cc98-rebuild-action-grid");
      data.actions.forEach((action, index) => {
        actionGrid.append(createButton("cc98-rebuild-chip cc98-rebuild-action", action, () => {
          originalButtons[index]?.click();
        }));
      });
      main.append(actionGrid);
    }
    layout.append(nav, main);
    app.append(layout);
    return;
  }

  const layout = createElement("div", "cc98-rebuild-user-layout");
  rememberReparentedNativeNode(navSource);
  rememberReparentedNativeNode(router);
  navSource.classList.add("cc98-rebuild-native-user-nav");
  router.classList.add("cc98-rebuild-native-user-router");
  bindNativeUserCenterStabilizer(router);
  navSource.addEventListener("click", () => {
    window.setTimeout(() => updateUserCenterHero(app), 120);
    window.setTimeout(() => updateUserCenterHero(app), 600);
  });
  layout.append(navSource, router);
  app.append(layout);
}

function encodeSearchKeyword(keyword) {
  return encodeURIComponent(normalizeSuggestionText(keyword)).replace(/%20/g, "%2520");
}

function encodeNativeSearchKeyword(keyword) {
  return encodeURI(encodeURI(normalizeSuggestionText(keyword)));
}

function decodeSearchKeywordParam(value) {
  const raw = String(value ?? "");
  try {
    return decodeURIComponent(raw).replace(/%20/g, " ");
  } catch {
    return raw.replace(/%20/g, " ");
  }
}

function splitSearchTermByHints(term) {
  const clean = normalizeSuggestionText(term).replace(/\s+/g, "");
  if (clean.length < 3 || SEARCH_SOLID_TERMS.has(clean.toLowerCase())) {
    return [clean].filter(Boolean);
  }
  const hints = [...SEARCH_SPLIT_HINTS].sort((a, b) => b.length - a.length);
  const picked = [];
  let index = 0;
  let unknown = "";
  const flushUnknown = () => {
    if (!unknown) {
      return;
    }
    picked.push(...splitUnknownSearchChunk(unknown));
    unknown = "";
  };

  while (index < clean.length) {
    const rest = clean.slice(index);
    const matched = hints.find((hint) => rest.toLowerCase().startsWith(hint.toLowerCase()));
    if (matched) {
      flushUnknown();
      picked.push(matched);
      index += matched.length;
      continue;
    }
    unknown += clean[index];
    index += 1;
  }
  flushUnknown();
  if (picked.length >= 2) {
    return picked;
  }
  return [clean];
}

function splitUnknownSearchChunk(chunk) {
  let clean = normalizeSuggestionText(chunk).replace(/\s+/g, "");
  SEARCH_STOP_PHRASES
    .sort((a, b) => b.length - a.length)
    .forEach((phrase) => {
      clean = clean.replace(new RegExp(escapeRegExp(phrase), "g"), "");
    });
  if (!clean) {
    return [];
  }
  if (clean.length < 3 || SEARCH_SOLID_TERMS.has(clean.toLowerCase())) {
    return [clean];
  }
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    const words = [...segmenter.segment(clean)]
      .filter((part) => part.isWordLike)
      .map((part) => part.segment.trim())
      .filter((word) => word.length >= 2 && !SEARCH_OPTIONAL_TERMS.has(word));
    if (words.length >= 2 && words.join("") === clean) {
      return words;
    }
    if (words.length === 1 && words[0].length >= 3) {
      return words;
    }
  }
  return clean.length >= 4 ? [clean] : [];
}

function splitLongSearchTerm(term) {
  const clean = normalizeSuggestionText(term).replace(/\s+/g, "");
  if (!clean || clean.length < 3 || SEARCH_SOLID_TERMS.has(clean.toLowerCase())) {
    return [clean].filter(Boolean);
  }
  const hintedWords = splitSearchTermByHints(clean);
  if (hintedWords.length >= 2) {
    return hintedWords;
  }
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    const words = [...segmenter.segment(clean)]
      .filter((part) => part.isWordLike)
      .map((part) => part.segment.trim())
      .filter((word) => word.length >= 2);
    if (words.length >= 2 && words.join("") === clean) {
      return words;
    }
  }
  return hintedWords;
}

function tokenizeSearchQuery(query) {
  const rawTerms = normalizeSuggestionText(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const terms = rawTerms.flatMap((term) => splitLongSearchTerm(term));
  return [...new Set(terms
    .map((term) => normalizeSuggestionText(term))
    .filter((term) => term.length >= 2 && !SEARCH_OPTIONAL_TERMS.has(term)))].slice(0, 6);
}

function getTermImportance(term) {
  const normalized = normalizeSuggestionText(term);
  if (SEARCH_IMPORTANT_TERMS.has(normalized)) {
    return 4;
  }
  if (SEARCH_SOLID_TERMS.has(normalized.toLowerCase())) {
    return 4;
  }
  if (/^(大一|大二|大三|大四|春夏|秋冬)$/.test(normalized)) {
    return 2.4;
  }
  if (SEARCH_OPTIONAL_TERMS.has(normalized)) {
    return 0.55;
  }
  return normalized.length >= 4 ? 2.2 : 1.4;
}

function pickImportantSearchTerms(terms) {
  const unique = [...new Set(terms.map((term) => normalizeSuggestionText(term)).filter(Boolean))];
  const important = unique.filter((term) => getTermImportance(term) >= 1);
  return important.length ? important : unique;
}

function getCurrentSearchKeyword() {
  return decodeSearchKeywordParam(new URLSearchParams(location.search).get("keyword"));
}

function getNativeSearchRoot() {
  return [...document.querySelectorAll("#search")]
    .find((node) => node instanceof HTMLElement && !node.closest("#cc98-comfort-app")) || null;
}

function getNativeSearchState() {
  const root = getNativeSearchRoot();
  const selected = cleanupPostText(root?.querySelector?.(".searchBoxSelect")?.textContent) || "\u4e3b\u9898";
  const options = root
    ? [...root.querySelectorAll(".searchBoxSub li")]
        .filter((item) => item instanceof HTMLElement)
        .filter((item) => getComputedStyle(item).display !== "none")
        .map((item) => cleanupPostText(item.textContent))
        .filter(Boolean)
    : [];
  const uniqueOptions = [...new Set(options.length ? options : [selected, "\u7528\u6237", "\u7248\u9762"].filter(Boolean))];
  return {
    root,
    selected,
    options: uniqueOptions.includes(selected) ? uniqueOptions : [selected, ...uniqueOptions]
  };
}

function canShowSearchSuggestionsForType(type) {
  const normalized = cleanupPostText(type);
  return /^(?:\u4e3b\u9898|\u5168\u7ad9)$/.test(normalized);
}

function setNativeSearchInputValue(input, value) {
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function selectNativeSearchType(root, type) {
  if (!(root instanceof HTMLElement) || !type) {
    return false;
  }
  const current = cleanupPostText(root.querySelector(".searchBoxSelect")?.textContent);
  if (current === type) {
    return true;
  }
  const option = [...root.querySelectorAll(".searchBoxSub li")]
    .find((item) => item instanceof HTMLElement
      && getComputedStyle(item).display !== "none"
      && cleanupPostText(item.textContent) === type);
  if (!(option instanceof HTMLElement)) {
    return false;
  }
  dispatchMouseSequence(root.querySelector(".searchBoxSelect") || root.querySelector(".caret-down") || option);
  dispatchMouseSequence(option);
  return true;
}

function getCurrentSearchBoardId() {
  const boardMatch = location.pathname.match(/\/board\/(\d+)/i);
  if (boardMatch) {
    return Math.max(0, Number(boardMatch[1]) || 0);
  }
  const searchBoardId = Number(new URLSearchParams(location.search).get("boardId"));
  if (Number.isFinite(searchBoardId) && searchBoardId > 0) {
    return searchBoardId;
  }
  const boardLink = [...document.querySelectorAll('a[href*="/board/"]')]
    .map((link) => link instanceof HTMLAnchorElement ? (link.href || link.getAttribute("href") || "") : "")
    .map((href) => href.match(/\/board\/(\d+)/i)?.[1])
    .find(Boolean);
  return Math.max(0, Number(boardLink) || 0);
}

function getSearchUrl(keyword) {
  const url = new URL("/search", location.origin);
  url.search = `?boardId=0&keyword=${encodeSearchKeyword(keyword)}`;
  return url;
}

function getRebuiltSearchTargetHref(keyword, type) {
  const normalized = normalizeSuggestionText(keyword);
  const normalizedType = cleanupPostText(type);
  if (!normalized) {
    return "";
  }
  if (normalizedType === "\u7528\u6237") {
    return `${location.origin}/user/name/${encodeURIComponent(normalized)}`;
  }
  if (normalizedType === "\u7248\u9762") {
    return `${location.origin}/searchBoard?keyword=${encodeNativeSearchKeyword(normalized)}`;
  }
  const boardId = normalizedType === "\u7248\u5185" ? getCurrentSearchBoardId() : 0;
  return `${location.origin}/search?boardId=${boardId}&keyword=${encodeNativeSearchKeyword(normalized)}`;
}

function submitNativeSearch(keyword, type) {
  const root = getNativeSearchRoot();
  const input = root?.querySelector?.("#searchText");
  const submit = root?.querySelector?.(".searchIco");
  if (!(root instanceof HTMLElement) || !(input instanceof HTMLInputElement) || !(submit instanceof HTMLElement)) {
    return false;
  }
  selectNativeSearchType(root, type);
  setNativeSearchInputValue(input, keyword);
  window.setTimeout(() => {
    dispatchMouseSequence(submit);
  }, 20);
  return true;
}

function submitRebuiltSearch(keyword, type = getNativeSearchState().selected) {
  const normalized = String(keyword ?? "").trim();
  if (!normalized) {
    return false;
  }
  const targetHref = getRebuiltSearchTargetHref(normalized, type);
  const startedAt = getRoutePageKey();
  scheduleRouteFollowup(targetHref, startedAt);
  if (submitNativeSearch(normalized, type)) {
    const forceNavigation = (replace = false) => {
      if (getRoutePageKey() !== startedAt || !targetHref) {
        scheduleRouteFollowup(targetHref, startedAt);
        return;
      }
      if (replace) {
        location.replace(targetHref);
        scheduleRouteFollowup(targetHref, startedAt);
        return;
      }
      location.assign(targetHref);
      scheduleRouteFollowup(targetHref, startedAt);
    };
    const baseDelay = cleanupPostText(type) === "\u7528\u6237" ? 520 : 120;
    [baseDelay, baseDelay + 240, baseDelay + 820, baseDelay + 1500].forEach((delay, index) => {
      window.setTimeout(() => forceNavigation(index > 1), delay);
    });
    return true;
  }
  location.assign(targetHref || getSearchUrl(normalized).href);
  scheduleRouteFollowup(targetHref || getSearchUrl(normalized).href, startedAt);
  return true;
}

function normalizeSuggestionText(text) {
  return String(text ?? "")
    .replace(/[【】《》（）()[\]「」『』"'“”‘’]/g, " ")
    .replace(/[\u3000\u3010\u3011\u300a\u300b\uff08\uff09\u300c\u300d\u300e\u300f\u201c\u201d\u2018\u2019"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEARCH_SUGGESTION_TOKEN_SPLIT_RE = new RegExp("[\\s,.;:!?()\\[\\]{}<>|/\\\\~\"'\\u3000\\uff0c\\u3002\\uff1f\\uff01\\u3001\\uff1b\\uff1a\\uff08\\uff09\\u3010\\u3011\\u300a\\u300b\\u201c\\u201d\\u2018\\u2019\\u00b7\\u2026\\u2014\\-_=+]+", "u");
const SEARCH_SUGGESTION_EDGE_PUNCTUATION_RE = new RegExp("^[\\s,.;:!?()\\[\\]{}<>|/\\\\~\"'\\u3000\\uff0c\\u3002\\uff1f\\uff01\\u3001\\uff1b\\uff1a\\uff08\\uff09\\u3010\\u3011\\u300a\\u300b\\u201c\\u201d\\u2018\\u2019\\u00b7\\u2026\\u2014\\-_=+]+|[\\s,.;:!?()\\[\\]{}<>|/\\\\~\"'\\u3000\\uff0c\\u3002\\uff1f\\uff01\\u3001\\uff1b\\uff1a\\uff08\\uff09\\u3010\\u3011\\u300a\\u300b\\u201c\\u201d\\u2018\\u2019\\u00b7\\u2026\\u2014\\-_=+]+$", "gu");
const SEARCH_SUGGESTION_WEAK_EDGE_RE = /^[\u7684\u4e86\u5462\u5417\u561b\u554a\u5440\u5427\u4e48\u548c\u4e0e\u53ca\u6216\u5728\u5bf9\u4e3a\u628a\u88ab\u4ece\u5230\u5c31\u90fd\u4e5f\u8fd8\u5f88\u66f4\u6700]+|[\u7684\u4e86\u5462\u5417\u561b\u554a\u5440\u5427\u4e48\u548c\u4e0e\u53ca\u6216\u5728\u5bf9\u4e3a\u628a\u88ab\u4ece\u5230\u5c31\u90fd\u4e5f\u8fd8\u5f88\u66f4\u6700]+$/gu;
const SEARCH_SUGGESTION_WEAK_TERMS = new Set([
  "求问", "请问", "请教", "想问", "有没有", "有无", "什么", "怎么", "如何", "为什么",
  "推荐", "求助", "问题", "相关", "大家", "一个", "这个", "那个", "可以", "不能",
  "是不是", "有没有什么", "哪里", "哪个", "哪些", "一下", "一点", "感觉", "真的",
  "比较", "大佬", "蹲", "插眼", "求", "问", "the", "and", "for", "with", "help"
].map((term) => term.toLowerCase()));
const SEARCH_SUGGESTION_PHRASE_BREAK_TERMS = new Set([
  "求问", "请问", "请教", "想问", "有没有", "有无", "什么", "怎么", "如何", "为什么",
  "哪里", "哪个", "哪些", "可以", "不能", "是不是", "有没有什么", "一下", "一点",
  "感觉", "真的", "比较", "大佬", "蹲", "插眼"
].map((term) => term.toLowerCase()));
const SEARCH_SUGGESTION_MEANING_HINTS = [
  "选课", "退课", "补选", "课程", "课程评价", "老师", "教材", "作业",
  "考试", "复习", "期中", "期末", "历年卷", "回忆卷", "资料", "笔记",
  "小测", "绩点", "综评", "奖学金", "保研", "推免", "考研", "复试",
  "转专业", "专业", "学院", "竺院", "医学院", "混合班", "实验", "报告",
  "论文", "毕业", "答辩", "实习", "兼职", "面试", "简历", "租房",
  "二手", "拼车", "宿舍", "寝室", "食堂", "校区", "体测", "补测",
  "军训", "挂科", "补考", "重修", "医保", "校医院", "心理", "痛经",
  "中医", "紫金港", "玉泉", "西溪", "海宁", "之江", "计算机", "软工",
  "人工智能", "机器学习", "深度学习", "大模型", "chatgpt", "codex", "deepseek", "openai"
];

function hasCjkSuggestionText(text) {
  return /[\u3400-\u9fff]/u.test(String(text ?? ""));
}

function getCjkSuggestionCharCount(text) {
  return (String(text ?? "").match(/[\u3400-\u9fff]/gu) || []).length;
}

function trimSuggestionPhrase(term) {
  let clean = normalizeSuggestionText(term)
    .replace(SEARCH_SUGGESTION_EDGE_PUNCTUATION_RE, "")
    .trim();
  for (let index = 0; index < 3; index += 1) {
    const next = clean.replace(SEARCH_SUGGESTION_WEAK_EDGE_RE, "").trim();
    if (!next || next === clean) {
      break;
    }
    clean = next;
  }
  return clean;
}

function suggestionHasMeaningHint(term) {
  const normalized = trimSuggestionPhrase(term).toLowerCase();
  return SEARCH_SOLID_TERMS.has(normalized)
    || SEARCH_SUGGESTION_MEANING_HINTS.some((hint) => normalized.includes(hint.toLowerCase()));
}

function isExactMeaningHint(term) {
  const normalized = trimSuggestionPhrase(term).toLowerCase();
  return SEARCH_SUGGESTION_MEANING_HINTS.some((hint) => normalized === hint.toLowerCase());
}

function suggestionContainsPhraseBreak(term) {
  const normalized = trimSuggestionPhrase(term).toLowerCase();
  return [...SEARCH_SUGGESTION_PHRASE_BREAK_TERMS].some((weak) => weak.length >= 2 && normalized.includes(weak));
}

function isLikelyBrokenSuggestionTerm(term, query = "") {
  const normalized = trimSuggestionPhrase(term);
  const lower = normalized.toLowerCase();
  const lowerQuery = normalizeSuggestionText(query).toLowerCase();
  if (!normalized || normalized === lowerQuery || SEARCH_SUGGESTION_WEAK_TERMS.has(lower)) {
    return true;
  }
  if (/^(.)\1{1,}$/u.test(normalized) || /^\d{1,4}(?:年|月|日|天)?$/u.test(normalized)) {
    return true;
  }
  if (!hasCjkSuggestionText(normalized)) {
    return /^[a-z]{1,2}$/i.test(normalized);
  }
  const cjkCount = getCjkSuggestionCharCount(normalized);
  if (cjkCount <= 1 && !/[A-Za-z0-9+#.-]{2,}/.test(normalized)) {
    return true;
  }
  if (/^(?:这|那|哪).{0,3}$/u.test(normalized)) {
    return true;
  }
  if (normalized.length <= 4 && normalized !== normalized.replace(SEARCH_SUGGESTION_WEAK_EDGE_RE, "")) {
    return true;
  }
  return false;
}

function isMeaningfulSuggestionTerm(term, query = "") {
  const normalized = trimSuggestionPhrase(term);
  if (!normalized || normalized.length < 2 || normalized.length > 18) {
    return false;
  }
  if (isLikelyBrokenSuggestionTerm(normalized, query)) {
    return false;
  }
  if (hasCjkSuggestionText(normalized) && getCjkSuggestionCharCount(normalized) === 2) {
    return !SEARCH_SUGGESTION_WEAK_TERMS.has(normalized.toLowerCase());
  }
  return true;
}

function splitSuggestionTextChunks(text) {
  return normalizeSuggestionText(text)
    .split(SEARCH_SUGGESTION_TOKEN_SPLIT_RE)
    .map((chunk) => trimSuggestionPhrase(chunk).replace(/\s+/g, ""))
    .filter((chunk) => chunk.length >= 2);
}

function addUniqueSuggestionTerm(list, term, query = "") {
  const clean = trimSuggestionPhrase(term);
  if (!isMeaningfulSuggestionTerm(clean, query)) {
    return;
  }
  const key = clean.toLowerCase();
  if (!list.some((item) => item.toLowerCase() === key)) {
    list.push(clean);
  }
}

function collectHintedSuggestionPhrases(chunk, query = "") {
  const clean = trimSuggestionPhrase(chunk).replace(/\s+/g, "");
  if (!clean || !hasCjkSuggestionText(clean)) {
    return [];
  }
  const phrases = [];
  const lower = clean.toLowerCase();
  const hints = [...SEARCH_SUGGESTION_MEANING_HINTS].sort((a, b) => b.length - a.length);
  hints.forEach((hint) => {
    const lowerHint = hint.toLowerCase();
    let start = lower.indexOf(lowerHint);
    while (start >= 0) {
      const end = start + hint.length;
      [clean.slice(start, end)].forEach((candidate) => {
        if (candidate.length <= 12) {
          addUniqueSuggestionTerm(phrases, candidate, query);
        }
      });
      start = lower.indexOf(lowerHint, start + lowerHint.length);
    }
  });
  return phrases;
}

function getOrderedSuggestionWords(text, query = "") {
  const compact = trimSuggestionPhrase(text).replace(/\s+/g, "");
  if (!compact) {
    return [];
  }
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    return [...segmenter.segment(compact)]
      .filter((part) => part.isWordLike)
      .map((part) => trimSuggestionPhrase(part.segment))
      .filter((word) => isMeaningfulSuggestionTerm(word, query));
  }
  return segmentSuggestionWords(compact);
}

function getSuggestionTail(text, keyword) {
  const clean = normalizeSuggestionText(text);
  const base = normalizeSuggestionText(keyword);
  if (!base) {
    return clean;
  }
  const lowerBase = base.toLowerCase();
  const lowerClean = clean.toLowerCase();
  if (lowerClean.startsWith(`${lowerBase} `)) {
    return trimSuggestionPhrase(clean.slice(base.length));
  }
  if (lowerClean.includes(lowerBase)) {
    return trimSuggestionPhrase(clean.replace(new RegExp(escapeRegExp(base), "ig"), " "));
  }
  return clean;
}

function isMeaningfulSearchSuggestion(text, keyword) {
  const clean = normalizeSuggestionText(text);
  const base = normalizeSuggestionText(keyword);
  if (!clean || clean.length < 2 || clean.length > 32 || clean.toLowerCase() === base.toLowerCase()) {
    return false;
  }
  return isMeaningfulSuggestionTerm(getSuggestionTail(clean, base), base);
}

function addSuggestionScore(scores, text, score) {
  const normalized = trimSuggestionPhrase(text);
  if (normalized.length < 2 || normalized.length > 28 || /^\d+$/.test(normalized)) {
    return;
  }
  scores.set(normalized, (scores.get(normalized) || 0) + score);
}

function isWeakSuggestionTerm(term, query) {
  const normalized = trimSuggestionPhrase(term).toLowerCase();
  const normalizedQuery = normalizeSuggestionText(query).toLowerCase();
  const weakTerms = new Set([
    "求问", "请问", "有没有", "有无", "什么", "怎么", "如何", "为什么", "推荐", "求助", "问题", "相关",
    "大家", "一个", "这个", "那个", "一下", "可以", "不能", "是不是", "有没有什么", "求", "问",
    "the", "and", "for", "with", "help"
  ]);
  return !normalized
    || normalized === normalizedQuery
    || normalized.length < 2
    || normalized.length > 18
    || weakTerms.has(normalized)
    || SEARCH_SUGGESTION_WEAK_TERMS.has(normalized)
    || isLikelyBrokenSuggestionTerm(normalized, normalizedQuery)
    || /^\d+$/.test(normalized)
    || /^[a-z]{1,2}$/.test(normalized);
}

function segmentSuggestionWords(text) {
  const source = normalizeSuggestionText(text);
  if (!source) {
    return [];
  }
  const words = [];
  const addWord = (word) => addUniqueSuggestionTerm(words, word);
  splitSuggestionTextChunks(source).forEach((chunk) => {
    const compact = chunk.replace(/\s+/g, "");
    compact.match(/\d+(?:\.\d+)?\s*(?:米|m|km|公里|分钟|分|秒|元|块|天|周|月|年|次|级)/gi)
      ?.forEach((term) => addWord(term.replace(/\s+/g, "")));
    compact.match(/[A-Za-z][A-Za-z0-9+#.-]{1,16}/g)
      ?.forEach(addWord);
    collectHintedSuggestionPhrases(compact).forEach(addWord);
    if (hasCjkSuggestionText(compact) && compact.length <= 8 && !suggestionContainsPhraseBreak(compact)) {
      addWord(compact);
    }
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
      const segmented = [...segmenter.segment(compact)]
        .filter((part) => part.isWordLike)
        .map((part) => part.segment.trim())
        .filter((word) => isMeaningfulSuggestionTerm(word));
      segmented.forEach(addWord);
      segmented.forEach((word, index) => {
        const next = segmented[index + 1];
        const combo = next ? `${word}${next}` : "";
        if (combo && combo.length <= 10 && isExactMeaningHint(combo)) {
          addWord(combo);
        }
      });
    }
  });
  return words;
}

function extractSuggestionTerms(title, keyword) {
  const query = normalizeSuggestionText(keyword).toLowerCase();
  const cleanTitle = normalizeSuggestionText(title);
  const terms = [];
  const addTerm = (term, score) => {
    const cleanTerm = trimSuggestionPhrase(term);
    const lowerTerm = cleanTerm.toLowerCase();
    const withoutQuery = normalizeSuggestionText(lowerTerm.includes(query)
      ? cleanTerm.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ")
      : cleanTerm);
    const finalTerm = trimSuggestionPhrase(withoutQuery || cleanTerm);
    if (query && query.includes(finalTerm.toLowerCase())) {
      return;
    }
    if (isMeaningfulSuggestionTerm(finalTerm, query)) {
      terms.push({ term: finalTerm, score });
    }
  };

  cleanTitle.match(/\d+(?:\.\d+)?\s*(?:米|m|km|公里|分钟|分|秒|元|块|天|周|月|年|次|级)/gi)
    ?.forEach((term) => addTerm(term.replace(/\s+/g, ""), 9));
  cleanTitle.match(/[A-Za-z][A-Za-z0-9+#.-]{1,16}/g)
    ?.forEach((term) => addTerm(term, 5));

  const lowerTitle = cleanTitle.toLowerCase();
  const queryIndex = lowerTitle.indexOf(query);
  if (queryIndex >= 0) {
    const nearby = cleanTitle.slice(Math.max(0, queryIndex - 12), Math.min(cleanTitle.length, queryIndex + keyword.length + 18));
    segmentSuggestionWords(nearby).forEach((word) => addTerm(word, 7));
  }
  const words = segmentSuggestionWords(cleanTitle);
  words.forEach((word, index) => {
    addTerm(word, lowerTitle.includes(query) ? 4 : 2);
    const next = words[index + 1];
    if (next && word.length + next.length <= 10 && isExactMeaningHint(`${word}${next}`)) {
      addTerm(`${word}${next}`, lowerTitle.includes(query) ? 3 : 1);
    }
  });
  return terms;
}

function getSearchSuggestionEntryWeight(entry) {
  const views = Number(entry.viewCount) || 0;
  const replies = Number(entry.replyCount) || 0;
  return 1 + Math.log10(views + 1) * 1.8 + Math.log10(replies + 1) * 2.4;
}

function collectSearchSuggestionEntriesFromDocument(doc) {
  const entries = [];
  const seen = new Set();
  const addEntry = (title, root) => {
    const cleanTitle = normalizeSuggestionText(title);
    if (!cleanTitle || seen.has(cleanTitle)) {
      return;
    }
    seen.add(cleanTitle);
    const structured = root?.matches?.(".focus-topic, .card-topic")
      ? parseStructuredTopicMeta(root)
      : null;
    const infoText = root ? getTopicInfoText(root) : "";
    const textParsed = infoText ? parseTopicMetaText(infoText) : null;
    const infoParts = root ? getTopicInfoParts(root) : null;
    let viewCount = structured?.viewCount || textParsed?.viewCount || "";
    let replyCount = structured?.replyCount || textParsed?.replyCount || "";
    if (!viewCount && infoParts?.info.classList.contains("card-topic-info")) {
      viewCount = getFirstNumber(infoParts.parts[0]?.text);
    }
    if (!replyCount && infoParts?.info.classList.contains("card-topic-info")) {
      replyCount = getFirstNumber(infoParts.parts[1]?.text);
    }
    if (!viewCount && infoParts?.info.classList.contains("focus-topic-info")) {
      viewCount = getFirstNumber(infoParts.parts[1]?.text);
    }
    entries.push({
      title: cleanTitle,
      viewCount,
      replyCount,
      weight: getSearchSuggestionEntryWeight({ viewCount, replyCount })
    });
  };

  doc.querySelectorAll(".focus-topic, .card-topic").forEach((topic) => {
    const title = getFirstText(topic, ".focus-topic-title, .card-topic-title");
    addEntry(title, topic);
  });
  doc.querySelectorAll(".board-postItem-title > a, .mainPageListTitle a, a[href*='/topic/']").forEach((node) => {
    addEntry(node.textContent, node.closest(".board-postItem-body, .mainPageListRow, .focus-topic, .card-topic"));
  });

  return entries.slice(0, 160);
}

function collectSearchSuggestionTitlesFromDocument(doc) {
  return collectSearchSuggestionEntriesFromDocument(doc).map((entry) => entry.title);
}

function extractDirectSuggestionPhrases(title, keyword) {
  const base = normalizeSuggestionText(keyword);
  const query = base.toLowerCase();
  const compactTitle = normalizeSuggestionText(title).replace(/\s+/g, "");
  const lowerTitle = compactTitle.toLowerCase();
  const phrases = [];
  const addPhrase = (phrase) => {
    const clean = trimSuggestionPhrase(phrase).replace(/\s+/g, "");
    if (isMeaningfulSearchSuggestion(clean, base) && !phrases.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      phrases.push(clean);
    }
  };
  splitSuggestionTextChunks(title).forEach((chunk) => {
    const compact = chunk.replace(/\s+/g, "");
    const lowerChunk = compact.toLowerCase();
    if (!lowerChunk.includes(query)) {
      return;
    }
    if (compact.length <= 10 && !suggestionContainsPhraseBreak(compact)) {
      addPhrase(compact);
    }
    collectHintedSuggestionPhrases(compact, base)
      .filter((phrase) => phrase.toLowerCase().includes(query))
      .forEach(addPhrase);
    const words = getOrderedSuggestionWords(compact, base);
    words.forEach((word, index) => {
      const lowerWord = word.toLowerCase();
      if (lowerWord.includes(query) && lowerWord !== query) {
        addPhrase(word);
      }
      if (lowerWord !== query) {
        return;
      }
      const previous = words[index - 1];
      const next = words[index + 1];
      if (previous && isMeaningfulSuggestionTerm(previous, base)) {
        addPhrase(`${previous}${base}`);
      }
      if (next && isMeaningfulSuggestionTerm(next, base)) {
        addPhrase(`${base}${next}`);
      }
      if (previous && next && previous.length + base.length + next.length <= 12
        && isMeaningfulSuggestionTerm(previous, base)
        && isMeaningfulSuggestionTerm(next, base)) {
        addPhrase(`${previous}${base}${next}`);
      }
    });
  });
  return phrases.slice(0, 8);
  let start = lowerTitle.indexOf(query);
  while (start >= 0) {
    const before = compactTitle.slice(Math.max(0, start - 4), start);
    const after = compactTitle.slice(start + base.length, start + base.length + 4);
    const beforeMatches = before.match(/[\u4e00-\u9fa5A-Za-z0-9]{1,4}$/g) || [];
    const afterMatches = after.match(/^[\u4e00-\u9fa5A-Za-z0-9]{1,4}/g) || [];
    const left = beforeMatches[0] || "";
    const right = afterMatches[0] || "";
    [left.slice(-4), left.slice(-3), left.slice(-2), ""].forEach((prefix) => {
      const candidate = `${prefix}${base}`;
      if (prefix && !/^(求问|请问|有没有|有无|关于|问|求)/.test(prefix) && candidate !== base && candidate.length <= 12) {
        phrases.push(candidate);
      }
    });
    [right.slice(0, 2), right.slice(0, 3), right.slice(0, 4)].forEach((suffix) => {
      const candidate = `${base}${suffix}`;
      if (suffix && !/^(怎么|如何|吗|呢|呀|啊|求|问)/.test(suffix) && candidate !== base && candidate.length <= 12) {
        phrases.push(candidate);
      }
    });
    if (left && right && left.slice(-2).length + base.length + right.slice(0, 2).length <= 12) {
      phrases.push(`${left.slice(-2)}${base}${right.slice(0, 2)}`);
    }
    start = lowerTitle.indexOf(query, start + query.length);
  }
  return [...new Set(phrases)]
    .filter((phrase) => !isWeakSuggestionTerm(phrase.replace(base, " "), query));
}

function buildSearchSuggestionsFromEntries(entries, keyword) {
  const base = normalizeSuggestionText(keyword);
  const query = base.toLowerCase();
  const directScores = new Map();
  const expandedScores = new Map();

  entries.forEach((entry) => {
    const title = entry.title;
    const weight = entry.weight || 1;
    extractDirectSuggestionPhrases(title, base).forEach((phrase) => {
      addSuggestionScore(directScores, phrase, 12 * weight);
    });
    extractSuggestionTerms(title, base).forEach(({ term, score }) => {
      const suggestion = `${base} ${term}`;
      if (!suggestion.toLowerCase().includes(`${query} ${query}`) && isMeaningfulSearchSuggestion(suggestion, base)) {
        addSuggestionScore(expandedScores, suggestion, (score + (title.toLowerCase().includes(query) ? 4 : 0)) * weight);
      }
    });
  });

  const direct = [...directScores.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([text]) => text)
    .filter((text, index, list) => list.findIndex((item) => item.includes(text) || text.includes(item)) === index)
    .slice(0, 5);
  const expanded = [...expandedScores.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([text]) => text)
    .filter((text, index, list) => list.findIndex((item) => item.includes(text) || text.includes(item)) === index);

  return [...direct, ...expanded]
    .filter((text, index, list) => list.indexOf(text) === index
      && isMeaningfulSearchSuggestion(text, base)
      && !direct.some((item) => item !== text && item.includes(text)))
    .slice(0, 10);
}

function buildSearchSuggestionsFromTitles(titles, keyword) {
  return buildSearchSuggestionsFromEntries(titles.map((title) => ({
    title: normalizeSuggestionText(title),
    viewCount: "",
    replyCount: "",
    weight: 1
  })), keyword);
}

function buildSearchSuggestionsFromDocument(doc, keyword) {
  return buildSearchSuggestionsFromEntries(collectSearchSuggestionEntriesFromDocument(doc), keyword);
}

function loadSearchSuggestionsInFrame(keyword) {
  return new Promise((resolve) => {
    if (!document.body) {
      resolve({ suggestions: [], titles: [] });
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.className = "cc98-rebuild-search-suggestion-frame";
    iframe.tabIndex = -1;
    iframe.setAttribute("aria-hidden", "true");
    let interval = 0;
    let timeout = 0;
    const finish = (result = { suggestions: [], titles: [] }) => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      iframe.remove();
      resolve(result);
    };
    iframe.addEventListener("load", () => {
      const startedAt = Date.now();
      let bestSuggestions = [];
      let bestTitles = [];
      let scrollStep = 0;
      interval = window.setInterval(() => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) {
            return;
          }
          const elapsed = Date.now() - startedAt;
          const win = iframe.contentWindow;
          if (win && elapsed > 700 && scrollStep < 5) {
            scrollStep += 1;
            win.scrollTo(0, Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0));
            win.dispatchEvent(new Event("scroll"));
          }
          const entries = collectSearchSuggestionEntriesFromDocument(doc);
          const suggestions = buildSearchSuggestionsFromEntries(entries, keyword);
          if (suggestions.length > bestSuggestions.length) {
            bestSuggestions = suggestions;
            bestTitles = entries.map((entry) => entry.title);
          }
          const hasResultSurface = Boolean(doc.querySelector(".focus-topic, .card-topic, .board-postItem-body, a[href*='/topic/']"));
          if ((bestSuggestions.length >= 6 && elapsed > 1800) || (hasResultSurface && elapsed > 4200) || elapsed > 6500) {
            finish({ suggestions: bestSuggestions, titles: bestTitles });
          }
        } catch {
          finish({ suggestions: bestSuggestions, titles: bestTitles });
        }
      }, 260);
    }, { once: true });
    timeout = window.setTimeout(() => finish({ suggestions: [], titles: [] }), 7600);
    iframe.src = getSearchUrl(keyword).href;
    document.body.append(iframe);
  });
}

function buildSearchTermCombinations(terms) {
  const combos = [];
  const normalized = pickImportantSearchTerms(terms)
    .sort((a, b) => getTermImportance(b) - getTermImportance(a))
    .slice(0, 6);
  const required = normalized
    .filter((term) => getTermImportance(term) >= 3.5)
    .slice(0, 3);
  const pick = (start, size, chosen) => {
    if (chosen.length === size) {
      const combo = chosen.join(" ");
      if (!required.length || chosen.some((term) => required.includes(term)) || chosen.length === normalized.length) {
        combos.push(combo);
      }
      return;
    }
    for (let index = start; index < normalized.length; index += 1) {
      pick(index + 1, size, [...chosen, normalized[index]]);
    }
  };
  for (let size = normalized.length; size >= 1; size -= 1) {
    pick(0, size, []);
  }
  return [...new Set(combos)].slice(0, 18);
}

function getTopicFreshnessScore(item) {
  const text = normalizeSuggestionText(item.lastReplyAt || item.hoverMeta || item.meta || "");
  if (!text) {
    return 0;
  }
  if (/刚刚|秒前/.test(text)) {
    return 42;
  }
  const relative = text.match(/(\d+)\s*(分钟前|小时前|天前|周前|月前|年前)/);
  if (relative) {
    const value = Number(relative[1]) || 0;
    const unit = relative[2];
    if (unit === "分钟前") return Math.max(24, 40 - value / 4);
    if (unit === "小时前") return Math.max(18, 34 - value);
    if (unit === "天前") return Math.max(8, 28 - value * 2.2);
    if (unit === "周前") return Math.max(4, 18 - value * 3);
    if (unit === "月前") return Math.max(1, 10 - value * 1.5);
    return 0;
  }
  if (/今天/.test(text)) return 34;
  if (/昨天/.test(text)) return 26;
  if (/前天/.test(text)) return 20;
  const absolute = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (absolute) {
    const date = new Date(Number(absolute[1]), Number(absolute[2]) - 1, Number(absolute[3]));
    const days = Math.max(0, (Date.now() - date.getTime()) / 86400000);
    return Math.max(0, 24 - Math.log10(days + 1) * 10);
  }
  return 0;
}

function getFuzzyItemScore(item, terms, combo, index) {
  const haystack = normalizeSuggestionText([
    item.title,
    item.board,
    item.user,
    item.meta,
    item.hoverMeta
  ].filter(Boolean).join(" ")).toLowerCase();
  const matchedTerms = terms.filter((term) => haystack.includes(term.toLowerCase()));
  const comboTerms = normalizeSuggestionText(combo).split(/\s+/).filter(Boolean);
  const comboHitBonus = comboTerms
    .filter((term) => haystack.includes(term.toLowerCase()))
    .reduce((sum, term) => sum + getTermImportance(term) * 16, 0);
  const title = normalizeSuggestionText(item.title).toLowerCase();
  const titleHitBonus = matchedTerms
    .filter((term) => title.includes(term.toLowerCase()))
    .reduce((sum, term) => sum + getTermImportance(term) * 22, 0);
  const views = Number(item.viewCount) || 0;
  const replies = Number(item.replyCount) || 0;
  return matchedTerms.reduce((sum, term) => sum + getTermImportance(term) * 55, 0)
    + comboHitBonus
    + titleHitBonus
    + Math.log10(views + 1) * 12
    + Math.log10(replies + 1) * 18
    + getTopicFreshnessScore(item)
    - index * 0.2;
}

async function fetchFuzzySearchItems(query, terms, combo, comboIndex) {
  try {
    const response = await fetch(getSearchUrl(query).href, {
      credentials: "include",
      cache: "force-cache"
    });
    if (response.ok) {
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const items = getTopicItems(doc);
      if (items.length) {
        return items.map((item, index) => ({
          ...item,
          fuzzyScore: getFuzzyItemScore(item, terms, combo, index) + (terms.length - combo.split(/\s+/).length) * -10 - comboIndex,
          fuzzyMatchedTerms: terms.filter((term) => normalizeSuggestionText(`${item.title} ${item.board} ${item.hoverMeta}`).toLowerCase().includes(term.toLowerCase())),
          fuzzyQuery: combo
        }));
      }
    }
  } catch {
    // Fall back to a rendered iframe below.
  }
  return loadFuzzySearchItemsInFrame(query, terms, combo, comboIndex);
}

function loadFuzzySearchItemsInFrame(query, terms, combo, comboIndex) {
  return new Promise((resolve) => {
    if (!document.body) {
      resolve([]);
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.className = "cc98-rebuild-search-suggestion-frame";
    iframe.tabIndex = -1;
    iframe.setAttribute("aria-hidden", "true");
    let interval = 0;
    let timeout = 0;
    const finish = (items = []) => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      iframe.remove();
      resolve(items);
    };
    iframe.addEventListener("load", () => {
      const startedAt = Date.now();
      let bestItems = [];
      let scrollStep = 0;
      interval = window.setInterval(() => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) {
            return;
          }
          const elapsed = Date.now() - startedAt;
          const win = iframe.contentWindow;
          if (win && elapsed > 700 && scrollStep < 3) {
            scrollStep += 1;
            win.scrollTo(0, Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0));
            win.dispatchEvent(new Event("scroll"));
          }
          const items = getTopicItems(doc).map((item, index) => ({
            ...item,
            fuzzyScore: getFuzzyItemScore(item, terms, combo, index) + (terms.length - combo.split(/\s+/).length) * -10 - comboIndex,
            fuzzyMatchedTerms: terms.filter((term) => normalizeSuggestionText(`${item.title} ${item.board} ${item.hoverMeta}`).toLowerCase().includes(term.toLowerCase())),
            fuzzyQuery: combo
          }));
          if (items.length > bestItems.length) {
            bestItems = items;
          }
          const hasNoResult = Boolean(doc.querySelector(".noResultText"));
          if ((bestItems.length && elapsed > 1300) || (hasNoResult && elapsed > 1500) || elapsed > 4200) {
            finish(bestItems);
          }
        } catch {
          finish(bestItems);
        }
      }, 260);
    }, { once: true });
    timeout = window.setTimeout(() => finish([]), 5200);
    iframe.src = getSearchUrl(query).href;
    document.body.append(iframe);
  });
}

function mergeFuzzyItems(target, items) {
  items.forEach((item) => {
    const key = item.href || item.title;
    const previous = target.get(key);
    if (!previous || item.fuzzyScore > previous.fuzzyScore) {
      const terms = new Set([...(previous?.fuzzyMatchedTerms || []), ...(item.fuzzyMatchedTerms || [])]);
      target.set(key, {
        ...item,
        fuzzyMatchedTerms: [...terms],
        hoverMeta: item.hoverMeta || previous?.hoverMeta || ""
      });
      return;
    }
    const terms = new Set([...(previous.fuzzyMatchedTerms || []), ...(item.fuzzyMatchedTerms || [])]);
    previous.fuzzyMatchedTerms = [...terms];
  });
}

function renderFuzzyFeed(feed, itemMap, isDone = false) {
  const items = [...itemMap.values()]
    .sort((a, b) => b.fuzzyScore - a.fuzzyScore || a.title.length - b.title.length)
    .slice(0, 80);
  feed.textContent = "";
  if (!items.length && isDone) {
    const empty = createElement("article", "cc98-rebuild-card");
    empty.append(createElement("div", "cc98-rebuild-card-title", "没有找到结果"));
    empty.append(createElement("p", "cc98-rebuild-card-meta", "抱歉呢前辈，没有找到你想要的帖子哦~"));
    feed.append(empty);
    return;
  }
  items.forEach((item) => {
    const matched = item.fuzzyMatchedTerms?.length ? `匹配: ${item.fuzzyMatchedTerms.join(" / ")}` : "";
    const card = renderHighlightedTopicCard({
      ...item,
      meta: item.meta || matched,
      hoverMeta: [item.hoverMeta, matched, item.fuzzyQuery ? `来源搜索: ${item.fuzzyQuery}` : ""].filter(Boolean).join("  ")
    }, item.fuzzyMatchedTerms?.length ? item.fuzzyMatchedTerms : terms);
    card.dataset.itemKey = `fuzzy:${item.href}`;
    feed.append(card);
  });
}

function createAdvancedFuzzySearchPanel(query, terms, feed, initialItems) {
  const section = createElement("section", "cc98-rebuild-fuzzy-panel");
  const header = createElement("div", "cc98-rebuild-fuzzy-header");
  const title = createElement("h2", "", "高级模糊搜索");
  const status = createElement("span", "cc98-rebuild-muted", `拆词: ${terms.join(" / ")}`);
  header.append(title, status);
  const progress = createElement("div", "cc98-rebuild-fuzzy-progress");
  const bar = createElement("span", "");
  progress.append(bar);
  const detail = createElement("p", "cc98-rebuild-card-meta", "正在按相关度从高到低合并搜索结果...");
  const queue = createElement("div", "cc98-rebuild-fuzzy-queue");
  const renderQueue = (combos) => {
    queue.textContent = "";
    combos.forEach((combo, index) => {
      const item = createElement("span", "cc98-rebuild-fuzzy-queue-item", `${index + 1}. ${combo}`);
      item.dataset.index = String(index);
      queue.append(item);
    });
  };
  renderQueue(buildSearchTermCombinations(terms));
  section.append(header, progress, detail, queue);

  const sequence = ++advancedFuzzySearchSequence;
  const itemMap = new Map();
  const runFuzzySearch = async (activeTerms, sourceItems, sourceLabel = "") => {
    if (sequence !== advancedFuzzySearchSequence) {
      return;
    }
    const combos = buildSearchTermCombinations(activeTerms);
    status.textContent = `${sourceLabel ? `${sourceLabel} ` : ""}拆词: ${activeTerms.join(" / ")}`;
    renderQueue(combos);
    bar.style.width = "0";
    mergeFuzzyItems(itemMap, sourceItems.map((item, index) => ({
      ...item,
      fuzzyScore: getFuzzyItemScore(item, activeTerms, query, index) + 80,
      fuzzyMatchedTerms: activeTerms.filter((term) => normalizeSuggestionText(`${item.title} ${item.board} ${item.hoverMeta}`).toLowerCase().includes(term.toLowerCase())),
      fuzzyQuery: query
    })));
    renderFuzzyFeed(feed, itemMap);
    for (let index = 0; index < combos.length; index += 1) {
      if (sequence !== advancedFuzzySearchSequence) {
        return;
      }
      const combo = combos[index];
      const queueItem = queue.querySelector(`[data-index="${index}"]`);
      queueItem?.classList.add("is-active");
      detail.textContent = `正在搜索 ${index + 1}/${combos.length}: ${combo}`;
      bar.style.width = `${Math.max(4, Math.round((index / combos.length) * 100))}%`;
      try {
        const items = await fetchFuzzySearchItems(combo, activeTerms, combo, index);
        mergeFuzzyItems(itemMap, items);
        renderFuzzyFeed(feed, itemMap);
        queueItem?.classList.toggle("has-result", items.length > 0);
        queueItem?.classList.toggle("is-empty", items.length === 0);
      } catch {
        queueItem?.classList.add("is-empty");
      }
      queueItem?.classList.remove("is-active");
      queueItem?.classList.add("is-done");
    }
  };

  window.setTimeout(async () => {
    let activeTerms = terms;
    if (lastSettings?.aiSearchSuggestEnabled) {
      detail.textContent = "正在用 AI 理解搜索意图...";
      const aiTerms = await refineSearchTermsWithAi(query, terms);
      if (sequence !== advancedFuzzySearchSequence) {
        return;
      }
      if (aiTerms.join("\u0000") !== terms.join("\u0000")) {
        activeTerms = aiTerms;
      }
    }
    await runFuzzySearch(activeTerms, initialItems, activeTerms === terms ? "" : "AI");
    if (sequence !== advancedFuzzySearchSequence) {
      return;
    }
    bar.style.width = "100%";
    detail.textContent = `完成：合并 ${itemMap.size} 条结果，按相关度排序。`;
    renderFuzzyFeed(feed, itemMap, true);
  }, 80);

  return section;
}

function renderSearchSuggestions(box, input, suggestions, state = "ready", onSubmit = submitRebuiltSearch) {
  box.textContent = "";
  box.dataset.state = state;
  if (state === "idle") {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (state === "loading") {
    box.append(createElement("div", "cc98-rebuild-search-suggestion-status", "正在分析相关搜索..."));
    return;
  }
  if (!suggestions.length) {
    box.append(createElement("div", "cc98-rebuild-search-suggestion-status", "暂无联想词"));
    return;
  }
  suggestions.forEach((suggestion) => {
    const option = createElement("button", "cc98-rebuild-search-suggestion", suggestion);
    option.type = "button";
    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    option.addEventListener("click", () => {
      input.value = suggestion;
      onSubmit(suggestion);
    });
    box.append(option);
  });
}

function getAiSearchSuggestConfig() {
  const provider = lastSettings?.aiSearchSuggestProvider || DEFAULT_SETTINGS.aiSearchSuggestProvider;
  const defaults = AI_SEARCH_PROVIDER_DEFAULTS[provider] || AI_SEARCH_PROVIDER_DEFAULTS.openai;
  const otherDefaults = Object.entries(AI_SEARCH_PROVIDER_DEFAULTS)
    .filter(([name]) => name !== provider)
    .map(([, value]) => value);
  const rawEndpoint = String(lastSettings?.aiSearchSuggestEndpoint ?? "").trim();
  const rawModel = String(lastSettings?.aiSearchSuggestModel ?? "").trim();
  const endpoint = rawEndpoint && !otherDefaults.some((item) => item.endpoint === rawEndpoint)
    ? rawEndpoint
    : defaults.endpoint;
  const model = rawModel && !otherDefaults.some((item) => item.model === rawModel)
    ? rawModel
    : defaults.model;
  return {
    provider,
    endpoint,
    model,
    apiKey: String(lastSettings?.aiSearchSuggestApiKey ?? "").trim()
  };
}

function canUseExternalAiSearch() {
  if (EXTERNAL_AI_SEARCH_REQUIRES_EXPLICIT_CONSENT && !lastSettings?.externalAiSearchConsent) {
    return false;
  }
  if (!lastSettings?.aiSearchSuggestEnabled) {
    return false;
  }
  const config = getAiSearchSuggestConfig();
  return Boolean(config.endpoint && config.model && config.apiKey);
}

function getSearchSuggestionCacheFingerprint() {
  if (!canUseExternalAiSearch()) {
    return "local";
  }
  const config = getAiSearchSuggestConfig();
  return `ai:${config.provider}:${config.endpoint}:${config.model}:${Boolean(config.apiKey)}`;
}

function parseAiSearchSuggestionText(text) {
  const source = String(text ?? "").trim();
  if (!source) {
    return [];
  }
  const jsonMatch = source.match(/\[[\s\S]*\]/) || source.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (Array.isArray(parsed.suggestions)) {
        return parsed.suggestions;
      }
      if (Array.isArray(parsed.terms)) {
        return parsed.terms;
      }
      if (Array.isArray(parsed.keywords)) {
        return parsed.keywords;
      }
    } catch {
      // Fall back to line parsing below.
    }
  }
  return source
    .split(/\n|；|;/)
    .map((line) => line.replace(/^[-*\d.\s"']+|["'，,。]+$/g, "").trim())
    .filter(Boolean);
}

function getAiResponseText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text;
  }
  const outputText = data?.output
    ?.flatMap((item) => item.content ?? [])
    ?.map((item) => item.text ?? item.output_text ?? "")
    ?.join("\n");
  if (outputText) {
    return outputText;
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

function sanitizeAiSearchSuggestions(keyword, suggestions) {
  const base = normalizeSuggestionText(keyword);
  const lowerBase = base.toLowerCase();
  const seen = new Set();
  return suggestions
    .map((suggestion) => normalizeSuggestionText(suggestion))
    .map((suggestion) => {
      const lowerSuggestion = suggestion.toLowerCase();
      if (lowerSuggestion.startsWith(`${lowerBase} `)) {
        return suggestion;
      }
      const term = normalizeSuggestionText(lowerSuggestion.includes(lowerBase)
        ? suggestion.replace(new RegExp(lowerBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ")
        : suggestion);
      return term ? `${base} ${term}` : "";
    })
    .filter((suggestion) => {
      const term = getSuggestionTail(suggestion, base);
      const key = suggestion.toLowerCase();
      if (!suggestion || suggestion.length > 32 || seen.has(key) || isWeakSuggestionTerm(term, lowerBase) || !isMeaningfulSearchSuggestion(suggestion, base)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

function sanitizeAiSearchTerms(query, terms) {
  const seen = new Set();
  return terms
    .map((term) => trimSuggestionPhrase(term))
    .filter((term) => {
      const key = term.toLowerCase();
      if (!term || term.length < 2 || term.length > 12 || seen.has(key) || SEARCH_OPTIONAL_TERMS.has(term) || !isMeaningfulSuggestionTerm(term, query)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

async function refineSearchTermsWithAi(query, localTerms) {
  // Privacy guard: do not send CC98 search terms or page-derived text to third-party AI services.
  void query;
  if (!canUseExternalAiSearch()) {
    return localTerms;
  }
  return localTerms;
  if (!lastSettings?.aiSearchSuggestEnabled) {
    return localTerms;
  }
  const config = getAiSearchSuggestConfig();
  if (!config.endpoint || !config.apiKey || !config.model) {
    return localTerms;
  }
  const rawQuery = String(query ?? "").trim();
  if (!rawQuery) {
    return localTerms;
  }
  const systemPrompt = [
    "你是 CC98 论坛搜索意图理解器。",
    "直接理解用户原句，输出 2 到 6 个适合 CC98 搜索的关键词或短词组。",
    "保留核心名词、学院/专业、项目/班级、版面语境和关键动作；删除我/你/为什么/要/吗/的/利弊/分析等虚词。",
    "如果原句是疑问句，不要逐字切分，要概括搜索意图。",
    "可以给出与原句强相关的论坛常用词，例如混合班可联想到竺院，但不要发散太远。",
    "只输出 JSON 字符串数组，不要解释。"
  ].join("\n");
  const userPrompt = JSON.stringify({
    rawQuery,
    fallbackTerms: localTerms
  });
  const isDeepSeek = config.provider === "deepseek";
  const body = isDeepSeek
    ? {
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 120
      }
    : {
        model: config.model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_output_tokens: 120
      };
  try {
    const response = await disabledExternalAiRequest({
      method: "DISABLED",
      headers: {
        "Content-Type": "application/json"
      },
      disabledBody: ""
    });
    if (!response.ok) {
      return localTerms;
    }
    const data = await response.json();
    const aiTerms = sanitizeAiSearchTerms(query, parseAiSearchSuggestionText(getAiResponseText(data)));
    return aiTerms.length >= 2 ? aiTerms : localTerms;
  } catch {
    return localTerms;
  }
}

async function enhanceSearchSuggestionsWithAi(keyword, localSuggestions, titles) {
  // Privacy guard: do not send CC98 keywords, suggestions, or sampled titles to third-party AI services.
  void keyword;
  void titles;
  if (!canUseExternalAiSearch()) {
    return localSuggestions;
  }
  return localSuggestions;
  if (!lastSettings?.aiSearchSuggestEnabled) {
    return localSuggestions;
  }
  const config = getAiSearchSuggestConfig();
  if (!config.endpoint || !config.apiKey || !config.model) {
    return localSuggestions;
  }
  if (Date.now() - aiSearchSuggestionLastFetchAt < 12 * 1000) {
    return localSuggestions;
  }
  const sampledTitles = titles
    .map((title) => normalizeSuggestionText(title))
    .filter(Boolean)
    .slice(0, 48);
  if (!sampledTitles.length && !localSuggestions.length) {
    return localSuggestions;
  }
  aiSearchSuggestionLastFetchAt = Date.now();

  const systemPrompt = [
    "你是 CC98 论坛搜索联想词生成器。",
    "只输出 JSON 字符串数组，3 到 8 个元素。",
    "每个元素必须是“原关键词 + 空格 + 有意义的补充词组”。",
    "不要输出完整标题，不要输出解释，不要虚构没有依据的词。"
  ].join("\n");
  const userPrompt = JSON.stringify({
    keyword: normalizeSuggestionText(keyword),
    localSuggestions,
    sampledTitles
  });
  const isDeepSeek = config.provider === "deepseek";
  const body = isDeepSeek
    ? {
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 180
      }
    : {
        model: config.model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_output_tokens: 180
      };

  try {
    const response = await disabledExternalAiRequest({
      method: "DISABLED",
      headers: {
        "Content-Type": "application/json"
      },
      disabledBody: ""
    });
    if (!response.ok) {
      return localSuggestions;
    }
    const data = await response.json();
    const aiSuggestions = sanitizeAiSearchSuggestions(keyword, parseAiSearchSuggestionText(getAiResponseText(data)));
    const merged = [...aiSuggestions, ...localSuggestions];
    return merged.filter((text, index, list) => list.indexOf(text) === index).slice(0, 10);
  } catch {
    return localSuggestions;
  }
}

async function fetchSearchSuggestions(keyword) {
  const normalized = normalizeSuggestionText(keyword);
  if (normalized.length < 2) {
    return [];
  }
  const cached = searchSuggestionCache.get(normalized);
  const cacheFingerprint = getSearchSuggestionCacheFingerprint();
  if (cached && cached.fingerprint === cacheFingerprint && Date.now() - cached.time < 10 * 60 * 1000) {
    return cached.suggestions;
  }
  if (Date.now() - searchSuggestionLastFetchAt < 2600) {
    return cached?.suggestions ?? [];
  }
  searchSuggestionLastFetchAt = Date.now();
  const response = await fetch(getSearchUrl(normalized).href, {
    credentials: "include",
    cache: "force-cache"
  });
  if (!response.ok) {
    return cached?.suggestions ?? [];
  }
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  let entries = collectSearchSuggestionEntriesFromDocument(doc);
  let titles = entries.map((entry) => entry.title);
  let suggestions = buildSearchSuggestionsFromEntries(entries, normalized);
  if (!suggestions.length) {
    const frameResult = await loadSearchSuggestionsInFrame(normalized);
    suggestions = frameResult.suggestions;
    titles = frameResult.titles;
  }
  suggestions = await enhanceSearchSuggestionsWithAi(normalized, suggestions, titles);
  searchSuggestionCache.set(normalized, {
    time: Date.now(),
    fingerprint: cacheFingerprint,
    suggestions
  });
  return suggestions;
}

function createSearchForm() {
  const nativeSearchState = getNativeSearchState();
  let selectedSearchType = nativeSearchState.selected;
  const form = createElement("form", "cc98-rebuild-search");
  form.dataset.searchType = selectedSearchType;
  const typeWrap = createElement("div", "cc98-rebuild-search-type-wrap");
  const typeButton = createElement("button", "cc98-rebuild-search-type", selectedSearchType);
  typeButton.type = "button";
  typeButton.setAttribute("aria-haspopup", "listbox");
  typeButton.setAttribute("aria-expanded", "false");
  const typeMenu = createElement("div", "cc98-rebuild-search-type-menu");
  typeMenu.hidden = true;
  typeMenu.setAttribute("role", "listbox");
  const closeTypeMenu = () => {
    typeMenu.hidden = true;
    typeButton.setAttribute("aria-expanded", "false");
  };
  const setSearchType = (type) => {
    selectedSearchType = type;
    form.dataset.searchType = type;
    typeButton.textContent = type;
    closeTypeMenu();
    selectNativeSearchType(getNativeSearchRoot(), type);
    if (!canShowSearchSuggestionsForType(type)) {
      window.clearTimeout(suggestTimer);
      renderSearchSuggestions(suggestionBox, input, [], "idle");
    }
  };
  const input = createElement("input", "");
  input.type = "search";
  input.placeholder = "搜索主题";
  input.value = getCurrentSearchKeyword();
  input.autocomplete = "off";
  const inputWrap = createElement("div", "cc98-rebuild-search-field");
  const suggestionBox = createElement("div", "cc98-rebuild-search-suggestions");
  suggestionBox.hidden = true;
  inputWrap.append(input, suggestionBox);

  const button = createElement("button", "", "搜索");
  button.type = "submit";
  form.append(inputWrap, button);

  let suggestTimer = 0;
  const scheduleSuggestions = () => {
    window.clearTimeout(suggestTimer);
    const keyword = input.value.trim();
    if (keyword.length < 2) {
      renderSearchSuggestions(suggestionBox, input, [], "idle");
      return;
    }
    const cached = searchSuggestionCache.get(normalizeSuggestionText(keyword));
    if (cached && cached.suggestions.length) {
      renderSearchSuggestions(suggestionBox, input, cached.suggestions);
    }
    suggestTimer = window.setTimeout(async () => {
      const sequence = ++searchSuggestionSequence;
      renderSearchSuggestions(suggestionBox, input, cached?.suggestions ?? [], cached ? "ready" : "loading");
      try {
        const suggestions = await fetchSearchSuggestions(keyword);
        if (sequence === searchSuggestionSequence && input.value.trim() === keyword) {
          renderSearchSuggestions(suggestionBox, input, suggestions);
        }
      } catch {
        if (sequence === searchSuggestionSequence) {
          renderSearchSuggestions(suggestionBox, input, cached?.suggestions ?? []);
        }
      }
    }, 900);
  };

  input.addEventListener("input", scheduleSuggestions);
  input.addEventListener("focus", scheduleSuggestions);
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      suggestionBox.hidden = true;
    }, 140);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = input.value.trim();
    if (!keyword) {
      input.focus();
      return;
    }
    submitRebuiltSearch(keyword);
  });
  return form;
}

function createRebuiltSearchForm() {
  const nativeSearchState = getNativeSearchState();
  let selectedSearchType = nativeSearchState.selected;
  let suggestTimer = 0;
  const form = createElement("form", "cc98-rebuild-search");
  form.dataset.searchType = selectedSearchType;

  const typeWrap = createElement("div", "cc98-rebuild-search-type-wrap");
  const typeButton = createElement("button", "cc98-rebuild-search-type", selectedSearchType);
  typeButton.type = "button";
  typeButton.setAttribute("aria-haspopup", "listbox");
  typeButton.setAttribute("aria-expanded", "false");
  const typeMenu = createElement("div", "cc98-rebuild-search-type-menu");
  typeMenu.hidden = true;
  typeMenu.setAttribute("role", "listbox");

  const input = createElement("input", "");
  input.type = "search";
  input.placeholder = "\u8bf7\u8f93\u5165\u641c\u7d22\u5185\u5bb9";
  input.value = getCurrentSearchKeyword();
  input.autocomplete = "off";
  const inputWrap = createElement("div", "cc98-rebuild-search-field");
  const suggestionBox = createElement("div", "cc98-rebuild-search-suggestions");
  suggestionBox.hidden = true;
  inputWrap.append(input, suggestionBox);

  const closeTypeMenu = () => {
    typeMenu.hidden = true;
    typeButton.setAttribute("aria-expanded", "false");
  };
  const submitCurrentSearch = (value) => submitRebuiltSearch(value, selectedSearchType);
  const setSearchType = (type) => {
    selectedSearchType = type;
    form.dataset.searchType = type;
    typeButton.textContent = type;
    closeTypeMenu();
    selectNativeSearchType(getNativeSearchRoot(), type);
    if (!canShowSearchSuggestionsForType(type)) {
      window.clearTimeout(suggestTimer);
      renderSearchSuggestions(suggestionBox, input, [], "idle", submitCurrentSearch);
    }
  };

  nativeSearchState.options.forEach((type) => {
    const option = createElement("button", "cc98-rebuild-search-type-option", type);
    option.type = "button";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(type === selectedSearchType));
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => {
      typeMenu.querySelectorAll(".cc98-rebuild-search-type-option").forEach((node) => {
        node.setAttribute("aria-selected", String(node === option));
      });
      setSearchType(type);
      input.focus({ preventScroll: true });
    });
    typeMenu.append(option);
  });
  typeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextOpen = typeMenu.hidden;
    typeMenu.hidden = !nextOpen;
    typeButton.setAttribute("aria-expanded", String(nextOpen));
  });
  typeWrap.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!typeWrap.contains(document.activeElement)) {
        closeTypeMenu();
      }
    }, 0);
  });
  typeWrap.append(typeButton, typeMenu);

  const submitButton = createElement("button", "cc98-rebuild-search-submit", "\u641c\u7d22");
  submitButton.type = "submit";
  form.append(typeWrap, inputWrap, submitButton);

  const scheduleSuggestions = () => {
    window.clearTimeout(suggestTimer);
    const keyword = input.value.trim();
    if (keyword.length < 2 || !canShowSearchSuggestionsForType(selectedSearchType)) {
      renderSearchSuggestions(suggestionBox, input, [], "idle", submitCurrentSearch);
      return;
    }
    const cached = searchSuggestionCache.get(normalizeSuggestionText(keyword));
    if (cached && cached.suggestions.length) {
      renderSearchSuggestions(suggestionBox, input, cached.suggestions, "ready", submitCurrentSearch);
    }
    suggestTimer = window.setTimeout(async () => {
      const sequence = ++searchSuggestionSequence;
      const typeAtRequest = selectedSearchType;
      renderSearchSuggestions(suggestionBox, input, cached?.suggestions ?? [], cached ? "ready" : "loading", submitCurrentSearch);
      try {
        const suggestions = await fetchSearchSuggestions(keyword);
        if (sequence === searchSuggestionSequence && input.value.trim() === keyword && selectedSearchType === typeAtRequest) {
          renderSearchSuggestions(suggestionBox, input, suggestions, "ready", submitCurrentSearch);
        }
      } catch {
        if (sequence === searchSuggestionSequence) {
          renderSearchSuggestions(suggestionBox, input, cached?.suggestions ?? [], "ready", submitCurrentSearch);
        }
      }
    }, 900);
  };

  input.addEventListener("input", scheduleSuggestions);
  input.addEventListener("focus", () => {
    closeTypeMenu();
    scheduleSuggestions();
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      suggestionBox.hidden = true;
    }, 140);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = input.value.trim();
    if (!keyword) {
      input.focus();
      return;
    }
    submitCurrentSearch(keyword);
  });
  return form;
}

function getErrorPageData() {
  const source = document.querySelector(".errorState");
  const rawTitle = getFirstText(document, ".errorTitle") || "糟糕！好像出错了";
  const message = getFirstText(document, ".errorText") || document.title.replace(" - CC98论坛", "") || "页面暂时无法访问";
  const originalAction = getFirstLink(document, ".errorState .returnIndexBtn a[href], .errorState a[href]");
  const isNotLoggedIn = /未登录|401|log/i.test(`${message} ${document.title} ${originalAction?.href || ""}`);
  const iconSrc = source?.querySelector?.("img")?.getAttribute("src") || "";
  const code = isNotLoggedIn
    ? "401"
    : (/404|不存在/.test(`${message} ${document.title} ${iconSrc}`) ? "404" : "!");
  const action = isNotLoggedIn
    ? { text: "去登录", href: "https://www.cc98.org/logOn" }
    : { text: originalAction?.text || "返回首页", href: originalAction?.href || "https://www.cc98.org/" };
  return {
    code,
    title: rawTitle,
    message,
    action,
    tone: isNotLoggedIn ? "auth" : (code === "404" ? "missing" : "generic")
  };
}

function renderErrorPage(app) {
  const data = getErrorPageData();
  const shell = createElement("section", `cc98-rebuild-error-page is-${data.tone}`);
  const badge = createElement("div", "cc98-rebuild-error-code", data.code);
  const content = createElement("div", "cc98-rebuild-error-content");
  content.append(createElement("p", "cc98-rebuild-kicker", "CC98"));
  content.append(createElement("h1", "", data.title));
  content.append(createElement("p", "cc98-rebuild-error-message", data.message));

  const actions = createElement("div", "cc98-rebuild-error-actions");
  actions.append(createLink("cc98-rebuild-action cc98-rebuild-error-primary", data.action.text, data.action.href));
  actions.append(createButton("cc98-rebuild-action cc98-rebuild-error-secondary", "返回上一页", () => {
    if (history.length > 1) {
      history.back();
      return;
    }
    location.href = "https://www.cc98.org/";
  }));
  content.append(actions);
  shell.append(badge, content);
  app.append(shell);
}

function renderGeneric(app) {
  const links = [...document.querySelectorAll('#root a[href^="http"], #root a[href^="/"]')]
    .map((link) => ({ title: link.textContent.trim(), href: link.href }))
    .filter((item) => item.title)
    .slice(0, 48);
  const section = createElement("section", "cc98-rebuild-section");
  section.append(createElement("h2", "", "页面链接"));
  const list = createElement("div", "cc98-rebuild-list");
  links.forEach((item) => list.append(renderTopicCard(item)));
  section.append(list);
  app.append(section);
}

function renderRebuiltUi() {
  if (isRebuilding) {
    return;
  }
  isRebuilding = true;

  document.documentElement.classList.remove("cc98-comfort-rebuild-active");
  document.documentElement.dataset.cc98ComfortRebuildReady = "false";

  const existing = document.querySelector("#cc98-comfort-app");
  if (!lastSettings?.enabled || !lastSettings.rebuildUi || !document.body) {
    if (existing) {
      legacyQuoteGuardObserver?.disconnect();
      legacyQuoteGuardObserver = null;
      restoreReparentedNativeNodes(existing);
      existing.remove();
    }
    hideLoadingOverlay();
    isRebuilding = false;
    return;
  }

  if (existing) {
    legacyQuoteGuardObserver?.disconnect();
    legacyQuoteGuardObserver = null;
    restoreReparentedNativeNodes(existing);
    existing.remove();
  }

  try {
    removeDecorativeFrameImages(document);
    const app = createElement("div", "cc98-rebuild-shell");
    app.id = "cc98-comfort-app";
    app.dataset.cc98ComfortVersion = EXTENSION_VERSION;
    bindRebuiltFloorLinks(app);
    bindImageViewer(app);
    bindPostDownloadButtons(app);

    const kind = getPageKind();
    if (kind !== "message") {
      messageTitleObserver?.disconnect();
      messageTitleObserver = null;
    }
    app.dataset.pageKind = kind;
    app.dataset.homeHotOnly = String(Boolean(lastSettings.homeHotOnly && kind === "home"));

    const nav = createElement("header", "cc98-rebuild-topbar");
    const brand = createLink("cc98-rebuild-brand", "CC98 Reborn", "https://www.cc98.org/");
    brand.setAttribute("aria-label", "返回 CC98 首页");
    nav.append(brand);
    const navLinks = createElement("nav", "cc98-rebuild-nav");
    [
      ["首页", "https://www.cc98.org/"],
      ["版面", "https://www.cc98.org/boardList"],
      ["新帖", "https://www.cc98.org/newTopics"],
      ["关注", "https://www.cc98.org/focus"],
      ["精选", "https://www.cc98.org/recommendedTopics"]
    ].forEach(([label, href]) => navLinks.append(createLink("", label, href)));
    nav.append(navLinks);
    nav.append(createRebuiltSearchForm());
    const actions = createElement("div", "cc98-rebuild-actions");
    actions.append(createButton("cc98-rebuild-icon-button", "刷新", () => location.reload()));
    actions.append(renderTopbarUserEntry());
    nav.append(actions);
    app.append(nav);

    if (!["board", "userCenter", "message", "signin", "login", "error"].includes(kind) && !(kind === "home" && lastSettings.homeHotOnly)) {
      const hero = createElement("section", "cc98-rebuild-hero");
      hero.append(createElement("p", "cc98-rebuild-kicker", `Reborn View · v${EXTENSION_VERSION}`));
      hero.append(createElement("h1", "", getPageTitle()));
      app.append(hero);
    }

    if (kind === "home") {
      renderHome(app);
    } else if (kind === "boardList") {
      renderBoards(app);
    } else if (kind === "board") {
      renderBoardPage(app);
    } else if (kind === "editor") {
      renderEditorPage(app);
    } else if (kind === "login") {
      renderLoginPage(app);
    } else if (kind === "signin") {
      renderSignInPage(app);
    } else if (kind === "error") {
      renderErrorPage(app);
    } else if (kind === "message") {
      renderMessagePage(app);
    } else if (kind === "topics" || kind === "search") {
      renderTopics(app);
    } else if (kind === "post") {
      renderPost(app);
    } else if (kind === "userCenter") {
      renderUserCenter(app);
    } else {
      renderGeneric(app);
    }

    if (!["login", "error"].includes(kind) && app.children.length <= 2) {
      const fallback = createElement("section", "cc98-rebuild-section");
      fallback.append(createElement("h2", "", "正在等待页面内容"));
      fallback.append(createElement("p", "cc98-rebuild-card-meta", "CC98 原页面还没有加载出可抽取内容。稍后会自动更新，也可以点击刷新。"));
      app.append(fallback);
    }

    document.body.prepend(app);
    stabilizeTopbarUserEntry(app);
    [120, 480, 1200, 2400, 4200, 6500].forEach((delay) => {
      setTimeout(() => stabilizeTopbarUserEntry(app), delay);
    });
    rewriteLegacyQuoteInlineStyles(app);
    stabilizePostQuoteBlocks(app);
    forceLegacyQuotesInRebuiltRoot(app);
    stabilizeEmojiRendering(app);
    installLegacyQuoteGuard(app);
    requestAnimationFrame(() => {
      rewriteLegacyQuoteInlineStyles(app);
      stabilizePostQuoteBlocks(app);
      forceLegacyQuotesInRebuiltRoot(app);
      stabilizeEmojiRendering(app);
    });
    setupRebuiltImagePlaceholders(app);
    document.documentElement.classList.add("cc98-comfort-rebuild-active");
    document.documentElement.dataset.cc98ComfortRebuildReady = "true";
    hideLoadingOverlayWhenReady(app);
    armAutoLoader();
    startPostLazyFallbackPrewarm();
  } catch (error) {
    console.error("[CC98 Reborn] rebuild failed", error);
    legacyQuoteGuardObserver?.disconnect();
    legacyQuoteGuardObserver = null;
    document.querySelector("#cc98-comfort-app")?.remove();
    document.documentElement.classList.remove("cc98-comfort-rebuild-active");
    document.documentElement.dataset.cc98ComfortRebuildReady = "false";
    hideLoadingOverlay();
  } finally {
    isRebuilding = false;
  }
}

function getBlockReason(item, settings) {
  const blockedBoards = parseList(settings.blockedBoards);
  const blockedKeywords = parseList(settings.blockedTitleKeywords);
  const blockedUserIds = parseList(settings.blockedUserIds).map((uid) => uid.replace(/\D/g, "")).filter(Boolean);
  const boardInfo = getBoardInfo(item);
  const title = getTitleText(item);
  const userIds = getUserIds(item);

  const matchedBoard = blockedBoards.find((rule) => {
    const normalizedRule = normalizeText(rule);
    return boardInfo.ids.includes(rule.trim()) || boardInfo.names.some((name) => normalizeText(name).includes(normalizedRule));
  });
  if (matchedBoard) {
    return `版面：${matchedBoard}`;
  }

  const matchedKeyword = blockedKeywords.find((keyword) => title.toLowerCase().includes(keyword.toLowerCase()));
  if (matchedKeyword) {
    return `关键词：${matchedKeyword}`;
  }

  const matchedUid = blockedUserIds.find((uid) => userIds.includes(uid));
  if (matchedUid) {
    return `UID：${matchedUid}`;
  }

  return "";
}

function clearBlockedState() {
  document.querySelectorAll(".cc98-comfort-is-blocked").forEach((item) => {
    item.classList.remove("cc98-comfort-is-blocked");
    item.removeAttribute("data-cc98-comfort-blocked-reason");
  });
  document.querySelectorAll(".cc98-comfort-placeholder").forEach((placeholder) => placeholder.remove());
}

function isNativeSkinLink(link) {
  const href = link.getAttribute("href") ?? "";
  return link.id === "mainStylesheet"
    || /\/static\/content\/css_/i.test(href)
    || /_files\/css_/i.test(href)
    || /\\_files\\css_/i.test(href);
}

function applyNativeSkinPolicy() {
  if (!document.head || !lastSettings) {
    return;
  }

  let preservedNativeSkin = null;
  document.querySelectorAll('link[rel~="stylesheet"]').forEach((link) => {
    if (!isNativeSkinLink(link)) {
      return;
    }

    if (lastSettings.enabled && lastSettings.neutralizeNativeSkin && !preservedNativeSkin) {
      preservedNativeSkin = link;
      const previous = neutralizedLinks.get(link);
      if (previous) {
        link.disabled = previous.disabled;
        if (previous.media === null) {
          link.removeAttribute("media");
        } else {
          link.setAttribute("media", previous.media);
        }
        neutralizedLinks.delete(link);
      }
      link.dataset.cc98ComfortNativeSkinPreserved = "true";
      return;
    }

    if (lastSettings.enabled && lastSettings.neutralizeNativeSkin && preservedNativeSkin) {
      if (!neutralizedLinks.has(link)) {
        neutralizedLinks.set(link, {
          disabled: link.disabled,
          media: link.getAttribute("media")
        });
      }
      if (!link.disabled) {
        link.disabled = true;
      }
      if (link.getAttribute("media") !== "not all") {
        link.setAttribute("media", "not all");
      }
      link.dataset.cc98ComfortNeutralized = "true";
      delete link.dataset.cc98ComfortNativeSkinPreserved;
      return;
    }

    const previous = neutralizedLinks.get(link);
    delete link.dataset.cc98ComfortNativeSkinPreserved;
    if (!previous) {
      return;
    }
    link.disabled = previous.disabled;
    if (previous.media === null) {
      link.removeAttribute("media");
    } else {
      link.setAttribute("media", previous.media);
    }
    delete link.dataset.cc98ComfortNeutralized;
    neutralizedLinks.delete(link);
  });
}

function createPlaceholder(item, reason, settings) {
  const placeholder = document.createElement("div");
  placeholder.className = "cc98-comfort-placeholder";
  placeholder.innerHTML = `
    <div class="cc98-comfort-placeholder-text"></div>
    <button class="cc98-comfort-placeholder-button" type="button">显示</button>
  `;

  const text = placeholder.querySelector(".cc98-comfort-placeholder-text");
  text.textContent = `${settings.placeholderText} · ${reason}`;

  placeholder.querySelector("button").addEventListener("click", () => {
    item.classList.remove("cc98-comfort-is-blocked");
    item.dataset.cc98ComfortRevealed = "true";
    placeholder.remove();
  });

  item.before(placeholder);
}

function runFiltering() {
  if (isFiltering) {
    return;
  }

  isFiltering = true;
  clearBlockedState();

  if (!lastSettings?.enabled) {
    isFiltering = false;
    return;
  }

  const hasRules = parseList(lastSettings.blockedBoards).length > 0
    || parseList(lastSettings.blockedTitleKeywords).length > 0
    || parseList(lastSettings.blockedUserIds).length > 0;

  if (!hasRules) {
    isFiltering = false;
    return;
  }

  document.querySelectorAll(BLOCKABLE_SELECTORS).forEach((item) => {
    if (item.dataset.cc98ComfortRevealed === "true") {
      return;
    }

    const reason = getBlockReason(item, lastSettings);
    if (!reason) {
      return;
    }

    item.classList.add("cc98-comfort-is-blocked");
    item.dataset.cc98ComfortBlockedReason = reason;
    createPlaceholder(item, reason, lastSettings);
  });

  isFiltering = false;
}

function scheduleFiltering() {
  if (filterQueued) {
    return;
  }

  filterQueued = true;
  requestAnimationFrame(() => {
    filterQueued = false;
    runFiltering();
  });
}

function scheduleRebuild() {
  if (handleTopicFirstPagePrevisitNavigation()) {
    return;
  }
  if (shouldPrewarmOriginalBeforeRebuild()) {
    startOriginalPagePrewarm();
    return;
  }
  if (rebuildQueued) {
    return;
  }

  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    if (handleTopicFirstPagePrevisitNavigation()) {
      return;
    }
    if (shouldPrewarmOriginalBeforeRebuild()) {
      startOriginalPagePrewarm();
      return;
    }
    renderRebuiltUi();
  });
}

function scheduleDelayedRebuilds() {
  if (delayedRebuildTimers.length) {
    return;
  }
  delayedRebuildTimers = [120, 520, 1300].map((delay, index, delays) => (
    window.setTimeout(() => {
      scheduleFiltering();
      scheduleRebuild();
      if (index === delays.length - 1) {
        delayedRebuildTimers = [];
      }
    }, delay)
  ));
}

function appendUniqueCard(feed, key, card) {
  const escapedKey = typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(key)
    : key.replace(/["\\]/g, "\\$&");
  if (!feed || feed.querySelector(`[data-item-key="${escapedKey}"]`)) {
    return false;
  }
  card.dataset.itemKey = key;
  feed.append(card);
  return true;
}

function upsertCard(feed, key, card) {
  const escapedKey = typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(key)
    : key.replace(/["\\]/g, "\\$&");
  if (!feed) {
    return false;
  }
  card.dataset.itemKey = key;
  const existing = feed.querySelector(`[data-item-key="${escapedKey}"]`);
  if (existing) {
    existing.replaceWith(card);
    return true;
  }
  feed.append(card);
  return true;
}

function syncRebuiltContent() {
  if (isRebuilding || !lastSettings?.enabled || !lastSettings.rebuildUi) {
    return;
  }

  removeDecorativeFrameImages(document);
  const app = document.querySelector("#cc98-comfort-app");
  stabilizeTopbarUserEntry(app);
  const feed = app?.querySelector("[data-feed-kind]");
  if (getPageKind() === "userCenter") {
    updateUserCenterHero(app);
    return;
  }
  if (!feed) {
    scheduleRebuild();
    return;
  }

  if (feed.dataset.feedKind === "topics") {
    getTopicItems().forEach((item) => {
      upsertCard(feed, `topic:${item.href}`, renderTopicCard(item));
    });
    return;
  }

  if (feed.dataset.feedKind === "boardTopics") {
    getBoardTopicItems().forEach((item) => {
      upsertCard(feed, `board-topic:${item.href}`, renderBoardTopicCard(item));
    });
    return;
  }

  if (feed.dataset.feedKind === "post") {
    getPostItems().forEach((item) => {
      appendUniqueCard(feed, `post:${item.id}`, renderPostCard(item));
    });
    return;
  }

  if (getPageKind() === "userCenter") {
    updateUserCenterHero(app);
  }
}

function scheduleSync() {
  const now = Date.now();
  if (now - lastSyncScheduledAt < 700) {
    return;
  }
  lastSyncScheduledAt = now;

  if (syncQueued) {
    return;
  }

  syncQueued = true;
  setTimeout(() => {
    syncQueued = false;
    syncRebuiltContent();
  }, 220);
}

function pokeNativeInfiniteLoad() {
  if (!lastSettings?.enabled || !lastSettings.rebuildUi) {
    return;
  }
  if (!["topics", "search", "post", "board"].includes(getPageKind())) {
    return;
  }
  const now = Date.now();
  if (isPokingNativeScroll || now - lastAutoLoadAt < 1200) {
    return;
  }
  lastAutoLoadAt = now;
  isPokingNativeScroll = true;

  const scrollEvent = new Event("scroll", { bubbles: true });
  window.dispatchEvent(scrollEvent);
  document.dispatchEvent(scrollEvent);

  const loadMore = document.querySelector(
    "#focus-topic-getMore, [class*='getMore'], [class*='loadMore'], [id*='getMore'], [id*='loadMore']"
  );
  if (loadMore instanceof HTMLElement && getComputedStyle(loadMore).display !== "none") {
    loadMore.click();
  }
  setTimeout(() => {
    isPokingNativeScroll = false;
  }, 100);
}

function armAutoLoader() {
  if (autoLoadArmed) {
    return;
  }

  autoLoadArmed = true;
  window.addEventListener("scroll", () => {
    if (!lastSettings?.enabled || !lastSettings.rebuildUi) {
      return;
    }
    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 900;
    if (!nearBottom) {
      return;
    }
    pokeNativeInfiniteLoad();
    scheduleSync();
  }, { passive: true });
}

function ensureObserver() {
  if (observer || !document.body) {
    return;
  }

  observer = new MutationObserver((records) => {
    const hasSourceMutation = records.some((record) => {
      const target = record.target;
      const app = document.querySelector("#cc98-comfort-app");
      const changedNodes = [...record.addedNodes, ...record.removedNodes];
      const onlyRebuildNodes = changedNodes.length > 0 && changedNodes.every((node) => {
        return node instanceof Element && (node.id === "cc98-comfort-app" || Boolean(node.closest?.("#cc98-comfort-app")));
      });
      if (onlyRebuildNodes) {
        return false;
      }
      if (!(target instanceof Node) || app?.contains(target)) {
        return false;
      }
      return changedNodes.some((node) => {
        return node instanceof Element
          && !node.closest?.("#cc98-comfort-app")
          && (
            node.matches?.(".topBarRight, .topBarUserInfo, .topBarUserCenter, .topBarUserCenter-mainPage, .topBarMessageDetails, .topBarMessageDetails-mainPage, .focus-topic, .card-topic, .board-postItem-body, article, [class*='floor'], [class*='post'], [class*='reply']")
            || Boolean(node.querySelector?.(".topBarRight, .topBarUserInfo, .topBarUserCenter, .topBarUserCenter-mainPage, .topBarMessageDetails, .topBarMessageDetails-mainPage, .focus-topic, .card-topic, .board-postItem-body, article, [class*='floor'], [class*='post'], [class*='reply']"))
          );
      });
    });
    if (!hasSourceMutation) {
      return;
    }

    if (!isFiltering) {
      scheduleFiltering();
    }
    if (!isRebuilding) {
      scheduleSync();
    }
  });
  observer.observe(document.querySelector("#root") ?? document.body, { childList: true, subtree: true });
}

function patchHistoryNavigation() {
  if (historyPatched) {
    return;
  }

  historyPatched = true;
  let previousRouteKey = getRoutePageKey();
  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function patchedHistoryMethod(...args) {
      const beforeRouteKey = getRoutePageKey();
      const result = original.apply(this, args);
      setTimeout(() => {
        const nextRouteKey = getRoutePageKey();
        previousRouteKey = nextRouteKey;
        scheduleFiltering();
        if (nextRouteKey !== beforeRouteKey) {
          scheduleDelayedRebuilds();
        } else {
          scrollToCurrentRebuiltHash();
          scheduleSync();
        }
      }, 80);
      return result;
    };
  });
  window.addEventListener("popstate", () => {
    if (document.querySelector("#cc98-comfort-image-viewer")) {
      closeImageViewer(true);
      return;
    }
    const nextRouteKey = getRoutePageKey();
    if (nextRouteKey !== previousRouteKey) {
      previousRouteKey = nextRouteKey;
      scheduleDelayedRebuilds();
      return;
    }
    scrollToCurrentRebuiltHash();
    scheduleSync();
  });
  window.addEventListener("hashchange", () => {
    scrollToCurrentRebuiltHash();
  });
}

function ensureHeadObserver() {
  if (headObserver || !document.head) {
    return;
  }

  headObserver = new MutationObserver(() => {
    applyNativeSkinPolicy();
  });
  headObserver.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "media", "rel", "id"] });
  applyNativeSkinPolicy();
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) {
    return;
  }

  applySettings(changes[STORAGE_KEY].newValue);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CC98_COMFORT_GET_STATE") {
    sendResponse({ settings: lastSettings ?? DEFAULT_SETTINGS });
    return true;
  }

  return false;
});

function bootNormalPage() {
  injectSecurityWatermarkPageBridge();
  ensureSecurityWatermark();
  enforceRecentLogoutRedirectIntent();
  bindGlobalTopbarAuthRedirects();
  document.addEventListener("DOMContentLoaded", () => {
    injectSecurityWatermarkPageBridge();
    ensureSecurityWatermark();
    enforceRecentLogoutRedirectIntent();
    bindGlobalTopbarAuthRedirects();
    ensureLegacyColorPickerSuppressor();
    bindGlobalEditorColorInterceptor();
    ensureHeadObserver();
    ensureObserver();
    ensureNativeAntUiStabilizer();
    patchHistoryNavigation();
    scheduleFiltering();
    scheduleRebuild();
    setTimeout(scheduleRebuild, 600);
    setTimeout(scheduleSync, 1400);
  });

  ensureLegacyColorPickerSuppressor();
  bindGlobalEditorColorInterceptor();
  ensureHeadObserver();
  ensureObserver();
  ensureNativeAntUiStabilizer();
  patchHistoryNavigation();
  scheduleFiltering();
  scheduleRebuild();
  setTimeout(scheduleRebuild, 600);
  setTimeout(scheduleSync, 1400);

  loadSettings();
}

bootNormalPage();
