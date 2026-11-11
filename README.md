# CC98 Reborn

面向 Chrome / Edge 的 CC98 论坛界面重构扩展。

主要目标：让 CC98 的页面更统一、更清爽，也顺手补上一些日常浏览真正用得上的便利功能。扩展会在浏览器本地读取原页面已经加载的内容，构建新的阅读界面；发帖、回复、上传、收藏、评分、关注、私信等关键操作则尽量继续调用原站逻辑。

当前版本：`0.4.4`

[下载发布包](https://github.com/Coran-tech/cc98-reborn/releases) ·
[提交 Bug](https://github.com/Coran-tech/cc98-reborn/issues) ·
[查看更新日志](./CHANGELOG.md) ·
[隐私说明](./PRIVACY.md) ·
[文档目录](./docs/README.md)

> 本项目仍含有很高浓度的 Vibe Coding 成分。CC98 本身是持续变化的动态网页，扩展可能仍有遗漏或兼容性问题，欢迎通过 Issues 反馈。

## 它改了什么

### 统一的界面

- 重构几乎所有CC98主站页面。

  ![首页十大：左为 Reborn，右为 ASCII](./docs/images/interface-details/01-home.webp)


- 顶栏“稍后再看”右侧和个人中心导航最底部均有“插件设置”，打开独立设置子页，包含弹窗里的全部设置和账号、更新等功能。

  ![浏览偏好：左为 Reborn，右为 ASCII](./docs/images/interface-details/36-reading-options.webp)

  <details>
  <summary>字号与表情尺寸</summary>

  ![字号与表情尺寸：左为 Reborn，右为 ASCII](./docs/images/interface-details/37-display-size.webp)

  </details>

- 设置最底部“恢复默认”旁可备份和导入个人配置。

  ![个人设置备份：左为 Reborn，右为 ASCII](./docs/images/interface-details/38-settings-backup.webp)

- 明暗与配色独立设置：白昼、黑夜、自动三种模式，六组主色／副色配色预设和自定义方案。

  ![昼夜定时切换：左为 Reborn，右为 ASCII](./docs/images/interface-details/35-day-night.webp)

  <details>
  <summary>自定义主题色</summary>

  ![自定义主题色：左为 Reborn，右为 ASCII](./docs/images/interface-details/34-custom-palette.webp)

  </details>

- “界面风格”独立于明暗和配色。Reborn 保留当前界面；ASCII / BBS（实验性）使用字符边框、等宽字体、直角控件和彩色文字。

  ![界面风格设置：左为 Reborn，右为 ASCII](./docs/images/interface-details/33-theme.webp)


- 新增“分享收藏夹”、本地用户备注等功能。

  ![分享收藏夹：左为 Reborn，右为 ASCII](./docs/images/interface-details/39-favorite-export.webp)

  <details>
  <summary>导入收藏夹与用户备注</summary>

  ![导入收藏夹：左为 Reborn，右为 ASCII](./docs/images/interface-details/40-favorite-import.webp)

  ![用户备注：左为 Reborn，右为 ASCII](./docs/images/interface-details/41-user-note.webp)

  </details>


- 适配 CC98 直连与浙江大学 WebVPN。

### 更舒服的帖子阅读

- 所有重构的帖子卡片列表共用帖子侧窗。直接点击帖子标题，会在网页右侧打开独立帖子侧窗，打开时保留主列表内容与阅读位置，在左侧按剩余宽度重新排版。右侧显示帖子时，左侧列表仍可滚动、继续加载、按需渲染和点击。

  ![帖子侧拉窗：左为 Reborn，右为 ASCII](./docs/images/interface-details/03-drawer.webp)


- 重构正文、引用、Markdown 回复、签名档、评分记录、投票、热评和楼主标识。
- 高级用户屏蔽规则。

  ![逻辑屏蔽规则：左为 Reborn，右为 ASCII](./docs/images/interface-details/12-logic-filter.webp)

  <details>
  <summary>赞踩与风评、标题正则及表情条件</summary>

  ![赞踩风评屏蔽：左为 Reborn，右为 ASCII](./docs/images/interface-details/13-score-filter.webp)

  ![标题正则匹配：左为 Reborn，右为 ASCII](./docs/images/interface-details/14-title-regex.webp)

  ![屏蔽表情选择器：左为 Reborn，右为 ASCII](./docs/images/interface-details/15-emoji-filter.webp)

  </details>


- 图片支持点击放大、鼠标焦点缩放。

  ![图片查看器：左为 Reborn，右为 ASCII](./docs/images/interface-details/16-image-viewer.webp)

  <details>
  <summary>图片收藏管理</summary>

  ![图片收藏管理：左为 Reborn，右为 ASCII](./docs/images/interface-details/17-image-favorites.webp)

  </details>


- 评分记录默认展开并统计风评变化；正负数在明暗主题下分别使用清晰的绿色与红色。
- 楼层操作区的“查看对话”可在单个弹窗中递归追溯上游引用、查找本帖的下游回复，并切换追溯中心。

  ![引用对话树：左为 Reborn，右为 ASCII](./docs/images/interface-details/08-conversation.webp)


- 收藏左侧的“全文搜索”在独立窗口中搜索本帖所有楼层，支持正文关键词、楼层作者的用户名／UID，以及 `[ac01]`、`[cc9801]`、`[tb01]` 等表情编号。

  ![帖内全文搜索：左为 Reborn，右为 ASCII](./docs/images/interface-details/09-text-search.webp)

  <details>
  <summary>按用户或表情搜索</summary>

  ![按用户搜索：左为 Reborn，右为 ASCII](./docs/images/interface-details/10-author-search.webp)

  ![按表情搜索：左为 Reborn，右为 ASCII](./docs/images/interface-details/11-emoji-search.webp)

  </details>


- 帖子操作栏的“存档本帖”会重新逐页读取当前账号可见内容，保存正文、引用、表情、图片和签名档；可选保存音视频及附件。已有存档可点击“更新备份”，在保存它的账号下打开原帖并确认更新。插件设置的“本地帖子存档”打开独立查看页，可离线分页阅读、搜索存档标题、删除或导出。

  ![本地帖子存档：左为 Reborn，右为 ASCII](./docs/images/interface-details/07-archive.webp)


- 帖子作者头像可展开资料卡，并继续使用原站的关注和私信功能。

### 发帖与编辑

- 适配发主题、回复、编辑主题和编辑回复页面。

  ![本地草稿：左为 Reborn，右为 ASCII](./docs/images/interface-details/31-draft.webp)

- UBB 模式提供上下双区编辑：上方直接编辑渲染内容，下方编辑带语法高亮和逻辑行号的 UBB 源码；两边实时同步并可独立拉伸，中间分隔线也可拖动。

  ![上下双区编辑器：左为 Reborn，右为 ASCII](./docs/images/interface-details/19-dual-editor.webp)


- 保留原站 UBB 工具栏、上传、表情、颜色、字号、链接、图片、视频和音频能力。

  ![表情选择器：左为 Reborn，右为 ASCII](./docs/images/interface-details/29-emoji.webp)

  <details>
  <summary>收藏图片快速插入与文字排版</summary>

  ![收藏图片快速插入：左为 Reborn，右为 ASCII](./docs/images/interface-details/18-favorite-picker.webp)

  ![字体与排版：左为 Reborn，右为 ASCII](./docs/images/interface-details/20-typography.webp)

  </details>


- 双区工具栏的“扩展”可插入并预览引用、分割线、可编辑代码块、内嵌 Markdown、数学公式、原样文本、命名字体、1 至 6 行列的表格和折叠图片。

  ![扩展编辑工具：左为 Reborn，右为 ASCII](./docs/images/interface-details/32-extended-tools.webp)

  <details>
  <summary>表格、代码、Markdown、公式、引用与原样文本</summary>

  ![表格编辑：左为 Reborn，右为 ASCII](./docs/images/interface-details/23-table.webp)

  ![代码块：左为 Reborn，右为 ASCII](./docs/images/interface-details/24-code.webp)

  ![Markdown内容块：左为 Reborn，右为 ASCII](./docs/images/interface-details/25-markdown.webp)

  ![数学公式：左为 Reborn，右为 ASCII](./docs/images/interface-details/26-math.webp)

  ![嵌套引用：左为 Reborn，右为 ASCII](./docs/images/interface-details/27-quotes.webp)

  ![原样文本：左为 Reborn，右为 ASCII](./docs/images/interface-details/28-literal-text.webp)

  </details>


- 双区工具栏的“互转”可在 UBB 与 Markdown 间转换常用语法；先预览和修改结果，再手动替换。无法等价转换的格式会提示。

  ![UBB与Markdown互转：左为 Reborn，右为 ASCII](./docs/images/interface-details/30-convert.webp)

- 颜色面板支持常用色、透明色和快速渐变色。

  ![文字渐变色：左为 Reborn，右为 ASCII](./docs/images/interface-details/22-gradient.webp)

  <details>
  <summary>单色面板</summary>

  ![文字颜色：左为 Reborn，右为 ASCII](./docs/images/interface-details/21-color.webp)

  </details>

- 可选为普通回复加入 CC98 Reborn 小尾巴；匿名回复和心灵之约版面会自动停用。
- 个人资料的签名档使用同样的双区 UBB 编辑方式。

### 搜索与稍后再看

- 适配主题、用户、版面、版内和全站搜索类型。
- 通过本地分词实现简单搜索联想。搜索联想只在本地分析当前输入。

  ![搜索建议：左为 Reborn，右为 ASCII](./docs/images/interface-details/05-suggestions.webp)

- 搜索历史。搜索历史按 CC98 用户 ID 保存，支持单条删除与全部清空。
- 搜索结果可按原顺序、时间或浏览量排序。

  ![搜索与排序：左为 Reborn，右为 ASCII](./docs/images/interface-details/04-search.webp)


- 新帖、关注、精选和搜索结果右侧提供“稍后再看”侧栏，支持搜索、翻页、已读状态和删除。
- 这些侧栏下方提供等宽的“回到顶部”按钮，窄屏布局中仍会紧跟稍后再看组件。
- 完整“稍后再看”页面支持导入、导出和清除已读；数据按用户 ID 隔离保存在本地。

  ![稍后再看：左为 Reborn，右为 ASCII](./docs/images/interface-details/06-read-later.webp)



### 其他便利功能

- 首页可只保留十大，并记录排名变化。内容宽度与顶栏对齐。
- 主题卡片可选择始终展开附加信息并关闭悬浮展开动画。

  ![瀑布流卡片：左为 Reborn，右为 ASCII](./docs/images/interface-details/02-feed.webp)

- 版面支持本地置顶。
- 近期私信联系人右侧的图钉可置顶／取消置顶，最新置顶排在最前；按账号保存并跨标签同步。

  ![私信阅读与置顶：左为 Reborn，右为 ASCII](./docs/images/interface-details/42-messages.webp)


- 图片和列表内容可在滚动时从原页面无感同步到新 UI。
- 支持手动及定时检查 GitHub Releases 中的新版本。
- 提供显式的 CC98 Cookie 与站点数据清理入口，用于处理缓存异常或刷新十大。
- 可选的实验性“问号键”：在楼层的赞与踩之间显示问号和计数；使用前需同意独立隐私说明并完成同账号 CC98 OpenID 授权，默认关闭。

## 安装

1. 前往 [Releases](https://github.com/Coran-tech/cc98-reborn/releases) 下载最新 ZIP。
2. 将 ZIP 解压到一个固定文件夹。安装后不要随意移动或删除该文件夹。
3. 打开 `edge://extensions/` 或 `chrome://extensions/`。
4. 开启“开发人员模式”。
5. 点击“加载解压缩的扩展”，选择刚刚解压得到的文件夹。
6. 打开 [CC98](https://www.cc98.org/)，扩展会自动生效。

升级时，使用新版本文件覆盖原文件夹，或解压到新文件夹后在扩展管理页重新加载。

开发仓库中还包含论坛参考源码和测试依赖，请勿直接把整个项目根目录加载为扩展。运行打包脚本后，可直接选择 `dist/cc98-reborn-<版本号>/`；这是不含 `reference/`、`tests/` 和第三方测试密钥的干净目录。

## 基本使用

点击浏览器工具栏中的 CC98 Reborn 图标，可以：

- 开启或暂停界面重构。
- 在界面风格下调整“页面布局”：首页只保留十大、帖子卡片默认展开、左侧效率栏；明暗与配色独立选择。
- 在“浏览与阅读”中切换帖子侧拉窗、链接新标签页和后台预热第一页。
- 在“显示与图片”中调整字号、表情大小，按需开启图片预热并设置时长。
- 在“回复与互动”中切换回复小尾巴和实验性问号键。
- 设置版面、标题匹配和 UID 屏蔽规则。标题支持普通关键词和 `/正则/i`，输入时自动检查语法；正则在独立线程限时匹配。
- “屏蔽规则”的“发言条件”页支持按正文文本、表情编号的出现次数，以及本楼风评、赞数、踩数、赞踩比、赞踩总数折叠发言。输入旁的“选择表情”复用编辑器六组表情面板，选中即填入标准编号。快捷输入可添加次数或数值条件，并以“且／或”拼入高级表达式；支持 AND／OR／NOT（且／或／非）、括号与正则，例如 `"[ac01]" > 3`、`("广告" OR "推广") AND NOT "讨论"`、`/加[微薇]信/i >= 2`、`风评 < -3 OR (赞踩比 < 0.5 AND 赞踩总数 >= 20)`。多条规则任一命中即折叠；正文不含引用和签名，文本不区分大小写且按不重叠次数统计。风评是该楼完整评分记录里的风评值净增减；赞踩比为赞÷踩，有赞无踩视为无限大，零赞零踩、缺失数字或未展开完整的评分记录不判定。规则纳入个人设置备份，兼容旧黑名单配置；本地计算不额外请求服务器，正则在独立线程限时运行，异常会在规则页提示。
- 绑定或退出 CC98 OpenID。
- 检查更新、查看项目信息或清理 CC98 站点数据。

页面顶栏中的“同步”不是普通的浏览器刷新：它会重新读取原页面目前已经加载的内容，并同步到重构 UI。

新帖页试验性地按需挂载视口附近的卡片和图片。需要浏览器页内查找时，可在“浏览方式”中点“显示全部”；再点“恢复按需显示”切回。已加载的帖子数据保留，原站列表不删除。

启用问号键后，在 CC98 直连帖子的楼层中点击 `?`，阅读隐私说明并确认，再完成 OpenID 授权。此后页面会显示已加载楼层的问号计数；再次点击可取消自己的问号。此实验暂不支持 WebVPN 授权，也不替代原站的赞、踩、评分或回复。

## OpenID 与水印

登录 CC98 后，扩展会要求绑定同一账号的 CC98 OpenID，并通过 UID 检查网页账号与授权账号是否一致。

绑定时采用授权码 + PKCE：

- 临时 access token 只用于读取 `/me`，随后丢弃。
- 扩展只保存用户名、UID、绑定时间和水印所需的本地身份摘要。
- 水印在本地绘制为两行 Consolas 文字：第一行为前补零至八位的 UID、两个空格、前补零至八位的当前帖号；第二行为八位用户水印（已绑定 OpenID 的 `watermarkId` 前八位）紧接十位秒级 Unix 时间戳，中间不加空格，每秒更新。UID 与用户水印使用同一份本地绑定摘要。非帖子页的帖号为 `00000000`。侧拉窗与主页面共用一层水印，帖号跟随当前侧窗；关闭侧窗后恢复主页面帖号。
- 当前版本不会定时重新授权或刷新 `/me`；身份摘要会一直使用到重新绑定或解绑。
- WebVPN 授权会通过独立桥接脚本恢复回调，但不会上传论坛页面内容。

## 数据与隐私

扩展不会把帖子正文、标题、图片、私信、搜索词、草稿或插件设置上传到问号服务。问号功能默认关闭；开启并确认隐私说明后，才会与独立 HTTPS 服务通信。

可能发生的网络访问仅包括：

- 用户正在访问的 CC98 或 WebVPN 页面及原站资源。
- 用户点击“查看对话”后，按当前访问方式读取相关帖子页面；原站可能据此更新浏览量、足迹或已读状态。对话缓存按账号隔离，在当前标签页保留最近 6 个帖子的已读页面。内存保留当前帖的各页，并将内容写入 CC98 站点的标签页会话存储，以便整页翻页和刷新后复用；会话快照上限 4 MiB，优先移除旧帖，超出快照容量的大帖会在跳转后补读。关闭弹窗不会清空缓存，切换账号不复用旧账号内容，手动“刷新对话”会重新读取。缓存不进入个人配置备份，也不上传到问号或其他外部服务。
- 用户主动触发的 CC98 文件上传、下载和站内操作。
- 用户主动绑定时访问 CC98 OpenID 和 `/me`。
- 检查更新时读取公开的 GitHub Release 信息及备用镜像。
- 可选问号功能在授权时发送 CC98 OpenID ID Token 以换取短期会话；授权后查询或切换问号时发送数字帖号和楼层号。服务端使用身份摘要限制每个账号对每个楼层只有一个当前问号状态，普通用户只能查询汇总计数和自己的状态；服务端运营方仍能接触服务端数据。

稍后再看、版面置顶、草稿、搜索历史、屏蔽规则和 OpenID 摘要均保存在浏览器本地。使用“清除 CC98 Cookie 与站点数据”会同时删除 CC98 页面自身保存的本地数据，可能包括上述内容，请先导出需要保留的数据。

问号功能的服务端尚无法独立确认楼层存在性或原站访问权限，请勿将实验功能视为原站官方能力；目前仅在直连页面验证。

完整说明见 [PRIVACY.md](./PRIVACY.md) 和[问号功能独立隐私说明](https://question.coranqwq.xyz/privacy)。

## 已知限制

- 原站页面结构变化后，部分适配可能暂时失效。
- WebVPN 响应较慢时，重构界面和图片出现时间会比直连更晚。
- 一些复杂操作会复用并移动原站 DOM 控件，因此扩展与其他大型页面重构脚本可能互相影响。
- OpenID 的 WebVPN 授权依赖学校 WebVPN 对相关域名和回调地址的代理行为。

## 开发与校验

开发检查使用 Node.js 22，扩展保持 JavaScript，不增加运行时构建步骤。

```sh
npm ci
npm run check
```

统一入口包含格式检查、ESLint、语法检查、Manifest 引用检查和无账号单元测试。格式规范渐进接入，不批量重排历史运行时代码。目录约定、格式门禁和浏览器测试环境见 [贡献指南](./CONTRIBUTING.md)；各功能的发布前检查见 [发布检查表](./docs/development/releasing.md)。

打包：

```powershell
.\scripts\package-extension.ps1
```

测试构建使用 `./scripts/package-extension.ps1 -TestBuild`，显示为 `beta 0.4.4 (build 年月日.时分秒)`；可用 `-Build xxx` 指定编号。固定覆盖 `dist/cc98-reborn-beta/` 和 `dist/cc98-reborn-beta.zip`，浏览器只需加载一次该目录，以后更新后点击重新加载。直接加载源码测试前运行 `./scripts/set-test-build.ps1` 更新编号。页面、popup 和插件设置页均优先显示 beta / build 版本；默认正式打包自动移除后缀，更新比较始终使用纯数字版本号。

本地模拟论坛已独立到相邻项目 `cc98-local-forum`，包含前端、服务器和 `.runtime` 数据；在该目录运行 `node server.js` 或打开 `open-control-panel.cmd`。插件集成测试通过 `tests/local-forum-path.cjs` 引用它，可设置 `CC98_LOCAL_FORUM_ROOT` 指定目录，测试时自动注入当前插件源码路径。

生成文件：

```text
dist/cc98-reborn-0.4.4.zip
dist/cc98-reborn-0.4.4/
```

发布包不包含 `reference/`、`tests/`、`.git/` 或其他开发期文件。

## English Summary

CC98 Reborn is a Chrome/Edge extension that rebuilds common CC98 pages into a cleaner, theme-aware interface while reusing native CC98 controls for important actions whenever possible.

It supports direct CC98 access and ZJU WebVPN, improves post reading and media viewing, provides local drafts, search history, per-user read-later storage, board pinning, user hover cards, update checks, and optional OpenID-based local watermarking. An experimental question reaction is available on direct CC98 pages and is off by default.

The extension does not upload posts, private messages, search terms, drafts, or settings to the external question service. If users enable and consent to the optional question reaction, an OpenID ID Token and numeric topic/floor identifiers are sent to that service. See [PRIVACY.md](./PRIVACY.md) and the [question feature privacy notice](https://question.coranqwq.xyz/privacy) for details.

Install the latest package from [GitHub Releases](https://github.com/Coran-tech/cc98-reborn/releases), extract it to a fixed folder, then load that folder from `chrome://extensions/` or `edge://extensions/` with Developer mode enabled.

## License

[MIT](./LICENSE)
