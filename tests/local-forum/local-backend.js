const fs = require("fs");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");
const {
  createOpaqueToken,
  digestToken,
  extractBearerToken,
  hashPassword,
  isBoardModerator,
  isSiteAdmin,
  normalizeRoles,
  sanitizeUser,
  validatePassword,
  validateUserName,
  verifyPassword
} = require("./auth");

const SCHEMA_VERSION = 4;
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 20;
const ACCESS_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_CODE_LIFETIME_MS = 5 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_SIGNIN_DAY = "2016-06-01";
const DEFAULT_ADMIN_PASSWORD = "LocalTest!2026";
const DEFAULT_MEMBER_PASSWORD = "SyntaxTest!2026";
const MAX_THEME_ID = 29;
const LOCAL_CLIENT_ID = "9a1fd200-8687-44b1-4c20-08d50a96e5cd";
const LOCAL_CLIENT_SECRET = "8b53f727-08e2-4509-8857-e34bf92b27f2";
const MAX_EXTENSION_STORAGE_BYTES = 2 * 1024 * 1024;
const MAX_EXTENSION_STORAGE_KEY_LENGTH = 240;
const RESERVED_EXTENSION_STORAGE_PATTERNS = [
  /openid.*(?:credential|token|secret)/i,
  /(?:access|refresh).*token/i
];

const DEFAULT_THEME_SETTING = Object.freeze({
  enableDayNightSwitch: false,
  syncWithBrowserDayNightMode: false,
  dayStartTime: "08:00:00",
  nightStartTime: "23:00:00"
});

const DEFAULT_EXTENSION_SETTINGS = Object.freeze({
  enabled: true,
  theme: "soft",
  density: "comfortable",
  fontScale: 100,
  emojiScale: 100,
  neutralizeNativeSkin: true,
  rebuildUi: true,
  roundUi: true,
  cornerRadius: 10,
  prewarmPostImages: false,
  imageLoadDuration: 2100,
  previsitFirstPageForTopicImages: false,
  openLinksInNewTab: false,
  sideTopbar: false,
  replyRebornTail: true,
  minimalMode: false,
  homeHotOnly: false,
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
  placeholderText: "已根据你的屏蔽规则折叠一条内容"
});

function defaultExtensionStorageForUser(user) {
  return {
    cc98ComfortSettings: { ...DEFAULT_EXTENSION_SETTINGS },
    ...(user ? {
      "cc98RebornOpenIdBinding:v1": {
        ok: true,
        bound: true,
        provider: "cc98-local-test",
        userId: String(user.id),
        userName: user.name,
        watermarkIdPrefix: text(user.watermarkId, "", 32).split("-")[0] || "LOCAL",
        boundAt: Date.now()
      }
    } : {})
  };
}

function extensionStorageSize(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function extensionStorageVersion(value) {
  return digestToken(JSON.stringify(value || {})).slice(0, 20);
}

function normalizeThemeSetting(value, fallback = DEFAULT_THEME_SETTING) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_THEME_SETTING;
  const validTime = (candidate, defaultValue) => {
    const normalized = String(candidate ?? "").trim();
    return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(normalized)
      ? (normalized.length === 5 ? `${normalized}:00` : normalized)
      : defaultValue;
  };
  return {
    enableDayNightSwitch: typeof source.enableDayNightSwitch === "boolean"
      ? source.enableDayNightSwitch
      : Boolean(base.enableDayNightSwitch),
    syncWithBrowserDayNightMode: typeof source.syncWithBrowserDayNightMode === "boolean"
      ? source.syncWithBrowserDayNightMode
      : Boolean(base.syncWithBrowserDayNightMode),
    dayStartTime: validTime(source.dayStartTime, validTime(base.dayStartTime, DEFAULT_THEME_SETTING.dayStartTime)),
    nightStartTime: validTime(source.nightStartTime, validTime(base.nightStartTime, DEFAULT_THEME_SETTING.nightStartTime))
  };
}

