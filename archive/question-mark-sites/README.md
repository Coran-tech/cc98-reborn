# 旧 Sites 问号服务（已退役）

这里保留问号实验早期使用的 ChatGPT Sites 后端。现行 PHP / SQLite 后端位于 [question-service](../../question-service/README.md)，服务地址为 [question.coranqwq.xyz](https://question.coranqwq.xyz/)。

## 当前状态

- 首页显示迁移通知；授权、计数读取、问号操作和管理公钥更新接口统一返回 `410`，提示更新插件并使用新服务。
- 旧演示接口 `/api/questions` 同样返回 `410`；健康接口返回 `204`。
- 当前插件不加载本目录，也不将它放入扩展发布包。

## 保留的历史源码

- `app/`：迁移页面、历史隐私页面和退役接口。
- `lib/`、`tests/`：原 OpenID 验签、扩展来源校验及管理员公钥更新逻辑和测试。
- `db/`、`drizzle/`：D1 表结构和迁移记录。原身份归属使用服务端 HMAC；核对历史数据时仍需匹配原密钥，不能随意更换。
- `build/sites-vite-plugin.ts` 及相邻许可证：Vite 配置直接导入的第三方构建源码，不是生成产物。

## 本地查看与校验

在本目录内使用 Node.js 22.13 或更新版本：

```sh
npm ci
npx tsc --noEmit
npm run lint
node --test tests/cc98-openid.test.mts tests/admin-jwks.test.mts tests/extension-origin.test.mts
```

这些测试使用临时生成的密钥和合成数据。历史构建入口仍为 `npm run build`；其配置、依赖锁文件和 Sites 元数据随源码保留。数据库、运行密钥和线上部署不随本目录迁移；服务维护与部署使用现行后端的说明。
