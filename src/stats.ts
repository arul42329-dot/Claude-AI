import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  format,
  parseISO,
  isWithinInterval,
} from 'date-fns'
import type { Trade } from './types'

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Stats {
  totalTrades: number
  closedTrades: number
  wins: number
  losses: number
  breakeven: number
  open: number
  winRate: number // 0-100 over closed trades
  netPnl: number
  grossProfit: number
  grossLoss: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  expectancy: number
  totalPips: number
  bestTrade: number
  worstTrade: number
  avgRr: number
  maxWinStreak: number
  maxLossStreak: number
  currentStreak: number // + for wins, - for losses
  avgRating: number
}

// NET P/L of a trade — the single source of truth for EVERY money number in
// the app (stats, analytics, equity curve, calendar, insights, goals). The
// trade form stores P/L net of brokerage & taxes; grossPnl is snapshotted for
// the cost breakdown. This helper makes the net explicit and derivable.
export function netPnlOf(t: Trade): number {
  if (t.pnl != null) return t.pnl // final value: auto-calculated net, or manually entered
  if (t.grossPnl != null) return t.grossPnl - (t.brokerage ?? 0) - (t.taxes ?? 0)
  return 0
}

export function tradeDate(t: Trade): Date {
  try {
    return parseISO(t.date + (t.time ? 'T' + t.time : 'T00:00'))
  } catch {
    return new Date(t.date)
  }
}

// Realized R multiple of a closed trade. Preferred form is NET:
// R = net P/L (after brokerage & taxes) / planned risk in money
// (|entry − stop| × quantity) — so costs drag the R down, matching what
// actually hit the balance. Falls back to the pure price move when money
// values or size are unavailable.
function tradeQty(t: Trade): number | null {
  if (t.market === 'india') {
    if (t.segment === 'options' || t.segment === 'futures' || t.segment === 'commodity') {
      if (t.lots == null || t.lotSize == null) return null
      return t.lots * t.lotSize
    }
    return t.lots ?? null // equity: lots holds share quantity
  }
  return t.lotSize ?? null // forex: lotSize holds units
}

export function tradeR(t: Trade): number | null {
  const e = t.entryPrice, x = t.exitPrice, s = t.stopLoss
  if (typeof e !== 'number' || typeof x !== 'number' || typeof s !== 'number') return null
  if (!Number.isFinite(e) || !Number.isFinite(x) || !Number.isFinite(s)) return null
  const risk = Math.abs(e - s)
  if (risk <= 0) return null
  const qty = tradeQty(t)
  const net = t.pnl != null ? t.pnl : t.grossPnl != null ? t.grossPnl - (t.brokerage ?? 0) - (t.taxes ?? 0) : null
  if (net != null && qty != null && qty > 0) return net / (risk * qty)
  const move = t.direction === 'short' ? e - x : x - e
  return move / risk
}

export interface RStats {
  count: number
  avgR: number
  avgWinR: number
  avgLossR: number
  sumR: number
  bestR: number
  worstR: number
  // Distribution buckets: [≤-2, -2..-1, -1..0, 0..1, 1..2, 2..3, ≥3]
  buckets: { label: string; r: number }[]
}

export function computeRStats(trades: Trade[]): RStats {
  const rs = trades
    .filter((t) => t.outcome !== 'open')
    .map(tradeR)
    .filter((r): r is number => r !== null)
  const wins = rs.filter((r) => r > 0)
  const losses = rs.filter((r) => r < 0)
  const labels = ['≤ -2R', '-2 to -1R', '-1 to 0R', '0 to 1R', '1 to 2R', '2 to 3R', '3R+']
  const bounds = [-Infinity, -2, -1, 0, 1, 2, 3, Infinity]
  const buckets = labels.map((label, i) => ({
    label,
    r: rs.filter((r) => r > bounds[i] && r <= bounds[i + 1]).length,
  }))
  return {
    count: rs.length,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
    avgWinR: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0,
    avgLossR: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0,
    sumR: rs.reduce((a, b) => a + b, 0),
    bestR: rs.length ? Math.max(...rs) : 0,
    worstR: rs.length ? Math.min(...rs) : 0,
    buckets,
  }
}

