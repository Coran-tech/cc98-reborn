(function exposeMarkupConverter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CC98RebornMarkupConverter = api;
  }
})(typeof globalThis === "object" ? globalThis : this, function createMarkupConverter() {
  "use strict";

  const pairedTags = new Set([
    "b", "i", "u", "s", "del", "url", "img", "quote", "code", "md",
    "table", "tr", "th", "td", "color", "size", "font", "align",
    "left", "center", "right", "replyview", "noubb", "audio", "mp3",
    "video", "bili", "bilibili", "upload", "math", "m", "english",
    "cursor", "topic", "board", "pm", "user"
  ]);
  const rawTags = new Set(["code", "md", "img", "noubb"]);
  const singleTags = new Set(["line", "needreply", "posteronly", "allowviewer"]);
  const privateTags = new Set(["replyview", "needreply", "posteronly", "allowviewer"]);

  function parseUbb(source) {
    const root = { tag: "", children: [] };
    const stack = [root];
    const tokenPattern = /\[(\/?)([a-z][a-z0-9-]*)(?:=([^\]]*))?\]/iy;
    let index = 0;
    const appendText = (text) => {
      if (text) stack.at(-1).children.push({ text });
    };
    while (index < source.length) {
      const open = source.indexOf("[", index);
      if (open < 0) {
        appendText(source.slice(index));
        break;
      }
      appendText(source.slice(index, open));
      tokenPattern.lastIndex = open;
      const token = tokenPattern.exec(source);
      if (!token) {
        appendText("[");
        index = open + 1;
        continue;
      }
      const [literal, slash, name, parameter = ""] = token;
      const tag = name.toLowerCase();
      index = open + literal.length;
      if (slash) {
        const current = stack.at(-1);
        if (current.tag === tag) {
          current.close = literal;
          current.rawSource = source.slice(current.start, index);
          stack.pop();
        } else {
          appendText(literal);
        }
        continue;
      }
      if (singleTags.has(tag)) {
        stack.at(-1).children.push({ tag, open: literal, rawSource: literal, children: [] });
        continue;
      }
      if (!pairedTags.has(tag)) {
        appendText(literal);
        continue;
      }
      if (rawTags.has(tag)) {
        const closingPattern = new RegExp(`\\[\\/${tag}\\]`, "ig");
        closingPattern.lastIndex = index;
        const closing = closingPattern.exec(source);
        if (!closing) {
          appendText(literal);
          continue;
        }
        const end = closing.index + closing[0].length;
        stack.at(-1).children.push({
          tag, parameter, open: literal, close: closing[0],
          raw: source.slice(index, closing.index),
          rawSource: source.slice(open, end), children: []
        });
        index = end;
        continue;
      }
      const node = { tag, parameter, open: literal, close: "", start: open, children: [] };
      stack.at(-1).children.push(node);
      stack.push(node);
    }
    return root;
  }

  function escapeMarkdown(text) {
    return String(text || "")
      .replace(/\\/g, "\\\\")
      .replace(/([`*_\[\]~])/g, "\\$1")
      .replace(/(^|\n)([ \t]{0,3})(#{1,6}|>|[-+] |\d+[.)] )/g, "$1$2\\$3");
  }

  function safeAddress(value) {
    const candidate = String(value || "").trim();
    if (!candidate || /[\]\r\n<>]/.test(candidate)) return "";
    if (/^\/(?!\/)/.test(candidate)) return candidate;
    if (/^https?:\/\//i.test(candidate)) {
      try {
        const parsed = new URL(candidate);
        return parsed.hostname ? candidate : "";
      } catch {
        return "";
      }
    }
    return "";
  }

  function markdownAddress(value) {
    return encodeURI(value).replace(/[()]/g, (character) => character === "(" ? "%28" : "%29");
  }

  function rawUbbNode(node) {
    if (node.text !== undefined) return node.text;
    if (node.rawSource) return node.rawSource;
    return node.open + node.children.map(rawUbbNode).join("") + (node.close || "");
  }

  function convertUbbToMarkdown(input) {
    const source = String(input ?? "").replace(/\r\n?/g, "\n");
    const warnings = new Set();
    let blocked = /\[(?:\/?)(?:replyview|needreply|posteronly|allowviewer|hide)(?:=|\])/i.test(source);
    const warn = (message) => warnings.add(message);
    if (blocked) warn("包含可见性或权限标签；为避免改变阅读权限，不允许直接替换正文");
    const children = (node, ancestors = []) => node.children
      .map((child) => render(child, [...ancestors, node.tag])).join("");
    const renderTable = (node) => {
      const rows = node.children.filter((child) => child.tag === "tr");
      if (!rows.length || node.children.some((child) => child.tag !== "tr" && child.text?.trim())
        || rows.some((row) => row.children.some((cell) => cell.parameter))) {
        warn("复杂表格无法可靠转换，已保留 UBB 原文");
        return rawUbbNode(node);
      }
      const lines = rows.map((row) => row.children
        .filter((cell) => cell.tag === "th" || cell.tag === "td")
        .map((cell) => children(cell).replace(/\|/g, "\\|").replace(/\n/g, "<br>")));
      const width = Math.max(0, ...lines.map((line) => line.length));
      if (!width || rows.some((row) => row.children.some((cell) =>
        cell.tag && cell.tag !== "th" && cell.tag !== "td"))) {
        warn("复杂表格无法可靠转换，已保留 UBB 原文");
        return rawUbbNode(node);
      }
      const rowText = (cells) => `| ${Array.from({ length: width }, (_, index) => cells[index] || "").join(" | ")} |`;
      return `\n\n${rowText(lines[0])}\n${rowText(Array(width).fill("---"))}\n${lines.slice(1).map(rowText).join("\n")}\n\n`;
    };
    const render = (node, ancestors = []) => {
      if (node.text !== undefined) return escapeMarkdown(node.text);
      const tag = node.tag;
      if (privateTags.has(tag)) {
        blocked = true;
        warn("包含可见性或权限标签；为避免改变阅读权限，不允许直接替换正文");
        return rawUbbNode(node);
      }
      if (tag === "line") return "\n\n---\n\n";
      if (!node.close) {
        warn(`未闭合的 [${tag}] 已保留原文`);
        return rawUbbNode(node);
      }
      if (tag === "md") return node.raw;
      if (tag === "code") {
        const longest = Math.max(0, ...[...node.raw.matchAll(/`+/g)].map((match) => match[0].length));
        const fence = "`".repeat(Math.max(3, longest + 1));
        return `\n\n${fence}\n${node.raw.replace(/\n$/, "")}\n${fence}\n\n`;
      }
      if (tag === "img") {
        const address = safeAddress(node.raw);
        if (address) return `![](${markdownAddress(address)})`;
        warn("无法识别的图片地址已保留 UBB 原文");
        return rawUbbNode(node);
      }
      if (tag === "noubb") return escapeMarkdown(node.raw);
      if (tag === "table") return renderTable(node);
      if (tag === "quote") {
        const quoted = children(node, ancestors).replace(/^\n+|\n+$/g, "");
        return `\n\n${quoted.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
      }
      if (tag === "url") {
        const label = children(node, ancestors);
        const address = safeAddress(node.parameter || node.children.map(rawUbbNode).join(""));
        if (address) return `[${label}](${markdownAddress(address)})`;
        warn("无法识别的链接已保留 UBB 原文");
        return rawUbbNode(node);
      }
      if (tag === "b") return ancestors.includes("b")
        ? children(node, ancestors) : `**${children(node, ancestors)}**`;
      if (tag === "i") return ancestors.includes("i")
        ? children(node, ancestors) : `_${children(node, ancestors)}_`;
      if (tag === "s" || tag === "del") return ancestors.includes("s") || ancestors.includes("del")
        ? children(node, ancestors) : `~~${children(node, ancestors)}~~`;
      if (tag === "u") {
        warn("下划线在 Markdown 中无等价语法，已保留文字");
        return children(node, ancestors);
      }
      warn(`[${tag}] 在 Markdown 中无等价语法，已保留原文`);
      return rawUbbNode(node);
    };
    const rendered = parseUbb(source).children.map((node) => render(node)).join("");
    if (/\[(?:cc98\d{2}|ac(?:\d{2}|\d{4})|[acf]:\d{3}|tb\d{2}|ms\d{2}|em\d{2})\]/i.test(source)) {
      warn("表情代码已保留；请检查 Markdown 模式中的显示效果");
    }
    const core = rendered.replace(/^\n+|\n+$/g, "");
    const output = core
      ? `${source.match(/^\n*/)[0]}${core}${source.match(/\n*$/)[0]}`
      : (source.trim() ? "" : source);
    return { output, warnings: [...warnings], blocked };
    return { output, warnings: [...warnings], blocked };
  }

  function convertMarkdownToUbb(input, options = {}) {
    const source = String(input ?? "").replace(/\r\n?/g, "\n");
    const documentRef = options.document || globalThis.document;
    const Showdown = options.showdown || globalThis.showdown;
    if (!documentRef?.createElement || !Showdown?.Converter) {
      return { output: "", warnings: ["Markdown 解析器不可用"], blocked: true };
    }
    const converter = new Showdown.Converter({
      tables: true, strikethrough: true, ghCodeBlocks: true, tasklists: true
    });
    const template = documentRef.createElement("template");
    template.innerHTML = converter.makeHtml(source);
    const warnings = new Set();
    let blocked = false;
    const children = (node) => [...node.childNodes].map(render).join("");
    const renderText = (value) => {
      const text = String(value || "");
      if (!/\[(?:\/?[a-z][a-z0-9-]*(?:=[^\]]*)?)\]/i.test(text)) return text;
      if (/\[\/noubb\]/i.test(text)) {
        blocked = true;
        warnings.add("原文含无法安全包裹的 UBB 结束标签；不允许直接替换正文");
        return text;
      }
      warnings.add("形似 UBB 标签的普通文字已用 [noubb] 保护");
      return `[noubb]${text}[/noubb]`;
    };
    const renderTable = (table) => {
      const rows = table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr");
      return `[table]\n${[...rows].map((row) => `[tr]${[...row.children].map((cell) => {
        const tag = cell.tagName.toLowerCase() === "th" ? "th" : "td";
        return `[${tag}]${children(cell)}[/${tag}]`;
      }).join("")}[/tr]`).join("\n")}\n[/table]\n\n`;
    };
    const render = (node) => {
      if (node.nodeType === 3) return renderText(node.nodeValue);
      if (node.nodeType !== 1) return "";
      const tag = node.tagName.toLowerCase();
      if (node.hasAttribute("style")) warnings.add("HTML 行内样式无法完整保留");
      if (["script", "style", "iframe", "object", "embed", "form", "meta", "link", "base"].includes(tag)) {
        blocked = true;
        warnings.add("Markdown 含不可转换的 HTML 元素，已忽略；不允许直接替换正文");
        return "";
      }
      if (tag === "strong" || tag === "b") return `[b]${children(node)}[/b]`;
      if (tag === "em" || tag === "i") return `[i]${children(node)}[/i]`;
      if (["del", "s", "strike"].includes(tag)) return `[del]${children(node)}[/del]`;
      if (tag === "u") return `[u]${children(node)}[/u]`;
      if (tag === "a") {
        const address = safeAddress(node.getAttribute("href"));
        if (address) return `[url=${address}]${children(node)}[/url]`;
        warnings.add("不安全或无法识别的链接地址已去除");
        return children(node);
      }
      if (tag === "img") {
        const address = safeAddress(node.getAttribute("src"));
        if (address) {
          if (node.getAttribute("alt")) warnings.add("图片替代文字无法保留");
          return `[img]${address}[/img]`;
        }
        warnings.add("不安全或无法识别的图片地址已去除");
        return node.getAttribute("alt") || "";
      }
      if (tag === "br") return "\n";
      if (tag === "hr") return "\n[line]\n";
      if (tag === "pre") {
        const code = node.textContent || "";
        if (/\[\/code\]/i.test(code)) {
          blocked = true;
          warnings.add("代码块内含 UBB 结束标签，无法安全转换；不允许直接替换正文");
        }
        return `[code]${code.replace(/\n$/, "")}[/code]\n\n`;
      }
      if (tag === "code") {
        warnings.add("行内代码无独立 UBB 样式，已保留文字");
        return node.textContent || "";
      }
      if (tag === "blockquote") return `[quote]${children(node).trim()}[/quote]\n\n`;
      if (tag === "table") return renderTable(node);
      if (/^h[1-6]$/.test(tag)) {
        warnings.add("Markdown 标题已近似转换为加粗字号");
        return `[size=5][b]${children(node)}[/b][/size]\n\n`;
      }
      if (tag === "ul" || tag === "ol") {
        warnings.add("列表已转换为普通文本行");
        return [...node.children].map((item, index) => `${tag === "ol" ? `${index + 1}.` : "•"} ${children(item).trim()}`).join("\n") + "\n\n";
      }
      if (tag === "p" || tag === "div") return `${children(node)}\n\n`;
      if (tag === "input") return node.hasAttribute("checked") ? "[x] " : "[ ] ";
      if (tag === "sup" || tag === "sub") warnings.add(`HTML <${tag}> 样式无法保留`);
      if (!["span", "section", "article", "li", "sup", "sub"].includes(tag)) {
        warnings.add(`HTML <${tag}> 样式无法完全保留`);
      }
      return children(node);
    };
    const rendered = children(template.content);
    const output = rendered.replace(/\n+$/g, "") + (source.match(/\n*$/)[0] || "");
    return { output, warnings: [...warnings], blocked };
  }

  return Object.freeze({ convertUbbToMarkdown, convertMarkdownToUbb });
});
