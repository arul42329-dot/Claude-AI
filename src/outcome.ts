// Outcome recalculation for stored trades — the same rule the trade form uses
// live: with a close price, Win/Loss/Breakeven comes from the trade's NET P/L
// (a close very near the entry counts as breakeven); without a close price the
// trade stays Open. Used by Settings → Data tools to fix up older entries.

import { db } from './db'
import type { Trade, Outcome } from './types'

function totalQtyOf(t: Trade): number | null {
  if (t.market === 'india') {
    if (t.segment === 'options' || t.segment === 'futures' || t.segment === 'commodity') {
      if (t.lots == null || t.lotSize == null) return null
      return t.lots * t.lotSize
    }
    return t.lots ?? null // equity: lots holds share quantity
  }
  return t.lotSize ?? null // forex: lotSize holds units
}

// Win/Loss/Breakeven implied by a stored trade's own numbers, or null when it
// can't be judged (no close price or no P/L).
export function outcomeFromPnl(t: Trade): Outcome | null {
  if (t.exitPrice == null || t.pnl == null) return null
  // Breakeven band: within 0.15R of a stop loss, else ~0.5% of position value.
  let band = 0
  const qty = totalQtyOf(t)
  if (qty != null && t.entryPrice != null) {
    if (t.stopLoss != null) {
      const risk = Math.abs(t.entryPrice - t.stopLoss)
      if (risk > 0) band = 0.15 * risk * qty
    } else {
      band = 0.005 * Math.abs(t.entryPrice) * qty
    }
  }
  return t.pnl > band ? 'win' : t.pnl < -band ? 'loss' : 'breakeven'
}

// Re-derive the outcome of every trade that has a close price & P/L.
// Returns how many were checked and how many actually changed.
export async function recomputeOutcomes(): Promise<{ checked: number; updated: number }> {
  const trades = await db.trades.toArray()
  let checked = 0
  let updated = 0
  for (const t of trades) {
    const next = outcomeFromPnl(t)
    if (next == null) continue
    checked++
    if (next !== t.outcome) {
      await db.trades.update(t.id, { outcome: next, updatedAt: Date.now() })
      updated++
    }
  }
  return { checked, updated }
}
