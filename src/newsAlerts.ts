// High-impact news alerts — local notifications ~15 minutes before red-folder
// economic events, for the currencies you actually trade.
//
// Purely local: the event list comes from the same ForexFactory feed the
// Markets page already shows, and notifications are scheduled through
// Capacitor's LocalNotifications plugin on Android — no server, no push
// service. Once scheduled they fire even when Edgefolio is closed. We re-sync
// on every app open (and every 45 min while the app is open), which also
// heals the one Android quirk: scheduled alarms are cleared on device reboot
// and get re-registered the next time the app is opened.
//
// The plugin is imported dynamically so web/Electron builds don't carry it.

import { isNativePlatform } from './candles'
import { db } from './db'
import type { EconSnapshot } from './econ'

const SETTINGS_KEY = 'edgefolio-news-alerts'

// How many minutes before a high-impact event the alert fires.
export const LEAD_MINUTES = 15
// How far ahead we schedule alerts (keeps the alarm list small and relevant).
const WINDOW_MS = 24 * 60 * 60 * 1000
// Don't alert for events closer than this — too late to plan around.
const TOO_CLOSE_MS = 5 * 60 * 1000
// Safety cap on pending alerts per sync.
const MAX_PENDING = 20

type LocalNotificationsPlugin = typeof import('@capacitor/local-notifications').LocalNotifications

export function newsAlertsSupported(): boolean {
  return isNativePlatform()
}

export function isNewsAlertsEnabled(): boolean {
  if (!newsAlertsSupported()) return false
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return (JSON.parse(raw)?.enabled ?? true) === true
  } catch { /* ignore */ }
  return true // default ON in the Android app
}

export function setNewsAlertsEnabled(v: boolean): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: v })) } catch { /* ignore */ }
}

// Stable small positive int (Android notification ids are 32-bit) derived
// from an event id string, so re-syncs compute the same id for the same event.
function notifId(eventId: string): number {
  let h = 0
  for (let i = 0; i < eventId.length; i++) h = (h * 31 + eventId.charCodeAt(i)) | 0
  return (Math.abs(h) % 2147483000) + 1
}

async function loadPlugin(): Promise<LocalNotificationsPlugin | null> {
  if (!newsAlertsSupported()) return null
  try { return (await import('@capacitor/local-notifications')).LocalNotifications } catch { return null }
}

async function tradedCurrencies(): Promise<Set<string>> {
  try {
    const trades = await db.trades.toArray()
    const s = new Set<string>()
    for (const t of trades) for (const c of (t.pair || '').split('/')) {
      const v = c.trim().toUpperCase()
      if (v) s.add(v)
    }
    return s
  } catch { return new Set() }
}

async function ensurePermission(LN: LocalNotificationsPlugin): Promise<boolean> {
  try {
    let perm = await LN.checkPermissions()
    if (perm.display !== 'granted') perm = await LN.requestPermissions()
    return perm.display === 'granted'
  } catch { return false }
}

function hhmm(t: number): string {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export interface NewsAlertSync {
  scheduled: number
  permissionDenied: boolean
}

// Schedule alerts for upcoming high-impact events. Safe to call repeatedly:
// already-scheduled events are skipped, so this is an idempotent "make sure
// the next 24h of big news has an alarm booked" pass.
export async function syncNewsAlerts(snap: EconSnapshot | null): Promise<NewsAlertSync> {
  const LN = await loadPlugin()
  if (!LN || !isNewsAlertsEnabled() || !snap?.events.length) return { scheduled: 0, permissionDenied: false }
  if (!(await ensurePermission(LN))) return { scheduled: 0, permissionDenied: true }

  const now = Date.now()
  const mine = await tradedCurrencies()

  // Events still worth alerting about, earliest first.
  const upcoming = snap.events
    .filter((e) =>
      e.impact === 'High' &&
      e.time > now + TOO_CLOSE_MS &&
      e.time <= now + WINDOW_MS &&
      (mine.size === 0 || mine.has(e.country)),
    )
    .sort((a, b) => a.time - b.time)
    .slice(0, MAX_PENDING)

  // Which notifications are already booked? (Fired ones drop out on their own.)
  let booked = new Set<number>()
  try {
    const pend = await LN.getPending()
    booked = new Set(pend.notifications.map((n) => n.id))
  } catch { /* treat as nothing booked */ }

  const toSchedule = upcoming
    .map((e) => ({ e, id: notifId(e.id) }))
    .filter(({ e, id }) => !booked.has(id) && !upcoming.some((o) => o !== e && notifId(o.id) === id))

  if (toSchedule.length === 0) return { scheduled: 0, permissionDenied: false }

  try {
    await LN.schedule({
      notifications: toSchedule.map(({ e, id }) => ({
        id,
        title: '🔴 Big news coming up',
        body: `${e.country} · ${e.title} — starts ${hhmm(e.time)}`,
        schedule: {
          // If the ideal lead time already passed (e.g. phone rebooted), fire
          // shortly after the next sync instead of silently dropping it.
          at: new Date(Math.max(e.time - LEAD_MINUTES * 60000, Date.now() + 3000)),
          allowWhileIdle: true,
        },
      })),
    })
  } catch { /* scheduling failed — try again on next sync */ }

  return { scheduled: toSchedule.length, permissionDenied: false }
}

// Cancel every pending news alert (used when the user turns alerts off).
export async function cancelAllNewsAlerts(): Promise<void> {
  const LN = await loadPlugin()
  if (!LN) return
  try {
    const pend = await LN.getPending()
    if (pend.notifications.length) await LN.cancel({ notifications: pend.notifications.map((n) => ({ id: n.id })) })
  } catch { /* ignore */ }
}

// Fire a one-off sample notification a few seconds out, so the user can
// verify alerts work on their phone.
export async function sendTestNewsAlert(): Promise<boolean> {
  const LN = await loadPlugin()
  if (!LN) return false
  if (!(await ensurePermission(LN))) return false
  try {
    await LN.schedule({
      notifications: [{
        id: 1999999999,
        title: '🔔 News alerts are on',
        body: 'You\'ll get a heads-up ~15 minutes before high-impact events for the currencies you trade.',
        schedule: { at: new Date(Date.now() + 4000), allowWhileIdle: true },
      }],
    })
    return true
  } catch { return false }
}
