// Outcome recalculation for stored trades — the same rule the trade form uses
// live: with a close price, Win/Loss/Breakeven comes from the trade's NET P/L
// (a close very near the entry counts as breakeven); without a close price the
// trade stays Open. Used by Settings → Data tools to fix up older entries.

import { db } from './db'
import { netPnlOf } from './stats'
import { brokerageFor } from './indiaCosts'
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
  if (t.exitPrice == null || (t.pnl == null && t.grossPnl == null)) return null
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
  const net = netPnlOf(t)
  return net > band ? 'win' : net < -band ? 'loss' : 'breakeven'
}

export interface RecomputeReport {
  pnlChecked: number // India trades with full price/size data
  pnlUpdated: number // P/L actually rewritten to net
  skipped: number // India trades missing size/prices — left untouched
  outcomeUpdated: number
}

// One maintenance pass (Settings → Data tools):
//  1. India trades with entry, exit & size: P/L is rewritten as NET =
//     gross move − brokerage − taxes, snapshotting gross/brokerage/taxes.
//     Fixes trades saved before costs existed (their P/L was gross).
//  2. Every trade with a close price: Win/Loss/Breakeven re-derived from net.
export async function recomputeNetAndOutcomes(): Promise<RecomputeReport> {
  const trades = await db.trades.toArray()
  const report: RecomputeReport = { pnlChecked: 0, pnlUpdated: 0, skipped: 0, outcomeUpdated: 0 }

  for (const t of trades) {
    let patch: Partial<Trade> | null = null

    if (t.market === 'india') {
      const e = t.entryPrice, x = t.exitPrice
      let qty: number | null = null
      if (t.segment === 'options' || t.segment === 'futures' || t.segment === 'commodity') {
        qty = t.lots != null && t.lotSize != null ? t.lots * t.lotSize : null
      } else {
        qty = t.lots ?? null // equity: lots holds shares
      }
      if (e == null || x == null || qty == null || qty === 0) {
        if (e != null || x != null) report.skipped++
      } else {
        report.pnlChecked++
        const sign = t.direction === 'short' ? -1 : 1
        const gross = Math.round((x - e) * sign * qty * 100) / 100
        const brokerage = t.brokerage ?? brokerageFor(t.pair, t.segment, t.lots)
        const taxes = t.taxes ?? 0
        const net = Math.round((gross - brokerage - taxes) * 100) / 100
        if (t.pnl !== net || t.grossPnl !== gross || t.brokerage !== brokerage) {
          patch = { pnl: net, grossPnl: gross, brokerage }
        }
      }
    }

    const withPnl: Trade = patch ? { ...t, ...patch } : t
    const nextOutcome = outcomeFromPnl(withPnl)
    if (nextOutcome != null && nextOutcome !== t.outcome) {
      patch = { ...(patch ?? {}), outcome: nextOutcome }
    }
    if (patch) {
      await db.trades.update(t.id, { ...patch, updatedAt: Date.now() })
      if (patch.pnl != null) report.pnlUpdated++
      if (patch.outcome != null) report.outcomeUpdated++
    }
  }
  return report
}
