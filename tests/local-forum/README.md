# CC98 本地完整论坛

这个分支把本地模拟环境独立成一套可持久运行的论坛：直接托管
`reference/Forum-main/dist/static` 中已构建的论坛前端包，所有 API、账号、帖子、
上传文件和管理数据都由本机后端提供。它不会转发到 CC98 生产 API，也不会把本地
内容上传到公网。

服务端监听地址硬编码为 `127.0.0.1`。即使环境中误设了 `CC98_LOCAL_HOST`，也不会
改为监听局域网或公网地址；页面配置中的 API、OpenID 和上传地址同样只指向当前本地
实例。服务还会拒绝非本机 `Host`、跨站 `Origin` 和 `Sec-Fetch-Site: cross-site`
请求；论坛页面的 CSP 将 `fetch`、XHR 和 WebSocket 连接限制在当前本地源。

## 运行依赖

- Node.js 18 或更新版本
- `reference/Forum-main/dist/static/index.html`
- `reference/Forum-main/dist/static/scripts/` 与 `images/`
- `reference/Forum-main/node_modules/typescript`（仅前端 API 审计使用）

`server.js` 使用上述静态资源提供真实论坛界面，再注入本项目的本地 shim 和 Reborn
脚本。它不会执行 `reference/Forum-main` 的开发服务器，也不会启动任何生产后端；若
静态资源目录被删除、移动或未同步，本地论坛的页面无法渲染。需要重新构建前端包时，
可在 `reference/Forum-main` 中使用其原有的 `npm run build:debug` 或
`npm run build:release`，然后确认产物仍位于 `dist/static`。

## 启动

Windows 下可以双击 `open-control-panel.cmd`，也可以在项目根目录执行：

```powershell
node tests/local-forum/server.js
```

默认监听 `http://127.0.0.1:44303`。可打开：

- `http://127.0.0.1:44303/`：论坛首页
- `http://127.0.0.1:44303/topic/6500000/1`：种子主题
- `http://127.0.0.1:44303/editor/postTopic/81`：发主题
- `http://127.0.0.1:44303/editor/edit/900001`：编辑首帖
- `http://127.0.0.1:44303/usercenter`：个人中心与模拟账号切换
- `http://127.0.0.1:44303/register`：注册本地账号
- `http://127.0.0.1:44303/usercenter/security`：修改当前账号密码
- `http://127.0.0.1:44303/sitemanage`：论坛内站务快捷管理
- `http://127.0.0.1:44303/__local/console`：本地管理控制台

账号相关路由使用独立的本地页面壳，不启动原论坛的 React 主应用。这样表单输入不会被
后台重渲染替换，个人资料、注册、登录和改密请求会直接写入本地后端。普通首页、版面、
主题和编辑器仍加载原论坛前端，以继续验证真实论坛交互。兼容模式可在个人中心或登录页
直接切换模拟账号；严格模式以 HttpOnly 会话 Cookie 作为唯一身份来源。

控制台现在是本地论坛与注入插件的统一管理面板，包含：

- 服务概览与兼容模式模拟账号切换
- 按 UID 隔离的 Reborn 全量设置、本地存储查看与重置
- 账号注册、站务/版主角色、展示头衔、状态、密码和会话
- 版面创建、说明、开关与版主分配
- 主题搜索、锁定、置顶、精华、软删除与恢复
- 全站公告、推荐阅读、推荐功能、校园新闻和广告栏目
- 完整性检查、审计记录、JSON 导出/恢复、快照备份和恢复种子数据

原有 WPF 控制面板仍负责启动、停止、重启服务，并提供“打开全量控制台”入口；浏览器
控制台负责论坛内部配置。
`/sitemanage` 在 Reborn 本地环境中会显示站务仪表页，并可直接创建账号、调整站务/版主
角色、变更账号状态、重置密码、维护注册策略，以及锁定、置顶、精华、删除或恢复近期
主题；需要版面、首页、插件存储和备份等全量设置时，可继续进入对应控制台分区。

启动时不会重置现有数据。只有显式设置 `CC98_LOCAL_RESET=1` 或数据文件尚不存在时，
后端才会生成种子数据；日常启动不要设置这个变量。

## 默认账号

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `LocalTester` | `LocalTest!2026` | 站务管理员 |
| `SyntaxTester` | `SyntaxTest!2026` | 普通用户 |

密码使用加盐 `scrypt` 哈希保存，不保存明文。访问令牌和刷新令牌为随机不透明
字符串，数据库只保存 SHA-256 摘要；授权码绑定客户端与回调地址、短时有效且只能
兑换一次。登录失败会临时锁定，退出会撤销会话，后台动作写入审计记录。

