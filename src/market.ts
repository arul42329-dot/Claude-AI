// Live market data for the Markets tab.
// Sources (both free, keyless, CORS-enabled so they work in the Android WebView
// and in Electron):
//   • gold-api.com   — real-time metals & crypto (XAU, XAG, BTC, ETH)
//   • frankfurter.app — ECB daily FX reference rates (majors + crosses)
// Day bias for metals/crypto is measured against the previous UTC-day close,
// which we persist locally (the source has no historical field on the live
// endpoint). FX bias comes from the real previous-business-day rate.

import { computeBias, type BiasVote, type BiasResult } from './bias'
import { getCandles } from './candles'

export type Bias = 'Bullish' | 'Bearish' | 'Neutral'
export type Group = 'Metals' | 'Crypto' | 'Majors' | 'Crosses'

export interface Quote {
  symbol: string // e.g. "XAU/USD"
  compact: string // e.g. "XAUUSD"
  name: string
  group: Group
  price: number
  changePct: number
  bias: Bias
  decimals: number
  // Rule-based bias detail (populated when daily candles are available; the UI
  // shows `bias`, and surfaces `biasVotes`/`score` as a tooltip for transparency).
  score?: number
  biasVotes?: string[]
  biasSource?: 'rule' | 'change'
  // Full rule-based breakdown, surfaced in the tap-to-open bias panel.
  biasDetail?: BiasResult
}

interface MetalDef { symbol: string; compact: string; name: string; group: Group; code: string; decimals: number; yahoo: string }
interface FxDef { symbol: string; compact: string; name: string; group: Group; base: string; quote: string; decimals: number }

const METALS: MetalDef[] = [
  { symbol: 'XAU/USD', compact: 'XAUUSD', name: 'Gold', group: 'Metals', code: 'XAU', decimals: 2, yahoo: 'GC=F' },
  { symbol: 'XAG/USD', compact: 'XAGUSD', name: 'Silver', group: 'Metals', code: 'XAG', decimals: 2, yahoo: 'SI=F' },
  { symbol: 'BTC/USD', compact: 'BTCUSD', name: 'Bitcoin', group: 'Crypto', code: 'BTC', decimals: 2, yahoo: 'BTC-USD' },
  { symbol: 'ETH/USD', compact: 'ETHUSD', name: 'Ethereum', group: 'Crypto', code: 'ETH', decimals: 2, yahoo: 'ETH-USD' },
]

const FX_SYMBOLS = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD']

const FX: FxDef[] = [
  { symbol: 'EUR/USD', compact: 'EURUSD', name: 'Euro', group: 'Majors', base: 'EUR', quote: 'USD', decimals: 5 },
  { symbol: 'GBP/USD', compact: 'GBPUSD', name: 'Pound', group: 'Majors', base: 'GBP', quote: 'USD', decimals: 5 },
  { symbol: 'USD/JPY', compact: 'USDJPY', name: 'Yen', group: 'Majors', base: 'USD', quote: 'JPY', decimals: 3 },
  { symbol: 'USD/CHF', compact: 'USDCHF', name: 'Franc', group: 'Majors', base: 'USD', quote: 'CHF', decimals: 5 },
  { symbol: 'USD/CAD', compact: 'USDCAD', name: 'Loonie', group: 'Majors', base: 'USD', quote: 'CAD', decimals: 5 },
  { symbol: 'AUD/USD', compact: 'AUDUSD', name: 'Aussie', group: 'Majors', base: 'AUD', quote: 'USD', decimals: 5 },
  { symbol: 'NZD/USD', compact: 'NZDUSD', name: 'Kiwi', group: 'Majors', base: 'NZD', quote: 'USD', decimals: 5 },
  { symbol: 'EUR/JPY', compact: 'EURJPY', name: 'Euro Yen', group: 'Crosses', base: 'EUR', quote: 'JPY', decimals: 3 },
  { symbol: 'GBP/JPY', compact: 'GBPJPY', name: 'Pound Yen', group: 'Crosses', base: 'GBP', quote: 'JPY', decimals: 3 },
  { symbol: 'EUR/GBP', compact: 'EURGBP', name: 'Euro Pound', group: 'Crosses', base: 'EUR', quote: 'GBP', decimals: 5 },
  { symbol: 'AUD/JPY', compact: 'AUDJPY', name: 'Aussie Yen', group: 'Crosses', base: 'AUD', quote: 'JPY', decimals: 3 },
  { symbol: 'EUR/AUD', compact: 'EURAUD', name: 'Euro Aussie', group: 'Crosses', base: 'EUR', quote: 'AUD', decimals: 5 },
  { symbol: 'EUR/CHF', compact: 'EURCHF', name: 'Euro Franc', group: 'Crosses', base: 'EUR', quote: 'CHF', decimals: 5 },
  { symbol: 'GBP/CHF', compact: 'GBPCHF', name: 'Pound Franc', group: 'Crosses', base: 'GBP', quote: 'CHF', decimals: 5 },
  { symbol: 'CAD/JPY', compact: 'CADJPY', name: 'Loonie Yen', group: 'Crosses', base: 'CAD', quote: 'JPY', decimals: 3 },
  { symbol: 'AUD/NZD', compact: 'AUDNZD', name: 'Aussie Kiwi', group: 'Crosses', base: 'AUD', quote: 'NZD', decimals: 5 },
]

