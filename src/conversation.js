(function () {
  "use strict";

  const core = globalThis.CC98RebornConversationCore;
  const topicCache = new Map();
  const CACHE_TOPICS = 6;
  const CACHE_STORAGE_KEY = "cc98RebornConversationCache:v1";
  const CACHE_STORAGE_BYTES = 4 * 1024 * 1024;
  let cacheScope = "";
  let persistTimer = 0;
  let preferredTopic = "";
  const BATCH_PAGES = 30;
  let active = null;
  let readQueue = Promise.resolve();
  let lastReadAt = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function accountScope() {
    return `${location.origin}:${getCc98AccountId(getStoredCc98UserInfo()) || "guest"}`;
  }

  function persistCache() {
    clearTimeout(persistTimer);
    persistTimer = 0;
    if (!cacheScope) return;
    try {
      // The tab-local snapshot survives full-page pagination, without putting
      // post contents in permanent settings or sharing them across accounts.
      if (cacheScope !== accountScope()) {
        sessionStorage.removeItem(CACHE_STORAGE_KEY);
        return;
      }
      const snapshot = { version: 1, scope: cacheScope, topics: [...topicCache].map(([id, pages]) =>
        [id, [...pages].map(([page, result]) => [page, { ...result,
          foregroundRecords: [...(result.foregroundRecords || [])],
          foregroundEnhancements: [...(result.foregroundEnhancements || [])] }])]) };
      let json = JSON.stringify(snapshot);
      while (json.length * 2 > CACHE_STORAGE_BYTES && snapshot.topics.length > 1) {
        const index = snapshot.topics.findIndex(([id]) => id !== (active?.topicId || preferredTopic));
        snapshot.topics.splice(index < 0 ? 0 : index, 1);
        json = JSON.stringify(snapshot);
      }
      if (json.length * 2 > CACHE_STORAGE_BYTES) sessionStorage.removeItem(CACHE_STORAGE_KEY);
      else sessionStorage.setItem(CACHE_STORAGE_KEY, json);
    } catch {
      // A blocked or full session store must not break the in-memory cache.
      try { sessionStorage.removeItem(CACHE_STORAGE_KEY); } catch {}
    }
  }

  function schedulePersist() {
    if (!persistTimer) persistTimer = setTimeout(persistCache, 800);
  }

  function restoreCache(scope) {
    clearTimeout(persistTimer);
    persistTimer = 0;
    topicCache.clear();
    cacheScope = scope;
    try {
      const raw = sessionStorage.getItem(CACHE_STORAGE_KEY);
      if (!raw) return;
      if (raw.length * 2 > CACHE_STORAGE_BYTES) throw new Error("Oversized cache");
      const snapshot = JSON.parse(raw);
      if (snapshot.version !== 1 || snapshot.scope !== scope || !Array.isArray(snapshot.topics)) throw new Error("Invalid cache scope");
      for (const entry of snapshot.topics.slice(-CACHE_TOPICS)) {
        if (!Array.isArray(entry) || !/^\d+$/.test(entry[0]) || !Array.isArray(entry[1])) continue;
        const [id, savedPages] = entry;
        const pages = new Map();
        for (const savedPage of savedPages) {
          if (!Array.isArray(savedPage)) continue;
          const [page, result] = savedPage;
          if (!Number.isSafeInteger(page) || page < 1 || !Array.isArray(result?.records)
            || !Number.isSafeInteger(result.maxPage) || result.maxPage < page || result.maxPage > 100000) continue;
          if (!result.records.every(record => record?.topicId === id && core.keyOf(id, record.floor)
            && typeof record.contentHtml === "string" && Array.isArray(record.references)
            && record.references.every(ref => ref && core.keyOf(ref.topicId, ref.floor)))) continue;
          const signatures = entries => new Map((Array.isArray(entries) ? entries : []).filter(pair =>
            Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string"));
          pages.set(page, { ...result, foregroundRecords: signatures(result.foregroundRecords),
            foregroundEnhancements: signatures(result.foregroundEnhancements) });
        }
        if (pages.size) topicCache.set(id, pages);
      }
    } catch {
      try { sessionStorage.removeItem(CACHE_STORAGE_KEY); } catch {}
    }
  }

  addEventListener("pagehide", persistCache);
  addEventListener("pageshow", event => {
    if (!event.persisted) return;
    // Browser Back may revive an old document from BFCache. Hydrate first,
    // so closing its stale dialog cannot overwrite a newer page's snapshot.
    restoreCache(accountScope());
    close();
  });

  function cachedTopic(topicId, scope, create = false) {
    if (cacheScope !== scope) {
      restoreCache(scope);
    }
    const key = String(topicId);
    let cached = topicCache.get(key);
    if (!cached && create) cached = new Map();
    if (cached) {
      // Evict whole inactive topics, never individual pages of the open topic.
      topicCache.delete(key);
      topicCache.set(key, cached);
      while (topicCache.size > CACHE_TOPICS) {
        const oldest = [...topicCache.keys()].find((id) => id !== active?.topicId && id !== key);
        topicCache.delete(oldest);
      }
    }
    return cached;
  }

  function restoreTopic(session, topicId) {
    const cached = cachedTopic(topicId, session.scope);
    if (!cached) return;
    for (const [page, result] of cached) {
      const key = `${topicId}:${page}`;
      if (session.loaded.has(key)) continue;
      integrate(session, topicId, page, result, false);
      session.reusedPages.add(key);
    }
  }

  function restoreAvailablePages(session) {
    restoreTopic(session, session.topicId);
    // Resolve cached cross-topic ancestors synchronously too. Cache hits must
    // not consume the network batch limit or incur the scan's request delay.
    let target;
    while ((target = nextPage(session))) {
      if (!cachedTopic(target.topicId, session.scope)?.has(target.page)) break;
      restoreTopic(session, target.topicId);
    }
  }

  function captureForeground(session, page, result, enhanced) {
    const cached = cachedTopic(session.topicId, session.scope)?.get(page);
    const records = new Map((cached?.records || []).map((record) => [core.keyOf(record.topicId, record.floor), record]));
    const foregroundRecords = new Map(cached?.foregroundRecords);
    const foregroundEnhancements = new Map(cached?.foregroundEnhancements);
    const changed = new Set();
    for (const record of result.records) {
      const key = core.keyOf(record.topicId, record.floor);
      const signature = JSON.stringify(record);
      // Keep a newer background refresh when the foreground still displays
      // the same old snapshot; changed visible floors remain authoritative.
      if (!records.has(key) || foregroundRecords.get(key) !== signature) {
        records.set(key, record);
        changed.add(key);
      }
      foregroundRecords.set(key, signature);
    }
    if (enhanced) {
      const key = core.keyOf(enhanced.topicId, enhanced.floor);
      const signature = JSON.stringify(enhanced);
      const previous = foregroundEnhancements.get(key);
      if (changed.has(key) || !records.has(key) || (previous && previous !== signature)
        || JSON.stringify(records.get(key)) === foregroundRecords.get(key)) records.set(key, enhanced);
      foregroundEnhancements.set(key, signature);
    }
    session.foregroundSnapshot = { page, records: foregroundRecords, enhancements: foregroundEnhancements };
    integrate(session, session.topicId, page, { records: [...records.values()],
      maxPage: Math.max(result.maxPage, cached?.maxPage || 1), foregroundRecords, foregroundEnhancements });
  }

  function pageHref(topicId, page) {
    return new URL(buildTopicPageHref(topicId, page), location.href).href;
  }

  function floorHref(topicId, floor) {
    return `${pageHref(topicId, Math.floor((floor - 1) / 10) + 1)}#${floor}`;
  }

  function abortError() {
    return new DOMException("查找已停止", "AbortError");
  }

  function check(session) {
    if (session.controller.signal.aborted || (!session.background && active !== session)) throw abortError();
    if (accountScope() !== session.scope || (!session.background && location.pathname !== session.pathname)) {
      if (session.background) session.controller.abort(); else close();
      throw abortError();
    }
  }

  function pause(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(abortError());
      const finish = () => { signal.removeEventListener("abort", cancel); resolve(); };
      const timer = setTimeout(finish, ms);
      const cancel = () => { clearTimeout(timer); reject(abortError()); };
      signal.addEventListener("abort", cancel, { once: true });
    });
  }

  function quoteGroups(root) {
    const candidates = [...root.querySelectorAll("blockquote, .cc98-rebuild-quote-box, .cc98-rebuild-legacy-quote, div[style]")]
      .filter((node) => node.matches("blockquote, .cc98-rebuild-quote-box, .cc98-rebuild-legacy-quote")
        || isLegacyQuoteStyle(node.getAttribute("style"), ""));
    return candidates.filter((node) => !candidates.some((other) => other !== node && other.contains(node)));
  }

  function quoteHeaders(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const headers = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest("pre, code, script, style")) continue;
      const match = node.textContent.match(/^\s*以下是引用\s*(\d+)\s*楼[：:]/);
      if (match) headers.push({ node, floor: Number(match[1]) });
    }
    return headers;
  }

  function targetForHeader(header, group, topicId, href) {
    let container = header.node.parentElement;
    let link = null;
    while (container && group.contains(container)) {
      // Only associate a link from this header, not one in another quote.
      if (quoteHeaders(container).length > 1) break;
      link = [...container.querySelectorAll("a[href]")].find((anchor) => /查看原帖/.test(anchor.textContent));
      if (link || container === group) break;
      container = container.parentElement;
    }
    let targetTopic = String(topicId);
    if (link) {
      try {
        const url = new URL(link.getAttribute("href"), href);
        if (url.origin !== location.origin && !/(^|\.)cc98\.org$|\.webvpn\.zju\.edu\.cn$/i.test(url.hostname)) return null;
        const route = getCc98RoutePathFromHref(url.href) || url.pathname;
        const target = route.match(/\/topic\/(\d+)(?:\/\d+)?\/?$/i);
        if (target) targetTopic = target[1];
        else if (!url.hash) return null;
        link.dataset.cc98ConversationTopic = targetTopic;
        link.dataset.cc98ConversationFloor = String(header.floor);
        link.href = floorHref(targetTopic, header.floor);
      } catch { return null; }
    }
    return core.keyOf(targetTopic, header.floor) ? { topicId: targetTopic, floor: header.floor } : null;
  }

  function readReferences(root, topicId, href) {
    const references = new Map();
    for (const group of quoteGroups(root)) {
      const headers = quoteHeaders(group);
      // CC98 flattens nested UBB quotes from oldest to newest. The final
      // header is the direct parent; Markdown retains the outermost header.
      const header = group.matches("blockquote")
        ? headers.find((item) => item.node.parentElement.closest("blockquote") === group)
        : headers[headers.length - 1];
      if (!header) continue;
      const target = targetForHeader(header, group, topicId, href);
      if (target) references.set(core.keyOf(target.topicId, target.floor), target);
      // Retain accurate link targets for older quoted ancestors, too.
      headers.forEach((item) => targetForHeader(item, group, topicId, href));
    }
    return [...references.values()];
  }

  function cleanContent(root, href) {
    const localImages = globalThis.chrome?.runtime?.getURL?.("images/") || "";
    root.querySelectorAll("script, style, object, embed, form, input, textarea, select, base, link, meta").forEach((node) => node.remove());
    for (const node of [root, ...root.querySelectorAll("*")]) {
      node.removeAttribute("id");
      node.removeAttribute("autoplay");
      node.removeAttribute("srcdoc");
      for (const attr of [...node.attributes]) {
        if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      }
      for (const attr of ["href", "src", "poster", "data-src", "data-original"]) {
        const value = node.getAttribute(attr);
        if (!value) continue;
        try {
          const url = new URL(attr === "href" ? value : upgradeCc98AssetUrl(value), href);
          const imageData = attr !== "href" && /^data:image\/(?:png|gif|jpeg|webp);/i.test(value);
          const extensionImage = node.matches("img") && attr !== "href" && localImages
            && /^(?:chrome|moz|edge)-extension:$/.test(url.protocol) && url.href.startsWith(localImages);
          if (/^https?:$/.test(url.protocol) || imageData || extensionImage || (attr !== "href" && url.protocol === "blob:")) node.setAttribute(attr, url.href);
          else node.removeAttribute(attr);
        } catch { node.removeAttribute(attr); }
      }
      if (node.matches("iframe")) {
        node.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
        node.setAttribute("allow", "autoplay 'none'");
      }
    }
    return root;
  }

  function extractPage(doc, topicId, page, href) {
    const records = [];
    const seen = new Set();
    const replies = [...doc.querySelectorAll(".reply")].filter((node) => !node.closest("#cc98-comfort-app, .cc98-rebuild-conversation-layer"));
    for (const [index, source] of replies.entries()) {
      const post = document.importNode(source, true);
      if (isHotPostNode(post)) continue;
      const explicit = post.querySelector(".reply-floor")?.textContent?.trim().match(/^#?\s*(\d+)$/);
      const floor = Number(explicit?.[1] || post.getAttribute("data-floor") || ((page - 1) * 10 + index + 1));
      const key = core.keyOf(topicId, floor);
      if (!key || seen.has(key)) continue;
      const body = findPostContentNode(post);
      if (!body) continue;
      seen.add(key);
      const content = body.cloneNode(true);
      const references = readReferences(content, topicId, href);
      cleanContent(content, href);
      const author = post.querySelector('a[href*="/user/id/"], a[href*="/user/name/"]');
      const anonymousCode = getAnonymousPostCode(post);
      const user = anonymousCode ? `匿名 ${anonymousCode}` : (author?.textContent.trim() || "CC98 用户");
      const uid = author?.getAttribute("href")?.match(/\/user\/id\/(\d+)/)?.[1] || "";
      const avatar = getPostAvatar(post, author?.getAttribute("href") || "");
      records.push({ topicId: String(topicId), floor, references, user, uid, avatar,
        metrics: globalThis.CC98RebornContentFilter?.metrics(post),
        contentHtml: content.outerHTML,
        publishedAt: post.textContent.match(/发表于\s+([0-9:-]+\s+[0-9:]+)/)?.[1] || "" });
    }
    let maxPage = page;
    doc.querySelectorAll(".pagination .page-nav a[href], .cc98-rebuild-pager a[href], .ant-pagination a[href]").forEach((link) => {
      const number = getTopicPageNumberFromHref(link.getAttribute("href"), topicId);
      if (number) maxPage = Math.max(maxPage, number);
    });
    return { records, maxPage };
  }

  async function hydrateFrameMedia(frame, session) {
    const doc = frame.contentDocument;
    const viewport = Math.max(400, frame.contentWindow.innerHeight);
    const root = doc.querySelector("#root");
    const targets = [...new Set([doc.scrollingElement, root].filter(Boolean))];
    const saved = targets.map((target) => target.scrollTop);
    try {
      // react-lazyload creates the actual img nodes only after scrolling.
      // Scroll the separate document; never scroll the foreground window.
      for (let index = 0; index < 40; index += 1) {
        check(session);
        const top = index * viewport * 0.7;
        const max = Math.max(...targets.map((target) => target.scrollHeight - target.clientHeight));
        for (const target of targets) target.scrollTop = top;
        frame.contentWindow.dispatchEvent(new Event("scroll"));
        root?.dispatchEvent(new Event("scroll", { bubbles: true }));
        await pause(100, session.controller.signal);
        if (top >= max) break;
      }
      // The native button reveals already-loaded rows without another request.
      doc.querySelectorAll('.awardInfo button').forEach(button => {
        if (button.textContent.trim() === '显示全部') button.click();
      });
    } finally {
      targets.forEach((target, index) => { target.scrollTop = saved[index]; });
    }
  }

  function loadRenderedPage(topicId, page, session) {
    return new Promise((resolve, reject) => {
      check(session);
      const frame = element("iframe", "cc98-rebuild-conversation-probe");
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.title = "读取对话楼层";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
      frame.setAttribute("allow", "autoplay 'none'; camera 'none'; microphone 'none'");
      const href = pageHref(topicId, page);
      let signature = "";
      let stable = 0;
      let done = false;
      let hydrating = false;
      const signal = session.controller.signal;
      const finish = (result, error) => {
        if (done) return;
        done = true;
        clearInterval(poll);
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
        frame.remove();
        if (error) reject(error); else resolve(result);
      };
      const cancel = () => finish(null, abortError());
      const poll = setInterval(() => {
        try {
          check(session);
          const doc = frame.contentDocument;
          if (!doc || doc.readyState === "loading" || hydrating) return;
          const route = getCc98RoutePathFromHref(doc.URL) || new URL(doc.URL).pathname;
          const target = getTopicPathTarget(route);
          if (!target || target.topicId !== String(topicId) || target.page !== page) return;
          doc.querySelectorAll("audio, video").forEach((media) => media.pause());
          const replies = [...doc.querySelectorAll(".reply .substance, .reply .mde-preview-content")];
          const next = replies.map((node) => `${node.textContent.length}:${node.querySelectorAll("img, video, iframe").length}`).join("|");
          if (!next) return;
          stable = signature === next ? stable + 1 : 0;
          signature = next;
          if (stable < 2) return;
          hydrating = true;
          hydrateFrameMedia(frame, session).then(() => {
            check(session);
            const result = extractPage(doc, topicId, page, href);
            if (result.records.length) finish(result);
            else hydrating = false;
          }).catch((error) => finish(null, error));
        } catch (error) { finish(null, error); }
      }, 200);
      const timeout = setTimeout(() => finish(null, new Error("页面未能加载，可能已删除、无权限或连接超时")), 15000);
      signal.addEventListener("abort", cancel, { once: true });
      frame.src = href;
      session.layer.append(frame);
    });
  }

  async function loadPage(topicId, page, session) {
    check(session);
    const href = pageHref(topicId, page);
    let result;
    const timeoutController = new AbortController();
    const cancel = () => timeoutController.abort();
    const signal = session.controller.signal;
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 12000);
    try {
      const response = await fetch(href, { credentials: "include", cache: "no-store", signal: timeoutController.signal });
      if (!response.ok) {
        const error = new Error(`页面请求失败（${response.status}）`);
        error.status = response.status;
        throw error;
      }
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      result = extractPage(doc, topicId, page, href);
    } catch (error) {
      check(session);
      if (error.name !== "AbortError") throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    }
    check(session);
    if (!result?.records.length) result = await loadRenderedPage(topicId, page, session);
    check(session);
    return result;
  }

  function integrate(session, topicId, page, result, remember = true) {
    if (remember) {
      const cached = cachedTopic(topicId, session.scope, true);
      const foreground = String(topicId) === session.topicId && page === session.foregroundSnapshot?.page
        ? session.foregroundSnapshot : undefined;
      cached.set(page, { ...result,
        foregroundRecords: result.foregroundRecords || cached.get(page)?.foregroundRecords || foreground?.records,
        foregroundEnhancements: result.foregroundEnhancements || cached.get(page)?.foregroundEnhancements || foreground?.enhancements });
      schedulePersist();
    }
    result.records.forEach((record) => session.records.set(core.keyOf(record.topicId, record.floor), record));
    session.loaded.add(`${topicId}:${page}`);
    if (String(topicId) === session.topicId) session.maxPage = Math.max(session.maxPage, result.maxPage);
  }

  function readSharedPage(topicId, page, session) {
    const task = readQueue.catch(() => {}).then(async () => {
      check(session);
      // Recheck after entering the queue: another reader may have finished
      // this page while we waited. Only one uncached page is read at a time.
      const cached = cachedTopic(topicId, session.scope)?.get(page);
      if (cached) return cached;
      const wait = Math.max(0, 1000 - (Date.now() - lastReadAt));
      if (wait) await pause(wait, session.controller.signal);
      check(session);
      lastReadAt = Date.now();
      const result = await loadPage(topicId, page, session);
      check(session);
      integrate(session, topicId, page, result);
      return result;
    });
    readQueue = task.catch(() => {});
    return task;
  }

  // Shared with the full-topic search. A reader owns cancellation and its
  // hidden probe independently of either dialog; cache and queue are shared.
  function createReader(info, options = {}) {
    const layer = element("div", "cc98-topic-search-worker");
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    const session = { background: true, layer, topicId: String(info.topicId), scope: accountScope(),
      controller: new AbortController(), records: new Map(), loaded: new Set(), maxPage: info.maxKnown || 1 };
    preferredTopic = session.topicId;
    cachedTopic(session.topicId, session.scope, true);
    if (options.refresh) {
      topicCache.delete(session.topicId);
      persistCache();
    }
    const current = getTopicPageInfo();
    if (current?.topicId === session.topicId) {
      const result = extractPage(document, session.topicId, current.current, location.href);
      const minimum = (current.current - 1) * 10 + 1;
      if (result.records.length && result.records.every(record => record.floor >= minimum && record.floor < minimum + 10)) {
        if (!options.refresh && options.capture !== false) captureForeground(session, current.current, result);
        else session.foregroundSnapshot = { page: current.current,
          records: new Map(result.records.map(record => [core.keyOf(record.topicId, record.floor), JSON.stringify(record)])),
          enhancements: new Map() };
      }
    }
    return Object.freeze({
      scope: session.scope,
      cachedPages() { check(session); return new Map(cachedTopic(session.topicId, session.scope)); },
      read(page) { return readSharedPage(session.topicId, page, session); },
      dispose() { session.controller.abort(); layer.remove(); persistCache(); }
    });
  }

  function nextPage(session) {
    const graph = graphForSession(session);
    const missing = core.selectConversation(graph, session.seed).filter((entry) => !entry.record);
    for (const entry of missing) {
      const [topicId, floor] = entry.key.split(":");
      const page = Math.floor((Number(floor) - 1) / 10) + 1;
      const key = `${topicId}:${page}`;
      if (!session.loaded.has(key) && !session.failed.has(key)) return { topicId, page };
    }
    for (let page = 1; page <= session.maxPage; page += 1) {
      const key = `${session.topicId}:${page}`;
      if (!session.loaded.has(key) && !session.failed.has(key)) return { topicId: session.topicId, page };
    }
    return null;
  }

  function graphForSession(session) {
    const graph = core.buildGraph(session.records.values());
    // Loading a cross-topic ancestor also exposes other floors on that page;
    // incidental cross-topic replies are outside the downstream scan's scope.
    for (const [key, children] of graph.children) {
      graph.children.set(key, new Set([...children].filter((child) => child.startsWith(`${session.topicId}:`))));
    }
    return graph;
  }

  function referenceLabel(key, session) {
    const [topicId, floor] = key.split(":");
    return topicId === session.topicId ? `#${floor}` : `帖 ${topicId} · #${floor}`;
  }

  function focusRecord(session, key) {
    const card = [...session.feed.querySelectorAll(".cc98-rebuild-conversation-post")].find((node) => node.dataset.conversationKey === key);
    if (card) {
      const viewport = session.scroll.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      if (rect.top < viewport.top || rect.bottom > viewport.bottom) {
        session.scroll.scrollTo({ top: Math.max(0, session.scroll.scrollTop + rect.top - viewport.top - 12), behavior: "smooth" });
      }
      card.classList.add("is-anchor-target");
      setTimeout(() => card.classList.remove("is-anchor-target"), 1000);
    }
  }

  function renderRecord(entry, graph, session) {
    const card = element("article", "cc98-rebuild-card cc98-rebuild-conversation-post");
    card.dataset.conversationKey = entry.key;
    card.dataset.relation = entry.relation;
    const header = element("header", "cc98-rebuild-conversation-post-header");
    const author = element("div", "cc98-rebuild-conversation-author");
    if (entry.record?.avatar) {
      const avatar = element("img");
      avatar.alt = "";
      avatar.loading = "lazy";
      avatar.src = makeWebVpnCc98ResourceUrl(entry.record.avatar);
      author.append(avatar);
    }
    author.append(element("strong", "", `${referenceLabel(entry.key, session)} · ${entry.record?.user || "未能读取"}`));
    const badge = element("span", "cc98-rebuild-conversation-relation", entry.relation === "seed"
      ? "当前楼层" : `${entry.relation === "upstream" ? "上游" : "下游"} · 第 ${entry.level} 级`);
    header.append(author, badge);
    card.append(header);
    const links = element("div", "cc98-rebuild-conversation-links");
    for (const parent of graph.parents.get(entry.key) || []) {
      const button = element("button", "cc98-rebuild-conversation-link", `引用 ${referenceLabel(parent, session)}`);
      button.type = "button";
      button.addEventListener("click", () => {
        session.direction = "all";
        render(session);
        focusRecord(session, parent);
      });
      links.append(button);
    }
    if (links.children.length) card.append(links);
    if (entry.record) {
      const record = entry.record;
      const reason = shouldBlockRebuiltItem({ type: "post", uid: record.uid, user: record.user }) || globalThis.CC98RebornContentFilter?.reason(record, true) || globalThis.CC98RebornSemanticFilter?.reason(record, true) || "";
      if (reason && !session.revealed.has(entry.key)) {
        const reveal = element("button", "cc98-rebuild-conversation-link", `${reason} · 显示此楼`);
        reveal.type = "button";
        reveal.addEventListener("click", () => { session.revealed.add(entry.key); render(session); });
        card.append(reveal);
      } else {
        const source = element("div");
        source.innerHTML = record.contentHtml;
        const body = element("div", "cc98-rebuild-post-body cc98-rebuild-conversation-body");
        const content = sanitizePostContent(source);
        if (content) body.append(cleanContent(content, floorHref(record.topicId, record.floor)));
        else body.textContent = source.textContent;
        filterBlacklistedQuotes(body, [...session.records.values()]);
        stabilizeEmojiRendering(body);
        for (const group of quoteGroups(body)) {
          const details = element("details", "cc98-rebuild-conversation-quote");
          details.append(element("summary", "", "引用原文"));
          group.replaceWith(details);
          details.append(group);
        }
        card.append(body);
      }
      const footer = element("footer", "cc98-rebuild-conversation-post-footer");
      if (record.publishedAt) footer.append(element("span", "", record.publishedAt));
      if (entry.relation !== "seed") {
        const recenter = element("button", "cc98-rebuild-conversation-link", "以此楼为中心");
        recenter.type = "button";
        recenter.addEventListener("click", () => {
          session.seed = entry.key;
          session.direction = "all";
          render(session);
          session.panel.querySelector(".cc98-rebuild-conversation-close").focus({ preventScroll: true });
          focusRecord(session, session.seed);
          if (!session.running) scan(session);
        });
        footer.append(recenter);
      }
      const original = element("a", "cc98-rebuild-conversation-link", "前往楼层 ↗");
      original.href = floorHref(record.topicId, record.floor);
      original.target = "_blank";
      original.rel = "noopener noreferrer";
      footer.append(original);
      card.append(footer);
    } else {
      card.append(element("p", "cc98-rebuild-muted", session.running ? "正在查找原楼层…" : "原楼层未能读取，可能已删除、无权限或位于未完成的页面。"));
    }
    return card;
  }

  function render(session) {
    if (active !== session) return;
    const graph = graphForSession(session);
    const entries = core.selectConversation(graph, session.seed, session.direction);
    const viewport = session.scroll.getBoundingClientRect();
    const anchor = [...session.feed.querySelectorAll(".cc98-rebuild-conversation-post")].find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    const anchorTop = anchor?.getBoundingClientRect().top;
    session.title.textContent = `查看对话 · ${referenceLabel(session.seed, session)}`;
    session.tabs.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.direction === session.direction)));
    // Keep existing cards/media and the reader's position while pages arrive.
    const previous = new Map([...session.feed.querySelectorAll(".cc98-rebuild-conversation-post")].map((node) => [node.dataset.conversationKey, node]));
    const cards = new Map();
    for (const entry of entries) {
      const contentRule = entry.record ? globalThis.CC98RebornContentFilter?.reason(entry.record, true) || globalThis.CC98RebornSemanticFilter?.reason(entry.record, true) || "" : "";
      const token = JSON.stringify([entry.record, entry.relation, entry.level, [...graph.parents.get(entry.key) || []], session.revealed.has(entry.key), entry.record ? null : session.running, contentRule]);
      let card = previous.get(entry.key);
      if (!card || card.__conversationToken !== token) {
        const next = renderRecord(entry, graph, session);
        next.__conversationToken = token;
        card = next;
      }
      cards.set(entry.key, card);
    }
    const fragment = document.createDocumentFragment();
    function appendBranch(branch, parent) {
      const wrapper = element("section", "cc98-rebuild-conversation-branch");
      wrapper.dataset.branchKey = branch.key;
      wrapper.dataset.depth = String(branch.depth);
      if (branch.parentKey) wrapper.dataset.parentKey = branch.parentKey;
      if (branch.alias) {
        const shortcut = element("button", "cc98-rebuild-conversation-shared cc98-rebuild-conversation-link", `${referenceLabel(branch.key, session)} · 同一回复，点击定位`);
        shortcut.type = "button";
        shortcut.addEventListener("click", () => focusRecord(session, branch.key));
        wrapper.append(shortcut);
      } else {
        wrapper.append(cards.get(branch.key));
        if (branch.children.length) {
          const children = element("div", "cc98-rebuild-conversation-children");
          branch.children.forEach((child) => appendBranch(child, children));
          wrapper.append(children);
        }
      }
      parent.append(wrapper);
    }
    core.buildConversationTree(graph, entries).forEach((branch) => appendBranch(branch, fragment));
    session.feed.replaceChildren(fragment);
    const nextAnchor = anchor && [...session.feed.querySelectorAll(".cc98-rebuild-conversation-post")].find((node) => node.dataset.conversationKey === anchor.dataset.conversationKey);
    if (nextAnchor) session.scroll.scrollTop += nextAnchor.getBoundingClientRect().top - anchorTop;
    const read = [...session.loaded].filter((key) => key.startsWith(`${session.topicId}:`)).length;
    const missing = core.selectConversation(graph, session.seed).filter((entry) => !entry.record).length;
    const remaining = Boolean(nextPage(session));
    const complete = !remaining && !session.failed.size && !missing;
    session.status.textContent = `${session.running ? "查找中" : complete ? "查找完成" : remaining && !session.failed.size ? "已暂停，可继续查找" : "查找未完成"} · 本帖 ${read}/${session.maxPage} 页 · ${entries.filter((entry) => entry.record).length} 个楼层${session.reusedPages.size ? ` · 复用缓存 ${session.reusedPages.size} 页` : ""}${session.failed.size ? ` · ${session.failed.size} 页读取失败` : ""}${missing ? ` · ${missing} 个原楼层未读取` : ""}`;
    session.scanButton.textContent = session.running ? "停止查找" : session.failed.size ? "重试未读取页" : remaining ? "继续查找" : "刷新对话";
    session.errors.replaceChildren();
    if (session.failed.size) {
      const details = element("details");
      details.append(element("summary", "", "查看未读取的页面"));
      for (const [key, message] of session.failed) details.append(element("p", "", `帖 ${key.split(":")[0]} · 第 ${key.split(":")[1]} 页：${message}`));
      session.errors.append(details);
    }
    session.empty.hidden = entries.some((entry) => entry.relation !== "seed");
    session.empty.textContent = complete ? "未发现与此楼直接或间接相连的引用回复。" : "暂未找到其他对话楼层，后续页面仍可能包含相关回复。";
  }

  async function scan(session) {
    if (session.running || active !== session) return;
    restoreAvailablePages(session);
    if (!nextPage(session)) { render(session); return; }
    session.controller = new AbortController();
    session.running = true;
    render(session);
    try {
      for (let count = 0; count < BATCH_PAGES; count += 1) {
        check(session);
        const target = nextPage(session);
        if (!target) break;
        try {
          const result = await readSharedPage(target.topicId, target.page, session);
          integrate(session, target.topicId, target.page, result, false);
        } catch (error) {
          if (error.name === "AbortError") throw error;
          session.failed.set(`${target.topicId}:${target.page}`, error.message || "读取失败");
        }
        restoreAvailablePages(session);
        render(session);
        if (nextPage(session)) await pause(350, session.controller.signal);
      }
    } catch (error) {
      if (error.name !== "AbortError") session.failed.set(`${session.topicId}:未知`, error.message);
    } finally {
      session.running = false;
      render(session);
    }
  }

  function close() {
    const session = active;
    if (!session) return;
    active = null;
    session.controller.abort();
    clearInterval(session.guard);
    document.removeEventListener("keydown", session.onKeydown, true);
    session.layer.remove();
    session.trigger?.focus({ preventScroll: true });
    persistCache();
  }

  function open(item, trigger) {
    const info = getTopicPageInfo();
    const seed = info && core.keyOf(info.topicId, item.index);
    if (!seed) return;
    close();
    const layer = element("div", "cc98-rebuild-conversation-layer");
    const panel = element("section", "cc98-rebuild-conversation-dialog");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "cc98-conversation-title");
    const title = element("h2");
    title.id = "cc98-conversation-title";
    const header = element("header", "cc98-rebuild-conversation-header");
    const closeButton = element("button", "cc98-rebuild-conversation-close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "关闭对话");
    closeButton.addEventListener("click", close);
    header.append(title, closeButton);
    const tabs = element("nav", "cc98-rebuild-conversation-tabs");
    tabs.setAttribute("aria-label", "对话方向");
    const status = element("p", "cc98-rebuild-conversation-status");
    status.setAttribute("role", "status");
    const scanButton = element("button", "cc98-rebuild-conversation-scan");
    scanButton.type = "button";
    const toolbar = element("div", "cc98-rebuild-conversation-toolbar");
    toolbar.append(tabs, scanButton);
    const scroll = element("div", "cc98-rebuild-conversation-scroll");
    const errors = element("div", "cc98-rebuild-conversation-errors");
    const feed = element("div", "cc98-rebuild-conversation-feed");
    const empty = element("p", "cc98-rebuild-conversation-empty");
    scroll.append(errors, feed, empty);
    panel.append(header, element("p", "cc98-rebuild-conversation-scope", "追溯引用的上游原楼层，并查找本帖中的下游回复。跨帖引用可追溯上游；下游仅检索本帖。"), toolbar, status, scroll);
    layer.append(panel);
    const session = { layer, panel, title, tabs, status, scanButton, errors, feed, empty, scroll, trigger,
      seed, topicId: info.topicId, maxPage: info.maxKnown, direction: "all", records: new Map(),
      loaded: new Set(), failed: new Map(), revealed: new Set(), reusedPages: new Set(), running: false,
      scope: accountScope(), pathname: location.pathname, controller: new AbortController() };
    active = session;
    preferredTopic = String(info.topicId);
    const result = extractPage(document, info.topicId, info.current, location.href);
    // The selected rebuilt body may contain media restored from native API
    // snapshots. Prefer it without moving any node out of the foreground.
    const current = result.records.find((record) => core.keyOf(record.topicId, record.floor) === seed);
    let enhanced;
    if (item.content) {
      const content = cloneContentWithHiddenQuotes(item.content);
      const references = readReferences(content, info.topicId, location.href);
      cleanContent(content, location.href);
      enhanced = { ...(current || {}), topicId: info.topicId, floor: Number(item.index), user: item.anonymousCode ? `匿名 ${item.anonymousCode}` : item.user,
        uid: item.uid, avatar: item.avatar, metrics: item.metrics, publishedAt: item.publishedAt, contentHtml: content.outerHTML, references };
    }
    captureForeground(session, info.current, result, enhanced);
    restoreAvailablePages(session);
    for (const [direction, label] of [["all", "全部"], ["upstream", "上游引用"], ["downstream", "下游回复"]]) {
      const button = element("button", "", label);
      button.type = "button";
      button.dataset.direction = direction;
      button.addEventListener("click", () => { session.direction = direction; render(session); });
      tabs.append(button);
    }
    scanButton.addEventListener("click", () => {
      if (session.running) session.controller.abort();
      else {
        if (!nextPage(session) && !session.failed.size) {
          // Explicit refresh rereads the visible page as well, so new replies
          // and edits are fetched even when the foreground is an old snapshot.
          for (const key of session.loaded) topicCache.delete(key.split(":")[0]);
          topicCache.delete(session.topicId);
          session.loaded.clear();
          session.records.clear();
          session.reusedPages.clear();
          persistCache();
        }
        session.failed.clear();
        scan(session);
      }
    });
    layer.addEventListener("click", (event) => { if (event.target === layer) close(); });
    layer.addEventListener("wheel", (event) => {
      if (!scroll.contains(event.target)) event.preventDefault();
      event.stopPropagation();
    }, { passive: false });
    bindImageViewer(panel);
    panel.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const topicId = link.dataset.cc98ConversationTopic;
      const floor = Number(link.dataset.cc98ConversationFloor);
      if (topicId && floor) {
        event.preventDefault();
        event.stopImmediatePropagation();
        session.direction = "all";
        render(session);
        focusRecord(session, core.keyOf(topicId, floor));
      } else {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    }, true);
    session.onKeydown = (event) => {
      if (document.querySelector("#cc98-comfort-image-viewer")) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== "Tab") return;
      const buttons = [...panel.querySelectorAll("button, a[href], summary")].filter((node) => node.getClientRects().length && !node.disabled);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus({ preventScroll: true }); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus({ preventScroll: true }); }
    };
    document.addEventListener("keydown", session.onKeydown, true);
    session.guard = setInterval(() => {
      if (accountScope() !== session.scope || location.pathname !== session.pathname || !layer.isConnected || lastSettings?.enabled === false) close();
    }, 500);
    document.body.append(layer);
    render(session);
    closeButton.focus({ preventScroll: true });
    scan(session);
  }

  globalThis.CC98RebornConversation = { open, close, readReferences, extractPage, createReader, refreshFilters() { if (active) render(active); } };
})();
