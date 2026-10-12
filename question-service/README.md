# CC98 问号服务（自托管）

这是 CC98 Reborn 问号实验的 PHP/SQLite 后端，部署在 `question.coranqwq.xyz`。代码位于 `/srv/question-service`，只将 `public/` 暴露给 Nginx；数据库、配置和备份都位于站点根目录之外的非公开路径。

## 运行环境

- PHP 7.4 或更新版本，扩展：PDO SQLite、SQLite3、OpenSSL、JSON。
- Nginx 转发 PHP 请求到独立的 `question` PHP-FPM 池。
- 数据库在 `data/questions.sqlite`，身份 HMAC 密钥与管理公钥在未纳入版本控制的 `config.php`。
- Let’s Encrypt 证书由服务器上的 acme.sh 每日检查续期，续期后重载 Nginx。

服务器当前使用 CentOS 7 和 PHP 7.4，均已结束维护；升级系统与 PHP 是独立的后续维护任务。

## 部署与验证

1. 将源码同步到 `/srv/question-service`，保留现有 `config.php` 和 `data/`，不要从模板覆盖真实配置。
2. 将 `deploy/php-fpm-question.conf` 安装到 PHP-FPM 的池目录；`deploy/nginx-question.conf.template` 安装到 Nginx 的 include 目录，先检查 `php-fpm -t` 和 `nginx -t`。
3. 新实例用 `schema.sql` 建库，并从原 Sites D1 导入 `question_votes` 和 `question_jwks`。必须使用原 HMAC 密钥，否则已迁移的投票不能认回原账号。`scripts/import-snapshot.php` 从标准输入读取 JSON 快照。
4. 用 `scripts/check-config.php` 验证配置、JWKS 和记录数，再运行 `tests/selftest.php`。公网应能访问 `/`、`/privacy` 和 `/api/health`。未授权的 `/api/questions/batch` 与 `/api/questions/toggle` 应返回 401。

`config.example.php` 只提供字段结构。不要提交真实配置、OpenID ID Token、数据库或备份。`deploy/question-service.cron` 仅备份数据库，每天 UTC+8 03:10 运行，保留约 30 天；恢复时还需要匹配的 HMAC 密钥。备份目录只允许 `question` 用户访问。定期另行保存加密的异地备份。

## 服务契约

- `POST /api/auth/challenge` 创建一次性 OpenID nonce。
- `POST /api/auth/session` 校验 CC98 OpenID ID Token，发放 15 分钟会话。
- `POST /api/questions/batch` 读取已授权用户可见的聚合计数和本人状态。
- `POST /api/questions/toggle` 增减本人对一个楼层的问号。
- `POST /api/admin/jwks-update` 只接受已登记管理公钥签名的官方 JWKS 更新。

服务端保存有效问号记录、限流摘要、会话令牌哈希和挑战哈希；不保存明文 CC98 UID、Token 或帖子内容。隐私说明在 `/privacy`。
