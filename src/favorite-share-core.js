(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornFavoriteShareCore = api;
})(globalThis, function () {
  "use strict";

  const VERSION = 1;
  const MAX_TOPICS = 2000;
  const MAX_SHARE_LENGTH = 1024 * 1024;
  const MAX_NAME_LENGTH = 80;
  const MAX_TITLE_LENGTH = 300;
  const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    crcTable[i] = value >>> 0;
  }

  function fail(message) {
    throw new Error(message);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function hasOnlyKeys(value, keys) {
    return isRecord(value) && Object.keys(value).length === keys.length
      && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  function boundedText(value, limit, label, truncate) {
    if (typeof value !== "string") fail(`${label}必须是文字。`);
    let result = "";
    let count = 0;
    for (const character of value) {
      count += 1;
      if (count > limit) {
        if (!truncate) fail(`${label}不能超过 ${limit} 个字符。`);
        break;
      }
      result += character;
    }
    return result;
  }

  function normalizeId(value) {
    if (typeof value !== "number" && typeof value !== "string") fail("收藏数据包含无效的帖子编号。");
    const id = String(value);
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      fail("收藏数据包含无效的帖子编号。");
    }
    return id;
  }

  function normalizeTopics(topics, options = {}) {
    if (!Array.isArray(topics)) fail("收藏数据中的帖子列表格式不正确。");
    if (topics.length > MAX_TOPICS) fail(`一次最多分享 ${MAX_TOPICS} 个帖子。`);
    const seen = new Set();
    const normalized = [];
    let duplicates = 0;
    for (const topic of topics) {
      if (!isRecord(topic) || (options.strict && !hasOnlyKeys(topic, ["id", "title"]))) {
        fail("收藏数据中的帖子格式不正确。");
      }
      const id = normalizeId(topic.id);
      const title = boundedText(topic.title === undefined && !options.strict ? "" : topic.title,
        MAX_TITLE_LENGTH, "帖子标题", !options.strict);
      if (seen.has(id)) {
        duplicates += 1;
        continue;
      }
      seen.add(id);
      normalized.push({ id, title });
    }
    return { topics: normalized, duplicates };
  }

  function checksum(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
    return ((value ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
  }

  function base64urlEncode(bytes) {
    const result = [];
    for (let index = 0; index < bytes.length; index += 3) {
      const a = bytes[index];
      const b = bytes[index + 1];
      const c = bytes[index + 2];
      result.push(BASE64[a >>> 2], BASE64[((a & 3) << 4) | ((b || 0) >>> 4)]);
      if (index + 1 < bytes.length) result.push(BASE64[((b & 15) << 2) | ((c || 0) >>> 6)]);
      if (index + 2 < bytes.length) result.push(BASE64[c & 63]);
    }
    return result.join("");
  }

  function base64urlDecode(text) {
    if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) fail("分享字符串已损坏，请重新复制完整内容。");
    const bytes = new Uint8Array(Math.floor(text.length * 6 / 8));
    let value = 0;
    let bits = 0;
    let offset = 0;
    for (const character of text) {
      value = (value << 6) | BASE64.indexOf(character);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes[offset++] = (value >>> bits) & 255;
      }
    }
    // Require canonical padding bits, so every payload has only one encoding.
    if (bits && (value & ((1 << bits) - 1))) fail("分享字符串已损坏，请重新复制完整内容。");
    return bytes;
  }

  function encode(data) {
    if (!isRecord(data)) fail("收藏数据格式不正确。");
    const name = boundedText(data.name === undefined ? "" : data.name, MAX_NAME_LENGTH, "收藏夹名称", true);
    const { topics } = normalizeTopics(data.topics);
    // Pick these fields explicitly; account data and other properties never enter the payload.
    const bytes = new TextEncoder().encode(JSON.stringify({ version: VERSION, name, topics }));
    if (Math.ceil(bytes.length * 4 / 3) + 17 > MAX_SHARE_LENGTH) fail("分享内容过长，请减少帖子数量后重试。");
    return `CC98F${VERSION}.${base64urlEncode(bytes)}.${checksum(bytes)}`;
  }

  function decode(input) {
    if (typeof input !== "string") fail("请粘贴收藏夹分享字符串。");
    if (input.length > MAX_SHARE_LENGTH) fail("分享字符串过长，请分批导入。");
    const text = input.trim();
    if (!text) fail("请粘贴收藏夹分享字符串。");
    const parts = text.split(".");
    if (/^CC98F\d+$/.test(parts[0]) && parts[0] !== `CC98F${VERSION}`) {
      fail("暂不支持这个分享版本，请更新插件后重试。");
    }
    if (parts.length !== 3 || parts[0] !== `CC98F${VERSION}` || !/^[a-fA-F0-9]{8}$/.test(parts[2])) {
      fail("分享字符串格式不正确，请复制完整的 CC98F1 分享内容。");
    }
    const bytes = base64urlDecode(parts[1]);
    if (checksum(bytes) !== parts[2].toLowerCase()) fail("分享字符串校验失败，内容可能被修改或截断，请重新复制。");
    let data;
    try {
      data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      fail("分享内容已损坏，无法读取收藏数据。");
    }
    if (!isRecord(data)) fail("收藏数据格式不正确。");
    if (data.version !== VERSION) fail("暂不支持这个分享版本，请更新插件后重试。");
    if (!hasOnlyKeys(data, ["version", "name", "topics"])) fail("收藏数据包含不支持的字段或缺少必要字段。");
    const name = boundedText(data.name, MAX_NAME_LENGTH, "收藏夹名称", false);
    const { topics, duplicates } = normalizeTopics(data.topics, { strict: true });
    return { version: VERSION, name, topics, duplicates };
  }

  return { VERSION, MAX_TOPICS, MAX_SHARE_LENGTH, MAX_NAME_LENGTH, MAX_TITLE_LENGTH, encode, decode, normalizeTopics };
});
