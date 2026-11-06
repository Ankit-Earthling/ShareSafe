function StatCard({ label, value }) {
  return <article className="stat-card"><h2>{label}</h2><div className="stat-value">{value}</div></article>
}

export default function OverviewCards({ files, shares }) {
  const stats = [
    { label: 'My Files', value: files.length.toLocaleString() },
    { label: 'Shared Links', value: shares.length.toLocaleString() },
    { label: 'Total Downloads', value: shares.reduce((total, share) => total + share.accessCount, 0).toLocaleString() },
  ]
  return <section className="stats-grid" aria-label="Your files at a glance">
    {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
  </section>
}
