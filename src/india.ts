// India mode market data — kept entirely separate from the forex journal/stats.
//
// Source: Yahoo Finance daily candles + live meta for the major NSE/BSE indices.
// Live price + day change come from the chart `meta`; the Bullish/Bearish/Neutral
// label is the same transparent rule-based engine used elsewhere (bias.ts).
// Yahoo sends no CORS headers, so this works natively in the APK (CapacitorHttp)
// and Electron (header injection); the dev preview uses the Vite /yf proxy.

import { computeBias, type BiasResult, type BiasVote, type Candle } from './bias'
import { yfChartUrl } from './candles'

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

async function fetchIndex(def: IndexDef): Promise<IndiaQuote> {
  const r = await fetch(yfChartUrl(def.ySymbol, '1y'))
  if (!r.ok) throw new Error('india ' + def.ySymbol)
  const j = await r.json()
  const res = j?.chart?.result?.[0]
  if (!res?.meta) throw new Error('india-empty ' + def.ySymbol)
  const meta = res.meta
  const price = Number(meta.regularMarketPrice)
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose)
  const changePct = Number.isFinite(meta.regularMarketChangePercent)
    ? Number(meta.regularMarketChangePercent)
    : prev ? ((price - prev) / prev) * 100 : 0

  const ts: number[] = res.timestamp || []
  const q = res.indicators?.quote?.[0] || {}
  const candles: Candle[] = []
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
    if ([o, h, l, c].every((v) => Number.isFinite(v))) candles.push({ t: ts[i] * 1000, o, h, l, c })
  }
  const detail = computeBias(candles)

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

const CACHE_KEY = 'edgefolio-india-cache'
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
    // DEV-only: the sandbox/browser preview can't reach Yahoo — synthesize data so
    // the India mode is demonstrable. Compiled out of production builds.
    if (import.meta.env.DEV) {
      const snap: IndiaSnapshot = { quotes: devDemoQuotes(), at: Date.now(), partial: false }
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)) } catch { /* ignore */ }
      return snap
    }
    throw new Error('No India market data available')
  }
  const snap: IndiaSnapshot = { quotes, at: Date.now(), partial: quotes.length < INDIA_INDICES.length }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)) } catch { /* ignore */ }
  return snap
}

// --- DEV demo data (not used in production) ---
const DEMO_BASE: Record<string, number> = {
  'NIFTY 50': 24500, 'BANK NIFTY': 52000, 'FIN NIFTY': 24600, 'NIFTY MIDCAP 50': 17200, 'SENSEX': 80500,
}
function devDemoCandles(seedStr: string, base: number): Candle[] {
  let seed = 0
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff }
  const dir = [1, -1, 0][Math.floor(rand() * 3)]
  const n = 300
  const slope = dir * base * 0.0006
  const out: Candle[] = []
  let c = base
  const now = Date.now()
  for (let i = 0; i < n; i++) {
    const wave = Math.sin(i * 0.5) * base * 0.01 + Math.sin(i * 0.13) * base * 0.02
    const o = c
    c = base + slope * i + wave + (rand() - 0.5) * base * 0.004
    const span = base * (0.003 + rand() * 0.006)
    out.push({ t: now - (n - i) * 86400000, o, h: Math.max(o, c) + span, l: Math.min(o, c) - span, c })
  }
  return out
}
function devDemoQuotes(): IndiaQuote[] {
  return INDIA_INDICES.map((def) => {
    const candles = devDemoCandles(def.symbol, DEMO_BASE[def.symbol] ?? 20000)
    const detail = computeBias(candles)
    const price = candles[candles.length - 1].c
    const prev = candles[candles.length - 2].c
    return {
      symbol: def.symbol, ySymbol: def.ySymbol, decimals: def.decimals,
      price, changePct: prev ? ((price - prev) / prev) * 100 : 0,
      bias: detail?.label ?? 'Neutral', score: detail?.score, biasDetail: detail ?? undefined,
      biasVotes: detail
        ? [`Daily bias: ${detail.label} (score ${detail.score >= 0 ? '+' : ''}${detail.score})`, ...detail.votes.map((v) => `${arrow(v.value)} ${v.name} — ${v.detail}`)]
        : undefined,
    }
  })
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
