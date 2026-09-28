import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchIndia, readCachedIndia, nseStatus, type IndiaQuote, type IndiaSnapshot } from '../india'
import { fetchIndiaNews, readCachedIndiaNews, devDemoNews, type NewsSnapshot } from '../indiaNews'
import { EconomicCalendar } from './EconomicCalendar'
import { BiasPanel } from './BiasPanel'

function fmtPrice(n: number, d: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
}
function fmtChg(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}
function timeAgo(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return s + 's ago'
  const m = Math.round(s / 60)
  if (m < 60) return m + 'm ago'
  return Math.round(m / 60) + 'h ago'
}

export function IndiaMarkets({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [snap, setSnap] = useState<IndiaSnapshot | null>(() => readCachedIndia())
  const [news, setNews] = useState<NewsSnapshot | null>(() => readCachedIndiaNews())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<IndiaQuote | null>(null)
  const [, force] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnap(await fetchIndia())
    } catch (e: any) {
      setError(e?.message || 'Could not load Indian market data')
    } finally {
      setLoading(false)
    }
    fetchIndiaNews().then(setNews).catch(() => { if (import.meta.env.DEV) setNews(devDemoNews()) })
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 5000) // live-ish auto refresh (~5s)
    const tick = window.setInterval(() => force((n) => n + 1), 1000)
    const onWake = () => load()
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    return () => {
      window.clearInterval(id)
      window.clearInterval(tick)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [load])

  // Reload when the shared top Refresh button is pressed.
  useEffect(() => { if (refreshSignal) load() }, [refreshSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  const quotes = snap?.quotes ?? []
  const status = useMemo(() => nseStatus(new Date()), [snap]) // eslint-disable-line react-hooks/exhaustive-deps
  const selectedLive = useMemo(
    () => (selected ? quotes.find((x) => x.symbol === selected.symbol) ?? selected : null),
    [selected, quotes],
  )

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span className={'nse-status' + (status.open ? ' open' : '')}>
          <span className="live-dot" /> {status.label}
        </span>
        {snap && <span className="muted" style={{ fontSize: 12 }}>Updated {timeAgo(snap.at)}</span>}
      </div>

      <EconomicCalendar />

      {error && quotes.length === 0 && (
        <div className="empty">
          <div className="big">📡</div>
          <p>{navigator.onLine ? 'Could not reach the market feed right now.' : 'You appear to be offline.'}</p>
          <p className="muted" style={{ fontSize: 13 }}>Indian index data needs an internet connection. It resumes automatically once you reconnect.</p>
          <button className="btn primary" onClick={load} disabled={loading}>Try again</button>
        </div>
      )}

      {quotes.length > 0 && (
        <>
          {(error || snap?.partial) && (
            <div className="stale-note">
              {error ? 'Showing last saved values — live feed unavailable.' : 'Some indices are temporarily unavailable; showing what we have.'}
            </div>
          )}

          <div className="mkt-grid">
            {quotes.map((x) => <IndiaCard key={x.symbol} q={x} onOpen={() => setSelected(x)} />)}
          </div>
        </>
      )}

      {news && news.items.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>📰 Market news</h3>
            <span className="muted" style={{ fontSize: 12 }}>Updated {timeAgo(news.at)}</span>
          </div>
          <div className="news-list">
            {news.items.map((n, i) => (
              <a key={i} className="news-item" href={n.link} target="_blank" rel="noopener noreferrer">
                <span className="news-item-title">{n.title}</span>
                <span className="news-item-time">{timeAgo(n.at)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: 11.5, marginTop: 24, textAlign: 'center' }}>
        Indices: Yahoo Finance (may be ~15 min delayed). News: Economic Times. Indicative data for journaling — not tradable quotes.
      </p>

      {selectedLive && <BiasPanel q={selectedLive} onClose={() => setSelected(null)} />}
    </>
  )
}

function IndiaCard({ q, onOpen }: { q: IndiaQuote; onOpen?: () => void }) {
  const up = q.changePct >= 0
  return (
    <div className="mkt-card mkt-clickable india" role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}>
      <div className="mkt-sym">
        {q.symbol}
        <span className="mkt-chev" aria-hidden="true">›</span>
      </div>
      <div className="mkt-price">{fmtPrice(q.price, q.decimals)}</div>
      <div className="mkt-foot">
        <span className={'pill ' + (up ? 'up' : 'down')}>{fmtChg(q.changePct)}</span>
        <span className={'bias ' + (q.bias === 'Bullish' ? 'bull' : q.bias === 'Bearish' ? 'bear' : 'neu')} title={q.biasVotes?.join('\n')}>
          <span className="bdot" />{q.bias}
        </span>
      </div>
    </div>
  )
}
