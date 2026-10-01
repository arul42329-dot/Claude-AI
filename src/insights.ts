// Auto-generated trading insights — turns the journal into plain-language
// strengths (pros), weaknesses (cons) and observations. Everything is computed
// from the currently scoped trades, so the card follows the Analytics filters.

import type { Trade } from './types'
import { tradeDate } from './stats'

export interface Insights {
  pros: string[]
  cons: string[]
  notes: string[]
}

interface GroupAgg {
  n: number
  wins: number
  net: number
}

function aggBy(trades: Trade[], keyFn: (t: Trade) => string): { key: string; a: GroupAgg }[] {
  const m = new Map<string, GroupAgg>()
  for (const t of trades) {
    if (t.outcome === 'open') continue
    const k = keyFn(t) || '—'
    const a = m.get(k) ?? { n: 0, wins: 0, net: 0 }
    a.n++
    if (t.outcome === 'win') a.wins++
    a.net += t.pnl ?? 0
    m.set(k, a)
  }
  return Array.from(m.entries()).map(([key, a]) => ({ key, a }))
}

function money(n: number, cur: string): string {
  const v = Math.round(n)
  const s = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(v))
  return (v < 0 ? '-¥' : '¥').replace('¥', cur === 'INR' ? '₹' : '$') + s
}

function pct(n: number): string {
  return Math.round(n) + '%'
}

