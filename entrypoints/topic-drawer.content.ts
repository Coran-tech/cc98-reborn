import "../src/topic-drawer.js";
import { CC98_EXCLUDE_MATCHES, CC98_MATCHES } from "../src/extension-matches";

export default defineContentScript({
  matches: CC98_MATCHES,
  excludeMatches: CC98_EXCLUDE_MATCHES,
  runAt: "document_start",
  allFrames: true,
  main() {}
});
