# CC98 Reborn

[中文说明](./README.zh-CN.md) · [Changelog](./CHANGELOG.md)

CC98 Reborn is a Chrome/Edge extension that rebuilds common CC98 pages into a cleaner reading interface while keeping the original site controls available whenever possible.

<<<<<<< Updated upstream
Current pre-release version: `0.1.4`.
=======
Current pre-release version: `0.1.5`.
>>>>>>> Stashed changes

## Features

- Reborn UI for home, topic lists, search results, board pages, posts, user center, private messages, and posting/reply editors.
- Theme switcher with light, mist, and night reading modes.
- Cleaner topic cards, post cards, board views, and user center layouts.
- Image loading prewarm for posts, configurable image loading mask duration, and click-to-view large images with wheel zoom and drag pan.
- Floor anchors for post links such as `#2`, with smooth scrolling in the rebuilt UI.
- Search result rebuilding and keyword highlighting.
- Blocking rules for boards, title keywords, and user IDs.
- Original CC98 interactions are preserved by reusing native controls for editors, private messages, user center settings, upload buttons, and message sending.
- Watermark code is currently dormant while official CC98 OAuth authorization is being prepared.

## Install Locally

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
5. Open `https://www.cc98.org/` and use the extension popup to adjust settings.

## Settings

The popup currently exposes the settings intended for the first pre-release:

- Enable or disable CC98 Reborn.
- Select a visual theme.
- Show only hot topics on the home page.
- Adjust font size.
- Adjust image loading duration.
- Set board, title keyword, and UID blocking rules.
- Customize blocked-content placeholder text.

## Permissions

The extension requests:

- `storage`: save local settings.
- `downloads`: trigger CC98 file downloads from rebuilt post download buttons.
- CC98 host permissions: run the content script on CC98 and the common WebVPN domain.

The release build does not upload post content, private messages, search terms, or settings to third-party services. See `PRIVACY.md`.

## Project Structure

```text
manifest.json
assets/
  icon16.png
  icon32.png
  icon48.png
  icon128.png
src/
  content.js
  styles.css
  background.js
  watermark-bridge.js
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
node --check .\src\watermark-bridge.js
node --check .\popup\popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

3. Build the release zip:

```powershell
.\scripts\package-extension.ps1
```

4. Upload `dist/cc98-reborn-<version>.zip` as a Chrome Web Store package or GitHub Release asset.

The release zip intentionally excludes the dormant `src/watermark-bridge.js` file until official OAuth support is enabled.

## Notes

This is an early pre-release. CC98 is a dynamic web app, so some pages are adapted by moving native DOM modules into the Reborn layout instead of reimplementing the logic. That approach is intentional: it keeps upload, send, menu, rating, editor, and user-center controls functional while improving layout and theme compatibility.
