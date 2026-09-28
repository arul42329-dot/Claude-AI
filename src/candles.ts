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

// In the browser dev preview we go through Vite's /yf proxy (Yahoo sends no CORS
// headers); the packaged apps call Yahoo directly.
const YF_BASE = import.meta.env.DEV ? '/yf' : 'https://query1.finance.yahoo.com'

export function yfChartUrl(ySymbol: string, range = '2y'): string {
  return `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=${range}`
}

async function fetchYahoo(ySymbol: string): Promise<Candle[]> {
  const url = yfChartUrl(ySymbol, '2y')
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
  if (cached?.candles?.length) return cached.candles
  // DEV-only: when the live feed is unreachable (e.g. the sandbox/browser preview
  // can't hit Yahoo), synthesize deterministic candles so the bias panel can be
  // demonstrated. This branch is compiled out of production builds.
  if (import.meta.env.DEV) return demoCandles(symbol)
  return null
}

// Deterministic pseudo-random candle series so the preview shows a populated,
// varied bias panel per symbol. NOT used in production.
function demoCandles(symbol: string): Candle[] {
  let seed = 0
  for (let i = 0; i < symbol.length; i++) seed = (seed * 31 + symbol.charCodeAt(i)) >>> 0
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff }
  const dir = [1, -1, 0][Math.floor(rand() * 3)] // up / down / choppy
  const n = 420
  const start = 100 + rand() * 200
  const slope = dir * (0.05 + rand() * 0.25)
  const out: Candle[] = []
  let c = start
  const now = Date.now()
  for (let i = 0; i < n; i++) {
    const wave = Math.sin(i * 0.22) * (start * 0.02) + Math.sin(i * 0.07) * (start * 0.03)
    const base = start + slope * i + wave + (rand() - 0.5) * start * 0.01
    const o = c
    c = base
    const span = start * (0.004 + rand() * 0.01)
    const h = Math.max(o, c) + span
    const l = Math.min(o, c) - span
    out.push({ t: now - (n - i) * 86400000, o, h, l, c })
  }
  return out
}
