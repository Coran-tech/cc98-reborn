# 架构

## 技术栈

| 层       | 选择                                                        |
| -------- | ----------------------------------------------------------- |
| 扩展框架 | WXT 0.21（Manifest V3）                                     |
| 语言     | TypeScript（入口、图标、弹窗）；旧运行时模块仍是 JavaScript |
| UI       | React 19 + Tailwind CSS v4 + HeroUI v3                      |
| 图标     | Lucide（`lucide` 核心包 + `lucide-react`）                  |
| 包管理   | pnpm 11                                                     |
| 测试     | Node 内置断言 + Playwright（浏览器测试按需运行）            |

构建产物在 `dist/chrome-mv3`。浏览器加载扩展时加载该目录，不要加载仓库根目录。

## 目录

| 路径           | 职责                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `entrypoints/` | WXT 入口。`content.ts` 按顺序装载旧运行时模块；`background.ts` 装载后台模块；`popup/` 是 React 设置页       |
| `src/ui/`      | TypeScript 共享层：`icons.ts` 图标注册表、`install-legacy-globals.ts` UMD 桥接、`install-icons.ts` 全局安装 |
| `src/`         | 旧运行时模块。仍按 IIFE / UMD 编写，逐步迁移                                                                |
| `modules/`     | WXT 构建模块。把 `images/`、`assets/`、旧弹窗和 KaTeX 字体按原路径复制到产物                                |
| `popup/`       | 仍由 HTML 直接加载的静态页面：`archive.html`、`semantic-settings.html`                                      |
| `tests/`       | 离线单元测试与可选的 Playwright 浏览器测试                                                                  |

## manifest 的来源

根目录 `manifest.json` 仍是权限、host、图标和 web accessible resources 的来源。
`wxt.config.ts` 读取它，并丢弃以下字段，改由入口生成：

- `content_scripts`：来自 `entrypoints/*.content.ts` 和 `content.ts`
- `background`：来自 `entrypoints/background.ts`
- `action.default_popup`：来自 `entrypoints/popup/index.html`

不要在 `manifest.json` 里继续添加运行时 JS；新增入口请放到 `entrypoints/`。

## 旧模块如何工作

旧文件大多是 UMD。打包后它们走 CommonJS 分支，API 变成模块导出而不是
`globalThis.CC98Reborn*`。`src/ui/install-legacy-globals.ts` 负责把导出重新挂回
全局，必须在任何旧模块之前导入。新增 UMD 模块时，在桥接文件里补一行映射。

旧模块之间只通过 `globalThis.CC98Reborn*` 通信；不要依赖另一个模块的顶层
`const`/`function`，打包后它们不再共享作用域。

## 图标规则

1. 所有 UI 图标来自 `src/ui/icons.ts` 的 `ICONS` 表，内容为 Lucide 图标节点。
2. 每个图标必须同时有 `ASCII_LABELS` 文案，供 ASCII 主题和测试使用。
3. 新代码用 `createIcon(name)`、`setIcon(control, name, {label})` 或
   `lucide-react` 组件，不要直接写 SVG path、字符或 emoji。
4. 不允许用彩色 emoji 做 UI chrome。正文里的论坛表情（`images/*`）不受此限制。
5. 按钮携带 `aria-label`；SVG 由注册表统一加 `aria-hidden`/`focusable="false"`。

## 弹窗

`entrypoints/popup/` 分为：

- `theme.ts`：默认值、主题核心、存储键
- `use-settings.ts`：读写 `chrome.storage.local`，合并补丁并防抖
- `runtime.ts`：消息、OpenID、更新、清理、备份
- `App.tsx`：HeroUI 组件与布局

嵌入式设置页通过 `?embedded=1` 打开：页面把自身高度 postMessage 给父页面，
并在“管理屏蔽规则”时发送 `cc98-reborn:settings-open-blacklist`。

## 校验

```sh
pnpm install
pnpm run check      # 格式、ESLint、语法、manifest、tsc、离线测试
pnpm run verify     # 构建 + 产物 manifest 校验 + tsc
```

浏览器测试加载 `dist/chrome-mv3`，需要本地论坛模拟器或真实的 CC98 页面。
