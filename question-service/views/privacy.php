<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>问号实验隐私说明 | CC98 Reborn</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="demo-shell">
  <header class="site-header"><div class="site-header-inner">
    <a class="brand-link" href="/" aria-label="返回问号服务首页">
      <span class="brand-mark" aria-hidden="true">?</span>
      <span class="brand-name">CC98 Reborn <span>· 问号键</span></span>
    </a>
  </div></header>
  <main class="privacy-main">
    <p class="eyebrow">独立实验功能 · 2026 年 9 月 29 日更新</p>
    <h1>问号实验隐私说明</h1>
    <p class="privacy-charter-notice"><strong>章程与数据传输提示：</strong>根据《浙江大学CC98论坛章程（2026版）》总纲第七条第（5）项，未经相关权利人和论坛运营管理团队授权，不得在站外公开论坛内容。本功能不会上传帖子正文、标题、作者或图片等帖文内容；但会向外部服务器传输数字帖号、楼层号、OpenID ID Token 等下文列明的数据，其中部分可能反映浏览兴趣或账号身份。使用本功能，即意味着你（使用者）同意按下文所述方式向外部服务器传输并处理相关数据；此同意不替代论坛或内容权利人的授权。</p>
    <p class="privacy-lead">问号键是 CC98 Reborn 的外置实验功能，并非 CC98 官方服务。它需要独立的 HTTPS 服务保存楼层计数。请先了解以下数据流；在插件提示中选择“继续”并使用问号功能，表示你已阅读并接受本说明。不同意时可选择“取消”并停用实验插件，CC98 原站功能不受影响。</p>

    <section class="privacy-section">
      <h2>不会上传的内容</h2>
      <p>问号服务不会接收 CC98 帖子正文、标题、作者、图片、音视频、签名、私信、Cookie 或 CC98 API 访问令牌。“不上传帖子内容”不等于不传任何论坛相关信息：帖子编号与楼层号仍属于可反映浏览兴趣的元数据。</p>
    </section>

    <section class="privacy-section">
      <h2>会处理哪些数据</h2>
      <ul>
        <li><strong>身份验证：</strong>首次授权及会话续期时，扩展经 HTTPS 向问号服务发送 CC98 OpenID 的 ID Token 与一次性挑战编号。ID Token 是签名而非加密的凭据，服务端可读取其中的身份声明；验证后不将原始 Token 写入应用数据库。</li>
        <li><strong>计数读取：</strong>完成问号授权后，浏览直连帖子时，扩展会自动发送帖子编号、当前加载的楼层号和短期会话凭据，取得各楼层计数及本人是否已点问号。即使没有点击问号，也会发生这类读取。</li>
        <li><strong>点击问号：</strong>点击时发送该帖编号及楼层号，用于增加或取消自己的一个有效问号。同一 OpenID 身份在同一楼层最多保留一个有效记录。</li>
        <li><strong>防滥用：</strong>服务端使用连接 IP 生成带时间窗口的密钥摘要用于限流；服务器提供方仍可能处理 IP、访问时间等常规连接元数据。</li>
      </ul>
    </section>

    <section class="privacy-section">
      <h2>存储与保护</h2>
      <p>后端部署在维护者自托管的腾讯云服务器，计数数据存入服务器上的 SQLite 数据库。有效问号记录保存帖子编号、楼层号、创建时间，以及由服务端私密密钥计算的稳定身份摘要，不保存明文 UID；但同一摘要仍可能关联你在不同楼层的问号记录，因此本功能不提供匿名性。普通用户无法通过问号接口查询他人逐条点问号记录或身份；接口只返回各楼层的总数和当前授权用户自己的状态。</p>
      <p>站点首页公开当前有效问号的总数，不展示帖子、楼层或身份记录；总数变化仍可能被观察和推测。服务维护者也可能接触后台数据，不能保证兴趣偏好绝对不会泄露。服务端只保存会话令牌的哈希，短期会话有效期为 15 分钟。</p>
      <p>实验插件在本机保留既有 OpenID 绑定 UID、问号授权标记与临时会话。既有 OpenID 流程如收到刷新令牌，可能将其保存在本机扩展存储中；问号服务不会接收该刷新令牌。关闭或卸载实验插件可停止后续传输，但不会自动删除已保存的问号记录。</p>
      <p>本服务从原 ChatGPT Sites 后端迁移时，会将现有有效问号记录复制到自托管数据库。原站点在切换期间可能保留原记录用于校验和回滚；维护者会在完成切换后另行处理旧数据。</p>
    </section>

    <section class="privacy-section">
      <h2>保存期限与退出</h2>
      <p>有效问号保留到你再次点击取消；目前没有自助一键删除所有历史记录的入口。挑战有效期为 5 分钟、会话有效期为 15 分钟，过期后不能继续使用；但实验服务尚未配置过期挑战、会话和限流记录的自动物理清理，不能承诺这些记录在到期时立即从数据库删除。</p>
      <p>如需停止后续处理，请停用实验插件。关于已有数据的处理或删除，请在 <a href="https://github.com/Coran-tech/cc98-reborn/issues" target="_blank" rel="noopener noreferrer">项目 Issues</a> 提出不含 UID、令牌或 Cookie 的请求，维护者再协调安全核验；不要在公开页面发布身份凭据。</p>
    </section>

    <section class="privacy-section">
      <h2>服务边界</h2>
      <p>目前服务端无法向 CC98 核实数字编号对应的帖子或楼层是否真实存在。问号数量是本实验服务的独立记录，不代表 CC98 官方互动数据。本说明由 CC98 Reborn 实验维护者 Coran 提供，反馈渠道为上述项目 Issues。若处理方式发生实质变化，会更新本页并调整插件提示。</p>
    </section>
  </main>
</div>
</body>
</html>
