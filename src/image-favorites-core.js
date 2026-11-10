(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornImageFavoritesCore = api;
})(globalThis, function () {
  "use strict";
  const PREFIX = "cc98RebornImageFavorites:v1:uid:";
  const MAX_ITEMS = 5000, MAX_NOTE = 200, MAX_URL = 4096;
  function uid(value) {
    const text = String(value ?? "");
    return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text)) ? text : "";
  }
  function storageKey(owner) { return uid(owner) ? PREFIX + uid(owner) : ""; }
  function text(value, limit) { return typeof value === "string" ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, limit).join("") : ""; }
  function imageUrl(value) {
    if (typeof value !== "string" || value.length > MAX_URL || /[\u0000-\u001f\u007f]/.test(value)) return "";
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
      return url.href.replace(/\[/g, "%5B").replace(/\]/g, "%5D");
    } catch { return ""; }
  }
  function sourceUrl(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port
        || !/^(?:(?:www\.)?cc98\.org|(?:[a-z0-9-]+\.)*webvpn\.zju\.edu\.cn)$/i.test(url.hostname)) return "";
      const route = url.pathname.match(/\/topic\/([1-9]\d*)(?:\/([1-9]\d*))?\/?$/);
      if (!route || !uid(route[1])) return "";
      const floor = /^#\d+$/.test(url.hash) ? url.hash : "";
      return `https://www.cc98.org/topic/${route[1]}${route[2] ? `/${route[2]}` : ""}${floor}`;
    } catch { return ""; }
  }
  function codeFor(value) {
    const url = imageUrl(value);
    return url ? `[img]${url.replace(/\[/g, "%5B").replace(/\]/g, "%5D")}[/img]` : "";
  }
  function item(raw, now = 0) {
    const url = imageUrl(raw?.url);
    if (!url) return null;
    const sourceHref = sourceUrl(raw.sourceHref);
    return { url, code: codeFor(url), note: text(raw.note, MAX_NOTE), sourceHref,
      sourceTitle: sourceHref ? text(raw.sourceTitle, 300) : "",
      createdAt: Number.isSafeInteger(raw.createdAt) && raw.createdAt > 0 ? raw.createdAt : now };
  }
  function normalize(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set(), items = [];
    for (const entry of raw) {
      const value = item(entry);
      if (!value || seen.has(value.url)) continue;
      seen.add(value.url); items.push(value);
    }
    return items;
  }
  function mutate(raw, message, now = Date.now()) {
    const items = normalize(raw), url = imageUrl(message?.item?.url || message?.url);
    if (!url) throw new Error("图片地址无效，仅支持 HTTP 或 HTTPS 图片");
    const index = items.findIndex(entry => entry.url === url);
    if (message.action === "toggle") {
      if (index >= 0) items.splice(index, 1);
      else {
        if (items.length >= MAX_ITEMS) throw new Error(`图片收藏已达到 ${MAX_ITEMS} 项，请先删除部分收藏`);
        items.unshift(item({ ...message.item, url, note: "", createdAt: now }, now));
      }
    } else if (message.action === "remove") {
      if (index >= 0) items.splice(index, 1);
    } else if (message.action === "note") {
      if (index < 0) throw new Error("这张图片已不在收藏中");
      items[index] = { ...items[index], note: text(message.note, MAX_NOTE) };
    } else throw new Error("不支持的图片收藏操作");
    return items;
  }
  return Object.freeze({ PREFIX, MAX_ITEMS, MAX_NOTE, MAX_URL, uid, storageKey, imageUrl, sourceUrl, codeFor, item, normalize, mutate });
});
