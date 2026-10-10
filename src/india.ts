// India mode market data — kept entirely separate from the forex journal/stats.
//
// Source: Yahoo Finance daily candles + live meta for the major NSE/BSE indices.
// Live price + day change come from the chart `meta`; the Bullish/Bearish/Neutral
// label is the same transparent rule-based engine used elsewhere (bias.ts).
// Yahoo sends no CORS headers, so this works natively in the APK (CapacitorHttp)
// and Electron (header injection); the dev preview uses the Vite /yf proxy.

import { computeBias, type BiasResult, type BiasVote, type Candle } from './bias'
import { corsFetch, yfDirectUrl, fetchYahooQuote } from './candles'

export type Bias = 'Bullish' | 'Bearish' | 'Neutral'

export interface IndiaQuote {
  symbol: string // display name, e.g. "NIFTY 50"
  ySymbol: string
  price: number
  changePct: number
  bias: Bias
  decimals: number
  score?: number
  biasVotes?: string[]
  biasDetail?: BiasResult
}

interface IndexDef { symbol: string; ySymbol: string; decimals: number }

// Major Indian indices (the common option-trading underlyings + broad gauges).
export const INDIA_INDICES: IndexDef[] = [
  { symbol: 'NIFTY 50', ySymbol: '^NSEI', decimals: 2 },
  { symbol: 'BANK NIFTY', ySymbol: '^NSEBANK', decimals: 2 },
  { symbol: 'FIN NIFTY', ySymbol: 'NIFTY_FIN_SERVICE.NS', decimals: 2 },
  { symbol: 'NIFTY MIDCAP 50', ySymbol: '^NSEMDCP50', decimals: 2 },
  { symbol: 'SENSEX', ySymbol: '^BSESN', decimals: 2 },
]

const arrow = (v: BiasVote['value']) => (v > 0 ? '↑' : v < 0 ? '↓' : '–')

// Daily bias is computed from 1y of candles — fetching that on every 5s
// price refresh hammered the network and the UI (jank). The bias runs off
// this 10-minute cache; prices come from the tiny 5d chart meta instead.
const biasCache = new Map<string, { at: number; detail: BiasResult | null }>()

async function fetchIndex(def: IndexDef): Promise<IndiaQuote> {
  // 1) light price pass — the 5d chart is a few KB and carries live meta.
  let meta: any = null
  let lastErr: unknown = null
  try {
    const r = await corsFetch(yfDirectUrl(def.ySymbol, '5d'), { timeoutMs: 10000 })
    if (!r.ok) throw new Error('india ' + def.ySymbol)
    const j: any = await r.json()
    const res = j?.chart?.result?.[0]
    if (!res?.meta) throw new Error('india-empty ' + def.ySymbol)
    meta = res.meta
  } catch (e) { lastErr = e }

  // 2) bias — cached for 10 minutes, then refetched with range retries (some
  // symbols — FIN NIFTY on Yahoo — intermittently return an EMPTY candle
  // array for one range; the neighbours usually work).
  let detail = biasCache.get(def.ySymbol)?.detail ?? null
  const fresh = biasCache.get(def.ySymbol) && Date.now() - biasCache.get(def.ySymbol)!.at < 10 * 60 * 1000
  if (!fresh) {
    const ranges = ['1y', '2y', '6mo', '3mo']
    let candles: Candle[] = []
    for (const range of ranges) {
      try {
        const r = await corsFetch(yfDirectUrl(def.ySymbol, range), { timeoutMs: 12000 })
        if (!r.ok) throw new Error('india ' + def.ySymbol)
        const j: any = await r.json()
        const res = j?.chart?.result?.[0]
        if (!res?.meta) throw new Error('india-empty ' + def.ySymbol)
        if (!meta) meta = res.meta
        const ts: number[] = res.timestamp || []
        const q = res.indicators?.quote?.[0] || {}
        const cs: Candle[] = []
        for (let i = 0; i < ts.length; i++) {
          const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
          if ([o, h, l, c].every((v) => Number.isFinite(v))) cs.push({ t: ts[i] * 1000, o, h, l, c })
        }
        if (cs.length >= 60) { candles = cs; break }
        if (cs.length > candles.length) candles = cs
      } catch (e) { lastErr = e }
    }
    detail = computeBias(candles)
    biasCache.set(def.ySymbol, { at: Date.now(), detail })
  }
  if (!meta) throw lastErr ?? new Error('india ' + def.ySymbol)
  const price = Number(meta.regularMarketPrice)
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose)
  const changePct = Number.isFinite(meta.regularMarketChangePercent)
    ? Number(meta.regularMarketChangePercent)
    : prev ? ((price - prev) / prev) * 100 : 0


  return {
    symbol: def.symbol,
    ySymbol: def.ySymbol,
    price,
    changePct,
    decimals: def.decimals,
    bias: detail?.label ?? 'Neutral',
    score: detail?.score,
    biasDetail: detail ?? undefined,
    biasVotes: detail
      ? [
          `Daily bias: ${detail.label} (score ${detail.score >= 0 ? '+' : ''}${detail.score})`,
          ...detail.votes.map((v) => `${arrow(v.value)} ${v.name} — ${v.detail}`),
        ]
      : undefined,
  }
}

