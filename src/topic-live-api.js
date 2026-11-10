(function (root) {
  "use strict";
  const SIZE = 10, GAP = 1000, TIMEOUT = 12000;
  const fail = (message, status) => Object.assign(new Error(message), status ? { status } : {});
  const aborted = () => new DOMException("跟帖已停止", "AbortError");
  const identity = () => `${root.location.origin}:${root.getCc98AccountId(root.getStoredCc98UserInfo()) || "guest"}`;
  function base() {
    const { hostname, origin } = root.location;
    if (/^(?:127\.0\.0\.1|localhost)$/.test(hostname)) return origin;
    if (/(?:^|\.)webvpn\.zju\.edu\.cn$/.test(hostname)) {
      return "https://webvpn.zju.edu.cn/https/77726476706e69737468656265737421f1e748d22433310830079bab";
    }
    if (/^(?:www\.)?cc98\.org$/.test(hostname)) return "https://api.cc98.org";
    throw fail("请在 CC98 帖子中开启跟帖");
  }
  function create({ topicId, profiles = new Map() }) {
    topicId = String(topicId);
    if (!/^[1-9]\d*$/.test(topicId) || !Number.isSafeInteger(Number(topicId))) throw fail("无效的帖号");
    const api = base(), scope = identity(), route = root.getRoutePageKey();
    const token = root.localStorage.getItem("accessToken"), controller = new AbortController();
    let lastAt = -Infinity;
    function check() {
      if (controller.signal.aborted) throw aborted();
      if (scope !== identity() || route !== root.getRoutePageKey() || token !== root.localStorage.getItem("accessToken")) {
        throw fail("页面或登录账号已变化，请重新开启跟帖", 401);
      }
    }
    function authorization() {
      const value = String(token || "").replace(/^str-/, "");
      const expiration = Number(root.localStorage.getItem("accessToken_expirationTime") || 0);
      if (!/^Bearer\s+\S+$/i.test(value) || (expiration && expiration * 1000 <= Date.now())) {
        throw fail("登录已过期，请刷新 CC98 页面后重试", 401);
      }
      return value;
    }
    async function pause(ms) {
      if (ms <= 0) return;
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(aborted()); };
        const timer = setTimeout(() => { controller.signal.removeEventListener("abort", abort); resolve(); }, ms);
        controller.signal.addEventListener("abort", abort, { once: true });
      });
    }
    async function request(path) {
      check(); authorization();
      await pause(Math.max(0, GAP - (Date.now() - lastAt))); check();
      const current = new AbortController(); let timedOut = false;
      const cancel = () => current.abort();
      controller.signal.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(() => { timedOut = true; current.abort(); }, TIMEOUT);
      lastAt = Date.now();
      try {
        const response = await root.fetch(api + path, {
          method: "GET", headers: { Authorization: authorization(), Accept: "application/json" },
          credentials: /(?:^|\.)webvpn\.zju\.edu\.cn$/.test(root.location.hostname) ? "include" : "same-origin",
          redirect: "error", cache: "no-store", signal: current.signal
        });
        check();
        if (!response.ok) {
          const error = fail(`跟帖读取失败（${response.status}）`, response.status);
          if (response.status === 429) {
            const value = response.headers.get("Retry-After");
            const ms = value && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
            if (Number.isFinite(ms) && ms > 0) error.retryAfterMs = ms;
          }
          throw error;
        }
        const result = await response.json(); check(); return result;
      } catch (error) {
        if (controller.signal.aborted) throw aborted();
        if (timedOut) throw fail("跟帖读取超时，稍后重试");
        if (error instanceof SyntaxError) throw fail("跟帖接口返回的数据无法读取");
        throw error;
      } finally {
        clearTimeout(timer); controller.signal.removeEventListener("abort", cancel);
      }
    }
    const nonnegative = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
    function normalize(post, index, from) {
      const floor = from + index + 1;
      if (!post || !Number.isSafeInteger(post.id) || post.id < 1
        || (post.topicId !== undefined && String(post.topicId) !== topicId)
        || (post.floor !== undefined && post.floor !== floor)
        || (post.content !== null && post.content !== undefined && typeof post.content !== "string")
        || ![undefined, 0, 1].includes(post.contentType)) throw fail("跟帖楼层数据不匹配");
      const deleted = post.isDeleted === true, anonymous = !deleted && post.isAnonymous === true;
      const uid = !deleted && !anonymous && Number.isSafeInteger(post.userId) && post.userId > 0 ? String(post.userId) : "";
      const awards = deleted ? [] : Array.isArray(post.awards) ? post.awards.map(award => ({
        user: String(award?.operatorName || ""), operation: String(award?.content || ""), reason: String(award?.reason || "")
      })) : [];
      // An absent awards list is unknown, not a zero reputation score.
      let reputation = deleted || !Array.isArray(post.awards) ? null : 0;
      for (const award of awards) if (/风评值/.test(award.operation)) {
        const match = award.operation.match(/([+-]?\s*\d+(?:\.\d+)?)/);
        if (!match) { reputation = null; break; }
        reputation += Number(match[1].replace(/\s/g, ""));
      }
      return { topicId, floor, nativeId: String(post.id), uid,
        user: deleted ? "98Deleter" : String(post.userName || "CC98 用户"),
        anonymousCode: anonymous ? String(post.userName || "匿名").toUpperCase() : "",
        content: deleted ? "该贴已被my cc98, my home" : post.content || "", contentType: deleted ? 0 : post.contentType || 0,
        avatar: deleted ? "/static/images/deleter2.png" : anonymous ? "/static/images/心灵头像.gif" : "",
        signatureCode: "", awards, publishedAt: typeof post.time === "string" ? post.time : "",
        metrics: { likes: deleted ? null : nonnegative(post.likeCount), dislikes: deleted ? null : nonnegative(post.dislikeCount), reputation } };
    }
    return Object.freeze({
      async baseline() {
        const data = await request(`/topic/${topicId}`);
        if (!data || String(data.id) !== topicId || nonnegative(data.replyCount) === null || data.replyCount >= Number.MAX_SAFE_INTEGER) {
          throw fail("跟帖接口未返回有效的帖子信息");
        }
        return data.replyCount + 1;
      },
      async read(from) {
        if (!Number.isSafeInteger(from) || from < 0 || from > Number.MAX_SAFE_INTEGER - SIZE) throw fail("无效的跟帖位置");
        const data = await request(`/Topic/${topicId}/post?from=${from}&size=${SIZE}`);
        if (!Array.isArray(data) || data.length > SIZE) throw fail("跟帖接口未返回有效的楼层列表");
        const records = data.map((post, index) => normalize(post, index, from));
        if (new Set(records.map(record => record.nativeId)).size !== records.length) throw fail("跟帖接口返回了重复的楼层");
        const ids = [...new Set(records.map(record => record.uid).filter(uid => uid && !profiles.has(uid)))];
        if (ids.length) {
          const users = await request(`/user?${ids.map(id => `id=${id}`).join("&")}`);
          if (!Array.isArray(users)) throw fail("跟帖用户信息无法读取");
          const matched = new Map();
          for (const user of users) if (user && ids.includes(String(user.id))) matched.set(String(user.id), user);
          check();
          // Missing/deleted profiles remain a name-only fallback for this run.
          for (const id of ids) profiles.set(id, matched.get(id) || null);
        }
        for (const record of records) {
          const user = record.uid && profiles.get(record.uid);
          if (!user) continue;
          record.user = String(user.name || record.user);
          record.avatar = String(user.portraitUrl || ""); record.signatureCode = String(user.signatureCode || "");
        }
        check(); return records;
      },
      dispose() { controller.abort(); }
    });
  }
  root.CC98RebornTopicLiveApi = Object.freeze({ create, size: SIZE });
})(globalThis);
