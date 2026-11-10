(function () {
  "use strict";
  const PERIOD = 20000, LIMIT = 200;
  let state = null, timer = 0, resizeFrame = 0;
  const node = (tag, className, text) => {
    const el = document.createElement(tag); if (className) el.className = className;
    if (text !== undefined) el.textContent = text; return el;
  };
  const button = (text, action, className = "") => {
    const el = node("button", className, text); el.type = "button"; el.onclick = action; return el;
  };
  const scope = () => `${location.origin}:${getCc98AccountId(getStoredCc98UserInfo()) || "guest"}`;
  const available = () => /^beta\s/i.test(chrome.runtime.getManifest().version_name || "");
  function valid(s) {
    return state === s && available() && lastSettings?.enabled !== false && lastSettings?.rebuildUi !== false
      && scope() === s.scope && getRoutePageKey() === s.route && getTopicPageInfo()?.topicId === s.topicId;
  }
  const bottom = () => {
    const root = document.scrollingElement;
    return root && root.scrollHeight - root.clientHeight - root.scrollTop < 140;
  };
  const editing = () => document.activeElement?.matches("input, textarea, [contenteditable=true], iframe");
  function halt(s) {
    clearTimeout(timer); timer = 0; s.epoch++; s.reader?.dispose(); s.reader = null;
    s.running = false; s.resize?.disconnect(); s.resize = null;
    cancelAnimationFrame(resizeFrame); resizeFrame = 0;
  }
  function stop(discard = false) {
    if (!state) return;
    const s = state; halt(s); s.enabled = false;
    if (discard) { s.bar?.remove(); s.feed?.remove(); state = null; }
    else s.phase = "stopped";
    sync();
  }
  function sourceHref(s, floor) {
    return new URL(buildTopicPageHref(s.topicId, Math.ceil(floor / 10)), location.href).href + `#${floor}`;
  }
  function openSource(s, floor) {
    const href = sourceHref(s, floor);
    if (lastSettings?.openLinksInNewTab) { window.open(href, "_blank", "noopener"); return; }
    const samePage = stripUrlHash(href) === stripUrlHash(location.href);
    // A live card can already own this hash although its native actions are
    // not in the original document yet. Reload that page rather than looping
    // back to our own card through the same-topic floor-link interceptor.
    stop(true);
    if (samePage) { history.replaceState(history.state, "", href); location.reload(); }
    else location.assign(href);
  }
  function makeCard(s, record) {
    const source = record.contentType === 1 ? CC98RebornExtendedUbb.renderMarkdown(record.content)
      : buildNativeEditorUbbPreview(record.content);
    if (record.contentType === 1) markMarkdownPostContent(source);
    const content = sanitizePostContent(source);
    const signatureSource = node("div");
    if (record.signatureCode) {
      const signature = node("div", "signature"); signature.append(buildNativeEditorUbbPreview(record.signatureCode));
      signatureSource.append(signature);
    }
    const date = new Date(record.publishedAt);
    const publishedAt = Number.isFinite(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")} ${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}:${String(date.getSeconds()).padStart(2,"0")}` : "";
    const item = { type: "post", liveSnapshot: true, id: record.nativeId || `live-${s.topicId}-${record.floor}`,
      index: record.floor, user: record.anonymousCode ? "CC98 用户" : record.user,
      uid: record.anonymousCode ? "" : record.uid, anonymousCode: record.anonymousCode || "",
      userHref: record.userHref || (record.uid ? makeAbsoluteCc98Url(`/user/id/${record.uid}`) : ""),
      avatar: record.avatar ? makeAbsoluteCc98Url(record.avatar) : "", content, text: cleanupPostText(content?.textContent || ""),
      signature: record.signatureCode ? getPostSignatureContent(signatureSource) : null,
      voteContent: findPostVoteContentNode(source), lotteryContent: findPostLotteryContentNode(source),
      awards: record.awards, metrics: record.metrics, publishedAt, actions: [] };
    markOriginalPosterItems([item]);
    const card = renderPostCard(item); card.dataset.liveFloor = String(record.floor);
    if (!card.classList.contains("cc98-rebuild-blocked")) {
      const footer = card.querySelector(".cc98-rebuild-post-footer") || node("div", "cc98-rebuild-post-footer");
      if (!footer.isConnected && !card.contains(footer)) card.append(footer);
      const actions = footer.querySelector(".cc98-rebuild-post-actions") || node("div", "cc98-rebuild-post-actions");
      const original = button("", () => openSource(s, record.floor), "cc98-rebuild-mini-action cc98-topic-live-source");
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [key,value] of Object.entries({viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor","stroke-width":"1.8","stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"})) icon.setAttribute(key,value);
      const path = document.createElementNS(icon.namespaceURI,"path");
      path.setAttribute("d","M14 3h7v7M21 3 10 14M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6");
      icon.append(path); original.append(icon);
      original.title = "打开原楼：点赞、评分、引用等操作";
      original.setAttribute("aria-label", `打开第 ${record.floor} 楼原文及操作`);
      actions.append(original); if (!footer.contains(actions)) footer.append(actions);
    }
    return card;
  }
  function nativeFloors() {
    return new Set([...document.querySelectorAll(".reply")]
      .filter(post => !post.closest("#cc98-comfort-app") && !isHotPostNode(post) && hasPostContentContainer(post))
      .map((post, index) => getPostFloorNumber(post, index)));
  }
  function renderFeed(s) {
    const native = nativeFloors();
    const current = new Map([...s.feed.children].map(card => [Number(card.dataset.liveFloor), card]));
    for (const [floor, card] of current) if (native.has(floor) || !s.records.has(floor)) { card.remove(); current.delete(floor); }
    for (const [floor, record] of [...s.records].sort((a, b) => a[0] - b[0])) {
      if (!native.has(floor) && !current.has(floor)) s.feed.append(makeCard(s, record));
    }
    s.feed.hidden = !s.feed.children.length;
  }
  function watchSize(s) {
    if (s.resize || !s.enabled || document.hidden) return;
    s.resize = new ResizeObserver(() => {
      if (!s.following || editing() || !valid(s) || document.hidden || resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        if (s.following && s.enabled && valid(s) && !editing()) scrollTo({ top: document.scrollingElement.scrollHeight, behavior: "instant" });
      });
    });
    s.resize.observe(s.feed);
  }
  function mount(s) {
    const app = document.querySelector('#cc98-comfort-app');
    const host = app?.querySelector('.cc98-rebuild-post-feed[data-feed-kind="post"]');
    if (!host) return;
    if (!s.bar) {
      s.bar = node("div", "cc98-topic-live-bar");
      s.status = node("span", "cc98-topic-live-status"); s.status.setAttribute("role", "status");
      s.jump = button("", () => {
        const first = s.feed.querySelector(`[data-live-floor="${s.firstUnread}"]`) || s.feed.lastElementChild;
        if (first) {
          const inset = Number.parseFloat(s.bar.style.top) + s.bar.getBoundingClientRect().height + 8;
          scrollTo({top:Math.max(0,scrollY + first.getBoundingClientRect().top - inset),behavior:"auto"});
        }
        s.unread = 0; s.firstUnread = 0; sync();
      }, "cc98-topic-live-jump");
      s.latest = button("末页", () => openSource(s, (s.maxPage - 1) * 10 + 1), "cc98-topic-live-latest");
      s.control = button("停止", () => toggle(getTopicPageInfo()));
      s.bar.append(s.status, s.jump, s.latest, s.control);
      s.feed = node("section", "cc98-rebuild-feed cc98-rebuild-post-feed cc98-topic-live-posts"); s.feed.setAttribute("aria-label", "跟帖新回复");
    }
    if (s.host !== host) {
      s.host = host;
      // An ordinary theme/filter rebuild can replace the main app. Reapply
      // the existing filters to retained records in its new reading surface.
      s.feed.replaceChildren(); host.before(s.bar); host.after(s.feed); renderFeed(s);
    }
    const topbar = app.querySelector('.cc98-rebuild-topbar');
    const top = `${topbar && topbar.getClientRects().length ? topbar.getBoundingClientRect().height + 26 : 8}px`;
    if (s.bar.style.top !== top) s.bar.style.top = top;
    watchSize(s);
  }
  function sync() {
    const s = state;
    if (s && !valid(s)) { stop(true); return; }
    document.querySelectorAll('.cc98-topic-live-entry').forEach(entry => {
      const pressed = String(Boolean(s?.enabled && entry.dataset.topicId === s.topicId));
      if (entry.getAttribute("aria-pressed") !== pressed) entry.setAttribute("aria-pressed", pressed);
      const title = s?.enabled ? "停止跟帖（实验性）" : "跟帖（实验性）：每20～60秒检查新回复";
      if (entry.title !== title) entry.title = title;
    });
    if (!s) return;
    mount(s); if (!s.bar) return;
    const label = s.phase === "baseline" ? "连接中" : s.phase === "hidden" ? "跟帖已暂停"
      : s.phase === "limit" ? `已接收 ${LIMIT} 条，请打开末页继续` : s.phase === "error" ? s.enabled ? "连接中断，等待重试" : "连接已停止"
      : s.enabled ? "跟帖中" : "跟帖已停止";
    const text = label + (s.enabled && !["baseline", "hidden", "limit"].includes(s.phase) ? ` · ${Math.round(s.delay / 1000)}秒` : "");
    if (s.status.textContent !== text) s.status.textContent = text;
    const detail = s.error || "只追加开启后的新回复；原楼可进行点赞、评分与引用";
    if (s.status.title !== detail) s.status.title = detail;
    s.jump.hidden = !s.unread;
    const jumpText = `新增 ${s.unread} 条`; if (s.jump.textContent !== jumpText) s.jump.textContent = jumpText;
    s.control.hidden = s.phase === "limit";
    const controlText = s.enabled ? "停止" : "继续"; if (s.control.textContent !== controlText) s.control.textContent = controlText;
  }
  function append(s, records) {
    const additions = records.filter(record => record.floor > s.cursor && !s.records.has(record.floor));
    if (!additions.length) return 0;
    const ids = new Set([...s.records.values()].map(record => record.nativeId));
    for (const record of additions) {
      if (ids.has(record.nativeId)) throw new Error("跟帖接口返回了重复的楼层");
      ids.add(record.nativeId);
    }
    const following = bottom() && !editing();
    const anchor = editing() ? document.activeElement : null;
    const anchorTop = anchor?.getBoundingClientRect().top;
    const x = scrollX, y = scrollY;
    for (const record of additions) {
      if (s.records.size >= LIMIT) break;
      if (!Number.isSafeInteger(record.floor) || record.floor < 1 || String(record.topicId) !== s.topicId) throw new Error("楼层数据不匹配");
      s.records.set(record.floor, record); s.cursor = Math.max(s.cursor, record.floor);
      if (!following) { if (!s.unread) s.firstUnread = record.floor; s.unread++; }
    }
    s.following = following;
    mount(s); renderFeed(s); sync();
    setupRebuiltImagePlaceholders(s.feed);
    if (following) scrollTo({ top: document.scrollingElement.scrollHeight, behavior: "instant" });
    else if (anchor?.isConnected) scrollTo(x, y + anchor.getBoundingClientRect().top - anchorTop);
    else scrollTo(x, y);
    if (s.records.size >= LIMIT) { halt(s); s.enabled = false; s.phase = "limit"; sync(); }
    return additions.length;
  }
  function schedule(s) {
    clearTimeout(timer); timer = 0;
    if (!valid(s) || !s.enabled || document.hidden) return;
    timer = setTimeout(() => { timer = 0; poll(s); }, Math.max(s.delay, s.nextAt - Date.now()));
  }
  async function poll(s) {
    if (!valid(s) || !s.enabled || document.hidden || s.running) return;
    const epoch = ++s.epoch; s.running = true;
    let added = 0;
    try {
      s.reader = CC98RebornTopicLiveApi.create({topicId:s.topicId,profiles:s.profiles});
      if (!s.initialized) {
        s.phase = "baseline"; sync();
        const cursor = await s.reader.baseline();
        if (!valid(s) || epoch !== s.epoch) return;
        s.cursor = cursor; s.maxPage = Math.max(1, Math.ceil(cursor / 10));
        s.initialized = true;
      } else {
        while (s.enabled) {
          const records = await s.reader.read(s.cursor);
          if (!valid(s) || epoch !== s.epoch) return;
          s.maxPage = Math.max(s.maxPage, Math.ceil((records.at(-1)?.floor || s.cursor) / 10));
          added += append(s, records);
          if (!s.enabled) return;
          if (records.length < CC98RebornTopicLiveApi.size) break;
        }
      }
      if (!valid(s) || epoch !== s.epoch) return;
      s.idle = added ? 0 : s.idle + 1; s.errors = 0; s.error = ""; s.phase = "watching";
      s.delay = s.idle >= 6 ? 60000 : s.idle >= 3 ? 40000 : PERIOD;
    } catch (error) {
      if (!valid(s) || epoch !== s.epoch || error.name === "AbortError") return;
      s.error = error.message || "跟帖接口读取失败"; s.errors++; s.phase = "error";
      s.delay = Math.max(error.retryAfterMs || 0, Math.min(300000, PERIOD * 2 ** s.errors));
      if ([401,403,404].includes(error.status)) { halt(s); s.enabled=false; sync(); }
    } finally {
      if (state === s && epoch === s.epoch) {
        s.reader?.dispose(); s.reader=null; s.running=false;
        s.nextAt = Date.now() + s.delay; sync(); schedule(s);
      }
    }
  }
  function toggle(info) {
    if (!available() || !info || !globalThis.CC98RebornTopicLiveApi?.create) return;
    if (state && !valid(state)) stop(true);
    if (state?.enabled) { stop(); return; }
    if (!state) state = { topicId:String(info.topicId),route:getRoutePageKey(),scope:scope(), maxPage:info.maxKnown || 1,
      records:new Map(), profiles:new Map(), initialized:false, cursor:0, idle:0, errors:0, error:"", epoch:0, delay:PERIOD, nextAt:0, unread:0, firstUnread:0 };
    const s=state; s.enabled=true; s.phase=s.initialized?"watching":"baseline";
    s.following=bottom()&&!editing(); sync();
    if (document.hidden) { s.phase="hidden"; sync(); }
    else if (Date.now() < s.nextAt) schedule(s);
    else poll(s);
  }
  addEventListener("pagehide", () => stop(true));
  addEventListener("popstate", sync);
  addEventListener("storage", sync);
  addEventListener("resize", () => { if(state) sync(); });
  addEventListener("scroll", () => {
    if (!state?.enabled) return;
    state.following=bottom()&&!editing();
    if(state.following && state.unread) { state.unread=0; state.firstUnread=0; sync(); }
  }, {passive:true});
  document.addEventListener("visibilitychange", () => {
    const s=state; if(!s?.enabled) return;
    if (!valid(s)) { stop(true); return; }
    if(document.hidden) { halt(s); s.phase="hidden"; sync(); }
    else { s.phase=s.initialized?"watching":"baseline"; sync(); if(Date.now()>=s.nextAt) poll(s); else schedule(s); }
  });
  globalThis.CC98RebornTopicLive=Object.freeze({available,toggle,sync,stop});
})();
