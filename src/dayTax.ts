// Whole-day tax/charges model (India). Instead of typing a tax amount on
// every trade, the user enters ONE total per day (Trades → 🧾 Day tax);
// it is split equally across that day's trades and written into each
// trade's `taxes` field, so every existing stat, calendar, insight and the
// equity curve automatically stay NET of taxes.
//
// Splitting is equal (the last trade absorbs the rounding remainder, so the
// day's shares always sum to exactly the day's total). Days with a stored
// tax but no trades yet simply hold the total; it is distributed as soon
// as a trade is saved on that date.

import { db } from './db'
import type { Trade } from './types'
import { outcomeFromPnl } from './outcome'

const marketOf = (t: Trade): 'india' | 'forex' => (t.market === 'india' ? 'india' : 'forex')

function dayTaxId(date: string, market: 'india' | 'forex'): string {
  return `${market}:${date}`
}

// The stored day tax for a date (0 when none).
export async function getDayTax(date: string, market: 'india' | 'forex'): Promise<number> {
  try {
    const e = await db.dayTaxes.get(dayTaxId(date, market))
    return e?.amount ?? 0
  } catch { return 0 }
}

// All stored day taxes for a market, newest date first.
export async function allDayTaxes(market: 'india' | 'forex') {
  const all = await db.dayTaxes.toArray()
  return all
    .filter((e) => (e.market ?? 'forex') === market)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

// Split `amount` equally across the given day's trades and rewrite each
// trade's taxes + net P/L + outcome. No trades → nothing to do.
async function distribute(date: string, market: 'india' | 'forex', amount: number): Promise<number> {
  const trades = (await db.trades.toArray()).filter((t) => t.date === date && marketOf(t) === market)
  if (!trades.length) return 0
  const n = trades.length
  const share = Math.floor((amount / n) * 100) / 100
  const remainder = Math.round((amount - share * (n - 1)) * 100) / 100
  let written = 0
  for (let i = 0; i < n; i++) {
    const t = trades[i]
    const taxes = i === n - 1 ? remainder : share
    const patch: Partial<Trade> = { taxes }
    // net = stored gross − brokerage − taxes (same math as outcome.ts)
    if (t.grossPnl != null) {
      const net = Math.round((t.grossPnl - (t.brokerage ?? 0) - taxes) * 100) / 100
      patch.pnl = net
      const oc = outcomeFromPnl({ ...t, pnl: net })
      if (oc != null) patch.outcome = oc
    }
    await db.trades.update(t.id, { ...patch, updatedAt: Date.now() })
    written++
  }
  return written
}

// Set (or clear with 0) the day's total tax, then re-split it across the
// day's trades.
export async function setDayTax(date: string, market: 'india' | 'forex', amount: number): Promise<void> {
  const id = dayTaxId(date, market)
  const amt = Math.max(0, Math.round(amount * 100) / 100)
  if (amt > 0) await db.dayTaxes.put({ id, market, date, amount: amt, updatedAt: Date.now() })
  else await db.dayTaxes.delete(id)
  await distribute(date, market, amt)
}

// Re-run the split for a day (call after a trade is added/edited/deleted so
// shares stay equal and the day's total is preserved).
export async function redistributeDayTax(date: string | undefined, market: 'india' | 'forex'): Promise<void> {
  if (!date) return
  const amount = await getDayTax(date, market)
  await distribute(date, market, amount)
}
