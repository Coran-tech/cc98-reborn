(() => {
  "use strict";

  const EXTENDED_UBB_TOUR_STORAGE_KEY = "cc98RebornExtendedUbbTour:v1";
  const EXTENDED_UBB_TOUR_VERSION = "0.3.4";
  const EXTENDED_UBB_TOUR_AUTO_ENABLED = false;
  const emotionPattern = /^\[(cc98\d{2}|ac(?:\d{2}|\d{4})|[acf]:\d{3}|tb\d{2}|ms\d{2}|em\d{2})\]/i;
  const openingTagPattern = /^\[(\/?)([a-z][a-z0-9-]*)(?:=([^\]]*))?\]/i;
  const extendedTagPattern = /\[(?:\/?(?:left|center|right|quote|md|line|code|font|table|tr|th|td|upload|replyview|needreply|posteronly|allowviewer|noubb|english|cursor|topic|board|pm|user|math|m)(?:=|\])|img=)/i;
  const pairedTags = new Set([
    "b", "i", "u", "s", "del", "url", "color", "size", "align",
    "left", "center", "right", "quote", "font", "table", "tr", "th", "td",
    "replyview", "english", "cursor", "topic", "board", "pm", "user"
  ]);
  const rawTags = new Set([
    "audio", "mp3", "video", "bili", "bilibili", "img", "upload",
    "code", "md", "noubb", "math", "m"
  ]);
  const emptyTags = new Set(["line", "needreply", "posteronly", "allowviewer"]);
  const localContainerTags = new Set([
    "left", "center", "right", "quote", "font", "table", "tr", "th", "td",
    "replyview", "english", "cursor", "topic", "board", "pm", "user"
  ]);

  const createElement = (tagName, className = "", text = "") => {
    const node = document.createElement(tagName);
    if (className) {
      node.className = className;
    }
    if (text !== "") {
      node.textContent = String(text);
    }
    return node;
  };

  function isTableStructureNode(node) {
    return node instanceof HTMLElement
      && ["TABLE", "THEAD", "TBODY", "TFOOT", "TR"].includes(node.tagName);
  }

  function appendText(parent, value) {
    const source = String(value || "").replace(/\r\n?/g, "\n");
    // Newlines used to format UBB table source are not table content. Turning
    // them into <br> nodes creates anonymous table rows and visible gaps.
    if (isTableStructureNode(parent) && !source.trim()) {
      return;
    }
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      if (line) {
        parent.append(document.createTextNode(line));
      }
      if (index < lines.length - 1) {
        parent.append(document.createElement("br"));
      }
    });
  }

  function extensionAsset(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch {
      return `/__extension/${path}`;
    }
  }

  function emotionUrl(tag) {
    let match = String(tag || "").match(/^cc98(\d{2})$/i);
    if (match) {
      const numericId = Number(match[1]);
      const extension = (numericId > 14 && numericId < 31) || numericId > 35 ? "png" : "gif";
      return extensionAsset(`images/CC98/CC98${match[1]}.${extension}`);
    }
    match = String(tag || "").match(/^ac(\d{2}|\d{4})$/i);
    if (match) {
      return extensionAsset(`images/ac/${match[1]}.png`);
    }
    match = String(tag || "").match(/^([acf]):(\d{3})$/i);
    if (match) {
      const prefix = match[1].toLowerCase();
      const code = match[2];
      const numericId = Number(code);
      if (prefix === "a") {
        return extensionAsset(`images/mahjong/animal2017/${code}.png`);
      }
      if (prefix === "c") {
        return extensionAsset(`images/mahjong/carton2017/${code}.${[18, 49, 96].includes(numericId) ? "gif" : "png"}`);
      }
      return extensionAsset(`images/mahjong/face2017/${code}.${[4, 9, 56, 61, 62, 87, 115, 120, 137, 168, 169, 175, 206].includes(numericId) ? "gif" : "png"}`);
    }
    match = String(tag || "").match(/^tb(\d{2})$/i);
    if (match) {
      return extensionAsset(`images/tb/tb${match[1]}.png`);
    }
    match = String(tag || "").match(/^ms(\d{2})$/i);
    if (match) {
      return extensionAsset(`images/ms/ms${match[1]}.png`);
    }
    match = String(tag || "").match(/^em(\d{2})$/i);
    return match ? extensionAsset(`images/em/em${match[1]}.gif`) : "";
  }

  function createEmotion(tag) {
    const wrap = createElement("span", "cc98-rebuild-inline-emoji-wrap cc98-local-experimental-emoji");
    wrap.dataset.cc98UbbEmotionTag = tag;
    const image = createElement("img", "cc98-rebuild-inline-emoji");
    image.src = emotionUrl(tag);
    image.alt = `[${tag}]`;
    image.draggable = false;
    wrap.append(image);
    return wrap;
  }

  function safeUrl(value) {
    const source = String(value || "").trim();
    if (!source) {
      return "";
    }
    const candidate = /^www\./i.test(source) ? `https://${source}` : source;
    try {
      const parsed = new URL(candidate, location.href);
      return /^(?:https?:|mailto:)$/i.test(parsed.protocol) ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function setRawSource(node, source) {
    node.setAttribute("data-cc98-local-ubb-source", source);
    node.contentEditable = "false";
    node.classList.add("cc98-local-experimental-raw");
    return node;
  }

  function markContainer(node, tag, value) {
    if (localContainerTags.has(tag)) {
      node.dataset.cc98LocalUbbTag = tag;
      if (value) {
        node.dataset.cc98LocalUbbValue = value;
      }
    } else {
      node.dataset.cc98UbbTag = tag;
      if (value) {
        node.dataset.cc98UbbValue = value;
      }
    }
    return node;
  }

  function normalizeFont(value) {
    return String(value || "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[;{}<>]/g, "")
      .slice(0, 80);
  }

  function createContainer(tag, value) {
    let node;
    if (tag === "b") {
      node = document.createElement("strong");
    } else if (tag === "i") {
      node = document.createElement("em");
    } else if (tag === "u") {
      node = document.createElement("u");
    } else if (tag === "s" || tag === "del") {
      node = document.createElement("del");
    } else if (tag === "quote") {
      node = createElement("blockquote", "cc98-local-experimental-quote");
    } else if (tag === "table") {
      node = createElement("table", "cc98-local-experimental-table");
    } else if (tag === "tr") {
      node = document.createElement("tr");
    } else if (tag === "th" || tag === "td") {
      node = document.createElement(tag);
      const [rowSpan, colSpan] = String(value || "").split(",").map((part) => Number.parseInt(part, 10));
      if (Number.isFinite(rowSpan) && rowSpan > 0) {
        node.rowSpan = Math.min(100, rowSpan);
      }
      if (Number.isFinite(colSpan) && colSpan > 0) {
        node.colSpan = Math.min(100, colSpan);
      }
    } else if (["align", "left", "center", "right"].includes(tag)) {
      node = createElement("div", "cc98-local-experimental-align");
      const alignment = tag === "align" ? String(value || "").toLowerCase() : tag;
      if (["left", "center", "right"].includes(alignment)) {
        node.style.textAlign = alignment;
      }
    } else if (["url", "topic", "board", "pm", "user"].includes(tag)) {
      node = createElement("a", "cc98-local-experimental-link");
    } else if (tag === "replyview") {
      node = createElement("aside", "cc98-local-experimental-notice");
      node.dataset.cc98LocalLabel = "回复后可见";
    } else {
      node = document.createElement("span");
    }

    if (tag === "color" && CSS.supports("color", value || "")) {
      node.style.color = value;
    }
    if (tag === "size") {
      const size = Math.min(7, Math.max(1, Number(value) || 3));
      node.style.fontSize = `${0.72 + size * 0.14}em`;
    }
    if (tag === "font") {
      const font = normalizeFont(value);
      if (font) {
        node.style.fontFamily = font;
      }
    }
    if (tag === "english") {
      node.style.fontFamily = "Arial, sans-serif";
    }
    if (tag === "cursor" && CSS.supports("cursor", value || "")) {
      node.style.cursor = value;
    }
    if (tag === "url" && value) {
      node.href = safeUrl(value) || "#";
    }
    return markContainer(node, tag, value || "");
  }

  function finalizeContainer(node, tag, value) {
    if (!(node instanceof HTMLAnchorElement)) {
      return;
    }
    if (tag === "url") {
      node.href = safeUrl(value || node.textContent) || "#";
    } else if (tag === "topic") {
      const parts = String(value || "").split(",");
      const id = parts.length > 1 ? parts[1] : parts[0];
      node.href = `/topic/${encodeURIComponent(String(id || "").trim())}`;
    } else if (tag === "board") {
      node.href = `/board/${encodeURIComponent(String(value || "").trim())}`;
    } else if (tag === "pm") {
      node.href = `/message/message?name=${encodeURIComponent(String(value || "").trim())}`;
    } else if (tag === "user") {
      node.href = `/user/name/${encodeURIComponent((node.textContent || "").trim())}`;
    }
    const resolved = safeUrl(node.getAttribute("href") || "");
    if (resolved && new URL(resolved).origin !== location.origin) {
      node.target = "_blank";
      node.rel = "noreferrer";
    }
  }

  function sanitizeMarkdown(markdown) {
    const wrapper = document.createElement("div");
    if (!window.showdown?.Converter) {
      wrapper.textContent = markdown;
      return wrapper;
    }
    const converter = new window.showdown.Converter({
      tables: true,
      strikethrough: true,
      tasklists: true,
      ghCodeBlocks: true,
      openLinksInNewWindow: true
    });
    const template = document.createElement("template");
    template.innerHTML = converter.makeHtml(markdown);
    template.content.querySelectorAll("script, style, iframe, object, embed, form, input, textarea, select, button, link, meta, base").forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        if (name.startsWith("on") || name === "srcdoc" || name === "style") {
          node.removeAttribute(attribute.name);
        }
      });
      ["href", "src"].forEach((name) => {
        if (!node.hasAttribute(name)) {
          return;
        }
        const value = safeUrl(node.getAttribute(name));
        if (value) {
          node.setAttribute(name, value);
        } else {
          node.removeAttribute(name);
        }
      });
      if (node instanceof HTMLAnchorElement && node.target === "_blank") {
        node.rel = "noreferrer";
      }
    });
    wrapper.append(template.content);
    return wrapper;
  }

  function escapeMarkdownText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "\n\n")
      .replace(/\\/g, "\\\\")
      .replace(/([`*_\[\]~])/g, "\\$1")
      .replace(/(^|\n)([ \t]{0,3})(#{1,6}|>|[-+] |\d+[.)] )/g, "$1$2\\$3");
  }

  function serializeMarkdownInlineChildren(parent) {
    return [...(parent?.childNodes || [])]
      .map((child) => serializeMarkdownNode(child, true))
      .join("");
  }

  function markdownCodeFence(value, minimum = 1) {
    const longest = Math.max(
      0,
      ...([...String(value || "").matchAll(/`+/g)].map((match) => match[0].length))
    );
    return "`".repeat(Math.max(minimum, longest + 1));
  }

  function serializeMarkdownList(list, depth = 0) {
    if (!(list instanceof HTMLElement)) {
      return "";
    }
    const ordered = list.tagName.toLowerCase() === "ol";
    const start = ordered ? Math.max(1, Number.parseInt(list.getAttribute("start") || "1", 10) || 1) : 1;
    const rows = [...list.children].filter((child) => child.tagName?.toLowerCase() === "li");
    const output = rows.map((item, index) => {
      const nestedLists = [...item.children].filter((child) => /^(?:ul|ol)$/i.test(child.tagName));
      const content = [...item.childNodes]
        .filter((child) => !(child instanceof HTMLElement && /^(?:ul|ol)$/i.test(child.tagName)))
        .map((child) => serializeMarkdownNode(
          child,
          child instanceof Text || !/^(?:p|div|section|article)$/i.test(child.tagName || "")
        ))
        .join("")
        .replace(/\n{2,}/g, "\n")
        .replace(/^\n+|\n+$/g, "");
      const marker = ordered ? `${start + index}. ` : "- ";
      const indent = "  ".repeat(Math.max(0, depth));
      let line = `${indent}${marker}${content || " "}`;
      nestedLists.forEach((nested) => {
        line += `\n${serializeMarkdownList(nested, depth + 1).replace(/\n+$/g, "")}`;
      });
      return line;
    }).join("\n");
    return output ? `${output}\n\n` : "";
  }

  function serializeMarkdownTable(table) {
    if (!(table instanceof HTMLTableElement)) {
      return "";
    }
    const rows = [...table.querySelectorAll(
      ":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr"
    )];
    if (!rows.length) {
      return "";
    }
    const values = rows.map((row) => [...row.children]
      .filter((cell) => /^(?:th|td)$/i.test(cell.tagName))
      .map((cell) => serializeMarkdownInlineChildren(cell)
        .replace(/\|/g, "\\|")
        .replace(/\n+/g, "<br>")
        .trim()));
    const width = Math.max(1, ...values.map((row) => row.length));
    const normalizeRow = (row) => Array.from({ length: width }, (_, index) => row[index] || "");
    const header = normalizeRow(values[0]);
    const body = values.slice(1).map(normalizeRow);
    return [
      `| ${header.join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
      ...body.map((row) => `| ${row.join(" | ")} |`)
    ].join("\n") + "\n\n";
  }

  function serializeMarkdownNode(node, inline = false) {
    if (node instanceof Text) {
      return escapeMarkdownText(node.nodeValue || "");
    }
    if (!(node instanceof HTMLElement)) {
      return "";
    }
    const tag = node.tagName.toLowerCase();
    if (tag === "br") {
      return "  \n";
    }
    if (tag === "img") {
      const source = node.getAttribute("src") || "";
      return source
        ? `![${escapeMarkdownText(node.getAttribute("alt") || "")}](${source.replace(/\s/g, "%20")})`
        : "";
    }
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      const label = serializeMarkdownInlineChildren(node) || escapeMarkdownText(href);
      return href ? `[${label}](${href.replace(/\s/g, "%20")})` : label;
    }
    if (tag === "strong" || tag === "b") {
      return `**${serializeMarkdownInlineChildren(node)}**`;
    }
    if (tag === "em" || tag === "i") {
      return `*${serializeMarkdownInlineChildren(node)}*`;
    }
    if (tag === "del" || tag === "s" || tag === "strike") {
      return `~~${serializeMarkdownInlineChildren(node)}~~`;
    }
    if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") {
      const value = String(node.textContent || "").replace(/\r\n?/g, "\n");
      const fence = markdownCodeFence(value);
      const padding = /^\s|\s$/.test(value) ? " " : "";
      return `${fence}${padding}${value}${padding}${fence}`;
    }
    if (tag === "pre") {
      const value = String(node.textContent || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\n+$/g, "");
      const fence = markdownCodeFence(value, 3);
      const language = node.querySelector(":scope > code")?.className
        .match(/(?:^|\s)language-([^\s]+)/)?.[1] || "";
      return `${fence}${language}\n${value}\n${fence}\n\n`;
    }
    if (/^h[1-6]$/.test(tag)) {
      return `${"#".repeat(Number(tag.slice(1)))} ${serializeMarkdownInlineChildren(node)}\n\n`;
    }
    if (tag === "blockquote") {
      const value = serializeMarkdownBlockChildren(node).replace(/^\n+|\n+$/g, "");
      return `${value.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
    }
    if (tag === "ul" || tag === "ol") {
      return serializeMarkdownList(node);
    }
    if (tag === "table") {
      return serializeMarkdownTable(node);
    }
    if (tag === "hr") {
      return "---\n\n";
    }
    if (tag === "input" && node.getAttribute("type") === "checkbox") {
      return node.hasAttribute("checked") ? "[x] " : "[ ] ";
    }
    if (tag === "p" || /^(?:div|section|article|header|footer|aside)$/.test(tag)) {
      const value = serializeMarkdownBlockChildren(node).replace(/\n+$/g, "");
      return inline ? value : `${value}\n\n`;
    }
    return serializeMarkdownInlineChildren(node);
  }

  function serializeMarkdownBlockChildren(parent) {
    const children = [...(parent?.childNodes || [])];
    const isStructuralBlock = (node) => node instanceof HTMLElement
      && /^(?:address|article|aside|blockquote|div|footer|h[1-6]|header|hr|main|nav|ol|p|pre|section|table|ul)$/i.test(node.tagName);
    return children
      .map((child, index) => {
        if (child instanceof HTMLBRElement && index === children.length - 1) {
          return "";
        }
        if (
          child instanceof Text
          && /[\r\n]/.test(child.nodeValue || "")
          && !String(child.nodeValue || "").trim()
          && (
            isStructuralBlock(children[index - 1])
            || isStructuralBlock(children[index + 1])
          )
        ) {
          return "";
        }
        return serializeMarkdownNode(child, child instanceof Text);
      })
      .join("");
  }

  function serializeEditableMarkdown(node) {
    if (!(node instanceof HTMLElement)) {
      return "";
    }
    return serializeMarkdownBlockChildren(node)
      .replace(/\r\n?/g, "\n")
      .replace(/[\u200b\uFEFF]/g, "")
      .replace(/^\n+|\n+$/g, "");
  }

  function createEditableMarkdownBlock(content) {
    const markdown = createElement(
      "section",
      "cc98-local-experimental-markdown cc98-rebuild-markdown-post"
    );
    markdown.dataset.cc98LocalUbbTag = "md";
    markdown.spellcheck = true;
    const rendered = sanitizeMarkdown(content);
    while (rendered.firstChild) {
      markdown.append(rendered.firstChild);
    }
    if (!markdown.childNodes.length) {
      const paragraph = document.createElement("p");
      paragraph.append(document.createElement("br"));
      markdown.append(paragraph);
    }
    return markdown;
  }

  function createImageBlock(url, hidden, rawSource, title = "") {
    const figure = createElement("figure", "cc98-local-experimental-image");
    const image = createElement("img", "cc98-rebuild-content-image");
    image.src = safeUrl(url) || url;
    image.alt = title;
    image.loading = "eager";
    if (hidden) {
      image.hidden = true;
      const reveal = createElement("button", "cc98-local-experimental-image-reveal");
      reveal.type = "button";
      reveal.textContent = "点击查看图片";
      reveal.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        image.hidden = false;
        reveal.remove();
      });
      figure.append(reveal);
    }
    figure.append(image);
    return setRawSource(figure, rawSource);
  }

  function createEditableCodeLine(content = "") {
    const item = document.createElement("li");
    item.className = "cc98-local-experimental-code-line";
    if (content) {
      item.append(document.createTextNode(content));
    } else {
      item.append(document.createElement("br"));
    }
    return item;
  }

  function createEditableCodeBlock(content) {
    const block = createElement("div", "ubb-code cc98-local-experimental-code");
    block.dataset.cc98LocalUbbTag = "code";
    block.spellcheck = false;

    const list = document.createElement("ol");
    const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
    while (lines.length > 0 && !lines[0]) {
      lines.shift();
    }
    while (lines.length > 0 && !lines[lines.length - 1]) {
      lines.pop();
    }
    (lines.length > 0 ? lines : [""]).forEach((line) => list.append(createEditableCodeLine(line)));
    block.append(list);
    return block;
  }

  function renderRawTag(tag, value, content, rawSource) {
    if (tag === "code") {
      return createEditableCodeBlock(content);
    }
    if (tag === "md") {
      return createEditableMarkdownBlock(content);
    }
    if (tag === "noubb") {
      const code = createElement("code", "cc98-local-experimental-noubb");
      code.textContent = content;
      return setRawSource(code, rawSource);
    }
    if (tag === "math" || tag === "m") {
      const math = createElement(tag === "m" ? "span" : "div", "cc98-local-experimental-math");
      try {
        if (window.katex?.render) {
          window.katex.render(content, math, { displayMode: tag === "math", throwOnError: false, strict: "ignore" });
        } else {
          math.textContent = content;
        }
      } catch {
        math.textContent = content;
      }
      return setRawSource(math, rawSource);
    }
    if (tag === "img") {
      const hidden = Number.parseInt(String(value || "").split(",")[0], 10) === 1;
      return createImageBlock(content.trim(), hidden, rawSource);
    }
    if (tag === "upload") {
      const parts = String(value || "").toLowerCase().split(",");
      const source = content.trim();
      const path = source.split(/[?#]/)[0];
      const imageType = /^(?:jpe?g|png|gif|bmp|webp)$/.test(parts[0]) || /\.(?:jpe?g|png|gif|bmp|webp)$/i.test(path);
      if (imageType) {
        return createImageBlock(source, Number.parseInt(parts[1], 10) === 1, rawSource, "upload 图片");
      }
      const link = createElement("a", "cc98-local-experimental-download");
      link.href = safeUrl(source) || source;
      link.textContent = "下载文件";
      link.download = "";
      return setRawSource(link, rawSource);
    }
    if (tag === "audio" || tag === "mp3") {
      const audio = createElement("audio", "cc98-local-experimental-audio");
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = safeUrl(content.trim()) || content.trim();
      return setRawSource(audio, rawSource);
    }
    if (tag === "video") {
      const video = createElement("video", "cc98-local-experimental-video");
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.src = safeUrl(content.trim()) || content.trim();
      return setRawSource(video, rawSource);
    }
    const link = createElement("a", "cc98-local-experimental-link");
    link.href = safeUrl(content.trim()) || "#";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `Bilibili 视频：${content.trim()}`;
    return setRawSource(link, rawSource);
  }

  function renderEmptyTag(tag, value, rawSource) {
    if (tag === "line") {
      return setRawSource(createElement("hr", "cc98-local-experimental-line"), rawSource);
    }
    const labels = {
      needreply: "该内容需要回复后才能浏览",
      posteronly: "仅主题帖作者可见",
      allowviewer: "仅指定用户可见"
    };
    const notice = createElement("aside", "cc98-local-experimental-notice");
    notice.dataset.cc98LocalLabel = labels[tag] || tag;
    if (value) {
      notice.dataset.cc98LocalState = value;
    }
    return setRawSource(notice, rawSource);
  }

  function findRawClosing(source, tag, fromIndex) {
    const match = new RegExp(`\\[\\/${tag}\\]`, "ig");
    match.lastIndex = fromIndex;
    return match.exec(source);
  }

  function parseInto(parent, source, state, closingTag = "") {
    while (state.index < source.length) {
      const openIndex = source.indexOf("[", state.index);
      if (openIndex < 0) {
        appendText(parent, source.slice(state.index));
        state.index = source.length;
        return false;
      }
      appendText(parent, source.slice(state.index, openIndex));

      const rest = source.slice(openIndex);
      const emotion = rest.match(emotionPattern);
      if (emotion) {
        parent.append(createEmotion(emotion[1]));
        state.index = openIndex + emotion[0].length;
        continue;
      }

      const token = rest.match(openingTagPattern);
      if (!token) {
        appendText(parent, "[");
        state.index = openIndex + 1;
        continue;
      }
      const rawToken = token[0];
      const closing = token[1] === "/";
      const tag = token[2].toLowerCase();
      const value = String(token[3] || "").trim();
      const tokenEnd = openIndex + rawToken.length;

      if (closing) {
        if (tag === closingTag) {
          state.index = tokenEnd;
          return true;
        }
        appendText(parent, rawToken);
        state.index = tokenEnd;
        continue;
      }

      if (emptyTags.has(tag)) {
        parent.append(renderEmptyTag(tag, value, rawToken));
        state.index = tokenEnd;
        continue;
      }

      if (rawTags.has(tag)) {
        const closingMatch = findRawClosing(source, tag, tokenEnd);
        if (!closingMatch) {
          appendText(parent, rawToken);
          state.index = tokenEnd;
          continue;
        }
        const content = source.slice(tokenEnd, closingMatch.index);
        const rawSource = source.slice(openIndex, closingMatch.index + closingMatch[0].length);
        parent.append(renderRawTag(tag, value, content, rawSource));
        state.index = closingMatch.index + closingMatch[0].length;
        continue;
      }

      if (!pairedTags.has(tag)) {
        appendText(parent, rawToken);
        state.index = tokenEnd;
        continue;
      }

      const closingMatch = findRawClosing(source, tag, tokenEnd);
      if (!closingMatch) {
        appendText(parent, rawToken);
        state.index = tokenEnd;
        continue;
      }
      const node = createContainer(tag, value);
      parent.append(node);
      state.index = tokenEnd;
      parseInto(node, source, state, tag);
      finalizeContainer(node, tag, value);
    }
    return false;
  }

  function render(source) {
    const article = createElement("article", "cc98-rebuild-ubb-preview-rendered cc98-local-experimental-syntax");
    parseInto(article, String(source || ""), { index: 0 });
    return article;
  }

  function getSourceEditorFromEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return null;
    }
    const editor = target.closest(".cc98-rebuild-dual-ubb-source[contenteditable='true']");
    return editor instanceof HTMLElement ? editor : null;
  }

  function getVisualEditorFromEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return null;
    }
    const editor = target.closest(".cc98-rebuild-dual-ubb-visual[contenteditable='true']");
    return editor instanceof HTMLElement ? editor : null;
  }

  function isVisualFormattingBoundary(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    return node.matches([
      ".cc98-local-experimental-quote",
      "[data-cc98-local-ubb-tag]",
      "[data-cc98-ubb-tag]",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "del",
      "s",
      "a[href]",
      "[style*='color']",
      "[style*='font-']",
      "[style*='text-align']"
    ].join(","));
  }

  function getOutermostVisualFormattingBoundary(root, range) {
    let current = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
    let boundary = null;
    while (current instanceof HTMLElement && current !== root) {
      if (isVisualFormattingBoundary(current)) {
        boundary = current;
      }
      current = current.parentElement;
    }
    return boundary;
  }

  function fragmentHasVisibleContent(fragment) {
    if (!(fragment instanceof DocumentFragment)) {
      return false;
    }
    if (String(fragment.textContent || "").replace(/[\s\u200b\uFEFF]/g, "")) {
      return true;
    }
    return Boolean(fragment.querySelector("img, audio, video, br, hr, table, [data-cc98-local-ubb-source]"));
  }

  function elementHasVisibleContent(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (String(element.textContent || "").replace(/[\s\u200b\uFEFF]/g, "")) {
      return true;
    }
    return Boolean(element.querySelector("img, audio, video, hr, table, [data-cc98-local-ubb-source]"));
  }

  function setVisualCaret(node, offset = 0) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const maximumOffset = node instanceof Text
      ? String(node.nodeValue || "").length
      : node.childNodes.length;
    const range = document.createRange();
    range.setStart(node, Math.max(0, Math.min(Number(offset) || 0, maximumOffset)));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function dispatchVisualLineBreakInput(root, inputType = "insertParagraph") {
    const inputEvent = typeof InputEvent === "function"
      ? new InputEvent("input", { bubbles: true, inputType, data: null })
      : new Event("input", { bubbles: true });
    root.dispatchEvent(inputEvent);
  }

  function getEditableCodeLineContext(root) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount <= 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (!(range.commonAncestorContainer === root || root.contains(range.commonAncestorContainer))) {
      return null;
    }
    const startElement = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
    const line = startElement?.closest?.(".cc98-local-experimental-code-line");
    const block = line?.closest?.(".cc98-local-experimental-code[data-cc98-local-ubb-tag='code']");
    return line instanceof HTMLLIElement && block instanceof HTMLElement && root.contains(block)
      ? { selection, range, line, block }
      : null;
  }

  function codeLineHasContent(line) {
    if (!(line instanceof HTMLLIElement)) {
      return false;
    }
    if (String(line.textContent || "").replace(/[\u200b\uFEFF]/g, "")) {
      return true;
    }
    return Boolean(line.querySelector(":scope > :not(br)"));
  }

  function normalizeEditableCodeLine(line) {
    if (!(line instanceof HTMLLIElement)) {
      return;
    }
    if (codeLineHasContent(line)) {
      return;
    }
    line.replaceChildren(document.createElement("br"));
  }

  function createUnformattedVisualLine(nodes = []) {
    const line = createElement("div", "cc98-local-unformatted-line");
    nodes.forEach((node) => {
      if (node instanceof Node) {
        line.append(node);
      }
    });
    if (!line.childNodes.length) {
      line.append(document.createElement("br"));
    }
    return line;
  }

  function cloneEditableCodeBlockShell(block, list) {
    const nextBlock = block.cloneNode(false);
    nextBlock.removeAttribute("id");
    const nextList = list instanceof HTMLOListElement
      ? list.cloneNode(false)
      : document.createElement("ol");
    nextList.removeAttribute("id");
    nextBlock.append(nextList);
    return { block: nextBlock, list: nextList };
  }

  function getCodeLineRangeText(line, container, offset) {
    const probe = document.createRange();
    try {
      probe.selectNodeContents(line);
      probe.setEnd(container, offset);
      return probe.toString().replace(/[\u200b\uFEFF]/g, "");
    } catch {
      return "";
    }
  }

  function isCodeRangeAtLineStart(range, line) {
    return range.collapsed
      && !getCodeLineRangeText(line, range.startContainer, range.startOffset);
  }

  function moveEditableCodeLineOutside(root, context, inputType = "insertParagraph") {
    const { line, block } = context || {};
    const list = line?.parentElement;
    if (!(line instanceof HTMLLIElement) || !(block instanceof HTMLElement) || !(list instanceof HTMLOListElement)) {
      return false;
    }
    const lines = [...list.children].filter((child) => child instanceof HTMLLIElement);
    const lineIndex = lines.indexOf(line);
    if (lineIndex < 0) {
      return false;
    }

    const plainLine = createUnformattedVisualLine([...line.childNodes]);
    if (lineIndex === 0) {
      block.before(plainLine);
    } else if (lineIndex === lines.length - 1) {
      block.after(plainLine);
    } else {
      const trailing = cloneEditableCodeBlockShell(block, list);
      lines.slice(lineIndex + 1).forEach((item) => trailing.list.append(item));
      block.after(plainLine, trailing.block);
    }
    line.remove();
    if (!list.querySelector(":scope > li")) {
      block.remove();
    }

    const caretTarget = plainLine.firstChild instanceof Text
      ? plainLine.firstChild
      : plainLine;
    setVisualCaret(caretTarget, 0);
    root.focus({ preventScroll: true });
    dispatchVisualLineBreakInput(root, inputType);
    return true;
  }

  function mergeEditableCodeLineBackward(root, context) {
    const { line } = context || {};
    const previous = line?.previousElementSibling;
    if (!(line instanceof HTMLLIElement) || !(previous instanceof HTMLLIElement)) {
      return false;
    }
    if (!codeLineHasContent(previous)) {
      previous.replaceChildren();
    }
    const caretOffset = previous.childNodes.length;
    while (line.firstChild) {
      previous.append(line.firstChild);
    }
    line.remove();
    normalizeEditableCodeLine(previous);
    setVisualCaret(previous, caretOffset);
    root.focus({ preventScroll: true });
    dispatchVisualLineBreakInput(root, "deleteContentBackward");
    return true;
  }

  function normalizePlainCodeToken(node) {
    if (node instanceof Text) {
      if (!String(node.nodeValue || "")) {
        return null;
      }
      return createUnformattedVisualLine([node]);
    }
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    if (node instanceof HTMLBRElement) {
      return createUnformattedVisualLine([node]);
    }
    if (/^(?:div|p|section|article|blockquote|pre|h[1-6])$/i.test(node.tagName)) {
      node.removeAttribute("data-cc98-local-ubb-tag");
      node.removeAttribute("data-cc98-local-ubb-value");
      node.classList.add("cc98-local-unformatted-line");
      if (!node.childNodes.length) {
        node.append(document.createElement("br"));
      }
      return node;
    }
    return createUnformattedVisualLine([node]);
  }

  function createCodeCaretMarker(block) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount <= 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (!range.collapsed || !(range.startContainer === block || block.contains(range.startContainer))) {
      return null;
    }
    const marker = createElement("span", "cc98-local-code-caret-marker");
    marker.textContent = "\u200b";
    try {
      range.insertNode(marker);
      return marker;
    } catch {
      return null;
    }
  }

  function restoreCodeCaretMarker(root, marker) {
    if (!(marker instanceof HTMLElement) || !marker.isConnected || !(marker.parentNode instanceof Node)) {
      return;
    }
    const parent = marker.parentNode;
    const offset = [...parent.childNodes].indexOf(marker);
    marker.remove();
    setVisualCaret(parent, Math.max(0, offset));
    root.focus({ preventScroll: true });
  }

  function normalizeEscapedEditableCodeBlock(root, block) {
    if (!(block instanceof HTMLElement)) {
      return false;
    }
    const directChildren = [...block.childNodes];
    const directLists = directChildren.filter((node) => node instanceof HTMLOListElement);
    const validList = directLists.length === 1 ? directLists[0] : null;
    const valid = directChildren.length === 1
      && validList instanceof HTMLOListElement
      && validList.childNodes.length > 0
      && [...validList.childNodes].every((node) => node instanceof HTMLLIElement);
    if (valid) {
      return false;
    }

    const marker = createCodeCaretMarker(block);
    const listTemplate = validList || directLists[0] || document.createElement("ol");
    const tokens = [];
    [...block.childNodes].forEach((node) => {
      if (node instanceof HTMLOListElement) {
        tokens.push(...node.childNodes);
      } else {
        tokens.push(node);
      }
    });

    const fragment = document.createDocumentFragment();
    let codeGroup = null;
    const appendCodeLine = (line) => {
      if (!codeGroup) {
        codeGroup = cloneEditableCodeBlockShell(block, listTemplate);
        fragment.append(codeGroup.block);
      }
      normalizeEditableCodeLine(line);
      codeGroup.list.append(line);
    };
    tokens.forEach((node) => {
      if (node instanceof HTMLLIElement) {
        appendCodeLine(node);
        return;
      }
      codeGroup = null;
      const plain = normalizePlainCodeToken(node);
      if (plain) {
        fragment.append(plain);
      }
    });
    if (!fragment.childNodes.length) {
      fragment.append(createUnformattedVisualLine());
    }
    block.replaceWith(fragment);
    restoreCodeCaretMarker(root, marker);
    return true;
  }

  function normalizeEscapedEditableCodeBlocks(root) {
    if (!(root instanceof HTMLElement)) {
      return false;
    }
    let changed = false;
    [...root.querySelectorAll(".cc98-local-experimental-code[data-cc98-local-ubb-tag='code']")].forEach((block) => {
      changed = normalizeEscapedEditableCodeBlock(root, block) || changed;
    });
    return changed;
  }

  function getEditableCodeBlockLines(block) {
    if (!(block instanceof HTMLElement)) {
      return [];
    }
    return [...block.querySelectorAll(":scope > ol > li")]
      .filter((line) => line instanceof HTMLLIElement);
  }

  function getCodeSelectionOffset(block, container, offset) {
    const lines = getEditableCodeBlockLines(block);
    const element = container instanceof Element ? container : container?.parentElement;
    const line = element?.closest?.(".cc98-local-experimental-code-line");
    const lineIndex = lines.indexOf(line);
    if (lineIndex < 0) {
      return null;
    }
    const priorLength = lines.slice(0, lineIndex).reduce(
      (total, item) => total + String(item.textContent || "").replace(/[\u200b\uFEFF]/g, "").length + 1,
      0
    );
    return priorLength + getCodeLineRangeText(line, container, offset).length;
  }

  function setEditableCodeCaretOffset(root, block, requestedOffset) {
    const lines = getEditableCodeBlockLines(block);
    if (!lines.length) {
      return false;
    }
    const target = Math.max(0, Number(requestedOffset) || 0);
    let cursor = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const text = String(line.textContent || "").replace(/[\u200b\uFEFF]/g, "");
      if (target <= cursor + text.length || index === lines.length - 1) {
        const column = Math.max(0, Math.min(text.length, target - cursor));
        const textNode = [...line.childNodes].find((node) => node instanceof Text);
        setVisualCaret(textNode || line, textNode ? column : 0);
        root.focus({ preventScroll: true });
        return true;
      }
      cursor += text.length + 1;
    }
    return false;
  }

  function replaceEditableCodeSelectionWithText(root, replacement) {
    const context = getEditableCodeLineContext(root);
    if (!context) {
      return false;
    }
    const { selection, range, block } = context;
    const start = getCodeSelectionOffset(block, range.startContainer, range.startOffset);
    const end = getCodeSelectionOffset(block, range.endContainer, range.endOffset);
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return false;
    }
    const list = block.querySelector(":scope > ol");
    if (!(list instanceof HTMLOListElement)) {
      return false;
    }
    const current = getEditableCodeBlockLines(block)
      .map((line) => String(line.textContent || "").replace(/[\u200b\uFEFF]/g, ""))
      .join("\n");
    const inserted = String(replacement ?? "").replace(/\r\n?/g, "\n");
    const from = Math.max(0, Math.min(current.length, start));
    const to = Math.max(from, Math.min(current.length, end));
    const nextValue = `${current.slice(0, from)}${inserted}${current.slice(to)}`;
    list.replaceChildren(...nextValue.split("\n").map((line) => createEditableCodeLine(line)));
    selection.removeAllRanges();
    setEditableCodeCaretOffset(root, block, from + inserted.length);
    dispatchVisualLineBreakInput(root, inserted.includes("\n") ? "insertFromPaste" : "insertText");
    return true;
  }

  function insertEditableCodeLineBreak(root) {
    const context = getEditableCodeLineContext(root);
    if (!context) {
      return false;
    }
    const { selection, range, line } = context;
    if (!range.collapsed) {
      range.deleteContents();
      range.collapse(true);
    }
    if (!codeLineHasContent(line)) {
      return moveEditableCodeLineOutside(root, context);
    }

    const trailingRange = document.createRange();
    try {
      trailingRange.setStart(range.startContainer, range.startOffset);
      trailingRange.setEnd(line, line.childNodes.length);
    } catch {
      return false;
    }
    const trailing = trailingRange.extractContents();
    const nextLine = document.createElement("li");
    nextLine.className = "cc98-local-experimental-code-line";
    nextLine.append(trailing);
    line.after(nextLine);
    normalizeEditableCodeLine(line);
    normalizeEditableCodeLine(nextLine);

    const caretTarget = nextLine.firstChild instanceof HTMLBRElement
      ? nextLine
      : nextLine.firstChild || nextLine;
    setVisualCaret(caretTarget, 0);
    root.focus({ preventScroll: true });
    dispatchVisualLineBreakInput(root);
    return true;
  }

  function insertUnformattedVisualLine(root) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount <= 0) {
      return false;
    }
    const range = selection.getRangeAt(0);
    if (!(range.commonAncestorContainer === root || root.contains(range.commonAncestorContainer))) {
      return false;
    }
    if (!range.collapsed) {
      range.deleteContents();
      range.collapse(true);
    }

    const boundary = getOutermostVisualFormattingBoundary(root, range);
    if (!(boundary instanceof HTMLElement)) {
      const lineBreak = document.createElement("br");
      const caretAnchor = document.createTextNode("\u200b");
      range.insertNode(caretAnchor);
      range.insertNode(lineBreak);
      setVisualCaret(caretAnchor, 1);
      root.focus({ preventScroll: true });
      dispatchVisualLineBreakInput(root);
      return true;
    }

    const trailingRange = document.createRange();
    trailingRange.setStart(range.startContainer, range.startOffset);
    trailingRange.setEnd(boundary, boundary.childNodes.length);
    const trailing = trailingRange.extractContents();
    const plainLine = createElement("div", "cc98-local-unformatted-line");
    const lineBreak = document.createElement("br");
    plainLine.append(lineBreak);
    boundary.after(plainLine);

    if (fragmentHasVisibleContent(trailing)) {
      const trailingBoundary = boundary.cloneNode(false);
      trailingBoundary.removeAttribute("id");
      trailingBoundary.append(trailing);
      plainLine.after(trailingBoundary);
    }
    if (!elementHasVisibleContent(boundary)) {
      boundary.remove();
    }

    setVisualCaret(plainLine, 0);
    root.focus({ preventScroll: true });
    dispatchVisualLineBreakInput(root);
    return true;
  }

  function getLogicalCaretOffset(root) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount <= 0) {
      return String(root.textContent || "").length;
    }
    const current = selection.getRangeAt(0);
    if (!(current.commonAncestorContainer === root || root.contains(current.commonAncestorContainer))) {
      return String(root.textContent || "").length;
    }
    const measured = document.createRange();
    measured.selectNodeContents(root);
    try {
      measured.setEnd(current.startContainer, current.startOffset);
      return measured.toString().replace(/[\u200b\uFEFF]/g, "").length;
    } catch {
      return String(root.textContent || "").length;
    }
  }

  function restoreLogicalCaret(root, offset) {
    if (!(root instanceof HTMLElement) || !root.isConnected) {
      return;
    }
    const targetOffset = Math.max(0, Number(offset) || 0);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = targetOffset;
    let lastText = null;
    let resolved = null;
    while (walker.nextNode()) {
      const text = walker.currentNode;
      const length = String(text.nodeValue || "").replace(/[\u200b\uFEFF]/g, "").length;
      lastText = text;
      if (length > 0 && remaining <= length) {
        resolved = { node: text, offset: Math.min(String(text.nodeValue || "").length, remaining) };
        break;
      }
      remaining -= length;
    }
    const range = document.createRange();
    if (resolved) {
      range.setStart(resolved.node, resolved.offset);
    } else if (lastText) {
      range.setStart(lastText, String(lastText.nodeValue || "").length);
    } else {
      range.selectNodeContents(root);
      range.collapse(false);
    }
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    root.focus({ preventScroll: true });
  }

  function insertSourceEditorText(root, text) {
    const selection = window.getSelection();
    let range = null;
    if (selection && selection.rangeCount > 0) {
      const candidate = selection.getRangeAt(0);
      if (candidate.commonAncestorContainer === root || root.contains(candidate.commonAncestorContainer)) {
        range = candidate;
      }
    }
    if (!(range instanceof Range)) {
      range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
    }
    const start = getLogicalCaretOffset(root);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const inputEvent = typeof InputEvent === "function"
      ? new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
      : new Event("input", { bubbles: true });
    root.dispatchEvent(inputEvent);
    window.requestAnimationFrame(() => restoreLogicalCaret(root, start + text.length));
  }

  document.addEventListener("input", (event) => {
    const visualEditor = getVisualEditorFromEvent(event);
    if (visualEditor) {
      normalizeEscapedEditableCodeBlocks(visualEditor);
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    const visualEditor = getVisualEditorFromEvent(event);
    const codeContext = visualEditor ? getEditableCodeLineContext(visualEditor) : null;
    if (
      visualEditor
      && codeContext
      && event.key === "Tab"
      && !event.isComposing
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
    ) {
      if (replaceEditableCodeSelectionWithText(visualEditor, "\t")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (
      visualEditor
      && codeContext
      && event.key === "Backspace"
      && !event.isComposing
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
      && isCodeRangeAtLineStart(codeContext.range, codeContext.line)
    ) {
      const handled = codeContext.line.previousElementSibling instanceof HTMLLIElement
        ? mergeEditableCodeLineBackward(visualEditor, codeContext)
        : moveEditableCodeLineOutside(visualEditor, codeContext, "deleteContentBackward");
      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (
      visualEditor
      && event.key === "Enter"
      && !event.shiftKey
      && !event.isComposing
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
      && codeContext
    ) {
      if (insertEditableCodeLineBreak(visualEditor)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (
      visualEditor
      && event.key === "Enter"
      && event.shiftKey
      && !event.isComposing
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
    ) {
      if (insertUnformattedVisualLine(visualEditor)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    const sourceEditor = getSourceEditorFromEvent(event);
    if (!sourceEditor || event.key !== "Enter" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    insertSourceEditorText(sourceEditor, "\n");
  }, true);

  document.addEventListener("paste", (event) => {
    const visualEditor = getVisualEditorFromEvent(event);
    const sourceEditor = getSourceEditorFromEvent(event);
    const plainText = event.clipboardData?.getData("text/plain");
    if (typeof plainText !== "string") {
      return;
    }
    if (visualEditor && getEditableCodeLineContext(visualEditor)) {
      if (replaceEditableCodeSelectionWithText(visualEditor, plainText)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (!sourceEditor) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    insertSourceEditorText(sourceEditor, plainText.replace(/\r\n?/g, "\n"));
  }, true);

  const localSyntaxCommands = [
    { id: "quote", label: "引用", hint: "引用块", before: "[quote]", after: "[/quote]" },
    { id: "line", label: "分割线", hint: "插入横向分割线", replacement: (selected) => `${selected ? `${selected}\n` : ""}[line]\n` },
    { id: "code", label: "代码", hint: "保留代码的空格与换行", before: "[code]", after: "[/code]" },
    { id: "markdown", label: "Markdown", hint: "在 UBB 中嵌入 Markdown", before: "[md]", after: "[/md]" },
    { id: "math", label: "公式块", hint: "KaTeX 块级公式", before: "[math]", after: "[/math]" },
    { id: "inline-math", label: "行内公式", hint: "KaTeX 行内公式", before: "[m]", after: "[/m]" },
    { id: "noubb", label: "原样文本", hint: "不解析内部 UBB", before: "[noubb]", after: "[/noubb]" },
    { id: "english", label: "英文字体", hint: "使用论坛英文字体样式", before: "[english]", after: "[/english]" }
  ];

  function findDualEditorForToolbar(toolbar) {
    const editor = toolbar?.closest?.(".cc98-rebuild-native-editor");
    return editor instanceof HTMLElement && editor.__cc98DualUbbState ? editor : null;
  }

  function rememberLocalToolbarSelection(tools) {
    const editor = findDualEditorForToolbar(tools?.closest?.(".ubb-buttons, .ubb-toolbar"));
    editor?.__cc98DualUbbState?.rememberSelection?.({ preserveNonCollapsed: true });
    return editor;
  }

  function setLocalToolStatus(tools, message, state = "ok") {
    const status = tools?.querySelector?.(".cc98-local-syntax-status");
    if (!(status instanceof HTMLElement)) {
      return;
    }
    status.textContent = message;
    status.dataset.state = state;
    window.clearTimeout(status.__cc98LocalClearTimer);
    status.__cc98LocalClearTimer = window.setTimeout(() => {
      status.textContent = "选中内容后点击工具；未选中时会把光标放在标签内。";
      delete status.dataset.state;
    }, 2600);
  }

  function applyLocalSyntaxEdit(tools, options, successMessage) {
    const editor = rememberLocalToolbarSelection(tools);
    const applyEdit = editor?.__cc98DualUbbState?.extendedUbbApplySourceEdit;
    if (typeof applyEdit !== "function") {
      setLocalToolStatus(tools, "扩展编辑接口尚未就绪，请等待编辑器加载完成。", "error");
      return null;
    }
    const result = applyEdit(options);
    tools.dataset.cc98LocalLastEdit = JSON.stringify({
      applied: Boolean(result?.applied),
      reason: result?.reason || "",
      selectedLength: String(result?.selected || "").length,
      start: Number(result?.start) || 0,
      end: Number(result?.end) || 0
    });
    if (!result?.applied) {
      const message = result?.reason === "selection-required"
        ? "请先在上区或下区选中内容。"
        : "没有完成插入，请重新选择后再试。";
      setLocalToolStatus(tools, message, "error");
      return result;
    }
    setLocalToolStatus(tools, successMessage || "已插入并重新渲染。", "ok");
    return result;
  }

  function buildTableUbb(rowCount, columnCount) {
    const sharedBuilder = window.CC98RebornExtendedUbbCore?.buildTableUbb;
    if (typeof sharedBuilder === "function") {
      return sharedBuilder(rowCount, columnCount);
    }
    const normalizeDimension = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric)
        ? Math.max(1, Math.min(6, Math.trunc(numeric)))
        : 1;
    };
    const rows = normalizeDimension(rowCount);
    const columns = normalizeDimension(columnCount);
    const header = `[tr]${Array.from({ length: columns }, () => "[th][/th]").join("")}[/tr]`;
    const body = Array.from(
      { length: Math.max(0, rows - 1) },
      () => `[tr]${Array.from({ length: columns }, () => "[td][/td]").join("")}[/tr]`
    );
    return `[table]\n${[header, ...body].join("\n")}\n[/table]`;
  }

  function closeLocalSyntaxTools(tools) {
    const trigger = tools?.querySelector?.(".cc98-local-syntax-trigger");
    const panel = tools?.querySelector?.(".cc98-local-syntax-popover");
    if (!(trigger instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) {
      return;
    }
    panel.hidden = true;
    tools.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  }

  function positionLocalSyntaxPopover(tools) {
    const trigger = tools?.querySelector?.(".cc98-local-syntax-trigger");
    const panel = tools?.querySelector?.(".cc98-local-syntax-popover");
    if (
      !(trigger instanceof HTMLButtonElement)
      || !(panel instanceof HTMLElement)
      || panel.hidden
      || !trigger.isConnected
    ) {
      return;
    }
    const viewportWidth = Math.max(240, document.documentElement.clientWidth || window.innerWidth);
    const viewportHeight = Math.max(240, document.documentElement.clientHeight || window.innerHeight);
    const edge = 12;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const panelWidth = Math.min(panel.getBoundingClientRect().width || 360, viewportWidth - edge * 2);
    const roomBelow = Math.max(0, viewportHeight - triggerRect.bottom - edge - gap);
    const roomAbove = Math.max(0, triggerRect.top - edge - gap);
    const openAbove = roomBelow < 280 && roomAbove > roomBelow;
    const maximumViewportHeight = Math.max(180, viewportHeight - edge * 2);
    const availableHeight = Math.max(
      180,
      Math.min(maximumViewportHeight, openAbove ? roomAbove : roomBelow)
    );
    const panelHeight = Math.min(panel.scrollHeight || 520, 560, availableHeight);
    const left = Math.max(
      edge,
      Math.min(viewportWidth - panelWidth - edge, triggerRect.right - panelWidth)
    );
    const preferredTop = openAbove
      ? triggerRect.top - gap - panelHeight
      : triggerRect.bottom + gap;
    const top = Math.max(
      edge,
      Math.min(viewportHeight - panelHeight - edge, preferredTop)
    );
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(Math.max(edge, top))}px`;
    panel.style.maxHeight = `${Math.round(panelHeight)}px`;
    panel.dataset.placement = openAbove ? "top" : "bottom";
  }

  let localPopoverPositionFrame = 0;
  function scheduleLocalSyntaxPopoverPosition() {
    if (localPopoverPositionFrame) {
      return;
    }
    localPopoverPositionFrame = window.requestAnimationFrame(() => {
      localPopoverPositionFrame = 0;
      document.querySelectorAll(".cc98-local-syntax-tools.is-open").forEach(positionLocalSyntaxPopover);
    });
  }

  function openLocalSyntaxTools(tools) {
    document.querySelectorAll(".cc98-local-syntax-tools").forEach((other) => {
      if (other !== tools) {
        closeLocalSyntaxTools(other);
      }
    });
    const trigger = tools.querySelector(".cc98-local-syntax-trigger");
    const panel = tools.querySelector(".cc98-local-syntax-popover");
    if (!(trigger instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) {
      return;
    }
    panel.hidden = false;
    tools.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    positionLocalSyntaxPopover(tools);
  }

  function readExtendedUbbTourSeen() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (!settled) {
          settled = true;
          resolve(Boolean(value));
        }
      };
      try {
        const storage = globalThis.chrome?.storage?.local;
        if (!storage?.get) {
          finish(false);
          return;
        }
        const callback = (result) => {
          if (globalThis.chrome?.runtime?.lastError) {
            finish(false);
            return;
          }
          const state = result?.[EXTENDED_UBB_TOUR_STORAGE_KEY];
          finish(state === true || state?.version === EXTENDED_UBB_TOUR_VERSION);
        };
        const pending = storage.get(EXTENDED_UBB_TOUR_STORAGE_KEY, callback);
        if (pending?.then) {
          pending.then(callback).catch(() => finish(false));
        }
      } catch {
        finish(false);
      }
    });
  }

  function rememberExtendedUbbTourSeen() {
    try {
      const pending = globalThis.chrome?.storage?.local?.set?.({
        [EXTENDED_UBB_TOUR_STORAGE_KEY]: {
          version: EXTENDED_UBB_TOUR_VERSION,
          seenAt: Date.now()
        }
      });
      pending?.catch?.(() => {});
    } catch {
      // The in-page dismissal still applies when extension storage is unavailable.
    }
  }

  let activeExtendedUbbTour = null;
  let extendedUbbTourCheckPending = false;
  let extendedUbbTourDismissedForPage = false;

  function closeExtendedUbbTour(options = {}) {
    const layer = activeExtendedUbbTour;
    if (!(layer instanceof HTMLElement)) {
      return;
    }
    const targetTools = layer.__cc98ExtendedUbbTools;
    const shouldRemember = options.remember !== false;
    const shouldOpenTools = options.openTools === true;
    activeExtendedUbbTour = null;
    layer.remove();
    if (shouldRemember) {
      extendedUbbTourDismissedForPage = true;
      rememberExtendedUbbTourSeen();
    } else {
      extendedUbbTourCheckPending = false;
    }
    const currentTools = targetTools?.isConnected
      ? targetTools
      : document.querySelector(".cc98-local-syntax-tools");
    if (shouldOpenTools && currentTools instanceof HTMLElement) {
      currentTools.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          rememberLocalToolbarSelection(currentTools);
          openLocalSyntaxTools(currentTools);
          currentTools.querySelector(".cc98-local-syntax-trigger")?.focus({ preventScroll: true });
        });
      });
    } else if (currentTools instanceof HTMLElement && options.restoreFocus !== false) {
      currentTools.querySelector(".cc98-local-syntax-trigger")?.focus({ preventScroll: true });
    }
  }

  function createExtendedUbbTour(tools) {
    const layer = createElement("div", "cc98-local-syntax-tour-layer");
    layer.__cc98ExtendedUbbTools = tools;
    const dialog = createElement("section", "cc98-local-syntax-tour-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "cc98-extended-ubb-tour-title");
    dialog.setAttribute("aria-describedby", "cc98-extended-ubb-tour-description");

    const header = createElement("header", "cc98-local-syntax-tour-header");
    const titleGroup = createElement("div", "cc98-local-syntax-tour-title-group");
    const title = createElement("h2", "cc98-local-syntax-tour-title");
    title.id = "cc98-extended-ubb-tour-title";
    title.textContent = "扩展 UBB 语法";
    titleGroup.append(title);
    const close = createElement("button", "cc98-local-syntax-tour-close", "×");
    close.type = "button";
    close.title = "关闭导览";
    close.setAttribute("aria-label", "关闭扩展 UBB 语法导览");
    close.addEventListener("click", () => closeExtendedUbbTour());
    header.append(titleGroup, close);

    const description = createElement("p", "cc98-local-syntax-tour-description");
    description.id = "cc98-extended-ubb-tour-description";
    description.textContent = "双区编辑器新增了一组不常用、但很实用的 CC98 语法工具；提交时仍会写回原站 UBB 源码。";

    const featureList = createElement("dl", "cc98-local-syntax-tour-features");
    [
      ["结构排版", "引用、分割线，以及 1 至 6 行列的表格"],
      ["内容块", "可编辑代码块、内嵌 Markdown、块级与行内公式"],
      ["文字媒体", "原样文本、英文字体、命名字体和折叠图片"]
    ].forEach(([term, detail]) => {
      const row = createElement("div", "cc98-local-syntax-tour-feature");
      row.append(
        createElement("dt", "cc98-local-syntax-tour-feature-name", term),
        createElement("dd", "cc98-local-syntax-tour-feature-detail", detail)
      );
      featureList.append(row);
    });

    const tip = createElement("p", "cc98-local-syntax-tour-tip");
    tip.textContent = "选中文字后可直接套用格式；没有选区时，标签会插入当前光标处。";
    const actions = createElement("footer", "cc98-local-syntax-tour-actions");
    const dismiss = createElement("button", "cc98-local-syntax-tour-button", "知道了");
    dismiss.type = "button";
    dismiss.addEventListener("click", () => closeExtendedUbbTour());
    const open = createElement("button", "cc98-local-syntax-tour-button is-primary", "打开扩展语法");
    open.type = "button";
    open.addEventListener("click", () => closeExtendedUbbTour({ openTools: true }));
    actions.append(dismiss, open);
    dialog.append(header, description, featureList, tip, actions);
    layer.append(dialog);
    layer.addEventListener("pointerdown", (event) => {
      if (event.target === layer) {
        event.preventDefault();
        event.stopPropagation();
        closeExtendedUbbTour();
      }
    });
    layer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeExtendedUbbTour();
        return;
      }
      if (event.key === "Tab") {
        const focusable = [...dialog.querySelectorAll("button:not([disabled])")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) {
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    });
    return layer;
  }

  async function maybeShowExtendedUbbTour(tools) {
    if (
      extendedUbbTourCheckPending
      || extendedUbbTourDismissedForPage
      || activeExtendedUbbTour
      || !(tools instanceof HTMLElement)
    ) {
      return;
    }
    extendedUbbTourCheckPending = true;
    const seen = await readExtendedUbbTourSeen();
    extendedUbbTourCheckPending = false;
    if (seen || extendedUbbTourDismissedForPage || activeExtendedUbbTour) {
      return;
    }
    const currentTools = tools.isConnected
      ? tools
      : document.querySelector(".cc98-local-syntax-tools");
    if (!(currentTools instanceof HTMLElement)) {
      return;
    }
    const layer = createExtendedUbbTour(currentTools);
    activeExtendedUbbTour = layer;
    document.body.append(layer);
    window.requestAnimationFrame(() => {
      layer.querySelector(".cc98-local-syntax-tour-button.is-primary")?.focus({ preventScroll: true });
    });
  }

  function scheduleExtendedUbbTour(tools) {
    if (!EXTENDED_UBB_TOUR_AUTO_ENABLED) {
      return;
    }
    window.setTimeout(() => {
      void maybeShowExtendedUbbTour(tools);
    }, 260);
  }

  function createLocalSyntaxCommandButton(tools, command) {
    const button = createElement("button", "cc98-local-syntax-command");
    button.type = "button";
    button.textContent = command.label;
    button.title = command.hint;
    button.dataset.command = command.id;
    button.addEventListener("pointerdown", (event) => {
      rememberLocalToolbarSelection(tools);
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const options = Object.prototype.hasOwnProperty.call(command, "replacement")
        ? { replacement: command.replacement }
        : { before: command.before, after: command.after };
      const result = applyLocalSyntaxEdit(tools, options, `${command.label}已应用。`);
      if (result?.applied) {
        closeLocalSyntaxTools(tools);
      }
    });
    return button;
  }

  function createLocalTablePicker(tools) {
    const section = createElement("section", "cc98-local-syntax-section cc98-local-table-section");
    const heading = createElement("div", "cc98-local-syntax-section-heading");
    const title = createElement("span", "cc98-local-syntax-section-title");
    const sizeLabel = createElement("span", "cc98-local-table-size");
    title.textContent = "插入表格";
    sizeLabel.textContent = "1 × 1";
    heading.append(title, sizeLabel);
    const grid = createElement("div", "cc98-local-table-grid");
    grid.setAttribute("role", "grid");
    const cells = [];
    const updateHighlight = (rows, columns) => {
      sizeLabel.textContent = `${rows} × ${columns}`;
      cells.forEach((cell) => {
        cell.classList.toggle(
          "is-selected",
          Number(cell.dataset.row) <= rows && Number(cell.dataset.column) <= columns
        );
      });
    };
    for (let row = 1; row <= 6; row += 1) {
      for (let column = 1; column <= 6; column += 1) {
        const cell = createElement("button", "cc98-local-table-cell");
        cell.type = "button";
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", `${row} 行 ${column} 列`);
        cell.addEventListener("pointerenter", () => updateHighlight(row, column));
        cell.addEventListener("pointerdown", (event) => {
          rememberLocalToolbarSelection(tools);
          event.preventDefault();
          event.stopPropagation();
        });
        cell.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const result = applyLocalSyntaxEdit(
            tools,
            { replacement: buildTableUbb(row, column) },
            `已插入 ${row} × ${column} 表格。`
          );
          if (result?.applied) {
            closeLocalSyntaxTools(tools);
          }
        });
        cells.push(cell);
        grid.append(cell);
      }
    }
    grid.addEventListener("pointerleave", () => updateHighlight(1, 1));
    updateHighlight(1, 1);
    section.append(heading, grid);
    return section;
  }

  function createLocalHiddenImageControl(tools) {
    const section = createElement("section", "cc98-local-syntax-section cc98-local-image-section");
    const label = createElement("label", "cc98-local-syntax-section-title");
    label.textContent = "隐藏图片";
    const form = createElement("form", "cc98-local-syntax-inline-controls");
    const input = createElement("input", "cc98-local-syntax-input");
    input.type = "url";
    input.placeholder = "图片 URL（也可先选中地址）";
    input.setAttribute("aria-label", "隐藏图片地址");
    input.addEventListener("pointerdown", () => rememberLocalToolbarSelection(tools));
    const submit = createElement("button", "cc98-local-syntax-apply");
    submit.type = "submit";
    submit.textContent = "插入";
    submit.addEventListener("pointerdown", () => rememberLocalToolbarSelection(tools));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const url = String(input.value || "").trim();
      const result = applyLocalSyntaxEdit(
        tools,
        url
          ? { replacement: `[img=1]${url}[/img]` }
          : { before: "[img=1]", after: "[/img]" },
        "隐藏图片语法已插入。"
      );
      if (result?.applied) {
        input.value = "";
        closeLocalSyntaxTools(tools);
      }
    });
    form.append(input, submit);
    section.append(label, form);
    return section;
  }

  function createLocalSyntaxTools(toolbar) {
    const tools = createElement("span", "cc98-local-syntax-tools");
    const trigger = createElement("button", "cc98-local-syntax-trigger");
    trigger.type = "button";
    trigger.textContent = "扩展";
    trigger.title = "扩展语法工具";
    trigger.setAttribute("aria-label", "扩展语法工具");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    const panel = createElement("div", "cc98-local-syntax-popover");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "扩展 UBB 语法工具");
    const header = createElement("header", "cc98-local-syntax-header");
    const heading = createElement("strong", "cc98-local-syntax-heading");
    heading.textContent = "扩展 UBB 语法";
    const close = createElement("button", "cc98-local-syntax-close");
    close.type = "button";
    close.textContent = "×";
    close.title = "关闭";
    close.setAttribute("aria-label", "关闭扩展语法工具");
    close.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeLocalSyntaxTools(tools);
      trigger.focus({ preventScroll: true });
    });
    header.append(heading, close);

    const commandGrid = createElement("div", "cc98-local-syntax-command-grid");
    localSyntaxCommands.forEach((command) => {
      commandGrid.append(createLocalSyntaxCommandButton(tools, command));
    });
    const status = createElement("p", "cc98-local-syntax-status");
    status.setAttribute("role", "status");
    status.textContent = "选中内容后点击工具；未选中时会把光标放在标签内。";
    panel.append(
      header,
      commandGrid,
      createLocalTablePicker(tools),
      createLocalHiddenImageControl(tools),
      status
    );

    trigger.addEventListener("pointerdown", (event) => {
      rememberLocalToolbarSelection(tools);
      event.preventDefault();
      event.stopPropagation();
    });
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (panel.hidden) {
        openLocalSyntaxTools(tools);
      } else {
        closeLocalSyntaxTools(tools);
      }
    });
    panel.addEventListener("click", (event) => event.stopPropagation());
    tools.append(trigger, panel);
    const nativeActions = toolbar.querySelector(":scope > .cc98-rebuild-dual-ubb-toolbar-actions");
    toolbar.insertBefore(tools, nativeActions || null);
    scheduleExtendedUbbTour(tools);
    return tools;
  }

  let localToolbarRefreshFrame = 0;
  function ensureLocalSyntaxToolbars() {
    localToolbarRefreshFrame = 0;
    const toolbars = document.querySelectorAll(".cc98-rebuild-native-editor .ubb-buttons, .cc98-rebuild-native-editor .ubb-toolbar");
    if (!toolbars.length && activeExtendedUbbTour) {
      closeExtendedUbbTour({ remember: false, restoreFocus: false });
    }
    toolbars.forEach((toolbar) => {
      if (!(toolbar instanceof HTMLElement) || toolbar.querySelector(":scope > .cc98-local-syntax-tools")) {
        return;
      }
      if (findDualEditorForToolbar(toolbar)) {
        createLocalSyntaxTools(toolbar);
      }
    });
  }

  function scheduleLocalSyntaxToolbarRefresh() {
    if (localToolbarRefreshFrame) {
      return;
    }
    localToolbarRefreshFrame = window.requestAnimationFrame(ensureLocalSyntaxToolbars);
  }

  document.addEventListener("pointerdown", (event) => {
    document.querySelectorAll(".cc98-local-syntax-tools").forEach((tools) => {
      if (!tools.contains(event.target)) {
        closeLocalSyntaxTools(tools);
      }
    });
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    document.querySelectorAll(".cc98-local-syntax-tools").forEach(closeLocalSyntaxTools);
  }, true);
  window.addEventListener("resize", scheduleLocalSyntaxPopoverPosition, { passive: true });
  window.addEventListener("scroll", (event) => {
    if (event.target instanceof Element && event.target.closest(".cc98-local-syntax-popover")) {
      return;
    }
    scheduleLocalSyntaxPopoverPosition();
  }, { passive: true, capture: true });

  const localToolbarObserver = new MutationObserver(scheduleLocalSyntaxToolbarRefresh);
  const startLocalToolbarObserver = () => {
    if (!document.body) {
      return;
    }
    localToolbarObserver.observe(document.body, { childList: true, subtree: true });
    scheduleLocalSyntaxToolbarRefresh();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startLocalToolbarObserver, { once: true });
  } else {
    startLocalToolbarObserver();
  }

  window.CC98RebornExtendedUbb = Object.freeze({
    version: "1",
    shouldHandle(source) {
      return extendedTagPattern.test(String(source || ""));
    },
    render,
    normalizeEditableCodeBlocks: normalizeEscapedEditableCodeBlocks,
    serializeEditableMarkdown
  });
})();
