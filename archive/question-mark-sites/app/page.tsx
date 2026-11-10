export default function Home() {
  return (
    <main className="demo-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand-mark" aria-hidden="true">?</div>
          <div className="brand-name">CC98 Reborn <span>· 问号键</span></div>
          <a className="site-privacy-link" href="https://question.coranqwq.xyz/privacy">隐私说明</a>
        </div>
      </header>
      <div className="workspace">
        <div className="workspace-heading"><div><p className="eyebrow">服务迁移通知</p><h1>问号键已迁移</h1></div></div>
        <section className="floor-card total-card" aria-label="旧服务只读提示">
          <div className="post-body">
            <p>问号服务已迁移至独立服务器，原有有效问号记录已转入新站。这里不再接受新的授权、计数读取或问号操作。</p>
            <p>请将 CC98 Reborn 更新到 0.3.5.2 或更高版本，然后前往新站查看服务状态。</p>
          </div>
          <div className="floor-actions">
            <a className="site-privacy-link" href="https://question.coranqwq.xyz/">前往新站</a>
          </div>
        </section>
      </div>
    </main>
  );
}