// v2: bump busts stale caches written by earlier (demo) builds — e.g. the fake
// ~29,000 NIFTY value some users still had persisted in localStorage.
const CACHE_KEY = 'edgefolio-india-cache-v2'
export interface IndiaSnapshot { quotes: IndiaQuote[]; at: number; partial: boolean }

export function readCachedIndia(): IndiaSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export async function fetchIndia(): Promise<IndiaSnapshot> {
  const results = await Promise.allSettled(INDIA_INDICES.map(fetchIndex))
  const quotes: IndiaQuote[] = []
  for (const r of results) if (r.status === 'fulfilled') quotes.push(r.value)
  if (quotes.length === 0) {
    // Keep showing the last good values rather than wiping the screen on a hiccup.
    const cached = readCachedIndia()
    if (cached?.quotes?.length) return cached
    throw new Error('No India market data available')
  }
  const snap: IndiaSnapshot = { quotes, at: Date.now(), partial: quotes.length < INDIA_INDICES.length }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)) } catch { /* ignore */ }
  return snap
}

// India VIX — the headline "comparison" tile for the India tab (the market's
// volatility / fear gauge, the counterpart to DXY on the forex tab).
export async function fetchIndiaVix(): Promise<IndiaQuote | null> {
  const yq = await fetchYahooQuote('^INDIAVIX', '1y')
  if (!yq) return null
  const detail = computeBias(yq.candles)
  return {
    symbol: 'INDIA VIX', ySymbol: '^INDIAVIX', price: yq.price, changePct: yq.changePct, decimals: 2,
    bias: detail?.label ?? 'Neutral', score: detail?.score, biasDetail: detail ?? undefined,
    biasVotes: detail
      ? [`Daily bias: ${detail.label} (score ${detail.score >= 0 ? '+' : ''}${detail.score})`,
         ...detail.votes.map((v) => `${arrow(v.value)} ${v.name} — ${v.detail}`)]
      : undefined,
  }
}

// NSE regular session status in IST (Mon–Fri, 09:15–15:30). Purely informational.
export function nseStatus(now = new Date()): { open: boolean; label: string } {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).formatToParts(now)
  const m: Record<string, string> = {}
  for (const x of p) m[x.type] = x.value
  const wd = m.weekday
  const mins = Number(m.hour) * 60 + Number(m.minute)
  const weekday = !['Sat', 'Sun'].includes(wd)
  const open = weekday && mins >= 555 && mins < 930 // 09:15–15:30
  return { open, label: open ? 'NSE open' : 'NSE closed' }
}
