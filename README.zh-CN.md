# CC98 Reborn

[更新日志](./CHANGELOG.md)

CC98 Reborn 是一个面向 Chrome / Edge 的 CC98 论坛界面重构插件。它会在浏览器本地重建常用页面的阅读和操作界面，同时尽量复用原站已有控件，保证发帖、回复、上传、评分、私信、收藏等功能仍由原站逻辑处理。

当前预发布版本：`0.1.2`。

## 主要功能

- 重构首页、版面、帖子列表、搜索结果、帖子正文、个人中心、消息中心、发帖和回复编辑器。
- 提供浅色、雾色、深色阅读主题。
- 优化帖子正文、引用、签名档、表情、图片、音频播放器、下载文件按钮等显示。
- 支持帖子图片预热、图片查看器、滚轮缩放和拖拽查看。
- 支持楼层锚点跳转，例如 `#2`。
- 支持首页只保留十大、非第一页预热第一页以识别楼主。
- 支持屏蔽版面、标题关键词和 UID。
- 保留原站核心交互控件，降低重写逻辑带来的风险。

## 暂停功能

水印功能已暂时休眠，等待接入 CC98 官方 OAuth 授权流程后再启用。当前发布包不会主动请求水印接口，也不会加载水印桥接脚本。

AI 搜索联想和高级模糊搜索也已在当前版本关闭。

## 本地安装

1. 打开 `chrome://extensions` 或 `edge://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目目录。
5. 打开 `https://www.cc98.org/`，通过右上角插件弹窗调整设置。

## 发布包

已提供打包脚本：

```powershell
.\scripts\package-extension.ps1
```

生成的发布包位于：

```text
dist/cc98-reborn-0.1.2.zip
```

发布包包含运行所需文件：

- `manifest.json`
- `assets/`
- `popup/`
- `src/background.js`
- `src/content.js`
- `src/styles.css`
- `README.md`
- `README.zh-CN.md`
- `CHANGELOG.md`
- `LICENSE`
- `PRIVACY.md`

`src/watermark-bridge.js` 仅作为待启用实现保留在源码中，不会进入当前发布包。

## 权限说明

插件请求以下权限：

- `storage`：保存本地设置。
- `downloads`：用于帖子下载按钮直接触发浏览器下载。
- CC98 相关域名权限：在 CC98 和常见 WebVPN 域名上运行内容脚本。

当前发布版不会向第三方上传帖子正文、私信、搜索词或插件设置。隐私说明见 [PRIVACY.md](./PRIVACY.md)。

## 开发检查

```powershell
node --check .\src\content.js
node --check .\src\background.js
node --check .\src\watermark-bridge.js
node --check .\popup\popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```
