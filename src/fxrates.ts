// Latest FX reference rates (USD base) used to convert a forex trade's P/L from
// the pair's quote currency into the account currency.
//
// Source: frankfurter.dev (ECB daily reference rates, free & keyless). Routed
// through corsFetch so it works in the browser preview and natively in the APK.

import { corsFetch } from './candles'

const RATES_KEY = 'edgefolio-fx-rates'
const TTL_MS = 12 * 60 * 60 * 1000 // 12h — reference rates change once a day

interface RatesEntry { at: number; base: 'USD'; rates: Record<string, number> }

export function readCachedRates(): RatesEntry | null {
  try {
    const raw = localStorage.getItem(RATES_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

let inflight: Promise<Record<string, number>> | null = null

// Returns USD-based rates, e.g. { USD:1, EUR:0.87, JPY:157, ... }. Uses a fresh
// cache, a shared in-flight request, or finally stale cache on failure.
export async function getUsdRates(): Promise<Record<string, number>> {
  const cached = readCachedRates()
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rates
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await corsFetch('https://api.frankfurter.dev/v1/latest?base=USD')
      if (!r.ok) throw new Error('rates')
      const j = await r.json()
      const rates: Record<string, number> = { USD: 1, ...(j.rates || {}) }
      try { localStorage.setItem(RATES_KEY, JSON.stringify({ at: Date.now(), base: 'USD', rates })) } catch { /* ignore */ }
      return rates
    } catch (e) {
      if (cached?.rates) return cached.rates // stale is better than nothing
      throw e
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// Convert an amount from one currency to another using USD-based rates.
// Returns null if either currency is missing from the rate table.
export function convertAmount(amount: number, from: string, to: string, rates: Record<string, number>): number | null {
  from = from.toUpperCase(); to = to.toUpperCase()
  if (from === to) return amount
  const rf = rates[from], rt = rates[to]
  if (!Number.isFinite(rf) || !Number.isFinite(rt)) return null
  const amountUsd = amount / rf // rates are "units per 1 USD"
  return amountUsd * rt
}
