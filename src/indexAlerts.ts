// 15-minute trend-flip alerts for the big Indian indices — NIFTY 50, BANK
// NIFTY and SENSEX. While the app is open during market hours (09:15–15:30
// IST, Mon–Fri) we poll the 15-minute chart every minute; the trend is EMA(9)
// vs EMA(21) over CLOSED candles, and the moment it flips (Buy ▲ → Sell ▼ or
// the other way) a local notification fires on the phone.
//
// Purely local, same as the news alerts: data from the same Yahoo feed the
// Markets page uses, notifications through Capacitor's LocalNotifications.

import { isNativePlatform, corsFetch, yfDirectUrl } from './candles'
import type { Candle } from './bias'

const ENABLE_KEY = 'edgefolio-index-alerts'
const STATE_KEY = 'edgefolio-index-trend-state'
// Notification ids in a dedicated range so they can't collide with news
// (hashed event ids) or session alerts (900000000+).
const ALERT_ID_BASE = 901000000
// Poll cadence and per-symbol fetch cache so a poll + visibility wake don't
// double-fetch within the same minute.
const POLL_MS = 60 * 1000
const FETCH_TTL_MS = 50 * 1000

const INDICES: { symbol: string; ySymbol: string }[] = [
  { symbol: 'NIFTY 50', ySymbol: '^NSEI' },
  { symbol: 'BANK NIFTY', ySymbol: '^NSEBANK' },
  { symbol: 'SENSEX', ySymbol: '^BSESN' },
]

type LocalNotificationsPlugin = typeof import('@capacitor/local-notifications').LocalNotifications

export function indexAlertsSupported(): boolean {
  return isNativePlatform()
}

export function isIndexAlertsEnabled(): boolean {
  if (!indexAlertsSupported()) return false
  try {
    const raw = localStorage.getItem(ENABLE_KEY)
    if (raw) return (JSON.parse(raw)?.enabled ?? true) === true
  } catch { /* ignore */ }
  return true // default ON in the Android app
}

export function setIndexAlertsEnabled(v: boolean): void {
  try { localStorage.setItem(ENABLE_KEY, JSON.stringify({ enabled: v })) } catch { /* ignore */ }
}

// NSE/BSE cash market hours: 09:15–15:30 IST, Monday–Friday (no DST in India).
export function inMarketHours(now = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata', weekday: 'short', hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
    }).formatToParts(now)
    const v = (t: string) => parts.find((p) => p.type === t)?.value
    const wd = v('weekday')
    if (wd === 'Sat' || wd === 'Sun') return false
    const minutes = Number(v('hour')) * 60 + Number(v('minute'))
    return minutes >= 555 && minutes <= 930
  } catch { return false }
}

const fetchCache = new Map<string, { at: number; candles: Candle[] }>()

async function fetch15m(ySymbol: string): Promise<Candle[] | null> {
  const hit = fetchCache.get(ySymbol)
  if (hit && Date.now() - hit.at < FETCH_TTL_MS) return hit.candles
  try {
    const r = await corsFetch(yfDirectUrl(ySymbol, '5d', '15m'), { timeoutMs: 12000 })
    if (!r.ok) throw new Error('index 15m ' + ySymbol)
    const j = await r.json()
    const res = j?.chart?.result?.[0]
    const ts: number[] = res?.timestamp || []
    const q = res?.indicators?.quote?.[0] || {}
    const candles: Candle[] = []
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
      if ([o, h, l, c].every((x) => Number.isFinite(x))) candles.push({ t: ts[i] * 1000, o, h, l, c })
    }
    if (candles.length) {
      fetchCache.set(ySymbol, { at: Date.now(), candles })
      return candles
    }
  } catch { /* network / proxy hiccup — skip this pass */ }
  return hit ? hit.candles : null
}

function ema(vals: number[], period: number): number | null {
  if (vals.length < period) return null
  const k = 2 / (period + 1)
  let e = vals.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < vals.length; i++) e = vals[i] * k + e * (1 - k)
  return e
}

export type IndexTrend = 'up' | 'down'

// Trend = fast EMA above/below slow EMA on CLOSED 15-minute candles (the last
// candle in the feed is still forming, so it is ignored).
export function trendOf(candles: Candle[]): IndexTrend | null {
  const closed = candles.slice(0, -1)
  if (closed.length < 22) return null
  const closes = closed.map((c) => c.c)
  const fast = ema(closes, 9)
  const slow = ema(closes, 21)
  if (fast == null || slow == null || fast === slow) return null
  return fast > slow ? 'up' : 'down'
}

interface TrendState { [symbol: string]: { trend: IndexTrend; at: number } }

function readState(): TrendState {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {} } catch { return {} }
}

function writeState(s: TrendState): void {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

// Container return — see newsAlerts.ts: resolving a promise with the plugin
// proxy itself triggers a thenable check the stub rejects.
async function loadPlugin(): Promise<{ LN: LocalNotificationsPlugin } | null> {
  if (!indexAlertsSupported()) return null
  try {
    const mod = await import('@capacitor/local-notifications')
    return { LN: mod.LocalNotifications }
  } catch { return null }
}

// One pass over every index. Returns how many trend flips were detected (the
// first sighting of an index only records the baseline — it never alerts).
export async function checkIndexTrends(fire = true): Promise<number> {
  const state = readState()
  let flips = 0
  let dirty = false
  const LN = fire ? ((await loadPlugin())?.LN ?? null) : null
  for (let i = 0; i < INDICES.length; i++) {
    const def = INDICES[i]
    const candles = await fetch15m(def.ySymbol)
    if (!candles) continue
    const trend = trendOf(candles)
    if (!trend) continue
    const prev = state[def.symbol]
    state[def.symbol] = { trend, at: Date.now() }
    dirty = true
    if (prev && prev.trend !== trend) {
      flips++
      if (LN) {
        try {
          await LN.schedule({
            notifications: [{
              id: ALERT_ID_BASE + i,
              title: trend === 'up' ? `📈 ${def.symbol} 15m trend → Buy` : `📉 ${def.symbol} 15m trend → Sell`,
              body: trend === 'up'
                ? `${def.symbol} flipped from Sell ▼ to Buy ▲ on the 15-minute chart.`
                : `${def.symbol} flipped from Buy ▲ to Sell ▼ on the 15-minute chart.`,
              schedule: { at: new Date(Date.now() + 2000), allowWhileIdle: true },
            }],
          })
        } catch { /* plugin unavailable — flip still recorded */ }
      }
    }
  }
  if (dirty) writeState(state)
  return flips
}

// ---------------- Polling controller ----------------
// Started on app open; each tick only does work when alerts are enabled AND
// the market is open, so the loop is free outside trading hours.

let timer: ReturnType<typeof setInterval> | null = null
let ticking = false

async function tick(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    if (isIndexAlertsEnabled() && inMarketHours()) await checkIndexTrends(true)
  } catch { /* ignore */ } finally { ticking = false }
}

function onVisible(): void {
  if (document.visibilityState === 'visible') tick()
}

export function startIndexAlertPolling(): void {
  if (!indexAlertsSupported() || timer != null) return
  timer = setInterval(() => { tick() }, POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
  tick() // baseline pass — records current trends without alerting
}

export function stopIndexAlertPolling(): void {
  if (timer != null) {
    clearInterval(timer)
    timer = null
    document.removeEventListener('visibilitychange', onVisible)
  }
}
