import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  STORAGE_KEY,
  ThemeCore,
  type Settings
} from "./theme";

/**
 * Mirrors the legacy popup: reads the whole settings object, merges a patch
 * just before writing, and debounces input events so range sliders do not
 * produce one storage write per pixel.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const pending = useRef<Partial<Settings>>({});
  const timer = useRef<number | null>(null);
  const writing = useRef(false);
  const hydrated = useRef(false);

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length || writing.current) return;
    writing.current = true;
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const current = (result[STORAGE_KEY] ?? {}) as Settings;
      const next = { ...DEFAULT_SETTINGS, ...current, ...ThemeCore.normalize(current), ...patch };
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
      setSettings(normalizeSettings(next));
    } finally {
      writing.current = false;
    }
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>, immediate = false) => {
      if (!hydrated.current) return;
      setSettings((previous) => normalizing({ ...previous, ...patch }));
      Object.assign(pending.current, patch);
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (immediate) {
        void flush();
      } else {
        timer.current = window.setTimeout(() => void flush(), 140);
      }
    },
    [flush]
  );

  const reset = useCallback(async () => {
    pending.current = {};
    if (timer.current !== null) window.clearTimeout(timer.current);
    await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
    setSettings(DEFAULT_SETTINGS);
    ThemeCore.apply(document.documentElement, DEFAULT_SETTINGS);
  }, []);

  useEffect(() => {
    const applyStored = (raw: Settings | undefined) => {
      const next = normalizeSettings(raw);
      setSettings(next);
      hydrated.current = true;
      ThemeCore.apply(document.documentElement, next);
    };
    chrome.storage.local.get(STORAGE_KEY).then((result) => {
      applyStored(result[STORAGE_KEY] as Settings | undefined);
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !changes[STORAGE_KEY] || writing.current) return;
      applyStored(changes[STORAGE_KEY].newValue as Settings | undefined);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    // Keep the popup itself in the selected tone so the preview follows the
    // forum colours while the user edits them.
    const tone = ThemeCore.resolveTone(settings);
    document.documentElement.classList.toggle("dark", tone === "dark");
  }, [settings]);

  return { settings, update, reset, flush, hydrated: hydrated.current };
}

function normalizing(settings: Settings): Settings {
  return { ...settings, ...ThemeCore.normalize(settings) };
}
