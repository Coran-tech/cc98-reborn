# Changelog

All notable changes to CC98 Reborn are documented here.

## 0.1.4 - 2026-05-29

### Fixed

- Private-message chat headers are now shorter while keeping the conversation title centered.
- Private-message bubbles no longer show the old border frame or the white side triangles.
- Editor emoji panels now stay above URL/image/video insert panels.
- Editor emoji panels now stay hidden until the emoji button is explicitly opened.
- Editor emoji panel state now resets after choosing an emoji, preventing the next click from inverted close/open behavior.

### Changed

- Version bumped to `0.1.4`.
- The release package was regenerated as `dist/cc98-reborn-0.1.4.zip`.

## 0.1.3 - 2026-05-29

### Fixed

- Followed-user post actions now keep the refreshed `取关` / `取消关注` controls in the rebuilt action row.
- Topic favorite controls are exposed in the rebuilt post action row while still triggering the original CC98 favorite dialog.
- Topic share controls are exposed beside the rebuilt post page-jump form and show a fading `复制成功` confirmation.
- Favorite-group confirm modal titles and content now inherit night-mode text color more aggressively.

### Changed

- Version bumped to `0.1.3`.
- The release package was regenerated as `dist/cc98-reborn-0.1.3.zip`.

## 0.1.2 - 2026-05-29

### Fixed

- Posting and reply editor insert controls for URL, image, video, Bilibili video, and audio now pass through to the original CC98 handlers.
- The native UBB insert panel is separated from the textarea layer so inserted forms are visible and interactive.

### Changed

- Version bumped to `0.1.2`.
- The release package was regenerated as `dist/cc98-reborn-0.1.2.zip`.

## 0.1.1 - 2026-05-29

### Fixed

- Home page announcements now move the `详情请戳` link onto the announcement title and hide the redundant detail-link text in the rebuilt UI.
- The Ant Design month picker is now adapted for night mode, including the panel background, month cells, disabled months, selected month, header controls, and footer shortcut.
- The sign-in calendar weekday header now uses seven equal-width columns aligned with the calendar grid below.

### Changed

- Version bumped to `0.1.1`.
- The release package was regenerated as `dist/cc98-reborn-0.1.1.zip`.

## 0.1.0 - 2026-05-29

### Added

- Initial pre-release of the CC98 Reborn Chrome/Edge extension.
- Rebuilt UI for home, topic lists, search results, board pages, posts, user center, messages, sign-in, login, and common error pages.
- Rebuilt post reading experience with improved UBB rendering, quote blocks, signatures, emoji sizing, image viewing, audio player styling, and download buttons.
- Theme support for light, mist, and night modes.
- Popup settings for enabling the extension, theme selection, home hot-only mode, first-page prewarm, font size, emoji size, image loading duration, and blocking rules.
- Local packaging script and release documentation.
- Privacy documentation.

### Changed

- Native CC98 controls are reused where practical for posting, replying, uploads, message sending, rating, favorites, and user-center workflows.
- AI search suggestion and advanced fuzzy search features are disabled for this release.
- Watermark implementation is dormant until the official CC98 OAuth authorization flow is wired.

### Security

- The release build does not upload post content, private messages, search terms, or extension settings to third-party services.