function validateExtensionStorageKey(key) {
  const normalized = String(key ?? "");
  return Boolean(
    normalized
    && normalized.length <= MAX_EXTENSION_STORAGE_KEY_LENGTH
    && !/[\u0000-\u001f\u007f]/.test(normalized)
    && !RESERVED_EXTENSION_STORAGE_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function normalizeExtensionStorageRecord(record, fallback = {}) {
  const source = record && typeof record === "object" && !Array.isArray(record) ? record : fallback;
  const normalized = {};
  for (const [key, value] of Object.entries(source)) {
    if (!validateExtensionStorageKey(key)) continue;
    try {
      const clone = JSON.parse(JSON.stringify(value));
      if (extensionStorageSize({ [key]: clone }) <= MAX_EXTENSION_STORAGE_BYTES) normalized[key] = clone;
    } catch {
      // Non-serializable extension values are not valid chrome.storage data.
    }
  }
  if (extensionStorageSize(normalized) > MAX_EXTENSION_STORAGE_BYTES) return { ...fallback };
  return normalized;
}

function isoNow() {
  return new Date().toISOString();
}

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function text(value, fallback = "", maximum = 8000) {
  return String(value ?? fallback).slice(0, maximum);
}

function boolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["", "0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function dateKeyAtOffset(offsetDays = 0) {
  const date = new Date(Date.now() + BEIJING_OFFSET_MS + offsetDays * DAY_MS);
  return date.toISOString().slice(0, 10);
}

function normalizeSigninRecord(record) {
  const parts = String(record?.day || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) return null;
  const useCard = boolean(record.useCard, record.content === "本地补签");
  return {
    ...record,
    day: `${parts[1]}-${parts[2]}-${parts[3]}`,
    reward: useCard ? 0 : integer(record.reward, 1, 0, 1000000),
    useCard
  };
}

function signinRecordsForUser(db, userId) {
  const recordsByDay = new Map();
  for (const rawRecord of db.signins) {
    if (rawRecord.userId !== userId) continue;
    const record = normalizeSigninRecord(rawRecord);
    if (record && !recordsByDay.has(record.day)) recordsByDay.set(record.day, record);
  }
  return [...recordsByDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

function consecutiveSigninDays(records, today = dateKeyAtOffset(0)) {
  if (records.length === 0) return 0;
  const signedDays = new Set(records.map((item) => item.day));
  let cursor = signedDays.has(today) ? today : dateKeyAtOffset(-1);
  if (!signedDays.has(cursor)) return 0;
  let count = 0;
  while (signedDays.has(cursor)) {
    count += 1;
    const date = new Date(`${cursor}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    cursor = date.toISOString().slice(0, 10);
  }
  return count;
}

function signinRewardRange(consecutiveDays) {
  const day = Math.max(1, integer(consecutiveDays, 1, 1));
  const minimum = day >= 5 ? 1000 : 500 + day * 100;
  return { minimum, maximum: minimum * 2 };
}

function randomIntegerInclusive(minimum, maximum) {
  return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
}

function signinCalendarRecord(record) {
  const [year, month, day] = record.day.split("-").map(Number);
  return {
    year,
    month,
    day,
    reward: integer(record.reward, record.useCard ? 0 : 1, 0, 1000000),
    useCard: Boolean(record.useCard)
  };
}

function strictInteger(value, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  const source = typeof value === "number" ? value : String(value ?? "").trim();
  if (typeof source === "number") {
    if (!Number.isSafeInteger(source)) return null;
  } else if (!/^-?\d+$/.test(source)) {
    return null;
  }
  const parsed = Number(source);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

function boundedText(value, maximum) {
  const normalized = String(value ?? "");
  return normalized.length <= maximum ? normalized : null;
}

function uniqueNumbers(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => integer(value, -1, -1)).filter((value) => value >= 0))];
}

function paginate(items, url, defaultSize = DEFAULT_PAGE_SIZE) {
  const from = integer(url.searchParams.get("from"), 0, 0, 1000000);
  const size = integer(url.searchParams.get("size"), defaultSize, 1, 200);
  return items.slice(from, from + size);
}

function createSeedData() {
  const currentUser = {
    id: 795406,
    name: "LocalTester",
    portraitUrl: "/static/images/default_avatar_girl.png",
    photourl: "/static/images/default_avatar_girl.png",
    privilege: "管理员",
    displayTitle: "站务管理员",
    displayTitleId: 0,
    postCount: 2,
    popularity: 7,
    prestige: 1,
    gender: 1,
    birthday: "2000-01-01T00:00:00.000Z",
    theme: 4,
    isVerified: true,
    lockState: 0,
    lastLogOnTime: "2026-08-09T00:05:00.000Z",
    registerTime: "2020-01-01T00:00:00.000Z",
    signatureCode: "[color=#2d7890][b]CC98 Reborn 本地测试签名[/b][/color]",
    introduction: "本地模拟论坛账号",
    emailAddress: "local@example.test",
    qq: "",
    wealth: 980,
    customTitle: "",
    userTitleIds: [],
    boardMasterTitles: [],
    deleteCount: 0,
    customBoards: [81],
    topicViewMode: 0,
    themeSetting: { ...DEFAULT_THEME_SETTING },
    watermarkId: "LOCAL001-WATERMARK",
    levelTitle: "",
    receivedLikeCount: 0,
    stopPostBoardCount: 0,
    signInCardCount: 1,
    browsingHistoryEnabled: true,
    roles: ["member", "siteAdmin"],
    status: "active",
    passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
    passwordChangedAt: "2026-08-09T00:00:00.000Z",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2026-08-09T00:05:00.000Z",
    failedLoginCount: 0,
    lockedUntil: ""
  };
  const otherUser = {
    ...currentUser,
    id: 100002,
    name: "SyntaxTester",
    portraitUrl: "/static/images/default_avatar_boy.png",
    photourl: "/static/images/default_avatar_boy.png",
    postCount: 1,
    popularity: 3,
    wealth: 500,
    signatureCode: "[u][color=#39785a]签名档样式测试[/color][/u]",
    introduction: "用于测试关注、私信与楼层交互",
    emailAddress: "syntax@example.test",
    watermarkId: "LOCAL002-WATERMARK",
    roles: ["member"],
    passwordHash: hashPassword(DEFAULT_MEMBER_PASSWORD),
    passwordChangedAt: "2026-08-09T00:00:00.000Z"
  };
  const board = {
    id: 81,
    name: "本地测试版",
    description: "[b]这是一个不连接生产 API 的 CC98 本地测试版面。[/b]",
    bigPaper: "[b]本地测试版面说明[/b]",
    boardMasters: [],
    masters: [],
    anonymousState: 0,
    canEntry: true,
    isLocked: false,
    allowVote: true,
    moderatorUserIds: [currentUser.id],
    boardMasterIds: [currentUser.id],
    parentId: 0,
    rootId: 81
  };
  const topic = {
    id: 6500000,
    boardId: 81,
    userId: currentUser.id,
    userName: currentUser.name,
    title: "CC98 Reborn 本地 UBB 与 Markdown 测试帖",
    time: "2026-08-09T00:00:00.000Z",
    state: 0,
    type: 0,
    tag1: 1,
    tag2: 0,
    isAnonymous: false,
    isVote: false,
    voteInfo: null,
    hitCount: 531,
    topState: 0,
    bestState: 0,
    saveState: 0,
    highlight: null,
    notifyAllReplierPostIds: [],
    lotteryTopicDetail: null
  };
  const posts = [
    {
      id: 900001,
      topicId: topic.id,
      boardId: board.id,
      userId: currentUser.id,
      userName: currentUser.name,
      floor: 1,
      contentType: 0,
      content: [
        "[b]粗体[/b] [i]斜体[/i] [u]下划线[/u] [del]删除线[/del]",
        "[color=#e5484d]红色[/color] [size=5]大字[/size] [url=https://www.cc98.org]绝对链接[/url]",
        "[align=right]右对齐表情 [ac01][/align]",
        "[center][font=KaiTi]居中与字体标签[/font][/center]",
        "[quote][md]### Markdown in UBB\n\n- 列表项 A\n- 列表项 B[/md][/quote]",
        "[line]",
        "[code]const answer = 98;\nconsole.log(answer);[/code]",
        "[table][tr][th]语法[/th][th]结果[/th][/tr][tr][td]UBB[/td][td]正常[/td][/tr][/table]",
        "[img]/static/images/default_avatar_girl.png[/img]",
        "[img=1]/static/images/default_avatar_boy.png[/img]",
        "[upload]/__test/download/example.txt[/upload]",
        "[math]x^2 + y^2 = z^2[/math]"
      ].join("\n"),
      title: topic.title,
      time: "2026-08-09T00:00:00.000Z",
      lastUpdateAuthor: currentUser.name,
      lastUpdateTime: "2026-08-09T00:01:00.000Z",
      isAnonymous: false,
      anonymousCode: "",
      isDeleted: false,
      isLZ: true,
      parentId: null,
      likeCount: 6,
      dislikeCount: 1,
      state: 0
    },
    {
      id: 900002,
      topicId: topic.id,
      boardId: board.id,
      userId: otherUser.id,
      userName: otherUser.name,
      floor: 2,
      contentType: 1,
      content: "## Markdown 回复\n\n- 列表一\n- 列表二\n\n> 引用内容\n\n`inline code` 和 **bold**。",
      title: "",
      time: "2026-08-09T00:03:00.000Z",
      lastUpdateAuthor: "",
      lastUpdateTime: "",
      isAnonymous: false,
      anonymousCode: "",
      isDeleted: false,
      isLZ: false,
      parentId: 900001,
      likeCount: 19,
      dislikeCount: 0,
      state: 0
    },
    {
      id: 900003,
      topicId: topic.id,
      boardId: board.id,
      userId: currentUser.id,
      userName: currentUser.name,
      floor: 3,
      contentType: 0,
      content: "[align=center]编辑、回帖与表情同步测试 [em01][/align]",
      title: "",
      time: "2026-08-09T00:05:00.000Z",
      lastUpdateAuthor: "",
      lastUpdateTime: "",
      isAnonymous: false,
      anonymousCode: "",
      isDeleted: false,
      isLZ: false,
      parentId: null,
      likeCount: 2,
      dislikeCount: 0,
      state: 0
    }
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:05:00.000Z",
      nextTopicId: 6500001,
      nextPostId: 900004,
      nextMessageId: 700003,
      nextAwardId: 800001,
      nextBoardId: 82,
      nextFavoriteGroupId: 1,
      nextEventId: 1,
      nextOperationId: 1,
      nextColumnId: 1,
      nextUploadId: 1,
      nextUserId: 795407,
      nextAuditId: 1,
      revision: 1
    },
    currentUserId: currentUser.id,
    users: [currentUser, otherUser],
    boards: [board],
    tags: [{ id: 1, name: "讨论" }, { id: 2, name: "求助" }, { id: 3, name: "资源" }],
    topics: [topic],
    posts,
    follows: [{ followerId: currentUser.id, followeeId: otherUser.id, createdAt: "2026-08-09T00:02:00.000Z" }],
    boardFollows: [{ userId: currentUser.id, boardId: board.id, createdAt: "2026-08-09T00:02:00.000Z" }],
    favorites: [{ userId: currentUser.id, topicId: topic.id, groupId: 0, createdAt: "2026-08-09T00:02:00.000Z" }],
    favoriteGroups: [{ id: 0, userId: currentUser.id, name: "默认分组", createTime: "2026-08-09T00:00:00.000Z" }],
    reactions: [],
    ratings: [],
    messages: [
      { id: 700001, senderId: otherUser.id, receiverId: currentUser.id, content: "欢迎来到本地模拟论坛。", time: "2026-08-09T00:02:00.000Z", isRead: true, deletedBy: [] },
      { id: 700002, senderId: currentUser.id, receiverId: otherUser.id, content: "这里的私信会保存在本机。", time: "2026-08-09T00:04:00.000Z", isRead: true, deletedBy: [] }
    ],
    notifications: {
      reply: [{ id: 1, userId: currentUser.id, senderId: otherUser.id, topicId: topic.id, postId: 900002, content: posts[1].content, time: posts[1].time, isRead: false }],
      at: [],
      system: [{ id: 2, userId: currentUser.id, content: "本地模拟后端已启用。", time: "2026-08-09T00:00:00.000Z", isRead: false }]
    },
    signins: [],
    browsingHistory: [{ userId: currentUser.id, topicId: topic.id, time: "2026-08-09T00:05:00.000Z" }],
    topicEvents: [],
    operationRecords: [],
    boardStopPostUsers: [],
    siteConfig: {
      announcement: "[color=#2d7890][b]CC98 Reborn 本地模拟论坛[/b][/color]",
      advertisements: [],
      specialOffers: [],
      indexColumns: []
    },
    voteRecords: [],
    sessions: [],
    authorizationCodes: [],
    auditLog: [],
    extensionStorage: {
      [currentUser.id]: defaultExtensionStorageForUser(currentUser),
      [otherUser.id]: defaultExtensionStorageForUser(otherUser)
    },
    registration: {
      enabled: true,
      requireInvite: false,
      inviteCode: ""
    }
  };
}

function normalizeData(value) {
  const seed = createSeedData();
  const data = value && typeof value === "object" ? value : seed;
  for (const key of ["users", "boards", "tags", "topics", "posts", "follows", "boardFollows", "favorites", "favoriteGroups", "reactions", "ratings", "messages", "signins", "browsingHistory", "topicEvents", "operationRecords", "boardStopPostUsers", "voteRecords", "sessions", "authorizationCodes", "auditLog"]) {
    if (!Array.isArray(data[key])) data[key] = seed[key];
  }
  data.users = data.users.map((user) => {
    const matchingSeed = seed.users.find((item) => item.id === user.id);
    const memberDefaults = seed.users[1];
    const normalized = { ...(matchingSeed || memberDefaults), ...user };
    normalized.userTitleIds = Array.isArray(user.userTitleIds) ? user.userTitleIds : [];
    normalized.boardMasterTitles = Array.isArray(user.boardMasterTitles) ? user.boardMasterTitles : [];
    normalized.customBoards = Array.isArray(user.customBoards) ? user.customBoards : [];
    normalized.themeSetting = normalizeThemeSetting(user.themeSetting, matchingSeed?.themeSetting || memberDefaults.themeSetting);
    normalized.roles = normalizeRoles(user.roles, user.id === seed.currentUserId ? ["member", "siteAdmin"] : ["member"]);
    normalized.status = new Set(["active", "suspended", "disabled"]).has(user.status) ? user.status : "active";
    normalized.passwordHash = typeof user.passwordHash === "string" && user.passwordHash.startsWith("scrypt-v1$")
      ? user.passwordHash
      : (matchingSeed?.passwordHash || hashPassword(createOpaqueToken("migrated-user")));
    normalized.requiresPasswordReset = !matchingSeed && !user.passwordHash;
    normalized.failedLoginCount = integer(user.failedLoginCount, 0, 0, 1000);
    normalized.lockedUntil = text(user.lockedUntil, "", 40);
    normalized.createdAt = text(user.createdAt || user.registerTime, isoNow(), 40);
    normalized.updatedAt = text(user.updatedAt, normalized.createdAt, 40);
    return normalized;
  });
  data.boards = data.boards.map((board) => {
    const deletedState = board.deletedState && typeof board.deletedState === "object"
      ? {
        canEntry: boolean(board.deletedState.canEntry, true),
        isLocked: boolean(board.deletedState.isLocked, false)
      }
      : null;
    const normalized = {
      ...board,
      anonymousState: integer(board.anonymousState, 0, 0, 3),
      allowVote: boolean(board.allowVote ?? board.canVote, true),
      canEntry: boolean(board.canEntry, true),
      deleted: boolean(board.deleted, false),
      isLocked: boolean(board.isLocked ?? board.isLock, false),
      moderatorUserIds: uniqueNumbers(board.moderatorUserIds),
      boardMasterIds: uniqueNumbers(board.boardMasterIds)
    };
    if (deletedState) normalized.deletedState = deletedState;
    else delete normalized.deletedState;
    return normalized;
  });
  if (!data.extensionStorage || typeof data.extensionStorage !== "object" || Array.isArray(data.extensionStorage)) {
    data.extensionStorage = {};
  }
  const normalizedExtensionStorage = {};
  for (const user of data.users) {
    const userKey = String(user.id);
    const fallback = defaultExtensionStorageForUser(user);
    normalizedExtensionStorage[userKey] = normalizeExtensionStorageRecord(
      data.extensionStorage[userKey],
      fallback
    );
    if (!normalizedExtensionStorage[userKey].cc98ComfortSettings) {
      normalizedExtensionStorage[userKey].cc98ComfortSettings = { ...DEFAULT_EXTENSION_SETTINGS };
    }
  }
  data.extensionStorage = normalizedExtensionStorage;
  data.topics = data.topics.map((topic) => ({
    ...topic,
    deleted: boolean(topic.deleted, false),
    isAnonymous: boolean(topic.isAnonymous, false),
    isVote: boolean(topic.isVote, false)
  }));
  data.posts = data.posts.map((post) => ({
    ...post,
    isAnonymous: boolean(post.isAnonymous, false),
    isDeleted: boolean(post.isDeleted, false),
    deletedByTopic: boolean(post.deletedByTopic, false)
  }));
  data.messages = data.messages.map((message) => ({
    ...message,
    deletedBy: uniqueNumbers(message.deletedBy)
  }));
  data.siteConfig = {
    ...seed.siteConfig,
    ...(data.siteConfig && typeof data.siteConfig === "object" ? data.siteConfig : {})
  };
  if (!data.notifications || typeof data.notifications !== "object") data.notifications = seed.notifications;
  for (const key of ["reply", "at", "system"]) {
    if (!Array.isArray(data.notifications[key])) data.notifications[key] = [];
  }
  data.schemaVersion = SCHEMA_VERSION;
  data.currentUserId = integer(data.currentUserId, seed.currentUserId, 1);
  if (!data.users.some((user) => user.id === data.currentUserId)) data.currentUserId = data.users[0]?.id || seed.currentUserId;
  data.registration = {
    ...seed.registration,
    ...(data.registration && typeof data.registration === "object" ? data.registration : {})
  };
  data.registration.enabled = boolean(data.registration.enabled, true);
  data.registration.requireInvite = boolean(data.registration.requireInvite, false);
  data.registration.inviteCode = text(data.registration.inviteCode, "", 128).trim();
  data.meta = { ...seed.meta, ...(data.meta || {}) };
  const next = (items, key, fallback) => Math.max(fallback, ...items.map((item) => integer(item[key], 0) + 1));
  data.meta.nextTopicId = next(data.topics, "id", integer(data.meta.nextTopicId, seed.meta.nextTopicId));
  data.meta.nextPostId = next(data.posts, "id", integer(data.meta.nextPostId, seed.meta.nextPostId));
  data.meta.nextMessageId = next(data.messages, "id", integer(data.meta.nextMessageId, seed.meta.nextMessageId));
  data.meta.nextAwardId = next(data.ratings, "id", integer(data.meta.nextAwardId, seed.meta.nextAwardId));
  data.meta.nextFavoriteGroupId = next(data.favoriteGroups, "id", integer(data.meta.nextFavoriteGroupId, seed.meta.nextFavoriteGroupId));
  data.meta.nextOperationId = next(data.operationRecords, "id", integer(data.meta.nextOperationId, seed.meta.nextOperationId));
  data.meta.nextUserId = next(data.users, "id", integer(data.meta.nextUserId, seed.meta.nextUserId));
  data.meta.nextBoardId = next(data.boards, "id", integer(data.meta.nextBoardId, seed.meta.nextBoardId));
  data.meta.nextAuditId = next(data.auditLog, "id", integer(data.meta.nextAuditId, seed.meta.nextAuditId));
  data.meta.nextColumnId = next(
    [data.siteConfig.indexColumns, data.siteConfig.advertisements, data.siteConfig.specialOffers].flat(),
    "id",
    integer(data.meta.nextColumnId, seed.meta.nextColumnId)
  );
  const now = Date.now();
  data.sessions = data.sessions.filter((session) => session && session.userId && new Date(session.refreshExpiresAt || 0).getTime() > now);
  data.authorizationCodes = data.authorizationCodes.filter((entry) => entry && !entry.usedAt && new Date(entry.expiresAt || 0).getTime() > now);
  return data;
}

function readRequestBuffer(req, maximum = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > maximum) {
        reject(Object.assign(new Error("request_too_large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await readRequestBuffer(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid_json"), { status: 400 });
  }
}

async function readForm(req) {
  const body = await readRequestBuffer(req);
  return new URLSearchParams(body.toString("utf8"));
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!boundaryMatch) throw Object.assign(new Error("multipart_boundary_missing"), { status: 400 });
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const parts = buffer.toString("latin1").split(boundary);
  const files = [];
  for (const rawPart of parts) {
    const headerEnd = rawPart.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headers = rawPart.slice(0, headerEnd);
    const filenameMatch = /filename="([^"]*)"/i.exec(headers);
    if (!filenameMatch || !filenameMatch[1]) continue;
    const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);
    let payload = rawPart.slice(headerEnd + 4);
    if (payload.endsWith("\r\n")) payload = payload.slice(0, -2);
    files.push({
      name: filenameMatch[1],
      type: text(typeMatch?.[1] || "application/octet-stream", "application/octet-stream", 100),
      data: Buffer.from(payload, "latin1")
    });
  }
  return files;
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ""));
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(payload);
}

function sendJson(res, data, status = 200) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

function sendText(res, data = "ok", status = 200) {
  send(res, status, data, "text/plain; charset=utf-8");
}

function setSessionCookie(res, token, maxAgeSeconds = Math.floor(ACCESS_TOKEN_LIFETIME_MS / 1000)) {
  if (!token) {
    res.setHeader("Set-Cookie", "cc98_local_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return;
  }
  res.setHeader(
    "Set-Cookie",
    `cc98_local_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  );
}

function isAllowedLocalRedirect(value) {
  try {
    const target = new URL(String(value || ""));
    if (target.protocol === "http:" && new Set(["127.0.0.1", "localhost"]).has(target.hostname)) return true;
    return target.protocol === "https:" && /^[a-z0-9]+\.chromiumapp\.org$/i.test(target.hostname);
  } catch {
    return false;
  }
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

function mimeType(filePath) {
  return {
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".txt": "text/plain; charset=utf-8",
    ".pdf": "application/pdf",
    ".zip": "application/zip"
  }[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function createLocalForumBackend(options = {}) {
  const dataPath = path.resolve(options.dataPath || path.join(__dirname, ".runtime", "forum-data.json"));
  const uploadRoot = path.resolve(options.uploadRoot || path.join(path.dirname(dataPath), "uploads"));
  const backupRoot = path.resolve(options.backupRoot || path.join(path.dirname(dataPath), "backups"));
  const requireAuth = options.requireAuth === true || process.env.CC98_LOCAL_REQUIRE_AUTH === "1";
  const allowImplicitUser = !requireAuth && process.env.CC98_LOCAL_ALLOW_IMPLICIT_USER !== "0";
  const requestContext = new AsyncLocalStorage();
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.mkdirSync(backupRoot, { recursive: true });

  const unknownRequests = [];
  // The production endpoints return a fresh batch for each "换一换" action.
  // Keep the local result deterministic while still advancing between calls.
  const randomListCursors = {
    recent: 0,
    recommendation: 0
  };
  let data;
  if (process.env.CC98_LOCAL_RESET === "1" || !fs.existsSync(dataPath)) {
    data = createSeedData();
  } else {
    try {
      data = normalizeData(JSON.parse(fs.readFileSync(dataPath, "utf8")));
    } catch (error) {
      const invalidPath = `${dataPath}.invalid-${Date.now()}`;
      try { fs.copyFileSync(dataPath, invalidPath); } catch { }
      data = createSeedData();
    }
  }

  function persist() {
    data.meta.updatedAt = isoNow();
    data.meta.revision = integer(data.meta.revision, 0) + 1;
    const temporaryPath = `${dataPath}.${process.pid}.tmp`;
    if (fs.existsSync(dataPath) && Date.now() - lastBackupAt >= 30000) {
      const backupPath = path.join(backupRoot, "forum-data.latest.json");
      try { fs.copyFileSync(dataPath, backupPath); } catch { }
      lastBackupAt = Date.now();
    }
    fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    try {
      fs.renameSync(temporaryPath, dataPath);
    } catch {
      fs.copyFileSync(temporaryPath, dataPath);
      fs.unlinkSync(temporaryPath);
    }
  }
  let lastBackupAt = 0;
  persist();

  function requestState() {
    return requestContext.getStore() || { userId: null, authenticated: false, session: null };
  }

  function activeUserId() {
    const state = requestState();
    if (state.userId) return integer(state.userId, 0, 1);
    return allowImplicitUser ? data.currentUserId : 0;
  }

  const currentUser = () => data.users.find((item) => item.id === activeUserId()) || (allowImplicitUser ? data.users[0] : null);
  const findUser = (id) => data.users.find((item) => item.id === integer(id, -1, -1));
  const findBoard = (id) => data.boards.find((item) => item.id === integer(id, -1, -1));
  const findTopic = (id) => data.topics.find((item) => item.id === integer(id, -1, -1));
  const findPost = (id) => data.posts.find((item) => item.id === integer(id, -1, -1));
  const moderatorBoardsForUser = (userId) => {
    const user = findUser(userId);
    if (!normalizeRoles(user?.roles).includes("boardModerator")) return [];
    return data.boards.filter((board) => (
      isVisibleBoard(board)
      && uniqueNumbers([...(board.moderatorUserIds || []), ...(board.boardMasterIds || [])]).includes(integer(userId, 0))
    ));
  };

  function roleAwareUser(source) {
    if (!source) return null;
    const siteAdmin = isSiteAdmin(source);
    const moderatorBoards = moderatorBoardsForUser(source.id);
    return {
      ...source,
      privilege: siteAdmin ? "管理员" : "正式用户",
      displayTitle: siteAdmin
        ? "站务管理员"
        : (source.displayTitle && source.displayTitle !== "站务管理员" ? source.displayTitle : "正式用户"),
      boardMasterTitles: moderatorBoards.map((board) => ({
        userId: source.id,
        userName: source.name,
        boardId: board.id,
        boardName: board.name,
        title: "版主",
        boardMasterLevel: 1
      }))
    };
  }

  function extensionStorageForUser(userId, create = true) {
    const target = findUser(userId);
    if (!target) return null;
    const key = String(target.id);
    if (!data.extensionStorage[key] && create) {
      data.extensionStorage[key] = defaultExtensionStorageForUser(target);
    }
    return data.extensionStorage[key] || null;
  }
  const allPostsForTopic = (id) => data.posts
    .filter((item) => item.topicId === integer(id, -1, -1))
    .sort((a, b) => a.floor - b.floor);

  // Keep deleted floors out of every reader-facing projection. Mutation paths that
  // need stable floor allocation use allPostsForTopic explicitly.
  const postsForTopic = (id) => {
    const topic = findTopic(id);
    if (!isVisibleTopic(topic)) return [];
    return allPostsForTopic(id).filter((item) => !item.isDeleted);
  };

  function isVisibleBoard(board) {
    return Boolean(board && !board.deleted);
  }

  function isVisibleTopic(topic) {
    return Boolean(topic && !topic.deleted && isVisibleBoard(findBoard(topic.boardId)));
  }

  function isVisiblePost(post) {
    return Boolean(post && !post.isDeleted && isVisibleTopic(findTopic(post.topicId)));
  }

  function resolveRequestState(req) {
    const token = extractBearerToken(req);
    if (token) {
      const digest = digestToken(token);
      const session = data.sessions.find((item) => item.accessTokenDigest === digest);
      if (session && new Date(session.accessExpiresAt).getTime() > Date.now()) {
        const user = findUser(session.userId);
        if (user && user.status === "active") {
          session.lastSeenAt = isoNow();
          return { userId: user.id, authenticated: true, session };
        }
      }
      if (allowImplicitUser && token === "cc98-local-test") {
        return { userId: data.currentUserId, authenticated: false, session: null };
      }
      return { userId: null, authenticated: false, session: null };
    }
    if (allowImplicitUser) {
      const requestedUser = integer(req?.headers?.["x-cc98-local-user"], 0, 0);
      if (requestedUser && findUser(requestedUser)?.status === "active") {
        return { userId: requestedUser, authenticated: false, session: null };
      }
      return { userId: data.currentUserId, authenticated: false, session: null };
    }
    return { userId: null, authenticated: false, session: null };
  }

  function authenticatedUser() {
    const state = requestState();
    return state.authenticated ? findUser(state.userId) : null;
  }

  function localError(message, status = 400, details = undefined) {
    const error = new Error(message);
    error.status = status;
    if (details !== undefined) error.details = details;
    return error;
  }

  function requireRequestAuth(res) {
    if (!requireAuth || authenticatedUser()) return true;
    sendJson(res, { error: "login_required" }, 401);
    return false;
  }

  function hasBoardPermission(user, board, permission) {
    if (!user) return false;
    if (isSiteAdmin(user)) return true;
    if (permission === "post") return Boolean(board && !board.deleted && board.canEntry !== false && !board.isLocked);
    return permission === "moderate" && isBoardModerator(user, board);
  }

  function canEditPost(user, post) {
    if (!user || !post) return false;
    return post.userId === user.id || isSiteAdmin(user) || isBoardModerator(user, findBoard(post.boardId));
  }

  function canEditTopic(user, topic) {
    if (!user || !topic) return false;
    return topic.userId === user.id || isSiteAdmin(user) || isBoardModerator(user, findBoard(topic.boardId));
  }

  function isPostingStopped(boardId, userId) {
    return data.boardStopPostUsers.some((item) => (
      item.boardId === boardId
      && item.userId === userId
      && new Date(item.expiredTime).getTime() > Date.now()
    ));
  }

  function anonymousMode(board, topic = null, author = null) {
    const state = integer(board?.anonymousState, 0, 0, 3);
    if (state === 1) return "required";
    if (state === 2 && topic?.isAnonymous && author?.id === topic.userId) return "required";
    if (state === 2) return "optional";
    if (state === 3 && !topic) return "optional";
    if (state === 3 && topic?.isAnonymous && author?.id === topic.userId) return "required";
    return "forbidden";
  }

  function resolveAnonymousPost(board, topic, author, requestedAnonymous, kind, isVote = false) {
    if (isVote) {
      if (requestedAnonymous) return { error: "vote_topic_cannot_be_anonymous", status: 400 };
      return { value: false, cost: 0 };
    }

    const mode = anonymousMode(board, topic, author);
    let value = false;
    let cost = 0;
    if (mode === "required") {
      value = true;
    } else if (mode === "forbidden") {
      if (requestedAnonymous) return { error: "anonymous_not_allowed", status: 403 };
    } else if (requestedAnonymous) {
      value = true;
      cost = kind === "topic" ? 10000 : 2000;
    }

    if (!value) return { value: false, cost: 0 };

    const blockedUntil = new Date(author?.tpUntil || 0).getTime();
    if (Number.isFinite(blockedUntil) && blockedUntil > Date.now()) {
      return { error: "cannot_post_anonymous", status: 403 };
    }
    if (integer(author?.wealth, 0, 0) < cost) {
      return { error: kind === "topic" ? "wealth_not_enough_for_anonymous_topic" : "wealth_not_enough_for_anonymous_post", status: 400 };
    }
    return { value, cost };
  }

  function resolveTopicTags(board, rawBody) {
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {};
    const tag1 = strictInteger(body.tag1 ?? 0, 0, Number.MAX_SAFE_INTEGER);
    const tag2 = strictInteger(body.tag2 ?? 0, 0, Number.MAX_SAFE_INTEGER);
    if (tag1 === null || tag2 === null) return { error: "tag_id_error", status: 400 };

    const knownTags = new Set(data.tags.map((tag) => integer(tag.id, -1, -1)));
    if ((tag1 && !knownTags.has(tag1)) || (tag2 && !knownTags.has(tag2))) {
      return { error: "tag_id_error", status: 400 };
    }
    if (tag2 && !tag1) return { error: "tag_id_error", status: 400 };
    return { tag1, tag2 };
  }

  function normalizeVoteInfo(rawVoteInfo) {
    if (!rawVoteInfo || typeof rawVoteInfo !== "object" || Array.isArray(rawVoteInfo)) {
      return { error: "no_vote_info", status: 400 };
    }
    const rawItems = Array.isArray(rawVoteInfo.voteItems)
      ? rawVoteInfo.voteItems
      : (Array.isArray(rawVoteInfo.items) ? rawVoteInfo.items : null);
    if (!rawItems || rawItems.length < 2 || rawItems.length > 20) {
      return { error: "vote_items_error", status: 400 };
    }
    const voteItems = rawItems.map((item) => boundedText(
      typeof item === "object" && item !== null ? (item.description ?? item.content ?? "") : item,
      50
    )?.trim());
    if (voteItems.some((item) => !item)) return { error: "vote_item_error", status: 400 };

    const expiredDays = strictInteger(rawVoteInfo.expiredDays, 1, 1000);
    if (expiredDays === null) return { error: "vote_expired_days_error", status: 400 };
    const maxVoteCount = strictInteger(rawVoteInfo.maxVoteCount, 1, voteItems.length);
    if (maxVoteCount === null) return { error: "max_vote_count_error", status: 400 };
    return {
      voteInfo: {
        voteItems,
        expiredDays,
        expiredTime: new Date(Date.now() + expiredDays * 86400000).toISOString(),
        maxVoteCount,
        needVote: boolean(rawVoteInfo.needVote, false)
      }
    };
  }

  // Both the legacy Markdown endpoint and the current editor endpoint create
  // exactly the same post. Keeping the state transition here prevents the two
  // clients from drifting apart as the simulator grows.
  function createReply(topic, rawBody, author) {
    if (!isVisibleTopic(topic)) return { error: "topic_not_found", status: 404 };
    if (!author) return { error: "login_required", status: 401 };
    const board = findBoard(topic.boardId);
    if (topic.state === 1 || isPostingStopped(topic.boardId, author.id)) {
      return { error: "topic_locked", status: 403 };
    }
    if (!hasBoardPermission(author, board, "post")) {
      return { error: "cannot_post_in_this_board", status: 403 };
    }

    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {};
    const content = boundedText(body.content ?? body.Content, 8000);
    if (content === null) return { error: "content_too_long", status: 400 };
    if (!content.trim()) return { error: "content_empty", status: 402 };

    const existing = allPostsForTopic(topic.id);
    const parentId = integer(body.parentId ?? body.ParentId, 0) || null;
    const parent = parentId ? findPost(parentId) : null;
    if (parentId && (!isVisiblePost(parent) || parent.topicId !== topic.id)) {
      return { error: "parent_post_not_found", status: 404 };
    }

    const anonymous = resolveAnonymousPost(
      board,
      topic,
      author,
      boolean(body.isAnonymous ?? body.IsAnonymous, false),
      "reply"
    );
    if (anonymous.error) return anonymous;
    const isAnonymous = anonymous.value;
    const now = isoNow();
    const previousAnonymousPost = isAnonymous
      ? existing.find((item) => item.isAnonymous && item.userId === author.id)
      : null;
    const post = {
      id: data.meta.nextPostId++,
      topicId: topic.id,
      boardId: topic.boardId,
      userId: author.id,
      userName: author.name,
      floor: (existing[existing.length - 1]?.floor || 0) + 1,
      contentType: integer(body.contentType ?? body.ContentType, 0, 0, 1),
      content,
      title: text(body.title ?? body.Title, "", 80),
      time: now,
      lastUpdateAuthor: "",
      lastUpdateTime: "",
      isAnonymous,
      anonymousCode: isAnonymous ? (previousAnonymousPost?.anonymousCode || `A${existing.length + 1}`) : "",
      isDeleted: false,
      isLZ: author.id === topic.userId,
      parentId,
      likeCount: 0,
      dislikeCount: 0,
      state: 0
    };
    data.posts.push(post);
    author.postCount = integer(author.postCount, 0) + 1;
    if (anonymous.cost) author.wealth = Math.max(0, integer(author.wealth, 0) - anonymous.cost);

    const notifyAllReplier = boolean(body.notifyAllReplier ?? body.NotifyAllReplier, false);
    if (notifyAllReplier) {
      if (!Array.isArray(topic.notifyAllReplierPostIds)) topic.notifyAllReplierPostIds = [];
      topic.notifyAllReplierPostIds.push(post.id);
    }
    const notificationTargets = new Set();
    if (topic.userId !== author.id) notificationTargets.add(topic.userId);
    if (parent && parent.userId !== author.id) notificationTargets.add(parent.userId);
    if (notifyAllReplier) {
      for (const priorPost of postsForTopic(topic.id)) {
        if (priorPost.userId !== author.id) notificationTargets.add(priorPost.userId);
      }
    }
    for (const targetUserId of notificationTargets) {
      data.notifications.reply.push({
        id: data.meta.nextEventId++,
        userId: targetUserId,
        senderId: author.id,
        topicId: topic.id,
        postId: post.id,
        content,
        time: now,
        isRead: false
      });
    }
    return { post };
  }

  function softDeleteTopic(topic, detail = "") {
    if (!topic || topic.deleted) return false;
    topic.deleted = true;
    for (const post of allPostsForTopic(topic.id)) {
      if (post.isDeleted) continue;
      post.isDeleted = true;
      post.deletedByTopic = true;
    }
    addTopicEvent(topic.id, "delete", detail || "local_topic_deleted");
    return true;
  }

  function softDeletePost(post, detail = "") {
    if (!post || post.isDeleted) return false;
    const topic = findTopic(post.topicId);
    if (!topic) return false;
    // A topic without floor one is not a readable forum resource. Treat its
    // deletion as a topic deletion, while preserving the records for audit.
    if (post.floor === 1) return softDeleteTopic(topic, detail || "local_first_post_deleted");
    post.isDeleted = true;
    post.deletedByTopic = false;
    return true;
  }

  function addAudit(action, targetType, targetId, detail = {}, auditOptions = {}) {
    const auditActor = auditOptions.actor || authenticatedUser() || (allowImplicitUser ? currentUser() : null);
    data.auditLog.push({
      id: data.meta.nextAuditId++,
      action,
      targetType,
      targetId: integer(targetId, 0),
      actorUserId: integer(auditOptions.actorUserId, auditActor?.id || activeUserId(), 0),
      actorUserName: text(auditOptions.actorUserName, auditActor?.name || "anonymous", 80),
      detail,
      ip: "127.0.0.1",
      time: isoNow()
    });
  }

  function publicUser(source) {
    if (!source) return null;
    const projected = roleAwareUser(source);
    const viewerId = activeUserId();
    const following = data.follows.some((item) => item.followerId === viewerId && item.followeeId === source.id);
    return {
      ...sanitizeUser(projected, { includeRoles: Boolean(authenticatedUser() && isSiteAdmin(authenticatedUser())) }),
      fanCount: data.follows.filter((item) => item.followeeId === source.id).length,
      followCount: data.follows.filter((item) => item.followerId === source.id).length,
      isFollowing: following,
      customBoards: data.boardFollows
        .filter((item) => item.userId === source.id && isVisibleBoard(findBoard(item.boardId)))
        .map((item) => item.boardId),
      portraitUrl: projected.portraitUrl || projected.photourl || "/static/images/default_avatar_boy.png",
      photourl: projected.photourl || projected.portraitUrl || "/static/images/default_avatar_boy.png"
    };
  }

  function accountUserSummary(source, includeRoles = false) {
    if (!source) return null;
    const projected = roleAwareUser(source);
    return {
      id: projected.id,
      name: projected.name,
      portraitUrl: projected.portraitUrl || projected.photourl || "/static/images/default_avatar_boy.png",
      photourl: projected.photourl || projected.portraitUrl || "/static/images/default_avatar_boy.png",
      privilege: projected.privilege,
      displayTitle: projected.displayTitle,
      status: projected.status,
      ...(includeRoles ? { roles: normalizeRoles(projected.roles) } : {})
    };
  }

  function publicRegistrationConfig() {
    return {
      enabled: data.registration.enabled !== false,
      requireInvite: data.registration.requireInvite === true,
      inviteConfigured: Boolean(data.registration.inviteCode)
    };
  }

  function awardsForPost(postId) {
    return data.ratings.filter((item) => item.postId === postId).map((item) => {
      const operatorName = findUser(item.userId)?.name || "LocalUser";
      const signed = (value) => {
        const amount = integer(value, 0, -100000, 100000);
        return amount > 0 ? `+${amount}` : String(amount);
      };
      let content = text(item.content, "", 200);
      if (!content) {
        if (item.kind === "operation") {
          content = [
            item.wealth ? `财富 ${signed(item.wealth)}` : "",
            item.prestige ? `威望 ${signed(item.prestige)}` : ""
          ].filter(Boolean).join("，") || `管理操作 ${signed(item.value)}`;
        } else {
          content = `风评值 ${signed(item.value)}`;
        }
      }
      return {
        ...item,
        operatorName,
        content,
        // Keep this alias for local diagnostics that predate the upstream
        // IAward contract. The real Forum UI reads operatorName/content.
        userName: operatorName
      };
    });
  }

  function anonymousDisplayName(source) {
    return String(source?.anonymousCode || source?.floor || "A").toUpperCase();
  }

  function anonymousUserView(source) {
    return {
      id: null,
      name: `匿名${anonymousDisplayName(source)}`,
      portraitUrl: "/static/images/心灵头像.gif",
      photourl: "/static/images/心灵头像.gif",
      privilege: "匿名用户",
      popularity: 0,
      prestige: 0,
      signatureCode: "",
      postCount: 0,
      fanCount: 0,
      followCount: 0,
      isFollowing: false
    };
  }

  function postView(source) {
    const viewerId = activeUserId();
    const reaction = data.reactions.find((item) => item.userId === viewerId && item.postId === source.id);
    const topic = findTopic(source.topicId);
    const isAnonymous = Boolean(source.isAnonymous);
    const {
      anonymousCode,
      deletedByTopic,
      ip,
      userId,
      userName,
      lastUpdateAuthor,
      ...safe
    } = source;
    return {
      ...safe,
      ...(isAnonymous
        ? {
          userName: anonymousDisplayName(source),
          lastUpdateAuthor: ""
        }
        : { userId, userName, lastUpdateAuthor }),
      likeState: reaction?.state || 0,
      awards: awardsForPost(source.id),
      isMe: source.userId === viewerId,
      isLZ: source.userId === topic?.userId
    };
  }

  function topicView(source) {
    const topicPosts = postsForTopic(source.id);
    const lastPost = topicPosts[topicPosts.length - 1];
    const favoriteCount = data.favorites.filter((item) => item.topicId === source.id).length;
    const isAnonymous = Boolean(source.isAnonymous);
    const {
      userId,
      userName,
      ...safe
    } = source;
    return {
      ...safe,
      ...(isAnonymous ? { userName: "匿名用户" } : { userId, userName }),
      isMe: source.userId === activeUserId(),
      replyCount: Math.max(0, topicPosts.length - 1),
      floor: Math.max(0, topicPosts.length - 1),
      favoriteCount,
      lastPostTime: lastPost?.time || source.time,
      lastPostUserId: lastPost?.isAnonymous ? 0 : (lastPost?.userId || source.userId),
      lastPostUser: lastPost?.isAnonymous ? "匿名用户" : (lastPost?.userName || source.userName),
      lastPostUserName: lastPost?.isAnonymous ? "匿名用户" : (lastPost?.userName || source.userName),
      lastPostContent: lastPost?.content || "",
      todayCount: topicPosts.filter((post) => post.time.slice(0, 10) === isoNow().slice(0, 10)).length,
      notifyAllReplierPostIds: source.notifyAllReplierPostIds || [],
      lotteryTopicDetail: source.lotteryTopicDetail || null
    };
  }

  function boardView(source) {
    const topics = data.topics.filter((item) => item.boardId === source.id && !item.deleted);
    const boardPosts = data.posts.filter((item) => item.boardId === source.id && !item.isDeleted && !findTopic(item.topicId)?.deleted);
    const { deletedState, ...safe } = source;
    return {
      ...safe,
      canVote: source.allowVote !== false,
      isLock: Boolean(source.isLocked),
      topicCount: topics.length,
      postCount: boardPosts.length,
      todayCount: boardPosts.filter((item) => item.time.slice(0, 10) === isoNow().slice(0, 10)).length,
      isFollowing: data.boardFollows.some((item) => item.userId === activeUserId() && item.boardId === source.id)
    };
  }

  function boardTreeView() {
    return [{
      id: 1,
      name: "本地测试区",
      order: 1,
      masters: [],
      boards: data.boards.filter(isVisibleBoard).map(boardView)
    }];
  }

  function topicList(predicate = () => true) {
    return data.topics.filter((item) => isVisibleTopic(item) && predicate(item)).map(topicView).sort((a, b) => {
      if ((b.topState || 0) !== (a.topState || 0)) return (b.topState || 0) - (a.topState || 0);
      return new Date(b.lastPostTime).getTime() - new Date(a.lastPostTime).getTime();
    });
  }

  function recordBrowsing(topicId) {
    if (!activeUserId()) return;
    const viewer = currentUser();
    if (!viewer || viewer.browsingHistoryEnabled === false) return;
    const viewerId = activeUserId();
    const existing = data.browsingHistory.find((item) => item.userId === viewerId && item.topicId === topicId);
    if (existing) existing.time = isoNow();
    else data.browsingHistory.push({ userId: viewerId, topicId, time: isoNow() });
  }

  function addTopicEvent(topicId, operation, detail = "") {
    data.topicEvents.push({
      id: data.meta.nextEventId++,
      topicId,
      operation,
      detail,
      operatorUserId: activeUserId(),
      operatorUserName: currentUser()?.name || "anonymous",
      time: isoNow()
    });
  }

  function isVisibleNotificationTarget(notification) {
    const topicId = integer(notification?.topicId, 0, 0);
    const postId = integer(notification?.postId, 0, 0);
    if (!topicId && !postId) return true;

    const post = postId ? findPost(postId) : null;
    const topic = topicId ? findTopic(topicId) : (post ? findTopic(post.topicId) : null);
    return Boolean(topic && isVisibleTopic(topic) && (!postId || isVisiblePost(post)));
  }

  function notificationsFor(kind, userId) {
    return (data.notifications[kind] || []).filter((item) => (
      item.userId === userId && isVisibleNotificationTarget(item)
    ));
  }

  function unreadCounts() {
    const viewerId = activeUserId();
    const unreadMessages = data.messages.filter((item) =>
      item.receiverId === viewerId && !item.isRead && !uniqueNumbers(item.deletedBy).includes(viewerId)
    ).length;
    return {
      atCount: notificationsFor("at", viewerId).filter((item) => !item.isRead).length,
      messageCount: unreadMessages,
      replyCount: notificationsFor("reply", viewerId).filter((item) => !item.isRead).length,
      systemCount: notificationsFor("system", viewerId).filter((item) => !item.isRead).length
    };
  }

  function dynamicHome() {
    const topics = topicList();
    const links = topics.map((item) => ({
      id: item.id,
      title: item.title,
      boardId: item.boardId,
      boardName: findBoard(item.boardId)?.name || "",
      state: item.state || 0,
      type: item.type || 0,
      isInternalOnly: false,
      isVote: Boolean(item.isVote),
      authorName: item.userName || null,
      createTime: item.time,
      replyCount: item.replyCount,
      hitCount: item.hitCount,
      participantCount: new Set(postsForTopic(item.id).map((post) => post.userId)).size
    }));
    const hot = [...topics].sort((a, b) => (b.hitCount + b.replyCount * 10) - (a.hitCount + a.replyCount * 10)).slice(0, 10);
    const topicSections = Array.from({ length: 7 }, () => []);
    links.forEach((link, index) => topicSections[index % topicSections.length].push(link));
    const generatedColumns = data.siteConfig.indexColumns.filter((item) => item.enable !== false);
    return {
      academics: topicSections[0].slice(0, 5),
      announcement: data.siteConfig.announcement,
      emotion: topicSections[3].slice(0, 5),
      fleaMarket: topicSections[4].slice(0, 5),
      fullTimeJob: topicSections[6].slice(0, 5),
      hotTopic: hot.map((item) => links.find((link) => link.id === item.id)),
      lastUpdateTime: data.meta.updatedAt,
      lastUserName: data.users[data.users.length - 1]?.name || currentUser()?.name || "",
      onlineUserCount: data.users.length,
      partTimeJob: topicSections[5].slice(0, 5),
      postCount: data.posts.filter(isVisiblePost).length,
      recommendationFunction: generatedColumns.filter((item) => item.type === 2),
      recommendationReading: generatedColumns.filter((item) => item.type === 1).length
        ? generatedColumns.filter((item) => item.type === 1)
        : [{
          id: 0,
          type: 1,
          imageUrl: "/static/images/board.jpg",
          title: "本地论坛使用指南",
          url: `/topic/${topics[0]?.id || 6500000}`,
          content: "所有请求和数据都留在本机。",
          enable: true,
          time: data.meta.updatedAt,
          orderWeight: 0,
          expiredTime: null
        }],
      schoolEvent: topicSections[1].slice(0, 5),
      schoolNews: generatedColumns.filter((item) => item.type === 3),
      specialOffer: data.siteConfig.specialOffers.filter((item) => item.enable !== false),
      study: topicSections[2].slice(0, 5),
      todayCount: data.posts.filter((item) => isVisiblePost(item) && item.time.slice(0, 10) === isoNow().slice(0, 10)).length,
      todayTopicCount: data.topics.filter((item) => isVisibleTopic(item) && item.time.slice(0, 10) === isoNow().slice(0, 10)).length,
      topicCount: topics.length,
      userCount: data.users.length
    };
  }

  function reset() {
    data = createSeedData();
    unknownRequests.length = 0;
    randomListCursors.recent = 0;
    randomListCursors.recommendation = 0;
    for (const entry of fs.readdirSync(uploadRoot, { withFileTypes: true })) {
      if (entry.isFile()) fs.unlinkSync(path.join(uploadRoot, entry.name));
    }
    persist();
  }

  function rotateRandomList(values, kind, url) {
    if (values.length <= 1) return values;
    const size = integer(url.searchParams.get("size"), DEFAULT_PAGE_SIZE, 1, 200);
    const cursor = randomListCursors[kind] % values.length;
    const rotated = values.slice(cursor).concat(values.slice(0, cursor));
    // A full-page request still needs to change order on the next refresh.
    const step = Math.max(1, Math.min(size, values.length - 1));
    randomListCursors[kind] = (cursor + step) % values.length;
    return rotated;
  }

  function recordUnknownRequest(method, url) {
    const key = `${method} ${url.pathname}`;
    const existing = unknownRequests.find((item) => item.key === key);
    if (existing) {
      existing.count += 1;
      existing.lastAt = isoNow();
      existing.lastPath = `${url.pathname}${url.search}`;
      return;
    }
    unknownRequests.push({
      key,
      method,
      path: url.pathname,
      count: 1,
      firstAt: isoNow(),
      lastAt: isoNow(),
      lastPath: `${url.pathname}${url.search}`
    });
  }

  function issueSession(user, options = {}) {
    const accessToken = createOpaqueToken("cc98-access");
    const refreshToken = createOpaqueToken("cc98-refresh");
    const now = Date.now();
    const session = {
      id: createOpaqueToken("session"),
      userId: user.id,
      accessTokenDigest: digestToken(accessToken),
      refreshTokenDigest: digestToken(refreshToken),
      createdAt: isoNow(),
      lastSeenAt: isoNow(),
      accessExpiresAt: new Date(now + (options.accessLifetimeMs || ACCESS_TOKEN_LIFETIME_MS)).toISOString(),
      refreshExpiresAt: new Date(now + (options.refreshLifetimeMs || REFRESH_TOKEN_LIFETIME_MS)).toISOString(),
      userAgent: text(options.userAgent, "local-client", 240),
      ip: "127.0.0.1"
    };
    data.sessions = data.sessions.filter((item) => new Date(item.refreshExpiresAt).getTime() > now);
    data.sessions.push(session);
    const userSessions = data.sessions.filter((item) => item.userId === user.id);
    if (userSessions.length > 8) {
      const keep = new Set(userSessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8));
      data.sessions = data.sessions.filter((item) => item.userId !== user.id || keep.has(item));
    }
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Math.floor((new Date(session.accessExpiresAt).getTime() - now) / 1000),
      token_type: "Bearer",
      scope: "openid profile cc98",
      user: {
        ...publicUser(user),
        roles: normalizeRoles(user.roles)
      }
    };
  }

  function revokeSessionByAccessToken(token) {
    const digest = digestToken(token);
    const index = data.sessions.findIndex((item) => item.accessTokenDigest === digest);
    if (index < 0) return false;
    data.sessions.splice(index, 1);
    return true;
  }

  function refreshSession(refreshToken, userAgent = "local-client") {
    const digest = digestToken(refreshToken);
    const session = data.sessions.find((item) => item.refreshTokenDigest === digest);
    if (!session || new Date(session.refreshExpiresAt).getTime() <= Date.now()) return null;
    const user = findUser(session.userId);
    if (!user || user.status !== "active") return null;
    data.sessions = data.sessions.filter((item) => item !== session);
    return issueSession(user, { userAgent });
  }

  function revokeSessionsForUser(userId) {
    const normalizedUserId = integer(userId, 0, 1);
    const before = data.sessions.length;
    data.sessions = data.sessions.filter((session) => session.userId !== normalizedUserId);
    return before - data.sessions.length;
  }

  function activeSiteAdminCount(excludingUserId = 0) {
    const excluded = integer(excludingUserId, 0, 0);
    return data.users.filter((user) => user.id !== excluded && user.status === "active" && isSiteAdmin(user)).length;
  }

  function redactState() {
    const clone = JSON.parse(JSON.stringify(data));
    clone.users = clone.users.map((user) => sanitizeUser(roleAwareUser(user)));
    clone.extensionStorage = Object.fromEntries(Object.entries(data.extensionStorage || {}).map(([userId, values]) => [
      userId,
      {
        keyCount: Object.keys(values || {}).length,
        bytes: extensionStorageSize(values || {})
      }
    ]));
    clone.sessions = clone.sessions.map((session) => ({
      id: session.id,
      userId: session.userId,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      accessExpiresAt: session.accessExpiresAt,
      refreshExpiresAt: session.refreshExpiresAt
    }));
    clone.authorizationCodes = clone.authorizationCodes.map((code) => ({
      id: code.id,
      userId: code.userId,
      clientId: code.clientId,
      redirectUri: code.redirectUri,
      expiresAt: code.expiresAt,
      usedAt: code.usedAt || ""
    }));
    return clone;
  }

  function integrityReport(source = data) {
    const issues = [];
    const userIds = new Set(source.users.map((user) => user.id));
    const boardIds = new Set(source.boards.map((board) => board.id));
    const topicIds = new Set(source.topics.map((topic) => topic.id));
    const postIds = new Set(source.posts.map((post) => post.id));
    const tagIds = new Set(source.tags.map((tag) => tag.id));
    const topicPostKeys = new Set();
    const floorsByTopic = new Map();
    for (const board of source.boards) {
      if (board.parentId && !boardIds.has(board.parentId)) issues.push(`board:${board.id}:missing-parent`);
      if (board.rootId && !boardIds.has(board.rootId)) issues.push(`board:${board.id}:missing-root`);
      for (const moderatorId of uniqueNumbers([...(board.moderatorUserIds || []), ...(board.boardMasterIds || [])])) {
        if (!userIds.has(moderatorId)) issues.push(`board:${board.id}:missing-moderator:${moderatorId}`);
      }
    }
    for (const [userId, storage] of Object.entries(source.extensionStorage || {})) {
      if (!userIds.has(integer(userId, 0))) issues.push(`extension-storage:${userId}:missing-user`);
      if (!storage || typeof storage !== "object" || Array.isArray(storage)) {
        issues.push(`extension-storage:${userId}:invalid-record`);
        continue;
      }
      if (extensionStorageSize(storage) > MAX_EXTENSION_STORAGE_BYTES) {
        issues.push(`extension-storage:${userId}:too-large`);
      }
      for (const key of Object.keys(storage)) {
        if (!validateExtensionStorageKey(key)) issues.push(`extension-storage:${userId}:invalid-key`);
      }
    }
    for (const topic of source.topics) {
      if (!userIds.has(topic.userId)) issues.push(`topic:${topic.id}:missing-user`);
      if (!boardIds.has(topic.boardId)) issues.push(`topic:${topic.id}:missing-board`);
      if (topic.tag1 && !tagIds.has(topic.tag1)) issues.push(`topic:${topic.id}:missing-tag1:${topic.tag1}`);
      if (topic.tag2 && !tagIds.has(topic.tag2)) issues.push(`topic:${topic.id}:missing-tag2:${topic.tag2}`);
      if (topic.tag2 && !topic.tag1) issues.push(`topic:${topic.id}:tag2-without-tag1`);
    }
    for (const post of source.posts) {
      const topic = source.topics.find((item) => item.id === post.topicId);
      if (!topicIds.has(post.topicId)) issues.push(`post:${post.id}:missing-topic`);
      if (!userIds.has(post.userId)) issues.push(`post:${post.id}:missing-user`);
      if (topic && post.boardId !== topic.boardId) issues.push(`post:${post.id}:board-mismatch:${post.boardId}:${topic.boardId}`);
      if (!Number.isSafeInteger(post.floor) || post.floor < 1) issues.push(`post:${post.id}:invalid-floor:${post.floor}`);
      const floorKey = `${post.topicId}:${post.floor}`;
      if (topicPostKeys.has(floorKey)) issues.push(`post:${post.id}:duplicate-floor:${post.floor}`);
      topicPostKeys.add(floorKey);
      if (!floorsByTopic.has(post.topicId)) floorsByTopic.set(post.topicId, []);
      floorsByTopic.get(post.topicId).push(post);
      if (post.parentId) {
        const parent = source.posts.find((item) => item.id === post.parentId);
        if (!parent) issues.push(`post:${post.id}:missing-parent:${post.parentId}`);
        else if (parent.topicId !== post.topicId) issues.push(`post:${post.id}:cross-topic-parent:${post.parentId}`);
        else if (parent.id === post.id) issues.push(`post:${post.id}:self-parent`);
      }
    }
    for (const topic of source.topics) {
      const topicPosts = floorsByTopic.get(topic.id) || [];
      const firstPosts = topicPosts.filter((post) => post.floor === 1);
      if (firstPosts.length === 0) issues.push(`topic:${topic.id}:missing-first-post`);
      if (firstPosts.length > 1) issues.push(`topic:${topic.id}:multiple-first-posts`);
      const firstPost = firstPosts[0];
      if (firstPost && firstPost.userId !== topic.userId) issues.push(`topic:${topic.id}:first-post-author-mismatch`);
    }
    for (const favorite of source.favorites) {
      if (!userIds.has(favorite.userId) || !topicIds.has(favorite.topicId)) issues.push(`favorite:${favorite.topicId}:dangling-reference`);
    }
    for (const reaction of source.reactions) {
      if (!userIds.has(reaction.userId) || !postIds.has(reaction.postId)) issues.push(`reaction:${reaction.postId}:dangling-reference`);
    }
    for (const rating of source.ratings) {
      if (!userIds.has(rating.userId) || !postIds.has(rating.postId)) issues.push(`rating:${rating.id || rating.postId}:dangling-reference`);
    }
    for (const history of source.browsingHistory) {
      if (!userIds.has(history.userId) || !topicIds.has(history.topicId)) issues.push(`history:${history.topicId}:dangling-reference`);
    }
    for (const event of source.topicEvents) {
      if (!topicIds.has(event.topicId)) issues.push(`topic-event:${event.id || event.topicId}:missing-topic`);
      if (event.operatorUserId && !userIds.has(event.operatorUserId)) issues.push(`topic-event:${event.id || event.topicId}:missing-operator`);
    }
    for (const record of source.operationRecords) {
      if (record.boardId && !boardIds.has(record.boardId)) issues.push(`operation:${record.id}:missing-board`);
      if (record.postId && !postIds.has(record.postId)) issues.push(`operation:${record.id}:missing-post`);
      if (record.targetUserId && !userIds.has(record.targetUserId)) issues.push(`operation:${record.id}:missing-target-user`);
      if (record.operatorUserId && !userIds.has(record.operatorUserId)) issues.push(`operation:${record.id}:missing-operator`);
    }
    for (const record of source.voteRecords) {
      const topic = source.topics.find((item) => item.id === record.topicId);
      if (!userIds.has(record.userId) || !topic) issues.push(`vote:${record.topicId}:dangling-reference`);
      else if (!topic.isVote) issues.push(`vote:${record.topicId}:topic-not-vote`);
      const rawItems = Array.isArray(topic?.voteInfo?.voteItems)
        ? topic.voteInfo.voteItems
        : (Array.isArray(topic?.voteInfo?.items) ? topic.voteInfo.items : []);
      const validItemIds = new Set(rawItems.map((item, index) => integer(item?.id, index + 1, 1)));
      const selected = uniqueNumbers(record.items);
      if (!selected.length || selected.some((id) => !validItemIds.has(id))) issues.push(`vote:${record.topicId}:invalid-items:${record.userId}`);
      if (selected.length > integer(topic?.voteInfo?.maxVoteCount, 1, 1, Math.max(1, rawItems.length))) {
        issues.push(`vote:${record.topicId}:too-many-items:${record.userId}`);
      }
    }
    for (const kind of ["reply", "at", "system"]) {
      for (const notification of source.notifications[kind]) {
        if (!userIds.has(notification.userId)) issues.push(`notification:${kind}:${notification.id}:missing-user`);
        if (notification.senderId && !userIds.has(notification.senderId)) issues.push(`notification:${kind}:${notification.id}:missing-sender`);
        if (notification.topicId && !topicIds.has(notification.topicId)) issues.push(`notification:${kind}:${notification.id}:missing-topic`);
        if (notification.postId && !postIds.has(notification.postId)) issues.push(`notification:${kind}:${notification.id}:missing-post`);
        const post = notification.postId ? source.posts.find((item) => item.id === notification.postId) : null;
        if (post && notification.topicId && post.topicId !== notification.topicId) issues.push(`notification:${kind}:${notification.id}:target-mismatch`);
      }
    }
    for (const session of source.sessions) {
      if (!userIds.has(session.userId)) issues.push(`session:${session.id}:missing-user`);
      if (!session.accessTokenDigest || !session.refreshTokenDigest) issues.push(`session:${session.id}:missing-token-digest`);
      if (!Number.isFinite(new Date(session.accessExpiresAt || 0).getTime()) || !Number.isFinite(new Date(session.refreshExpiresAt || 0).getTime())) {
        issues.push(`session:${session.id}:invalid-expiry`);
      }
    }
    for (const message of source.messages) {
      if (!userIds.has(message.senderId) || !userIds.has(message.receiverId)) issues.push(`message:${message.id}:missing-user`);
      const participants = new Set([message.senderId, message.receiverId]);
      for (const userId of uniqueNumbers(message.deletedBy)) {
        if (!participants.has(userId)) issues.push(`message:${message.id}:invalid-deleted-by:${userId}`);
      }
    }
    return {
      ok: issues.length === 0,
      issueCount: issues.length,
      issues: issues.slice(0, 200),
      revision: source.meta.revision,
      schemaVersion: source.schemaVersion
    };
  }

  function backupSnapshot() {
    const stamp = isoNow().replace(/[:.]/g, "-");
    const target = path.join(backupRoot, `forum-data-${stamp}.json`);
    fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    return target;
  }

  function restoreSnapshot(value) {
    if (!value || typeof value !== "object") throw localError("invalid_backup", 400);
    const restored = normalizeData(value);
    const validation = integrityReport(restored);
    if (!validation.ok) throw localError("invalid_backup", 400, validation);
    backupSnapshot();
    for (const key of Object.keys(data)) delete data[key];
    Object.assign(data, restored);
    persist();
    return integrityReport();
  }

  return {
    dataPath,
    uploadRoot,
    isAdminRequest(req) {
      if (!requireAuth) return { ok: true, user: currentUser() };
      const state = resolveRequestState(req);
      const user = state.authenticated ? findUser(state.userId) : null;
      if (!user) return { ok: false, status: 401, error: "login_required" };
      if (!isSiteAdmin(user)) return { ok: false, status: 403, error: "permission_denied" };
      return { ok: true, user };
    },
    getBrowserBootstrap(req) {
      const state = resolveRequestState(req);
      return requestContext.run(state, () => {
        const user = currentUser();
        const values = user
          ? extensionStorageForUser(user.id)
          : { cc98ComfortSettings: { ...DEFAULT_EXTENSION_SETTINGS } };
        return {
          strictAuth: requireAuth,
          user: user ? publicUser(user) : null,
          extensionStorage: { ...values },
          extensionStorageVersion: extensionStorageVersion(values)
        };
      });
    },
    getStats() {
      return {
        schemaVersion: data.schemaVersion,
        users: data.users.length,
        boards: data.boards.filter((board) => !board.deleted).length,
        deletedBoards: data.boards.filter((board) => board.deleted).length,
        topics: data.topics.length,
        posts: data.posts.length,
        messages: data.messages.length,
        activeSessions: data.sessions.length,
        auditEntries: data.auditLog.length,
        uploads: fs.readdirSync(uploadRoot).length,
        unknownRequests: unknownRequests.reduce((total, item) => total + item.count, 0),
        updatedAt: data.meta.updatedAt
      };
    },
    reset,
    async handle(req, res, url) {
      return requestContext.run(resolveRequestState(req), () => this.handleRequest(req, res, url));
    },
    async handleRequest(req, res, url) {
      const route = url.pathname.toLowerCase().replace(/\/$/, "") || "/";
      const method = String(req.method || "GET").toUpperCase();

      const isAuthRoute = route.startsWith("/auth/") || route.startsWith("/openid/") || route === "/__local/logout";
      const isDiagnosticRoute = route.startsWith("/__test/") || route.startsWith("/__uploads/");
      if (requireAuth && method !== "GET" && !isAuthRoute && !isDiagnosticRoute && !authenticatedUser()) {
        return sendJson(res, { error: "login_required" }, 401);
      }
      const topActor = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
      const requireDiagnosticAdmin = () => {
        if (!requireAuth) return true;
        const viewer = authenticatedUser();
        if (viewer && isSiteAdmin(viewer)) return true;
        sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        return false;
      };
      const topAdminRoute = route === "/config/global/announcement"
        || route === "/config/index/update"
        || route === "/file"
        || route === "/file/portrait"
        || route === "/index/column"
        || /^\/index\/column\/\d+$/.test(route);
      if (topAdminRoute && method !== "GET") {
        if ((route === "/file" || route === "/file/portrait") && !topActor) return sendJson(res, { error: "login_required" }, 401);
        if (!(route === "/file" || route === "/file/portrait") && (!topActor || !isSiteAdmin(topActor))) {
          return sendJson(res, { error: topActor ? "permission_denied" : "login_required" }, topActor ? 403 : 401);
        }
      }

      if (route === "/__test/state" && method === "GET") {
        if (requireAuth) {
          const viewer = authenticatedUser();
          if (!viewer || !isSiteAdmin(viewer)) return sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        }
        const unsafe = url.searchParams.get("unsafe") === "1" && process.env.CC98_LOCAL_ALLOW_UNSAFE_STATE === "1";
        return sendJson(res, { stats: this.getStats(), data: unsafe ? data : redactState() });
      }
      if (route === "/__test/unknown" && method === "GET") {
        if (!requireDiagnosticAdmin()) return;
        return sendJson(res, unknownRequests);
      }
      if (route === "/__test/unknown" && method === "DELETE") {
        if (!requireDiagnosticAdmin()) return;
        unknownRequests.length = 0;
        return sendJson(res, { ok: true });
      }
      if (route === "/__test/reset" && method === "POST") {
        if (requireAuth) {
          const viewer = authenticatedUser();
          if (!viewer || !isSiteAdmin(viewer)) return sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        }
        reset();
        return sendJson(res, { ok: true, stats: this.getStats() });
      }
      if (route === "/__test/integrity" && method === "GET") {
        if (requireAuth) {
          const viewer = authenticatedUser();
          if (!viewer || !isSiteAdmin(viewer)) return sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        }
        return sendJson(res, integrityReport());
      }
      if (route === "/__test/backup" && method === "GET") {
        if (!requireDiagnosticAdmin()) return;
        const files = fs.readdirSync(backupRoot, { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map((entry) => {
            const filePath = path.join(backupRoot, entry.name);
            return { name: entry.name, size: fs.statSync(filePath).size, updatedAt: fs.statSync(filePath).mtime.toISOString() };
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return sendJson(res, { current: data.meta.revision, files });
      }
      if (route === "/__test/backup" && method === "POST") {
        if (requireAuth && !isSiteAdmin(authenticatedUser())) return sendJson(res, { error: "permission_denied" }, 403);
        const target = backupSnapshot();
        return sendJson(res, { ok: true, name: path.basename(target), integrity: integrityReport() });
      }
      if (route === "/__test/export" && method === "GET") {
        if (requireAuth && !isSiteAdmin(authenticatedUser())) return sendJson(res, { error: "permission_denied" }, 403);
        const payload = Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8");
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": payload.length,
          "Content-Disposition": `attachment; filename="cc98-local-forum-${Date.now()}.json"`,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        });
        return res.end(payload);
      }
      if (route === "/__test/restore" && method === "POST") {
        if (requireAuth && !isSiteAdmin(authenticatedUser())) return sendJson(res, { error: "permission_denied" }, 403);
        const body = await readJson(req);
        const restored = body.data || body;
        return sendJson(res, { ok: true, integrity: restoreSnapshot(restored) });
      }
      if (route === "/__local/account-context" && method === "GET") {
        const sessionUser = authenticatedUser();
        const viewer = sessionUser || (allowImplicitUser ? currentUser() : null);
        const viewerIsAdmin = isSiteAdmin(viewer);
        const visibleUsers = allowImplicitUser || viewerIsAdmin
          ? data.users
          : (viewer ? [viewer] : []);
        return sendJson(res, {
          mode: allowImplicitUser ? "compatibility" : "strict",
          currentUser: viewer ? {
            ...publicUser(viewer),
            roles: normalizeRoles(viewer.roles),
            status: viewer.status
          } : null,
          authenticated: Boolean(sessionUser),
          signedIn: Boolean(viewer),
          isAdmin: viewerIsAdmin,
          canSwitchAccounts: allowImplicitUser,
          users: visibleUsers.map((user) => accountUserSummary(user, viewerIsAdmin || user.id === viewer?.id)),
          registration: publicRegistrationConfig()
        });
      }
      if (route === "/__local/current-user" && (method === "GET" || method === "PUT")) {
        const viewer = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!viewer || (!allowImplicitUser && !isSiteAdmin(viewer))) {
          return sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        }
        if (method === "PUT") {
          const body = await readJson(req);
          const target = findUser(body.userId ?? body.id);
          if (!target || target.status !== "active") return sendJson(res, { error: "active_user_not_found" }, 404);
          data.currentUserId = target.id;
          addAudit("simulator-current-user", "user", target.id, { name: target.name }, { actor: viewer });
          if (allowImplicitUser) {
            const token = extractBearerToken(req);
            if (token) revokeSessionByAccessToken(token);
            setSessionCookie(res, null);
          }
          persist();
        }
        const selected = findUser(data.currentUserId);
        return sendJson(res, {
          userId: selected?.id || 0,
          user: selected ? accountUserSummary(selected, isSiteAdmin(viewer)) : null,
          mode: allowImplicitUser ? "compatibility" : "strict",
          canSwitchAccounts: allowImplicitUser
        });
      }
      if (route === "/__local/site-config" && (method === "GET" || method === "PUT" || method === "PATCH")) {
        const viewer = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!viewer || !isSiteAdmin(viewer)) {
          return sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        }
        if (method !== "GET") {
          const body = await readJson(req);
          if (Object.prototype.hasOwnProperty.call(body, "announcement")) {
            data.siteConfig.announcement = text(body.announcement, data.siteConfig.announcement, 8000);
          }
          addAudit("site-config-update", "site", 0, { announcementChanged: Object.prototype.hasOwnProperty.call(body, "announcement") }, { actor: viewer });
          persist();
        }
        return sendJson(res, {
          ...data.siteConfig,
          registration: { ...data.registration },
          lastUpdateTime: data.meta.updatedAt
        });
      }
      if (route.startsWith("/__uploads/") && method === "GET") {
        const name = path.basename(decodeURIComponent(url.pathname.slice("/__uploads/".length)));
        const filePath = path.join(uploadRoot, name);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return sendJson(res, { error: "upload_not_found" }, 404);
        return send(res, 200, fs.readFileSync(filePath), mimeType(filePath));
      }

      if (route === "/auth/register" && method === "POST") {
        const registeringAdmin = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (data.registration.enabled === false && !isSiteAdmin(registeringAdmin)) {
          return sendJson(res, { error: "registration_disabled" }, 403);
        }
        const body = await readJson(req);
        const adminCreate = boolean(body.adminCreate, false) && isSiteAdmin(registeringAdmin);
        if (data.registration.requireInvite && !adminCreate) {
          const inviteCode = text(body.inviteCode ?? body.invitationCode, "", 128).trim();
          if (!data.registration.inviteCode) return sendJson(res, { error: "registration_invite_unavailable" }, 503);
          if (!inviteCode) return sendJson(res, { error: "registration_invite_required" }, 400);
          if (inviteCode !== data.registration.inviteCode) return sendJson(res, { error: "registration_invite_invalid" }, 403);
        }
        const nameResult = validateUserName(body.username ?? body.userName ?? body.name);
        const passwordResult = validatePassword(body.password);
        if (!nameResult.ok) return sendJson(res, { error: nameResult.error }, 400);
        if (!passwordResult.ok) return sendJson(res, { error: passwordResult.error }, 400);
        if (data.users.some((user) => user.name.toLowerCase() === nameResult.value.toLowerCase())) {
          return sendJson(res, { error: "username_taken" }, 409);
        }
        const now = isoNow();
        const user = {
          ...createSeedData().users[1],
          id: data.meta.nextUserId++,
          name: nameResult.value,
          displayTitle: text(body.displayTitle, "正式用户", 80),
          passwordHash: hashPassword(passwordResult.value),
          roles: ["member"],
          createdAt: now,
          updatedAt: now,
          registerTime: now,
          lastLogOnTime: now,
          postCount: 0,
          popularity: 0,
          prestige: 0,
          wealth: 100,
          signatureCode: "",
          introduction: "",
          emailAddress: text(body.emailAddress, "", 160),
          status: "active",
          requiresPasswordReset: false
        };
        data.users.push(user);
        data.favoriteGroups.push({ id: 0, userId: user.id, name: "默认分组", createTime: now });
        addAudit("register", "user", user.id, { name: user.name });
        persist();
        const switchToNewAccount = boolean(body.switchToNewAccount, false);
        if (adminCreate || (requireAuth && registeringAdmin && isSiteAdmin(registeringAdmin) && !switchToNewAccount)) {
          return sendJson(res, { user: sanitizeUser(roleAwareUser(user), { includeRoles: true }), createdByAdmin: true }, 201);
        }
        if (allowImplicitUser) {
          data.currentUserId = user.id;
          persist();
          setSessionCookie(res, null);
          return sendJson(res, {
            user: sanitizeUser(roleAwareUser(user), { includeRoles: true }),
            compatibilityMode: true
          }, 201);
        }
        const result = { user: sanitizeUser(roleAwareUser(user)), ...issueSession(user, { userAgent: req.headers["user-agent"] }) };
        setSessionCookie(res, result.access_token, result.expires_in);
        return sendJson(res, result, 201);
      }

      if (route === "/auth/login" && method === "POST") {
        const body = await readJson(req);
        const name = text(body.username ?? body.userName ?? body.name, "", 80).trim().toLowerCase();
        const user = data.users.find((item) => item.name.toLowerCase() === name);
        const now = Date.now();
        if (!user || user.status !== "active" || (user.lockedUntil && new Date(user.lockedUntil).getTime() > now)
          || !verifyPassword(body.password, user.passwordHash)) {
          if (user) {
            user.failedLoginCount = integer(user.failedLoginCount, 0) + 1;
            if (user.failedLoginCount >= 5) user.lockedUntil = new Date(now + 15 * 60 * 1000).toISOString();
            persist();
          }
          return sendJson(res, { error: "invalid_credentials" }, 401);
        }
        user.failedLoginCount = 0;
        user.lockedUntil = "";
        user.lastLogOnTime = isoNow();
        if (allowImplicitUser) {
          // In compatibility mode a password login is also an explicit
          // simulator account selection. Keep legacy API calls and the local
          // account shell on the same user after the redirect.
          data.currentUserId = user.id;
        }
        addAudit("login", "user", user.id);
        const result = issueSession(user, { userAgent: req.headers["user-agent"] });
        persist();
        setSessionCookie(res, result.access_token, result.expires_in);
        return sendJson(res, result);
      }

      if (route === "/auth/logout" && (method === "POST" || method === "DELETE")) {
        const token = extractBearerToken(req);
        if (token) revokeSessionByAccessToken(token);
        if (authenticatedUser()) addAudit("logout", "user", authenticatedUser().id);
        persist();
        setSessionCookie(res, null);
        return sendJson(res, { ok: true });
      }

      if (route === "/__local/logout" && method === "POST") {
        const user = authenticatedUser();
        const token = extractBearerToken(req);
        if (token) revokeSessionByAccessToken(token);
        if (user) addAudit("logout", "user", user.id);
        persist();
        setSessionCookie(res, null);
        return redirect(res, "/");
      }

      if (route === "/auth/session" && method === "GET") {
        const user = authenticatedUser();
        return sendJson(res, { authenticated: Boolean(user), user: user ? sanitizeUser(roleAwareUser(user), { includeRoles: true }) : null });
      }

      if (route === "/auth/change-password" && method === "PUT") {
        if (!requireRequestAuth(res)) return;
        const user = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!user) return sendJson(res, { error: "login_required" }, 401);
        const body = await readJson(req);
        if (!verifyPassword(body.currentPassword, user.passwordHash)) return sendJson(res, { error: "invalid_password" }, 400);
        const nextPassword = validatePassword(body.newPassword);
        if (!nextPassword.ok) return sendJson(res, { error: nextPassword.error }, 400);
        user.passwordHash = hashPassword(nextPassword.value);
        user.passwordChangedAt = isoNow();
        user.updatedAt = isoNow();
        revokeSessionsForUser(user.id);
        addAudit("password-change", "user", user.id);
        persist();
        setSessionCookie(res, null);
        return sendJson(res, { ok: true });
      }

      if (route === "/auth/registration" && (method === "GET" || method === "PUT" || method === "PATCH")) {
        const viewer = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!viewer || !isSiteAdmin(viewer)) return sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        if (method === "GET") return sendJson(res, { ...data.registration });
        const body = await readJson(req);
        if (body.enabled !== undefined) data.registration.enabled = Boolean(body.enabled);
        if (body.requireInvite !== undefined) data.registration.requireInvite = Boolean(body.requireInvite);
        if (Object.prototype.hasOwnProperty.call(body, "inviteCode")) {
          data.registration.inviteCode = text(body.inviteCode, "", 128).trim();
        }
        addAudit("registration-settings", "site", 0, {
          enabled: data.registration.enabled,
          requireInvite: data.registration.requireInvite,
          inviteConfigured: Boolean(data.registration.inviteCode)
        });
        persist();
        return sendJson(res, { ...data.registration });
      }

      if (route === "/auth/users" && method === "GET") {
        const viewer = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!viewer) return sendJson(res, { error: "login_required" }, 401);
        if (!isSiteAdmin(viewer)) return sendJson(res, { error: "permission_denied" }, 403);
        return sendJson(res, data.users.map((user) => sanitizeUser(roleAwareUser(user), { includeRoles: true })));
      }

      const profileMatch = /^\/auth\/users\/(\d+)\/profile$/i.exec(route);
      if (profileMatch && (method === "PUT" || method === "PATCH")) {
        const viewer = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!viewer || !isSiteAdmin(viewer)) return sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        const target = findUser(profileMatch[1]);
        if (!target) return sendJson(res, { error: "user_not_found" }, 404);
        const body = await readJson(req);
        for (const [key, maximum] of [["displayTitle", 80], ["introduction", 1000], ["signatureCode", 8000]]) {
          if (Object.prototype.hasOwnProperty.call(body, key)) {
            target[key] = text(body[key], target[key] || "", maximum);
          }
        }
        target.updatedAt = isoNow();
        addAudit("user-profile", "user", target.id, {
          displayTitle: target.displayTitle,
          introductionChanged: Object.prototype.hasOwnProperty.call(body, "introduction"),
          signatureChanged: Object.prototype.hasOwnProperty.call(body, "signatureCode")
        });
        persist();
        return sendJson(res, sanitizeUser(roleAwareUser(target), { includeRoles: true }));
      }

      const auditMatch = /^\/auth\/users\/(\d+)\/(roles|status)$/i.exec(route);
      if (auditMatch && (method === "PUT" || method === "PATCH")) {
        const viewer = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!viewer || !isSiteAdmin(viewer)) return sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        const target = data.users.find((user) => user.id === integer(auditMatch[1], 0));
        if (!target) return sendJson(res, { error: "user_not_found" }, 404);
        const body = await readJson(req);
        if (auditMatch[2].toLowerCase() === "roles") {
          const nextRoles = normalizeRoles(body.roles, target.roles);
          if (isSiteAdmin(target) && !nextRoles.includes("siteAdmin") && activeSiteAdminCount(target.id) === 0) {
            return sendJson(res, { error: "cannot_remove_last_site_admin" }, 400);
          }
          target.roles = nextRoles;
          if (!nextRoles.includes("boardModerator")) {
            for (const board of data.boards) {
              board.moderatorUserIds = uniqueNumbers((board.moderatorUserIds || []).filter((id) => id !== target.id));
              board.boardMasterIds = uniqueNumbers((board.boardMasterIds || []).filter((id) => id !== target.id));
              board.boardMasters = (board.boardMasters || []).filter((name) => name !== target.name);
              board.masters = (board.masters || []).filter((name) => name !== target.name);
            }
          }
        } else {
          const status = String(body.status || "");
          if (!new Set(["active", "suspended", "disabled"]).has(status)) return sendJson(res, { error: "invalid_status" }, 400);
          if (target.id === activeUserId() && status !== "active") return sendJson(res, { error: "cannot_suspend_self" }, 400);
          if (isSiteAdmin(target) && status !== "active" && activeSiteAdminCount(target.id) === 0) {
            return sendJson(res, { error: "cannot_suspend_last_site_admin" }, 400);
          }
          target.status = status;
          if (status !== "active") revokeSessionsForUser(target.id);
        }
        target.updatedAt = isoNow();
        addAudit(`user-${auditMatch[2].toLowerCase()}`, "user", target.id, body);
        persist();
        return sendJson(res, sanitizeUser(roleAwareUser(target), { includeRoles: true }));
      }

      const passwordResetMatch = /^\/auth\/users\/(\d+)\/password$/i.exec(route);
      if (passwordResetMatch && (method === "PUT" || method === "PATCH")) {
        const viewer = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!viewer || !isSiteAdmin(viewer)) return sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        const target = findUser(passwordResetMatch[1]);
        if (!target) return sendJson(res, { error: "user_not_found" }, 404);
        const body = await readJson(req);
        const nextPassword = validatePassword(body.password ?? body.newPassword);
        if (!nextPassword.ok) return sendJson(res, { error: nextPassword.error }, 400);
        target.passwordHash = hashPassword(nextPassword.value);
        target.passwordChangedAt = isoNow();
        target.requiresPasswordReset = false;
        target.updatedAt = isoNow();
        revokeSessionsForUser(target.id);
        addAudit("admin-password-reset", "user", target.id);
        persist();
        if (target.id === activeUserId()) setSessionCookie(res, null);
        return sendJson(res, { ok: true, user: sanitizeUser(roleAwareUser(target), { includeRoles: true }) });
      }

      const sessionMatch = /^\/auth\/sessions(?:\/(session-[^/]+))?$/i.exec(route);
      if (sessionMatch && (method === "GET" || method === "DELETE")) {
        const viewer = authenticatedUser();
        if (!viewer) return sendJson(res, { error: "login_required" }, 401);
        const requestedId = sessionMatch[1] || "";
        if (method === "GET") {
          const values = data.sessions
            .filter((session) => isSiteAdmin(viewer) || session.userId === viewer.id)
            .map((session) => ({
              id: session.id,
              userId: session.userId,
              userName: findUser(session.userId)?.name || "",
              createdAt: session.createdAt,
              lastSeenAt: session.lastSeenAt,
              accessExpiresAt: session.accessExpiresAt,
              refreshExpiresAt: session.refreshExpiresAt,
              current: requestState().session?.id === session.id
            }));
          return sendJson(res, values);
        }
        const target = data.sessions.find((session) => session.id === requestedId);
        if (!target) return sendJson(res, { error: "session_not_found" }, 404);
        if (!isSiteAdmin(viewer) && target.userId !== viewer.id) return sendJson(res, { error: "permission_denied" }, 403);
        data.sessions = data.sessions.filter((session) => session !== target);
        addAudit("session-revoke", "session", 0, { userId: target.userId }, { actor: viewer });
        persist();
        if (requestState().session?.id === target.id) setSessionCookie(res, null);
        return sendJson(res, { ok: true });
      }

      if (route === "/auth/audit" && method === "GET") {
        const viewer = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!viewer || !isSiteAdmin(viewer)) return sendJson(res, { error: viewer ? "permission_denied" : "login_required" }, viewer ? 403 : 401);
        const values = [...data.auditLog].sort((a, b) => new Date(b.time) - new Date(a.time));
        return sendJson(res, { count: values.length, data: paginate(values, url, 50) });
      }

      const extensionStorageMatch = /^\/__local\/extension-storage(?:\/(\d+))?$/.exec(route);
      if (extensionStorageMatch) {
        const viewer = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        const requestedUserId = integer(extensionStorageMatch[1], viewer?.id || 0, 1);
        const target = findUser(requestedUserId);
        if (!viewer) return sendJson(res, { error: "login_required" }, 401);
        if (!target) return sendJson(res, { error: "user_not_found" }, 404);
        const managingAnotherUser = target.id !== viewer.id;
        if (managingAnotherUser && !isSiteAdmin(viewer)) return sendJson(res, { error: "permission_denied" }, 403);
        if (extensionStorageMatch[1] && !isSiteAdmin(viewer) && requireAuth) {
          return sendJson(res, { error: "permission_denied" }, 403);
        }

        const storage = extensionStorageForUser(target.id);
        if (method === "GET") {
          const keys = url.searchParams.getAll("key").filter(Boolean);
          const values = keys.length
            ? Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(storage, key)).map((key) => [key, storage[key]]))
            : { ...storage };
          return sendJson(res, {
            userId: target.id,
            userName: target.name,
            revision: data.meta.revision,
            version: extensionStorageVersion(storage),
            bytes: extensionStorageSize(storage),
            values
          });
        }

        if (!new Set(["PUT", "PATCH", "DELETE"]).has(method)) {
          return sendJson(res, { error: "method_not_allowed" }, 405);
        }
        const before = { ...storage };
        if (method === "DELETE") {
          const keys = url.searchParams.getAll("key").filter(Boolean);
          data.extensionStorage[String(target.id)] = keys.length
            ? Object.fromEntries(Object.entries(storage).filter(([key]) => !keys.includes(key)))
            : defaultExtensionStorageForUser(target);
        } else {
          const body = await readJson(req);
          const values = body.values && typeof body.values === "object" && !Array.isArray(body.values)
            ? body.values
            : body;
          const remove = Array.isArray(body.remove) ? body.remove.map(String) : [];
          const replacement = method === "PUT" && body.replace === true ? {} : { ...storage };
          for (const key of remove) delete replacement[key];
          for (const [key, value] of Object.entries(values || {})) {
            if (key === "remove" || key === "replace") continue;
            if (!validateExtensionStorageKey(key)) {
              return sendJson(res, { error: "invalid_extension_storage_key", key }, 400);
            }
            try {
              replacement[key] = JSON.parse(JSON.stringify(value));
            } catch {
              return sendJson(res, { error: "invalid_extension_storage_value", key }, 400);
            }
          }
          if (extensionStorageSize(replacement) > MAX_EXTENSION_STORAGE_BYTES) {
            return sendJson(res, { error: "extension_storage_too_large" }, 413);
          }
          data.extensionStorage[String(target.id)] = replacement;
        }
        const next = data.extensionStorage[String(target.id)];
        addAudit("extension-storage-update", "user", target.id, {
          beforeKeys: Object.keys(before).length,
          afterKeys: Object.keys(next).length,
          bytes: extensionStorageSize(next)
        });
        persist();
        return sendJson(res, {
          ok: true,
          userId: target.id,
          revision: data.meta.revision,
          version: extensionStorageVersion(next),
          bytes: extensionStorageSize(next),
          values: { ...next }
        });
      }

      if (route === "/openid/connect/token" && method === "POST") {
        const form = await readForm(req);
        if (requireAuth && (form.get("client_id") !== LOCAL_CLIENT_ID || form.get("client_secret") !== LOCAL_CLIENT_SECRET)) {
          return sendJson(res, { error: "invalid_client" }, 401);
        }
        const grantType = form.get("grant_type") || "refresh_token";
        if (!new Set(["refresh_token", "authorization_code", "password"]).has(grantType)) {
          return sendJson(res, { error: "unsupported_grant_type" }, 400);
        }
        let result = null;
        if (grantType === "password") {
          const name = text(form.get("username"), "", 80).trim().toLowerCase();
          const user = data.users.find((item) => item.name.toLowerCase() === name);
          if (!user || user.status !== "active" || !verifyPassword(form.get("password"), user.passwordHash)) {
            return sendJson(res, { error: "invalid_grant" }, 400);
          }
          user.lastLogOnTime = isoNow();
          result = issueSession(user, { userAgent: req.headers["user-agent"] });
        } else if (grantType === "refresh_token") {
          if (!requireAuth && form.get("refresh_token") === "local") {
            result = issueSession(currentUser(), { userAgent: "compatibility-client" });
          } else {
            result = refreshSession(form.get("refresh_token"), req.headers["user-agent"]);
          }
          if (!result) return sendJson(res, { error: "invalid_grant" }, 400);
        } else {
          const code = text(form.get("code"), "", 300);
          const entry = data.authorizationCodes.find((item) => item.codeDigest === digestToken(code));
          const redirectUri = form.get("redirect_uri") || "";
          if (!entry || entry.usedAt || new Date(entry.expiresAt).getTime() <= Date.now()
            || entry.clientId !== form.get("client_id") || entry.redirectUri !== redirectUri) {
            return sendJson(res, { error: "invalid_grant" }, 400);
          }
          entry.usedAt = isoNow();
          const user = findUser(entry.userId);
          if (!user || user.status !== "active") return sendJson(res, { error: "invalid_grant" }, 400);
          result = issueSession(user, { userAgent: req.headers["user-agent"] });
        }
        persist();
        setSessionCookie(res, result.access_token, result.expires_in);
        return sendJson(res, result);
      }
      if (route === "/openid/connect/userinfo" && method === "GET") {
        const user = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!user) return sendJson(res, { error: "login_required" }, 401);
        const safeUser = publicUser(user);
        return sendJson(res, { sub: String(safeUser.id), id: safeUser.id, name: safeUser.name, preferred_username: safeUser.name });
      }
      if (route === "/openid/connect/authorize" && method === "GET") {
        if (requireAuth && url.searchParams.get("client_id") !== LOCAL_CLIENT_ID) return sendJson(res, { error: "invalid_client" }, 401);
        const redirectUri = url.searchParams.get("redirect_uri");
        if (!isAllowedLocalRedirect(redirectUri)) return sendJson(res, { error: "invalid_redirect_uri" }, 400);
        const user = authenticatedUser() || (allowImplicitUser ? currentUser() : null);
        if (!user) return sendJson(res, { error: "login_required" }, 401);
        const code = createOpaqueToken("cc98-code");
        data.authorizationCodes.push({
          codeDigest: digestToken(code),
          userId: user.id,
          clientId: text(url.searchParams.get("client_id"), "", 160),
          redirectUri,
          scope: text(url.searchParams.get("scope"), "openid", 500),
          createdAt: isoNow(),
          expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_LIFETIME_MS).toISOString(),
          usedAt: ""
        });
        const callback = new URL(redirectUri);
        callback.searchParams.set("code", code);
        if (url.searchParams.has("state")) callback.searchParams.set("state", url.searchParams.get("state"));
        callback.searchParams.set("session_state", "cc98-local-session");
        callback.searchParams.set("iss", `${url.protocol}//${url.host}/openid`);
        persist();
        return redirect(res, callback.toString());
      }
      if (route === "/openid/connect/endsession" && (method === "GET" || method === "POST")) {
        const token = extractBearerToken(req);
        if (token) revokeSessionByAccessToken(token);
        const redirectUri = url.searchParams.get("post_logout_redirect_uri");
        persist();
        setSessionCookie(res, null);
        if (redirectUri && isAllowedLocalRedirect(redirectUri)) return redirect(res, redirectUri);
        return sendJson(res, { ok: true });
      }
      if (route === "/openid/.well-known/jwks" && method === "GET") return sendJson(res, { keys: [] });
      if (route === "/openid/.well-known/openid-configuration" && method === "GET") {
        const origin = `${url.protocol}//${url.host}`;
        return sendJson(res, {
          issuer: `${origin}/openid`,
          authorization_endpoint: `${origin}/openid/connect/authorize`,
          token_endpoint: `${origin}/openid/connect/token`,
          userinfo_endpoint: `${origin}/openid/connect/userinfo`,
          end_session_endpoint: `${origin}/openid/connect/endsession`,
          jwks_uri: `${origin}/openid/.well-known/jwks`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token", "password"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["none"]
        });
      }

      const indexColumnTypeByRoute = {
        "/index/column/recommandationreading/all": 1,
        "/index/column/recommandationfunction/all": 2,
        "/index/column/schoolnews/all": 3
      };
      if (method === "GET" && indexColumnTypeByRoute[route]) {
        return sendJson(res, data.siteConfig.indexColumns.filter((item) => item.type === indexColumnTypeByRoute[route]));
      }
      if ((route === "/index/column" || /^\/index\/column\/\d+$/.test(route)) && (method === "POST" || method === "PUT" || method === "DELETE")) {
        const id = integer(route.split("/").pop(), 0);
        if (method === "DELETE") {
          let removed = false;
          for (const collection of [data.siteConfig.indexColumns, data.siteConfig.advertisements, data.siteConfig.specialOffers]) {
            const index = collection.findIndex((item) => item.id === id);
            if (index >= 0) {
              collection.splice(index, 1);
              removed = true;
            }
          }
          if (!removed) return sendJson(res, { error: "column_not_found" }, 404);
          addAudit("index-column-delete", "index-column", id);
          persist();
          return sendText(res);
        }
        const body = await readJson(req);
        const type = integer(body.type, 1, 1, 7);
        const target = type === 4
          ? data.siteConfig.advertisements
          : (type === 7 ? data.siteConfig.specialOffers : data.siteConfig.indexColumns);
        const existing = method === "PUT"
          ? [data.siteConfig.indexColumns, data.siteConfig.advertisements, data.siteConfig.specialOffers]
            .flat().find((item) => item.id === id)
          : null;
        if (method === "PUT" && !existing) return sendJson(res, { error: "column_not_found" }, 404);
        if (!text(body.title, existing?.title || "", 200).trim()) {
          return sendJson(res, { error: "column_title_required" }, 400);
        }
        const value = {
          ...(existing || {}),
          ...body,
          id: existing?.id || data.meta.nextColumnId++,
          type,
          title: text(body.title, existing?.title || "", 200),
          content: text(body.content, existing?.content || "", 2000),
          url: text(body.url, existing?.url || "", 1000),
          imageUrl: text(body.imageUrl, existing?.imageUrl || "", 1000),
          enable: body.enable !== false,
          isNew: false
        };
        if (existing) Object.assign(existing, value);
        else target.push(value);
        addAudit(existing ? "index-column-update" : "index-column-create", "index-column", value.id, { type: value.type, title: value.title });
        persist();
        return sendJson(res, value);
      }

      if (route === "/config/index" && method === "GET") return sendJson(res, dynamicHome());
      if (route === "/config/index/update" && (method === "PUT" || method === "POST")) return sendText(res);
      if ((route === "/config/global/advertisement" || route === "/config/global/advertisement/all") && method === "GET") return sendJson(res, data.siteConfig.advertisements);
      if ((route === "/config/global/special-offer" || route === "/config/global/special-offer/all") && method === "GET") return sendJson(res, data.siteConfig.specialOffers);
      if (route === "/config/global/announcement" && method === "PUT") {
        const body = await readJson(req);
        data.siteConfig.announcement = text(body.announcement, data.siteConfig.announcement, 8000);
        addAudit("site-announcement-update", "site", 0, { length: data.siteConfig.announcement.length });
        persist();
        return sendText(res);
      }
      if (route === "/config/global/alltag" && method === "GET") return sendJson(res, data.tags);
      if (route === "/config/global/all-user-title" && method === "GET") return sendJson(res, [
        { id: 0, name: "正式用户" },
        { id: 1, name: "版主" },
        { id: 2, name: "站务管理员" }
      ]);
      if (route === "/config/global" && method === "GET") return sendJson(res, {
        allowRegister: data.registration.enabled !== false,
        announcement: data.siteConfig.announcement,
        enableLocalBackend: true
      });
      if (route === "/config/now" && method === "GET") return sendJson(res, { data: isoNow() });

      if ((route === "/file" || route === "/file/portrait") && method === "POST") {
        const body = await readRequestBuffer(req);
        const files = parseMultipart(body, req.headers["content-type"]);
        if (!files.length) return sendJson(res, [], 400);
        const urls = [];
        for (const file of files.slice(0, 8)) {
          if (!file.data.length || file.data.length > MAX_BODY_BYTES) continue;
          const sourceExtension = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
          const extension = sourceExtension || ".bin";
          const filename = `${Date.now()}-${data.meta.nextUploadId++}${extension}`;
          fs.writeFileSync(path.join(uploadRoot, filename), file.data);
          urls.push(`/__uploads/${filename}`);
        }
        if (route === "/file/portrait" && urls[0]) {
          currentUser().portraitUrl = urls[0];
          currentUser().photourl = urls[0];
        }
        persist();
        return sendJson(res, urls);
      }

      return this.handleApplicationApi(req, res, url, route, method, {
        data: () => data,
        persist,
        currentUser,
        findUser,
        findBoard,
        findTopic,
        findPost,
        postsForTopic,
        publicUser,
        postView,
        topicView,
        boardView,
        topicList,
        recordBrowsing,
        addTopicEvent,
        unreadCounts
      });
    },
    async handleApplicationApi(req, res, url, route, method, ctx) {
      const db = ctx.data();
      const {
        persist,
        currentUser,
        findUser,
        findBoard,
        findTopic,
        findPost,
        postsForTopic,
        publicUser,
        postView,
        topicView,
        boardView,
        topicList,
        recordBrowsing,
        addTopicEvent,
        unreadCounts
      } = ctx;
      const routeMatch = (pattern) => pattern.exec(route);
      const current = currentUser() || { id: 0, name: "anonymous" };
      const actor = authenticatedUser() || (allowImplicitUser ? current : null);
      const requireActor = () => {
        if (actor) return true;
        sendJson(res, { error: "login_required" }, 401);
        return false;
      };
      const requireSiteAdmin = () => {
        if (actor && isSiteAdmin(actor)) return true;
        sendJson(res, { error: actor ? "permission_denied" : "login_required" }, actor ? 403 : 401);
        return false;
      };
      const requireBoardModerator = (board) => {
        if (actor && isBoardModerator(actor, board)) return true;
        sendJson(res, { error: actor ? "permission_denied" : "login_required" }, actor ? 403 : 401);
        return false;
      };
      const requirePostOwnerOrModerator = (post) => {
        if (actor && canEditPost(actor, post)) return true;
        sendJson(res, { error: actor ? "operation_forbidden" : "login_required" }, actor ? 403 : 401);
        return false;
      };
      const requireTopicOwnerOrModerator = (topic) => {
        if (actor && canEditTopic(actor, topic)) return true;
        sendJson(res, { error: actor ? "operation_forbidden" : "login_required" }, actor ? 403 : 401);
        return false;
      };

      const boardMatch = /^\/board\/(\d+)(?:\/(.+))?$/.exec(route);
      const topicMatch = /^\/topic\/(\d+)(?:\/(.+))?$/.exec(route);
      const postMatch = /^\/post\/(\d+)(?:\/(.+))?$/.exec(route);
      const userOperationMatch = /^\/user\/(\d+)\/operation$/.exec(route);
      const isBatchTopicWrite = (
        (route === "/topic/multi-delete" || route === "/topic/multi-lock")
        && method === "PUT"
      );
      let authorizedBatchTopics = null;
      const isManagementWrite = (
        route === "/config/global/announcement"
        || route === "/config/index/update"
        || route === "/index/column"
        || /^\/index\/column\/\d+$/.test(route)
        || route === "/user"
      );
      if (isManagementWrite && method !== "GET" && !requireSiteAdmin()) return;
      if (userOperationMatch && method !== "GET" && !requireSiteAdmin()) return;
      if (boardMatch && method !== "GET") {
        const board = findBoard(boardMatch[1]);
        if (!board || board.deleted) return sendText(res, "board_not_found", 404);
        if (boardMatch[2] === "topic" && method === "POST") {
          if (!requireActor()) return;
          if (!hasBoardPermission(actor, board, "post") || isPostingStopped(board.id, actor.id)) {
            return sendText(res, "cannot_post_in_this_board", 403);
          }
        } else if (!boardMatch[2]) {
          if (!requireSiteAdmin()) return;
        } else if (boardMatch[2] === "big-paper" || boardMatch[2]?.startsWith("stop-post-user")) {
          if (!requireBoardModerator(board)) return;
        }
      }
      if (topicMatch && method !== "GET") {
        const topic = findTopic(topicMatch[1]);
        if (!topic || !isVisibleTopic(topic)) return sendText(res, "topic_not_found", 404);
        const suffix = topicMatch[2] || "";
        if (suffix === "post" && method === "POST") {
          if (!requireActor()) return;
          if (topic.state === 1 || isPostingStopped(topic.boardId, actor.id)) {
            return sendText(res, "topic_locked", 403);
          }
        } else if (suffix === "vote" && method === "POST") {
          if (!requireActor()) return;
        } else if (["lock", "best", "not-hot", "top", "up", "highlight"].includes(suffix)) {
          if (!requireBoardModerator(findBoard(topic.boardId))) return;
        } else if (suffix.startsWith("moveto/")) {
          const targetMatch = /^moveto\/(\d+)$/.exec(suffix);
          const targetBoard = targetMatch ? findBoard(targetMatch[1]) : null;
          if (!targetMatch) return sendJson(res, { error: "board_not_found" }, 404);
          if (!isVisibleBoard(targetBoard)) return sendJson(res, { error: "board_not_found" }, 404);
          if (!requireBoardModerator(findBoard(topic.boardId))) return;
          if (!requireBoardModerator(targetBoard)) return;
        } else if (!suffix && method === "DELETE") {
          if (!requireTopicOwnerOrModerator(topic)) return;
        }
      }
      if (isBatchTopicWrite) {
        if (!requireActor()) return;
        const rawIds = url.searchParams.getAll("id");
        const parsedIds = rawIds.map((value) => strictInteger(value, 1, Number.MAX_SAFE_INTEGER));
        if (!rawIds.length) return sendJson(res, { error: "topic_ids_required" }, 400);
        if (parsedIds.some((id) => id === null)) return sendJson(res, { error: "topic_id_error" }, 400);

        const topicIds = [...new Set(parsedIds)];
        const topics = topicIds.map(findTopic);
        if (topics.some((topic) => !isVisibleTopic(topic))) {
          return sendJson(res, { error: "topic_not_found" }, 404);
        }

        const rawBoardId = url.searchParams.get("boardid") ?? url.searchParams.get("boardId");
        if (rawBoardId !== null) {
          const boardId = strictInteger(rawBoardId, 1, Number.MAX_SAFE_INTEGER);
          const board = boardId === null ? null : findBoard(boardId);
          if (!isVisibleBoard(board)) return sendJson(res, { error: "board_not_found" }, 404);
          if (topics.some((topic) => topic.boardId !== board.id)) {
            return sendJson(res, { error: "topic_board_mismatch" }, 400);
          }
        }

        const sourceBoards = [...new Set(topics.map((topic) => topic.boardId))].map(findBoard);
        if (!sourceBoards.every((board) => isBoardModerator(actor, board))) {
          return sendJson(res, { error: "permission_denied" }, 403);
        }
        authorizedBatchTopics = topics;
      }
      const ipLookupMatch = /^\/topic\/(\d+)\/look-ip$/.exec(route);
      if (ipLookupMatch && method === "GET" && !requireBoardModerator(findBoard(findTopic(ipLookupMatch[1])?.boardId))) return;
      if (/^\/user\/\d+\/(post|topic)$/.test(route) && method === "DELETE" && !requireSiteAdmin()) return;
      if (postMatch && method !== "GET") {
        const post = findPost(postMatch[1]);
        if (!post || !isVisiblePost(post)) return sendText(res, "post_not_found", 404);
        const suffix = postMatch[2] || "";
        if (["like", "rating", "rating-v2"].includes(suffix)) {
          if (!requireActor()) return;
        } else if (suffix === "operation") {
          if (!requireBoardModerator(findBoard(post.boardId))) return;
        } else if (!suffix || suffix === "original") {
          if (!requirePostOwnerOrModerator(post)) return;
        }
      }
      const legacyReplyMatch = /^\/post\/topic\/(\d+)$/.exec(route);
      if (legacyReplyMatch && method !== "GET") {
        const topic = findTopic(legacyReplyMatch[1]);
        if (!topic || !isVisibleTopic(topic)) return sendText(res, "topic_not_found", 404);
        if (method !== "POST") return sendText(res, "method_not_allowed", 405);
        if (!requireActor()) return;
        if (topic.state === 1 || isPostingStopped(topic.boardId, actor.id)) {
          return sendText(res, "topic_locked", 403);
        }
      }
      if (route === "/message" || /^\/message\/\d+$/.test(route) || /^\/message\/user\/\d+$/.test(route)) {
        if (!requireActor()) return;
      }
      if (
        route === "/me"
        || route.startsWith("/me/")
        || route === "/message"
        || route.startsWith("/message/")
        || route.startsWith("/notification/")
      ) {
        if (!requireActor()) return;
      }
      const topicSearchText = (topic) => {
        const body = postsForTopic(topic.id).map((post) => post.content).join("\n");
        return `${topic.title}\n${topic.isAnonymous ? "匿名用户" : topic.userName}\n${body}`.toLowerCase();
      };
      const withPostInfo = (notification) => {
        const post = findPost(notification.postId);
        const topic = findTopic(notification.topicId || post?.topicId);
        const targetVisible = isVisibleNotificationTarget(notification);
        return {
          ...notification,
          // Persisted notifications may outlive a moderated deletion. Never return
          // their copied body or target identifiers once the target is unavailable.
          ...(targetVisible ? {} : { content: "", topicId: 0, postId: 0 }),
          ...(post?.isAnonymous ? { senderId: 0 } : {}),
          userInfo: post?.isAnonymous ? anonymousUserView(post) : publicUser(findUser(notification.senderId)),
          postBasicInfo: targetVisible && post && topic ? {
            ...postView(post),
            title: topic.title,
            boardId: topic.boardId,
            topicId: topic.id
          } : null,
          targetUnavailable: !targetVisible
        };
      };

      if (route === "/me") {
        if (method === "GET") return sendJson(res, publicUser(current));
        if (method === "PUT") {
          const body = await readJson(req);
          const fields = {
            birthday: ["birthday", "Birthday"],
            displayTitleId: ["displayTitleId", "DisplayTitleId"],
            emailAddress: ["emailAddress", "EmailAddress"],
            gender: ["gender", "Gender"],
            introduction: ["introduction", "Introduction"],
            photourl: ["photourl", "PhotoUrl"],
            portraitUrl: ["portraitUrl", "PortraitUrl"],
            qq: ["qq", "QQ"],
            signatureCode: ["signatureCode", "SignatureCode"],
            theme: ["theme", "Theme"],
            topicViewMode: ["topicViewMode", "TopicViewMode"]
          };
          for (const [targetKey, aliases] of Object.entries(fields)) {
            const sourceKey = aliases.find((key) => Object.prototype.hasOwnProperty.call(body, key));
            if (sourceKey) {
              current[targetKey] = typeof current[targetKey] === "number"
                ? integer(body[sourceKey], current[targetKey], 0)
                : text(body[sourceKey], current[targetKey] || "", targetKey === "signatureCode" ? 8000 : 1000);
            }
          }
          persist();
          return sendJson(res, publicUser(current));
        }
      }
      if (route === "/me/portrait" && method === "PUT") {
        const body = await readJson(req);
        const portraitUrl = text(typeof body === "string" ? body : (body.portraitUrl || body.url || body.content), "", 1000);
        if (!portraitUrl) return sendText(res, "portrait_required", 400);
        current.portraitUrl = portraitUrl;
        current.photourl = portraitUrl;
        persist();
        return sendText(res);
      }
      if (route === "/me/unread-count" && method === "GET") return sendJson(res, unreadCounts());
      if (route === "/me/all-message-count" && method === "GET") {
        return sendJson(res, {
          atCount: notificationsFor("at", current.id).length,
          messageCount: db.messages.filter((item) =>
            (item.senderId === current.id || item.receiverId === current.id)
            && !uniqueNumbers(item.deletedBy).includes(current.id)
          ).length,
          replyCount: notificationsFor("reply", current.id).length,
          systemCount: notificationsFor("system", current.id).length
        });
      }
      if (route === "/me/theme") {
        if (method === "GET") return sendJson(res, current.theme ?? 4);
        if (method === "PUT") {
          const body = await readJson(req);
          current.theme = integer(url.searchParams.get("id") ?? body.theme ?? body, current.theme ?? 4, 0, MAX_THEME_ID);
          persist();
          return sendText(res);
        }
      }
      if (route === "/me/theme-setting") {
        if (method === "GET") return sendJson(res, normalizeThemeSetting(current.themeSetting));
        if (method === "PUT") {
          current.themeSetting = normalizeThemeSetting(await readJson(req), current.themeSetting);
          persist();
          return sendText(res);
        }
      }
      if (route === "/me/topic-view-mode") {
        if (method === "GET") return sendJson(res, current.topicViewMode || 0);
        if (method === "PUT") {
          const body = await readJson(req);
          current.topicViewMode = integer(url.searchParams.get("mode") ?? body.mode ?? body, current.topicViewMode || 0, 0, 5);
          persist();
          return sendText(res);
        }
      }
      if (route === "/me/signin") {
        const day = dateKeyAtOffset(0);
        if (method === "POST") {
          if (!db.signins.some((item) => item.userId === current.id && item.day === day)) {
            const body = await readJson(req);
            const previousRecords = signinRecordsForUser(db, current.id);
            const consecutiveDays = consecutiveSigninDays(previousRecords, dateKeyAtOffset(-1)) + 1;
            const range = signinRewardRange(consecutiveDays);
            const reward = randomIntegerInclusive(range.minimum, range.maximum);
            db.signins.push({
              userId: current.id,
              day,
              time: isoNow(),
              content: text(body.content || body, "", 500),
              reward,
              useCard: false
            });
            current.wealth = integer(current.wealth, 0) + reward;
            persist();
          }
          return sendJson(res, { success: true, day });
        }
        if (method === "GET") {
          const own = signinRecordsForUser(db, current.id);
          const hasSignedInToday = own.some((item) => item.day === day);
          const lastSignInCount = consecutiveSigninDays(own, day);
          return sendJson(res, {
            hasSignedIn: hasSignedInToday,
            hasSignedInToday,
            lastSigninTime: own[0]?.time || null,
            lastSignInTime: own[0]?.time || null,
            consecutiveDays: lastSignInCount,
            lastSignInCount,
            totalDays: own.length,
            lastReward: hasSignedInToday ? integer(own.find((item) => item.day === day)?.reward, 1, 0, 1000000) : 0
          });
        }
      }
      if (route === "/me/signin-in-month" && method === "GET") {
        const year = integer(url.searchParams.get("year"), new Date().getFullYear(), 2000, 2200);
        const month = integer(url.searchParams.get("month"), new Date().getMonth() + 1, 1, 12);
        const prefix = `${year}-${String(month).padStart(2, "0")}`;
        const records = signinRecordsForUser(db, current.id)
          .filter((item) => item.day.startsWith(prefix))
          .map(signinCalendarRecord)
          .sort((a, b) => a.day - b.day);
        return sendJson(res, records);
      }
      if (route === "/me/make-up-missed-signin" && method === "POST") {
        const cardCount = integer(current.signInCardCount, 0);
        if (cardCount <= 0) return sendJson(res, { errorCode: 1, extra: "没有可用的补签卡", data: null });
        const signedDays = new Set(signinRecordsForUser(db, current.id).map((item) => item.day));
        let missedDay = dateKeyAtOffset(-1);
        while (missedDay >= FIRST_SIGNIN_DAY && signedDays.has(missedDay)) {
          const date = new Date(`${missedDay}T00:00:00.000Z`);
          date.setUTCDate(date.getUTCDate() - 1);
          missedDay = date.toISOString().slice(0, 10);
        }
        if (missedDay < FIRST_SIGNIN_DAY) {
          return sendJson(res, { errorCode: 1, extra: "没有可补签的日期", data: null });
        }
        db.signins.push({
          userId: current.id,
          day: missedDay,
          time: isoNow(),
          content: "本地补签",
          reward: 0,
          useCard: true
        });
        current.signInCardCount = cardCount - 1;
        persist();
        return sendJson(res, {
          errorCode: 0,
          extra: "",
          data: consecutiveSigninDays(signinRecordsForUser(db, current.id))
        });
      }
      if (route === "/me/transfer-wealth" && method === "PUT") {
        const body = await readJson(req);
        const amountValue = Number(body.wealth);
        if (!Number.isFinite(amountValue) || !Number.isInteger(amountValue) || amountValue < 10 || amountValue > 1000000) {
          return sendText(res, "invalid_wealth", 400);
        }
        const amount = amountValue;
        const names = [...new Set((Array.isArray(body.userNames) ? body.userNames : []).map((name) => text(name, "", 30).trim()).filter(Boolean))];
        if (names.length === 0 || names.length > 10) return sendText(res, "invalid_receivers", 400);
        const targets = names.map((name) => db.users.find((item) => item.name.toLowerCase() === name.toLowerCase()));
        if (targets.some((user) => !user || user.id === current.id)) return sendText(res, "receiver_not_found", 400);
        const total = amount * targets.length;
        if (integer(current.wealth, 0) < total) return sendText(res, "wealth_not_enough", 400);
        const fee = Math.max(Math.floor(amount * 0.1), 10);
        const receivedAmount = Math.max(0, amount - fee);
        for (const target of targets) target.wealth = integer(target.wealth, 0) + receivedAmount;
        current.wealth = integer(current.wealth, 0) - total;
        persist();
        return sendJson(res, targets.map((item) => item.name));
      }
      const annualMatch = routeMatch(/^\/me\/annual-review-(\d{4})$/);
      if (annualMatch && method === "GET") {
        const year = integer(annualMatch[1], new Date().getFullYear(), 2000, 2200);
        const prefix = `${year}-`;
        const ownPosts = db.posts.filter((item) => item.userId === current.id && isVisiblePost(item) && item.time.startsWith(prefix));
        const ownTopics = db.topics.filter((item) => item.userId === current.id && isVisibleTopic(item) && item.time.startsWith(prefix));
        const byBoard = new Map();
        for (const post of ownPosts) byBoard.set(post.boardId, (byBoard.get(post.boardId) || 0) + 1);
        const boardRanks = [...byBoard.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([boardId, count]) => ({
          boardId,
          boardName: findBoard(boardId)?.name || "未知版面",
          count
        }));
        const ownTopicViews = ownTopics.map((item) => integer(item.hitCount, 0));
        const ownTopicReplies = ownTopics.map((item) => Math.max(0, postsForTopic(item.id).length - 1));
        const visibleOwnPosts = db.posts.filter((item) => item.userId === current.id && isVisiblePost(item));
        const receivedRatings = db.ratings.filter((item) => {
          const post = findPost(item.postId);
          return isVisiblePost(post) && post.userId === current.id;
        });
        const sentRatings = db.ratings.filter((item) => item.userId === current.id && isVisiblePost(findPost(item.postId)));
        const receivedLikes = visibleOwnPosts.reduce((sum, item) => sum + integer(item.likeCount, 0), 0);
        const sentLikes = db.reactions.filter((item) => item.userId === current.id && item.state === 1 && isVisiblePost(findPost(item.postId))).length;
        return sendJson(res, {
          year,
          userInfo: publicUser(current),
          topicCount: ownTopics.length,
          replyCount: ownPosts.filter((item) => item.floor > 1).length,
          hotTopicCount: ownTopics.filter((item) => integer(item.hitCount, 0) >= 100).length,
          favoriteTopicCount: db.favorites.filter((item) => item.userId === current.id && isVisibleTopic(findTopic(item.topicId)) && String(item.createdAt || "").startsWith(prefix)).length,
          receiveLikeCount: receivedLikes,
          sendLikeCount: sentLikes,
          receiveRateCount: receivedRatings.length,
          sendRateCount: sentRatings.length,
          mostReceiveLikePostCount: Math.max(0, ...visibleOwnPosts.map((item) => integer(item.likeCount, 0))),
          mostReceiveLikeUser: null,
          mostSendLikeUser: null,
          mostReplyTopicCount: Math.max(0, ...ownTopicReplies),
          mostViewTopicCount: Math.max(0, ...ownTopicViews),
          sofaCount: ownPosts.filter((item) => item.floor === 2).length,
          latestPostTime: ownPosts.sort((a, b) => new Date(b.time) - new Date(a.time))[0]?.time || null,
          postDay: new Set(ownPosts.map((item) => item.time.slice(0, 10))).size,
          postCount06: ownPosts.filter((item) => new Date(item.time).getHours() < 6).length,
          postCount612: ownPosts.filter((item) => { const hour = new Date(item.time).getHours(); return hour >= 6 && hour < 12; }).length,
          postCount1218: ownPosts.filter((item) => { const hour = new Date(item.time).getHours(); return hour >= 12 && hour < 18; }).length,
          postCount1824: ownPosts.filter((item) => new Date(item.time).getHours() >= 18).length,
          board1: boardRanks[0]?.boardId || null,
          board2: boardRanks[1]?.boardId || null,
          board3: boardRanks[2]?.boardId || null,
          achievement: "本地测试先锋|持久化记录者",
          bet: null,
          cardDraw: null
        });
      }

      if (route === "/user" || route === "/user/basic") {
        const ids = url.searchParams.getAll("id").map((value) => integer(value, -1, -1));
        return sendJson(res, ids.length ? ids.map(findUser).filter(Boolean).map(publicUser) : db.users.map(publicUser));
      }
      if (route === "/user/name") {
        const names = url.searchParams.getAll("name").map((value) => value.toLowerCase());
        return sendJson(res, names.length
          ? names.map((name) => db.users.find((item) => item.name.toLowerCase() === name)).filter(Boolean).map(publicUser)
          : db.users.map(publicUser));
      }
      let match = routeMatch(/^\/user\/name\/(.+)$/);
      if (match && method === "GET") {
        const name = decodeURIComponent(match[1]).toLowerCase();
        const user = db.users.find((item) => item.name.toLowerCase() === name);
        return user ? sendJson(res, publicUser(user)) : sendJson(res, { error: "user_not_found" }, 404);
      }
      match = routeMatch(/^\/user\/(?:basic\/)?(\d+)$/);
      if (match && method === "GET") {
        const user = findUser(match[1]);
        return user ? sendJson(res, publicUser(user)) : sendJson(res, { error: "user_not_found" }, 404);
      }
      match = routeMatch(/^\/user\/(\d+)\/recent-topic$/);
      if (match && method === "GET") return sendJson(res, paginate(topicList((item) => !item.isAnonymous && item.userId === integer(match[1])), url));
      match = routeMatch(/^\/user\/(\d+)\/(post|topic)$/);
      if (match) {
        const userId = integer(match[1]);
        const days = integer(url.searchParams.get("days"), 365, 1, 3650);
        const threshold = Date.now() - days * 86400000;
        if (method === "GET" && match[2] === "post") {
          const values = db.posts
            .filter((item) => item.userId === userId && !item.isAnonymous && !item.isDeleted && isVisiblePost(item) && new Date(item.time).getTime() >= threshold)
            .sort((a, b) => new Date(b.time) - new Date(a.time));
          return sendJson(res, { count: values.length, postInfos: paginate(values.map((item) => ({ ...postView(item), ip: "127.0.0.1" })), url, 10) });
        }
        if (method === "DELETE") {
          let count = 0;
          if (match[2] === "topic") {
            for (const topic of db.topics.filter((item) => item.userId === userId && new Date(item.time).getTime() >= threshold)) {
              if (softDeleteTopic(topic, "admin_bulk_user_topic_delete")) count += 1;
            }
          } else {
            for (const post of [...db.posts].filter((item) => item.userId === userId && new Date(item.time).getTime() >= threshold)) {
              if (softDeletePost(post, "admin_bulk_user_post_delete")) count += 1;
            }
          }
          persist();
          return sendJson(res, count);
        }
      }
      match = routeMatch(/^\/user\/(\d+)\/operation$/);
      if (match && method === "PUT") {
        const target = findUser(match[1]);
        if (!target) return sendText(res, "user_not_found", 404);
        const body = await readJson(req);
        const punishmentType = integer(body.PunishmentType ?? body.punishmentType, 0, 0, 3);
        const operationType = integer(body.OperationType ?? body.operationType, 0, 0, 1);
        if (punishmentType === 1) target.lockState = operationType;
        if (punishmentType === 2) target.isBlocked = Boolean(operationType);
        if (punishmentType === 3) target.tpUntil = operationType
          ? (integer(body.Days ?? body.days, -1, -1, 1000) < 0 ? null : new Date(Date.now() + integer(body.Days ?? body.days, 7, 1, 1000) * 86400000).toISOString())
          : "";
        db.operationRecords.push({ id: db.meta.nextOperationId++, targetUserId: target.id, operatorUserId: current.id, operation: "user", detail: body, time: isoNow() });
        persist();
        return sendText(res);
      }
      if (route === "/me/recent-topic" && method === "GET") return sendJson(res, paginate(topicList((item) => !item.isAnonymous && item.userId === current.id), url));
      if (route === "/me/recent-post" && method === "GET") {
        const values = db.posts
          .filter((item) => item.userId === current.id && !item.isAnonymous && !item.isDeleted && isVisiblePost(item))
          .sort((a, b) => new Date(b.time) - new Date(a.time))
          .map((item) => ({ ...postView(item), title: findTopic(item.topicId)?.title || item.title || "" }));
        return sendJson(res, { data: paginate(values, url), count: values.length });
      }
      if (route === "/me/hot-post" && method === "GET") {
        const values = db.posts
          .filter((item) => item.userId === current.id && !item.isAnonymous && !item.isDeleted && isVisiblePost(item))
          .sort((a, b) => (b.likeCount - b.dislikeCount) - (a.likeCount - a.dislikeCount))
          .map((item) => ({ ...postView(item), title: findTopic(item.topicId)?.title || item.title || "" }));
        return sendJson(res, { data: paginate(values, url), count: values.length });
      }

      if (route === "/me/followee" && method === "GET") {
        const ids = db.follows.filter((item) => item.followerId === current.id).map((item) => item.followeeId);
        return sendJson(res, paginate(ids, url));
      }
      if (route === "/me/follower" && method === "GET") {
        const ids = db.follows.filter((item) => item.followeeId === current.id).map((item) => item.followerId);
        return sendJson(res, paginate(ids, url));
      }
      if (route === "/me/followee/topic" && method === "GET") {
        const ids = new Set(db.follows.filter((item) => item.followerId === current.id).map((item) => item.followeeId));
        return sendJson(res, paginate(topicList((item) => !item.isAnonymous && ids.has(item.userId)), url));
      }
      match = routeMatch(/^\/me\/followee\/(\d+)$/);
      if (match) {
        const followeeId = integer(match[1]);
        if (!findUser(followeeId)) return sendText(res, "user_not_found", 404);
        const index = db.follows.findIndex((item) => item.followerId === current.id && item.followeeId === followeeId);
        if (method === "GET") return sendJson(res, index >= 0);
        if (method === "PUT" && index < 0 && followeeId !== current.id) db.follows.push({ followerId: current.id, followeeId, createdAt: isoNow() });
        if (method === "DELETE" && index >= 0) db.follows.splice(index, 1);
        if (method === "PUT" || method === "DELETE") {
          persist();
          return sendText(res);
        }
      }

      if (route === "/me/custom-board" && method === "GET") {
        const ids = db.boardFollows.filter((item) => item.userId === current.id).map((item) => item.boardId);
        return sendJson(res, ids.map(findBoard).filter(isVisibleBoard).map(boardView));
      }
      if (route === "/me/custom-board/topic" && method === "GET") {
        const ids = new Set(db.boardFollows.filter((item) => item.userId === current.id).map((item) => item.boardId));
        return sendJson(res, paginate(topicList((item) => ids.has(item.boardId)), url));
      }
      match = routeMatch(/^\/me\/custom-board\/(\d+)$/);
      if (match) {
        const boardId = integer(match[1]);
        if (!isVisibleBoard(findBoard(boardId))) return sendText(res, "board_not_found", 404);
        const index = db.boardFollows.findIndex((item) => item.userId === current.id && item.boardId === boardId);
        if (method === "GET") return sendJson(res, index >= 0);
        if (method === "PUT" && index < 0) db.boardFollows.push({ userId: current.id, boardId, createdAt: isoNow() });
        if (method === "DELETE" && index >= 0) db.boardFollows.splice(index, 1);
        if (method === "PUT" || method === "DELETE") {
          persist();
          return sendText(res);
        }
      }

      if (route === "/me/favorite-topic-group") {
        if (method === "GET") {
          const groups = db.favoriteGroups.filter((item) => item.userId === current.id).map((item) => ({
            ...item,
            count: db.favorites.filter((favorite) => favorite.userId === current.id && favorite.groupId === item.id).length
          }));
          // The native UserCenter expects the standard CC98 envelope here;
          // returning a bare array makes it silently fall back to its
          // hard-coded default group and hides newly created groups.
          return sendJson(res, { errorCode: 0, data: groups });
        }
        if (method === "POST") {
          const body = await readJson(req);
          const name = text(body.name, "", 10).trim();
          if (!name) return sendText(res, "name_required", 400);
          if (db.favoriteGroups.filter((item) => item.userId === current.id && item.id !== 0).length >= 10) return sendText(res, "group_count_limited", 400);
          db.favoriteGroups.push({ id: db.meta.nextFavoriteGroupId++, userId: current.id, name, createTime: isoNow() });
          persist();
          return sendText(res);
        }
        if (method === "PUT") {
          const body = await readJson(req);
          const group = db.favoriteGroups.find((item) => item.userId === current.id && item.id === integer(body.id));
          if (!group || group.id === 0) return sendText(res, "group_not_found", 404);
          group.name = text(body.name, group.name, 10).trim() || group.name;
          persist();
          return sendText(res);
        }
        if (method === "DELETE") {
          const groupId = integer(url.searchParams.get("groupid"), -1, -1);
          const index = db.favoriteGroups.findIndex((item) => item.userId === current.id && item.id === groupId && groupId !== 0);
          if (index < 0) return sendText(res, "group_not_found", 404);
          for (const favorite of db.favorites) if (favorite.userId === current.id && favorite.groupId === groupId) favorite.groupId = 0;
          db.favoriteGroups.splice(index, 1);
          persist();
          return sendText(res);
        }
      }
      match = routeMatch(/^\/me\/favorite\/(\d+)(?:\/move)?$/);
      if (match) {
        const topicId = integer(match[1]);
        if (!isVisibleTopic(findTopic(topicId))) return sendText(res, "topic_not_found", 404);
        const index = db.favorites.findIndex((item) => item.userId === current.id && item.topicId === topicId);
        if (method === "PUT") {
          const groupId = integer(url.searchParams.get("groupid"), 0);
          if (!db.favoriteGroups.some((item) => item.userId === current.id && item.id === groupId)) return sendText(res, "group_not_found", 400);
          if (index >= 0) db.favorites[index].groupId = groupId;
          else db.favorites.push({ userId: current.id, topicId, groupId, createdAt: isoNow() });
          persist();
          return sendText(res);
        }
        if (method === "DELETE") {
          if (index >= 0) db.favorites.splice(index, 1);
          persist();
          return sendText(res);
        }
      }
      if ((route === "/topic/me/favorite" || route === "/topic/me/search-favorite") && method === "GET") {
        const groupId = integer(url.searchParams.get("groupid"), 0);
        const keyword = text(url.searchParams.get("keyword"), "", 200).trim().toLowerCase();
        const ids = new Set(db.favorites.filter((item) => item.userId === current.id && (!groupId || item.groupId === groupId)).map((item) => item.topicId));
        let values = topicList((item) => ids.has(item.id) && (!keyword || topicSearchText(item).includes(keyword)));
        if (url.searchParams.get("order") === "1") values.sort((a, b) => new Date(b.lastPostTime) - new Date(a.lastPostTime));
        return sendJson(res, paginate(values, url, 11));
      }

      if (route === "/me/browsing-history" && method === "PUT") {
        current.browsingHistoryEnabled = url.searchParams.get("enabled") !== "false";
        persist();
        return sendText(res);
      }
      if ((route === "/me/browsing-record" || route === "/me/browsing-history") && method === "GET") {
        const records = db.browsingHistory.filter((item) => item.userId === current.id).sort((a, b) => new Date(b.time) - new Date(a.time));
        const values = records
          .map((record) => {
            const topic = findTopic(record.topicId);
            return isVisibleTopic(topic) ? { ...topicView(topic), browseTime: record.time } : null;
          })
          .filter(Boolean);
        return sendJson(res, { data: paginate(values, url), count: values.length });
      }

      if (route === "/board/all" && method === "GET") return sendJson(res, boardTreeView());
      if ((route === "/board" || route === "/board/") && method === "GET") {
        const ids = url.searchParams.getAll("id").map((value) => integer(value, -1, -1));
        return sendJson(res, ids.length
          ? ids.map(findBoard).filter((board) => board && !board.deleted).map(boardView)
          : db.boards.filter((board) => !board.deleted).map(boardView));
      }
      if (route === "/board/0" && method === "GET") {
        return sendJson(res, {
          id: 0,
          name: "全站",
          description: "全站搜索",
          bigPaper: "",
          boardMasters: [],
          masters: [],
          moderatorUserIds: [],
          boardMasterIds: [],
          anonymousState: 0,
          canEntry: true,
          isLocked: false,
          isLock: false,
          allowVote: false,
          canVote: false,
          parentId: 0,
          rootId: 0,
          topicCount: topicList().length,
          postCount: db.posts.filter(isVisiblePost).length,
          todayCount: 0,
          isFollowing: false
        });
      }
      if (route === "/board/search" && method === "GET") {
        const keyword = text(url.searchParams.get("keyword"), "", 200).toLowerCase();
        return sendJson(res, db.boards.filter((item) => !item.deleted && `${item.name}\n${item.description}`.toLowerCase().includes(keyword)).map(boardView));
      }
      if (route === "/board" && method === "POST") {
        if (!requireSiteAdmin()) return;
        const body = await readJson(req);
        const name = text(body.name, "", 80).trim();
        if (!name) return sendJson(res, { error: "board_name_required" }, 400);
        const board = {
          id: db.meta.nextBoardId++,
          name,
          description: text(body.description, "", 8000),
          bigPaper: text(body.bigPaper ?? body.description, "", 8000),
          boardMasters: [],
          masters: [],
          moderatorUserIds: [],
          boardMasterIds: [],
          anonymousState: integer(body.anonymousState, 0, 0, 3),
          canEntry: boolean(body.canEntry, true),
          isLocked: boolean(body.isLocked, false),
          allowVote: boolean(body.allowVote, true),
          parentId: integer(body.parentId, 0),
          rootId: integer(body.rootId, 0),
          deleted: false
        };
        board.rootId = board.rootId || board.id;
        db.boards.push(board);
        addAudit("board-create", "board", board.id, { name: board.name });
        persist();
        return sendJson(res, boardView(board), 201);
      }
      match = routeMatch(/^\/board\/(\d+)\/(tag|tag-v2)$/);
      if (match && method === "GET") {
        if (!isVisibleBoard(findBoard(match[1]))) return sendJson(res, { error: "board_not_found" }, 404);
        return sendJson(res, match[2] === "tag-v2" ? { layers: 1, tags: db.tags } : [{ layer: 1, tags: db.tags }]);
      }
      match = routeMatch(/^\/board\/(\d+)\/big-paper$/);
      if (match && method === "PUT") {
        const board = findBoard(match[1]);
        if (!isVisibleBoard(board)) return sendText(res, "board_not_found", 404);
        const body = await readJson(req);
        board.bigPaper = text(body.content, board.bigPaper || "", 8000);
        board.description = board.bigPaper;
        persist();
        return sendText(res);
      }
      match = routeMatch(/^\/board\/(\d+)\/events$/);
      if (match && method === "GET") {
        const boardId = integer(match[1]);
        const board = findBoard(boardId);
        if (!isVisibleBoard(board)) return sendJson(res, { error: "board_not_found" }, 404);
        if (!requireBoardModerator(board)) return;
        const topicIds = new Set(db.topics.filter((item) => item.boardId === boardId).map((item) => item.id));
        const boardEvents = db.topicEvents
          .filter((item) => topicIds.has(item.topicId))
          .sort((a, b) => new Date(b.time) - new Date(a.time))
          .map((item) => {
            const topic = findTopic(item.topicId);
            return {
              ...item,
              boardId,
              targetUserName: topic?.userName || "",
              operatorUserName: item.operatorUserName || findUser(item.operatorUserId)?.name || "LocalOperator",
              content: item.detail || item.operation,
              ip: item.ip || "127.0.0.1",
              isDeleted: Boolean(topic?.deleted)
            };
          });
        return sendJson(res, { count: boardEvents.length, boardEvents: paginate(boardEvents, url) });
      }
      match = routeMatch(/^\/board\/(\d+)\/stop-post-user(?:\/(\d+))?$/);
      if (match) {
        const boardId = integer(match[1]);
        const targetUserId = integer(match[2], 0);
        const board = findBoard(boardId);
        if (!isVisibleBoard(board)) return sendText(res, "board_not_found", 404);
        if (!requireBoardModerator(board)) return;
        if (method === "GET" && !targetUserId) {
          const values = db.boardStopPostUsers.filter((item) => item.boardId === boardId).map((item) => ({
            ...item,
            userName: findUser(item.userId)?.name || "LocalUser",
            operatorUserName: findUser(item.operatorUserId)?.name || "LocalOperator",
            days: Math.max(0, Math.ceil((new Date(item.expiredTime).getTime() - Date.now()) / 86400000)),
            userInfo: publicUser(findUser(item.userId))
          }));
          return sendJson(res, paginate(values, url));
        }
        if (method === "DELETE" && targetUserId) {
          const index = db.boardStopPostUsers.findIndex((item) => item.boardId === boardId && item.userId === targetUserId);
          if (index >= 0) db.boardStopPostUsers.splice(index, 1);
          persist();
          return sendText(res);
        }
      }
      match = routeMatch(/^\/board\/(\d+)\/moderators$/);
      if (match) {
        const board = findBoard(match[1]);
        if (!board || board.deleted) return sendJson(res, { error: "board_not_found" }, 404);
        if (method === "GET") {
          return sendJson(res, uniqueNumbers(board.moderatorUserIds).map(findUser).filter(Boolean).map((user) => publicUser(user)));
        }
        if (!requireSiteAdmin()) return;
        const body = await readJson(req);
        const userId = integer(body.userId ?? body.id, 0);
        const target = findUser(userId);
        if (!target) return sendJson(res, { error: "user_not_found" }, 404);
        if (method === "PUT" || method === "POST") {
          board.moderatorUserIds = uniqueNumbers([...(board.moderatorUserIds || []), target.id]);
          board.boardMasterIds = uniqueNumbers([...(board.boardMasterIds || []), target.id]);
          board.boardMasters = [...new Set([...(board.boardMasters || []), target.name])];
          board.masters = [...new Set([...(board.masters || []), target.name])];
          target.roles = normalizeRoles([...(target.roles || []), "boardModerator"]);
          addAudit("board-moderator-add", "board", board.id, { userId: target.id });
        } else if (method === "DELETE") {
          board.moderatorUserIds = uniqueNumbers((board.moderatorUserIds || []).filter((id) => id !== target.id));
          board.boardMasterIds = uniqueNumbers((board.boardMasterIds || []).filter((id) => id !== target.id));
          board.boardMasters = (board.boardMasters || []).filter((name) => name !== target.name);
          board.masters = (board.masters || []).filter((name) => name !== target.name);
          const remainsModerator = db.boards.some((item) => item.id !== board.id && (item.moderatorUserIds || []).includes(target.id));
          if (!remainsModerator) target.roles = normalizeRoles((target.roles || []).filter((role) => role !== "boardModerator"));
          addAudit("board-moderator-remove", "board", board.id, { userId: target.id });
        } else {
          return sendJson(res, { error: "method_not_allowed" }, 405);
        }
        persist();
        return sendJson(res, uniqueNumbers(board.moderatorUserIds).map(findUser).filter(Boolean).map((user) => publicUser(user)));
      }
      if (route === "/__local/boards" && method === "GET") {
        if (!requireSiteAdmin()) return;
        return sendJson(res, db.boards.map((board) => ({
          ...boardView(board),
          moderatorUsers: uniqueNumbers([...(board.moderatorUserIds || []), ...(board.boardMasterIds || [])])
            .map(findUser)
            .filter(Boolean)
            .map((user) => ({ id: user.id, name: user.name }))
        })));
      }
      match = routeMatch(/^\/__local\/boards\/(\d+)\/restore$/);
      if (match && method === "PUT") {
        if (!requireSiteAdmin()) return;
        const board = findBoard(match[1]);
        if (!board) return sendJson(res, { error: "board_not_found" }, 404);
        const deletedState = board.deletedState && typeof board.deletedState === "object"
          ? board.deletedState
          : null;
        board.deleted = false;
        board.canEntry = deletedState ? boolean(deletedState.canEntry, true) : true;
        board.isLocked = deletedState ? boolean(deletedState.isLocked, false) : false;
        delete board.deletedState;
        addAudit("board-restore", "board", board.id);
        persist();
        return sendJson(res, boardView(board));
      }
      if (route === "/__local/topics" && method === "GET") {
        if (!requireSiteAdmin()) return;
        const keyword = text(url.searchParams.get("keyword"), "", 200).trim().toLowerCase();
        const boardId = integer(url.searchParams.get("boardId"), 0, 0);
        const values = db.topics
          .filter((topic) => (
            (!boardId || topic.boardId === boardId)
            && (!keyword || `${topic.title}\n${topic.userName}`.toLowerCase().includes(keyword))
          ))
          .sort((left, right) => new Date(right.time) - new Date(left.time))
          .map((topic) => ({
            ...topicView(topic),
            deleted: Boolean(topic.deleted),
            boardName: findBoard(topic.boardId)?.name || "",
            canRestore: Boolean(topic.deleted)
          }));
        return sendJson(res, { count: values.length, data: paginate(values, url, 40) });
      }
      match = routeMatch(/^\/__local\/topics\/(\d+)\/restore$/);
      if (match && method === "PUT") {
        if (!requireSiteAdmin()) return;
        const topic = findTopic(match[1]);
        if (!topic) return sendJson(res, { error: "topic_not_found" }, 404);
        const board = findBoard(topic.boardId);
        if (!board || board.deleted) return sendJson(res, { error: "board_not_found" }, 404);
        topic.deleted = false;
        for (const post of allPostsForTopic(topic.id)) {
          if (!post.deletedByTopic) continue;
          post.isDeleted = false;
          post.deletedByTopic = false;
        }
        addTopicEvent(topic.id, "restore", "local_admin_console");
        addAudit("topic-restore", "topic", topic.id);
        persist();
        return sendJson(res, topicView(topic));
      }
      match = routeMatch(/^\/board\/(\d+)$/);
      if (match && method === "GET") {
        const board = findBoard(match[1]);
        return board && !board.deleted ? sendJson(res, boardView(board)) : sendJson(res, { error: "board_not_found" }, 404);
      }
      if (match && method === "PUT") {
        const board = findBoard(match[1]);
        if (!board || board.deleted) return sendText(res, "board_not_found", 404);
        const body = await readJson(req);
        for (const key of ["name", "description", "bigPaper"]) {
          if (Object.prototype.hasOwnProperty.call(body, key)) board[key] = text(body[key], board[key] || "", key === "name" ? 80 : 8000);
        }
        if (Object.prototype.hasOwnProperty.call(body, "anonymousState")) board.anonymousState = integer(body.anonymousState, board.anonymousState || 0, 0, 3);
        for (const key of ["parentId", "rootId"]) {
          if (Object.prototype.hasOwnProperty.call(body, key)) board[key] = integer(body[key], board[key] || 0);
        }
        for (const key of ["allowVote", "canEntry", "isLocked"]) {
          if (Object.prototype.hasOwnProperty.call(body, key)) board[key] = boolean(body[key], board[key]);
        }
        persist();
        return sendJson(res, boardView(board));
      }
      if (match && method === "DELETE") {
        const board = findBoard(match[1]);
        if (!board || board.deleted) return sendText(res, "board_not_found", 404);
        board.deletedState = {
          canEntry: board.canEntry !== false,
          isLocked: Boolean(board.isLocked)
        };
        board.deleted = true;
        board.canEntry = false;
        board.isLocked = true;
        addAudit("board-delete", "board", board.id, { name: board.name });
        persist();
        return sendText(res);
      }

      match = routeMatch(/^\/board\/(\d+)\/topic$/);
      if (match) {
        const board = findBoard(match[1]);
        if (!board || board.deleted) return sendText(res, "board_not_exists", 404);
        if (method === "GET") return sendJson(res, paginate(topicList((item) => item.boardId === board.id), url));
        if (method === "POST") {
          if (board.isLocked) return sendText(res, "cannot_post_in_this_board", 403);
          const body = await readJson(req);
          const content = boundedText(body.content, 8000);
          const rawTitle = boundedText(body.title, 80);
          if (content === null) return sendText(res, "content_too_long", 400);
          if (rawTitle === null) return sendText(res, "title_too_long", 400);
          const title = rawTitle.trim();
          if (!content.trim()) return sendText(res, "content_empty", 402);
          if (!title) return sendText(res, "title_empty", 400);
          const tags = resolveTopicTags(board, body);
          if (tags.error) return sendText(res, tags.error, tags.status);
          const isVote = boolean(body.isVote, false);
          if (isVote && board.allowVote === false) return sendText(res, "board_cannot_vote", 403);
          const anonymous = resolveAnonymousPost(board, null, actor, boolean(body.isAnonymous, false), "topic", isVote);
          if (anonymous.error) return sendText(res, anonymous.error, anonymous.status);
          const vote = isVote ? normalizeVoteInfo(body.voteInfo) : { voteInfo: null };
          if (vote.error) return sendText(res, vote.error, vote.status);
          const now = isoNow();
          const topicId = db.meta.nextTopicId++;
          const topic = {
            id: topicId,
            boardId: board.id,
            userId: current.id,
            userName: current.name,
            title,
            time: now,
            state: 0,
            type: integer(body.type, 0, 0, 10),
            tag1: tags.tag1,
            tag2: tags.tag2,
            isAnonymous: anonymous.value,
            isVote,
            voteInfo: vote.voteInfo,
            hitCount: 0,
            topState: 0,
            bestState: 0,
            saveState: 0,
            highlight: null,
            notifyAllReplierPostIds: [],
            lotteryTopicDetail: null
          };
          const firstPost = {
            id: db.meta.nextPostId++,
            topicId,
            boardId: board.id,
            userId: current.id,
            userName: current.name,
            floor: 1,
            contentType: integer(body.contentType, 0, 0, 1),
            content,
            title,
            time: now,
            lastUpdateAuthor: "",
            lastUpdateTime: "",
            isAnonymous: anonymous.value,
            anonymousCode: anonymous.value ? "A" : "",
            isDeleted: false,
            isLZ: true,
            parentId: null,
            likeCount: 0,
            dislikeCount: 0,
            state: 0
          };
          db.topics.push(topic);
          db.posts.push(firstPost);
          current.postCount = integer(current.postCount, 0) + 1;
          if (anonymous.cost) current.wealth = Math.max(0, integer(current.wealth, 0) - anonymous.cost);
          addTopicEvent(topicId, "create", title);
          persist();
          return sendText(res, String(topicId));
        }
      }

      if (route === "/topic/toptopics" && method === "GET") {
        const boardId = integer(url.searchParams.get("boardid"), 0);
        if (boardId && !isVisibleBoard(findBoard(boardId))) return sendJson(res, { error: "board_not_found" }, 404);
        return sendJson(res, topicList((item) => item.boardId === boardId && item.topState > 0));
      }
      match = routeMatch(/^\/topic\/(best|save)\/board\/(\d+)$/);
      if (match && method === "GET") {
        if (!isVisibleBoard(findBoard(match[2]))) return sendJson(res, { error: "board_not_found" }, 404);
        const key = match[1] === "best" ? "bestState" : "saveState";
        const all = topicList((item) => item.boardId === integer(match[2]) && item[key] > 0);
        return sendJson(res, { topics: paginate(all, url), count: all.length });
      }
      if (route === "/manage/reward-daily-record" && method === "GET") {
        const boardId = integer(url.searchParams.get("boardId"), 0);
        const board = findBoard(boardId);
        if (!isVisibleBoard(board)) return sendJson(res, { error: "board_not_found" }, 404);
        if (!requireBoardModerator(board)) return;
        const values = db.operationRecords.filter((item) => item.boardId === boardId && item.operation === "wealth");
        const rewarded = values.reduce((sum, item) => sum + Math.max(0, integer(item.value, 0, -100000)), 0);
        return sendJson(res, {
          boardId,
          boardName: board.name,
          rewarded,
          remaining: Math.max(0, 1000 - rewarded),
          rewardMaxValue: 1000,
          rewardTotalValue: rewarded,
          records: values
        });
      }
      if (isBatchTopicWrite) {
        const body = await readJson(req);
        const lockDays = route.endsWith("multi-lock")
          ? strictInteger(body.value, 1, 3650)
          : null;
        if (route.endsWith("multi-lock") && lockDays === null) {
          return sendJson(res, { error: "lock_days_error" }, 400);
        }
        for (const topic of authorizedBatchTopics) {
          if (route.endsWith("multi-delete")) softDeleteTopic(topic, text(body.reason, "", 500));
          else topic.state = 1;
          if (!route.endsWith("multi-delete")) {
            addTopicEvent(topic.id, "lock", JSON.stringify({ reason: text(body.reason, "", 500), days: lockDays }));
          }
        }
        persist();
        return sendText(res);
      }
      match = routeMatch(/^\/topic\/search\/board\/(\d+)\/tag$/);
      if (match && method === "GET") {
        const boardId = integer(match[1]);
        if (!isVisibleBoard(findBoard(boardId))) return sendJson(res, { error: "board_not_found" }, 404);
        const tag1 = integer(url.searchParams.get("tag1"), -1, -1);
        const tag2 = integer(url.searchParams.get("tag2"), -1, -1);
        return sendJson(res, paginate(topicList((item) => item.boardId === boardId && (tag1 < 0 || item.tag1 === tag1) && (tag2 < 0 || item.tag2 === tag2)), url));
      }
      match = routeMatch(/^\/topic\/search\/board\/(\d+)$/);
      if (match && method === "GET") {
        const boardId = integer(match[1]);
        if (!isVisibleBoard(findBoard(boardId))) return sendJson(res, { error: "board_not_found" }, 404);
        const keyword = text(url.searchParams.get("keyword"), "", 200).trim().toLowerCase();
        return sendJson(res, paginate(topicList((item) => item.boardId === boardId && (!keyword || topicSearchText(item).includes(keyword))), url));
      }
      if (route === "/topic/search" && method === "GET") {
        const keyword = text(url.searchParams.get("keyword"), "", 200).trim().toLowerCase();
        return sendJson(res, paginate(topicList((item) => !keyword || topicSearchText(item).includes(keyword)), url));
      }
      if (route === "/topic/basic" && method === "GET") {
        const ids = url.searchParams.getAll("id").map((value) => integer(value, -1, -1));
        return sendJson(res, ids.map(findTopic).filter(isVisibleTopic).map(topicView));
      }
      if (/^\/topic\/(new|new-media|school-event|academics|study|emotion|flea-market|full-time-job|part-time-job|hot-weekly|hot-monthly|hot-history|random-recent|random-recommendation)$/.test(route) && method === "GET") {
        let values = topicList();
        if (route.includes("hot")) values = values.sort((a, b) => (b.hitCount + b.replyCount * 10) - (a.hitCount + a.replyCount * 10));
        if (route.endsWith("random-recommendation")) values = rotateRandomList(values, "recommendation", url);
        if (route.endsWith("random-recent")) values = rotateRandomList(values, "recent", url);
        if (route.endsWith("random-recommendation")) {
          return sendJson(res, paginate(values, url).map((topic) => ({
            id: topic.id,
            topic,
            content: postsForTopic(topic.id)[0]?.content || ""
          })));
        }
        return sendJson(res, paginate(values, url));
      }

      match = routeMatch(/^\/topic\/(\d+)\/isfavorite$/);
      if (match && method === "GET") {
        if (!isVisibleTopic(findTopic(match[1]))) return sendJson(res, { error: "topic_not_found" }, 404);
        return sendJson(res, db.favorites.some((item) => item.userId === current.id && item.topicId === integer(match[1])));
      }
      match = routeMatch(/^\/topic\/(\d+)\/hot-post$/);
      if (match && method === "GET") {
        const topic = findTopic(match[1]);
        if (!isVisibleTopic(topic)) return sendJson(res, { error: "topic_not_found" }, 404);
        const values = postsForTopic(topic.id)
          .filter((item) => item.floor > 1 && (integer(item.likeCount, 0) - integer(item.dislikeCount, 0)) >= 10)
          .sort((a, b) => (b.likeCount - b.dislikeCount) - (a.likeCount - a.dislikeCount));
        return sendJson(res, values.slice(0, 3).map(postView));
      }
      const topicPostMatch = routeMatch(/^\/topic\/(\d+)\/post$/);
      const legacyTopicPostMatch = routeMatch(/^\/post\/topic\/(\d+)$/);
      if (topicPostMatch || legacyTopicPostMatch) {
        const isLegacyReplyEndpoint = Boolean(legacyTopicPostMatch);
        const topic = findTopic((topicPostMatch || legacyTopicPostMatch)[1]);
        if (!isVisibleTopic(topic)) return sendJson(res, { error: "topic_not_found" }, 404);
        if (!isLegacyReplyEndpoint && method === "GET") {
          return sendJson(res, paginate(postsForTopic(topic.id).map(postView), url, 10));
        }
        if (method !== "POST") return sendText(res, "method_not_allowed", 405);
        const result = createReply(topic, await readJson(req), actor);
        if (result.error) return sendText(res, result.error, result.status);
        persist();
        return sendText(res, String(result.post.id));
      }
      match = routeMatch(/^\/topic\/(\d+)\/vote$/);
      if (match) {
        const topic = findTopic(match[1]);
        if (!isVisibleTopic(topic) || !topic.isVote) return sendJson(res, { error: "vote_not_found" }, 404);
        const rawItems = Array.isArray(topic.voteInfo?.voteItems)
          ? topic.voteInfo.voteItems
          : (Array.isArray(topic.voteInfo?.items) ? topic.voteInfo.items : []);
        const ownRecord = db.voteRecords.find((item) => item.topicId === topic.id && item.userId === current.id) || null;
        const records = db.voteRecords.filter((item) => item.topicId === topic.id);
        const canInspectVoteRecords = Boolean(actor && isBoardModerator(actor, findBoard(topic.boardId)));
        const publicOwnRecord = ownRecord ? {
          items: uniqueNumbers(ownRecord.items),
          time: ownRecord.time
        } : null;
        const expiredTime = topic.voteInfo?.expiredTime || "2099-12-31T23:59:59.000Z";
        const isAvailable = topic.state !== 1 && new Date(expiredTime).getTime() > Date.now();
        const voteItems = rawItems.map((item, index) => ({
          id: integer(item.id, index + 1, 1),
          description: text(item.description ?? item.content ?? item, `选项 ${index + 1}`, 200),
          count: records.filter((record) => uniqueNumbers(record.items).includes(integer(item.id, index + 1, 1))).length
        }));
        if (method === "POST") {
          if (!isAvailable) return sendText(res, "vote_unavailable", 403);
          if (ownRecord) return sendText(res, "already_voted", 403);
          const body = await readJson(req);
          const maxVoteCount = integer(topic.voteInfo?.maxVoteCount, 1, 1, Math.max(1, voteItems.length));
          if (!Array.isArray(body.items)) return sendText(res, "vote_item_error", 400);
          const parsedItems = body.items.map((value) => strictInteger(value, 1, Number.MAX_SAFE_INTEGER));
          if (parsedItems.some((id) => id === null)) return sendText(res, "vote_item_error", 400);
          const items = [...new Set(parsedItems)];
          if (
            !items.length
            || items.length !== parsedItems.length
            || items.length > maxVoteCount
            || items.some((id) => !voteItems.some((item) => item.id === id))
          ) {
            return sendText(res, "vote_item_error", 400);
          }
          db.voteRecords.push({ userId: current.id, userName: current.name, topicId: topic.id, items, ip: "127.0.0.1", time: isoNow() });
          persist();
          return sendText(res);
        }
        if (method === "GET") return sendJson(res, {
          topicId: topic.id,
          voteItems,
          voteRecords: canInspectVoteRecords ? records : [],
          expiredTime,
          isAvailable,
          maxVoteCount: integer(topic.voteInfo?.maxVoteCount, 1, 1, Math.max(1, voteItems.length)),
          canVote: isAvailable && !ownRecord,
          myRecord: publicOwnRecord,
          needVote: Boolean(topic.voteInfo?.needVote),
          voteUserCount: records.length
        });
      }
      match = routeMatch(/^\/topic\/(\d+)\/event$/);
      if (match && method === "GET") {
        const topic = findTopic(match[1]);
        if (!isVisibleTopic(topic)) return sendJson(res, { error: "topic_not_found" }, 404);
        if (!requireBoardModerator(findBoard(topic.boardId))) return;
        const events = db.topicEvents
          .filter((item) => item.topicId === integer(match[1]))
          .sort((a, b) => new Date(b.time) - new Date(a.time))
          .map((item) => ({
            ...item,
            boardId: topic?.boardId || 0,
            content: item.detail || item.operation,
            targetUserName: topic?.userName || "",
            operatorUserName: item.operatorUserName || findUser(item.operatorUserId)?.name || "LocalOperator",
            ip: item.ip || "127.0.0.1"
          }));
        return sendJson(res, { count: events.length, data: paginate(events, url, 7) });
      }
      match = routeMatch(/^\/topic\/(\d+)\/look-ip$/);
      if (match && method === "GET") {
        const topic = findTopic(match[1]);
        if (!isVisibleTopic(topic)) return sendJson(res, { error: "topic_not_found" }, 404);
        const grouped = new Map();
        for (const post of postsForTopic(topic.id)) {
          const ip = post.ip || "127.0.0.1";
          if (!grouped.has(ip)) grouped.set(ip, []);
          grouped.get(ip).push({ ...postView(post), ip });
        }
        return sendJson(res, [...grouped.entries()].map(([ip, posts]) => ({ ip, posts })));
      }
      match = routeMatch(/^\/topic\/(\d+)\/(lock|best|not-hot|top|up|highlight)$/);
      if (match && (method === "PUT" || method === "DELETE")) {
        const topic = findTopic(match[1]);
        if (!isVisibleTopic(topic)) return sendText(res, "topic_not_found", 404);
        const body = await readJson(req);
        if (match[2] === "lock") topic.state = method === "DELETE" ? 0 : 1;
        if (match[2] === "best") topic.bestState = method === "DELETE" ? 0 : 1;
        if (match[2] === "not-hot") topic.notHot = method !== "DELETE";
        if (match[2] === "top") topic.topState = method === "DELETE" ? 0 : integer(body.topState ?? body.state ?? body, 1, 0, 10);
        if (match[2] === "up" && method === "PUT") topic.lastManualUpTime = isoNow();
        if (match[2] === "highlight") topic.highlight = method === "DELETE" ? null : body;
        addTopicEvent(topic.id, match[2], JSON.stringify(body).slice(0, 500));
        persist();
        return sendText(res);
      }
      match = routeMatch(/^\/topic\/(\d+)\/moveto\/(\d+)$/);
      if (match && method === "PUT") {
        const topic = findTopic(match[1]);
        const board = findBoard(match[2]);
        if (!isVisibleTopic(topic) || !isVisibleBoard(board)) return sendText(res, "not_found", 404);
        const sourceBoardId = topic.boardId;
        const body = await readJson(req);
        topic.boardId = board.id;
        for (const post of allPostsForTopic(topic.id)) post.boardId = board.id;
        addTopicEvent(topic.id, "moveto", JSON.stringify({
          fromBoardId: sourceBoardId,
          toBoardId: board.id,
          reason: text(body.reason, "", 500)
        }));
        persist();
        return sendText(res);
      }
      match = routeMatch(/^\/topic\/(\d+)$/);
      if (match && method === "GET") {
        const topic = findTopic(match[1]);
        if (!isVisibleTopic(topic)) return sendJson(res, { error: "topic_not_found" }, 404);
        topic.hitCount = integer(topic.hitCount, 0) + 1;
        recordBrowsing(topic.id);
        persist();
        return sendJson(res, topicView(topic));
      }
      if (match && method === "DELETE") {
        const topic = findTopic(match[1]);
        if (!isVisibleTopic(topic)) return sendText(res, "topic_not_found", 404);
        softDeleteTopic(topic, "local_topic_deleted");
        persist();
        return sendText(res);
      }

      if (route === "/post/basic" && method === "GET") {
        const ids = url.searchParams.getAll("id").map((value) => integer(value, -1, -1));
        return sendJson(res, ids.map(findPost).filter(isVisiblePost).map((post) => ({ ...postView(post), title: findTopic(post.topicId)?.title || "" })));
      }
      match = routeMatch(/^\/post\/(\d+)\/original$/);
      if (match && method === "GET") {
        const post = findPost(match[1]);
        const topic = post && findTopic(post.topicId);
        return post && isVisiblePost(post)
          ? sendJson(res, { ...postView(post), boardId: topic.boardId, title: post.floor === 1 ? topic.title : post.title })
          : sendJson(res, { error: "post_not_found" }, 404);
      }
      match = routeMatch(/^\/post\/(\d+)\/like$/);
      if (match) {
        const post = findPost(match[1]);
        if (!isVisiblePost(post)) return sendJson(res, { error: "post_not_found" }, 404);
        const index = db.reactions.findIndex((item) => item.userId === current.id && item.postId === post.id);
        if (method === "PUT") {
          const body = await readJson(req);
          const requested = integer(body.state ?? body, 0, 0, 2);
          const old = index >= 0 ? db.reactions[index].state : 0;
          const next = old === requested ? 0 : requested;
          if (old === 1) post.likeCount = Math.max(0, post.likeCount - 1);
          if (old === 2) post.dislikeCount = Math.max(0, post.dislikeCount - 1);
          if (next === 1) post.likeCount += 1;
          if (next === 2) post.dislikeCount += 1;
          if (next === 0 && index >= 0) db.reactions.splice(index, 1);
          else if (index >= 0) db.reactions[index].state = next;
          else if (next) db.reactions.push({ userId: current.id, postId: post.id, state: next, time: isoNow() });
          persist();
        }
        const reaction = db.reactions.find((item) => item.userId === current.id && item.postId === post.id);
        return sendJson(res, { likeCount: post.likeCount, dislikeCount: post.dislikeCount, likeState: reaction?.state || 0 });
      }
      if (route === "/post/rating-reason" && method === "GET") {
        const type = integer(url.searchParams.get("type"), 1, 1, 2);
        return sendJson(res, [{ id: type === 2 ? 2 : 1, reason: type === 2 ? "本地测试反对" : "本地测试支持", type, enabled: true }]);
      }
      match = routeMatch(/^\/post\/(\d+)\/rating$/);
      if (match && method === "PUT") {
        const post = findPost(match[1]);
        if (!isVisiblePost(post)) return sendText(res, "post_not_found", 404);
        if (post.userId === current.id) return sendText(res, "cannot_rate_yourself", 400);
        if (db.ratings.some((item) => item.postId === post.id && item.userId === current.id && item.kind !== "operation")) return sendText(res, "already_rated", 403);
        const body = await readJson(req);
        const value = integer(body.value, 1, -1, 1) < 0 ? -1 : 1;
        db.ratings.push({
          id: db.meta.nextAwardId++,
          postId: post.id,
          userId: current.id,
          reason: text(body.reason, value > 0 ? "本地测试支持" : "本地测试反对", 500),
          type: value > 0 ? 1 : 2,
          value,
          time: isoNow()
        });
        const author = findUser(post.userId);
        if (author) author.popularity = integer(author.popularity, 0, -100000) + value;
        persist();
        return sendText(res);
      }
      match = routeMatch(/^\/post\/(\d+)\/rating-v2$/);
      if (match && method === "PUT") {
        const post = findPost(match[1]);
        if (!isVisiblePost(post)) return sendText(res, "post_not_found", 404);
        if (post.userId === current.id) return sendText(res, "cannot_rate_yourself", 400);
        if (db.ratings.some((item) => item.postId === post.id && item.userId === current.id && item.kind !== "operation")) return sendText(res, "already_rated", 403);
        const body = await readJson(req);
        const type = integer(body.type, 1, 1, 2);
        const value = type === 2 ? -1 : 1;
        db.ratings.push({ id: db.meta.nextAwardId++, postId: post.id, userId: current.id, reasonId: integer(body.reasonId, type), reason: type === 2 ? "本地测试反对" : "本地测试支持", type, value, time: isoNow() });
        const author = findUser(post.userId);
        if (author) author.popularity = integer(author.popularity, 0, -100000) + value;
        persist();
        return sendText(res);
      }
      match = routeMatch(/^\/post\/(\d+)\/awards$/);
      if (match && method === "GET") {
        const post = findPost(match[1]);
        return sendJson(res, isVisiblePost(post) ? postView(post).awards : []);
      }
      match = routeMatch(/^\/post\/(\d+)\/operation$/);
      if (match && method === "POST") {
        const post = findPost(match[1]);
        if (!isVisiblePost(post)) return sendText(res, "post_not_found", 404);
        const body = await readJson(req);
        const operationType = integer(body.operationType, 0, 0, 1);
        const direction = operationType === 1 ? -1 : 1;
        const wealth = integer(body.wealth, 0, 0, 100000);
        const prestige = integer(body.prestige, 0, 0, 100000);
        const author = findUser(post.userId);
        if (author) {
          if (wealth) author.wealth = Math.max(0, integer(author.wealth, 0) + direction * wealth);
          if (prestige) author.prestige = integer(author.prestige, 0, -100000) + direction * prestige;
        }
        if (wealth || prestige) {
          db.ratings.push({
            id: db.meta.nextAwardId++,
            kind: "operation",
            postId: post.id,
            userId: current.id,
            reason: text(body.reason, "本地管理操作", 500),
            value: direction * (wealth || prestige),
            wealth: direction * wealth,
            prestige: direction * prestige,
            time: isoNow()
          });
        }
        const stopPostDays = integer(body.stopPostDays, 0, 0, 3650);
        if (stopPostDays > 0) {
          const existing = db.boardStopPostUsers.find((item) => item.boardId === post.boardId && item.userId === post.userId);
          const stopRecord = {
            boardId: post.boardId,
            userId: post.userId,
            reason: text(body.reason, "本地版面禁言", 500),
            operatorUserId: current.id,
            startTime: isoNow(),
            expiredTime: new Date(Date.now() + stopPostDays * 86400000).toISOString()
          };
          if (existing) Object.assign(existing, stopRecord);
          else db.boardStopPostUsers.push(stopRecord);
        }
        db.operationRecords.push({
          id: db.meta.nextOperationId++,
          boardId: post.boardId,
          postId: post.id,
          targetUserId: post.userId,
          operatorUserId: current.id,
          operation: wealth ? "wealth" : (prestige ? "prestige" : (stopPostDays ? "stop-post" : "post")),
          value: direction * (wealth || prestige || stopPostDays),
          detail: body,
          time: isoNow()
        });
        persist();
        return sendText(res);
      }
      if (match) return sendText(res, "method_not_allowed", 405);
      match = routeMatch(/^\/post\/(\d+)$/);
      if (match && method === "DELETE") {
        const post = findPost(match[1]);
        if (!isVisiblePost(post)) return sendText(res, "post_not_found", 404);
        softDeletePost(post, "local_post_deleted");
        persist();
        return sendText(res);
      }
      if (match && method === "PUT") {
        const post = findPost(match[1]);
        if (!isVisiblePost(post)) return sendText(res, "post_not_found", 404);
        if (!canEditPost(actor, post)) return sendText(res, "operation_forbidden", 403);
        const body = await readJson(req);
        const content = boundedText(body.content, 8000);
        if (content === null) return sendText(res, "content_too_long", 400);
        if (!content.trim()) return sendText(res, "content_empty", 402);

        const topic = post.floor === 1 ? findTopic(post.topicId) : null;
        let title = null;
        let tags = null;
        if (topic) {
          const rawTitle = boundedText(
            Object.prototype.hasOwnProperty.call(body, "title") ? body.title : topic.title,
            80
          );
          if (rawTitle === null) return sendText(res, "title_too_long", 400);
          title = rawTitle.trim();
          if (!title) return sendText(res, "title_empty", 400);
          tags = resolveTopicTags(findBoard(topic.boardId), {
            tag1: Object.prototype.hasOwnProperty.call(body, "tag1") ? body.tag1 : topic.tag1,
            tag2: Object.prototype.hasOwnProperty.call(body, "tag2") ? body.tag2 : topic.tag2
          });
          if (tags.error) return sendText(res, tags.error, tags.status);
        }

        post.content = content;
        post.contentType = integer(body.contentType, post.contentType, 0, 1);
        post.lastUpdateAuthor = current.name;
        post.lastUpdateTime = isoNow();
        if (topic) {
          topic.title = title;
          post.title = title;
          topic.type = integer(body.type, topic.type || 0, 0, 10);
          topic.tag1 = tags.tag1;
          topic.tag2 = tags.tag2;
        }
        persist();
        return sendText(res);
      }
      if ((route === "/post/topic/user" || route === "/post/topic/specific-user" || route === "/post/topic/anonymous/user") && method === "GET") {
        const topicId = integer(url.searchParams.get("topicid"), 0);
        const postId = integer(url.searchParams.get("postid"), 0);
        const topic = findTopic(topicId);
        if (!isVisibleTopic(topic)) return sendJson(res, { error: "topic_not_found" }, 404);
        const reference = postId ? findPost(postId) : null;
        if (postId && (!isVisiblePost(reference) || reference.topicId !== topic.id)) {
          return sendJson(res, { error: "post_not_found" }, 404);
        }
        const requestedUserId = integer(url.searchParams.get("userid") ?? url.searchParams.get("userId"), 0, 0);
        let matches;
        if (route === "/post/topic/user") {
          const userId = requestedUserId || reference?.userId || current.id;
          if (!findUser(userId)) return sendJson(res, { error: "user_not_found" }, 404);
          // Normal per-user trace intentionally omits anonymous floors. They are
          // projected through the anonymous endpoint without exposing identity.
          matches = (item) => !item.isAnonymous && item.userId === userId;
        } else if (!reference) {
          return sendJson(res, { error: "post_not_found" }, 404);
        } else if (route === "/post/topic/anonymous/user" || reference.isAnonymous) {
          if (!reference.isAnonymous) return sendJson(res, { error: "anonymous_post_required" }, 400);
          const anonymousCode = String(reference.anonymousCode || "");
          matches = (item) => item.isAnonymous && String(item.anonymousCode || "") === anonymousCode;
        } else {
          matches = (item) => !item.isAnonymous && item.userId === reference.userId;
        }
        const all = postsForTopic(topic.id).filter(matches).map(postView);
        return sendJson(res, paginate(all, url, 10).map((post) => ({ ...post, count: all.length })));
      }

      if (route === "/message/recent-contact-users" && method === "GET") {
        const conversations = new Map();
        for (const message of db.messages) {
          if (message.senderId !== current.id && message.receiverId !== current.id) continue;
          if (uniqueNumbers(message.deletedBy).includes(current.id)) continue;
          const userId = message.senderId === current.id ? message.receiverId : message.senderId;
          const previous = conversations.get(userId);
          if (!previous || new Date(message.time) > new Date(previous.time)) conversations.set(userId, message);
        }
        const contacts = [...conversations.entries()].map(([userId, message]) => ({
          userId,
          time: message.time,
          isRead: message.senderId === current.id || message.isRead,
          lastContent: message.content
        })).sort((a, b) => new Date(b.time) - new Date(a.time));
        return sendJson(res, paginate(contacts, url, 7));
      }
      match = routeMatch(/^\/message\/user\/(\d+)$/);
      if (match && method === "GET") {
        const otherId = integer(match[1]);
        const values = db.messages.filter((item) =>
          ((item.senderId === current.id && item.receiverId === otherId)
          || (item.senderId === otherId && item.receiverId === current.id))
          && !uniqueNumbers(item.deletedBy).includes(current.id)
        ).sort((a, b) => new Date(b.time) - new Date(a.time));
        let changed = false;
        for (const message of values) {
          if (message.receiverId === current.id && !message.isRead) {
            message.isRead = true;
            changed = true;
          }
        }
        if (changed) persist();
        return sendJson(res, paginate(values, url, 10));
      }
      if (route === "/message" && method === "POST") {
        const body = await readJson(req);
        const receiverId = integer(body.receiverId, 0);
        const receiver = findUser(receiverId);
        const content = text(body.content, "", 6000);
        if (!receiver || receiver.id === current.id) return sendText(res, "receiver_not_found", 400);
        if (!content.trim()) return sendText(res, "content_empty", 400);
        const message = {
          id: db.meta.nextMessageId++,
          senderId: current.id,
          receiverId,
          content,
          time: isoNow(),
          isRead: false,
          deletedBy: []
        };
        db.messages.push(message);
        persist();
        return sendText(res, String(message.id));
      }
      match = routeMatch(/^\/message\/(\d+)$/);
      if (match && method === "DELETE") {
        const messageId = integer(match[1]);
        const message = db.messages.find((item) => item.id === messageId && (item.senderId === current.id || item.receiverId === current.id));
        if (message) {
          message.deletedBy = uniqueNumbers([...(message.deletedBy || []), current.id]);
          const participants = new Set([message.senderId, message.receiverId]);
          if ([...participants].every((userId) => message.deletedBy.includes(userId))) {
            db.messages = db.messages.filter((item) => item !== message);
          }
        }
        persist();
        return sendText(res);
      }

      match = routeMatch(/^\/notification\/(reply|at|system)$/);
      if (match && method === "GET") {
        const values = notificationsFor(match[1], current.id).sort((a, b) => new Date(b.time) - new Date(a.time));
        return sendJson(res, paginate(values.map(withPostInfo), url, 10));
      }
      match = routeMatch(/^\/notification\/read-all-(reply|at|system)$/);
      if (match && (method === "PUT" || method === "POST")) {
        for (const item of db.notifications[match[1]]) if (item.userId === current.id) item.isRead = true;
        persist();
        return sendText(res);
      }
      if (route === "/notification/at" && method === "POST") {
        const names = await readJson(req);
        const topicId = integer(url.searchParams.get("topicid"), 0);
        const postId = integer(url.searchParams.get("postid"), 0);
        const topic = findTopic(topicId);
        const post = findPost(postId);
        if (!isVisibleTopic(topic) || !isVisiblePost(post) || post.topicId !== topic.id) {
          return sendJson(res, { error: "post_not_found" }, 404);
        }
        if (!canEditPost(actor, post)) return sendJson(res, { error: "operation_forbidden" }, 403);
        for (const name of Array.isArray(names) ? names : []) {
          const target = db.users.find((item) => item.name.toLowerCase() === String(name).toLowerCase());
          const alreadyNotified = target && db.notifications.at.some((item) => (
            item.userId === target.id && item.senderId === current.id && item.postId === post.id
          ));
          if (target && target.id !== current.id && !alreadyNotified) {
            db.notifications.at.push({ id: db.meta.nextEventId++, userId: target.id, senderId: current.id, topicId, postId, content: post.content, time: isoNow(), isRead: false });
          }
        }
        persist();
        return sendText(res);
      }

      recordUnknownRequest(method, url);
      if (process.env.CC98_LOCAL_STRICT_API === "1") {
        return sendJson(res, { error: "local_api_not_implemented", method, path: url.pathname }, 501);
      }
      return sendJson(res, []);
    }
  };
}

module.exports = {
  SCHEMA_VERSION,
  createLocalForumBackend,
  createSeedData,
  normalizeData
};
