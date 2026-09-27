// Daily OHLC candle provider for the rule-based bias engine.
//
// Source: Yahoo Finance chart API (free, keyless). It sends no CORS headers, so
// like the economic-calendar feed it works natively in the Android APK (routed
// through CapacitorHttp) and in Electron; on the plain web preview it may be
// blocked by CORS, in which case bias falls back to the day-change heuristic.
//
// Candles change once per day, so results are cached in localStorage and only
// refetched when stale — the 45s price refresh reuses the cached candles.

import type { Candle } from './bias'

const CACHE_KEY = 'edgefolio-candles'
const TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const FETCH_TIMEOUT_MS = 9000

interface Entry { at: number; candles: Candle[] }
type Store = Record<string, Entry>

function read(): Store {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function write(s: Store) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)) } catch { /* ignore quota */ }
}

async function fetchYahoo(ySymbol: string): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=2y`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error('candles ' + ySymbol)
    const j = await r.json()
    const res = j?.chart?.result?.[0]
    if (!res) throw new Error('candles-empty ' + ySymbol)
    const ts: number[] = res.timestamp || []
    const q = res.indicators?.quote?.[0] || {}
    const out: Candle[] = []
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
      if ([o, h, l, c].every((v) => Number.isFinite(v))) {
        out.push({ t: ts[i] * 1000, o, h, l, c })
      }
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

// Returns cached candles when fresh, otherwise fetches; on failure falls back to
// stale cache (or null if nothing is available).
export async function getCandles(symbol: string, ySymbol: string): Promise<Candle[] | null> {
  const store = read()
  const cached = store[symbol]
  if (cached && Date.now() - cached.at < TTL_MS && cached.candles?.length) return cached.candles
  try {
    const candles = await fetchYahoo(ySymbol)
    if (candles.length) {
      store[symbol] = { at: Date.now(), candles }
      write(store)
      return candles
    }
  } catch { /* fall through to stale cache */ }
  return cached?.candles ?? null
}
