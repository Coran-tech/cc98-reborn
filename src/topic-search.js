(function () {
  "use strict";
  const STORAGE_KEY = "cc98RebornTopicSearch:v1";
  const NOTICE = "为防止给服务器造成过大压力，这将需要等待一段时间。";
  let job = null;
  let view = null;
  let pendingStart = null;

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function scope() { return `${location.origin}:${getCc98AccountId(getStoredCc98UserInfo()) || "guest"}`; }
  function save() {
    if (!job) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, scope: job.scope,
      topicId: job.topicId, query: job.query, includeQuotes: job.includeQuotes, phase: job.phase, maxPage: job.maxPage, refreshing: job.refreshing })); } catch {}
  }
  function makeJob(info, query = "", includeQuotes = true) {
    return { topicId: String(info.topicId), scope: scope(), query, includeQuotes, maxPage: Math.max(1, info.maxKnown || 1),
      phase: "idle", pages: new Map(), matches: new Map(), revealed: new Set(), reader: null, epoch: 0, error: "", shown: 100, refreshing: false };
  }
  function searchableText(record, includeQuotes) {
    // Template content is inert: indexing never loads embedded media or runs
    // handlers, and literal queries only become text/mark nodes in the UI.
    const template = document.createElement("template");
    template.innerHTML = record.contentHtml;
    template.content.querySelectorAll("script, style, iframe, object, embed, button").forEach(item => item.remove());
    if (!includeQuotes) template.content.querySelectorAll("blockquote, .cc98-rebuild-quote-box, .cc98-rebuild-legacy-quote, div[style]").forEach(item => {
      if (item.matches("blockquote, .cc98-rebuild-quote-box, .cc98-rebuild-legacy-quote") || isLegacyQuoteStyle(item.getAttribute("style"), "")) item.remove();
    });
    template.content.querySelectorAll("p, br, div, li, blockquote, pre, tr, td, th, h1, h2, h3, h4").forEach(item => item.after(document.createTextNode(" ")));
    return (template.content.textContent || "").replace(/\s+/g, " ").trim();
  }
  function indexPage(task, page, result) {
    task.pages.set(page, result);
    task.maxPage = Math.max(task.maxPage, result.maxPage || page);
    for (const [floor] of task.matches) if (Math.ceil(floor / 10) === page) task.matches.delete(floor);
    if (!task.query) return;
    const query = task.query.toLocaleLowerCase();
    for (const record of result.records) {
      const text = searchableText(record, task.includeQuotes);
      const at = text.toLocaleLowerCase().indexOf(query);
      if (at >= 0) task.matches.set(Number(record.floor), { record, text, at });
    }
  }
  function captureCached(task, reader) {
    for (const [page, result] of reader.cachedPages()) indexPage(task, page, result);
  }
  function pause(task = job) {
    if (!task || task.phase !== "running") return;
    task.epoch++;
    task.phase = "paused";
    task.reader?.dispose(); task.reader = null;
    save(); render();
  }
  async function run(task, refresh = false) {
    const epoch = ++task.epoch;
    task.phase = "running"; task.error = "";
    task.refreshing = refresh || task.refreshing;
    task.pages.clear(); task.matches.clear(); task.shown = 100;
    try {
      task.reader = CC98RebornConversation.createReader({ topicId: task.topicId, maxKnown: task.maxPage }, { refresh, capture: !task.refreshing });
      captureCached(task, task.reader);
      save(); render();
      for (let page = 1; page <= task.maxPage; page++) {
        if (task !== job || epoch !== task.epoch) return;
        if (task.pages.has(page)) continue;
        const result = await task.reader.read(page);
        if (task !== job || epoch !== task.epoch) return;
        indexPage(task, page, result); save(); render();
      }
      if (task !== job || epoch !== task.epoch) return;
      task.phase = "complete";
      task.refreshing = false;
      if (!view) showRebuiltTransientToast(null, `全文搜索完成：找到 ${task.matches.size} 个楼层`);
    } catch (error) {
      if (task !== job || epoch !== task.epoch) return;
      task.phase = error.name === "AbortError" ? "paused" : "error";
      task.error = error.name === "AbortError" ? "" : (error.message || "页面读取失败，请稍后重试。");
    } finally {
      if (epoch === task.epoch) { task.reader?.dispose(); task.reader = null; save(); render(); }
    }
  }
  function addSnippet(container, text, query, at) {
    const start = Math.max(0, at - 45), end = Math.min(text.length, at + query.length + 100);
    const excerpt = text.slice(start, end), lower = excerpt.toLocaleLowerCase(), needle = query.toLocaleLowerCase();
    if (start) container.append(document.createTextNode("…"));
    let cursor = 0, found;
    while ((found = lower.indexOf(needle, cursor)) >= 0 && needle) {
      container.append(document.createTextNode(excerpt.slice(cursor, found)), node("mark", "", excerpt.slice(found, found + needle.length)));
      cursor = found + needle.length;
    }
    container.append(document.createTextNode(excerpt.slice(cursor) + (end < text.length ? "…" : "")));
  }
  function render() {
    document.querySelectorAll(".cc98-topic-search-entry").forEach(button => {
      const same = job?.topicId === button.dataset.topicId && job?.scope === scope();
      const busy = same && job.phase === "running";
      // A changing counter must not widen/wrap the foreground toolbar.
      if (button.textContent !== "全文搜索") button.textContent = "全文搜索";
      button.title = busy ? `全文搜索：已读 ${job.pages.size}/${job.maxPage} 页` : same && job.phase === "complete" ? `全文搜索：找到 ${job.matches.size} 个楼层` : "全文搜索";
      button.dataset.searchRunning = String(Boolean(busy));
      button.setAttribute("aria-busy", String(Boolean(busy)));
      button.setAttribute("aria-label", "全文搜索");
    });
    if (!view || !job || view.topicId !== job.topicId) return;
    const busy = job.phase === "running";
    view.input.disabled = busy; view.quotes.disabled = busy;
    view.action.textContent = busy ? "暂停搜索" : job.phase === "idle" ? "开始搜索" : job.phase === "complete" ? "重新搜索" : "继续搜索";
    view.background.hidden = !busy;
    view.refresh.disabled = busy || !job.query;
    view.status.textContent = job.phase === "idle" ? "输入关键词，搜索本帖所有楼层。"
      : `${busy ? "搜索中" : job.phase === "complete" ? "搜索完成" : job.phase === "error" ? "读取中断" : "已暂停"} · 已读 ${job.pages.size}/${job.maxPage} 页 · 找到 ${job.matches.size} 个楼层`;
    view.progress.max = job.maxPage; view.progress.value = job.pages.size; view.progress.hidden = job.phase === "idle";
    view.error.textContent = job.error; view.error.hidden = !job.error;
    const scroll = view.results.scrollTop;
    view.results.replaceChildren();
    for (const { record, text, at } of [...job.matches.values()].sort((a, b) => a.record.floor - b.record.floor).slice(0, job.shown)) {
      const card = node("article", "cc98-topic-search-result"); card.dataset.searchFloor = String(record.floor);
      const link = node("a", "cc98-topic-search-result-link", `#${record.floor} · ${record.user || "CC98 用户"}`);
      link.href = `${new URL(buildTopicPageHref(job.topicId, Math.ceil(record.floor / 10)), location.href).href}#${record.floor}`;
      link.target = "_blank"; link.rel = "noopener noreferrer";
      const snippet = node("p", "cc98-topic-search-snippet"); addSnippet(snippet, text, job.query, at);
      card.append(link, node("small", "cc98-topic-search-result-time", record.publishedAt || ""));
      const reason = shouldBlockRebuiltItem({ type: "post", uid: record.uid, user: record.user });
      if (reason && !job.revealed.has(record.floor)) {
        const reveal = node("button", "cc98-topic-search-reveal", `${reason} · 显示此楼`); reveal.type = "button";
        reveal.onclick = () => { job.revealed.add(record.floor); render(); };
        card.append(reveal);
      } else card.append(snippet);
      view.results.append(card);
    }
    if (!job.matches.size) view.results.append(node("p", "cc98-topic-search-empty", job.phase === "complete" ? "没有找到匹配的楼层。" : busy ? "正在搜索，命中结果会陆续显示。" : "搜索结果会显示在这里。"));
    view.more.hidden = job.matches.size <= job.shown;
    view.results.scrollTop = scroll;
  }
  function requestStart(refresh = false) {
    if (job.phase === "running") { pause(); return; }
    const query = view.input.value.replace(/\s+/g, " ").trim();
    if (!query) { view.input.setCustomValidity("请输入关键词。"); view.input.reportValidity(); view.input.focus(); return; }
    view.input.setCustomValidity("");
    pendingStart = { query, includeQuotes: view.quotes.checked, refresh };
    view.warning.hidden = false;
    view.confirm.focus({ preventScroll: true });
  }
  function close() {
    if (!view) return;
    const old = view; view = null; pendingStart = null;
    document.removeEventListener("keydown", old.onKeydown, true);
    old.layer.remove(); old.trigger?.focus({ preventScroll: true });
  }
  function open(info, trigger) {
    if (!info || !CC98RebornConversation?.createReader) return;
    if (!job) restoreSaved();
    close();
    if (!job || job.topicId !== String(info.topicId) || job.scope !== scope()) {
      pause(); job = makeJob(info); save();
    } else job.maxPage = Math.max(job.maxPage, info.maxKnown || 1);
    if (job.phase !== "running") {
      const reader = CC98RebornConversation.createReader(info, { capture: !job.refreshing });
      captureCached(job, reader); reader.dispose();
      if (job.phase === "complete" && job.pages.size < job.maxPage) job.phase = "paused";
    }
    const layer = node("div", "cc98-topic-search-layer");
    const panel = node("section", "cc98-topic-search-dialog");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-labelledby", "cc98-topic-search-title");
    const header = node("header", "cc98-topic-search-header");
    const title = node("h2", "", "帖内全文搜索"); title.id = "cc98-topic-search-title";
    const dismiss = node("button", "cc98-topic-search-close", "×"); dismiss.type = "button"; dismiss.setAttribute("aria-label", "关闭搜索窗口"); dismiss.onclick = close;
    header.append(title, dismiss);
    const form = node("form", "cc98-topic-search-form");
    const label = node("label", "cc98-topic-search-query-label", "关键词");
    const input = node("input", "cc98-topic-search-query"); input.type = "search"; input.maxLength = 200; input.value = job.query; input.placeholder = "搜索本帖正文"; input.oninput = () => input.setCustomValidity(""); label.append(input);
    const quoteLabel = node("label", "cc98-topic-search-quotes-label");
    const quotes = node("input"); quotes.type = "checkbox"; quotes.checked = job.includeQuotes; quoteLabel.append(quotes, document.createTextNode("包含引用内容"));
    const actions = node("div", "cc98-topic-search-actions");
    const action = node("button", "cc98-topic-search-primary"); action.type = "submit";
    const refresh = node("button", "", "刷新内容"); refresh.type = "button"; refresh.onclick = () => requestStart(true);
    const background = node("button", "", "后台搜索"); background.type = "button"; background.onclick = close;
    actions.append(action, refresh, background); form.append(label, quoteLabel, actions);
    form.onsubmit = event => { event.preventDefault(); requestStart(); };
    const warning = node("div", "cc98-topic-search-warning"); warning.hidden = true; warning.setAttribute("role", "alert");
    const confirm = node("button", "cc98-topic-search-primary", "确认开始"); confirm.type = "button";
    const cancel = node("button", "", "取消"); cancel.type = "button"; cancel.onclick = () => { warning.hidden = true; pendingStart = null; action.focus(); };
    warning.append(node("p", "", NOTICE), confirm, cancel);
    confirm.onclick = () => {
      if (!pendingStart) return;
      const requested = pendingStart; pendingStart = null; warning.hidden = true;
      pause(); job.query = requested.query; job.includeQuotes = requested.includeQuotes;
      run(job, requested.refresh);
    };
    const status = node("p", "cc98-topic-search-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const progress = node("progress", "cc98-topic-search-progress"); progress.setAttribute("aria-label", "搜索页数进度");
    const error = node("p", "cc98-topic-search-error"); error.setAttribute("role", "alert");
    const results = node("div", "cc98-topic-search-results");
    const more = node("button", "cc98-topic-search-more", "显示更多结果"); more.type = "button"; more.onclick = () => { job.shown += 100; render(); };
    panel.append(header, form, warning, status, progress, error, results, more,
      node("small", "cc98-topic-search-hint", "关闭窗口后继续在本标签页搜索；同帖翻页可恢复，离开本帖时暂停。"));
    layer.append(panel); layer.onclick = event => { if (event.target === layer) close(); };
    layer.addEventListener("wheel", event => { if (!panel.contains(event.target)) event.preventDefault(); event.stopPropagation(); }, { passive: false });
    view = { layer, panel, trigger, topicId: job.topicId, input, quotes, action, refresh, background, warning, confirm, status, progress, error, results, more };
    view.onKeydown = event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll("button, input, a")].filter(item => !item.disabled && item.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", view.onKeydown, true);
    document.body.append(layer); render(); input.focus({ preventScroll: true });
  }
  function restoreSaved() {
    if (job || window.top !== window) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      if (saved.version !== 1 || saved.scope !== scope() || !/^\d+$/.test(saved.topicId) || typeof saved.query !== "string" || saved.query.length > 200 || !Number.isSafeInteger(saved.maxPage) || saved.maxPage < 1 || saved.maxPage > 100000) {
        sessionStorage.removeItem(STORAGE_KEY); return;
      }
      job = makeJob({ topicId: saved.topicId, maxKnown: saved.maxPage }, saved.query, saved.includeQuotes !== false);
      job.refreshing = saved.refreshing === true;
      job.phase = ["paused", "complete", "error"].includes(saved.phase) ? saved.phase : saved.phase === "running" ? "paused" : "idle";
      if (saved.phase === "running" && saved.query && getTopicPageInfo()?.topicId === saved.topicId && lastSettings?.enabled !== false) run(job);
    } catch { try { sessionStorage.removeItem(STORAGE_KEY); } catch {} }
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", () => setTimeout(restoreSaved, 300), { once: true });
  else setTimeout(restoreSaved, 300);
  setInterval(() => {
    if (!job) return;
    if (job.scope !== scope()) {
      pause(); close(); job = null;
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      return;
    }
    if (lastSettings?.enabled === false || getTopicPageInfo()?.topicId !== job.topicId) { pause(); close(); }
  }, 500);
  addEventListener("pagehide", () => { save(); if (job) { job.epoch++; job.reader?.dispose(); job.reader = null; } });
  addEventListener("pageshow", event => {
    if (!event.persisted) return;
    if (job) { job.epoch++; job.reader?.dispose(); }
    close(); job = null; restoreSaved();
  });
  globalThis.CC98RebornTopicSearch = Object.freeze({ open, close });
})();