默认启动是兼容模式，浏览器 shim 可以直接进入论坛，便于测试插件现有功能。shim
不再使用页面内临时对象模拟 `chrome.storage.local`：插件数据按 UID 写入
`forum-data.json`，刷新、重启和不同标签页之间保持一致；控制台修改后，已打开的
论坛页会轮询并接收变更。OpenID 令牌、会话摘要和密码摘要不会经由插件存储接口暴露。
要测试真实登录边界，使用严格模式：

```powershell
$env:CC98_LOCAL_REQUIRE_AUTH = "1"
node tests/local-forum/server.js
```

严格模式下，账号范围的读写操作必须带有效 `Bearer` 会话或本机 HttpOnly 会话 Cookie。
普通用户可以发帖、回复、编辑自己的内容，版主只能管理被分配的版面，站务管理员
可以执行站点级管理操作。关注、收藏、浏览记录和私信均按用户隔离；私信删除是
“对当前用户隐藏”，两名参与者都删除后才会从本地数据中移除。

被软删除的版面、主题和楼层不会继续出现在阅读、搜索、收藏、足迹、通知、统计或
基础信息接口中。版面事件、版面禁言名单和主题操作记录仅向对应版主或站务管理员
开放；通知目标被删除后会被从普通用户的列表与未读计数中排除。

批量删除、批量锁定会先校验全部目标主题，任一主题不存在、版面不匹配或越权时整批
拒绝，不会只完成一部分。移动主题要求操作者同时拥有来源版面和目标版面的管理权限。
普通用户读取投票时只会得到选项统计和自己的脱敏选择；完整投票记录、用户名与本机
测试 IP 仅对应版主或站务管理员可见。导入备份会先运行完整性检查，非法数据不会覆盖
当前数据库。

管理员通过 `POST /auth/register` 创建账号时不会替换管理员当前会话；普通注册则会
自动登录新账号。暂停账号、重置密码会撤销该账号的所有会话；系统拒绝移除或暂停
唯一的活动站务管理员。

## 本地 OpenID

本地 OpenID 仅用于模拟插件绑定链路，默认客户端固定为本地测试客户端。严格模式下：

- `/openid/connect/token` 的密码、刷新令牌和授权码交换均校验 `client_id` / `client_secret`
- `/openid/connect/authorize` 需要已有本地登录态，并只接受 localhost 或 Chromium 扩展回调地址
- 授权码绑定用户、客户端与回调地址，五分钟后失效且只能兑换一次
- `/openid/connect/endsession` 会撤销会话并清除本机 HttpOnly 会话 Cookie

它不是生产 CC98 OpenID 服务的替代品，也不应被暴露到网络环境。

## 数据与诊断

默认数据目录：

- `tests/local-forum/.runtime/forum-data.json`
- `tests/local-forum/.runtime/uploads/`
- `tests/local-forum/.runtime/backups/`

运行时目录已被 git 忽略。可以用环境变量切换位置：

```powershell
$env:CC98_LOCAL_DATA_PATH = "D:\cc98-local\forum-data.json"
$env:CC98_LOCAL_UPLOAD_ROOT = "D:\cc98-local\uploads"
$env:CC98_LOCAL_BACKUP_ROOT = "D:\cc98-local\backups"
```

本地诊断 API：

- `GET /__test/health`：进程、请求和脱敏数据库统计
- `GET /__test/requests`：当前进程请求记录；严格模式下仅站务管理员可读
- `GET /__test/state`：脱敏数据库快照，不包含密码摘要和令牌
- `GET /__test/integrity`：检查版面、主题、首楼、楼层、父回复、通知、投票、收藏、反应、评分、会话、私信和版主引用
- `GET /__test/export`：管理员下载完整 JSON 备份
- `POST /__test/backup`：创建带时间戳的快照
- `POST /__test/restore`：管理员恢复经过校验的 JSON
- `POST /__test/reset`：恢复种子数据
- `POST /__test/shutdown`：让本地服务完成当前请求后正常退出
- `GET /__test/unknown`：列出未被本地后端识别的 API 请求

恢复数据前会自动建立当前快照；上传文件是独立目录，若要完整迁移媒体，需要和
JSON 一起复制。服务默认只绑定 `127.0.0.1`，不要未经安全审查暴露到局域网或公网。

`GET /__test/state` 默认返回脱敏状态。只有同时设置
`CC98_LOCAL_ALLOW_UNSAFE_STATE=1` 并显式请求 `?unsafe=1` 时，管理员才可读取完整测试
状态；普通运行和自动测试都不启用该选项。

## 已覆盖的论坛能力

- 多用户注册、登录、注销、改密、会话撤销和本地 OpenID flow
- 角色、版主、站务权限，以及主题/回复所有者校验
- 版面、主题、回复、编辑、删除、锁定、置顶、精华、移动和审计事件
- 点赞/踩、评分、收藏分组、关注、浏览记录、私信、通知和签到
- 投票、财富转账、禁言、用户状态管理和 IP 聚合查询
- 图片/文件/头像 multipart 上传与本地保存
- UBB、Markdown、签名档、表情、媒体和双区编辑器的真实前端渲染

