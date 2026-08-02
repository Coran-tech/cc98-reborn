# Privacy

CC98 Reborn runs locally in the browser and is scoped to CC98 domains.

## Data The Extension Stores

- User interface settings saved with `chrome.storage.local`.
- Local filtering rules entered by the user, such as board names, title keywords, and UID rules.
- Optional CC98 OpenID binding summary, such as UID, username, avatar URL, watermark prefix, and binding time.

## Network Access

The extension does not upload post content, private messages, search terms, or user configuration to third-party services.

Network activity is limited to:

- CC98 pages already visited by the user, for rebuilding the visible interface.
- CC98 same-origin page reads used by optional page prewarming/search helpers.
- CC98 file downloads triggered by the user.
- CC98 OpenID authorization requests triggered by the user when binding an account.
- CC98 `/me` API request made by the extension background after OpenID authorization, used to read the local binding identity summary and watermark identifier.
- Public GitHub Release metadata, with a release mirror as a fallback, for manual and periodic extension update checks.

Update checks do not include post content, private messages, search terms, CC98 account data, or extension settings.

OpenID binding does not persist access tokens or refresh tokens. A short-lived token is used to request `https://api.cc98.org/me`; if that endpoint temporarily returns a server error, the extension may request `https://openid.cc98.org/connect/userinfo` as a basic-profile fallback. The token is then discarded, and the resulting local identity summary is reused until the user binds again or unbinds. Periodic profile refresh code is disabled. When CC98 is accessed through WebVPN, authorization may use a WebVPN tab and a local callback bridge; the bridge reports only the OpenID callback URL to the extension background and does not send forum page content elsewhere.

When OpenID binding is enabled, the floating watermark is rendered locally from the stored `watermarkId` prefix. The extension does not use the webpage login session for this watermark path and does not upload page content for watermarking.

The popup also includes an explicit cleanup button that clears CC98 cookies and local site data through the browser `browsingData` API. This action is user-triggered only.

## Disabled / Pending Features

AI search suggestion and advanced fuzzy search integrations are also disabled in this release.
