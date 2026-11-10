# 参与开发

扩展继续使用 JavaScript。开发检查使用 Node.js 22.13 或更新的 22.x 版本；浏览器加载扩展不需要安装 Node.js，也不增加运行时构建步骤。

## 先运行本地检查

```sh
npm ci
npm run check
```

检查使用锁定的开发依赖。不要把 `node_modules/` 放进插件包，也不要为了通过检查顺手重排未修改的旧源码。

## 格式与 lint 如何接入

```sh
npm run format:check
npm run lint
npm test
```

Prettier 检查新增或修改的文件，而不是首次接入就改写整仓。首次接入时，比较基线里尚无 `.prettierrc.json`，历史文件路径清单只豁免这一轮的旧格式；新增工具和文档仍必须通过。基线已包含格式配置后，清单不再豁免被修改的文件。

默认与 `HEAD` 比较；也可明确指定比较基线或文件：

```sh
npm run format:check -- --base <commit>
npm run format:check -- --files src/example.js
npm run format -- --files src/example.js
```

CI 使用 PR 的基线提交或 push 前的提交；新分支首次 push 会与远程默认分支的共同祖先比较，缺少该历史时检查失败，不重新启用首次接入豁免。`npm run format:check -- --all` 可用于审计整仓格式债务，不是默认门禁。修改旧的大文件时先看格式差异，避免把功能修复和大范围重排混在一起。

ESLint 覆盖自有 JavaScript，按浏览器脚本、后台和 Node 环境配置。既有问题通过 ESLint 的抑制清单按“文件 + 规则”记录数量，不为此修改运行时逻辑；新文件的违规、或已有文件超出该规则存量数量的违规会阻止检查通过。该机制不是逐条定位比对，不能识别同一文件中等量替换的违规。修复旧问题时缩减对应清单，不要用整目录忽略或关闭规则掩盖新问题。

## 目录与职责

| 目录                                | 内容                                 |
| ----------------------------------- | ------------------------------------ |
| `src/`、`popup/`                    | 扩展运行时代码与界面                 |
| `images/`、`assets/`、`src/vendor/` | 随插件分发的资源和第三方库           |
| `tests/`                            | 单元测试、浏览器测试和可复用 fixture |
| `scripts/`                          | 开发检查、打包和平台工具             |
| `experiments/`                      | 问号、语义模型等独立功能的源码       |
| `question-service/`                 | 独立问号服务                         |
| `docs/`                             | 功能说明、发布检查表与历史发布资料   |
| `archive/`                          | 已退役的项目源码，保留供历史查询     |

`dist/`、`outputs/`、本机 `.codex/` 和 `.agents/` 不进入 Git。介绍素材生成的 PNG、HTML、文案和交付清单也不进入 Git；不要删除仍被插件引用的 `images/`、`assets/` 或测试 fixture。

## 验证受影响的功能

`npm run check` 面向可在干净仓库运行的开发检查与无账号测试。浏览器交互、视觉效果和原站适配还需要对应的浏览器测试，具体入口见 [发布检查表](docs/development/releasing.md)。

部分浏览器测试依赖单独的 `cc98-local-forum` 项目，可通过 `CC98_LOCAL_FORUM_ROOT` 指定其目录。模拟器、测试账号和数据库不要提交到扩展仓库；不要让 CI 使用个人浏览器配置或真实论坛登录数据。

修改页面或编辑器时，至少检查实际渲染、关键操作和关闭功能后的恢复行为。主题相关改动检查现代／ASCII、明暗和窄屏；不要只凭页面成功打开判断完成。

## 提交一个聚焦的改动

说明修改目的、涉及的页面或功能，以及已运行的检查。功能修改与大范围格式整理分开提交，不混入本机设置、生成物或其他任务的改动。

`manifest.json` 是插件版本的来源，根目录 `package.json` 只管理开发工具。不要为了升级开发依赖更改插件版本、权限、存储键或脚本加载顺序。

打包仍使用 `scripts/package-extension.ps1`。测试版保留 `beta … (build …)` 标签，正式版移除标签。CI 不自动发布扩展或部署问号服务。

## 重新生成历史介绍素材

```sh
node docs/releases/0.3.7/intro/build.cjs
node docs/releases/0.3.7/intro/render.cjs
```

第一步生成文案和 HTML；第二步需要 Playwright 和本机 Edge，生成 PNG。两步均不访问论坛。修改说明时同步修改 `build.cjs` 中的 README 模板，以免重新生成时覆盖说明。
