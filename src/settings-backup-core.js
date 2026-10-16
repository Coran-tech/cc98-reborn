(function (root, factory) {
  const pins = typeof module === "object" && module.exports ? require("./private-message-pins-core.js") : root.CC98RebornPrivateMessagePinsCore;
  const contentRules = typeof module === "object" && module.exports ? require("./content-filter-core.js") : root.CC98RebornContentFilterCore;
  const semanticRules = typeof module === "object" && module.exports ? require("./semantic-filter-core.js") : root.CC98RebornSemanticFilterCore;
  const api = factory(pins, contentRules, semanticRules);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornSettingsBackupCore = api;
})(globalThis, function (pins, contentRules, semanticRules) {
  "use strict";
  const FORMAT = "cc98-reborn-personal-settings";
  const MAX_BYTES = 2 * 1024 * 1024;
  const SETTINGS_KEY = "cc98ComfortSettings";
  const BOARDS_KEY = "cc98RebornPinnedBoards:v1";
  const excludedSettings = new Set(["aiSearchSuggestApiKey"]);
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
  function boardPins(value) {
    if (!Array.isArray(value) || value.length > 1000) throw new Error("版面置顶数据无效");
    return [...new Set(value.map(href => {
      if (typeof href !== "string") throw new Error("版面置顶地址无效");
      const url = new URL(href, "https://www.cc98.org");
      const localTest = /^(?:localhost|127\.0\.0\.1)$/.test(url.hostname);
      const trusted = /(?:^|\.)cc98\.org$|(?:^|\.)webvpn\.zju\.edu\.cn$/i.test(url.hostname);
      const id = url.pathname.match(/\/board\/([1-9]\d*)\/?$/)?.[1];
      if (!id || !/^https?:$/.test(url.protocol) || (!trusted && !localTest)) throw new Error("版面置顶地址无效");
      return `/board/${id}`;
    }))];
  }
  function settings(raw, defaults, strict = true) {
    if (!object(raw)) throw new Error("插件设置格式无效");
    const result = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!Object.hasOwn(defaults, key) || excludedSettings.has(key)) {
        if (strict) throw new Error(`备份包含不支持的设置：${key}`);
        continue;
      }
      let valid = typeof value === typeof defaults[key] && (typeof value !== "number" || Number.isFinite(value)) && (typeof value !== "string" || value.length <= (key === "blockedContentRules" ? 320000 : 100000));
      const ranges = { fontScale: [90, 120], emojiScale: [70, 200], imageLoadDuration: [800, 8000], cornerRadius: [0, 32] };
      if (ranges[key]) valid &&= value >= ranges[key][0] && value <= ranges[key][1];
      if (key === "themeMode") valid &&= ["light", "dark", "auto"].includes(value);
      if (key === "themeStyle") valid &&= ["modern", "ascii"].includes(value);
      if (key === "themePalette") valid &&= ["teal", "green", "blue", "violet", "rose", "amber", "custom"].includes(value);
      if (/^theme(?:Day|Night)Start$/.test(key)) valid &&= /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
      if (/^themeCustom(?:Primary|Secondary)$/.test(key)) valid &&= /^#[0-9a-f]{6}$/i.test(value);
      if (key === "blockedContentRules") {
        try { contentRules.parseRules(value); } catch { valid = false; }
      }
      if (key === "blockedTitleKeywords") {
        try { contentRules.parseTitleRules(value, true); } catch { valid = false; }
      }
      if (!valid && strict) throw new Error(`设置值无效：${key}`);
      result[key] = valid ? value : defaults[key];
    }
    if (result.themeDayStart && result.themeDayStart === result.themeNightStart) throw new Error("昼夜切换时间不能相同");
    if (Object.keys(result).some(key => key.startsWith("semanticFilter"))) {
      const normalized = semanticRules.normalize({ ...defaults, ...result }, { strict });
      for (const key of Object.keys(semanticRules.DEFAULTS)) {
        if (Object.hasOwn(result, key)) result[key] = normalized[key];
      }
    }
    return result;
  }
  function validateData(raw, defaults, strict = true) {
    if (!object(raw) || Object.keys(raw).length > 20000) throw new Error("个人配置格式无效");
    const data = Object.create(null);
    for (const [key, value] of Object.entries(raw)) {
      if (key === SETTINGS_KEY) data[key] = settings(value, defaults, strict);
      else if (key === BOARDS_KEY) data[key] = boardPins(value);
      else if (/^cc98RebornUserNote:uid:([1-9]\d*):user:([1-9]\d*)$/.test(key)) {
        const ids = key.match(/uid:(\d+):user:(\d+)/);
        if (!pins.uid(ids[1]) || !pins.uid(ids[2]) || typeof value !== "string" || Array.from(value).length > 80 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("用户备注数据无效");
        data[key] = value;
      } else if (pins.parseKey(key)) {
        if (!Array.isArray(value) || value.length > pins.MAX_PINS || value.some(pin => !object(pin) || !pins.uid(pin.uid) || typeof pin.name !== "string" || Array.from(pin.name).length > 80)) throw new Error("私信置顶数据无效");
        data[key] = pins.normalize(value);
      } else if (strict) throw new Error(`备份包含不支持的数据：${key}`);
    }
    if (!Object.keys(data).length) throw new Error("备份中没有可恢复的个人配置");
    return data;
  }
  function create(records, defaults, extensionVersion, now = new Date()) {
    const source = { ...records, [SETTINGS_KEY]: { ...defaults, ...(records[SETTINGS_KEY] || {}) } };
    const data = validateData(source, defaults, false);
    const backup = { format: FORMAT, version: 1, extensionVersion, createdAt: now.toISOString(), data };
    const text = JSON.stringify(backup, null, 2);
    if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error("个人配置超过备份文件大小上限");
    return text;
  }
  function parse(text, defaults) {
    if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_BYTES) throw new Error("备份文件过大");
    let backup;
    try { backup = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("无法读取 JSON 备份文件"); }
    if (!object(backup) || backup.format !== FORMAT || backup.version !== 1) throw new Error("这不是支持的 CC98 Reborn 设置备份");
    return { ...backup, data: validateData(backup.data, defaults) };
  }
  function summary(data) {
    const owners = new Set();
    let notes = 0, contacts = 0;
    for (const [key, value] of Object.entries(data)) {
      const note = key.match(/^cc98RebornUserNote:uid:(\d+):/);
      if (note) { notes += 1; owners.add(note[1]); }
      const owner = pins.parseKey(key);
      if (owner) { contacts += value.length; owners.add(owner); }
    }
    return { settings: Object.keys(data[SETTINGS_KEY] || {}).length, notes, contacts, boards: data[BOARDS_KEY]?.length || 0, accounts: owners.size };
  }
  return { FORMAT, MAX_BYTES, SETTINGS_KEY, BOARDS_KEY, create, parse, summary, boardPins };
});
