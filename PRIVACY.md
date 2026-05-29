# Privacy

CC98 Reborn runs locally in the browser and is scoped to CC98 domains.

## Data The Extension Stores

- User interface settings saved with `chrome.storage.local`.
- Local filtering rules entered by the user, such as board names, title keywords, and UID rules.

## Network Access

The extension does not upload post content, private messages, search terms, or user configuration to third-party services.

Network activity is limited to:

- CC98 pages already visited by the user, for rebuilding the visible interface.
- CC98 same-origin page reads used by optional page prewarming/search helpers.
- CC98 file downloads triggered by the user.

## Disabled / Pending Features

The watermark feature is disabled in this release while the official CC98 OAuth authorization flow is being prepared. No watermark API request is made by the published extension package.

AI search suggestion and advanced fuzzy search integrations are also disabled in this release.
