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
  ySymbol: string         // Yahoo fallback symbol ('' = Angel-live only)
  price: number
  changePct: number
  decimals: number
  live: boolean           // true = Angel One live feed
  approx?: boolean        // true = converted from the global USD price to ₹ (not an exact MCX quote)
}

// The four MCX commodities. Yahoo's fallback futures are USD-denominated
// (CRUDE $/bbl, GOLD $/troy oz, SILVER $/troy oz, NAT GAS $/mmBtu) — MCX
// quotes INR (₹/bbl, ₹/10 g, ₹/kg, ₹/mmBtu). These factors move a USD price
// onto the MCX scale once multiplied by the USD/INR rate.
export const COMMODITY_SYMBOLS = ['CRUDE', 'GOLD', 'SILVER', 'NAT GAS']

export function commodityUnitFactor(symbol: string): number {
  if (symbol === 'GOLD') return 1 / 3.11035 // $/oz → ₹ per 10 g (1 oz = 31.1035 g)
  if (symbol === 'SILVER') return 32.1507 // $/oz → ₹ per kg (1 kg = 32.1507 oz)
  return 1 // CRUDE ₹/bbl and NAT GAS ₹/mmBtu are 1:1 with the USD quote
}

// MCX-style unit label shown next to converted prices.
export function commodityUnitLabel(symbol: string): string {
  if (symbol === 'GOLD') return '₹ / 10 g'
  if (symbol === 'SILVER') return '₹ / kg'
  if (symbol === 'CRUDE') return '₹ / bbl'
  if (symbol === 'NAT GAS') return '₹ / mmBtu'
  return ''
}

export function usdToInrCommodity(symbol: string, usdPrice: number, usdInr: number): number {
  return usdPrice * usdInr * commodityUnitFactor(symbol)
}

// Best available USD/INR rate: Angel One (live) → recent cached quote → Yahoo.
export async function usdInrRate(): Promise<number> {
  if (isNativePlatform()) {
    try {
      const live = await fetchAngelLtps()
      const l = live['USDINR']
      if (l?.ltp) return l.ltp
    } catch { /* fall through */ }
  }
  const cached = readCachedGlobal()
  if (cached && Date.now() - cached.at < 24 * 3600 * 1000) {
    const c = cached.quotes.find((q) => q.symbol === 'USD/INR')
    if (c && c.price > 0) return c.price
  }
  try {
    const y = await yahooOne('INR=X')
    if (y?.price) return y.price
  } catch { /* offline */ }
  return 0
}

export const GLOBAL_SYMBOLS: { symbol: string; ySymbol: string; decimals: number; angel?: string }[] = [
  { symbol: 'GIFT NIFTY', ySymbol: '', decimals: 2, angel: 'GIFTNIFTY' }, // live via Angel One only
  { symbol: 'INDIA VIX', ySymbol: '^INDIAVIX', decimals: 2, angel: 'INDIA VIX' },
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

  // USD/INR first — the commodity fallback prices below are USD and get
  // converted onto the MCX ₹ scale with it.
  let rate = live['USDINR']?.ltp ?? 0
  if (!(rate > 0)) rate = cached?.quotes.find((q) => q.symbol === 'USD/INR')?.price ?? 0
  if (!(rate > 0)) rate = (await yahooOne('INR=X'))?.price ?? 0

  const quotes = await Promise.all(
    GLOBAL_SYMBOLS.map(async (g) => {
      const l = g.angel ? live[g.angel] : undefined
      if (l) return { symbol: g.symbol, ySymbol: g.ySymbol, price: l.ltp, changePct: l.changePct ?? 0, decimals: g.decimals, live: true }
      if (!g.ySymbol) return { symbol: g.symbol, ySymbol: g.ySymbol, price: 0, changePct: 0, decimals: g.decimals, live: false }
      const y = await yahooOne(g.ySymbol)
      if (y) {
        const isCom = COMMODITY_SYMBOLS.includes(g.symbol)
        // Yahoo commodity futures are USD — move them to the MCX ₹ scale so
        // the price reads like an Indian quote (marked ≈; percentages are
        // unaffected by the conversion).
        const price = isCom && rate > 0 ? usdToInrCommodity(g.symbol, y.price, rate) : y.price
        return { symbol: g.symbol, ySymbol: g.ySymbol, price, changePct: y.changePct, decimals: g.decimals, live: false, approx: isCom && rate > 0 }
      }
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
