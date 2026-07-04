# Changelog

All notable changes to CC98 Reborn are documented here.

## 0.2.8.3 - 2026-07-05

### 新增

- 新增“链接在新页面打开”开关。开启后，普通点击论坛链接会在新页面打开；下载、提交等操作保持原逻辑。
- 新增“左侧效率栏”开关。可将顶部浮动栏切换为左侧固定效率栏，桌面端为主内容预留左侧空间，窄屏自动回退顶部布局。

### 修复

- 修复左下角新版本提醒弹窗中文字出现额外底色的问题，现在只保留红色提示底板。
- 修复左侧效率栏导航文字被挤成逐字换行的问题。
- 修复左侧效率栏个人菜单弹出距离过远、hover 时容易抽动的问题。

### 调整

- 优化左侧效率栏布局：导航改为纵向单列并等距铺开，搜索与刷新按钮并排，按钮和字体整体放大。
- 优化左侧效率栏个人入口：底部仅保留圆形头像和铃铛徽标，头像代理原个人菜单功能，悬浮菜单贴近头像弹出。
- 版本号提升到 `0.2.8.3`。
- 重新生成发布包 `dist/cc98-reborn-0.2.8.3.zip`。

## 0.2.8.2 - 2026-07-04

### 修复

- 修复 `/usercenter` 下原页面仍在加载时，重构界面短暂露出“个人中心 / 黑名单”空壳中间页的问题；现在会继续用加载遮罩覆盖，直到用户中心原生内容就绪。
- 修复 WebVPN 或搜索跳转遮罩的 fail-safe 超时没有按短超时生效的问题，降低慢加载时遮罩停留过久的概率。
- 修复 WebVPN 下部分页面类型仍使用代理路径判断，导致个人中心、版面搜索等页面识别不稳定的问题。
- 调整表情浮窗定位与关闭行为：个人资料签名档等场景中，表情面板会贴近按钮显示，并可点击空白处关闭。

### 调整

- 版本号提升到 `0.2.8.2`。
- 重新生成发布包 `dist/cc98-reborn-0.2.8.2.zip`。

## 0.2.8 - 2026-07-03

### 新增

- 个人资料设置页的签名档输入框加入 UBB 快捷工具栏，支持常用格式、链接、图片、视频、音频、表情、字号、颜色和预览。
- 字体颜色组件的渐变模式加入密度选项，可选择 1 到 10 个字符共用一次颜色变化。

### 修复

- 修复 WebVPN 下“稍后再看”跳到 WebVPN 根路径的问题。
- “稍后再看”改为按 CC98 用户 ID 存储到扩展本地存储，主站与 WebVPN 同一账号互通，不同账号互不串数据。
- 修复私信页输入工具栏可能出现在聊天记录上方的问题，并保持聊天小窗口滚动位置不被外层页面滚动或重排重置。
- 修复风评表格与“评分”按钮中的风评值增减文本在亮色主题和所有暗色主题下颜色不一致的问题。
- 风评记录检测到“显示全部”时会默认展开，再基于完整记录统计评分按钮上的风评值变化。

### 调整

- 版本号提升到 `0.2.8`。
- 重新生成发布包 `dist/cc98-reborn-0.2.8.zip`。

## 0.2.7 - 2026-06-22

### 新增

- 新增站内黑名单页面，支持在插件弹窗和“我的”侧栏进入；可按版面、标题关键词和用户 ID 管理屏蔽规则。
- 用户屏蔽改为严格按用户 ID / UID 匹配；进入被屏蔽用户主页或被屏蔽作者帖子时，会先显示遮罩并提供一次性“查看内容”按钮。
- 用户资料页右侧头衔框支持收纳账号状态信息，例如“🚫 该账号被若干版面禁言中”。

### 修复

- 修复黑名单页面和被屏蔽用户页误显示“正在等待页面内容”的问题。
- 修复别人主页时左侧个人中心导航不应出现的问题。
- 修复用户资料页空头衔框仍占位的问题；无头衔、无账号状态时会隐藏。
- 修复资料页账号状态可能被统计卡片重复显示的问题，并避免扫描签名档中的同文案。
- 修复资料页头衔/账号状态框内只有一条信息时过小的问题；单条会居中放大，多条会整体居中并自动换行。

### 调整

