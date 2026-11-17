import { installLegacyIcons } from "./icons";

// Imported before the legacy content-script modules so their callbacks can use
// globalThis.CC98RebornIcons without a build-time import in every file.
installLegacyIcons();