这是针对前端可观察行为构建的本地完整替身，不可能复现生产环境的反滥用系统、
校内 SSO、邮件服务、分布式存储和正式审核政策。生产论坛源代码和本地模拟数据仍
保持分离。

## 前端 API 审计

审计器读取 `reference/Forum-main` 的 TypeScript/TSX 源码，解析前端发出的 API 调用，
再与本地后端路由做覆盖校验：

```powershell
node tests/local-forum/frontend-api-audit.js
node tests/local-forum/frontend-api-coverage.test.js
```

当前调用点与方法/路径组合数由脚本实时计算，`unresolved` 必须为空。覆盖测试会对
每一种解析出的契约发起本机请求，并在结束时检查 `/__test/unknown` 为空、数据完整性
为真。审计只读取本地源码，不访问网络。

## 自动测试

先检查本地论坛与注入脚本的 JavaScript 语法：

```powershell
Get-ChildItem tests/local-forum -Filter *.js |
  ForEach-Object { node --check $_.FullName }
node --check src/page-submit-monitor.js
```

再执行完整回归：

```powershell
node tests/local-forum/smoke.test.js
node tests/local-forum/backend-persistence.test.js
node tests/local-forum/backend-contract.test.js
node tests/local-forum/auth-permissions.test.js
node tests/local-forum/strict-isolation.test.js
node tests/local-forum/backend-security-boundaries.test.js
node tests/local-forum/openid-strict.test.js
node tests/local-forum/frontend-api-coverage.test.js
node tests/local-forum/write-workflow.test.js
node tests/local-forum/account-frontend.test.js
node tests/local-forum/native-frontend.test.js
node tests/local-forum/admin-lifecycle.test.js
```

这些测试分别覆盖静态注入与编辑器、重启持久化和上传、完整 API 契约、角色权限、
账号级数据隔离、安全边界、本地 OpenID、前端 API 全覆盖，以及发帖到管理操作的完整
写工作流。`write-workflow.test.js` 在严格登录和严格 API 模式下验证发帖、回帖、编辑、
点赞/踩、评分、收藏、关注、私信、通知、投票、锁定、精华、置顶、高亮、移动和删除。
`account-frontend.test.js` 额外验证账号页面资产、兼容模式账号切换、注册/管理员创建账号
的身份边界、兼容模式改密，以及严格模式的会话与切换权限。`native-frontend.test.js`
验证关闭 Reborn 注入后的原生页面壳、独立账号页面、会话注销和页面资源边界；
`admin-lifecycle.test.js` 验证版面/主题/回复的删除恢复语义、版主权限、真实头像上传、
重启持久化和敏感删除字段隔离。

所有测试都创建系统临时目录和独立端口，结束后删除临时数据，不会改动
`tests/local-forum/.runtime/` 中由控制面板使用的数据。

## 真实界面验证

自动契约通过后，建议在 `CC98_LOCAL_NATIVE_FRONTEND=1` 且关闭 Reborn 插件的浏览器实例中
检查这些真实页面。先用 `POST /__test/reset` 恢复种子数据，避免上一次手工操作影响结果：

1. `/editor/postTopic/81?__cc98CaptureDialogs=1`：输入标题、选择“讨论”标签、填写内容后
   提交，应跳转到新主题；未选标签时应保留在编辑页并记录“请选择标签”提示。
2. `/topic/6500000/1?__cc98CaptureDialogs=1`：回帖、编辑、点赞/踩、评分、收藏和分享均应
   即时反馈并写入本地数据；分享应把帖子链接写入浏览器剪贴板。
3. `/signin?__cc98CaptureDialogs=1`：点击签到后应显示连续签到天数、奖励和当月日历记录。
4. `/editor/postVoteTopic/81?__cc98CaptureDialogs=1`：创建投票主题，选择选项后投票，票数
   更新且同一账号不能重复投票。
5. `/message/message?id=100002`：发送含 UBB 的私信，刷新后内容仍存在。
6. `/__local/console`：管理员登录后执行完整性检查，应显示 `issueCount: 0`。

`__cc98CaptureDialogs=1` 只用于自动化观察原版 `alert` 内容：它把对话记录到
`window.__CC98_LOCAL_DIALOGS__`。不带该参数时仍使用浏览器原生对话框，不改变普通
模拟器会话。

浏览器回归完成后，使用实际运行实例的端口检查诊断结果；默认端口只是示例：

```powershell
Invoke-RestMethod http://127.0.0.1:44303/__test/integrity
Invoke-RestMethod http://127.0.0.1:44303/__test/unknown
```

前者应返回 `ok: true` 和 `issueCount: 0`，后者应为空数组。