- 黑名单入口在侧栏中显示为“黑名单”，不再显示完整网址；页面内保留分割线和一致的卡片样式。
- 被屏蔽内容的临时查看状态改为一次性，仅本次页面生命周期有效，刷新后重新显示遮罩。
- 版本号提升到 `0.2.7`。
- 重新生成发布包 `dist/cc98-reborn-0.2.7.zip`。

## 0.2.6 - 2026-06-17

### 新增

- 为帖子正文和签名档中的 APlayer 音频块加入最小化重构播放器：默认只显示播放按钮、音频名和进度条，先保证播放可用。
- 新增音频进度条：可读取原生 audio 的播放与缓冲进度；在仅能代理原站 APlayer 的情况下，会尽量镜像原播放器进度。

### 修复

- 修复 APlayer 封面图被正文图片提取逻辑误识别的问题。
- 修复部分签名档或正文 APlayer 没有暴露直链时，重构后播放器消失或无法代理播放的问题。
- 修复此前尝试替换 APlayer 为原生 audio 后导致正文、签名档音频整体失效的回归。

### 调整

- APlayer 适配暂时保留为轻量形态，不再复制原组件的歌词、音量、列表等复杂控件。
- 版本号提升到 `0.2.6`。
- 重新生成发布包 `dist/cc98-reborn-0.2.6.zip`。

## 0.2.5 - 2026-06-17

### 新增

- 新增 CC98 OpenID 本地绑定：通过授权码 + PKCE 授权，请求 `cc98-api` 和 `read-user-info` scope，读取 `https://api.cc98.org/me` 后只保存 UID、用户名、水印前八位等绑定摘要。
- 插件弹窗新增 OpenID 绑定卡片，支持查看绑定状态、解除绑定，并在绑定入口旁提供“退出此账号”。
- 登录后如果未完成同 UID OpenID 绑定，页面会显示虚化遮罩；遮罩内同样提供“绑定同一账号”和“退出此账号”两个操作。
- OpenID 绑定成功后启用全站水印；水印内容使用 `/me` 返回的 `watermarkId` 前八位，解绑或退出账号后立即停用。
- 适配 CC98 登录中心的密码登录页面，保留原始登录表单、通行密钥入口和 CSRF 提交逻辑。

### 修复

- 修复登录跳转检测过早触发的问题，减少 stale 本地登录状态导致的提前回首页或反复刷新 `/logOn`。
- 修复登录过程中残留退出跳转计时器的问题，避免刚登录成功又被拉回登录页。
- 修复登录后偶发落到 `https://www.cc98.org/null` 的情况，会自动回到 CC98 首页后再要求 OpenID 绑定。
- 修复 OpenID 与当前网页 CC98 账号不一致时仍可能写入水印绑定的问题；现在必须通过 UID 一致性校验。
- 修复勾选 OpenID “下次不再显示此窗口”后，绑定其他账号时可能静默复用旧 OpenID 会话的问题；绑定时会强制重新登录与授权确认。
- 修复登录中心 `openid.cc98.org` 被重构脚本影响，导致原生复选框、下拉菜单、通行密钥等控件不可用的问题。
- 修复 OpenID `/me` 临时返回 5xx 时直接失败的问题；现在会短暂重试，并可回退到 OpenID `userinfo` 完成基础绑定。

### 调整

- 新增 `identity` 权限，以及 `openid.cc98.org`、`api.cc98.org` 主机权限，用于官方 OpenID 授权和 `/me` 信息读取。
- 水印改为更小字号、灰色、5% 透明度，不连续移动，只会隔一段时间变换位置。
- 插件弹窗中的 OpenID 绑定摘要标记为“使用本地数据”，且仅作为只读状态展示。
- 继续保持水印数据由扩展自己的 OpenID `/me` 读取，不再依赖网页会话探测。
- 版本号保持 `0.2.5`，发布包重新生成：`dist/cc98-reborn-0.2.5.zip`。

## 0.2.4 - 2026-06-17

### Added

- 插件弹窗新增一键清除 CC98 Cookie 和本地站点数据功能，用于刷新十大；清理前会提示会抹掉本地稍后再看、版面置顶与草稿等数据。
- 清理 CC98 站点数据后，会自动刷新已打开的 CC98 标签页，降低页面继续停留在旧缓存状态的概率。
- 插件弹窗右上角新增 `ℹ️` 信息面板，显示当前插件版本、作者头像、CC98 主页和 Github 主页。

