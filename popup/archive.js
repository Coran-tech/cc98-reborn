(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const state = { items: [], current: null, pageNumbers: [], page: 0, epoch: 0, pool: null, settings: {}, stopTheme: null, exporting: false };
  const STATUS = { complete: "完整", partial: "部分保存", capturing: "存档中", cancelled: "已取消", error: "读取中断", interrupted: "读取中断" };
  const ALLOWED = new Set("p div span b strong i em u s del strike sub sup br hr h1 h2 h3 h4 h5 h6 blockquote pre code ul ol li table thead tbody tfoot tr td th caption figure figcaption details summary font a img video audio source".split(" "));
  const DROP = new Set("SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH TEMPLATE LINK META BASE NOSCRIPT INPUT TEXTAREA SELECT BUTTON".split(" "));
  const IMAGE_MIME = /^image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)$/i;
  const MEDIA_MIME = /^(?:audio|video)\/[a-z0-9.+-]+$/i;
  const FILE_MIME = /^(?:application\/(?:octet-stream|pdf|zip|x-zip-compressed|x-7z-compressed|x-rar-compressed|vnd\.rar|gzip|x-gzip|x-tar|rtf|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[a-z0-9.-]+)|text\/(?:plain|csv))$/i;
  const MAX_EXPORT_BYTES = 128 * 1024 * 1024;

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function button(text, action, className = "") {
    const el = node("button", className, text); el.type = "button"; el.addEventListener("click", action); return el;
  }
  function webUrl(value) {
    try { const url = new URL(String(value)); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; }
  }
  function errorMessage(error) { return error?.message || String(error || "操作失败，请重试"); }
  function showError(error) { $("#archive-error").textContent = error ? errorMessage(error) : ""; $("#archive-error").hidden = !error; }
  function status(text = "") { $("#archive-status").textContent = text; }
  function formatTime(value) { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString("zh-CN", { hour12: false }) : "时间未知"; }
  function formatBytes(value) { const n = Number(value) || 0; return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`; }
  function safeName(value) { return String(value || "帖子存档").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100); }
  function attachmentName(source, resource) {
    const generic = /^(?:下载(?:文件|附件)?|附件|文件|download(?: file)?)$/i;
    const explicit = source.getAttribute("download")?.trim(), label = source.textContent.trim();
    let pathName = "";
    try { const href = webUrl(resource); if (href) pathName = decodeURIComponent(new URL(href).pathname.split("/").pop() || ""); } catch {}
    let value = explicit && !generic.test(explicit) ? explicit : pathName && /\.[\w-]{1,12}$/.test(pathName) ? pathName : label && !generic.test(label) ? label : pathName || "附件";
    const extension = value.match(/\.[\w-]{1,12}$/)?.[0] || "";
    value = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    return value.length > 100 ? value.slice(0, 100 - extension.length) + extension : value;
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
  function inertMarkup(value) {
    // Chromium checks style attributes even while parsing an inert template.
    // Rename only attribute-name tokens before parsing; this is not a sanitizer.
    // The parsed source still goes through the DOM allowlist below.
    const html = String(value || ""), pieces = [], startTag = /<!--|<[a-z]/ig;
    let last = 0, match;
    while ((match = startTag.exec(html))) {
      const start = match.index;
      if (match[0] === "<!--") {
        const boundary = html.indexOf("-->", start + 4), end = boundary < 0 ? html.length : boundary + 3;
        pieces.push(html.slice(last, end)); last = end; startTag.lastIndex = end; continue;
      }
      let end = start + 1, quote = "";
      for (; end < html.length; end++) {
        const char = html[end];
        if (quote) { if (char === quote) quote = ""; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === ">") break;
      }
      if (end >= html.length) end = html.length - 1;
      const tag = html.slice(start, end + 1), edits = []; let i = 1, copied = 0;
      while (i < tag.length && !/[\s/>]/.test(tag[i])) i++;
      const rawTag = tag.slice(1, i).toLowerCase();
      if (["script", "style", "textarea", "title"].includes(rawTag)) {
        const closing = new RegExp(`</${rawTag}(?=[\\s/>])`, "ig"); closing.lastIndex = end + 1;
        const found = closing.exec(html); let boundary = found ? closing.lastIndex : html.length, closingQuote = "";
        for (; found && boundary < html.length; boundary++) {
          const char = html[boundary];
          if (closingQuote) { if (char === closingQuote) closingQuote = ""; }
          else if (char === '"' || char === "'") closingQuote = char;
          else if (char === ">") { boundary++; break; }
        }
        pieces.push(html.slice(last, start)); last = boundary; startTag.lastIndex = boundary; continue;
      }
      while (i < tag.length) {
        while (i < tag.length && /[\s/]/.test(tag[i])) i++;
        if (tag[i] === ">") break;
        const nameStart = i;
        while (i < tag.length && !/[\s=/>]/.test(tag[i])) i++;
        if (i === nameStart) { i++; continue; }
        if (tag.slice(nameStart, i).toLowerCase() === "style") { edits.push(tag.slice(copied, nameStart), "data-cc98-archive-style"); copied = i; }
        while (i < tag.length && /\s/.test(tag[i])) i++;
        if (tag[i] !== "=") continue;
        i++; while (i < tag.length && /\s/.test(tag[i])) i++;
        if (tag[i] === '"' || tag[i] === "'") { const boundary = tag[i++]; while (i < tag.length && tag[i] !== boundary) i++; i++; }
        else while (i < tag.length && !/[\s>]/.test(tag[i])) i++;
      }
      pieces.push(html.slice(last, start), ...edits, tag.slice(copied)); last = end + 1; startTag.lastIndex = last;
    }
    pieces.push(html.slice(last)); return pieces.join("");
  }
  function fontPresentation(source, target) {
    if (source.localName !== "font") return;
    const values = new Map();
    if (source.hasAttribute("color")) values.set("color", source.getAttribute("color"));
    if (source.hasAttribute("face")) values.set("font-family", source.getAttribute("face"));
    const size = Number(source.getAttribute("size")); if (Number.isInteger(size) && size >= 1 && size <= 7) values.set("font-size", [10, 13, 16, 18, 24, 32, 48][size - 1] + "px");
    for (const [property, value] of values) {
      let allowed = false;
      if (property === "color") allowed = /^(?:#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d\s.,%+\-/degturnrad]*\))$/i.test(value) && CSS.supports("color", value);
      if (property === "font-family") allowed = value.length <= 160 && /^[\p{L}\p{N}\s,'"_-]+$/u.test(value);
      if (property === "font-size") { const match = value.match(/^(\d+(?:\.\d+)?)(px|em|rem|%)$/); if (match) { const number = Number(match[1]); allowed = match[2] === "px" ? number >= 8 && number <= 48 : match[2] === "%" ? number >= 50 && number <= 300 : number >= .5 && number <= 3; } }
      if (allowed) target.style.setProperty(property, value);
    }
  }
  function request(type, data = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (result, error) => {
        if (settled) return; settled = true;
        if (error || !result?.ok) reject(new Error(error?.message || result?.error || "无法读取本地存档"));
        else resolve(result);
      };
      try {
        const returned = chrome.runtime.sendMessage({ type: "CC98_ARCHIVE_" + type, ...data }, result => done(result, chrome.runtime.lastError));
        if (returned?.then) returned.then(result => done(result), error => done(null, error));
      } catch (error) { done(null, error); }
    });
  }
  function decodeBase64(value) {
    const raw = atob(value), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
  function validMime(value) { return IMAGE_MIME.test(value) || MEDIA_MIME.test(value) || FILE_MIME.test(value); }
  function createAssetPool(id) {
    const cache = new Map(), urls = new Set(), pending = [];
    let active = 0, disposed = false;
    const aborted = () => new Error("页面已切换");
    const pump = () => {
      while (!disposed && active < 4 && pending.length) {
        const next = pending.shift(); active++;
        Promise.resolve().then(next.work).then(next.resolve, next.reject).finally(() => { active--; pump(); });
      }
    };
    const queued = work => new Promise((resolve, reject) => { pending.push({ work, resolve, reject }); pump(); });
    const read = async url => {
      const response = await request("ASSET", { id, url });
      if (disposed) throw aborted();
      const mime = String(response.mime || "").split(";")[0].trim().toLowerCase();
      if (!validMime(mime)) throw new Error("资源格式不支持离线显示");
      const parts = [];
      if (response.chunked) {
        const total = Number(response.bytes);
        if (!Number.isSafeInteger(total) || total < 0 || total > 100 * 1024 * 1024) throw new Error("资源大小无效");
        for (let offset = 0; offset < total;) {
          const part = await request("ASSET", { id, url, offset, length: Math.min(4 * 1024 * 1024, total - offset) });
          if (disposed) throw aborted();
          if (Number(part.offset) !== offset || part.mime?.split(";")[0].toLowerCase() !== mime) throw new Error("资源分段无效");
          const bytes = decodeBase64(part.base64 || "");
          if (!bytes.length || bytes.length > total - offset) throw new Error("资源分段不完整");
          parts.push(bytes); offset += bytes.length;
        }
      } else {
        const match = String(response.dataUrl || "").match(/^data:([^;,]+);base64,([a-z0-9+/=\r\n]*)$/i);
        if (!match || match[1].toLowerCase() !== mime) throw new Error("资源数据无效");
        parts.push(decodeBase64(match[2]));
      }
      if (disposed) throw aborted();
      const blob = new Blob(parts, { type: mime }), local = URL.createObjectURL(blob); urls.add(local);
      return { blob, local, mime, bytes: blob.size };
    };
    return {
      get(url) {
        if (disposed) return Promise.reject(aborted());
        if (!cache.has(url)) cache.set(url, queued(() => read(url)));
        return cache.get(url);
      },
      dispose() { disposed = true; for (const job of pending.splice(0)) job.reject(aborted()); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); cache.clear(); }
    };
  }
  function missing(label, url) {
    const box = node("span", "archive-resource-missing", label);
    const href = webUrl(url);
    if (href) { const link = node("a", "", "原链接"); link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; box.append(link); }
    return box;
  }
  function isEmoji(url, alt) { return /\/(?:static\/)?images\/(?:ac1?|CC98|tb|ms|em|mahjong)\//i.test(url) || /^\[(?:ac\d+|cc98\d+|tb\d+|ms\d+|em\d+|[acf]:\d+)\]$/i.test(alt); }
  function renderStoredFormula(source) {
    const isMath = source.localName.toLowerCase() === "math";
    const isKatex = source.classList.contains("katex") || source.classList.contains("katex-display");
    if (!isMath && !isKatex && !source.classList.contains("katex-error")) return null;
    const annotation = source.querySelector('annotation[encoding="application/x-tex"]');
    const tex = annotation?.textContent ?? (source.classList.contains("katex-error") ? source.textContent : null);
    if (tex === null) return null;
    const displayMode = source.classList.contains("katex-display") || (isMath && source.getAttribute("display") === "block");
    const formula = node("span", "archive-math" + (displayMode ? " archive-math-block" : ""));
    try {
      if (!globalThis.katex || tex.length > 10000) throw new Error("公式仅显示源码");
      // Discard all source markup. Only our bundled renderer creates MathML;
      // The trust callback denies every command needing HTML/resource access.
      // Native MathML keeps the exported HTML self-contained without font files.
      let denied = false;
      const markup = globalThis.katex.renderToString(tex, { output: "mathml", displayMode, trust: () => { denied = true; return false; }, throwOnError: true, strict: "ignore", maxExpand: 1000, maxSize: 100 });
      if (denied) throw new Error("公式仅显示源码");
      const template = document.createElement("template"); template.innerHTML = inertMarkup(markup);
      // Chromium does not reliably lay out MathML enclosure/boxed padding.
      // Keep its full TeX instead of displaying a misleading box.
      if (template.content.querySelector("menclose, mpadded[data-cc98-archive-style]")) throw new Error("公式仅显示源码");
      // These style values are generated by bundled KaTeX, not copied from posts.
      for (const el of template.content.querySelectorAll("[data-cc98-archive-style]")) {
        const css = el.getAttribute("data-cc98-archive-style"); el.removeAttribute("data-cc98-archive-style");
        for (const declaration of css.split(";")) {
          const colon = declaration.indexOf(":"); if (colon < 0) continue;
          const property = declaration.slice(0, colon).trim(), value = declaration.slice(colon + 1).trim();
          if (["text-shadow", "border"].includes(property) && !/url\s*\(|expression\s*\(|var\s*\(/i.test(value)) el.style.setProperty(property, value);
        }
      }
      formula.append(template.content);
    } catch {
      formula.replaceChildren(node("code", "archive-math-fallback", `${displayMode ? "\\[" : "\\("}${tex}${displayMode ? "\\]" : "\\)"}`));
    }
    return formula;
  }
  function readStoredAwards(source) {
    if (!source.matches(".awardInfo, .cc98-rebuild-awards")) return null;
    const nativeRows = [...source.querySelectorAll(".tagSize")];
    const rows = source.matches(".cc98-rebuild-awards")
      ? [...source.querySelectorAll("tbody > tr")].map(row => ({ row, user: row.children[0], operation: row.children[1], reason: row.children[2] }))
      : (nativeRows.length ? nativeRows : [...source.children].filter(row => row.matches(".good, .bad")))
        .map(row => ({ row, user: row.querySelector(".userName"), operation: row.querySelector(".grades"), reason: row.querySelector(".credit") }));
    const text = item => item?.textContent?.replace(/\s+/g, " ").trim() || "";
    const records = rows.filter(row => [row.user, row.operation, row.reason].some(item => text(item))
      && !(text(row.user) === "用户" && text(row.operation) === "操作" && text(row.reason) === "理由"));
    return records.length ? { records, text, partial: /显示全部/.test(source.textContent || "") } : null;
  }
  function safeHtml(html, pool, jobs, exporting = false) {
    // Template contents are inert. Only newly created allowlisted elements are
    // ever attached to the extension page; source URLs/styles never reach DOM.
    const template = document.createElement("template"); template.innerHTML = inertMarkup(html);
    let count = 0;
    const walk = (source, depth = 0) => {
      if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.nodeValue);
      if (!(source instanceof Element)) return document.createDocumentFragment();
      if (++count > 40000 || depth > 120) return node("span", "archive-resource-missing", "内容层级过深，未显示此部分");
      const formula = renderStoredFormula(source); if (formula) return formula;
      if (DROP.has(source.tagName.toUpperCase())) return document.createDocumentFragment();
      const awards = readStoredAwards(source);
      if (awards) {
        const section = node("section", "archive-awards"), heading = node("div", "archive-awards-heading", "评分记录");
        const reputation = awards.records.map(row => awards.text(row.operation)).filter(text => text.includes("风评值"));
        if (reputation.length && !awards.partial) {
          const total = reputation.reduce((sum, text) => sum + (Number(text.match(/[+-]?\s*\d+/)?.[0]?.replace(/\s/g, "")) || 0), 0);
          heading.append(node("span", "archive-awards-total " + (total > 0 ? "archive-award-positive" : total < 0 ? "archive-award-negative" : ""), total > 0 ? `+${total}` : String(total)));
        }
        if (awards.partial) heading.append(node("span", "archive-muted", `已保存 ${awards.records.length} 条`));
        const table = node("table", "archive-awards-table"), thead = node("thead"), header = node("tr"), tbody = node("tbody");
        for (const label of ["用户", "操作", "理由"]) { const th = node("th", "", label); th.scope = "col"; header.append(th); }
        thead.append(header);
        for (const row of awards.records) {
          const tr = node("tr"), userCell = node("td"), user = node("span", "archive-award-user");
          const avatar = [...row.row.querySelectorAll("img")].find(image => !row.operation?.contains(image) && !row.reason?.contains(image));
          if (avatar) { const image = node("span", "archive-award-avatar"); image.append(walk(avatar, depth + 1)); user.append(image); }
          const sourceLink = row.user?.matches("a") ? row.user : row.user?.querySelector("a[href]");
          const href = webUrl(sourceLink?.getAttribute("href"));
          const name = node(href ? "a" : "span", "", awards.text(row.user) || "-");
          if (href) { name.href = href; name.target = "_blank"; name.rel = "noopener noreferrer"; }
          user.append(name); userCell.append(user);
          const operation = awards.text(row.operation), sign = /-\s*\d/.test(operation) ? "archive-award-negative" : /\+\s*\d/.test(operation) ? "archive-award-positive" : "";
          const reason = node("td", "archive-award-reason");
          if (row.reason) for (const child of row.reason.childNodes) reason.append(walk(child, depth + 1));
          else reason.textContent = "-";
          tr.append(userCell, node("td", sign, operation || "-"), reason); tbody.append(tr);
        }
        table.append(thead, tbody); section.append(heading, table); return section;
      }
      const tag = source.localName.toLowerCase();
      const resource = source.getAttribute("data-cc98-archive-resource") || "";
      if (tag === "img") {
        const url = resource || source.getAttribute("src") || source.getAttribute("data-src") || "";
        const image = node("img", isEmoji(url, source.getAttribute("alt") || "") ? "archive-emoji" : "");
        image.alt = source.getAttribute("alt") || "存档图片"; image.loading = "lazy"; image.decoding = "async";
        const slot = node("span", "archive-image-slot"); slot.append(missing("图片读取中", ""));
        jobs.push(pool.get(url).then(asset => {
          if (!IMAGE_MIME.test(asset.mime)) throw new Error("不是图片");
          image.src = asset.local; slot.replaceChildren(image);
          if (exporting) image.dataset.archiveExportUrl = url;
        }).catch(() => slot.replaceChildren(missing("图片未保存", url))));
        return slot;
      }
      if (tag === "video" || tag === "audio") {
        const url = resource || source.querySelector("source[data-cc98-archive-resource]")?.getAttribute("data-cc98-archive-resource") || "";
        if (!url) return missing("媒体仅保留链接", source.getAttribute("src") || "");
        const media = node(tag); media.controls = true; media.preload = "none";
        const slot = node("div"); slot.append(missing("媒体读取中", ""));
        jobs.push(pool.get(url).then(asset => {
          if (!MEDIA_MIME.test(asset.mime)) throw new Error("不是音视频");
          media.src = asset.local; slot.replaceChildren(media);
          if (exporting) media.dataset.archiveExportUrl = url;
        }).catch(() => slot.replaceChildren(missing("媒体未保存", url))));
        const poster = source.getAttribute("data-cc98-archive-poster");
        if (poster && tag === "video") jobs.push(pool.get(poster).then(asset => {
          if (IMAGE_MIME.test(asset.mime)) { media.poster = asset.local; if (exporting) media.dataset.archiveExportPoster = poster; }
        }).catch(() => {}));
        return slot;
      }
      if (tag === "source") return document.createDocumentFragment();
      if (tag === "a" && resource) {
        const filename = attachmentName(source, resource), label = source.textContent.trim();
        const name = !label || /^(?:下载(?:文件|附件)?|附件|文件|download(?: file)?)$/i.test(label) ? filename : label;
        const holder = node("span");
        const load = async () => {
          const asset = await pool.get(resource);
          const link = node("a", "archive-file", name); link.href = asset.local; link.download = filename;
          if (exporting) link.dataset.archiveExportUrl = resource;
          holder.replaceChildren(link); return link;
        };
        if (exporting) { holder.append(node("span", "", name)); jobs.push(load().catch(() => holder.replaceChildren(missing("附件未保存", resource)))); }
        else {
          const control = button(name, async () => {
            control.disabled = true;
            try { const link = await load(); link.click(); } catch { holder.replaceChildren(missing("附件未保存", resource)); }
          }); holder.append(control);
        }
        return holder;
      }
      const out = ALLOWED.has(tag) ? node(tag === "font" ? "span" : tag) : document.createDocumentFragment();
      if (out instanceof Element) {
        if (tag === "a") {
          const href = webUrl(source.getAttribute("href"));
          if (href) { out.href = href; out.target = "_blank"; out.rel = "noopener noreferrer"; }
        }
        if (tag === "div" && /(?:quote|引用)/i.test(source.className)) out.className = "archive-quote";
        if (tag === "td" || tag === "th") for (const attr of ["colspan", "rowspan"]) {
          const value = Number(source.getAttribute(attr)); if (Number.isInteger(value) && value > 1 && value <= 100) out.setAttribute(attr, value);
        }
        if (tag === "ol") { const value = Number(source.getAttribute("start")); if (Number.isSafeInteger(value) && value > 0 && value < 100000) out.start = value; }
        if (source.hasAttribute("title")) out.title = source.getAttribute("title").slice(0, 500);
        fontPresentation(source, out);
      }
      for (const child of source.childNodes) out.append(walk(child, depth + 1));
      return out;
    };
    const result = document.createDocumentFragment();
    for (const child of template.content.childNodes) result.append(walk(child));
    return result;
  }
  function renderRecord(record, pool, jobs, exporting = false) {
    const article = node("article", "archive-post"); article.dataset.floor = String(record.floor || "");
    const header = node("header", "archive-post-header");
    if (record.avatar) {
      const avatar = node("img", "archive-avatar"); avatar.alt = "";
      jobs.push(pool.get(record.avatar).then(asset => {
        if (!IMAGE_MIME.test(asset.mime)) return;
        avatar.src = asset.local; header.prepend(avatar);
        if (exporting) avatar.dataset.archiveExportUrl = record.avatar;
      }).catch(() => {}));
    }
    const identity = node("div"); identity.append(node("div", "archive-post-author", record.user || "CC98 用户"), node("div", "archive-post-floor", `#${record.floor}${record.uid ? ` · UID ${record.uid}` : ""}`));
    header.append(identity); article.append(header);
    for (const [field, cls] of [["contentHtml", "archive-content"], ["extraHtml", "archive-content archive-extra"], ["signatureHtml", "archive-content archive-signature"]]) {
      if (!record[field]) continue;
      const section = node("div", cls); section.append(safeHtml(record[field], pool, jobs, exporting)); article.append(section);
    }
    if (record.publishedAt) article.append(node("footer", "archive-post-time", `发表于 ${record.publishedAt}`));
    return article;
  }
  function snapshotMeta(item) {
    const range = formatTime(item.startedAt) + (item.completedAt && item.completedAt !== item.startedAt ? " — " + formatTime(item.completedAt) : "");
    return `${STATUS[item.status] || "部分保存"} · ${range} · ${Number(item.recordCount) || 0} 楼 · ${formatBytes(item.bytes)}`;
  }
  function renderList() {
    const query = $("#archive-search").value.trim().toLocaleLowerCase();
    const visible = state.items.filter(item => `${item.title} ${item.topicId}`.toLocaleLowerCase().includes(query));
    $("#archive-count").textContent = `${visible.length} 份存档`;
    const list = $("#archive-list"); list.replaceChildren();
    for (const item of visible) {
      const row = node("article", "archive-row"), main = node("div", "archive-row-main"), actions = node("div", "archive-row-actions");
      const title = node("a", "archive-row-title", item.title || `帖子 ${item.topicId}`); title.href = "#" + encodeURIComponent(item.id);
      const meta = node("div", "archive-row-meta archive-muted"), badge = node("span", "archive-badge", STATUS[item.status] || "部分保存"); badge.dataset.status = item.status;
      meta.append(badge, node("span", "", formatTime(item.startedAt)), node("span", "", `${Number(item.recordCount) || 0} 楼`), node("span", "", formatBytes(item.bytes)));
      main.append(title, meta);
      actions.append(button("查看", () => { location.hash = item.id; }), button("删除", () => remove(item), "archive-danger"));
      row.append(main, actions); list.append(row);
    }
    if (!visible.length) list.append(node("p", "archive-empty", query ? "没有匹配的存档" : "暂无本地存档"));
  }
  async function loadList() {
    const response = await request("LIST"); state.items = response.items || []; renderList();
  }
  function disposePage() {
    $("#archive-image-dialog").close(); $("#archive-large-image").removeAttribute("src");
    state.pool?.dispose(); state.pool = null; $("#archive-posts").replaceChildren();
  }
  async function remove(item) {
    if (!confirm(`删除“${item.title || `帖子 ${item.topicId}`}”的这份本地存档？`)) return;
    try {
      await request("DELETE", { id: item.id });
      if (state.current?.id === item.id) { state.epoch++; disposePage(); state.current = null; location.hash = ""; }
      await loadList(); status("存档已删除");
    } catch (error) { showError(error); }
  }
  function showFailures(snapshot) {
    const failures = [...(snapshot.failures || [])];
    if (snapshot.error && !failures.some(item => item.error === snapshot.error)) failures.unshift({ error: snapshot.error });
    const box = $("#archive-failures"); box.hidden = !failures.length;
    $("#archive-failure-summary").textContent = `未保存内容 · ${failures.length} 项`;
    const list = $("#archive-failure-list"); list.replaceChildren();
    for (const item of failures) list.append(node("li", "", [item.page ? `第 ${item.page} 页` : "", item.url || "", item.error || "读取失败"].filter(Boolean).join(" · ")));
  }
  function pageWindow(pages, currentIndex) {
    if (!pages.length) return [];
    const index = Math.max(0, currentIndex), indexes = new Set([0, pages.length - 1]);
    for (let i = Math.max(0, index - 2); i <= Math.min(pages.length - 1, index + 2); i++) indexes.add(i);
    const result = []; let previous = -1;
    for (const i of [...indexes].sort((a, b) => a - b)) {
      if (previous >= 0 && i > previous + 1) result.push(null);
      result.push(pages[i]); previous = i;
    }
    return result;
  }
  function pageEllipsis() { const el = node("span", "archive-page-ellipsis", "…"); el.setAttribute("aria-hidden", "true"); return el; }
  function renderPagination(pending = false) {
    for (const id of ["archive-pagination", "archive-pagination-bottom"]) {
      const nav = $("#" + id); nav.replaceChildren(); nav.hidden = !state.pageNumbers.length;
      if (nav.hidden) continue;
      const index = state.pageNumbers.indexOf(state.page), numbers = node("div", "archive-page-numbers");
      const prev = button("上一页", () => showPage(state.pageNumbers[index - 1], true)); prev.dataset.pageStep = "-1"; prev.disabled = pending || index <= 0;
      const next = button("下一页", () => showPage(state.pageNumbers[index + 1], true)); next.dataset.pageStep = "1"; next.disabled = pending || index >= state.pageNumbers.length - 1;
      for (const page of pageWindow(state.pageNumbers, index)) {
        if (page === null) { numbers.append(pageEllipsis()); continue; }
        const control = button(String(page), () => showPage(page, true), "archive-page-number");
        control.dataset.page = String(page); control.setAttribute("aria-label", `第 ${page} 页`); control.disabled = pending;
        if (page === state.page) control.setAttribute("aria-current", "page"); numbers.append(control);
      }
      const jump = node("div", "archive-page-jump"), input = node("input");
      input.type = "number"; input.min = "1"; input.step = "1"; input.value = state.page > 0 ? String(state.page) : ""; input.inputMode = "numeric";
      input.dataset.pageJump = ""; input.setAttribute("aria-label", "跳转页码"); input.disabled = pending;
      const feedback = node("span", "archive-page-feedback"); feedback.setAttribute("role", "status");
      const go = () => {
        const page = Number(input.value);
        if (!Number.isInteger(page) || page <= 0) { feedback.textContent = "请输入页码"; return; }
        if (!state.pageNumbers.includes(page)) { feedback.textContent = `第 ${page} 页未保存`; return; }
        showPage(page, true);
      };
      const submit = button("跳转", go); submit.disabled = pending;
      input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); go(); } });
      jump.append(input, submit);
      const total = Number(state.current?.expectedPages) || state.pageNumbers.length;
      nav.append(prev, numbers, next, node("span", "archive-muted archive-page-total", `已存 ${state.pageNumbers.length} / ${total} 页`), jump, feedback);
      // Keep the active page reachable in long saved-page lists without moving the document.
      requestAnimationFrame(() => { const current = numbers.querySelector('[aria-current="page"]'); if (current) numbers.scrollLeft = Math.max(0, current.offsetLeft - numbers.offsetLeft - numbers.clientWidth / 2); });
    }
  }
  async function showPage(page, scroll = false) {
    const id = state.current?.id; if (!id) return;
    if (!state.pageNumbers.includes(page)) { showError(`第 ${page} 页未保存`); return; }
    const epoch = ++state.epoch; disposePage(); showError(null); status("正在读取存档…");
    renderPagination(true);
    try {
      const response = await request("GET", { id, page });
      if (epoch !== state.epoch) return;
      state.page = page; renderPagination();
      const pool = createAssetPool(id); state.pool = pool;
      const jobs = [], rows = response.pages?.[0]?.records || [];
      for (const record of rows) $("#archive-posts").append(renderRecord(record, pool, jobs));
      if (!rows.length) $("#archive-posts").append(node("p", "archive-empty", "此页未保存楼层"));
      if (scroll) $("#archive-pagination").scrollIntoView({ block: "start" });
      status(""); await Promise.all(jobs);
    } catch (error) { if (epoch === state.epoch) { status(""); showError(error); renderPagination(); } }
  }
  async function navigate() {
    const epoch = ++state.epoch; disposePage(); showError(null); status("");
    state.current = null; state.pageNumbers = []; state.page = 0;
    $("#archive-title").textContent = ""; $("#archive-meta").textContent = "";
    $("#archive-source").hidden = true; $("#archive-source").removeAttribute("href");
    renderPagination(); $("#archive-failures").hidden = true;
    $("#archive-export").disabled = true; $("#archive-delete").disabled = true;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { id = ""; }
    $("#archive-library").hidden = Boolean(id); $("#archive-detail").hidden = !id;
    if (!id) { state.current = null; await loadList().catch(showError); return; }
    status("正在读取存档…");
    try {
      const response = await request("GET", { id });
      if (epoch !== state.epoch) return;
      state.current = response.snapshot; state.pageNumbers = [...new Set((response.pageNumbers || []).filter(page => Number.isSafeInteger(page) && page > 0))].sort((a, b) => a - b);
      $("#archive-delete").disabled = false;
      $("#archive-title").textContent = state.current.title || `帖子 ${state.current.topicId}`;
      $("#archive-meta").textContent = snapshotMeta(state.current); showFailures(state.current);
      const href = webUrl(state.current.url); $("#archive-source").hidden = !href;
      if (href) $("#archive-source").href = href; else $("#archive-source").removeAttribute("href");
      $("#archive-export").disabled = state.exporting || !state.pageNumbers.length;
      if (state.pageNumbers.length) await showPage(state.pageNumbers[0]);
      else { status(""); $("#archive-posts").append(node("p", "archive-empty", "尚无已保存的页面")); }
    } catch (error) { if (epoch === state.epoch) { status(""); showError(error); } }
  }
  function blobDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("无法导出资源")); reader.readAsDataURL(blob); }); }
  function exportPagination(pages, current, index) {
    const nav = node("nav", "archive-pagination archive-export-pagination"); nav.setAttribute("aria-label", "存档页码");
    const numbers = node("div", "archive-page-numbers");
    for (const page of pageWindow(pages, index)) {
      if (page === null) { numbers.append(pageEllipsis()); continue; }
      const link = node("a", "archive-page-number", String(page)); link.href = `#archive-page-${page}`; link.setAttribute("aria-label", `第 ${page} 页`);
      if (page === current) link.setAttribute("aria-current", "page"); numbers.append(link);
    }
    for (const [offset, label] of [[-1, "上一页"], [1, "下一页"]]) {
      const page = pages[index + offset];
      if (offset === 1) nav.append(numbers);
      if (page) { const link = node("a", "", label); link.href = `#archive-page-${page}`; nav.append(link); }
    }
    return nav;
  }
  async function exportSnapshot() {
    if (!state.current || state.exporting) return;
    const snapshot = state.current, pages = [...state.pageNumbers];
    if (Number(snapshot.bytes) > MAX_EXPORT_BYTES) { showError("这份存档超过 128 MB，请在本地存档中查看；暂不支持单文件导出。"); return; }
    state.exporting = true; $("#archive-export").disabled = true; showError(null);
    const pool = createAssetPool(snapshot.id);
    try {
      const main = node("main", "archive-shell"); main.append(node("h1", "", snapshot.title || `帖子 ${snapshot.topicId}`), node("p", "archive-muted", snapshotMeta(snapshot)));
      const href = webUrl(snapshot.url); if (href) { const link = node("a", "", "原帖"); link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; main.append(link); }
      if (snapshot.failures?.length) main.append(node("p", "archive-error", `部分内容未保存：${snapshot.failures.length} 项`));
      const exported = new Map();
      for (const [pageIndex, page] of pages.entries()) {
        status(`正在导出 · 第 ${page} 页`);
        const response = await request("GET", { id: snapshot.id, page });
        const section = node("section", "archive-export-page"), posts = node("div", "archive-posts"), jobs = [];
        section.id = `archive-page-${page}`;
        section.append(node("h2", "", `第 ${page} 页`));
        section.append(exportPagination(pages, page, pageIndex), posts);
        for (const record of response.pages?.[0]?.records || []) posts.append(renderRecord(record, pool, jobs, true));
        await Promise.all(jobs);
        for (const el of section.querySelectorAll("[data-archive-export-url], [data-archive-export-poster]")) {
          for (const [attribute, target] of [["data-archive-export-url", el.localName === "a" ? "href" : "src"], ["data-archive-export-poster", "poster"]]) {
            const url = el.getAttribute(attribute); if (!url) continue;
            if (!exported.has(url)) exported.set(url, pool.get(url).then(asset => blobDataUrl(asset.blob)));
            el.setAttribute(target, await exported.get(url)); el.removeAttribute(attribute);
          }
        }
        section.append(exportPagination(pages, page, pageIndex)); main.append(section);
      }
      // Export only our own stylesheet, never stored post CSS or scripts.
      let css = "";
      for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) css += rule.cssText + "\n";
      // Serialize the standalone file without creating an inline <style> in a
      // document that inherits the extension's stricter style-src 'self' policy.
      const attributes = ['lang="zh-CN"', 'class="cc98-reborn-popup"'];
      for (const [key, value] of Object.entries(document.documentElement.dataset)) if (key.startsWith("cc98Comfort")) attributes.push(`data-${key.replace(/[A-Z]/g, char => "-" + char.toLowerCase())}="${escapeHtml(value)}"`);
      const computed = getComputedStyle(document.documentElement);
      const variables = ["--cc98-comfort-accent", "--cc98-comfort-accent-2", "--cc98-comfort-secondary", "--cc98-comfort-secondary-soft", "--cc98-comfort-link", "--emoji-size"].map(name => `${name}:${computed.getPropertyValue(name)}`).join(";");
      attributes.push(`style="${escapeHtml(variables)}"`);
      const policy = "default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
      const html = `<!doctype html>\n<html ${attributes.join(" ")}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(snapshot.title || "帖子存档")}</title><style>${css.replace(/<\/style/gi, "<\\/style")}</style></head><body>${main.outerHTML}</body></html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      if (blob.size > MAX_EXPORT_BYTES * 1.5) throw new Error("单文件过大，请在本地存档中查看。");
      const url = URL.createObjectURL(blob), link = node("a"); link.href = url; link.download = `${safeName(snapshot.title)}-${snapshot.topicId}-${snapshot.id.slice(0, 8)}.html`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); status("已导出 HTML");
    } catch (error) { status(""); showError(error); }
    finally { pool.dispose(); state.exporting = false; $("#archive-export").disabled = !state.pageNumbers.length; }
  }
  function applyTheme() {
    globalThis.CC98RebornThemeCore?.apply(document.documentElement, state.settings);
    document.documentElement.style.setProperty("--emoji-size", `${1.75 * Math.max(50, Math.min(400, Number(state.settings.emojiScale) || 140)) / 100}em`);
  }
  $("#archive-search").addEventListener("input", renderList);
  $("#archive-back").addEventListener("click", () => { location.hash = ""; });
  $("#archive-refresh").addEventListener("click", navigate);
  $("#archive-delete").addEventListener("click", () => state.current && remove(state.current));
  $("#archive-export").addEventListener("click", exportSnapshot);
  $("#archive-image-close").addEventListener("click", () => $("#archive-image-dialog").close());
  $("#archive-image-dialog").addEventListener("close", () => { $("#archive-large-image").removeAttribute("src"); });
  $("#archive-posts").addEventListener("click", event => {
    const image = event.target.closest("img"); if (!image || !image.src.startsWith("blob:")) return;
    event.preventDefault(); event.stopPropagation();
    $("#archive-large-image").src = image.src; $("#archive-large-image").alt = image.alt;
    const link = webUrl(image.closest("a")?.href); $("#archive-image-link").hidden = !link;
    if (link) $("#archive-image-link").href = link;
    $("#archive-image-dialog").showModal();
  });
  addEventListener("hashchange", navigate);
  addEventListener("pagehide", () => { state.epoch++; disposePage(); state.stopTheme?.(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.cc98ComfortSettings) { state.settings = changes.cc98ComfortSettings.newValue || {}; applyTheme(); }
  });
  chrome.storage.local.get("cc98ComfortSettings", result => {
    state.settings = result?.cc98ComfortSettings || {}; applyTheme();
    state.stopTheme = globalThis.CC98RebornThemeCore?.watch(() => state.settings, applyTheme);
  });
  navigate();
})();