export function computeInsights(trades: Trade[], currency = 'USD'): Insights {
  const pros: string[] = []
  const cons: string[] = []
  const notes: string[] = []

  const closed = trades.filter((t) => t.outcome !== 'open')
  if (closed.length < 3) {
    return { pros, cons, notes: ['Log at least 3 closed trades to unlock insights — they build automatically from your journal.'] }
  }

  const wins = closed.filter((t) => t.outcome === 'win')
  const losses = closed.filter((t) => t.outcome === 'loss')
  const winRate = (wins.length / closed.length) * 100
  const net = closed.reduce((a, t) => a + (t.pnl ?? 0), 0)

  // ---- Overall tone ----
  if (net > 0) pros.push(`Net profitable over this period: ${money(net, currency)} across ${closed.length} closed trades.`)
  else if (net < 0) cons.push(`Net down ${money(net, currency)} over ${closed.length} closed trades — size down or refine entries while you rebuild.`)

  // ---- Win rate vs payoff ----
  const avgWin = wins.length ? wins.reduce((a, t) => a + (t.pnl ?? 0), 0) / wins.length : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, t) => a + (t.pnl ?? 0), 0) / losses.length) : 0
  if (wins.length >= 2 && losses.length >= 2) {
    if (avgWin > avgLoss * 1.3) {
      pros.push(`Payoff ratio is healthy: avg win ${money(avgWin, currency)} vs avg loss ${money(avgLoss, currency)} — your winners outpace your losers.`)
    } else if (avgLoss >= avgWin) {
      cons.push(`Avg loss ${money(avgLoss, currency)} ≥ avg win ${money(avgWin, currency)} — you need a very high hit rate to profit. Let winners run or cut losses sooner.`)
    }
    const expectancy = net / closed.length
    if (expectancy > 0) notes.push(`Expectancy: ${money(expectancy, currency)} per trade (${pct(winRate)} win rate).`)
    else notes.push(`Expectancy: ${money(expectancy, currency)} per trade — each trade is costing you on average.`)
  }

  // ---- Best / worst instruments (need ≥ 2 trades) ----
  const byPair = aggBy(closed, (t) => t.pair).filter((g) => g.a.n >= 2)
  const sortedPairs = byPair.slice().sort((x, y) => y.a.net - x.a.net)
  if (sortedPairs.length >= 1 && sortedPairs[0].a.net > 0) {
    const b = sortedPairs[0]
    pros.push(`${b.key} is your best market: ${money(b.a.net, currency)} from ${b.a.n} trades (${pct((b.a.wins / b.a.n) * 100)} win).`)
  }
  if (sortedPairs.length >= 2 && sortedPairs[sortedPairs.length - 1].a.net < 0) {
    const w = sortedPairs[sortedPairs.length - 1]
    cons.push(`${w.key} is bleeding: ${money(w.a.net, currency)} over ${w.a.n} trades (${pct((w.a.wins / w.a.n) * 100)} win) — consider dropping or restructuring it.`)
  }

  // ---- Session (forex) ----
  const bySession = aggBy(closed, (t) => t.session).filter((g) => g.a.n >= 2)
  if (bySession.length >= 2) {
    const s = bySession.slice().sort((x, y) => y.a.net - x.a.net)
    const best = s[0], worst = s[s.length - 1]
    if (best.a.net > 0) pros.push(`Your strongest session is ${best.key}: ${money(best.a.net, currency)} (${pct((best.a.wins / best.a.n) * 100)} win).`)
    if (worst.a.net < 0 && worst.key !== best.key) cons.push(`${worst.key} session trades lose ${money(worst.a.net, currency)} — that time window may not suit your setup.`)
  }

  // ---- Weekday ----
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const byDay = aggBy(closed, (t) => DAYS[tradeDate(t).getDay()]).filter((g) => g.a.n >= 2)
  if (byDay.length >= 2) {
    const s = byDay.slice().sort((x, y) => y.a.net - x.a.net)
    if (s[0].a.net > 0) notes.push(`Best weekday: ${s[0].key} (${money(s[0].a.net, currency)}). Worst: ${s[s.length - 1].key} (${money(s[s.length - 1].a.net, currency)}).`)
  }

  // ---- Strategy ----
  const byStrat = aggBy(closed, (t) => t.strategy || '').filter((g) => g.key && g.a.n >= 2)
  if (byStrat.length >= 1) {
    const s = byStrat.slice().sort((x, y) => y.a.net - x.a.net)
    if (s[0].a.net > 0) pros.push(`"${s[0].key}" is your top strategy: ${money(s[0].a.net, currency)} from ${s[0].a.n} trades.`)
    const loser = s[s.length - 1]
    if (s.length >= 2 && loser.a.net < 0) cons.push(`"${loser.key}" strategy is net ${money(loser.a.net, currency)} — review or paper-trade it.`)
  }

  // ---- Checklist discipline ----
  const withCl = closed.filter((t) => t.checklists.some((c) => c.items.length > 0))
  if (withCl.length >= 4) {
    let highW = 0, high = 0, lowW = 0, low = 0
    for (const t of withCl) {
      const items = t.checklists.flatMap((c) => c.items)
      const p = items.length ? items.filter((i) => i.checked).length / items.length : 0
      if (p >= 0.8) { high++; if (t.outcome === 'win') highW++ } else { low++; if (t.outcome === 'win') lowW++ }
    }
    if (high >= 2 && low >= 2) {
      const hr = (highW / high) * 100, lr = (lowW / low) * 100
      if (hr - lr >= 15) pros.push(`Discipline pays: ${pct(hr)} win rate when you complete 80%+ of your checklist vs ${pct(lr)} when you don't.`)
      else if (lr > hr + 15) cons.push(`You win MORE when skipping your checklist (${pct(lr)} vs ${pct(hr)}) — your checklist may need a rewrite.`)
      else notes.push(`Checklist discipline: ${pct(hr)} win (80%+ followed) vs ${pct(lr)} (below) — keep following the plan.`)
    }
  }

  // ---- Missing stop losses ----
  const noSl = closed.filter((t) => t.stopLoss == null)
  if (noSl.length >= 3 && closed.length >= 5 && noSl.length / closed.length >= 0.4) {
    const noSlNet = noSl.reduce((a, t) => a + (t.pnl ?? 0), 0)
    cons.push(`${noSl.length} of ${closed.length} trades had no stop loss${noSlNet < 0 ? ` (net ${money(noSlNet, currency)})` : ''} — unplanned risk is the fastest account-killer.`)
  }

  // ---- Overtrading ----
  const perDay = new Map<string, number>()
  for (const t of closed) {
    const k = t.date
    perDay.set(k, (perDay.get(k) ?? 0) + 1)
  }
  const busiest = Math.max(0, ...perDay.values())
  if (busiest >= 6) cons.push(`Your busiest day had ${busiest} trades — overtrading tends to dilute edge and rack up brokerage.`)

  // ---- Streaks ----
  const seq = closed.slice().sort((a, b) => tradeDate(a).getTime() - tradeDate(b).getTime())
  let curW = 0, curL = 0, maxW = 0, maxL = 0
  for (const t of seq) {
    if (t.outcome === 'win') { curW++; curL = 0; maxW = Math.max(maxW, curW) }
    else if (t.outcome === 'loss') { curL++; curW = 0; maxL = Math.max(maxL, curL) }
  }
  if (maxW >= 3) notes.push(`Best streak: ${maxW} wins in a row. Worst: ${maxL} losses in a row.`)
  else if (maxL >= 3) notes.push(`Longest losing streak: ${maxL} trades — a planned daily loss limit helps here.`)

  // ---- Cost drag (India: brokerage + taxes) ----
  const costs = closed.reduce((a, t) => a + (t.brokerage ?? 0) + (t.taxes ?? 0), 0)
  if (costs > 0) {
    const grossProfit = closed.reduce((a, t) => a + Math.max(0, t.pnl ?? 0), 0)
    if (grossProfit > 0) {
      const share = (costs / (grossProfit + costs)) * 100
      notes.push(`Brokerage & taxes so far: ${money(costs, currency)} (${Math.round(share)}% of gross profit) — already netted out of every trade.`)
    } else {
      notes.push(`Brokerage & taxes so far: ${money(costs, currency)} — already netted out of every trade.`)
    }
  }

  if (pros.length === 0) pros.push('No clear strengths yet — log more trades and patterns will surface here.')
  if (cons.length === 0) cons.push('No red flags detected in this period. Keep journaling.')

  return { pros: pros.slice(0, 5), cons: cons.slice(0, 5), notes: notes.slice(0, 4) }
}
