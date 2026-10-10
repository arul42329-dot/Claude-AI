import { useMemo, useState } from 'react'
import { db } from '../db'
import { useLiveQuery, fmtMoney, fmtNum, fmtPct } from '../util'
import { useAccountScope, scopeTrades } from '../accounts'
import { useAppMode, marketOf } from '../mode'
import { computeStats, groupByPeriod, tradeDate, computeRStats, tradeR, type Period } from '../stats'
import { exportExcelReport } from '../report'
import { computeInsights } from '../insights'
import { useToast } from '../components/Toast'
import { StatCard } from '../components/StatCard'
import { PnlCalendar } from '../components/PnlCalendar'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie, AreaChart, Area, ReferenceLine,
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
  const { activeId, account, currency, startingBalance } = useAccountScope()
  const [scope, setScope] = useState<Scope>('overall')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const all = useMemo(
    () => scopeTrades((allTrades ?? []).filter((t) => marketOf(t) === mode), activeId),
    [allTrades, activeId, mode],
  )
  const scopeName = activeId === 'all' ? 'All accounts' : account?.name ?? 'Account'
  const [reportBusy, setReportBusy] = useState(false)
  const toast = useToast()

  async function downloadReport() {
    setReportBusy(true)
    try {
      await exportExcelReport(all, { mode, currency, startBalance: startingBalance ?? 0, cashflows: [], scopeName })
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      if (!/cancel|abort|dismiss/i.test(msg)) toast('Report failed: ' + msg)
    }
    setReportBusy(false)
  }

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
  const rStats = useMemo(() => computeRStats(scopedTrades), [scopedTrades])
  const insights = useMemo(() => computeInsights(scopedTrades, currency), [scopedTrades, currency])
  const scopeLabel = scope === 'overall' ? 'All-time' : activeBucket?.label ?? '—'

  const chartData = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    pnl: Math.round(b.stats.netPnl * 100) / 100,
    trades: b.stats.totalTrades,
    winRate: Math.round(b.stats.winRate),
  }))

  const donutData = [
    { name: 'Wins', value: stats.wins },
    { name: 'Losses', value: stats.losses },
    { name: 'Breakeven', value: stats.breakeven },
  ]

  // Cumulative R over time (net R multiples, oldest → newest).
  const cumR = useMemo(() => {
    const withR = scopedTrades
      .map((t) => ({ t, r: tradeR(t) }))
      .filter((x) => x.r != null)
      .sort((a, b) => tradeDate(a.t).getTime() - tradeDate(b.t).getTime())
    let acc = 0
    return withR.map((x, i) => {
      acc += x.r as number
      return { label: `#${x.t.serial ?? i + 1}`, r: Math.round(acc * 100) / 100 }
    })
  }, [scopedTrades])

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
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="seg">
            {SCOPES.map((s) => (
              <button key={s.value} className={scope === s.value ? 'active' : ''} onClick={() => pickScope(s.value)}>{s.label}</button>
            ))}
          </div>
          <button className="btn primary" onClick={downloadReport} disabled={reportBusy}>{reportBusy ? 'Building…' : '📊 Excel report'}</button>
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
            <StatCard
              label="Avg R multiple"
              value={rStats.count ? fmtNum(rStats.avgR, 2) + 'R' : '—'}
              tone={rStats.avgR >= 0 ? 'pos' : 'neg'}
              sub={rStats.count ? `${rStats.count} with entry/SL/exit` : 'log prices to see R'}
            />
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h3>
              {chartTitle}
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
                        stroke={active ? 'var(--accent-2)' : undefined}
                        strokeWidth={active ? 2 : 0}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {(stats.wins + stats.losses + stats.breakeven > 0 || cumR.length > 1) && (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>
              {stats.wins + stats.losses + stats.breakeven > 0 && (
                <div className="card">
                  <h3>Win rate</h3>
                  <div className="donut-wrap">
                    <div className="donut-hole">
                      <div className="donut-value">{fmtPct(stats.winRate)}</div>
                      <div className="donut-label">win rate</div>
                    </div>
                    <ResponsiveContainer width="100%" height={210}>
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="70%"
                          outerRadius="94%"
                          paddingAngle={3}
                          strokeWidth={0}
                          startAngle={90}
                          endAngle={-270}
                        >
                          <Cell fill="var(--green)" />
                          <Cell fill="var(--red)" />
                          <Cell fill="#3a4150" />
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#171a22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f3f5f9' }}
                          formatter={(v: any, n: any) => [v, n]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="donut-legend">
                    <span><span className="dot" style={{ background: 'var(--green)' }} />Wins {stats.wins}</span>
                    <span><span className="dot" style={{ background: 'var(--red)' }} />Losses {stats.losses}</span>
                    <span><span className="dot" style={{ background: '#3a4150' }} />Breakeven {stats.breakeven}</span>
                  </div>
                </div>
              )}
              {cumR.length > 1 && (
                <div className="card">
                  <h3>Cumulative R</h3>
                  <ResponsiveContainer width="100%" height={242}>
                    <AreaChart data={cumR} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cumRFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="label" stroke="#6a7180" fontSize={11} tickLine={false} />
                      <YAxis stroke="#6a7180" fontSize={11} tickLine={false} width={46} tickFormatter={(v: number) => v + 'R'} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeDasharray="4 4" />
                      <Tooltip
                        contentStyle={{ background: '#171a22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f3f5f9' }}
                        formatter={(v: number) => [fmtNum(v, 2) + 'R', 'Cumulative']}
                      />
                      <Area type="monotone" dataKey="r" stroke="var(--accent-2)" strokeWidth={2.4} fill="url(#cumRFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {rStats.count > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3>
                R-multiple distribution
              </h3>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '6px 0 16px' }}>
                <div className="stat"><div className="stat-label">Avg R</div><div className={'stat-value ' + (rStats.avgR >= 0 ? 'pos' : 'neg')}>{fmtNum(rStats.avgR, 2)}R</div></div>
                <div className="stat"><div className="stat-label">Total R</div><div className={'stat-value ' + (rStats.sumR >= 0 ? 'pos' : 'neg')}>{fmtNum(rStats.sumR, 1)}R</div></div>
                <div className="stat"><div className="stat-label">Avg win</div><div className="stat-value pos">{fmtNum(rStats.avgWinR, 2)}R</div></div>
                <div className="stat"><div className="stat-label">Avg loss</div><div className="stat-value neg">{fmtNum(rStats.avgLossR, 2)}R</div></div>
                <div className="stat"><div className="stat-label">Best / worst</div><div className="stat-value">{fmtNum(rStats.bestR, 1)}R / {fmtNum(rStats.worstR, 1)}R</div></div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={rStats.buckets} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="#6a7180" fontSize={10.5} tickLine={false} interval={0} />
                  <YAxis stroke="#6a7180" fontSize={11} tickLine={false} width={36} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={{ background: '#171a22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f3f5f9' }}
                    formatter={(v: number) => [v, 'Trades']}
                  />
                  <Bar dataKey="r" radius={[6, 6, 0, 0]}>
                    {rStats.buckets.map((b, i) => (
                      <Cell key={b.label} fill={i >= 3 ? '#3ddc97' : '#ff6b81'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {compliance && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3>Checklist discipline vs. results</h3>
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

          <div className="card" style={{ marginBottom: 20 }}>
            <h3>
              💡 Insights · pros &amp; cons
            </h3>
            <div className="insight-grid">
              <div className="insight-col pros">
                <h4>✅ What's working</h4>
                {insights.pros.map((p, i) => <div className="insight-item" key={i}><span className="ic">📈</span><span>{p}</span></div>)}
              </div>
              <div className="insight-col cons">
                <h4>⚠️ What's costing you</h4>
                {insights.cons.map((c, i) => <div className="insight-item" key={i}><span className="ic">📉</span><span>{c}</span></div>)}
              </div>
            </div>
            {insights.notes.map((n, i) => <div className="insight-note" key={i}>{n}</div>)}
          </div>

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
                          background: active ? 'var(--accent-soft)' : undefined,
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
