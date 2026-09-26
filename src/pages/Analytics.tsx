import { useMemo, useState } from 'react'
import { db, getSettings } from '../db'
import { useLiveQuery, fmtMoney, fmtNum, fmtPct } from '../util'
import { computeStats, groupByPeriod, type Period } from '../stats'
import { StatCard } from '../components/StatCard'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

export default function Analytics() {
  const trades = useLiveQuery(() => db.trades.toArray(), [], [])
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const currency = settings?.accountCurrency ?? 'USD'
  const [period, setPeriod] = useState<Period>('weekly')

  const all = trades ?? []
  const stats = computeStats(all)
  const buckets = useMemo(() => groupByPeriod(all, period), [all, period])
  const chartData = buckets.map((b) => ({ label: b.label, pnl: Math.round(b.stats.netPnl * 100) / 100, trades: b.stats.totalTrades, winRate: Math.round(b.stats.winRate) }))

  // Breakdown by pair / session / strategy
  const byPair = useMemo(() => groupBy(all, (t) => t.pair, currency), [all, currency])
  const bySession = useMemo(() => groupBy(all, (t) => t.session, currency), [all, currency])
  const byStrategy = useMemo(() => groupBy(all, (t) => t.strategy || 'Unspecified', currency), [all, currency])

  // Checklist compliance vs outcome
  const compliance = useMemo(() => {
    const withCl = all.filter((t) => t.checklists.some((c) => c.items.length > 0) && t.outcome !== 'open')
    if (withCl.length === 0) return null
    let highWins = 0, high = 0, lowWins = 0, low = 0
    for (const t of withCl) {
      const items = t.checklists.flatMap((c) => c.items)
      const pct = items.length ? items.filter((i) => i.checked).length / items.length : 0
      const win = t.outcome === 'win'
      if (pct >= 0.8) { high++; if (win) highWins++ } else { low++; if (win) lowWins++ }
    }
    return {
      count: withCl.length,
      highWinRate: high ? (highWins / high) * 100 : 0, high,
      lowWinRate: low ? (lowWins / low) * 100 : 0, low,
    }
  }, [all])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p>Break your performance down by day, week and month</p>
        </div>
        <div className="seg">
          {PERIODS.map((p) => (
            <button key={p.value} className={period === p.value ? 'active' : ''} onClick={() => setPeriod(p.value)}>{p.label}</button>
          ))}
        </div>
      </div>

      {all.length === 0 ? (
        <div className="empty"><div className="big">📈</div><p>No data yet. Once you log trades, this page fills with insights.</p></div>
      ) : (
        <>
          <div className="grid stat-grid" style={{ marginBottom: 20 }}>
            <StatCard label="Total trades" value={String(stats.totalTrades)} sub={`${stats.open} still open`} />
            <StatCard label="Net P/L" value={fmtMoney(stats.netPnl, currency)} tone={stats.netPnl >= 0 ? 'pos' : 'neg'} />
            <StatCard label="Win rate" value={fmtPct(stats.winRate)} sub={`${stats.wins}W / ${stats.losses}L`} />
            <StatCard label="Profit factor" value={fmtNum(stats.profitFactor, 2)} tone={stats.profitFactor >= 1 ? 'pos' : 'neg'} />
            <StatCard label="Total pips" value={fmtNum(stats.totalPips, 1)} tone={stats.totalPips >= 0 ? 'pos' : 'neg'} />
            <StatCard label="Avg execution" value={stats.avgRating ? fmtNum(stats.avgRating, 1) + ' ★' : '—'} />
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h3>{PERIODS.find((p) => p.value === period)!.label} P/L</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#263258" />
                <XAxis dataKey="label" stroke="#6b7699" fontSize={11} tickLine={false} />
                <YAxis stroke="#6b7699" fontSize={11} tickLine={false} width={64} tickFormatter={(v) => fmtMoney(v, currency)} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{ background: '#1b2545', border: '1px solid #263258', borderRadius: 10, color: '#e7ecf7' }}
                  formatter={(v: number, n) => n === 'pnl' ? [fmtMoney(v, currency), 'Net P/L'] : [v, n]}
                />
                <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#2ecc8f' : '#ff5c78'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {compliance && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3>Checklist discipline vs. results</h3>
              <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>Do you win more when you follow your checklists? (based on {compliance.count} checklisted trades)</p>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="stat">
                  <div className="label">≥80% checklist done</div>
                  <div className="value pos">{fmtPct(compliance.highWinRate)}</div>
                  <div className="sub">win rate · {compliance.high} trades</div>
                </div>
                <div className="stat">
                  <div className="label">&lt;80% checklist done</div>
                  <div className="value neg">{fmtPct(compliance.lowWinRate)}</div>
                  <div className="sub">win rate · {compliance.low} trades</div>
                </div>
              </div>
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginBottom: 20 }}>
            <BreakdownCard title="By pair" rows={byPair} currency={currency} />
            <BreakdownCard title="By session" rows={bySession} currency={currency} />
            <BreakdownCard title="By strategy" rows={byStrategy} currency={currency} />
          </div>

          <div className="card">
            <h3>{PERIODS.find((p) => p.value === period)!.label} breakdown</h3>
            <div className="table-wrap" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr><th>Period</th><th>Trades</th><th>Win rate</th><th>P/L</th><th>Cumulative</th></tr>
                </thead>
                <tbody>
                  {[...buckets].reverse().map((b) => (
                    <tr key={b.key} style={{ cursor: 'default' }}>
                      <td><strong>{b.label}</strong></td>
                      <td>{b.stats.totalTrades}</td>
                      <td>{fmtPct(b.stats.winRate)}</td>
                      <td className={b.stats.netPnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(b.stats.netPnl, currency)}</td>
                      <td className={b.cumulativePnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(b.cumulativePnl, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function groupBy(trades: any[], keyFn: (t: any) => string, _currency: string) {
  const map = new Map<string, any[]>()
  for (const t of trades) {
    const k = keyFn(t)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(t)
  }
  return Array.from(map.entries())
    .map(([key, ts]) => ({ key, stats: computeStats(ts), count: ts.length }))
    .sort((a, b) => b.stats.netPnl - a.stats.netPnl)
}

function BreakdownCard({ title, rows, currency }: { title: string; rows: any[]; currency: string }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">No data</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r) => (
            <div key={r.key} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
              <span style={{ textTransform: 'capitalize' }}>{r.key}</span>
              <div className="row" style={{ gap: 12 }}>
                <span className="muted" style={{ fontSize: 12 }}>{fmtPct(r.stats.winRate)} · {r.count}</span>
                <span className={r.stats.netPnl >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700, minWidth: 72, textAlign: 'right' }}>{fmtMoney(r.stats.netPnl, currency)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
