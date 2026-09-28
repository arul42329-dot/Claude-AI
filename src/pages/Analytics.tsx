import { useMemo, useState } from 'react'
import { db } from '../db'
import { useLiveQuery, fmtMoney, fmtNum, fmtPct } from '../util'
import { useAccountScope, scopeTrades } from '../accounts'
import { useAppMode, marketOf } from '../mode'
import { computeStats, groupByPeriod, type Period } from '../stats'
import { StatCard } from '../components/StatCard'
import { PnlCalendar } from '../components/PnlCalendar'
import { tradeDate } from '../stats'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'

type Scope = 'overall' | Period

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

export default function Analytics() {
  const allTrades = useLiveQuery(() => db.trades.toArray(), [], [])
  const { mode } = useAppMode()
  const { activeId, account, currency } = useAccountScope()
  const [scope, setScope] = useState<Scope>('overall')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const all = useMemo(
    () => scopeTrades((allTrades ?? []).filter((t) => marketOf(t) === mode), activeId),
    [allTrades, activeId, mode],
  )
  const scopeName = activeId === 'all' ? 'All accounts' : account?.name ?? 'Account'

  // The granularity that drives the chart + breakdown table
  const chartPeriod: Period = scope === 'overall' ? 'monthly' : scope
  const buckets = useMemo(() => groupByPeriod(all, chartPeriod), [all, chartPeriod])

  // Which bucket is "active" when a period scope is chosen (default = most recent)
  const activeKey = useMemo(() => {
    if (scope === 'overall') return null
    if (selectedKey && buckets.some((b) => b.key === selectedKey)) return selectedKey
    return buckets.length ? buckets[buckets.length - 1].key : null
  }, [scope, selectedKey, buckets])

  const activeBucket = useMemo(() => buckets.find((b) => b.key === activeKey) || null, [buckets, activeKey])

  // The set of trades every summary metric on this page is computed from
  const scopedTrades = useMemo(
    () => (scope === 'overall' ? all : activeBucket?.trades ?? []),
    [scope, all, activeBucket],
  )
  const stats = computeStats(scopedTrades)
  const scopeLabel = scope === 'overall' ? 'All-time' : activeBucket?.label ?? '—'

  const chartData = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    pnl: Math.round(b.stats.netPnl * 100) / 100,
    trades: b.stats.totalTrades,
    winRate: Math.round(b.stats.winRate),
  }))

  // Breakdowns + discipline — all scoped to the current selection
  const byPair = useMemo(() => groupBy(scopedTrades, (t) => t.pair), [scopedTrades])
  const bySession = useMemo(() => groupBy(scopedTrades, (t) => t.session), [scopedTrades])
  const byStrategy = useMemo(() => groupBy(scopedTrades, (t) => t.strategy || 'Unspecified'), [scopedTrades])
  const bySegment = useMemo(() => groupBy(scopedTrades, (t) => t.segment || 'equity'), [scopedTrades])
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const byWeekday = useMemo(() => groupBy(scopedTrades, (t) => WEEKDAYS[tradeDate(t).getDay()]), [scopedTrades])

  const compliance = useMemo(() => {
    const withCl = scopedTrades.filter((t) => t.checklists.some((c) => c.items.length > 0) && t.outcome !== 'open')
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
  }, [scopedTrades])

  const chartTitle = (scope === 'overall' ? 'Monthly' : SCOPES.find((s) => s.value === scope)!.label) + ' P/L'

  function pickScope(s: Scope) {
    setScope(s)
    setSelectedKey(null)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p>{scopeName} · overall, or zoom into a single day, week or month</p>
        </div>
        <div className="seg">
          {SCOPES.map((s) => (
            <button key={s.value} className={scope === s.value ? 'active' : ''} onClick={() => pickScope(s.value)}>{s.label}</button>
          ))}
        </div>
      </div>

      {all.length === 0 ? (
        <div className="empty"><div className="big">📈</div><p>No data yet. Once you log trades, this page fills with insights.</p></div>
      ) : (
        <>
          {/* Scope summary bar */}
          <div className="scope-bar">
            <span className="eyebrow" style={{ marginBottom: 0 }}>
              {scope === 'overall' ? 'All-time performance' : `${SCOPES.find((s) => s.value === scope)!.label} · ${scopeLabel}`}
            </span>
            {scope !== 'overall' && buckets.length > 0 && (
              <select
                className="select"
                value={activeKey ?? ''}
                onChange={(e) => setSelectedKey(e.target.value)}
                style={{ maxWidth: 280, marginLeft: 'auto' }}
              >
                {[...buckets].reverse().map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label} — {fmtMoney(b.stats.netPnl, currency)} · {b.stats.totalTrades} trades
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid stat-grid" style={{ marginBottom: 20 }}>
            <StatCard label="Total trades" numeric={stats.totalTrades} format={(n) => String(Math.round(n))} sub={`${stats.open} still open`} />
            <StatCard label="Net P/L" numeric={stats.netPnl} format={(n) => fmtMoney(n, currency)} tone={stats.netPnl >= 0 ? 'pos' : 'neg'} />
            <StatCard label="Win rate" numeric={stats.winRate} format={(n) => fmtPct(n)} sub={`${stats.wins}W / ${stats.losses}L`} />
            <StatCard label="Profit factor" numeric={stats.profitFactor === Infinity ? 999 : stats.profitFactor} format={(n) => (stats.profitFactor === Infinity ? '∞' : fmtNum(n, 2))} tone={stats.profitFactor >= 1 ? 'pos' : 'neg'} />
            <StatCard label="Total pips" numeric={stats.totalPips} format={(n) => fmtNum(n, 1)} tone={stats.totalPips >= 0 ? 'pos' : 'neg'} />
            <StatCard label="Expectancy" numeric={stats.expectancy} format={(n) => fmtMoney(n, currency)} tone={stats.expectancy >= 0 ? 'pos' : 'neg'} sub="per trade" />
            <StatCard label="Best trade" numeric={stats.bestTrade} format={(n) => fmtMoney(n, currency)} tone="pos" />
            <StatCard label="Avg execution" value={stats.avgRating ? fmtNum(stats.avgRating, 1) + ' ★' : '—'} />
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h3>
              {chartTitle}
              {scope !== 'overall' && <span className="muted" style={{ fontWeight: 500, fontSize: 12, marginLeft: 8 }}>· tap a bar to inspect that {scope.replace('ly', '')}</span>}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" stroke="#6a7180" fontSize={11} tickLine={false} />
                <YAxis stroke="#6a7180" fontSize={11} tickLine={false} width={64} tickFormatter={(v) => fmtMoney(v, currency)} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{ background: '#171a22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f3f5f9' }}
                  formatter={(v: number, n) => (n === 'pnl' ? [fmtMoney(v, currency), 'Net P/L'] : [v, n])}
                />
                <Bar
                  dataKey="pnl"
                  radius={[6, 6, 0, 0]}
                  cursor={scope === 'overall' ? undefined : 'pointer'}
                  onClick={(d: any) => { if (scope !== 'overall' && d?.key) setSelectedKey(d.key) }}
                >
                  {chartData.map((d) => {
                    const active = d.key === activeKey
                    return (
                      <Cell
                        key={d.key}
                        fill={d.pnl >= 0 ? '#3ddc97' : '#ff6b81'}
                        fillOpacity={activeKey && !active ? 0.4 : 1}
                        stroke={active ? '#f2cd7f' : undefined}
                        strokeWidth={active ? 2 : 0}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {compliance && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3>Checklist discipline vs. results</h3>
              <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>Do you win more when you follow your checklists? (based on {compliance.count} checklisted trades{scope !== 'overall' ? ` in ${scopeLabel}` : ''})</p>
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

          <PnlCalendar trades={all} currency={currency} />

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginBottom: 20 }}>
            <BreakdownCard title={mode === 'india' ? 'By instrument' : 'By pair'} rows={byPair} currency={currency} />
            {mode === 'india'
              ? <BreakdownCard title="By segment" rows={bySegment} currency={currency} />
              : <BreakdownCard title="By session" rows={bySession} currency={currency} />}
            <BreakdownCard title="By strategy" rows={byStrategy} currency={currency} />
            <BreakdownCard title="By weekday" rows={byWeekday} currency={currency} />
          </div>

          <div className="card">
            <h3>{scope === 'overall' ? 'Monthly' : SCOPES.find((s) => s.value === scope)!.label} breakdown</h3>
            <div className="table-wrap" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr><th>Period</th><th>Trades</th><th>Win rate</th><th>P/L</th><th>Cumulative</th></tr>
                </thead>
                <tbody>
                  {[...buckets].reverse().map((b) => {
                    const active = b.key === activeKey
                    return (
                      <tr
                        key={b.key}
                        onClick={() => scope !== 'overall' && setSelectedKey(b.key)}
                        style={{
                          cursor: scope === 'overall' ? 'default' : 'pointer',
                          background: active ? 'rgba(232,180,88,0.10)' : undefined,
                          boxShadow: active ? 'inset 3px 0 0 var(--accent)' : undefined,
                        }}
                      >
                        <td><strong>{b.label}</strong></td>
                        <td>{b.stats.totalTrades}</td>
                        <td>{fmtPct(b.stats.winRate)}</td>
                        <td className={b.stats.netPnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(b.stats.netPnl, currency)}</td>
                        <td className={b.cumulativePnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(b.cumulativePnl, currency)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function groupBy(trades: any[], keyFn: (t: any) => string) {
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
