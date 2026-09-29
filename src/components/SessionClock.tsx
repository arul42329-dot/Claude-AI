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

export function SessionClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const activeKz = KILLZONES.find((k) => inWindow(nowHoursInTz(now, k.tz), k))
  const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const utcTime = now.toUTCString().slice(17, 22)

  // Which major FX session(s) are open right now.
  const openSessions = SESSIONS.filter((s) => inWindow(nowHoursInTz(now, s.tz), s))
  // Next session to open (soonest), for the countdown when nothing is open.
  const next = SESSIONS
    .map((s) => ({ s, until: hoursUntilOpen(nowHoursInTz(now, s.tz), s) }))
    .filter((x) => x.until > 0)
    .sort((a, b) => a.until - b.until)[0]

  return (
    <div className="card session-clock compact" style={{ marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="sess-now">
          {openSessions.length > 0 ? (
            <>
              <span className="live-dot" />
              <strong>{openSessions.map((s) => s.name).join(' + ')}</strong>
              <span className="sess-open-tag">session open</span>
            </>
          ) : (
            <>
              <span className="live-dot off" />
              <span className="muted">Markets quiet</span>
              {next && <span className="sess-next">· {next.s.name} opens in {fmtCountdown(next.until)}</span>}
            </>
          )}
          {activeKz && <span className="kz-inline">· {activeKz.name}</span>}
        </div>
        <span className="muted" style={{ fontSize: 12.5 }}>Local {localTime} · {utcTime} UTC</span>
      </div>
    </div>
  )
}
