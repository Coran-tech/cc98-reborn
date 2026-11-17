// Legacy background modules. `importScripts()` cannot run inside a bundled
// module service worker, so their load order moves here.
import "../src/ui/install-legacy-globals";
import "../src/semantic-client.js";
import "../src/semantic-filter-core.js";
import "../src/semantic-background.js";
import "../src/topic-archive-store.js";
import "../src/image-favorites-core.js";
import "../src/image-favorites-store.js";
import "../experiments/question-mark/admin-key-store.js";
import "../experiments/question-mark/background.js";
import "../src/background.js";

export default defineBackground(() => {});
