function StatCard({ label, value, detail }) {
  return <article className="stat-card"><h2>{label}</h2><div className="stat-value">{value}</div>{detail && <p className="stat-detail">{detail}</p>}</article>
}

function formatStorage(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function OverviewCards({ files, shares, storage }) {
  const quota = storage?.quotaBytes || 0
  const used = storage?.usedBytes || 0
  const available = Math.max(0, quota - used)
  const stats = [
    { label: 'My Files', value: files.length.toLocaleString() },
    { label: 'Shared Links', value: shares.length.toLocaleString() },
    { label: 'Total Downloads', value: shares.reduce((total, share) => total + share.accessCount, 0).toLocaleString() },
    { label: 'Storage used', value: `${formatStorage(used)} / ${formatStorage(quota)}`, detail: `${formatStorage(available)} available` },
  ]
  return <section className="stats-grid" aria-label="Your files at a glance">
    {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
  </section>
}
