export function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'pos' | 'neg' | 'neutral'
}) {
  const cls = tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : ''
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={'value ' + cls}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}
