# CC98 Reborn

[中文说明](./README.zh-CN.md) · [Changelog](./CHANGELOG.md)

CC98 Reborn is a Chrome/Edge extension that rebuilds common CC98 pages into a cleaner reading interface while keeping the original site controls available whenever possible.

Current pre-release version: `0.2.9`.

## Features

- Reborn UI for home, topic lists, search results, board pages, posts, user center, private messages, and posting/reply editors.
- Theme switcher with light, mist, and night reading modes.
- Cleaner topic cards, post cards, board views, and user center layouts.
- Image loading prewarm for posts, configurable image loading mask duration, and click-to-view large images with wheel zoom and drag pan.
- Floor anchors for post links such as `#2`, with smooth scrolling in the rebuilt UI.
- Search result rebuilding and keyword highlighting.
- Native post polls are restyled while retaining the original vote and reset behavior.
- Follow/follower profile links use full navigation so rebuilt user-center pages refresh reliably.
- Built-in update checks provide manual checks, periodic background checks, a popup update indicator, and a once-per-browser-session page notice.
- The popup can clear CC98 cookies and local site data, then reload open CC98 tabs.
- The popup about panel shows the current extension version, avatar, and author profile links.
- Optional CC98 OpenID binding uses authorization code + PKCE, requests the CC98 API user-info scope, stores only a local identity summary, and enables the local floating watermark after binding.
- Blocking rules for boards, title keywords, and user IDs.
- Original CC98 interactions are preserved by reusing native controls for editors, private messages, user center settings, upload buttons, and message sending.
- The original Markdown editor is theme-matched and includes an immediate local transition preview while the official preview waits for IME input to settle.
- The rebuilt user menu combines message and account links, with a dedicated compact rail menu in left-side efficiency mode.
- The floating watermark uses the first eight characters of the bound CC98 `watermarkId` and is rendered locally on CC98 pages.

## Install Locally

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
5. Open `https://www.cc98.org/` and use the extension popup to adjust settings.

## Settings

The popup currently exposes:

- Enable or disable CC98 Reborn.
- Select a visual theme, including the additional light and dark color schemes.
- Show only hot topics on the home page.
- Prewarm the first topic page for better original-poster and hot-comment detection.
- Open ordinary forum links in a new tab.
- Switch the top navigation to the experimental left-side efficiency bar.
- Add the experimental CC98 Reborn tail to replies; this is enabled by default.
- Adjust font size.
- Adjust emoji size.
- Adjust image loading duration.
- Set board, title keyword, and UID blocking rules.
- Customize blocked-content placeholder text.
- Bind, unbind, or exit the current CC98 OpenID account and view the local watermark identity summary.
- Clear CC98 cookies and local site data after explicit confirmation.
- Check for updates, open the release page, and view extension/author information.

## Permissions

The extension requests:

- `storage`: save local settings.
- `downloads`: trigger CC98 file downloads from rebuilt post download buttons.
- `alarms`: schedule periodic release checks.
- `browsingData`: clear CC98 cookies and local site data when the user explicitly clicks the cleanup button.
- `identity`: run the CC98 OpenID authorization flow when the user explicitly binds an account.
- CC98 host permissions: run the content script on CC98 and the common WebVPN domain.
- CC98 OpenID/API host permissions: exchange the authorization code, request `cc98-api` / `read-user-info`, and read `https://api.cc98.org/me`.
- GitHub Release and mirror host permissions: check whether a newer extension package is available.

The release build does not upload post content, private messages, search terms, or settings to third-party services. Update checks only request public release metadata. OpenID binding stores only a local identity summary and does not persist access tokens. The watermark is drawn locally from that stored summary. See `PRIVACY.md`.

## Project Structure

```text
manifest.json
assets/
  icon16.png
  icon32.png
  icon48.png
  icon128.png
images/
  CC98/
  ac/
  ac1/
  tb/
  ms/
  em/
  mahjong/
src/
  content.js
  styles.css
  background.js
  page-submit-monitor.js
popup/
  popup.html
  popup.css
  popup.js
PRIVACY.md
RELEASE.md
scripts/
  package-extension.ps1
```

## Release Packaging

For a GitHub pre-release:

1. Confirm `manifest.json` version.
2. Run syntax checks:

```powershell
node --check .\src\content.js
node --check .\src\background.js
node --check .\src\page-submit-monitor.js
node --check .\popup\popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

3. Build the release zip:

```powershell
.\scripts\package-extension.ps1
```

4. Upload `dist/cc98-reborn-<version>.zip` as a Chrome Web Store package or GitHub Release asset.

The OpenID authorization and watermark flow is active in the release build. The background service worker performs authorization code + PKCE, validates the bound UID against the current CC98 web account, stores only the local identity summary, and supplies the watermark prefix to the content script.

## Notes

This is an early pre-release. CC98 is a dynamic web app, so some pages are adapted by moving native DOM modules into the Reborn layout instead of reimplementing the logic. That approach is intentional: it keeps upload, send, menu, rating, editor, and user-center controls functional while improving layout and theme compatibility.
