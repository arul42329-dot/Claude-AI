import { useEffect, useState } from 'react'

// Forex sessions and ICT killzones, defined in each market's LOCAL time and its
// IANA timezone. The current local time (and UTC offset) for every zone is
// derived with Intl at render time, so the windows automatically follow
// daylight-saving changes in Sydney, London and New York (Tokyo has no DST).
interface Zone { name: string; tz: string; start: number; end: number } // local hours, may wrap midnight

// Session local hours (match the classic ~08:00–17:00 local trading windows).
const SESSIONS: Zone[] = [
  { name: 'Sydney', tz: 'Australia/Sydney', start: 8, end: 17 },
  { name: 'Tokyo', tz: 'Asia/Tokyo', start: 9, end: 18 },
  { name: 'London', tz: 'Europe/London', start: 8, end: 17 },
  { name: 'New York', tz: 'America/New_York', start: 8, end: 17 },
]

// ICT killzones are anchored to New York time, so they shift with US DST.
const KILLZONES: Zone[] = [
  { name: 'Asian KZ', tz: 'America/New_York', start: 19, end: 23 },
  { name: 'London KZ', tz: 'America/New_York', start: 2, end: 5 },
  { name: 'New York AM KZ', tz: 'America/New_York', start: 7, end: 10 },
  { name: 'London Close KZ', tz: 'America/New_York', start: 10, end: 11 },
]

function tzParts(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const m: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') m[p.type] = Number(p.value)
  return m
}
// Current wall-clock hour (float) in a timezone.
function nowHoursInTz(date: Date, timeZone: string): number {
  const m = tzParts(date, timeZone)
  return m.hour + m.minute / 60 + m.second / 3600
}
// Timezone's UTC offset in whole hours at this moment (e.g. +1 for BST, -4 for EDT).
function tzOffsetHours(date: Date, timeZone: string): number {
  const m = tzParts(date, timeZone)
  const asUTC = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute, m.second)
  return Math.round((asUTC - date.getTime()) / 3600000)
}

function inWindow(h: number, w: Zone): boolean {
  return w.start <= w.end ? h >= w.start && h < w.end : h >= w.start || h < w.end
}
function hoursUntilOpen(h: number, w: Zone): number {
  if (inWindow(h, w)) return 0
  let diff = w.start - h
  if (diff < 0) diff += 24
  return diff
}
function fmtCountdown(hoursFloat: number): string {
  const total = Math.round(hoursFloat * 60)
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${hh}h ${String(mm).padStart(2, '0')}m`
}
const pad = (n: number) => String(((n % 24) + 24) % 24).padStart(2, '0')

export function SessionClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const activeKz = KILLZONES.find((k) => inWindow(nowHoursInTz(now, k.tz), k))
  const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const utcTime = now.toUTCString().slice(17, 22)

  return (
    <div className="card session-clock" style={{ marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>⏰ Sessions &amp; Killzones</h3>
        <span className="muted" style={{ fontSize: 12.5 }}>Local {localTime} · {utcTime} UTC</span>
      </div>

      {activeKz ? (
        <div className="kz-active"><span className="live-dot" /> In session: <strong>{activeKz.name}</strong></div>
      ) : (
        <div className="kz-active off">No active killzone right now</div>
      )}

      <div className="sess-grid">
        {SESSIONS.map((s) => {
          const h = nowHoursInTz(now, s.tz)
          const open = inWindow(h, s)
          const until = hoursUntilOpen(h, s)
          return (
            <div key={s.name} className={'sess-pill' + (open ? ' open' : '')}>
              <span className="sess-name">{s.name}</span>
              <span className={'sess-state' + (open ? ' on' : '')}>
                {open ? 'OPEN' : `in ${fmtCountdown(until)}`}
              </span>
            </div>
          )
        })}
      </div>

      <div className="kz-list">
        {KILLZONES.map((k) => {
          const active = inWindow(nowHoursInTz(now, k.tz), k)
          const off = tzOffsetHours(now, k.tz)
          const utcStart = k.start - off
          const utcEnd = k.end - off
          return (
            <span key={k.name} className={'kz-chip' + (active ? ' on' : '')}>
              {k.name} · {pad(utcStart)}–{pad(utcEnd)} UTC
            </span>
          )
        })}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>Windows auto-adjust for daylight-saving (Sydney · London · New York).</p>
    </div>
  )
}
