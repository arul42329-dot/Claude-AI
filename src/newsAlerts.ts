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

// The plugin proxy is returned inside a container object. Resolving a promise
// WITH the proxy itself would make JS run its thenable check — calling
// `.then` on it — which Capacitor's stub rejects ("LocalNotifications.then()
// is not implemented"), an unhandled rejection that escapes ordinary
// try/catch and leaves UI handlers dead. The container makes awaiting safe.
async function loadPlugin(): Promise<{ LN: LocalNotificationsPlugin } | null> {
  if (!newsAlertsSupported()) return null
  try {
    const mod = await import('@capacitor/local-notifications')
    return { LN: mod.LocalNotifications }
  } catch { return null }
}

async function tradedCurrencies(): Promise<Set<string>> {
  try {
    const trades = await db.trades.toArray()
    const s = new Set<string>()
    for (const t of trades) for (const c of (t.pair || '').split('/')) {
      const v = c.trim().toUpperCase()
      // Only real ISO currency codes (USD, EUR, INR…) count — India instruments
      // like "NIFTY 50" must not shrink the alert filter and hide all news.
      if (/^[A-Z]{3}$/.test(v)) s.add(v)
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

// Ask for the Android 13+ notification permission up-front (once). Safe to
// call repeatedly: if already granted/denied it's a no-op. Called at app boot
// so the system dialog always appears, even if the calendar feed is slow/down.
export async function ensureNotificationPermission(): Promise<boolean> {
  const LN = (await loadPlugin())?.LN ?? null
  if (!LN) return false
  return ensurePermission(LN)
}

// Request the notification permission and report exactly what happened —
// used by the Alerts card button so a dead/missing plugin or a dismissed
// dialog is VISIBLE to the user instead of failing silently.
export type PermRequestResult = 'granted' | 'denied' | 'prompt' | 'no-plugin' | 'error'

export async function requestNotificationPermission(): Promise<PermRequestResult> {
  const LN = (await loadPlugin())?.LN ?? null
  if (!LN) return 'no-plugin'
  try {
    const p = await LN.requestPermissions()
    if (p.display === 'granted' || p.display === 'denied' || p.display === 'prompt') return p.display
    return 'error'
  } catch { return 'error' }
}

// Current notification permission for the Alerts card status line.
export async function notificationPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  const LN = (await loadPlugin())?.LN ?? null
  if (!LN) return 'unknown'
  try {
    const p = await LN.checkPermissions()
    if (p.display === 'granted' || p.display === 'denied' || p.display === 'prompt') return p.display
    return 'unknown'
  } catch { return 'unknown' }
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
  const LN = (await loadPlugin())?.LN ?? null
  if (!LN || !isNewsAlertsEnabled() || !snap?.events.length) return { scheduled: 0, permissionDenied: false }
  if (!(await ensurePermission(LN))) return { scheduled: 0, permissionDenied: true }

  const now = Date.now()
  const mine = await tradedCurrencies()

  // Events still worth alerting about, earliest first. The lead time must
  // ALSO still be ahead (e.time − LEAD > now): an event whose ideal alert
  // moment already passed is DROPPED, never rescheduled for "right now" —
  // a late alert that fires just because the app was opened is worse than
  // no alert at all.
  const upcoming = snap.events
    .filter((e) =>
      e.impact === 'High' &&
      e.time > now + TOO_CLOSE_MS &&
      e.time <= now + WINDOW_MS &&
      e.time - LEAD_MINUTES * 60000 > now &&
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
          // Guaranteed future by the filter above (no clamping — past-due
          // alerts are dropped, not fired late).
          at: new Date(e.time - LEAD_MINUTES * 60000),
          allowWhileIdle: true,
        },
      })),
    })
  } catch { /* scheduling failed — try again on next sync */ }

  return { scheduled: toSchedule.length, permissionDenied: false }
}

