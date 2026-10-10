// The pre-market dashboard — everything an Indian index trader checks BEFORE
// opening a NIFTY/BANKNIFTY trade: INDIA VIX, USD/INR, the US indices (Dow,
// Nasdaq, S&P 500), and the big MCX commodities (crude, gold, silver, natgas).
//
// Prices come from Angel One LTPs when linked (live, ~3s) or Yahoo otherwise
// (delayed). Each row also carries a simple directional read (▲/▼ from the
// day change) — these same inputs feed the index bias confluence.

import { corsFetch, yfDirectUrl, isNativePlatform } from './candles'
import { fetchAngelLtps } from './angel'

export interface GlobalQuote {
  symbol: string          // display name
  ySymbol: string         // Yahoo fallback symbol
  price: number
  changePct: number
  decimals: number
  live: boolean           // true = Angel One live feed
}

export const GLOBAL_SYMBOLS: { symbol: string; ySymbol: string; decimals: number; angel?: string }[] = [
  { symbol: 'USD/INR', ySymbol: 'INR=X', decimals: 2, angel: 'USDINR' },
  { symbol: 'DOW', ySymbol: '^DJI', decimals: 2 },
  { symbol: 'NASDAQ', ySymbol: '^IXIC', decimals: 2 },
  { symbol: 'S&P 500', ySymbol: '^GSPC', decimals: 2 },
  { symbol: 'CRUDE', ySymbol: 'CL=F', decimals: 2, angel: 'CRUDEOIL' },
  { symbol: 'GOLD', ySymbol: 'GC=F', decimals: 2, angel: 'GOLD' },
  { symbol: 'SILVER', ySymbol: 'SI=F', decimals: 2, angel: 'SILVER' },
  { symbol: 'NAT GAS', ySymbol: 'NG=F', decimals: 2, angel: 'NATURALGAS' },
]

const CACHE_KEY = 'edgefolio-global-cache-v1'
const TTL = 60 * 1000

export interface GlobalSnapshot { quotes: GlobalQuote[]; at: number }

export function readCachedGlobal(): GlobalSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

async function yahooOne(ySymbol: string): Promise<{ price: number; changePct: number } | null> {
  try {
    const r = await corsFetch(yfDirectUrl(ySymbol, '5d'), { timeoutMs: 10000 })
    if (!r.ok) return null
    const j: any = await r.json()
    const meta = j?.chart?.result?.[0]?.meta
    const price = Number(meta?.regularMarketPrice)
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose)
    if (!Number.isFinite(price)) return null
    const changePct = Number.isFinite(meta?.regularMarketChangePercent)
      ? Number(meta.regularMarketChangePercent)
      : prev ? ((price - prev) / prev) * 100 : 0
    return { price, changePct }
  } catch { return null }
}

// Fetch all global quotes. Angel One LTPs override Yahoo where available
// (live tick prices); the rest fall back to Yahoo.
export async function fetchGlobal(): Promise<GlobalSnapshot> {
  const cached = readCachedGlobal()
  if (cached && Date.now() - cached.at < TTL) return cached

  const live = isNativePlatform() ? await fetchAngelLtps() : {}
  const anyLive = Object.keys(live).length > 0

  const quotes = await Promise.all(
    GLOBAL_SYMBOLS.map(async (g) => {
      const l = g.angel ? live[g.angel] : undefined
      if (l) return { symbol: g.symbol, ySymbol: g.ySymbol, price: l.ltp, changePct: l.changePct ?? 0, decimals: g.decimals, live: true }
      const y = await yahooOne(g.ySymbol)
      if (y) return { symbol: g.symbol, ySymbol: g.ySymbol, price: y.price, changePct: y.changePct, decimals: g.decimals, live: false }
      const c = cached?.quotes.find((q) => q.symbol === g.symbol)
      return c ?? { symbol: g.symbol, ySymbol: g.ySymbol, price: 0, changePct: 0, decimals: g.decimals, live: false }
    }),
  )
  const snap: GlobalSnapshot = { quotes, at: Date.now() }
  if (quotes.some((q) => q.price > 0)) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)) } catch { /* ignore */ }
  }
  return snap
}

// Direction reads for the bias confluence: which way is each global driver
// pointing RIGHT NOW (sign of the day change).
export function globalDirection(snap: GlobalSnapshot | null): Record<string, number> {
  const out: Record<string, number> = {}
  if (!snap) return out
  for (const q of snap.quotes) out[q.symbol] = q.changePct > 0.05 ? 1 : q.changePct < -0.05 ? -1 : 0
  return out
}
