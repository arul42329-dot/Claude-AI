import { useState } from 'react'
import { db } from '../db'
import { useLiveQuery, fmtMoney, fmtNum, fmtPct, instrumentLabel } from '../util'
import { useAppMode, marketOf } from '../mode'
import { useAccountScope, scopeTrades } from '../accounts'
import { computeStats, equityCurve, tradeDate } from '../stats'
import { StatCard } from '../components/StatCard'
import { TradeForm } from '../components/TradeForm'
import { JournalCard } from '../components/JournalCard'
import { useToast } from '../components/Toast'
import { format, startOfMonth } from 'date-fns'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'

export default function Dashboard() {
  const allTrades = useLiveQuery(() => db.trades.toArray(), [], [])
  const { activeId, account, currency, startingBalance, settings } = useAccountScope()
  const { mode, isIndia, setMode } = useAppMode()
  const [showForm, setShowForm] = useState(false)
  const toast = useToast()

  // Forex and India journals are fully separate — only show this mode's trades.
  const modeTrades = (allTrades ?? []).filter((t) => marketOf(t) === mode)
  const trades = scopeTrades(modeTrades, activeId)

  const monthStart = startOfMonth(new Date())
  const monthPnl = trades
    .filter((t) => t.outcome !== 'open' && tradeDate(t) >= monthStart)
    .reduce((a, t) => a + (t.pnl ?? 0), 0)
  const goal = settings?.monthlyProfitGoal ?? 0
  const lossLimit = settings?.maxLossLimit ?? 0
  const startBal = startingBalance
  const stats = computeStats(trades)
  const curve = equityCurve(trades, startBal)
  const currentBalance = curve.length ? curve[curve.length - 1].balance : startBal
  const recent = [...trades].sort((a, b) => tradeDate(b).getTime() - tradeDate(a).getTime()).slice(0, 6)
  const scopeName = activeId === 'all' ? 'All accounts (combined)' : account?.name ?? 'Account'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>{scopeName} · {isIndia ? '🇮🇳 Indian markets journal' : 'performance at a glance'}</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>＋ New trade</button>
      </div>

      <div className="card mode-switch-card" style={{ marginBottom: 20 }}>
        <div>
          <strong style={{ fontSize: 14 }}>App mode</strong>
          <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>
            Switches the whole app — colour, Markets and a fully separate {isIndia ? 'Indian' : 'forex'} trade journal.
          </p>
        </div>
        <div className="seg mode-toggle">
          <button className={mode === 'forex' ? 'active' : ''} onClick={() => setMode('forex')}>🌐 Forex</button>
          <button className={mode === 'india' ? 'active' : ''} onClick={() => setMode('india')}>🇮🇳 India</button>
        </div>
      </div>

      <div className="grid stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label="Net P/L" numeric={stats.netPnl} format={(n) => fmtMoney(n, currency)} tone={stats.netPnl > 0 ? 'pos' : stats.netPnl < 0 ? 'neg' : 'neutral'} sub={`${stats.closedTrades} closed trades`} />
        <StatCard label="Win rate" numeric={stats.winRate} format={(n) => fmtPct(n)} sub={`${stats.wins}W / ${stats.losses}L / ${stats.breakeven}BE`} />
        <StatCard label="Profit factor" numeric={stats.profitFactor === Infinity ? 999 : stats.profitFactor} format={(n) => (stats.profitFactor === Infinity ? '∞' : fmtNum(n, 2))} tone={stats.profitFactor >= 1 ? 'pos' : 'neg'} sub="Gross profit ÷ gross loss" />
        <StatCard label="Account balance" numeric={currentBalance} format={(n) => fmtMoney(n, currency)} tone={currentBalance >= startBal ? 'pos' : 'neg'} sub={`Start ${fmtMoney(startBal, currency)}`} />
        <StatCard label="Expectancy" numeric={stats.expectancy} format={(n) => fmtMoney(n, currency)} tone={stats.expectancy >= 0 ? 'pos' : 'neg'} sub="Avg P/L per trade" />
        <StatCard label="Avg R:R" numeric={stats.avgRr} format={(n) => fmtNum(n, 2)} sub="Planned risk:reward" />
        <StatCard label="Best / Worst" numeric={stats.bestTrade} format={(n) => fmtMoney(n, currency)} tone="pos" sub={`Worst ${fmtMoney(stats.worstTrade, currency)}`} />
        <StatCard label="Win streak" numeric={stats.maxWinStreak} format={(n) => String(Math.round(n))} sub={`Max loss streak ${stats.maxLossStreak}`} />
      </div>

      {(goal > 0 || lossLimit > 0) && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3>🎯 This month's goals · {format(new Date(), 'MMMM')}</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
            {goal > 0 && (
              <GoalBar
                label="Profit goal"
                valueTxt={`${fmtMoney(Math.max(0, monthPnl), currency)} / ${fmtMoney(goal, currency)}`}
                pct={Math.max(0, Math.min(100, (monthPnl / goal) * 100))}
                done={monthPnl >= goal}
                tone="pos"
              />
            )}
            {lossLimit > 0 && (() => {
              const used = Math.max(0, -monthPnl)
              const pct = Math.min(100, (used / lossLimit) * 100)
              const breached = used >= lossLimit
              return (
                <GoalBar
                  label="Max loss limit"
                  valueTxt={`${fmtMoney(used, currency)} / ${fmtMoney(lossLimit, currency)}${breached ? ' · breached!' : ''}`}
                  pct={pct}
                  done={false}
                  tone={breached ? 'neg' : 'warn'}
                />
              )
            })()}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Equity curve</h3>
        {curve.length <= 1 ? (
          <div className="empty" style={{ border: 'none' }}>Log some closed trades to see your equity curve grow.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={curve} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.42} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" stroke="#6a7180" fontSize={11} tickLine={false} />
              <YAxis stroke="#6a7180" fontSize={11} tickLine={false} width={64} tickFormatter={(v) => fmtMoney(v, currency)} />
              <Tooltip
                contentStyle={{ background: '#171a22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f3f5f9' }}
                formatter={(v: number) => [fmtMoney(v, currency), 'Balance']}
              />
              <Area type="monotone" dataKey="balance" stroke="var(--accent-2)" strokeWidth={2.4} fill="url(#eq)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h3>Recent trades</h3>
        {recent.length === 0 ? (
          <div className="empty" style={{ border: 'none' }}>No trades yet — hit “New trade” to begin.</div>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr><th>Date</th><th>Pair</th><th>Dir</th><th>Outcome</th><th style={{ textAlign: 'right' }}>P/L</th></tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} style={{ cursor: 'default' }}>
                    <td>{format(tradeDate(t), 'dd MMM yy')}</td>
                    <td><strong>{instrumentLabel(t)}</strong></td>
                    <td><span className={t.direction === 'long' ? 'dir-buy' : 'dir-sell'}>{t.direction === 'long' ? '▲ Buy' : '▼ Sell'}</span></td>
                    <td><span className={'badge ' + t.outcome}>{t.outcome}</span></td>
                    <td style={{ textAlign: 'right' }} className={(t.pnl ?? 0) > 0 ? 'pos' : (t.pnl ?? 0) < 0 ? 'neg' : ''}>{t.pnl != null ? fmtMoney(t.pnl, currency) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <JournalCard />
      </div>

      {showForm && (
        <TradeForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); toast('Trade saved') }} />
      )}
    </>
  )
}

function GoalBar({ label, valueTxt, pct, done, tone }: { label: string; valueTxt: string; pct: number; done: boolean; tone: 'pos' | 'neg' | 'warn' }) {
  const color = tone === 'pos' ? 'var(--green)' : tone === 'neg' ? 'var(--red)' : '#e8b458'
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ fontSize: 13.5 }}>{label} {done && '✅'}</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{valueTxt}</span>
      </div>
      <div className="goal-track"><div className="goal-fill" style={{ width: pct + '%', background: color }} /></div>
    </div>
  )
}
