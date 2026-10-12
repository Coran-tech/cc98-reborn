<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>问号键 | CC98 Reborn</title>
  <meta name="description" content="CC98 Reborn 问号键独立互动服务">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="demo-shell">
  <header class="site-header"><div class="site-header-inner">
    <div class="brand-mark" aria-hidden="true">?</div>
    <div class="brand-name">CC98 Reborn <span>· 问号键</span></div>
    <a class="site-privacy-link" href="/privacy">隐私说明</a>
  </div></header>
  <main class="workspace">
    <div class="workspace-heading"><div><p class="eyebrow">独立互动服务</p><h1>问号键</h1></div></div>
    <section class="floor-card total-card" aria-label="当前有效问号总数">
      <div class="floor-head"><h2><span aria-hidden="true">?</span> 当前有效问号</h2>
        <strong class="question-total"><?= $total === null ? '暂不可用' : number_format($total) ?></strong></div>
      <div class="post-body"><p>所有用户当前仍有效的问号总数；取消后不再计入。不展示帖子、楼层或个人记录。</p></div>
      <div class="floor-actions"><span class="service-status">服务状态 · <span id="service-state">检测中</span></span>
        <button class="refresh-button" type="button" onclick="location.reload()" title="刷新统计与状态" aria-label="刷新统计与状态">↻</button></div>
    </section>
  </main>
</div>
<script>fetch('/api/health',{cache:'no-store'}).then(r=>document.getElementById('service-state').textContent=r.ok?'运行中':'不可用').catch(()=>document.getElementById('service-state').textContent='不可用')</script>
</body>
</html>
