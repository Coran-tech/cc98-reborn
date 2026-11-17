import * as ContentFilterCore from "../content-filter-core.js";
import * as ConversationCore from "../conversation-core.js";
import * as ExtendedUbbCore from "../extended-ubb-core.js";
import * as FavoriteShareCore from "../favorite-share-core.js";
import * as FavoriteShareService from "../favorite-share-service.js";
import * as ImageFavoritesCore from "../image-favorites-core.js";
import * as ImageFavoritesStore from "../image-favorites-store.js";
import * as MarkupConverter from "../markup-converter.js";
import * as PrivateMessagePinsCore from "../private-message-pins-core.js";
import * as SemanticBackground from "../semantic-background.js";
import * as SemanticClient from "../semantic-client.js";
import * as SemanticFilterCore from "../semantic-filter-core.js";
import * as SettingsBackupCore from "../settings-backup-core.js";
import * as ThemeCore from "../theme-core.js";
import * as TopicArchiveStore from "../topic-archive-store.js";
import * as UserNotesCore from "../user-notes-core.js";

/**
 * These legacy files are UMD modules. When bundled they take the CommonJS
 * branch and expose their API as the module export instead of a global. The
 * rest of the legacy code (and the ASCII/icon adapters) still reads the
 * documented `globalThis.CC98Reborn*` names, so bridge both worlds here.
 */
function apiOf(module: unknown): any {
  const value = module as { default?: unknown };
  return value && typeof value === "object" && "default" in value ? value.default : module;
}

const APIs: Record<string, unknown> = {
  CC98RebornContentFilterCore: apiOf(ContentFilterCore),
  CC98RebornConversationCore: apiOf(ConversationCore),
  CC98RebornExtendedUbbCore: apiOf(ExtendedUbbCore),
  CC98RebornFavoriteShareCore: apiOf(FavoriteShareCore),
  CC98RebornFavoriteShareService: apiOf(FavoriteShareService),
  CC98RebornImageFavoritesCore: apiOf(ImageFavoritesCore),
  CC98RebornImageFavoritesStore: apiOf(ImageFavoritesStore),
  CC98RebornMarkupConverter: apiOf(MarkupConverter),
  CC98RebornPrivateMessagePinsCore: apiOf(PrivateMessagePinsCore),
  CC98RebornSemanticBackground: apiOf(SemanticBackground),
  CC98RebornSemanticClient: apiOf(SemanticClient),
  CC98RebornSemanticFilterCore: apiOf(SemanticFilterCore),
  CC98RebornSettingsBackupCore: apiOf(SettingsBackupCore),
  CC98RebornThemeCore: apiOf(ThemeCore),
  CC98RebornTopicArchiveStore: apiOf(TopicArchiveStore),
  CC98RebornUserNotesCore: apiOf(UserNotesCore)
};

for (const [name, value] of Object.entries(APIs)) {
  if (value) (globalThis as unknown as Record<string, unknown>)[name] = value;
}
