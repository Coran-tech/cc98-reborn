# Privacy

CC98 Reborn rebuilds CC98 pages locally in the browser. The optional question reaction uses a separate HTTPS service and is off by default.

## Data The Extension Stores

- User interface settings saved with `chrome.storage.local`.
- User-triggered conversation reads are cached by account in the current tab. A CC98-origin `sessionStorage` snapshot preserves post content and reference metadata across full-page pagination/reloads; it is not permanent extension configuration or a settings backup. Up to six recent topics are retained, with a 4 MiB snapshot budget favoring the current topic. Account changes do not reuse the preceding account's snapshot; manual conversation refresh invalidates the relevant cached pages. No cached post content is sent to a separate service.
- In-topic full-text search uses the same cached pages. Its keyword, quote-inclusion option, topic ID and progress state are saved in tab-local `sessionStorage` by account to resume same-topic pagination/reloads; they are excluded from settings backups. After the user confirms the waiting notice, uncached pages are read serially with at least one second between page-read starts. Matching/highlighting happen locally; the keyword is not submitted to a search service. Closing the dialog keeps the task running in this tab, while leaving the topic pauses it and changing accounts isolates the results.
- Pinned private-message contacts, stored by the current account UID with each contact's UID and display name. No message bodies or previews are saved by pinning. Pins sync between local tabs; opening an unloaded pinned contact uses the forum's normal UID-based private-message route.
- Pinned boards are mirrored into extension local storage for backups, while legacy page-local pins migrate automatically when a forum page loads.
- User notes entered by the user, stored in `chrome.storage.local` under the current account UID and the noted user's UID. Notes are displayed locally beside the original username and are not uploaded to CC98 or a separate service. Anonymous post identities are not associated with user notes. Notes do not automatically sync across devices.
- Local filtering rules entered by the user, such as board names, title keywords, and UID rules.
- Optional CC98 OpenID binding summary, such as UID, username, avatar URL, watermark prefix, and binding time.
- If the question reaction is enabled and accepted: a consent flag, a marker for the authorized account, and a short-lived question-service session in browser session storage. The owner's optional public-key update credential is held in local IndexedDB, not in a release package.

## Network Access

The extension does not upload post content, private messages, search terms, or user configuration to third-party services.

User-triggered settings backups download a local JSON file containing interface/reading preferences, blacklist rules, user notes, pinned private-message contacts and pinned boards. The file can include account/user UIDs, saved notes and contact names. Login bindings, tokens, API keys, drafts and read-later data are excluded. Import validates the file and previews its scope before applying matching configuration keys; other stored data remains intact. Backups are not uploaded or automatically shared, and the embedded settings frame does not send their contents to its forum parent.

Network activity includes:

- CC98 pages already visited by the user, for rebuilding the visible interface.
- Clicking a topic title in the hot list or new-topic list opens the same-origin forum page in a temporary right-hand iframe. The `scripting` permission enables the normal extension UI only in that marked frame; ordinary hidden page-read probes do not receive a full runtime. Native reply actions use the current forum session. Closing the drawer destroys its browsing context; the extension does not keep a hidden pool of these pages or upload their content elsewhere.
- CC98 same-origin page reads used by optional page prewarming/search helpers.
- CC98 file downloads triggered by the user.
- User-triggered favorite sharing reads the selected favorite group and its topic list from CC98. A share string is encoded and decoded locally and contains only the group name, topic IDs and titles. It contains no login credentials or account identity. After the user previews an import and selects a destination group, the extension uses the current webpage login session to check favorite status and add missing favorites through CC98's API. Existing favorites keep their original groups. The extension does not send the share string to a separate service or automatically publish it; copying it to the clipboard is user-triggered.
- CC98 OpenID authorization requests triggered by the user when binding an account.
- CC98 `/me` API request made by the extension background after OpenID authorization, used to read the local binding identity summary and watermark identifier.
- Public GitHub Release metadata, with a release mirror as a fallback, for manual and periodic extension update checks.
- Only when the experimental question reaction is enabled and its privacy notice accepted: a separate HTTPS service receives a CC98 OpenID ID Token for initial or renewed authentication, then numeric topic IDs and loaded floor numbers for aggregate counts or toggles. It does not receive post titles, bodies, images, authors, private messages, drafts, or search terms through this feature.

Update checks do not include post content, private messages, search terms, CC98 account data, or extension settings.

OpenID binding does not persist access tokens or refresh tokens. A short-lived token is used to request `https://api.cc98.org/me`; if that endpoint temporarily returns a server error, the extension may request `https://openid.cc98.org/connect/userinfo` as a basic-profile fallback. The token is then discarded, and the resulting local identity summary is reused until the user binds again or unbinds. Periodic profile refresh code is disabled. When CC98 is accessed through WebVPN, authorization may use a WebVPN tab and a local callback bridge; the bridge reports only the OpenID callback URL to the extension background and does not send forum page content elsewhere.

Question-service authorization is separate from local watermark binding. An ID Token is signed, not encrypted: the service can read its identity claims while verifying them. The extension uses it to obtain a short-lived session, and does not persist that ID Token. The service stores an identity-derived keyed digest for reaction records, rather than raw UID; the operator can still access service-side data. Ordinary users receive only aggregate floor counts and their own selection status, not other users' individual reaction records. Changes in aggregate counts may still be observable. The service currently cannot independently verify whether a referenced CC98 floor exists or whether the requester may view it on the original forum. The question experiment is currently validated only for direct CC98 access; WebVPN authorization is not supported.

The full [question feature privacy notice](https://question.coranqwq.xyz/privacy) describes the external service and consent terms.

When OpenID binding is enabled, the floating watermark is rendered locally from the stored `watermarkId` prefix. The extension does not use the webpage login session for this watermark path and does not upload page content for watermarking.

The popup and the personal-center settings subpage include an explicit cleanup button that clears CC98 cookies and local site data through the browser `browsingData` API. This action is user-triggered only. The subpage reuses the extension's popup in an extension-origin frame and the same local settings; its messages to the forum parent contain only frame height or a request to open the blacklist view, not settings, credentials or account data.

## Disabled / Pending Features

AI search suggestion and advanced fuzzy search integrations are also disabled in this release.