// Cancel every pending news alert (used when the user turns alerts off).
// Session-open alerts use their own id range and are left alone.
export async function cancelAllNewsAlerts(): Promise<void> {
  const LN = (await loadPlugin())?.LN ?? null
  if (!LN) return
  try {
    const pend = await LN.getPending()
    const ids = pend.notifications.map((n) => n.id).filter((id) => !isSessionAlertId(id))
    if (ids.length) await LN.cancel({ notifications: ids.map((id) => ({ id })) })
  } catch { /* ignore */ }
}

// ---------------- Session-open alerts ----------------
// Local notifications when a major forex session opens (London / New York).
// Session start times are defined in that market's local time and converted
// with Intl, so they stay correct across daylight-saving changes — the same
// approach the on-screen session clock uses.

const SESSIONS_KEY = 'edgefolio-session-alerts'
// Notification ids for session alerts live in their own range so they can be
// cancelled independently of news alerts (which use hashed event ids).
const SESSION_ID_BASE = 900000000

export interface SessionAlertPrefs {
  london: boolean
  newyork: boolean
}

export function getSessionAlertPrefs(): SessionAlertPrefs {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (raw) return { london: true, newyork: true, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { london: true, newyork: true }
}

export function setSessionAlertPrefs(p: SessionAlertPrefs): void {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

const SESSION_DEFS: { key: keyof SessionAlertPrefs; name: string; tz: string; hour: number }[] = [
  { key: 'london', name: 'London session', tz: 'Europe/London', hour: 8 },
  { key: 'newyork', name: 'New York session', tz: 'America/New_York', hour: 8 },
]

function tzPartsMs(date: Date, timeZone: string): number {
  // Milliseconds offset of `timeZone` from UTC at the given instant — derived
  // from Intl so DST is handled for us.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date)
  const m: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') m[p.type] = Number(p.value)
  const asUTC = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute)
  return asUTC - date.getTime()
}

// Epoch time of the next (or current-day future) HH:00 wall clock in `tz`.
function nextOpenAt(now: Date, tz: string, hour: number): number {
  const offset = tzPartsMs(now, tz)
  const wall = new Date(now.getTime() + offset) // tz wall time, read via UTC getters
  let at = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), hour, 0) - offset
  if (at <= now.getTime()) at += 24 * 60 * 60 * 1000
  return at
}

function isSessionAlertId(id: number): boolean {
  return id >= SESSION_ID_BASE && id < SESSION_ID_BASE + 1000
}

// Book session-open notifications for the next `days` days (re-synced on every
// app open, mirroring the news alerts). Idempotent via the pending list.
export async function syncSessionAlerts(days = 2): Promise<number> {
  const LN = (await loadPlugin())?.LN ?? null
  if (!LN) return 0
  const prefs = getSessionAlertPrefs()
  if (!prefs.london && !prefs.newyork) return 0
  if (!(await ensurePermission(LN))) return 0

  const now = new Date()
  const wanted: { id: number; title: string; body: string; at: number }[] = []
  SESSION_DEFS.forEach((s, si) => {
    if (!prefs[s.key]) return
    // Cancel the other session's alerts stay untouched; ids are per session/day.
    let at = nextOpenAt(now, s.tz, s.hour)
    for (let d = 0; d < days; d++) {
      const local = new Date(at)
      const hh = String(local.getHours()).padStart(2, '0')
      const mm = String(local.getMinutes()).padStart(2, '0')
      wanted.push({
        id: SESSION_ID_BASE + si * 100 + d,
        title: `🟢 ${s.name} open`,
        body: `The ${s.name} just opened (${hh}:${mm} your time). Trade your plan.`,
        at,
      })
      at += 24 * 60 * 60 * 1000
    }
  })

  let booked = new Set<number>()
  try {
    const pend = await LN.getPending()
    booked = new Set(pend.notifications.map((n) => n.id))
  } catch { /* treat as nothing booked */ }

  // Drop anything not strictly in the future (clock changes, dozed sync) —
  // never fire a session alert late / just because the app was opened.
  const toSchedule = wanted.filter((w) => !booked.has(w.id) && w.at > Date.now())
  if (!toSchedule.length) return 0

  // Drop any stale session alerts outside what we want now (e.g. day slots
  // from an earlier sync) so the pending list never grows unbounded.
  const stale = Array.from(booked).filter((id) => isSessionAlertId(id) && !wanted.some((w) => w.id === id))
  try {
    if (stale.length) await LN.cancel({ notifications: stale.map((id) => ({ id })) })
  } catch { /* ignore */ }

  try {
    await LN.schedule({
      notifications: toSchedule.map((w) => ({
        id: w.id,
        title: w.title,
        body: w.body,
        schedule: { at: new Date(w.at), allowWhileIdle: true },
      })),
    })
  } catch { /* try again on next sync */ }
  return toSchedule.length
}

