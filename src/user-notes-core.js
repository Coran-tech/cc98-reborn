(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornUserNotesCore = api;
})(globalThis, function () {
  "use strict";

  const MAX_LENGTH = 80;
  const STORAGE_PREFIX = "cc98RebornUserNote:uid:";

  function normalizeUid(value) {
    if (typeof value !== "number" && typeof value !== "string") return "";
    const uid = String(value);
    if (!/^[1-9]\d*$/.test(uid) || !Number.isSafeInteger(Number(uid))) return "";
    return uid;
  }

  function normalizeNote(value) {
    if (typeof value !== "string") return "";
    const text = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
      .replace(/\s+/g, " ").trim();
    return Array.from(text).slice(0, MAX_LENGTH).join("").trim();
  }

  function storageKey(ownerUid, targetUid) {
    const owner = normalizeUid(ownerUid);
    const target = normalizeUid(targetUid);
    return owner && target ? `${STORAGE_PREFIX}${owner}:user:${target}` : "";
  }

  function parseStorageKey(key) {
    if (typeof key !== "string") return null;
    const match = /^cc98RebornUserNote:uid:([1-9]\d*):user:([1-9]\d*)$/.exec(key);
    if (!match) return null;
    const ownerUid = normalizeUid(match[1]);
    const targetUid = normalizeUid(match[2]);
    return ownerUid && targetUid ? { ownerUid, targetUid } : null;
  }

  return { MAX_LENGTH, normalizeUid, normalizeNote, storageKey, parseStorageKey };
});
