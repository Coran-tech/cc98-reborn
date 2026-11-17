import "../src/openid-webvpn-bridge.js";
import { WEBVPN_MATCHES } from "../src/extension-matches";

export default defineContentScript({
  matches: WEBVPN_MATCHES,
  runAt: "document_start",
  main() {}
});
