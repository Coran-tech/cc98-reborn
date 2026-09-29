# CC98 问号键服务

这个 Sites 项目是 CC98 Reborn 问号实验的 HTTPS 后端。站点首页公开展示当前有效问号的全站总数及服务状态，不展示帖子、楼层或个人记录；各楼层计数和点击仍只在完成 OpenID 授权的实验插件内使用。它不读取帖子正文、标题、作者、图片、签名或 CC98 Cookie；论坛帖子派生数据仅包含数字帖号和楼层号。

用户可在公开的 [问号实验隐私说明](https://cc98-question-mark-demo.coran-zju.chatgpt.site/privacy) 查看完整数据流、自动计数读取、身份令牌、存储期限与退出方式。授权时另会发送 OpenID ID Token；因此上述限制只指论坛帖子派生数据，并不指全部网络请求字段。

## 身份与数据

- `/api/auth/challenge` 返回一次性随机挑战，不返回问号数据。
- `/api/auth/session` 只接受匹配挑战的 CC98 OpenID ID Token。服务端通过官方 JWKS 验签，并核对 `iss`、`aud`、`exp`、`iat` 和 `nonce`；成功后签发 15 分钟的随机会话。
- `/api/questions/batch` 和 `/api/questions/toggle` 都必须携带有效会话。未授权、伪造或过期令牌返回 401，不返回计数。
- 首页由服务端直接对 `question_votes` 求当前有效记录总数，没有新增免授权的计数 API；取消问号后总数会减少，旧演示表 `question_marks` 不计入。
- 新表 `question_votes` 只保存帖号、楼层与 OpenID `sub` 的服务端 HMAC，不保存原始 `sub`。会话和挑战表也只保存令牌哈希。复合主键确保同一 OpenID 用户在一个楼层最多只有一个有效问号。
- 旧 `/api/questions` 演示接口已停用，原 `question_marks` 表仅保留历史演示数据，不参与新计数；公开站点前应单独评估其删除时机。
- `QUESTION_HMAC_SECRET` 是 Sites 的私密运行变量，不得提交到 Git，也不能随意更换，否则旧投票无法归属到原账号。
- `openid.cc98.org` 对当前 Sites 运行环境的发现文档和 JWKS 请求均返回 403。部署时必须配置管理员从官方 HTTPS 页面人工核验的 `CC98_PINNED_JWKS` 公钥快照；服务端只接受固定环境变量中的 RSA 签名公钥，不接受客户端提供的公钥。官方轮换密钥后，新的 `kid` 会被拒绝，需更新快照并重新部署，不能降低验签要求。
- 可选的可信设备同步：仅管理员设备在本地生成不可导出的 ECDSA 私钥，将对应公钥登记为 Sites 的 `CC98_JWKS_ADMIN_PUBLIC_KEY`。该设备完成直连 OpenID 授权时，从官方 HTTPS 地址读取 JWKS，以私钥签名并携带一次性挑战提交 `/api/admin/jwks-update`。服务端验签、校验密钥格式及与现有密钥的重叠后，才更新 D1 中的公钥快照。普通用户无权更新；无管理员公钥配置时接口保持关闭。完全无重叠的换钥仍需人工核验。

OpenID ID Token 是签名凭据，不是加密载荷。它仅通过 HTTPS 发往本站，并且只用于换取短会话；API 不记录令牌或请求体。访问站点的网络服务提供方仍可能掌握常规连接元数据。CORS 接受合法格式的 Chrome/Edge 扩展来源，以兼容不同安装 ID；来源格式不是身份凭据，真正的授权由服务端验签和会话检查完成。数字帖号与楼层号可被服务端看见。

## 本地验证

```powershell
npm ci --cache .npm-cache
npm run db:generate
npm run build
npx tsc --noEmit
npm run lint
node --test tests/cc98-openid.test.mts
node --test tests/admin-jwks.test.mts
```

本地 D1 需执行 `drizzle/0001_confused_landau.sql` 并为 Worker 提供一次性的测试 `QUESTION_HMAC_SECRET`；不要把测试密钥用于部署。部署后先验证未认证读取和写入均返回 401、旧接口返回 410，再开放 Sites 的公开访问权限。真实 CC98 OpenID 授权仍需在实验插件中由用户亲自完成一次浏览器验证。