function biasFrom(changePct: number): Bias {
  if (changePct > 0.0001) return 'Bullish'
  if (changePct < -0.0001) return 'Bearish'
  return 'Neutral'
}

// ---- Persisted previous-close baseline for metals/crypto ----
const BASE_KEY = 'edgefolio-mkt-base'
function metalChangePct(code: string, price: number): number {
  let map: Record<string, { day: string; open: number; last: number; prevClose: number }> = {}
  try { map = JSON.parse(localStorage.getItem(BASE_KEY) || '{}') } catch { /* ignore */ }
  const day = new Date().toISOString().slice(0, 10)
  const e = map[code]
  let baseline: number
  if (!e || e.day !== day) {
    baseline = e?.last ?? price // yesterday's last close becomes today's baseline
    map[code] = { day, open: price, last: price, prevClose: baseline }
  } else {
    baseline = e.prevClose || e.open || price
    map[code] = { ...e, last: price }
  }
  try { localStorage.setItem(BASE_KEY, JSON.stringify(map)) } catch { /* ignore */ }
  return baseline ? ((price - baseline) / baseline) * 100 : 0
}

async function fetchMetals(): Promise<Quote[]> {
  const results = await Promise.allSettled(
    METALS.map(async (m) => {
      const r = await fetch(`https://api.gold-api.com/price/${m.code}`)
      if (!r.ok) throw new Error(m.code)
      const j = await r.json()
      const price = Number(j.price)
      if (!Number.isFinite(price)) throw new Error(m.code)
      const changePct = metalChangePct(m.code, price)
      return { symbol: m.symbol, compact: m.compact, name: m.name, group: m.group, price, changePct, bias: biasFrom(changePct), decimals: m.decimals } as Quote
    }),
  )
  return results.filter((r): r is PromiseFulfilledResult<Quote> => r.status === 'fulfilled').map((r) => r.value)
}

async function fetchFx(): Promise<Quote[]> {
  const end = new Date()
  const start = new Date(end.getTime() - 10 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const url = `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?base=USD&symbols=${FX_SYMBOLS.join(',')}`
  const r = await fetch(url)
  if (!r.ok) throw new Error('fx')
  const j = await r.json()
  const dates = Object.keys(j.rates || {}).sort()
  if (dates.length === 0) throw new Error('fx-empty')
  const today = { USD: 1, ...j.rates[dates[dates.length - 1]] }
  const prev = { USD: 1, ...(j.rates[dates[dates.length - 2]] ?? j.rates[dates[dates.length - 1]]) }
  const price = (rates: Record<string, number>, base: string, quote: string) => rates[quote] / rates[base]

  return FX.map((d) => {
    const p = price(today, d.base, d.quote)
    const pp = price(prev, d.base, d.quote)
    const changePct = pp ? ((p - pp) / pp) * 100 : 0
    return { symbol: d.symbol, compact: d.compact, name: d.name, group: d.group, price: p, changePct, bias: biasFrom(changePct), decimals: d.decimals } as Quote
  })
}

// Yahoo Finance daily-candle symbol for each quote (metals/crypto use their own
// mapping; FX uses the "{BASE}{QUOTE}=X" convention).
const YAHOO_SYMBOL: Record<string, string> = {
  ...Object.fromEntries(METALS.map((m) => [m.symbol, m.yahoo])),
  ...Object.fromEntries(FX.map((d) => [d.symbol, `${d.base}${d.quote}=X`])),
}

const arrow = (v: BiasVote['value']) => (v > 0 ? '↑' : v < 0 ? '↓' : '–')

// Replace each quote's day-change bias with the transparent, rule-based daily
// bias computed from ~2y of daily OHLC candles. Falls back to the day-change
// bias for any symbol whose candles can't be fetched (e.g. CORS on web).
async function attachRuleBias(quotes: Quote[]): Promise<void> {
  await Promise.allSettled(
    quotes.map(async (q) => {
      const ySym = YAHOO_SYMBOL[q.symbol]
      if (!ySym) return
      const candles = await getCandles(q.symbol, ySym)
      if (!candles) return
      const res = computeBias(candles)
      if (!res) return
      q.bias = res.label
      q.score = res.score
      q.biasSource = 'rule'
      q.biasDetail = res
      q.biasVotes = [
        `Daily bias: ${res.label} (score ${res.score >= 0 ? '+' : ''}${res.score})`,
        ...res.votes.map((v) => `${arrow(v.value)} ${v.name} — ${v.detail}`),
      ]
    }),
  )
}

const CACHE_KEY = 'edgefolio-mkt-cache'
export interface MarketSnapshot { quotes: Quote[]; at: number; partial: boolean }

export function readCachedMarket(): MarketSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function fetchMarket(): Promise<MarketSnapshot> {
  const [metals, fx] = await Promise.allSettled([fetchMetals(), fetchFx()])
  const quotes: Quote[] = []
  if (metals.status === 'fulfilled') quotes.push(...metals.value)
  if (fx.status === 'fulfilled') quotes.push(...fx.value)
  if (quotes.length === 0) throw new Error('No market data available')
  const partial = metals.status !== 'fulfilled' || fx.status !== 'fulfilled'
  // Upgrade day-change bias to the rule-based daily bias where candles are available.
  await attachRuleBias(quotes)
  const snap: MarketSnapshot = { quotes, at: Date.now(), partial }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)) } catch { /* ignore */ }
  return snap
}

export const MARKET_GROUPS: Group[] = ['Metals', 'Crypto', 'Majors', 'Crosses']
