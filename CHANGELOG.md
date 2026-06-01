# Changelog

All notable changes to CC98 Reborn are documented here.

## 0.1.7 - 2026-06-01

### 新增

- 版面卡片支持本地置顶，卡片右上角可添加或取消置顶，置顶区使用鹅黄色主题高亮。
- 新增“稍后再看”本地列表：支持在十大、新帖、关注、精选和搜索结果中加入帖子，独立页面支持搜索、分页、导入、导出、手动删除、标记已读和清除已读。
- 首页只保留十大时，稍后再看按钮默认收起，悬停后在卡片右下角显示，已加入项目会保持已加入样式。

### 修复

- 搜索按钮提交后加强路由同步，避免地址栏已跳转但重构界面没有跟进。
- 搜索结果页加载期间不再过早显示“未搜索到”，并降低等待图标反复抽动。
- 版面搜索页单独识别 `/searchBoard` 结果，避免被误判为普通主题搜索结果。
- 个人头像相框图片会被忽略，不再干扰帖子头像、媒体扫描和内容重构。
- 发帖、编辑主题帖和编辑回复提交时，先恢复原站编辑器结构再触发提交，降低原站 React 节点冲突导致的提交异常。

### 变更

- 版面卡片统计中的“今日”和“总数”改为强制分行显示。
- 版本号提升到 `0.1.7`。
- 重新生成发布包 `dist/cc98-reborn-0.1.7.zip`。

## 0.1.6 - 2026-05-30

### 修复

- 用户资料页中原站固定生成的空 `.user-avatar > .user-badge` 现在会被直接折叠，不再显示空头衔框，也不会占用头像区域布局空间。
- 用户资料页的“关注 / 取关 / 取消关注”和“私信”按钮统一为同一套按钮样式，并固定放在昵称与用户组右侧。
- 自己的主题帖和回复现在会保留“编辑”动作，并显式适配 `/editor/edit/<id>` 编辑页面。
- 版面搜索 `/searchBoard` 现在会单独读取 `.focus-board-area` 里的版面结果，并在无结果时显示“没有找到版面”，不再误用普通帖子搜索结果页逻辑。
- 搜索结果等待加载时的转动 icon 现在会保持动画相位连续，并降低等待态重建频率，避免反复抽动。

### 变更

- 版本号提升到 `0.1.6`。
- 重新生成发布包 `dist/cc98-reborn-0.1.6.zip`。

## 0.1.5 - 2026-05-30

### 新增

- 首页十大支持排名浮动提示：上升、下降、新增会以不同颜色的提示块展示一次性动画。
- “首页只保留十大”模式下，十大话题改为两列布局：左侧 1-5，右侧 6-10。
- 图片放大浏览器支持上一张 / 下一张快速切换，也可以使用键盘左右方向键切换。
- 图片放大浏览器新增“保存”按钮，并支持 `Ctrl/Cmd + S` 直接触发浏览器下载。
- 用户资料页新增头衔整合展示：会将 `.user-badge` 中的站务、版主、实习版主等头衔整理进头像旁的大框，并保留原站设置的颜色。

### 修复

- 搜索提交后地址栏已变化但重构界面未及时跟进的情况现在会触发多轮重建同步。
- 搜索结果页加载期间不再过早显示“未搜索到”，会给原站搜索结果更长的加载缓冲时间。
- 用户头像相框图片会被更强制地忽略和隐藏，避免干扰头像识别、帖子图片扫描和重构展示。
- 消息中心五个子页面进一步清理旧版白色底板，减少暗色模式下的残留白块。
- 用户资料页右侧头衔和头像的排列更稳定，头衔框高度会尽量与头像区域保持一致。
- 图片放大浏览器的滚轮缩放现在以鼠标所在位置为焦点，而不是固定围绕图片中心缩放。

### 变更

- 删除首页十大排名浮动的临时测试按钮。
- 图片浏览器工具栏样式调整，新增页码、保存、关闭、左右切换控件。
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