### Changed

- 新增 `browsingData` 权限，仅在用户点击清理按钮并确认后用于清除 CC98 相关站点数据。
- Version bumped to `0.2.4`.
- The release package was regenerated as `dist/cc98-reborn-0.2.4.zip`.

## 0.2.3 - 2026-06-16

### Added

- 新增帖子投票组件适配：投票区块会独立显示在正文中，并保留原站的选项勾选、投票和重置功能。
- 新增插件更新检测：支持弹窗内手动检查、定时后台检查、扩展图标 `NEW` 标记，以及每次启动浏览器时仅展示一次的页面更新提醒。
- 更新检测加入多来源回退，依次尝试 GitHub Release API、Release 列表、Latest 页面和镜像接口，降低单一接口返回 404 或 504 时的失败率。

### Fixed

- 修复关注用户和粉丝列表中点击用户名只改变地址、页面却没有刷新的问题。
- 修复投票区块可能被误归入签名档的问题。
- 修复弹窗更新入口位置、更新红点提示和发布页跳转行为。

### Changed

- 更新检查间隔设为 6 小时，并使用浏览器会话存储避免同一次浏览器运行期间重复弹出提醒。
- 新增 `alarms` 权限，以及 GitHub Release 和更新镜像所需的主机权限。
- Version bumped to `0.2.3`.
- The release package was regenerated as `dist/cc98-reborn-0.2.3.zip`.

## 0.2.2 - 2026-06-14

### Fixed

- 修复回帖、发帖在原站未抛出错误页时可能停留在提交遮罩的问题，新增 post/reply 专用兜底刷新。
- 修复热评高亮只匹配正文导致的误判，现在需要作者身份和正文指纹同时一致才会判定为热评。
- 修复“我的回复”中右侧回复摘要没有进行 UBB 渲染的问题，保留原有链接跳转行为。

### Changed

- Version bumped to `0.2.2`.
- The release package was regenerated as `dist/cc98-reborn-0.2.2.zip`.

## 0.2.1 - 2026-06-02

### Added

- Added local draft save, restore, and clear controls for post, reply, and edit editors.

### Fixed

- Fixed top-right user and message dropdown menus in non-night dark themes so they now use the active dark theme palette.

### Changed

- Version bumped to `0.2.1`.
- The release package was regenerated as `dist/cc98-reborn-0.2.1.zip`.

## 0.2.0 - 2026-06-02

### Added

- Cached hot-reply fingerprints during first-page previsit so matching hot replies on later pages can be highlighted consistently.
- Added a fuller private-message proxy UBB editor with link, image, video, Bilibili, audio, emoji, color, and preview controls while preserving native message sending.
- Switched emoji rendering to bundled local extension assets, including CC98, AC, dark AC, Tieba, Mahjong Soul, classic, and Mahjong-face resources.

### Fixed

- Replaced native post/reply/edit emoji panels with the same custom floating emoji panel used by private messages.
- Hardened post, reply, and edit submit recovery so successful submissions no longer stay stuck on the loading overlay.
- Preserved submit target information across native-editor restoration, preventing the fallback refresh from losing its destination.
- Improved private-message emoji popup stacking and spacing when category tabs wrap.
- Fixed image prewarm flow so applicable pages scroll from the top before collecting images.
- Restored enough bottom scroll room for editor popovers that extend below the visible editor.

### Changed

- Version bumped to `0.2.0`.
- Release packages now include the bundled `images/` emoji asset directory.
- The release package was regenerated as `dist/cc98-reborn-0.2.0.zip`.

## 0.1.8 - 2026-06-01

### 新增

- 为全站新增更多配色方案：竹影、湖蓝、蔷薇、石墨、星夜、绛夜。
- 插件弹窗主题区新增“更多……”展开菜单，选择更多主题后会在按钮旁显示当前主题。

### 修复

- 新增暗色主题会统一走暗色适配层，避免 Ant 弹窗、下拉、日历等组件只在“夜读”主题下适配。
- 修复“正在加载帖子图片”“正在整理阅读界面”等加载遮罩在部分暗色主题下仍使用浅色文字或浅色底的问题。

### 变更

- 版本号提升到 `0.1.8`。
- 重新生成发布包 `dist/cc98-reborn-0.1.8.zip`。

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
