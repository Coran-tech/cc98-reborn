(function exposeExtendedUbbCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CC98RebornExtendedUbbCore = api;
  }
})(typeof globalThis === "object" ? globalThis : this, function createExtendedUbbCore() {
  "use strict";

  function normalizeRange(range, sourceLength) {
    const length = Math.max(0, Number(sourceLength) || 0);
    const start = Math.max(0, Math.min(length, Number(range?.start) || 0));
    const end = Math.max(start, Math.min(length, Number(range?.end) || start));
    return { start, end };
  }

  function hasSelection(range) {
    return Boolean(range && Number(range.end) > Number(range.start));
  }

  function preferSavedSelection(liveSelection, savedSelection) {
    if (hasSelection(savedSelection) && !hasSelection(liveSelection)) {
      return {
        ...savedSelection,
        start: Number(savedSelection.start),
        end: Number(savedSelection.end)
      };
    }
    const selected = liveSelection || savedSelection || { start: 0, end: 0 };
    return {
      ...selected,
      start: Number(selected.start) || 0,
      end: Number(selected.end) || 0
    };
  }

  function buildSourceEdit(source, range, options = {}) {
    const sourceValue = String(source ?? "").replace(/[\u200b\uFEFF]/g, "");
    const selection = normalizeRange(range, sourceValue.length);
    const selected = sourceValue.slice(selection.start, selection.end);
    if (options.requireSelection && !selected) {
      return {
        applied: false,
        reason: "selection-required",
        selected,
        start: selection.start,
        end: selection.end
      };
    }

    const before = String(options.before || "");
    const after = String(options.after || "");
    const hasReplacement = Object.prototype.hasOwnProperty.call(options, "replacement");
    const inserted = hasReplacement
      ? (typeof options.replacement === "function"
        ? String(options.replacement(selected) ?? "")
        : String(options.replacement ?? ""))
      : `${before}${selected}${after}`;
    const nextValue = `${sourceValue.slice(0, selection.start)}${inserted}${sourceValue.slice(selection.end)}`;
    const defaultStartOffset = hasReplacement ? inserted.length : before.length;
    const requestedStart = Number(options.selectionStartOffset);
    const requestedEnd = Number(options.selectionEndOffset);
    const startOffset = Number.isFinite(requestedStart) ? requestedStart : defaultStartOffset;
    const endOffset = Number.isFinite(requestedEnd)
      ? requestedEnd
      : (selected && !hasReplacement ? before.length + selected.length : startOffset);
    const nextStart = Math.max(selection.start, Math.min(selection.start + inserted.length, selection.start + startOffset));
    const nextEnd = Math.max(nextStart, Math.min(selection.start + inserted.length, selection.start + endOffset));

    return {
      applied: true,
      selected,
      inserted,
      start: selection.start,
      end: selection.end,
      nextValue,
      nextSelection: { start: nextStart, end: nextEnd }
    };
  }

  function normalizeTableDimension(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 1;
    }
    return Math.max(1, Math.min(6, Math.trunc(numeric)));
  }

  function applyFontToSource(source, range, font) {
    return applyTypographyToSource(source, range, "font", font);
  }

  function applyTypographyToSource(source, range, property, setting) {
    const value = String(source ?? "");
    const clear = setting === null;
    const normalized = String(setting ?? "").trim();
    if (!["font", "size"].includes(property) || (!clear && (
      property === "font"
        ? (!normalized || normalized.length > 80 || /[\[\]\r\n;{}<>]/.test(normalized))
        : !/^[1-7]$/.test(normalized)
    ))) {
      return null;
    }
    let { start, end } = normalizeRange(range, value.length);
    const propertyTags = new Set(property === "font" ? ["font", "english"] : ["size"]);
    const rawTags = new Set(["code", "md", "noubb", "img", "upload", "audio", "mp3", "video", "bili", "bilibili", "math", "m"]);
    const tokens = /\[(\/?)(b|i|u|s|del|url|color|size|font|align|left|center|right|quote|table|tr|th|td|replyview|english|cursor|topic|board|pm|user|code|md|noubb|img|upload|audio|mp3|video|bili|bilibili|math|m)(?:=[^\]]*)?\]/ig;
    const stack = [];
    const nodes = [];
    let match;
    while ((match = tokens.exec(value))) {
      const tag = match[2].toLowerCase();
      if (!match[1] && rawTags.has(tag)) {
        const closing = new RegExp(`\\[/${tag}\\]`, "ig");
        closing.lastIndex = tokens.lastIndex;
        const close = closing.exec(value);
        if (close) {
          nodes.push({ tag, start: match.index, contentStart: tokens.lastIndex,
            contentEnd: close.index, end: closing.lastIndex, raw: true, children: [] });
          tokens.lastIndex = closing.lastIndex;
        }
      } else if (!match[1]) {
        stack.push({ tag, start: match.index, contentStart: tokens.lastIndex, children: [] });
      } else if (stack.at(-1)?.tag === tag) {
        nodes.push({ ...stack.pop(), contentEnd: match.index, end: tokens.lastIndex });
      }
    }

    // Cut balanced containers, not just font tokens: [font][b]text[/b][/font]
    // must retain bold on both sides without creating crossed closing tags.
    const root = { contentStart: 0, contentEnd: value.length, children: [] };
    const parents = [root];
    nodes.sort((left, right) => left.start - right.start);
    for (const node of nodes) {
      while (parents.length > 1 && node.start >= parents.at(-1).contentEnd) {
        parents.pop();
      }
      parents.at(-1).children.push(node);
      if (!node.raw) {
        parents.push(node);
      }
      if (node.raw && ((start > node.start && start < node.end) || (end > node.start && end < node.end))) {
        return null;
      }
      for (const [tokenStart, tokenEnd] of [[node.start, node.contentStart], [node.contentEnd, node.end]]) {
        if (start > tokenStart && start < tokenEnd) {
          if (start === end) {
            return null;
          }
          start = tokenStart;
        }
        if (end > tokenStart && end < tokenEnd) {
          end = tokenEnd;
        }
      }
    }

    let scope = root;
    let child;
    while ((child = scope.children.find((node) => !node.raw && !propertyTags.has(node.tag)
      && start >= node.contentStart && end <= node.contentEnd))) {
      scope = child;
    }
    const sliceChildren = (parent, from, to, stripProperty) => {
      let result = "";
      let cursor = parent.contentStart;
      for (const node of parent.children) {
        const gapStart = Math.max(from, cursor);
        const gapEnd = Math.min(to, node.start);
        if (gapEnd > gapStart) {
          result += value.slice(gapStart, gapEnd);
        }
        if (node.end > from && node.start < to) {
          const full = from <= node.start && to >= node.end;
          if (node.raw || (full && !stripProperty)) {
            result += value.slice(node.start, node.end);
          } else {
            const content = sliceChildren(node, Math.max(from, node.contentStart), Math.min(to, node.contentEnd), stripProperty);
            if (stripProperty && propertyTags.has(node.tag)) {
              result += content;
            } else if (content || full) {
              result += value.slice(node.start, node.contentStart) + content + value.slice(node.contentEnd, node.end);
            }
          }
        }
        cursor = node.end;
      }
      const tailStart = Math.max(from, cursor);
      const tailEnd = Math.min(to, parent.contentEnd);
      return result + (tailEnd > tailStart ? value.slice(tailStart, tailEnd) : "");
    };
    const before = value.slice(0, scope.contentStart) + sliceChildren(scope, scope.contentStart, start, false);
    const selected = sliceChildren(scope, start, end, true);
    const after = sliceChildren(scope, end, scope.contentEnd, false) + value.slice(scope.contentEnd);
    const opening = clear ? "" : `[${property}=${normalized}]`;
    const closing = clear ? "" : `[/${property}]`;
    return {
      value: `${before}${opening}${selected}${closing}${after}`,
      start: before.length + opening.length,
      end: before.length + opening.length + selected.length
    };
  }

  function buildTableUbb(rowCount, columnCount) {
    const rows = normalizeTableDimension(rowCount);
    const columns = normalizeTableDimension(columnCount);
    const header = `[tr]${Array.from({ length: columns }, () => "[th][/th]").join("")}[/tr]`;
    const body = Array.from(
      { length: Math.max(0, rows - 1) },
      () => `[tr]${Array.from({ length: columns }, () => "[td][/td]").join("")}[/tr]`
    );
    return `[table]\n${[header, ...body].join("\n")}\n[/table]`;
  }

  return Object.freeze({
    applyFontToSource,
    applyTypographyToSource,
    buildSourceEdit,
    buildTableUbb,
    hasSelection,
    normalizeRange,
    preferSavedSelection
  });
});
