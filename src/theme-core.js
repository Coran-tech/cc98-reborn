(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornThemeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    themeStyle: "modern",
    themeMode: "light",
    themePalette: "teal",
    themeCustomPrimary: "#1f7166",
    themeCustomSecondary: "#326b9b",
    themeDayStart: "07:00",
    themeNightStart: "19:00"
  });
  const PALETTES = Object.freeze([
    { id: "teal", primary: "#1f7166", secondary: "#326b9b" },
    { id: "green", primary: "#3e744f", secondary: "#80682e" },
    { id: "blue", primary: "#326fa9", secondary: "#735baa" },
    { id: "violet", primary: "#7957a5", secondary: "#26747b" },
    { id: "rose", primary: "#a34e70", secondary: "#5e7040" },
    { id: "amber", primary: "#92621d", secondary: "#486e92" }
  ].map(Object.freeze));
  const PALETTE_IDS = new Set([...PALETTES.map((item) => item.id), "custom"]);
  const CUSTOM_PROPERTIES = Object.freeze([
    "--cc98-comfort-accent", "--cc98-comfort-accent-2",
    "--cc98-comfort-secondary", "--cc98-comfort-secondary-soft", "--cc98-comfort-link"
  ]);
  const LEGACY = Object.freeze({
    soft: ["light", "teal"], mist: ["light", "blue"], night: ["dark", "teal"],
    sage: ["light", "green"], lake: ["light", "blue"], rose: ["light", "rose"],
    graphite: ["dark", "green"], midnight: ["dark", "blue"], wine: ["dark", "rose"]
  });

  function isValidTime(value) {
    return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function normalizeColor(value, fallback = "") {
    if (typeof value !== "string") return fallback;
    const color = value.trim().toLowerCase();
    if (/^#[\da-f]{6}$/.test(color)) return color;
    if (/^#[\da-f]{3}$/.test(color)) return `#${[...color.slice(1)].map((digit) => digit + digit).join("")}`;
    return fallback;
  }

  function normalize(raw = {}) {
    if (!raw || typeof raw !== "object") raw = {};
    const legacy = Object.hasOwn(LEGACY, raw.theme) ? LEGACY[raw.theme] : LEGACY.soft;
    const day = isValidTime(raw.themeDayStart) ? raw.themeDayStart : DEFAULTS.themeDayStart;
    const night = isValidTime(raw.themeNightStart) ? raw.themeNightStart : DEFAULTS.themeNightStart;
    return {
      themeStyle: ["modern", "ascii"].includes(raw.themeStyle) ? raw.themeStyle : DEFAULTS.themeStyle,
      themeMode: ["light", "dark", "auto"].includes(raw.themeMode) ? raw.themeMode : legacy[0],
      themePalette: PALETTE_IDS.has(raw.themePalette) ? raw.themePalette : legacy[1],
      themeCustomPrimary: normalizeColor(raw.themeCustomPrimary, DEFAULTS.themeCustomPrimary),
      themeCustomSecondary: normalizeColor(raw.themeCustomSecondary, DEFAULTS.themeCustomSecondary),
      // Equal boundaries cannot define a day/night cycle. Recover corrupt stored data.
      themeDayStart: day === night ? DEFAULTS.themeDayStart : day,
      themeNightStart: day === night ? DEFAULTS.themeNightStart : night
    };
  }

  function toMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function resolveTone(raw, date = new Date()) {
    const settings = normalize(raw);
    if (settings.themeMode !== "auto") return settings.themeMode;
    const minute = date.getHours() * 60 + date.getMinutes();
    const day = toMinutes(settings.themeDayStart);
    const night = toMinutes(settings.themeNightStart);
    const light = day < night ? minute >= day && minute < night : minute >= day || minute < night;
    return light ? "light" : "dark";
  }

  function rgb(color) {
    return [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  }

  function mix(first, second, weight) {
    const other = rgb(second);
    return `#${rgb(first).map((channel, index) => Math.round(channel * weight + other[index] * (1 - weight)).toString(16).padStart(2, "0")).join("")}`;
  }

  function luminance(color) {
    const [r, g, b] = rgb(color).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(first, second) {
    const a = luminance(first), b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function resolveCustomColors(raw, tone = resolveTone(raw)) {
    const settings = normalize(raw);
    const dark = tone === "dark";
    const surface = dark ? "#212428" : "#ffffff";
    const surface2 = dark ? "#2b2e33" : "#f0f1f3";
    const surfaces = dark ? ["#16181b", surface, surface2, "#353940"] : ["#f6f7f8", surface, surface2, "#e6e8eb"];
    const adapt = (base) => {
      // Retain the selected hue while adjusting brightness for each tone.
      // Also check the existing UI's strongest tinted button backgrounds.
      for (let step = 0; step <= 255; step += 1) {
        const color = mix(dark ? "#ffffff" : "#000000", base, step / 255);
        const backgrounds = [...surfaces, mix(color, surface, 0.22), mix(color, surface2, 0.16)];
        if (backgrounds.every((background) => contrast(color, background) >= 4.6)) return color;
      }
      return dark ? "#ffffff" : "#000000";
    };
    const primary = adapt(settings.themeCustomPrimary);
    const secondary = adapt(settings.themeCustomSecondary);
    return {
      primary, primarySoft: mix(primary, surface, dark ? 0.16 : 0.08),
      secondary, secondarySoft: mix(secondary, surface, dark ? 0.16 : 0.08)
    };
  }

  function apply(root, raw, date = new Date()) {
    const settings = normalize(raw);
    const tone = resolveTone(settings, date);
    const values = {
      cc98ComfortStyle: settings.themeStyle,
      cc98ComfortTone: tone,
      cc98ComfortPalette: settings.themePalette,
      cc98ComfortMode: settings.themeMode,
      // Keep the legacy attribute for integrations; palette and tone are independent now.
      cc98ComfortTheme: tone === "dark" ? "night" : "soft"
    };
    for (const [key, value] of Object.entries(values)) {
      if (root.dataset[key] !== value) root.dataset[key] = value;
    }
    const custom = settings.themePalette === "custom"
      && (raw?.enabled !== false || root.classList?.contains("cc98-reborn-popup"));
    if (custom) {
      const colors = resolveCustomColors(settings, tone);
      const overrides = [colors.primary, colors.primarySoft, colors.secondary, colors.secondarySoft, colors.secondary];
      CUSTOM_PROPERTIES.forEach((property, index) => {
        if (root.style?.getPropertyValue(property) !== overrides[index]) root.style?.setProperty(property, overrides[index]);
      });
    } else {
      CUSTOM_PROPERTIES.forEach((property) => {
        if (root.style?.getPropertyValue(property)) root.style.removeProperty(property);
      });
    }
    return tone;
  }

  function watch(getSettings, onChange, host = globalThis) {
    let timer = null;
    let stopped = false;
    let signature = "";
    function refresh() {
      if (stopped) return;
      if (timer !== null) host.clearTimeout(timer);
      timer = null;
      const raw = getSettings() || {};
      const settings = normalize(raw);
      const now = new (host.Date || Date)();
      const next = JSON.stringify([settings, resolveTone(settings, now), raw.enabled !== false]);
      if (next !== signature) {
        signature = next;
        onChange(settings, now);
      }
      if (!stopped && raw.enabled !== false && settings.themeMode === "auto") {
        // Minute-aligned checks use local wall time, also catching clock/timezone changes.
        timer = host.setTimeout(refresh, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
      }
    }
    const events = [[host, "focus"], [host, "pageshow"], [host.document, "visibilitychange"]];
    events.forEach(([target, event]) => target?.addEventListener?.(event, refresh));
    refresh();
    return () => {
      stopped = true;
      if (timer !== null) host.clearTimeout(timer);
      events.forEach(([target, event]) => target?.removeEventListener?.(event, refresh));
    };
  }

  return Object.freeze({ DEFAULTS, PALETTES, isValidTime, normalizeColor, normalize, resolveTone, resolveCustomColors, apply, watch });
});
