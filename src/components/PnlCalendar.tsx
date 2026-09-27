import { useMemo, useState, type CSSProperties } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, format, isSameMonth, isToday,
} from 'date-fns'
import type { Trade } from '../types'
import { tradeDate } from '../stats'
import { fmtMoney } from '../util'

export function PnlCalendar({ trades, currency }: { trades: Trade[]; currency: string }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))

  // Map day -> {pnl, count} from closed trades
  const byDay = useMemo(() => {
    const m = new Map<string, { pnl: number; count: number }>()
    for (const t of trades) {
      if (t.outcome === 'open') continue
      const k = format(tradeDate(t), 'yyyy-MM-dd')
      const e = m.get(k) || { pnl: 0, count: 0 }
      e.pnl += t.pnl ?? 0
      e.count += 1
      m.set(k, e)
    }
    return m
  }, [trades])

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [cursor])

  const monthStats = useMemo(() => {
    let pnl = 0, count = 0, greens = 0, reds = 0
    for (const [k, v] of byDay) {
      if (k.startsWith(format(cursor, 'yyyy-MM'))) {
        pnl += v.pnl; count += v.count
        if (v.pnl > 0) greens++; else if (v.pnl < 0) reds++
      }
    }
    return { pnl, count, greens, reds }
  }, [byDay, cursor])

  // magnitude scaling for colour intensity
  const maxAbs = useMemo(() => {
    let mx = 0
    for (const [k, v] of byDay) if (k.startsWith(format(cursor, 'yyyy-MM'))) mx = Math.max(mx, Math.abs(v.pnl))
    return mx || 1
  }, [byDay, cursor])

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>📅 P/L Calendar</h3>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => setCursor((c) => addMonths(c, -1))}>‹</button>
          <span style={{ minWidth: 120, textAlign: 'center', fontWeight: 700 }}>{format(cursor, 'MMMM yyyy')}</span>
          <button className="btn sm" onClick={() => setCursor((c) => addMonths(c, 1))}>›</button>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 12 }}>
        <span className="chip" style={{ color: monthStats.pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
          {fmtMoney(monthStats.pnl, currency)}
        </span>
        <span className="chip">{monthStats.count} trades</span>
        <span className="chip">🟢 {monthStats.greens} · 🔴 {monthStats.reds} days</span>
      </div>

      <div className="cal-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
        {days.map((d) => {
          const k = format(d, 'yyyy-MM-dd')
          const e = byDay.get(k)
          const inMonth = isSameMonth(d, cursor)
          let cls = 'cal-day'
          let style: CSSProperties = {}
          if (!inMonth) cls += ' out'
          if (e) {
            const intensity = 0.18 + 0.55 * Math.min(1, Math.abs(e.pnl) / maxAbs)
            if (e.pnl > 0) style.background = `rgba(61, 220, 151, ${intensity})`
            else if (e.pnl < 0) style.background = `rgba(255, 107, 129, ${intensity})`
            else style.background = 'rgba(255,255,255,0.06)'
          }
          if (isToday(d)) cls += ' today'
          return (
            <div key={k} className={cls} style={style} title={e ? `${format(d, 'd MMM')}: ${fmtMoney(e.pnl, currency)} · ${e.count} trade(s)` : format(d, 'd MMM')}>
              <span className="cal-num">{format(d, 'd')}</span>
              {e && <span className="cal-pnl">{compact(e.pnl, currency)}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function compact(n: number, currency: string): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const sym = currencySymbol(currency)
  if (abs >= 1000) return `${sign}${sym}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`
  return `${sign}${sym}${abs.toFixed(0)}`
}
function currencySymbol(c: string): string {
  const map: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹', AUD: '$', CAD: '$', CHF: '', NZD: '$', SGD: '$', AED: '', ZAR: 'R' }
  return map[c] ?? ''
}
