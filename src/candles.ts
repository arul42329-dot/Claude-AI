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

// Fetch a URL that may or may not send CORS headers. Native apps always hit it
// directly. In the browser we try DIRECT first (works for CORS-enabled APIs like
// frankfurter/gold-api and is the most reliable), then fall back through public
// CORS proxies for the endpoints that need them (Yahoo, ForexFactory, ET).
export async function corsFetch(url: string, opts?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? FETCH_TIMEOUT_MS
  if (isNativePlatform()) return fetchWithTimeout(url, opts, timeoutMs)
  try {
    const direct = await fetchWithTimeout(url, opts, timeoutMs)
    if (direct.ok) return direct
  } catch { /* CORS or network error → fall back to proxies */ }
  let lastErr: unknown
  for (const build of PROXY_BUILDERS) {
    try {
      const r = await fetchWithTimeout(build(url), opts, timeoutMs)
      if (r.ok) return r
      lastErr = new Error('proxy status ' + r.status)
    } catch (e) { lastErr = e }
  }
  throw lastErr ?? new Error('all CORS attempts failed')
}

// Wrap a single no-CORS URL through the primary proxy (native hits it directly).
// Prefer corsFetch() where possible; this is kept for simple one-shot callers.
export function corsSafe(url: string): string {
  return isNativePlatform() ? url : PROXY_BUILDERS[0](url)
}

// Every public CORS-proxy variant of a URL. Used by feeds that must keep
// working on Android when the DIRECT request fails there (CapacitorHttp goes
// direct-only, so callers fall back to these explicitly).
export function proxyCandidates(url: string): string[] {
  return PROXY_BUILDERS.map((build) => build(url))
}

// Direct (unproxied) Yahoo chart URL; feed it to corsFetch.
export function yfDirectUrl(ySymbol: string, range = '2y', interval: '1d' | '1h' | '15m' | '5m' = '1d'): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=${interval}&range=${range}`
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

// Intraday/multi-timeframe candles (1h, 15m…) for the tap-to-open market panel.
// Cached per symbol+interval with a short TTL so re-opening a panel is instant
// without hammering Yahoo. Daily candles stay on getCandles().
const ITTL_MS = 30 * 60 * 1000
export async function getCandlesInterval(
  symbol: string,
  ySymbol: string,
  interval: '1h' | '15m',
  range = '3mo',
): Promise<Candle[] | null> {
  const key = `${symbol}|${interval}`
  const store = read()
  const cached = store[key]
  if (cached && Date.now() - cached.at < ITTL_MS && cached.candles?.length) return cached.candles
  try {
    const r = await corsFetch(yfDirectUrl(ySymbol, range, interval), { timeoutMs: 12000 })
    if (!r.ok) throw new Error('candles ' + key)
    const j = await r.json()
    const res = j?.chart?.result?.[0]
    const ts: number[] = res?.timestamp || []
    const q = res?.indicators?.quote?.[0] || {}
    const candles: Candle[] = []
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
      if ([o, h, l, c].every((v) => Number.isFinite(v))) candles.push({ t: ts[i] * 1000, o, h, l, c })
    }
    if (candles.length) {
      store[key] = { at: Date.now(), candles }
      write(store)
      return candles
    }
  } catch { /* fall through to stale cache */ }
  if (cached?.candles?.length) return cached.candles
  return null
}

// A live quote (price + day change + candles) for a single Yahoo symbol. Used by
// the DXY (forex) and India VIX (India) comparison tiles. Returns null on failure.
export interface YahooQuote { price: number; changePct: number; candles: Candle[]; longName?: string; currency?: string }
export async function fetchYahooQuote(ySymbol: string, range = '1y', timeoutMs = 12000): Promise<YahooQuote | null> {
  try {
    const r = await corsFetch(yfDirectUrl(ySymbol, range), { timeoutMs })
    if (!r.ok) return null
    const j = await r.json()
    const res = j?.chart?.result?.[0]
    const meta = res?.meta
    if (!meta) return null
    const price = Number(meta.regularMarketPrice)
    if (!Number.isFinite(price)) return null
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
    return { price, changePct, candles, longName: meta.longName, currency: meta.currency }
  } catch { return null }
}
