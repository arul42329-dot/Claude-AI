// Daily OHLC candle provider for the rule-based bias engine.
//
// Source: Yahoo Finance chart API (free, keyless). It sends no CORS headers, so
// in the packaged Android APK / Electron app we call it directly (CapacitorHttp /
// Electron header injection). In any plain browser (the web preview included) we
// route the request through public CORS proxies so REAL data still loads.
//
// Candles change once per day, so results are cached in localStorage and only
// refetched when stale — the price refresh reuses the cached candles.

import type { Candle } from './bias'

// v2: bump busts any stale cache written by earlier (demo) builds.
const CACHE_KEY = 'edgefolio-candles-v2'
const TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const FETCH_TIMEOUT_MS = 11000

interface Entry { at: number; candles: Candle[] }
type Store = Record<string, Entry>

function read(): Store {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function write(s: Store) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)) } catch { /* ignore quota */ }
}

// In the packaged Android APK / Electron app, CapacitorHttp (or Electron header
// injection) lets us call no-CORS APIs directly. In any plain browser we must go
// through a CORS proxy. This is what makes the live prices real everywhere.
export function isNativePlatform(): boolean {
  try {
    const cap = (window as any).Capacitor
    return !!(cap?.isNativePlatform?.() || cap?.isNative)
  } catch { return false }
}

// Public keyless CORS proxies, tried in order. allorigins is the primary; the
// others are fallbacks in case it is rate-limited or briefly down.
const PROXY_BUILDERS: ((u: string) => string)[] = [
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u),
  (u) => 'https://thingproxy.freeboard.io/fetch/' + u,
]

async function fetchWithTimeout(url: string, opts: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Fetch a no-CORS URL. Native hits it directly; the browser tries each proxy in
// turn until one returns a good response.
export async function corsFetch(url: string, opts?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? FETCH_TIMEOUT_MS
  if (isNativePlatform()) return fetchWithTimeout(url, opts, timeoutMs)
  let lastErr: unknown
  for (const build of PROXY_BUILDERS) {
    try {
      const r = await fetchWithTimeout(build(url), opts, timeoutMs)
      if (r.ok) return r
      lastErr = new Error('proxy status ' + r.status)
    } catch (e) { lastErr = e }
  }
  throw lastErr ?? new Error('all CORS proxies failed')
}

// Wrap a single no-CORS URL through the primary proxy (native hits it directly).
// Prefer corsFetch() where possible; this is kept for simple one-shot callers.
export function corsSafe(url: string): string {
  return isNativePlatform() ? url : PROXY_BUILDERS[0](url)
}

// Direct (unproxied) Yahoo chart URL; feed it to corsFetch.
export function yfDirectUrl(ySymbol: string, range = '2y'): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=${range}`
}

async function fetchYahoo(ySymbol: string): Promise<Candle[]> {
  const r = await corsFetch(yfDirectUrl(ySymbol, '2y'))
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
  return null
}
