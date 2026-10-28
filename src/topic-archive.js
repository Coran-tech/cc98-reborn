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
    if (!result?.ok) throw new Error(result?.error || "本地存档未能完成，请重试");
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
    const root = template.content;
    root.querySelectorAll("script, style, link, meta, base, object, embed, form, input, textarea, select, button").forEach(item => item.remove());
    for (const frame of root.querySelectorAll("iframe")) {
      const href = url(frame.getAttribute("src"), base), link = node("a", "", "外部媒体（原链接）");
      if (href) link.href = href;
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
      const file = link.hasAttribute("download") || /download/i.test(link.className)
        || /\.(?:pdf|zip|rar|7z|docx?|xlsx?|pptx?|txt|csv|md|markdown|html?|mp[34]|webm|ogg|flac|wav)(?:[?#]|$)/i.test(href)
        || /\/(?:download|v4-upload)\//i.test(href) && !isImageUrl(href) && !link.querySelector("img");
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
    const task = job?.topicId === view.info.topicId ? job : null, running = Boolean(task?.running);
    view.includeFiles.disabled = running;
    view.start.disabled = running;
    view.start.textContent = task && !running ? "再次存档" : "开始存档";
    view.stop.hidden = !running;
    view.open.hidden = !task?.id;
    view.progress.hidden = !task;
    if (task) { view.progress.max = task.maxPage; view.progress.value = task.pages; }
    view.status.textContent = !task ? ""
      : `${running ? task.downloading ? "正在保存媒体" : "正在读取" : task.status === "complete" ? "存档完成" : task.status === "cancelled" ? "已取消，已保存内容保留" : "部分内容已保存"} · ${task.pages}/${task.maxPage} 页 · ${task.assets} 个资源`;
    view.error.textContent = task?.error || (task?.failures.length ? `${task.failures.length} 项未能保存，可在存档详情中查看。` : "");
    view.error.hidden = !view.error.textContent;
  }
  function cancel(task = job) {
    if (!task?.running) return;
    task.cancelled = true;
    task.reader?.dispose(); task.reader = null;
    if (task.id) send("ABORT", { id: task.id }).catch(() => {});
  }
  async function start(info, includeFiles) {
    if (job?.running) return;
    const task = job = { topicId: String(info.topicId), scope: scope(), includeFiles, pages: 0, maxPage: 1, assets: 0,
      failures: [], resourceURLs: new Set(), running: true, cancelled: false, id: null, error: "", status: "capturing" };
    render();
    let guard;
    try {
      const begin = await send("BEGIN", { meta: { topicId: task.topicId, title: getPageTitle(), url: new URL(buildTopicPageHref(task.topicId, 1), location.href).href,
        owner: task.scope, startedAt: Date.now(), includeFiles } });
      task.id = begin.id;
      if (!valid(task)) throw new DOMException("存档已停止", "AbortError");
      task.reader = CC98RebornConversation.createReader(info, { archive: true });
      guard = setInterval(() => { if (!valid(task)) cancel(task); }, 500);
      // Follow newly discovered pagination as the existing shared scanner does.
      // Each page is read once; completion does not poll for later replies.
      for (let page = 1; page <= task.maxPage; page++) {
        if (!valid(task)) throw new DOMException("存档已停止", "AbortError");
        try {
          const result = await task.reader.read(page);
          if (!valid(task)) throw new DOMException("存档已停止", "AbortError");
          task.maxPage = Math.max(task.maxPage, result.maxPage || 1);
          if (!result.records.length || result.records.some(record => String(record.topicId) !== task.topicId || Math.ceil(record.floor / 10) !== page)) throw new Error("返回的楼层与请求页不一致");
          const prepared = preparePage(result, page, task);
          await send("PAGE", { id: task.id, page, result: prepared.result, capturedAt: Date.now() });
          task.pages++;
          task.failures.push(...prepared.failures);
          if (result.incompleteMedia) task.failures.push({ page, error: `${result.incompleteMedia} 个媒体占位未能展开` });
          if (result.incompleteQuotes) task.failures.push({ page, error: `${result.incompleteQuotes} 处引用未能展开` });
          task.downloading = true; render();
          const queue = [...prepared.resources].filter(([source]) => !task.resourceURLs.has(source));
          queue.forEach(([source]) => task.resourceURLs.add(source));
          let index = 0;
          await Promise.all([0, 1].map(async () => {
            while (index < queue.length && valid(task)) {
              const [source, kind] = queue[index++];
              try { await send("RESOURCE", { id: task.id, url: source, kind }); task.assets++; }
              catch (error) { if (valid(task)) task.failures.push({ page, url: source, error: error.message }); }
              render();
            }
          }));
          task.downloading = false; render();
        } catch (error) {
          if (!valid(task) || error.name === "AbortError") throw error;
          task.failures.push({ page, error: error.message || "读取失败" });
          if (page === 1) { task.error = "第一页读取失败，无法确认全帖范围。"; break; }
        }
      }
      if (!valid(task)) throw new DOMException("存档已停止", "AbortError");
      task.status = task.failures.length || task.pages !== task.maxPage ? "partial" : "complete";
    } catch (error) {
      task.status = task.cancelled || error.name === "AbortError" ? "cancelled" : "error";
      task.error = task.status === "cancelled" ? "" : error.message;
    } finally {
      clearInterval(guard);
      task.reader?.dispose(); task.reader = null;
      if (task.id) {
        try {
          const result = await send("FINISH", { id: task.id, status: task.status, expectedPages: task.maxPage, error: task.error, failures: task.failures });
          if (result.snapshot) { task.status = result.snapshot.status; task.error = result.snapshot.error || task.error; task.failures = result.snapshot.failures || task.failures; }
        }
        catch (error) { task.status = "error"; task.error = error.message; }
      }
      task.running = false; render();
      if (!view && task.status === "complete") showRebuiltTransientToast(null, "本帖快照已保存到本地存档");
    }
  }
  function close() {
    if (!view) return;
    const previous = view; view = null;
    document.removeEventListener("keydown", previous.keydown, true);
    previous.layer.remove(); previous.trigger?.focus({ preventScroll: true });
  }
  function open(info, trigger) {
    close();
    const layer = node("div", "cc98-topic-archive-layer"), panel = node("section", "cc98-topic-archive-dialog");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-labelledby", "cc98-archive-title");
    const heading = node("h2", "", "存档本帖快照到本地"); heading.id = "cc98-archive-title";
    const dismiss = node("button", "", "关闭"); dismiss.type = "button"; dismiss.onclick = close;
    const header = node("header"); header.append(heading, dismiss);
    const option = node("label", "cc98-topic-archive-option"), includeFiles = node("input"); includeFiles.type = "checkbox";
    includeFiles.checked = job?.topicId === String(info.topicId) && job.includeFiles;
    option.append(includeFiles, document.createTextNode("同时保存音视频和附件"));
    const startButton = node("button", "cc98-topic-archive-primary", "开始存档"); startButton.type = "button";
    startButton.onclick = () => start(info, includeFiles.checked);
    const stop = node("button", "", "取消存档"); stop.type = "button"; stop.onclick = () => cancel();
    const archive = node("button", "", "查看存档"); archive.type = "button"; archive.onclick = () => send("OPEN", { id: job?.id }).catch(error => { if (view) { view.error.textContent = error.message; view.error.hidden = false; } });
    const actions = node("div", "cc98-topic-archive-actions"); actions.append(startButton, stop, archive);
    const status = node("p", "cc98-topic-archive-status"), error = node("p", "cc98-topic-archive-error"), progress = node("progress");
    status.setAttribute("role", "status"); error.setAttribute("role", "alert"); progress.setAttribute("aria-label", "存档页数进度");
    panel.append(header, node("p", "cc98-topic-archive-notice", "将逐页重新读取当前账号可见内容，需要等待一段时间。关闭此窗口可继续；离开帖子或关闭侧窗会停止。"), option, actions, status, progress, error);
    layer.append(panel);
    view = { layer, panel, info: { ...info, topicId: String(info.topicId) }, trigger, includeFiles, start: startButton, stop, open: archive, status, progress, error };
    layer.onclick = event => { if (event.target === layer) close(); };
    view.keydown = event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll("button,input")].filter(item => !item.disabled && !item.hidden);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", view.keydown, true); document.body.append(layer); render(); dismiss.focus({ preventScroll: true });
  }
  addEventListener("pagehide", () => { cancel(); close(); });
  globalThis.CC98RebornTopicArchive = Object.freeze({ open, close });
})();
