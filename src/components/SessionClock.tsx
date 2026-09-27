import { useEffect, useState } from 'react'

// Forex sessions and ICT killzones, expressed in UTC. Session hours are the
// widely-used approximations; killzones follow the common ICT windows. These
// shift ~1h with daylight-saving in London/New York, so they're labelled as
// approximate — handy as an at-a-glance guide, not an exact exchange clock.
interface Window { name: string; start: number; end: number } // hours in UTC (may wrap midnight)

const SESSIONS: Window[] = [
  { name: 'Sydney', start: 22, end: 7 },
  { name: 'Tokyo', start: 0, end: 9 },
  { name: 'London', start: 8, end: 17 },
  { name: 'New York', start: 13, end: 22 },
]

const KILLZONES: Window[] = [
  { name: 'Asian KZ', start: 0, end: 4 },
  { name: 'London KZ', start: 7, end: 10 },
  { name: 'New York AM KZ', start: 12, end: 15 },
  { name: 'London Close KZ', start: 15, end: 16 },
]

function nowUtcHours(d: Date): number {
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
}
function inWindow(h: number, w: Window): boolean {
  return w.start <= w.end ? h >= w.start && h < w.end : h >= w.start || h < w.end
}
function hoursUntilOpen(h: number, w: Window): number {
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

  const h = nowUtcHours(now)
  const activeKz = KILLZONES.find((k) => inWindow(h, k))
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
          const active = inWindow(h, k)
          return (
            <span key={k.name} className={'kz-chip' + (active ? ' on' : '')}>
              {k.name} · {String(k.start).padStart(2, '0')}–{String(k.end).padStart(2, '0')} UTC
            </span>
          )
        })}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>Approximate UTC windows — shift ~1h with London/NY daylight-saving.</p>
    </div>
  )
}