export function computeStats(trades: Trade[]): Stats {
  const closed = trades.filter((t) => t.outcome !== 'open')
  const wins = closed.filter((t) => t.outcome === 'win')
  const losses = closed.filter((t) => t.outcome === 'loss')
  const be = closed.filter((t) => t.outcome === 'breakeven')

  const pnls = closed.map(netPnlOf)
  const netPnl = pnls.reduce((a, b) => a + b, 0)
  const grossProfit = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0))

  const winPnls = wins.map(netPnlOf)
  const lossPnls = losses.map(netPnlOf)
  const avgWin = winPnls.length ? winPnls.reduce((a, b) => a + b, 0) / winPnls.length : 0
  const avgLoss = lossPnls.length ? lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length : 0

  const rrValues = trades.map((t) => t.riskReward).filter((v): v is number => typeof v === 'number' && v > 0)
  const avgRr = rrValues.length ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0

  const ratings = trades.map((t) => t.rating).filter((v): v is number => typeof v === 'number' && v > 0)
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0

  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss
  const expectancy = closed.length ? netPnl / closed.length : 0

  const totalPips = closed.reduce((a, t) => a + (t.pips ?? 0), 0)
  const bestTrade = pnls.length ? Math.max(...pnls) : 0
  const worstTrade = pnls.length ? Math.min(...pnls) : 0

  // streaks over chronologically sorted closed trades
  const chrono = [...closed].sort((a, b) => tradeDate(a).getTime() - tradeDate(b).getTime())
  let maxWin = 0
  let maxLoss = 0
  let cur = 0
  for (const t of chrono) {
    if (t.outcome === 'win') {
      cur = cur >= 0 ? cur + 1 : 1
      maxWin = Math.max(maxWin, cur)
    } else if (t.outcome === 'loss') {
      cur = cur <= 0 ? cur - 1 : -1
      maxLoss = Math.min(maxLoss, cur)
    } else {
      cur = 0
    }
  }

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: be.length,
    open: trades.length - closed.length,
    winRate,
    netPnl,
    grossProfit,
    grossLoss,
    profitFactor,
    avgWin,
    avgLoss,
    expectancy,
    totalPips,
    bestTrade,
    worstTrade,
    avgRr,
    maxWinStreak: maxWin,
    maxLossStreak: Math.abs(maxLoss),
    currentStreak: cur,
    avgRating,
  }
}

// Group trades into period buckets and return an ordered array with per-bucket stats.
export interface Bucket {
  key: string
  label: string
  start: Date
  trades: Trade[]
  stats: Stats
  cumulativePnl: number
}

export function bucketKey(d: Date, period: Period): { key: string; start: Date; label: string } {
  if (period === 'daily') {
    const s = startOfDay(d)
    return { key: format(s, 'yyyy-MM-dd'), start: s, label: format(s, 'EEE, dd MMM') }
  }
  if (period === 'weekly') {
    const s = startOfWeek(d, { weekStartsOn: 1 })
    return { key: format(s, 'yyyy-ww'), start: s, label: 'Wk of ' + format(s, 'dd MMM') }
  }
  const s = startOfMonth(d)
  return { key: format(s, 'yyyy-MM'), start: s, label: format(s, 'MMM yyyy') }
}

export function groupByPeriod(trades: Trade[], period: Period): Bucket[] {
  const map = new Map<string, { start: Date; label: string; trades: Trade[] }>()
  for (const t of trades) {
    const { key, start, label } = bucketKey(tradeDate(t), period)
    if (!map.has(key)) map.set(key, { start, label, trades: [] })
    map.get(key)!.trades.push(t)
  }
  const buckets = Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  let cumulative = 0
  return buckets.map((b) => {
    const stats = computeStats(b.trades)
    cumulative += stats.netPnl
    return { ...b, stats, cumulativePnl: cumulative }
  })
}

export function filterByDateRange(trades: Trade[], from?: Date, to?: Date): Trade[] {
  if (!from && !to) return trades
  return trades.filter((t) => {
    const d = tradeDate(t)
    if (from && to) return isWithinInterval(d, { start: startOfDay(from), end: to })
    if (from) return d >= startOfDay(from)
    if (to) return d <= to
    return true
  })
}

// Equity curve points from chronological trades
export function equityCurve(trades: Trade[], startingBalance: number) {
  const chrono = [...trades]
    .filter((t) => t.outcome !== 'open')
    .sort((a, b) => tradeDate(a).getTime() - tradeDate(b).getTime())
  let bal = startingBalance
  const points = [{ index: 0, label: 'Start', balance: bal }]
  chrono.forEach((t, i) => {
    bal += netPnlOf(t)
    points.push({ index: i + 1, label: format(tradeDate(t), 'dd MMM'), balance: Math.round(bal * 100) / 100 })
  })
  return points
}
