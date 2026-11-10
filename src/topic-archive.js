(function () {
  "use strict";
  let job = null, view = null;
  const node = (tag, className, text) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const scope = () => `${location.origin}:${getCc98AccountId(getStoredCc98UserInfo()) || "guest"}`;
  async function send(type, payload = {}) {
    const result = await chrome.runtime.sendMessage({ type: "CC98_ARCHIVE_" + type, ...payload });
    if (!result?.ok) {
      const error = new Error(result?.error || "本地存档未能完成，请重试"); error.fatal = result?.fatal === true; throw error;
    }
    return result;
  }
  function url(value, base) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const result = new URL(value, base);
      if (/^https?:$/.test(result.protocol) || result.href.startsWith(chrome.runtime.getURL("images/"))
        || /^data:image\/(png|gif|jpe?g|webp|avif|bmp);/i.test(result.href)) return result.href;
    } catch {}
    return "";
  }
  function prepareHtml(html, base, includeFiles, resources, failures) {
    const template = document.createElement("template"); template.innerHTML = html || "";
    const root = template.content, externalFrames = new WeakSet();
    root.querySelectorAll("script, style, link, meta, base, object, embed, form, input, textarea, select, button").forEach(item => item.remove());
    for (const frame of root.querySelectorAll("iframe")) {
      const href = url(frame.getAttribute("src"), base), link = node("a", "", "外部媒体（原链接）");
      if (href) link.href = href;
      externalFrames.add(link);
      frame.replaceWith(link);
    }
    for (const quote of root.querySelectorAll("div[style], .cc98-rebuild-quote-box, .cc98-rebuild-legacy-quote")) {
      if (!quote.matches(".cc98-rebuild-quote-box, .cc98-rebuild-legacy-quote") && !isLegacyQuoteStyle(quote.getAttribute("style"), "")) continue;
      const block = document.createElement("blockquote"); block.append(...quote.childNodes); quote.replaceWith(block);
    }
    const remember = (item, value, kind, attribute = "data-cc98-archive-resource") => {
      const source = url(value, base);
      if (source) { item.setAttribute(attribute, source); resources.set(source, kind); }
      else failures.push({ error: kind === "image" ? "一张图片缺少可保存的地址，或使用不支持的格式" : "一个音视频或附件使用临时地址，无法离线保存" });
      return source;
    };
    for (const image of root.querySelectorAll("img")) {
      const source = getMediaUrl(image) || image.getAttribute("src");
      remember(image, source, "image");
    }
    for (const media of root.querySelectorAll("audio, video")) {
      const source = media.getAttribute("src") || media.querySelector("source")?.getAttribute("src") || "";
      const poster = media.getAttribute("poster");
      if (includeFiles) {
        remember(media, source, "file");
        if (poster) remember(media, poster, "image", "data-cc98-archive-poster");
        media.querySelectorAll("source, track").forEach(item => item.remove());
      } else {
        const group = node("div"), link = node("a", "", `${media.tagName === "VIDEO" ? "视频" : "音频"}（原链接）`);
        const href = url(source, base); if (href) link.href = href;
        if (poster) { const image = node("img"); remember(image, poster, "image"); group.append(image); }
        group.append(link); media.replaceWith(group);
      }
    }
    for (const link of root.querySelectorAll("a[href]")) {
      const href = url(link.getAttribute("href"), base);
      if (!/^https?:/i.test(href)) { link.removeAttribute("href"); continue; }
      link.href = href;
      if (externalFrames.has(link)) continue;
      const pathname = new URL(href).pathname;
      const explicitDownload = link.hasAttribute("download") || /download/i.test(link.className);
      // An HTML page or a picture's destination is not an attached file.
      // Keep those links without requesting access to their external domains.
      const file = explicitDownload || !link.querySelector("img, video, audio") && (
        /\.(?:pdf|zip|rar|7z|docx?|xlsx?|pptx?|txt|csv|md|markdown|mp[34]|webm|ogg|flac|wav)$/i.test(pathname)
        || /\/(?:download|v4-upload)\//i.test(pathname) && !isImageUrl(href));
      if (includeFiles && file) remember(link, href, "file");
    }
    for (const item of root.querySelectorAll("*")) {
      for (const attribute of [...item.attributes]) {
        if (/^on/i.test(attribute.name) || ["src", "srcset", "poster", "srcdoc", "autoplay", "ping", "formaction", "action"].includes(attribute.name)
          || attribute.name.startsWith("data-") && !["data-cc98-archive-resource", "data-cc98-archive-poster"].includes(attribute.name)) item.removeAttribute(attribute.name);
      }
      if (/url\s*\(|@import|expression\s*\(/i.test(item.getAttribute("style") || "")) item.removeAttribute("style");
    }
    return template.innerHTML;
  }
  function preparePage(result, page, task) {
    const resources = new Map(), failures = [], base = new URL(buildTopicPageHref(task.topicId, page), location.href).href;
    const records = result.records.map(record => {
      const copy = { ...record };
      for (const field of ["contentHtml", "signatureHtml", "extraHtml"]) copy[field] = prepareHtml(record[field], base, task.includeFiles, resources, failures);
      copy.avatar = url(record.avatar, base);
      if (copy.avatar) resources.set(copy.avatar, "image");
      else if (record.avatar) failures.push({ error: "一个用户头像使用不支持的图片地址" });
      return copy;
    });
    return { result: { ...result, records }, resources, failures: failures.map(failure => ({ page, ...failure })) };
  }
  function valid(task) {
    return task === job && !task.cancelled && task.scope === scope()
      && getTopicPageInfo()?.topicId === task.topicId && lastSettings?.enabled !== false;
  }
  function render() {
    document.querySelectorAll(".cc98-topic-archive-entry").forEach(button => {
      const busy = job?.running && job.topicId === button.dataset.topicId;
      button.setAttribute("aria-busy", String(Boolean(busy)));
      button.title = busy ? `本帖存档：已读 ${job.pages}/${job.maxPage} 页` : "存档本帖快照到本地";
    });
    if (!view) return;
    const updating = Boolean(view.updateSnapshot);
    const task = job?.topicId === view.info.topicId && (updating ? job.baseId === view.updateSnapshot.id : !job.baseId) ? job : null, running = Boolean(task?.running);
    view.includeFiles.disabled = Boolean(job?.running) || updating;
    view.refreshExisting.disabled = Boolean(job?.running);
    view.start.disabled = Boolean(job?.running);
    view.start.textContent = updating ? task && !running ? "再次更新" : "开始更新" : task && !running ? "再次存档" : "开始存档";
    view.stop.hidden = !running;
    view.open.hidden = !task?.id;
    view.progress.hidden = !task;
    if (task) { view.progress.max = task.plannedPages || task.maxPage; view.progress.value = task.pages; }
    view.status.textContent = !task ? ""
      : `${running ? task.downloading ? "正在保存媒体" : "正在读取" : updating ? task.updated ? "备份已更新" : task.status === "cancelled" ? "已取消，原备份未改动" : "更新未完成，原备份未改动" : task.status === "complete" ? "存档完成" : task.status === "cancelled" ? "已取消，已保存内容保留" : "部分内容已保存"} · ${task.pages}/${task.plannedPages || task.maxPage} 页 · ${task.assets} 个资源`;
    view.error.textContent = task?.error || (task?.failures.length ? `${task.failures.length} 项未能保存，可在存档详情中查看。` : "");
    view.error.hidden = !view.error.textContent;
  }
  function cancel(task = job) {
    if (!task?.running) return;
    task.cancelled = true;
    task.reader?.dispose(); task.reader = null;
    if (task.id) send("ABORT", { id: task.id }).catch(() => {});
  }
  async function start(info, includeFiles, updateSnapshot = null, refreshExisting = false) {
    if (job?.running) return;
    const task = job = { topicId: String(info.topicId), scope: scope(), includeFiles, pages: 0, maxPage: 1, assets: 0,
      failures: [], resourceURLs: new Set(), running: true, cancelled: false, id: null, error: "", status: "capturing",
      baseId: updateSnapshot?.id || null, baseSnapshot: updateSnapshot, updated: false, plannedPages: 1 };
    render();
    let guard;
    try {
      const begin = await send("BEGIN", { meta: { topicId: task.topicId, title: getPageTitle(), url: new URL(buildTopicPageHref(task.topicId, 1), location.href).href,
        owner: task.scope, startedAt: Date.now(), includeFiles,
        ...(task.baseId ? { baseId: task.baseId, refreshExisting } : {}) } });
      task.id = begin.id;
      if (!valid(task)) throw new DOMException("存档已停止", "AbortError");
      task.reader = CC98RebornConversation.createReader(info, { archive: true });
      guard = setInterval(() => { if (!valid(task)) cancel(task); }, 500);
      const existing = new Set(begin.update?.pageNumbers || []);
      const queue = begin.update ? [...new Set(begin.update.scanPages)].sort((a, b) => a - b) : [1];
      const scheduled = new Set(queue);
      task.maxPage = begin.update?.expectedPages || 1; task.plannedPages = queue.length;
      // Refresh only the stored tail and missing/failed pages by default. New
      // pages discovered there join the same paced reader; old pages stay local.
      for (let pageIndex = 0; pageIndex < queue.length; pageIndex++) {
        const page = queue[pageIndex];
        if (!valid(task)) throw new DOMException("存档已停止", "AbortError");
        try {
          const result = await task.reader.read(page);
          if (!valid(task)) throw new DOMException("存档已停止", "AbortError");
          task.maxPage = Math.max(task.maxPage, result.maxPage || 1);
          for (let next = 1; next <= task.maxPage; next++) if (!scheduled.has(next) && (!existing.has(next) || refreshExisting)) {
            scheduled.add(next); queue.push(next);
          }
          task.plannedPages = queue.length;
          if (!result.records.length || result.records.some(record => String(record.topicId) !== task.topicId || Math.ceil(record.floor / 10) !== page)) throw new Error("返回的楼层与请求页不一致");
          const prepared = preparePage(result, page, task);
          await send("PAGE", { id: task.id, page, result: prepared.result, capturedAt: Date.now() });
          task.pages++;
          task.failures.push(...prepared.failures);
          if (result.incompleteMedia) task.failures.push({ page, error: `${result.incompleteMedia} 个媒体占位未能展开` });
          if (result.incompleteQuotes) task.failures.push({ page, error: `${result.incompleteQuotes} 处引用未能展开` });
          task.downloading = true; render();
          const resourceQueue = [...prepared.resources].filter(([source]) => !task.resourceURLs.has(source));
          resourceQueue.forEach(([source]) => task.resourceURLs.add(source));
          let index = 0;
          await Promise.all([0, 1].map(async () => {
            while (index < resourceQueue.length && valid(task) && !task.fatal) {
              const [source, kind] = resourceQueue[index++];
              try { await send("RESOURCE", { id: task.id, url: source, kind }); task.assets++; }
              catch (error) {
                if (error.fatal) { task.fatal = true; throw error; }
                if (valid(task)) task.failures.push({ page, url: source, error: error.message });
              }
              render();
            }
          }));
          task.downloading = false; render();
        } catch (error) {
          if (!valid(task) || error.name === "AbortError" || error.fatal) throw error;
          task.failures.push({ page, error: error.message || "读取失败" });
          if (page === 1 && !task.baseId) { task.error = "第一页读取失败，无法确认全帖范围。"; break; }
        }
      }
      if (!valid(task)) throw new DOMException("存档已停止", "AbortError");
      task.status = task.baseId && !task.pages ? "error" : task.failures.length || task.pages !== task.plannedPages ? "partial" : "complete";
      if (task.baseId && !task.pages) task.error = task.failures[0]?.error || "没有读到新内容，原备份未改动";
    } catch (error) {
      task.status = task.cancelled || error.name === "AbortError" ? "cancelled" : "error";
      task.error = task.status === "cancelled" ? "" : error.message;
    } finally {
      clearInterval(guard);
      task.reader?.dispose(); task.reader = null;
      if (task.id) {
        try {
          const result = await send("FINISH", { id: task.id, status: task.status, expectedPages: task.maxPage, error: task.error, failures: task.failures });
          if (result.snapshot) {
            task.status = result.updateStatus || result.snapshot.status;
            task.updated = result.updated === true;
            task.id = result.id || result.snapshot.id || task.id;
            task.error = result.error || (task.baseId && !task.updated ? task.error : result.snapshot.error || task.error);
            task.failures = result.snapshot.failures || task.failures;
          }
        }
        catch (error) { task.status = "error"; task.error = error.message; }
      }
      task.running = false; render();
      if (!view && (task.updated || task.status === "complete")) showRebuiltTransientToast(null, task.baseId ? "本帖备份已更新" : "本帖快照已保存到本地存档");
    }
  }
  function close() {
    if (!view) return;
    const previous = view; view = null;
    document.removeEventListener("keydown", previous.keydown, true);
    previous.layer.remove(); previous.trigger?.focus({ preventScroll: true });
  }
  function open(info, trigger, updateSnapshot = null) {
    if (job?.running && job.topicId === String(info.topicId) && job.baseSnapshot) updateSnapshot ||= job.baseSnapshot;
    close();
    const layer = node("div", "cc98-topic-archive-layer"), panel = node("section", "cc98-topic-archive-dialog");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-labelledby", "cc98-archive-title");
    const heading = node("h2", "", updateSnapshot ? "更新本地备份" : "存档本帖快照到本地"); heading.id = "cc98-archive-title";
    const dismiss = node("button", "", "关闭"); dismiss.type = "button"; dismiss.onclick = close;
    const header = node("header"); header.append(heading, dismiss);
    const option = node("label", "cc98-topic-archive-option"), includeFiles = node("input"); includeFiles.type = "checkbox";
    includeFiles.checked = updateSnapshot ? updateSnapshot.includeFiles : job?.topicId === String(info.topicId) && job.includeFiles;
    option.append(includeFiles, document.createTextNode("同时保存音视频和附件"));
    option.hidden = Boolean(updateSnapshot);
    const refreshOption = node("label", "cc98-topic-archive-option"), refreshExisting = node("input", "cc98-topic-archive-refresh"); refreshExisting.type = "checkbox";
    refreshOption.append(refreshExisting, document.createTextNode("复查已存页面")); refreshOption.hidden = !updateSnapshot;
    const startButton = node("button", "cc98-topic-archive-primary", "开始存档"); startButton.type = "button";
    startButton.onclick = () => start(info, includeFiles.checked, updateSnapshot, refreshExisting.checked);
    const stop = node("button", "", "取消存档"); stop.type = "button"; stop.onclick = () => cancel();
    const archive = node("button", "", "查看存档"); archive.type = "button"; archive.onclick = () => send("OPEN", { id: job?.baseId || job?.id }).catch(error => { if (view) { view.error.textContent = error.message; view.error.hidden = false; } });
    const actions = node("div", "cc98-topic-archive-actions"); actions.append(startButton, stop, archive);
    const status = node("p", "cc98-topic-archive-status"), error = node("p", "cc98-topic-archive-error"), progress = node("progress");
    status.setAttribute("role", "status"); error.setAttribute("role", "alert"); progress.setAttribute("aria-label", "存档页数进度");
    panel.append(header, node("p", "cc98-topic-archive-notice", updateSnapshot
      ? "补读末页、新页和缺失内容，复用已保存媒体。关闭此窗口可继续；取消或中断不会改动原备份。"
      : "将逐页重新读取当前账号可见内容，需要等待一段时间。关闭此窗口可继续；离开帖子或关闭侧窗会停止。"), option, refreshOption, actions, status, progress, error);
    layer.append(panel);
    view = { layer, panel, info: { ...info, topicId: String(info.topicId) }, trigger, updateSnapshot, refreshExisting, includeFiles, start: startButton, stop, open: archive, status, progress, error };
    layer.onclick = event => { if (event.target === layer) close(); };
    view.keydown = event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll("button,input")].filter(item => !item.disabled && !item.closest("[hidden]"));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", view.keydown, true); document.body.append(layer); render(); dismiss.focus({ preventScroll: true });
  }
  addEventListener("pagehide", () => { cancel(); close(); });
  let updateLinkTimer, handledUpdateLink = "";
  function openUpdateLink() {
    clearTimeout(updateLinkTimer);
    const match = location.hash.match(/^#cc98-reborn-update-archive=([a-z0-9-]{12,80})$/i);
    if (!match || window.top !== window) { handledUpdateLink = ""; return; }
    if (handledUpdateLink === match[0]) return;
    const target = match[1], deadline = Date.now() + 30000;
    const ready = async () => {
      if (location.hash !== match[0]) return;
      let info, owner, initialized = false;
      try { info = getTopicPageInfo(); owner = scope(); initialized = Boolean(lastSettings) && Boolean(document.body) && document.readyState !== "loading"; } catch {}
      if (!initialized || !info || !owner || owner.endsWith(":guest")) {
        if (Date.now() < deadline) updateLinkTimer = setTimeout(ready, 200);
        else if (typeof showRebuiltTransientToast === "function") showRebuiltTransientToast(null, "请登录保存这份备份的账号后重试");
        return;
      }
      try {
        const result = await send("UPDATE_INFO", { id: target, owner });
        if (location.hash !== match[0]) return;
        open(info, null, result.snapshot);
        handledUpdateLink = match[0];
      } catch (error) {
        if (typeof showRebuiltTransientToast === "function") showRebuiltTransientToast(null, error.message);
      }
    };
    updateLinkTimer = setTimeout(ready, 0);
  }
  addEventListener("hashchange", openUpdateLink);
  addEventListener("pagehide", () => clearTimeout(updateLinkTimer));
  openUpdateLink();
  globalThis.CC98RebornTopicArchive = Object.freeze({ open, close });
})();
