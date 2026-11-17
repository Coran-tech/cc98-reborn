import "../../src/ui/install-legacy-globals";

const globals = globalThis as unknown as Record<string, any>;

export const ThemeCore = globals.CC98RebornThemeCore;
export const SettingsBackupCore = globals.CC98RebornSettingsBackupCore;
export const ContentFilterCore = globals.CC98RebornContentFilterCore;
export const SemanticFilterCore = globals.CC98RebornSemanticFilterCore;

export const STORAGE_KEY = "cc98ComfortSettings";
export const OPENID_BINDING_STORAGE_KEY = "cc98RebornOpenIdBinding:v1";
export const RELEASES_PAGE_URL = "https://github.com/Coran-tech/cc98-reborn/releases";

export interface Settings extends Record<string, any> {
  enabled: boolean;
  themeStyle: "modern" | "ascii";
  themeMode: "light" | "dark" | "auto";
  themePalette: string;
  themeCustomPrimary: string;
  themeCustomSecondary: string;
  themeDayStart: string;
  themeNightStart: string;
  fontScale: number;
  emojiScale: number;
  imageLoadDuration: number;
  prewarmPostImages: boolean;
  previsitFirstPageForTopicImages: boolean;
  openLinksInNewTab: boolean;
  topicDrawerEnabled: boolean;
  sideTopbar: boolean;
  replyRebornTail: boolean;
  questionMarkEnabled: boolean;
  homeHotOnly: boolean;
  expandTopicCardsByDefault: boolean;
  blockedBoards: string;
  blockedTitleKeywords: string;
  blockedUserIds: string;
  blockedContentRules: string;
  semanticFilterEnabled?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  ...ThemeCore.DEFAULTS,
  ...(SemanticFilterCore?.DEFAULTS ?? {}),
  density: "comfortable",
  fontScale: 110,
  emojiScale: 200,
  neutralizeNativeSkin: true,
  rebuildUi: true,
  roundUi: true,
  cornerRadius: 10,
  prewarmPostImages: false,
  imageLoadDuration: 2100,
  previsitFirstPageForTopicImages: true,
  openLinksInNewTab: false,
  topicDrawerEnabled: true,
  sideTopbar: false,
  replyRebornTail: true,
  questionMarkEnabled: false,
  minimalMode: false,
  homeHotOnly: true,
  expandTopicCardsByDefault: false,
  softenAvatars: true,
  hideSticky: false,
  focusReading: false,
  aiSearchSuggestEnabled: false,
  aiSearchSuggestProvider: "openai",
  aiSearchSuggestEndpoint: "",
  aiSearchSuggestModel: "",
  aiSearchSuggestApiKey: "",
  externalAiSearchConsent: false,
  advancedFuzzySearch: false,
  blockedBoards: "",
  blockedTitleKeywords: "",
  blockedUserIds: "",
  blockedContentRules: "[]",
  placeholderText: "已根据你的屏蔽规则折叠一条内容"
};

export const PALETTES = ThemeCore.PALETTES as Array<{
  id: string;
  primary: string;
  secondary: string;
}>;

export function normalizeSettings(raw: Settings | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
    ...ThemeCore.normalize(raw ?? {})
  };
}

export function displayVersion(): string {
  const manifest = chrome.runtime.getManifest?.() ?? {};
  return manifest.version_name || manifest.version || "";
}
