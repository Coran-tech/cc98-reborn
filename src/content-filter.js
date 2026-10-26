(() => {
  "use strict";
  const core = globalThis.CC98RebornContentFilterCore;
  if (!core) return;
  let signature = "", enabled = false, compiled = [], compiledTitle = [], generation = 0, nextId = 0;
  // Completed title verdicts must survive a native list scan. A fixed title
  // count would rotate that scan; the shared byte budget bounds their storage.
  const MAX_CACHE_ENTRIES = 128, MAX_CACHE_BYTES = 4 * 1024 * 1024, MAX_TITLE_LENGTH = 10000;
  const entryBytes = key => key.length * 2 + 128;
  let frame, port, ready, notifyTimer, bridgeTimer, metricObserver;
  let filtersDirty = false, nativeDirty = false, titleFiltersDirty = false, titleNativeDirty = false, deferredTitles = false, titleRoute = null;
  const watched = new Set();
  const cache = new Map(), waiting = new Map(), errors = new Set(), texts = new WeakMap();
  function notify(filters = true, native = filters, title = false) {
    if (title) { titleFiltersDirty ||= filters; titleNativeDirty ||= native; }
    else { filtersDirty ||= filters; nativeDirty ||= native; }
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = 0;
      checkTitleRoute();
      const updateFilters = filtersDirty || titleFiltersDirty, updateNative = nativeDirty || titleNativeDirty;
      filtersDirty = nativeDirty = titleFiltersDirty = titleNativeDirty = false;
      if (updateFilters) {
        const handled = globalThis.CC98RebornNewTopicsVirtual?.refresh?.();
        if (!handled && typeof scheduleRebuild === "function") scheduleRebuild();
        globalThis.CC98RebornConversation?.refreshFilters?.();
        globalThis.CC98RebornTopicSearch?.refreshFilters?.();
        document.dispatchEvent(new CustomEvent("cc98-content-rules-updated"));
      }
      if (updateNative && typeof scheduleFiltering === "function") {
        deferredTitles = false;
        scheduleFiltering();
      }
      const status = [...errors].join("；");
      document.querySelectorAll("[data-content-rule-status]").forEach(node => { if (node.textContent !== status) node.textContent = status; });
    }, 40);
  }
  function noteError(message) {
    if (!errors.has(message)) { errors.add(message); notify(false); }
  }
  function disposeBridge() {
    clearTimeout(bridgeTimer); ready = null;
    port?.close(); port = null; frame?.remove(); frame = null;
  }
  function disposeWorker() {
    for (const entry of waiting.values()) clearTimeout(entry.timer);
    waiting.clear(); deferredTitles = false; disposeBridge();
  }
  function dispose() {
    metricObserver?.disconnect(); metricObserver = null; watched.clear();
    disposeWorker();
  }
  function checkTitleRoute() {
    const url = globalThis.location, next = url ? (url.origin || "") + (url.pathname || "") + (url.search || "") : "";
    if (titleRoute === next) return;
    const changed = titleRoute !== null;
    titleRoute = next;
    if (!changed) return;
    // Current-list verdicts cannot be evicted during repeated native scans.
    // Once that route is left they are inactive, and must release their share
    // of the byte budget for post bodies. Keep body work and cached results.
    for (const [key, entry] of cache) if (entry.kind === "title") cache.delete(key);
    let cancelled = false;
    for (const [id, entry] of waiting) if (entry.kind === "title") {
      clearTimeout(entry.timer); waiting.delete(id); cancelled = true;
    }
    deferredTitles = titleFiltersDirty = titleNativeDirty = false;
    if (!waiting.size) { generation++; disposeWorker(); }
    else if (cancelled) {
      // Removing only our callbacks would leave old title jobs in the frame's
      // queue. Recreate the bridge, preserving body jobs and their deadlines.
      generation++; disposeBridge();
      for (const [id, entry] of waiting) sendJob(id, entry);
    }
  }
  function complete(id, result) {
    checkTitleRoute();
    const pending = waiting.get(id);
    if (!pending) return;
    clearTimeout(pending.timer); waiting.delete(id);
    pending.entry.pending = false;
    pending.entry.rule = !result.error && Number.isSafeInteger(result.index) && result.index >= 0 ? pending.rules[result.index]?.source || "" : "";
    if (result.error) { noteError(result.error); pending.entry.error = result.error; }
    // A title was visible while pending, so a negative result changes no UI.
    // Body rules retain their existing pending-placeholder completion behavior.
    if (pending.kind !== "title") notify();
    else if (pending.entry.rule) notify(true, true, true);
    else if (deferredTitles) notify(false, true, true);
  }
  function connect() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      const expected = generation;
      frame = document.createElement("iframe");
      frame.hidden = true; frame.setAttribute("aria-hidden", "true");
      frame.id = "cc98-content-filter-frame";
      frame.src = chrome.runtime.getURL("src/content-filter-frame.html");
      bridgeTimer = setTimeout(() => reject(new Error("内容规则检测器未能启动，请重新加载扩展")), 8000);
      frame.addEventListener("load", () => {
        if (expected !== generation) return;
        const channel = new MessageChannel();
        port = channel.port1;
        port.onmessage = event => {
          if (expected !== generation) return;
          if (event.data?.ready) { clearTimeout(bridgeTimer); resolve(); }
          else if (Number.isSafeInteger(event.data?.id)) complete(event.data.id, event.data);
        };
        frame.contentWindow.postMessage({ type: "CC98_CONTENT_FILTER_CONNECT" }, "*", [channel.port2]);
      }, { once: true });
      document.body.append(frame);
    });
    return ready;
  }
  function emotion(image) {
    const label = image.closest?.("[data-cc98-ubb-emotion-tag]")?.getAttribute("data-cc98-ubb-emotion-tag") || image.getAttribute("alt") || image.getAttribute("title") || "";
    const code = label.replace(/^\[|\]$/g, "").toLowerCase();
    if (/^(?:ac(?:\d{2}|\d{4})|cc98\d{2}|tb\d{2}|ms\d{2}|em\d{2}|[acf]:\d{3})$/.test(code)) return "[" + code + "]";
    for (const key of ["src", "data-src", "data-original", "data-cc98-lazy-src", "srcset"]) {
      let source = image.getAttribute(key) || "";
      try { source = decodeURIComponent(source); } catch {}
      let match = source.match(/(?:^|\/)(?:static\/)?images\/ac1?\/(\d{2}|\d{4})\.png(?:[?#\s,]|$)/i);
      if (match) return "[ac" + match[1] + "]";
      match = source.match(/(?:^|\/)(?:static\/)?images\/CC98\/CC98(\d{2})\.(?:gif|png)(?:[?#\s,]|$)/i);
      if (match) return "[cc98" + match[1] + "]";
      match = source.match(/(?:^|\/)(?:static\/)?images\/(tb|ms|em)\/\1(\d{2})\.(?:gif|png)(?:[?#\s,]|$)/i);
      if (match) return "[" + match[1].toLowerCase() + match[2] + "]";
      match = source.match(/images\/mahjong\/(animal2017|carton2017|face2017)\/(\d{3})\.(?:gif|png)(?:[?#\s,]|$)/i);
      if (match) return "[" + ({ animal2017: "a", carton2017: "c", face2017: "f" })[match[1].toLowerCase()] + ":" + match[2] + "]";
    }
    return "";
  }
  function ownText(item) {
    const source = item.content || item;
    const html = item.content?.outerHTML ?? item.contentHtml;
    const saved = texts.get(source);
    if (saved && saved.html === html) return saved.text;
    const template = document.createElement("template");
    template.innerHTML = html || "";
    const root = template.content;
    root.querySelectorAll('script, style, iframe, object, embed, button, [class*="signature"], [class*="Signature"]').forEach(node => node.remove());
    root.querySelectorAll("blockquote, .cc98-rebuild-legacy-quote, .cc98-rebuild-quote-box, div[style]").forEach(node => {
      if (node.matches("blockquote, .cc98-rebuild-legacy-quote, .cc98-rebuild-quote-box")
        || (typeof isLegacyQuoteStyle === "function" && isLegacyQuoteStyle(node.getAttribute("style"), ""))) node.remove();
    });
    root.querySelectorAll("img, .lazyload-placeholder[data-cc98-lazy-src]").forEach(image => { const code = emotion(image); image.replaceWith(document.createTextNode(code)); });
    root.querySelectorAll("p, div, br, li, pre, tr, h1, h2, h3").forEach(node => node.after(document.createTextNode("\n")));
    const text = (html || item.content ? root.textContent : item.text || "").replace(/\r\n?/g, "\n").trim();
    texts.set(source, { html, text }); return text;
  }
  // Read only the native controls of this post, never quoted content or author reputation.
  function metrics(post) {
    if (!post?.querySelector) return {};
    watchMetrics(post);
    const own = selector => [...post.querySelectorAll(selector)].filter(node => !node.closest('.substance, .signature, blockquote, .user-post-content'));
    const number = value => {
      const text = String(value ?? "").replace(/[,，\s]/g, "");
      return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : undefined;
    };
    const vote = (selector, label) => {
      const node = own(selector)[0];
      if (node) return number(node.querySelector('.commentProp')?.textContent ?? node.textContent.replace(new RegExp('^\\s*' + label + '\\s*[:：]?'), ''));
      const preview = own('.user-post-like-count').find(node => node.textContent.trim().startsWith(label));
      return preview ? number(preview.textContent.replace(new RegExp('^\\s*' + label + '\\s*[:：]?'), '')) : undefined;
    };
    const result = { likes: vote('.upup', '赞'), dislikes: vote('.downdown', '踩') };
    const award = own('.awardInfo')[0];
    if (award) {
      const collapsed = [...award.querySelectorAll('button')].some(node => node.textContent.trim() === '显示全部');
      const rows = [...award.querySelectorAll('.tagSize, :scope > .good, :scope > .bad')];
      const operations = rows.map(row => row.querySelector('.grades')?.textContent.trim());
      if (!collapsed && rows.length && operations.every(Boolean)) {
        let sum = 0, valid = true;
        for (const operation of operations) {
          if (!operation.includes('风评值')) continue;
          const change = operation.match(/[+-]?\d+/);
          if (change) sum += Number(change[0]); else valid = false;
        }
        if (valid) result.reputation = sum;
      }
    } else if (post.matches('.reply') && result.likes !== undefined && result.dislikes !== undefined) {
      // The native reply renders Award only when its awards array is nonempty.
      result.reputation = 0;
    }
    return result;
  }
  function watchMetrics(post) {
    if (!post.isConnected || !enabled || !compiled.some(rule => rule.hasMetrics) || watched.has(post)) return;
    const selector = '.upup, .downdown, .awardInfo, .user-post-info';
    metricObserver ||= new MutationObserver(records => {
      if (records.some(record => {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        return target?.closest(selector) || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector)));
      })) notify();
    });
    let removed = false;
    for (const node of watched) if (!node.isConnected) { watched.delete(node); removed = true; }
    const options = { childList: true, subtree: true, characterData: true };
    if (removed) { metricObserver.disconnect(); for (const node of watched) metricObserver.observe(node, options); }
    watched.add(post); metricObserver.observe(post, options);
  }
  function trim(extraBytes = 0, extraEntries = 0, kind = "body") {
    let bytes = 0, entries = 0;
    const limit = kind === "title" ? Infinity : MAX_CACHE_ENTRIES;
    for (const [text, entry] of cache) { bytes += entryBytes(text); if (entry.kind === kind) entries++; }
    for (const [text, entry] of cache) {
      if (entries + extraEntries <= limit && bytes + extraBytes <= MAX_CACHE_BYTES) break;
      // Reclaim completed bodies as before, but do not evict completed titles
      // only to rediscover them in the next native scan. At the byte boundary,
      // additional titles fail open with a status instead of restarting a loop.
      if (!entry.pending && entry.kind !== "title" && (entry.kind === kind || bytes + extraBytes > MAX_CACHE_BYTES)) {
        cache.delete(text); bytes -= entryBytes(text);
        if (entry.kind === kind) entries--;
      }
    }
    return entries + extraEntries <= limit && bytes + extraBytes <= MAX_CACHE_BYTES;
  }
  function regexEntry(kind, text, values, rules) {
    const key = JSON.stringify([kind, text, values.likes ?? null, values.dislikes ?? null, values.reputation ?? null]);
    let entry = cache.get(key);
    if (entry) return entry;
    if (waiting.size >= MAX_CACHE_ENTRIES && kind === "title") { deferredTitles = true; return null; }
    if (waiting.size >= MAX_CACHE_ENTRIES || !trim(entryBytes(key), 1, kind)) {
      noteError(kind === "title" ? "标题规则检测缓存已满，本次已跳过；刷新页面可重试" : "等待检测的发言过多或内容过长，本次已跳过");
      return null;
    }
    entry = { pending: true, rule: "", kind }; cache.set(key, entry);
    const id = ++nextId;
    const timer = setTimeout(() => complete(id, { index: -1, error: kind === "title" ? "标题规则检测等待超时，本次已跳过" : "内容规则检测等待超时，本次已跳过" }), 15000);
    const pending = { entry, rules, timer, kind, text, values };
    waiting.set(id, pending); sendJob(id, pending);
    return entry;
  }
  function sendJob(id, pending) {
    const expected = generation;
    connect().then(() => {
      if (generation === expected && waiting.get(id) === pending) port.postMessage({ id, text: pending.text, metrics: pending.values, rules: pending.rules.map(rule => rule.source) });
    }).catch(error => { if (generation === expected) complete(id, { index: -1, error: error.message }); });
  }
  function reason(item, post = false) {
    checkTitleRoute();
    if (!enabled || !item || (item.type !== "post" && !post) || !compiled.length || (!item.content && !item.contentHtml && !item.text)) return "";
    const text = ownText(item), values = item.metrics || {}, unknown = [];
    for (const rule of compiled) {
      const result = core.evaluate(rule, text, false, values);
      if (result === true) return "内容规则：" + rule.source;
      if (result === undefined && rule.hasRegex) unknown.push(rule);
    }
    if (!unknown.length) return "";
    const entry = regexEntry("body", text, values, unknown);
    if (!entry) return "";
    return entry.pending ? "正在检查内容规则" : entry.rule ? "内容规则：" + entry.rule : "";
  }
  function titleReason(title) {
    checkTitleRoute();
    if (!enabled || !compiledTitle.length || typeof title !== "string" || !title.trim()) return "";
    if (title.length > MAX_TITLE_LENGTH) { noteError("标题超过 10000 字符，本次已跳过"); return ""; }
    const unknown = [];
    for (const rule of compiledTitle) {
      const result = core.evaluate(rule, title, false);
      if (result === true) return "标题：" + rule.source;
      if (result === undefined && rule.hasRegex) unknown.push(rule);
    }
    if (!unknown.length) return "";
    const entry = regexEntry("title", title, {}, unknown);
    return entry && !entry.pending && entry.rule ? "标题：" + entry.rule : "";
  }
  function sync(settings) {
    checkTitleRoute();
    const next = JSON.stringify([settings?.enabled !== false, settings?.blockedContentRules || "[]", settings?.blockedTitleKeywords || ""]);
    if (next === signature) return;
    const changed = Boolean(signature);
    signature = next; generation++; dispose(); cache.clear(); errors.clear();
    enabled = settings?.enabled !== false; compiled = []; compiledTitle = [];
    try { compiled = core.parseRules(settings?.blockedContentRules).map(core.compile); } catch (error) { errors.add(error.message); }
    try {
      const titleSource = settings?.blockedTitleKeywords || "";
      if (typeof titleSource !== "string" || titleSource.length > 100000) throw new Error("标题规则须为不超过 100000 字的文本");
      const titleRules = core.splitTitleRules?.(titleSource) || [];
      let regexCount = 0;
      for (const source of titleRules) {
        try {
          const rule = core.compileTitle(source);
          if (rule.hasRegex && ++regexCount > 50) { errors.add("标题正则最多 50 条，其余正则已跳过"); continue; }
          compiledTitle.push(rule);
        }
        catch (error) { errors.add("标题规则：" + error.message); }
      }
    } catch (error) { errors.add("标题规则：" + error.message); }
    if (changed) notify();
    else if (errors.size) notify(false);
  }
  function status() {
    let titleEntries = 0, bodyEntries = 0, bytes = 0;
    for (const [key, entry] of cache) { bytes += entryBytes(key); if (entry.kind === "title") titleEntries++; else bodyEntries++; }
    return { pending: waiting.size, titleEntries, bodyEntries, bytes, deferredTitles };
  }
  addEventListener("pagehide", () => { generation++; dispose(); cache.clear(); clearTimeout(notifyTimer); notifyTimer = 0; filtersDirty = nativeDirty = titleFiltersDirty = titleNativeDirty = false; titleRoute = null; });
  globalThis.CC98RebornContentFilter = { reason, titleReason, sync, ownText, metrics, status, errors: () => [...errors] };
})();