// ---------------- End-of-day review reminder ----------------
// One daily nudge to log trades + write the reflection — the journaling
// habit the whole app depends on. 15:45 local time (Indian market close for
// India users). Idempotent + drop-past-due, like every other alert: it only
// ever books a strictly-future reminder.
const EOD_KEY = 'edgefolio-eod-reminder'
const EOD_ALERT_ID = 905000000
const EOD_HOUR = 15
const EOD_MINUTE = 45

export function isEodReminderEnabled(): boolean {
  try {
    const raw = localStorage.getItem(EOD_KEY)
    if (raw) return (JSON.parse(raw)?.enabled ?? true) === true
  } catch { /* ignore */ }
  return true // default ON (toggle lives in Settings → Alerts)
}

export function setEodReminderEnabled(v: boolean): void {
  try { localStorage.setItem(EOD_KEY, JSON.stringify({ enabled: v })) } catch { /* ignore */ }
}

export async function syncEodReminder(): Promise<boolean> {
  const LN = (await loadPlugin())?.LN ?? null
  if (!LN || !isEodReminderEnabled()) return false
  if (!(await ensurePermission(LN))) return false
  try {
    const pend = await LN.getPending()
    if (pend.notifications.some((n) => n.id === EOD_ALERT_ID)) return false // already booked
  } catch { /* treat as not booked */ }
  // next 15:45 local time, strictly in the future
  const at = new Date()
  at.setHours(EOD_HOUR, EOD_MINUTE, 0, 0)
  if (at.getTime() <= Date.now() + 60000) at.setDate(at.getDate() + 1)
  try {
    await LN.schedule({
      notifications: [{
        id: EOD_ALERT_ID,
        title: '📝 End-of-day review',
        body: 'Log your trades and write today\'s reflection while it\'s fresh — 3 minutes in Edgefolio.',
        schedule: { at, allowWhileIdle: true },
      }],
    })
    return true
  } catch { return false }
}

export async function cancelEodReminder(): Promise<void> {
  const LN = (await loadPlugin())?.LN ?? null
  if (!LN) return
  try { await LN.cancel({ notifications: [{ id: EOD_ALERT_ID }] }) } catch { /* ignore */ }
}

// Cancel only the session-open alerts (used when both toggles are turned off).
export async function cancelSessionAlerts(): Promise<void> {
  const LN = (await loadPlugin())?.LN ?? null
  if (!LN) return
  try {
    const pend = await LN.getPending()
    const ids = pend.notifications.map((n) => n.id).filter(isSessionAlertId)
    if (ids.length) await LN.cancel({ notifications: ids.map((id) => ({ id })) })
  } catch { /* ignore */ }
}

// How many alerts are currently booked on the device (diagnostics in Settings).
export async function pendingAlertCount(): Promise<number> {
  const LN = (await loadPlugin())?.LN ?? null
  if (!LN) return -1
  try {
    const pend = await LN.getPending()
    return pend.notifications.length
  } catch { return -1 }
}

// Fire a one-off sample notification a few seconds out, so the user can
// verify alerts work on their phone.
export async function sendTestNewsAlert(): Promise<boolean> {
  const LN = (await loadPlugin())?.LN ?? null
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
