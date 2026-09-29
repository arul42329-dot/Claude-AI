import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchEcon, getEcon, readCachedEcon, type EconEvent, type EconSnapshot, type Impact } from '../econ'
import { db } from '../db'
import { useLiveQuery } from '../util'
import { format, isToday, isTomorrow, isYesterday, startOfWeek } from 'date-fns'

const IMPACT_RANK: Record<Impact, number> = { High: 3, Medium: 2, Low: 1, Holiday: 0 }

function dayLabel(d: Date): string {
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, d MMM')
}
function timeAgo(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return m + 'm ago'
  return Math.round(m / 60) + 'h ago'
}

export function EconomicCalendar({ title = '📅 Economic Calendar' }: { title?: string } = {}) {
  const [snap, setSnap] = useState<EconSnapshot | null>(() => readCachedEcon())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [impact, setImpact] = useState<'all' | 'medium' | 'high'>('medium')
  const [cur, setCur] = useState('all')
  const [myPairs, setMyPairs] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [view, setView] = useState<'upcoming' | 'previous'>('upcoming')
  const [now, setNow] = useState(() => Date.now())

  // Collapse back to a single day whenever the filter/tab changes.
  useEffect(() => { setShowAll(false) }, [impact, cur, myPairs, view])

  const trades = useLiveQuery(() => db.trades.toArray(), [], [])
  const tradedCurrencies = useMemo(() => {
    const s = new Set<string>()
    for (const t of trades ?? []) for (const c of (t.pair || '').split('/')) if (c) s.add(c.trim().toUpperCase())
    return s
  }, [trades])

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null)
    try { setSnap(force ? await fetchEcon() : await getEcon()) }
    catch (e: any) { setError(e?.message || 'Could not load the calendar') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const onWake = () => load()
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    const tick = window.setInterval(() => setNow(Date.now()), 30000)
    return () => { window.removeEventListener('focus', onWake); window.removeEventListener('online', onWake); window.clearInterval(tick) }
  }, [load])

  const events = snap?.events ?? []
  const currencies = useMemo(() => Array.from(new Set(events.map((e) => e.country).filter(Boolean))).sort(), [events])

  const filtered = useMemo(() => {
    const min = impact === 'high' ? 3 : impact === 'medium' ? 2 : 1
    const base = events.filter((e) =>
      IMPACT_RANK[e.impact] >= min &&
      (cur === 'all' || e.country === cur) &&
      (!myPairs || tradedCurrencies.has(e.country)),
    )
    if (view === 'previous') {
      // Past events from the start of this week up to now, newest first.
      const weekStart = startOfWeek(new Date(now), { weekStartsOn: 1 }).getTime()
      return base
        .filter((e) => e.time < now && e.time >= weekStart)
        .sort((a, b) => b.time - a.time)
    }
    // Upcoming: only events that haven't finished (10-min grace after start).
    const cutoff = now - 10 * 60 * 1000
    return base.filter((e) => e.time >= cutoff)
  }, [events, impact, cur, myPairs, tradedCurrencies, now, view])

  const groups = useMemo(() => {
    const m = new Map<string, EconEvent[]>()
    for (const e of filtered) {
      const k = format(new Date(e.time), 'yyyy-MM-dd')
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(e)
    }
    return Array.from(m.entries())
  }, [filtered])

  // Collapsed view = just the nearest day that has matching events; the rest is
  // revealed with "More news". (Empty days never form a group, so this naturally
  // rolls to the day after next when a day has no news.)
  const visibleGroups = showAll ? groups : groups.slice(0, 1)
  const hiddenEvents = showAll ? 0 : filtered.length - (groups[0]?.[1].length ?? 0)

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <div className="row" style={{ gap: 10 }}>
          {snap && <span className="muted" style={{ fontSize: 12 }}>Updated {timeAgo(snap.at)}</span>}
          <button className="btn sm" onClick={() => load(true)} disabled={loading}>
            <span className={'refresh-ic' + (loading ? ' spin' : '')}>⟳</span>
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="seg">
          <button className={view === 'upcoming' ? 'active' : ''} onClick={() => setView('upcoming')}>Upcoming</button>
          <button className={view === 'previous' ? 'active' : ''} onClick={() => setView('previous')}>Previous</button>
        </div>
        <div className="seg">
          <button className={impact === 'high' ? 'active' : ''} onClick={() => setImpact('high')}>High</button>
          <button className={impact === 'medium' ? 'active' : ''} onClick={() => setImpact('medium')}>Med+</button>
          <button className={impact === 'all' ? 'active' : ''} onClick={() => setImpact('all')}>All</button>
        </div>
        <select className="select" value={cur} onChange={(e) => setCur(e.target.value)} style={{ maxWidth: 130 }}>
          <option value="all">All currencies</option>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {tradedCurrencies.size > 0 && (
          <button className={'btn sm' + (myPairs ? ' primary' : '')} onClick={() => setMyPairs((v) => !v)} title="Only currencies you trade">
            ★ My pairs
          </button>
        )}
      </div>

      {events.length === 0 && error && (
        <div className="empty" style={{ border: 'none' }}>
          <p className="muted">{navigator.onLine ? 'Could not reach the calendar feed.' : 'You are offline.'}</p>
          <button className="btn" onClick={() => load(true)} disabled={loading}>Try again</button>
        </div>
      )}

      {events.length > 0 && (
        <>
          {error && <div className="stale-note" style={{ marginBottom: 12 }}>Showing saved events — live feed unavailable.</div>}
          {groups.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: '10px 0' }}>
              {view === 'previous' ? 'No earlier events this week match this filter.' : 'No upcoming events match this filter.'}
            </p>
          ) : (
            <>
              <div className="econ-wrap">
                {visibleGroups.map(([k, evs]) => (
                  <div key={k}>
                    <div className="econ-day">{dayLabel(new Date(k + 'T00:00'))}</div>
                    {evs.map((e) => (
                      <div key={e.id} className={'econ-row' + (e.impact === 'High' ? ' big' : '')}>
                        <span className="econ-time">{format(new Date(e.time), 'HH:mm')}</span>
                        <span className="cur-badge">{e.country}</span>
                        {e.impact === 'High'
                          ? <span className="impact-chip high" title="High impact">HIGH</span>
                          : <span className={'impact-dot ' + e.impact.toLowerCase()} title={e.impact} />}
                        <span className={'econ-title' + (e.impact === 'High' ? ' big-title' : '')}>{e.title}</span>
                        {e.time > now && e.time - now <= 3600000 && <span className="soon-badge">Soon</span>}
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
              {groups.length > 1 && (
                <button className="econ-more" onClick={() => setShowAll((v) => !v)}>
                  {showAll
                    ? 'Show less ▲'
                    : `More news — ${hiddenEvents} more ${hiddenEvents === 1 ? 'event' : 'events'} over ${groups.length - 1} ${groups.length - 1 === 1 ? 'day' : 'days'} ▾`}
                </button>
              )}
            </>
          )}
        </>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>Times shown in your local timezone · 🔴 high-impact events are highlighted. Source: ForexFactory (faireconomy.media).</p>
    </div>
  )
}
