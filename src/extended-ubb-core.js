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
    buildSourceEdit,
    buildTableUbb,
    hasSelection,
    normalizeRange,
    preferSavedSelection
  });
});
