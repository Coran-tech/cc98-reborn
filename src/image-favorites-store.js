(function (root, factory) {
  const core = typeof module === "object" && module.exports ? require("./image-favorites-core.js") : root.CC98RebornImageFavoritesCore;
  const api = factory(root, core);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornImageFavoritesStore = api.createStore();
})(globalThis, function (root, core) {
  "use strict";
  function createStore(options = {}) {
    const chrome = options.chrome || root.chrome, now = options.now || Date.now, locks = new Map();
    function trusted(sender) {
      try {
        const url = new URL(sender?.url);
        return sender.id === chrome.runtime.id && Number.isInteger(sender.tab?.id) && sender.tab.id >= 0
          && Number.isInteger(sender.frameId) && sender.frameId >= 0 && /^https?:$/.test(url.protocol)
          && !url.username && !url.password && !url.port
          && /^(?:(?:www\.)?cc98\.org|(?:[a-z0-9-]+\.)*webvpn\.zju\.edu\.cn)$/i.test(url.hostname);
      } catch { return false; }
    }
    function storage(method, value) {
      return new Promise((resolve, reject) => {
        let done = false;
        const finish = (result, error) => { if (done) return; done = true; error ? reject(new Error(error.message || String(error))) : resolve(result); };
        try { chrome.storage.local[method](value, result => finish(result, chrome.runtime.lastError))?.then?.(result => finish(result), error => finish(undefined, error)); }
        catch (error) { finish(undefined, error); }
      });
    }
    async function handle(message, sender) {
      if (message?.type !== "CC98_IMAGE_FAVORITES" || !trusted(sender)) throw new Error("无法从此页面修改图片收藏");
      const owner = core.uid(message.owner), key = core.storageKey(owner);
      if (!key) throw new Error("请先登录 CC98 后收藏图片");
      const work = (locks.get(owner) || Promise.resolve()).catch(() => {}).then(async () => {
        const records = await storage("get", key);
        const items = core.mutate(records[key], message, now());
        await storage("set", { [key]: items });
        return { ok: true, owner, items };
      });
      locks.set(owner, work);
      try { return await work; } finally { if (locks.get(owner) === work) locks.delete(owner); }
    }
    return Object.freeze({ handle });
  }
  return Object.freeze({ createStore });
});
