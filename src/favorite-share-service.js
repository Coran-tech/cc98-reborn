(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornFavoriteShareService = api;
})(globalThis, function () {
  "use strict";

  const MAX_TOPICS = 2000;
  const PAGE_SIZE = 11;
  const PAGE_STEP = 10;

  function failure(message, properties = {}) {
    return Object.assign(new Error(message), properties);
  }

  function abortError() {
    return failure("已取消", { name: "AbortError" });
  }

  function checkAbort(signal) {
    if (signal?.aborted) throw abortError();
  }

  function wait(milliseconds, signal) {
    checkAbort(signal);
    if (!milliseconds) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const timer = setTimeout(finish, milliseconds);
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(abortError());
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  function groupNumber(value) {
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) {
      throw failure("收藏分组无效");
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0 || value === "" || value == null) {
      throw failure("收藏分组无效");
    }
    return number;
  }

  function topicValue(value) {
    if (typeof value?.id !== "number" && (typeof value?.id !== "string" || !/^\d+$/.test(value.id))) {
      throw failure("收藏中包含无效的帖子编号");
    }
    const id = Number(value?.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw failure("收藏中包含无效的帖子编号");
    return { id, title: typeof value.title === "string" ? value.title : "" };
  }

  function retryAfterSeconds(value) {
    if (!value) return null;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return Math.ceil(number);
    const time = Date.parse(value);
    return Number.isFinite(time) ? Math.max(0, Math.ceil((time - Date.now()) / 1000)) : null;
  }

  function pauseReason(error) {
    if (error?.name === "AbortError") return "已取消，未完成的帖子可继续导入";
    if (error?.code === "ACCOUNT_CHANGED") return "登录账号已变化，导入已暂停";
    if (error?.status === 401) return "登录状态已失效，请重新登录后继续导入";
    if (error?.status === 403) return "请求被拒绝，导入已暂停";
    if (error?.status === 429) return "请求过于频繁，请稍后继续导入";
    return "";
  }

  function create({ request, delay = wait, intervalMs = 600, maxTopics = MAX_TOPICS } = {}) {
    if (typeof request !== "function") throw new TypeError("request is required");
    const interval = Number(intervalMs);
    if (!Number.isFinite(interval) || interval < 0) throw new TypeError("intervalMs must be nonnegative");
    const limit = Number(maxTopics);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_TOPICS) throw new TypeError("maxTopics is invalid");

    // Each operation is serial. Waiting before every subsequent request also
    // prevents an isfavorite/PUT pair from becoming an unthrottled burst.
    function operation(signal) {
      let started = false;
      return async (path, method = "GET", json = true) => {
        checkAbort(signal);
        if (started) await delay(interval, signal);
        checkAbort(signal);
        started = true;
        const response = await request(path, { method, signal });
        if (!response || typeof response.ok !== "boolean") throw failure("收藏接口返回格式异常");
        if (!response.ok) {
          const status = Number(response.status) || 0;
          throw failure(`收藏请求失败（${status || "网络错误"}）`, {
            status,
            retryAfter: retryAfterSeconds(response.headers?.get?.("Retry-After"))
          });
        }
        // A completed successful write stays successful even if cancellation
        // arrives while its response is being delivered. Uncertain writes are
        // returned as pending and are checked with isfavorite before retrying.
        if (!json) return null;
        const payload = await response.json();
        checkAbort(signal);
        return payload;
      };
    }

    async function listGroups({ signal } = {}) {
      const call = operation(signal);
      const payload = await call("/me/favorite-topic-group");
      if (!payload || payload.errorCode !== 0 || !Array.isArray(payload.data)) {
        throw failure("无法读取收藏分组，请刷新后重试");
      }
      const ids = new Set();
      return payload.data.map((group) => {
        const id = groupNumber(group?.id);
        if (ids.has(id) || typeof group?.name !== "string" || !group.name.trim()) {
          throw failure("收藏分组数据异常");
        }
        ids.add(id);
        return {
          id,
          name: group.name,
          count: Number.isSafeInteger(group.count) && group.count >= 0 ? group.count : 0,
          createTime: typeof group.createTime === "string" ? group.createTime : ""
        };
      });
    }

    async function exportGroup(groupId, { signal, onProgress } = {}) {
      const group = groupNumber(groupId);
      const call = operation(signal);
      const topics = [];
      const ids = new Set();
      const pageSignatures = new Set();
      let page = 0;
      for (let from = 0; ; from += PAGE_STEP) {
        const payload = await call(`/topic/me/favorite?from=${from}&size=${PAGE_SIZE}&order=2&groupid=${group}`);
        if (!Array.isArray(payload) || payload.length > PAGE_SIZE) throw failure("收藏列表返回格式异常");
        const values = payload.map(topicValue);
        const signature = values.map((topic) => topic.id).join(",");
        if (values.length && pageSignatures.has(signature)) throw failure("收藏列表出现重复分页，已停止导出，请稍后重试");
        pageSignatures.add(signature);
        let added = 0;
        for (const topic of values.slice(0, PAGE_STEP)) {
          if (ids.has(topic.id)) continue;
          if (topics.length >= limit) throw failure(`收藏超过 ${limit} 条，请分组导出`, { code: "TOPIC_LIMIT" });
          ids.add(topic.id);
          topics.push(topic);
          added += 1;
        }
        // The eleventh item is a lookahead and must also count toward the
        // upper bound; do not silently return only the first 2000 favorites.
        if (topics.length === limit && values.some((topic) => !ids.has(topic.id))) {
          throw failure(`收藏超过 ${limit} 条，请分组导出`, { code: "TOPIC_LIMIT" });
        }
        page += 1;
        onProgress?.({ phase: "export", completed: topics.length, loaded: topics.length, total: null, added: 0, skipped: 0, failed: 0, current: null, page });
        if (values.length < PAGE_SIZE) return topics;
        if (!added) throw failure("收藏列表未继续前进，已停止导出，请稍后重试");
        // Bound malformed or continuously changing pagination even when some
        // pages contain previously seen records in a different order.
        if (page > limit) throw failure("收藏列表持续变化，请稍后重新导出");
      }
    }

    async function importTopics(input, groupId, { signal, onProgress } = {}) {
      const group = groupNumber(groupId);
      if (!Array.isArray(input)) throw failure("待导入的收藏格式无效");
      if (input.length > limit) throw failure(`每次最多导入 ${limit} 条收藏`, { code: "TOPIC_LIMIT" });
      const seen = new Set();
      const topics = input.map(topicValue).filter((topic) => {
        if (seen.has(topic.id)) return false;
        seen.add(topic.id);
        return true;
      });
      const call = operation(signal);
      const result = { added: [], skipped: [], failed: [], pending: [], stopped: false, reason: "" };
      const report = (current) => onProgress?.({
        phase: "import",
        completed: result.added.length + result.skipped.length + result.failed.length,
        total: topics.length,
        added: result.added.length,
        skipped: result.skipped.length,
        failed: result.failed.length,
        current,
        message: result.reason
      });
      for (let index = 0; index < topics.length; index += 1) {
        const topic = topics[index];
        try {
          checkAbort(signal);
          report(topic);
          const isFavorite = await call(`/topic/${topic.id}/isfavorite`);
          if (typeof isFavorite !== "boolean") throw failure("无法确认帖子是否已收藏，未进行写入");
          if (isFavorite) result.skipped.push(topic);
          else {
            checkAbort(signal);
            await call(`/me/favorite/${topic.id}?groupid=${group}`, "PUT", false);
            result.added.push(topic);
          }
        } catch (error) {
          const reason = signal?.aborted ? pauseReason(abortError()) : pauseReason(error);
          if (reason) {
            result.stopped = true;
            result.reason = reason;
            result.pending = topics.slice(index);
            if (error?.status) result.status = error.status;
            if (error?.retryAfter != null) result.retryAfter = error.retryAfter;
            report(topic);
            return result;
          }
          result.failed.push({ ...topic, reason: error?.message || "收藏失败，请重试" });
        }
        report(topic);
      }
      return result;
    }

    return { listGroups, exportGroup, importTopics };
  }

  return { MAX_TOPICS, create };
});
