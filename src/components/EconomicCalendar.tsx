import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchEcon, readCachedEcon, type EconEvent, type EconSnapshot, type Impact } from '../econ'
import { format, isToday, isTomorrow } from 'date-fns'

const IMPACT_RANK: Record<Impact, number> = { High: 3, Medium: 2, Low: 1, Holiday: 0 }

function dayLabel(d: Date): string {
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'EEEE, d MMM')
}
function timeAgo(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return m + 'm ago'
  return Math.round(m / 60) + 'h ago'
}

export function EconomicCalendar() {
  const [snap, setSnap] = useState<EconSnapshot | null>(() => readCachedEcon())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [impact, setImpact] = useState<'all' | 'medium' | 'high'>('high')
  const [cur, setCur] = useState('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setSnap(await fetchEcon()) }
    catch (e: any) { setError(e?.message || 'Could not load the calendar') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const onWake = () => load()
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    return () => { window.removeEventListener('focus', onWake); window.removeEventListener('online', onWake) }
  }, [load])

  const events = snap?.events ?? []
  const currencies = useMemo(() => Array.from(new Set(events.map((e) => e.country).filter(Boolean))).sort(), [events])

  const filtered = useMemo(() => {
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
    const min = impact === 'high' ? 3 : impact === 'medium' ? 2 : 1
    return events.filter((e) =>
      e.time >= startToday.getTime() &&
      IMPACT_RANK[e.impact] >= min &&
      (cur === 'all' || e.country === cur),
    )
  }, [events, impact, cur])

  const groups = useMemo(() => {
    const m = new Map<string, EconEvent[]>()
    for (const e of filtered) {
      const k = format(new Date(e.time), 'yyyy-MM-dd')
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(e)
    }
    return Array.from(m.entries())
  }, [filtered])

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>📅 Economic Calendar</h3>
        <div className="row" style={{ gap: 10 }}>
          {snap && <span className="muted" style={{ fontSize: 12 }}>Updated {timeAgo(snap.at)}</span>}
          <button className="btn sm" onClick={load} disabled={loading}>
            <span className={'refresh-ic' + (loading ? ' spin' : '')}>⟳</span>
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="seg">
          <button className={impact === 'high' ? 'active' : ''} onClick={() => setImpact('high')}>High</button>
          <button className={impact === 'medium' ? 'active' : ''} onClick={() => setImpact('medium')}>Med+</button>
          <button className={impact === 'all' ? 'active' : ''} onClick={() => setImpact('all')}>All</button>
        </div>
        <select className="select" value={cur} onChange={(e) => setCur(e.target.value)} style={{ maxWidth: 130 }}>
          <option value="all">All currencies</option>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {events.length === 0 && error && (
        <div className="empty" style={{ border: 'none' }}>
          <p className="muted">{navigator.onLine ? 'Could not reach the calendar feed.' : 'You are offline.'}</p>
          <button className="btn" onClick={load} disabled={loading}>Try again</button>
        </div>
      )}

      {events.length > 0 && (
        <>
          {error && <div className="stale-note" style={{ marginBottom: 12 }}>Showing saved events — live feed unavailable.</div>}
          {groups.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: '10px 0' }}>No upcoming events match this filter.</p>
          ) : (
            <div className="econ-wrap">
              {groups.map(([k, evs]) => (
                <div key={k}>
                  <div className="econ-day">{dayLabel(new Date(k + 'T00:00'))}</div>
                  {evs.map((e) => (
                    <div key={e.id} className="econ-row">
                      <span className="econ-time">{format(new Date(e.time), 'HH:mm')}</span>
                      <span className="cur-badge">{e.country}</span>
                      <span className={'impact-dot ' + e.impact.toLowerCase()} title={e.impact} />
                      <span className="econ-title">{e.title}</span>
                      {(e.forecast || e.previous) && (
                        <span className="econ-vals">
                          {e.forecast && <>F: <strong>{e.forecast}</strong></>}
                          {e.previous && <span className="muted"> · P: {e.previous}</span>}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>Times shown in your local timezone · impact: 🔴 high 🟠 medium 🟡 low. Source: ForexFactory (faireconomy.media).</p>
    </div>
  )
}
