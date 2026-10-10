// Price-level alerts — "ping me when NIFTY crosses 25,000".
//
// Alerts are created from a market's bias panel (🔔 button) and checked once
// a minute while the app is open, on the same polling loop as the index
// trend alerts. The price source is the Yahoo quote meta (works for every
// symbol the panels show — indices, commodities, forex — whether or not
// Angel One is linked). One-shot: once it fires (or is removed) it's gone.

import { isNativePlatform, corsFetch, yfDirectUrl } from './candles'

const KEY = 'edgefolio-price-alerts'
// Notification id range — news = hashed ids, sessions = 900000000+,
// index trend = 901000000+, live chart = 902000001, price alerts = 904000000+.
const ALERT_ID_BASE = 904000000

export interface PriceAlert {
  id: string
  symbol: string
  ySymbol: string // Yahoo symbol used to resolve the live price
  above: boolean // true = alert when price rises TO target; false = falls to it
  price: number
  createdAt: number
  firedAt?: number // set once the alert has fired (one-shot)
}

export function listPriceAlerts(): PriceAlert[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') || [] } catch { return [] }
}

function writeAlerts(list: PriceAlert[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

export function addPriceAlert(a: Omit<PriceAlert, 'createdAt'>): PriceAlert {
  const full: PriceAlert = { ...a, createdAt: Date.now() }
  writeAlerts([...listPriceAlerts(), full])
  return full
}

export function removePriceAlert(id: string): void {
  writeAlerts(listPriceAlerts().filter((a) => a.id !== id))
}

export function priceAlertsFor(symbol: string): PriceAlert[] {
  return listPriceAlerts().filter((a) => a.symbol === symbol)
}

// ---- live price (tiny cache so the 60s loop + visibility wake share one fetch) ----
const quoteCache = new Map<string, { at: number; price: number }>()
const QUOTE_TTL_MS = 50 * 1000

async function livePrice(ySymbol: string): Promise<number | null> {
  const hit = quoteCache.get(ySymbol)
  if (hit && Date.now() - hit.at < QUOTE_TTL_MS) return hit.price
  try {
    const r = await corsFetch(yfDirectUrl(ySymbol, '5d'), { timeoutMs: 12000 })
    if (!r.ok) throw new Error('quote ' + ySymbol)
    const j: any = await r.json()
    const price = Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice)
    if (Number.isFinite(price) && price > 0) {
      quoteCache.set(ySymbol, { at: Date.now(), price })
      return price
    }
  } catch { /* network hiccup — try again next tick */ }
  return hit ? hit.price : null
}

type LocalNotificationsPlugin = typeof import('@capacitor/local-notifications').LocalNotifications

// One pass over every ACTIVE alert — fires a notification for any level that
// has been crossed and marks it fired. Returns how many alerts fired.
export async function checkPriceAlerts(): Promise<number> {
  if (!isNativePlatform()) return 0
  const alerts = listPriceAlerts().filter((a) => !a.firedAt)
  if (!alerts.length) return 0
  let fired = 0
  let dirty = false
  let LN: LocalNotificationsPlugin | null = null
  try {
    const mod = await import('@capacitor/local-notifications')
    LN = mod.LocalNotifications
  } catch { /* plugin unavailable — record the cross anyway */ }
  for (let i = 0; i < alerts.length; i++) {
    const a = alerts[i]
    const price = await livePrice(a.ySymbol)
    if (price == null) continue
    const crossed = a.above ? price >= a.price : price <= a.price
    if (!crossed) continue
    a.firedAt = Date.now()
    fired++
    dirty = true
    if (LN) {
      try {
        await LN.schedule({
          notifications: [{
            id: ALERT_ID_BASE + (i % 1000),
            title: a.above ? `🔔 ${a.symbol} crossed above ${a.price}` : `🔔 ${a.symbol} fell below ${a.price}`,
            body: a.above
              ? `${a.symbol} is trading at ${price} — your alert level ${a.price} was crossed upward.`
              : `${a.symbol} is trading at ${price} — your alert level ${a.price} was crossed downward.`,
            schedule: { at: new Date(Date.now() + 2000), allowWhileIdle: true },
          }],
        })
      } catch { /* notification failed — the alert is still marked fired */ }
    }
  }
  if (dirty) writeAlerts(listPriceAlerts().map((a) => alerts.find((x) => x.id === a.id) ?? a))
  return fired
}
