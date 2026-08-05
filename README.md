# CC98 Reborn

面向 Chrome / Edge 的 CC98 论坛界面重构扩展。

它的主要目标很简单：让 CC98 的页面更统一、更清爽，也顺手补上一些日常浏览真正用得上的便利功能。扩展会在浏览器本地读取原页面已经加载的内容，构建新的阅读界面；发帖、回复、上传、收藏、评分、关注、私信等关键操作则尽量继续调用原站逻辑。

当前版本：`0.3.1`

[下载发布包](https://github.com/Coran-tech/cc98-reborn/releases) ·
[提交 Bug](https://github.com/Coran-tech/cc98-reborn/issues) ·
[查看更新日志](./CHANGELOG.md) ·
[隐私说明](./PRIVACY.md)

> 本项目仍含有很高浓度的 Vibe Coding 成分。CC98 本身是持续变化的动态网页，扩展可能仍有遗漏或兼容性问题，欢迎通过 Issues 反馈。

## 它改了什么

### 统一的界面

- 重构首页、十大、新帖、关注、精选、版面、搜索、帖子、用户中心、消息中心和编辑页面。
- 提供多套亮色与暗色主题，并统一常见弹窗、下拉菜单、分页、日历和 Ant Design 原生组件。
- 提供可选的左侧效率栏；常规顶栏和效率栏均有重新整理的用户、消息与账号菜单。
- 适配 CC98 直连与浙江大学 WebVPN，站内导航会尽量保留当前访问方式。
- 返回首页或进入用户页时使用短时主题幕布，减少原版页面在重构前一闪而过。

### 更舒服的帖子阅读

- 重构正文、引用、Markdown 回复、签名档、评分记录、投票、热评和楼主标识。
- 图片支持点击放大、鼠标焦点缩放、拖动、前后切换和保存。
- 适配普通视频、哔哩哔哩视频、隐藏图片、文件下载和 APlayer 音频。
- 评分记录默认展开并统计风评变化；正负数在明暗主题下分别使用清晰的绿色与红色。
- 识别锁定主题、锁帖提示、跨页楼层链接和跨主题引用。
- 帖子作者头像可展开资料卡，并继续使用原站的关注和私信功能。

### 发帖与编辑

- 适配发主题、回复、编辑主题和编辑回复页面。
- UBB 模式提供上下双区编辑：上方直接编辑渲染内容，下方编辑带语法高亮的 UBB 源码，两边实时同步并可独立拉伸，中间分隔线也可拖动。
- 保留原站 UBB 工具栏、上传、表情、颜色、字号、链接、图片、视频和音频能力。
- 颜色面板支持常用色、透明色和快速渐变色。
- 适配原站 Markdown 编辑器，并为输入法提交与预览切换提供本地过渡预览。
- 发帖、回复和编辑均支持按页面与账号保存的本地草稿。
- 可选为普通回复加入 CC98 Reborn 小尾巴；匿名回复和心灵之约版面会自动停用。
- 个人资料的签名档使用同样的双区 UBB 编辑方式；为避免无法可靠回译，签名档编辑器不提供表情选择器。

### 搜索与稍后再看

- 适配主题、用户、版面、版内和全站搜索类型。
- 搜索联想只在本地分析当前输入，不会把搜索词发送给外部 AI 服务。
- 搜索历史按 CC98 用户 ID 保存，支持单条删除与全部清空。
- 搜索结果可按原顺序、时间或浏览量排序。
- 新帖、关注、精选和搜索结果右侧提供“稍后再看”侧栏，支持搜索、翻页、已读状态和删除。
- 完整“稍后再看”页面支持导入、导出和清除已读；数据按用户 ID 隔离保存在本地。

### 其他便利功能

- 首页可只保留十大，并记录排名变化。
- 版面支持本地置顶；锁定主题会显示锁标识和警戒斜纹。
- 图片和列表内容可在滚动时从原页面无感同步到新 UI。
- 支持浏览记录、我的收藏、黑名单页面和个人中心常用入口。
- 支持手动及定时检查 GitHub Releases 中的新版本。
- 提供显式的 CC98 Cookie 与站点数据清理入口，用于处理缓存异常或刷新十大。

## 安装

1. 前往 [Releases](https://github.com/Coran-tech/cc98-reborn/releases) 下载最新 ZIP。
2. 将 ZIP 解压到一个固定文件夹。安装后不要随意移动或删除该文件夹。
3. 打开 `edge://extensions/` 或 `chrome://extensions/`。
4. 开启“开发人员模式”。
5. 点击“加载解压缩的扩展”，选择刚刚解压得到的文件夹。
6. 打开 [CC98](https://www.cc98.org/)，扩展会自动生效。

升级时，使用新版本文件覆盖原文件夹，或解压到新文件夹后在扩展管理页重新加载。

## 基本使用

点击浏览器工具栏中的 CC98 Reborn 图标，可以：

- 开启或暂停界面重构。
- 选择配色、字号、表情大小和圆角。
- 切换首页十大模式、链接新标签页和左侧效率栏。
- 开启第一页预热、回复小尾巴等辅助功能。
- 设置版面、标题关键词和 UID 屏蔽规则。
- 绑定或退出 CC98 OpenID。
- 检查更新、查看项目信息或清理 CC98 站点数据。

页面顶栏中的“刷新”不是普通的浏览器刷新：它会重新读取原页面目前已经加载的内容，并同步到重构 UI。

## OpenID 与水印

登录 CC98 后，扩展会要求绑定同一账号的 CC98 OpenID，并通过 UID 检查网页账号与授权账号是否一致。

绑定时采用授权码 + PKCE：

- 临时 access token 只用于读取 `/me`，随后丢弃。
- 扩展只保存用户名、UID、绑定时间和水印所需的本地身份摘要。
- 水印使用 `watermarkId` 的前八位，在本地页面上绘制。
- 当前版本不会定时重新授权或刷新 `/me`；身份摘要会一直使用到重新绑定或解绑。
- WebVPN 授权会通过独立桥接脚本恢复回调，但不会上传论坛页面内容。

## 数据与隐私

扩展不会把帖子正文、私信、搜索词、草稿或插件设置上传到第三方服务器。

可能发生的网络访问仅包括：

- 用户正在访问的 CC98 或 WebVPN 页面及原站资源。
- 用户主动触发的 CC98 文件上传、下载和站内操作。
- 用户主动绑定时访问 CC98 OpenID 和 `/me`。
- 检查更新时读取公开的 GitHub Release 信息及备用镜像。

稍后再看、版面置顶、草稿、搜索历史、屏蔽规则和 OpenID 摘要均保存在浏览器本地。使用“清除 CC98 Cookie 与站点数据”会同时删除 CC98 页面自身保存的本地数据，可能包括上述内容，请先导出需要保留的数据。

AI 搜索联想和高级模糊搜索的外部接口当前保持停用。

完整说明见 [PRIVACY.md](./PRIVACY.md)。

## 已知限制

- 原站页面结构变化后，部分适配可能暂时失效。
- WebVPN 响应较慢时，重构界面和图片出现时间会比直连更晚。
- 一些复杂操作会复用并移动原站 DOM 控件，因此扩展与其他大型页面重构脚本可能互相影响。
- OpenID 的 WebVPN 授权依赖学校 WebVPN 对相关域名和回调地址的代理行为。

## 开发与校验

主要运行文件：

```text
manifest.json
src/
  background.js
  content.js
  openid-webvpn-bridge.js
  page-submit-monitor.js
  styles.css
popup/
assets/
images/
```

发布前检查：

```powershell
node --check .\src\content.js
node --check .\src\background.js
node --check .\src\openid-webvpn-bridge.js
node --check .\src\page-submit-monitor.js
node --check .\popup\popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
node .\tests\page-submit-monitor.test.js
node .\tests\openid-refresh.test.js
```

打包：

```powershell
.\scripts\package-extension.ps1
```

生成文件：

```text
dist/cc98-reborn-0.3.1.zip
```

发布包不包含 `reference/`、`tests/`、`.git/` 或其他开发期文件。

## English Summary

CC98 Reborn is a Chrome/Edge extension that rebuilds common CC98 pages into a cleaner, theme-aware interface while reusing native CC98 controls for important actions whenever possible.

It supports direct CC98 access and ZJU WebVPN, improves post reading and media viewing, provides local drafts, search history, per-user read-later storage, board pinning, user hover cards, update checks, and optional OpenID-based local watermarking.

The extension does not upload posts, private messages, search terms, drafts, or settings to third-party services. See [PRIVACY.md](./PRIVACY.md) for details.

Install the latest package from [GitHub Releases](https://github.com/Coran-tech/cc98-reborn/releases), extract it to a fixed folder, then load that folder from `chrome://extensions/` or `edge://extensions/` with Developer mode enabled.

## License

[MIT](./LICENSE)
