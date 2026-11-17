// Styles keep the cascade order from the previous manifest. Vite emits one
// content.css and WXT adds it to the same content_scripts entry as this bundle.
import "../src/theme-tokens.css";
import "../src/styles.css";
import "../src/image-favorites.css";
import "../src/image-favorite-controls.css";
import "../src/image-favorites-picker.css";
import "../src/user-notes.css";
import "../src/topic-search.css";
import "../src/topic-archive.css";
import "../src/topic-live.css";
import "../src/topic-drawer.css";
import "../src/extended-ubb.css";
import "../experiments/question-mark/content.css";
import "../src/interface-styles.css";
import "../src/native-messages.css";

// Legacy content-script modules. They communicate through globalThis, so the
// import order below is the same order the previous manifest used.
import "../src/theme-core.js";
import "../src/interface-style.js";
import "../src/native-messages.js";
import "../src/vendor/showdown/showdown.min.js";
import "../src/vendor/katex/katex.min.js";
import "../src/extended-ubb-core.js";
import "../src/extended-ubb.js";
import "../src/markup-converter.js";
import "../src/conversation-core.js";
import "../src/conversation.js";
import "../src/topic-search.js";
import "../src/topic-archive.js";
import "../src/topic-live-api.js";
import "../src/topic-live.js";
import "../src/favorite-share-core.js";
import "../src/favorite-share-service.js";
import "../src/favorite-share.js";
import "../src/image-favorites-core.js";
import "../src/image-favorites.js";
import "../src/image-favorite-controls.js";
import "../src/user-notes-core.js";
import "../src/user-notes.js";
import "../src/private-message-pins-core.js";
import "../src/private-message-pins.js";
import "../src/content-filter-core.js";
import "../src/content-filter.js";
import "../src/semantic-filter-core.js";
import "../src/semantic-filter.js";
import "../src/new-topics-virtual.js";
import "../src/home-live.js";
import "../src/content.js";
import "../experiments/question-mark/content.js";

import { CC98_EXCLUDE_MATCHES, CC98_MATCHES } from "../src/extension-matches";

export default defineContentScript({
  matches: CC98_MATCHES,
  excludeMatches: CC98_EXCLUDE_MATCHES,
  runAt: "document_start",
  allFrames: false,
  main() {}
});
