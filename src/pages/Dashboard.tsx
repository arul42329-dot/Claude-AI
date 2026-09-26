import { useState } from 'react'
import { db, getSettings } from '../db'
import { useLiveQuery, fmtMoney, fmtNum, fmtPct } from '../util'
import { computeStats, equityCurve, tradeDate } from '../stats'
import { StatCard } from '../components/StatCard'
import { TradeForm } from '../components/TradeForm'
import { useToast } from '../components/Toast'
import { format } from 'date-fns'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'

export default function Dashboard() {
  const trades = useLiveQuery(() => db.trades.toArray(), [], [])
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const [showForm, setShowForm] = useState(false)
  const toast = useToast()

  const currency = settings?.accountCurrency ?? 'USD'
  const startBal = settings?.startingBalance ?? 10000
  const stats = computeStats(trades ?? [])
  const curve = equityCurve(trades ?? [], startBal)
  const currentBalance = curve.length ? curve[curve.length - 1].balance : startBal
  const recent = [...(trades ?? [])].sort((a, b) => tradeDate(b).getTime() - tradeDate(a).getTime()).slice(0, 6)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Your trading performance at a glance</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>＋ New trade</button>
      </div>

      <div className="grid stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label="Net P/L" value={fmtMoney(stats.netPnl, currency)} tone={stats.netPnl > 0 ? 'pos' : stats.netPnl < 0 ? 'neg' : 'neutral'} sub={`${stats.closedTrades} closed trades`} />
        <StatCard label="Win rate" value={fmtPct(stats.winRate)} sub={`${stats.wins}W / ${stats.losses}L / ${stats.breakeven}BE`} />
        <StatCard label="Profit factor" value={fmtNum(stats.profitFactor, 2)} tone={stats.profitFactor >= 1 ? 'pos' : 'neg'} sub="Gross profit ÷ gross loss" />
        <StatCard label="Account balance" value={fmtMoney(currentBalance, currency)} tone={currentBalance >= startBal ? 'pos' : 'neg'} sub={`Start ${fmtMoney(startBal, currency)}`} />
        <StatCard label="Expectancy" value={fmtMoney(stats.expectancy, currency)} tone={stats.expectancy >= 0 ? 'pos' : 'neg'} sub="Avg P/L per trade" />
        <StatCard label="Avg R:R" value={fmtNum(stats.avgRr, 2)} sub="Planned risk:reward" />
        <StatCard label="Best / Worst" value={fmtMoney(stats.bestTrade, currency)} tone="pos" sub={`Worst ${fmtMoney(stats.worstTrade, currency)}`} />
        <StatCard label="Win streak" value={String(stats.maxWinStreak)} sub={`Max loss streak ${stats.maxLossStreak}`} />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Equity curve</h3>
        {curve.length <= 1 ? (
          <div className="empty" style={{ border: 'none' }}>Log some closed trades to see your equity curve grow.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={curve} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f8cff" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#4f8cff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#263258" />
              <XAxis dataKey="label" stroke="#6b7699" fontSize={11} tickLine={false} />
              <YAxis stroke="#6b7699" fontSize={11} tickLine={false} width={64} tickFormatter={(v) => fmtMoney(v, currency)} />
              <Tooltip
                contentStyle={{ background: '#1b2545', border: '1px solid #263258', borderRadius: 10, color: '#e7ecf7' }}
                formatter={(v: number) => [fmtMoney(v, currency), 'Balance']}
              />
              <Area type="monotone" dataKey="balance" stroke="#4f8cff" strokeWidth={2} fill="url(#eq)" />
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
                    <td><strong>{t.pair}</strong></td>
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

      {showForm && (
        <TradeForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); toast('Trade saved') }} />
      )}
    </>
  )
}
