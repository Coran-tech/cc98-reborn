# Privacy

CC98 Reborn rebuilds CC98 pages locally in the browser. The optional question reaction uses a separate HTTPS service and is off by default.

## Data The Extension Stores

- User interface settings saved with `chrome.storage.local`.
- Local filtering rules entered by the user, such as board names, title keywords, and UID rules.
- Optional CC98 OpenID binding summary, such as UID, username, avatar URL, watermark prefix, and binding time.
- If the question reaction is enabled and accepted: a consent flag, a marker for the authorized account, and a short-lived question-service session in browser session storage. The owner's optional public-key update credential is held in local IndexedDB, not in a release package.

## Network Access

The extension does not upload post content, private messages, search terms, or user configuration to third-party services.

Network activity includes:

- CC98 pages already visited by the user, for rebuilding the visible interface.
- CC98 same-origin page reads used by optional page prewarming/search helpers.
- CC98 file downloads triggered by the user.
- CC98 OpenID authorization requests triggered by the user when binding an account.
- CC98 `/me` API request made by the extension background after OpenID authorization, used to read the local binding identity summary and watermark identifier.
- Public GitHub Release metadata, with a release mirror as a fallback, for manual and periodic extension update checks.
- Only when the experimental question reaction is enabled and its privacy notice accepted: a separate HTTPS service receives a CC98 OpenID ID Token for initial or renewed authentication, then numeric topic IDs and loaded floor numbers for aggregate counts or toggles. It does not receive post titles, bodies, images, authors, private messages, drafts, or search terms through this feature.

Update checks do not include post content, private messages, search terms, CC98 account data, or extension settings.

OpenID binding does not persist access tokens or refresh tokens. A short-lived token is used to request `https://api.cc98.org/me`; if that endpoint temporarily returns a server error, the extension may request `https://openid.cc98.org/connect/userinfo` as a basic-profile fallback. The token is then discarded, and the resulting local identity summary is reused until the user binds again or unbinds. Periodic profile refresh code is disabled. When CC98 is accessed through WebVPN, authorization may use a WebVPN tab and a local callback bridge; the bridge reports only the OpenID callback URL to the extension background and does not send forum page content elsewhere.

Question-service authorization is separate from local watermark binding. An ID Token is signed, not encrypted: the service can read its identity claims while verifying them. The extension uses it to obtain a short-lived session, and does not persist that ID Token. The service stores an identity-derived keyed digest for reaction records, rather than raw UID; the operator can still access service-side data. Ordinary users receive only aggregate floor counts and their own selection status, not other users' individual reaction records. Changes in aggregate counts may still be observable. The service currently cannot independently verify whether a referenced CC98 floor exists or whether the requester may view it on the original forum. The question experiment is currently validated only for direct CC98 access; WebVPN authorization is not supported.

The full [question feature privacy notice](https://question.coranqwq.xyz/privacy) describes the external service and consent terms.

When OpenID binding is enabled, the floating watermark is rendered locally from the stored `watermarkId` prefix. The extension does not use the webpage login session for this watermark path and does not upload page content for watermarking.

The popup also includes an explicit cleanup button that clears CC98 cookies and local site data through the browser `browsingData` API. This action is user-triggered only.

## Disabled / Pending Features

AI search suggestion and advanced fuzzy search integrations are also disabled in this release.
