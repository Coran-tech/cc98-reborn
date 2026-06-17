# CC98 Reborn

[更新日志](./CHANGELOG.md)

CC98 Reborn 是一个面向 Chrome / Edge 的 CC98 论坛界面重构插件。它会在浏览器本地重建常用页面的阅读和操作界面，同时尽量复用原站已有控件，保证发帖、回复、上传、评分、私信、收藏等功能仍由原站逻辑处理。

当前预发布版本：`0.2.6`。

## 主要功能

- 重构首页、版面、帖子列表、搜索结果、帖子正文、个人中心、消息中心、发帖和回复编辑器。
- 提供多套明暗配色方案，并适配原站 Ant 组件、弹窗、下拉菜单、日历等顽固控件。
- 优化帖子正文、引用、签名档、表情、图片、视频、音频播放器、下载文件按钮等显示。
- 帖子图片支持预热、点击放大、拖拽查看、滚轮缩放、前后切换和保存。
- APlayer 音频块会被重构为轻量播放器，显示音频名、播放按钮和进度条，并尽量代理原站播放逻辑。
- 支持楼层锚点跳转，例如 `#2`，并尽量修复跨页查看原帖导航。
- 支持首页只保留十大、非第一页预热第一页以识别楼主和热评。
- 支持本地“稍后再看”、版面置顶、本地草稿保存与恢复。
- 支持搜索结果重构、搜索类型适配、搜索结果排序和本地搜索联想。
- 支持帖子投票、评分记录表格、风评变化统计、隐藏图片按钮、签名档 UBB 渲染等帖子内组件适配。
- 支持私信页面重构，并保留原站私信发送与 UBB 能力。
- 支持插件更新检测；发现新版本时会在弹窗中提示，并在浏览器启动后展示一次页面提醒。
- 弹窗中提供清除 CC98 Cookie 和本地站点数据功能，用于刷新十大；清理前会提示会抹掉稍后再看、版面置顶与草稿等本地数据。
- 可选 CC98 OpenID 绑定，使用授权码 + PKCE，只在本地保存身份摘要；绑定后可启用本地水印。

## 水印与安全说明

水印功能通过 CC98 OpenID 绑定启用。插件只使用 `/me` 返回的 `watermarkId` 前八位，并在本地绘制水印；解绑后会立即停用。

当前版本不会向第三方上传帖子正文、私信、搜索词或插件设置。更新检测只读取公开版本信息；OpenID 绑定只保存本地身份摘要，不持久化 access token。隐私说明见 [PRIVACY.md](./PRIVACY.md)。

AI 搜索联想和高级模糊搜索仍保持关闭。

## 本地安装

1. 下载发布页中的最新压缩包。
2. 解压到一个固定文件夹，安装后不要随意删除或移动。
3. 打开 `edge://extensions/` 或 `chrome://extensions/`。
4. 开启“开发人员模式”。
5. 点击“加载解压缩的扩展”，选择刚才解压出来的插件文件夹。
6. 打开 `https://www.cc98.org/`，插件会自动生效。

发布页：

```text
https://github.com/Coran-tech/cc98-reborn/releases
```

## 发布包

项目提供打包脚本：

```powershell
.\scripts\package-extension.ps1
```

生成的发布包位于：

```text
dist/cc98-reborn-0.2.6.zip
```

发布包包含运行所需文件：

- `manifest.json`
- `assets/`
- `images/`
- `popup/`
- `src/background.js`
- `src/content.js`
- `src/page-submit-monitor.js`
- `src/styles.css`
- `README.md`
- `README.zh-CN.md`
- `CHANGELOG.md`
- `LICENSE`
- `PRIVACY.md`

## 权限说明

- `storage`：保存本地设置、稍后再看、版面置顶、草稿和绑定摘要。
- `downloads`：让帖子中的下载按钮直接触发浏览器下载。
- `alarms`：定时检查 GitHub 发布页是否存在新版本。
- `browsingData`：仅在用户确认清理时，用于清除 CC98 Cookie 和本地站点数据。
- `identity`：仅在用户点击绑定时，用于打开 CC98 OpenID 授权流程。
- `activeTab`：用于当前标签页内的必要交互。
- CC98 相关域名权限：在 CC98 和常见 WebVPN 域名上运行内容脚本。
- CC98 OpenID / API 权限：用于交换授权码，请求 `cc98-api` / `read-user-info`，并读取 `https://api.cc98.org/me`。
- GitHub Release 与镜像域名权限：仅读取公开版本发布信息。

## 开发检查

```powershell
node --check .\src\content.js
node --check .\src\background.js
node --check .\popup\popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```