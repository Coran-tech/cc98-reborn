(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornPrivateMessagePinsCore = api;
})(globalThis, function () {
  "use strict";
  const PREFIX = "cc98RebornPrivateMessagePins:v1:uid:";
  const MAX_PINS = 1000;
  function uid(value) {
    const text = String(value ?? "");
    return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text)) ? text : "";
  }
  function storageKey(owner) { return uid(owner) ? PREFIX + uid(owner) : ""; }
  function parseKey(key) { return typeof key === "string" && key.startsWith(PREFIX) ? uid(key.slice(PREFIX.length)) : ""; }
  function normalize(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.flatMap(item => {
      const id = uid(item?.uid);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      const name = typeof item.name === "string" ? Array.from(item.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, 80).join("") : "";
      return [{ uid: id, name }];
    }).slice(0, MAX_PINS);
  }
  return { PREFIX, MAX_PINS, uid, storageKey, parseKey, normalize };
});
