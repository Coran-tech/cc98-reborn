# Changelog

All notable changes to CC98 Reborn are documented here.

## 0.1.5 - 2026-05-30

### 新增

- 图片放大浏览器支持上一张 / 下一张快速切换，也可以使用键盘左右方向键切换。
- 图片放大浏览器新增“保存”按钮，并支持 `Ctrl/Cmd + S` 直接触发浏览器下载。

### 修复

- 图片放大浏览器的滚轮缩放现在以鼠标所在位置为焦点，而不是固定围绕图片中心缩放。
- 首页启用“只保留十大”时，十大话题改为两列显示：左侧 1-5，右侧 6-10。
- 用户资料页右侧头衔会统一整理进头像旁的大框，并保留原站设置的颜色。
- 消息中心五个子页面进一步清理旧版白色底板，减少暗色模式下的残留白块。
- 搜索提交后地址栏已变化但重构界面未及时跟进的情况现在会触发多轮重建同步。
- 用户头像相框图片会被更强制地忽略和隐藏，避免干扰头像识别与展示。

### 变更

- 删除首页十大排名浮动的临时测试按钮。
- 版本号提升到 `0.1.5`。
- 重新生成发布包 `dist/cc98-reborn-0.1.5.zip`。

## 0.1.4 - 2026-05-29

### Fixed

- Private-message chat headers are now shorter while keeping the conversation title centered.
- Private-message bubbles no longer show the old border frame or the white side triangles.
- Editor emoji panels now stay above URL/image/video insert panels.
- Editor emoji panels now stay hidden until the emoji button is explicitly opened.
- Editor emoji panel state now resets after choosing an emoji, preventing the next click from inverted close/open behavior.
- The rebuilt top search box now mirrors CC98's native search-type menu for topic, user, board, in-board, and global search.
- Top search submissions now fall back to direct navigation if the native search click is not handled.
- Post-submit page refresh now uses a longer retry window so slow successful posts still reload into the final page state.
- Decorative user frame images from `/static/images/相框/` are ignored when rebuilding avatars, media, and post content.
- Native post award/rating blocks are rebuilt as compact tables between the post body and signature.
- Post action rows now right-align when they wrap, including the first visible post on a topic page.
- Award/rating table borders now use one consistent grid style.
- The `评分` post action now shows the net `风评值` delta from the rating records.

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
