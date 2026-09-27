import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMarket, readCachedMarket, MARKET_GROUPS, type MarketSnapshot, type Quote, type Group } from '../market'
import { useCountUp } from '../hooks/useCountUp'
import { SessionClock } from '../components/SessionClock'
import { EconomicCalendar } from '../components/EconomicCalendar'

function fmtPrice(n: number, d: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
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

export default function Markets() {
  const [snap, setSnap] = useState<MarketSnapshot | null>(() => readCachedMarket())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<'All' | Group>('All')
  const [, force] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await fetchMarket()
      setSnap(s)
    } catch (e: any) {
      setError(e?.message || 'Could not load live prices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 45000)
    const tick = window.setInterval(() => force((n) => n + 1), 15000) // refresh "x ago"
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

  const quotes = snap?.quotes ?? []
  const gold = quotes.find((x) => x.symbol === 'XAU/USD')

  const filtered = useMemo(() => {
    let list = quotes.filter((x) => x.symbol !== 'XAU/USD')
    if (group !== 'All') list = list.filter((x) => x.group === group)
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter((x) => x.compact.toLowerCase().includes(s) || x.name.toLowerCase().includes(s) || x.symbol.toLowerCase().includes(s))
    }
    return list
  }, [quotes, group, q])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Markets</h1>
          <p>Live prices &amp; day bias · XAU/USD priority</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {snap && <span className="muted" style={{ fontSize: 12 }}>Updated {timeAgo(snap.at)}</span>}
          <button className="btn sm" onClick={load} disabled={loading}>
            <span className={'refresh-ic' + (loading ? ' spin' : '')}>⟳</span> Refresh
          </button>
        </div>
      </div>

      <SessionClock />

      <EconomicCalendar />

      {error && quotes.length === 0 && (
        <div className="empty">
          <div className="big">📡</div>
          <p>{navigator.onLine ? 'Could not reach the price feed right now.' : 'You appear to be offline.'}</p>
          <p className="muted" style={{ fontSize: 13 }}>Live market data needs an internet connection. Prices resume automatically once you reconnect.</p>
          <button className="btn primary" onClick={load} disabled={loading}>Try again</button>
        </div>
      )}

      {quotes.length > 0 && (
        <>
          {(error || snap?.partial) && (
            <div className="stale-note">
              {error ? 'Showing last saved prices — live feed unavailable.' : 'Some feeds are temporarily unavailable; showing what we have.'}
            </div>
          )}

          {gold && <GoldHero q={gold} />}

          <div className="toolbar" style={{ marginTop: 20 }}>
            <input className="input" style={{ maxWidth: 260 }} placeholder="🔍 Search pair…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="seg">
              {(['All', ...MARKET_GROUPS] as const).map((g) => (
                <button key={g} className={group === g ? 'active' : ''} onClick={() => setGroup(g)}>{g}</button>
              ))}
            </div>
          </div>

          <div className="mkt-grid">
            {filtered.map((x) => <MktCard key={x.symbol} q={x} />)}
          </div>
          {filtered.length === 0 && <p className="muted" style={{ textAlign: 'center', marginTop: 30 }}>No pairs match your search.</p>}

          <p className="muted" style={{ fontSize: 11.5, marginTop: 24, textAlign: 'center' }}>
            Metals &amp; crypto: gold-api.com (real-time). FX: frankfurter.app (ECB reference). Indicative prices for journaling — not tradable quotes.
          </p>
        </>
      )}
    </>
  )
}

function GoldHero({ q }: { q: Quote }) {
  const p = useCountUp(q.price, 700)
  const up = q.changePct >= 0
  return (
    <div className="mkt-hero">
      <span className="mkt-hero-glow" aria-hidden="true" />
      <div className="mkt-hero-left">
        <div className="mkt-hero-tag"><span className="live-dot" /> LIVE · GOLD</div>
        <div className="mkt-hero-sym">XAU/USD</div>
      </div>
      <div className="mkt-hero-right">
        <div className="mkt-hero-price">{fmtPrice(p, q.decimals)}</div>
        <div className="mkt-foot" style={{ justifyContent: 'flex-end' }}>
          <span className={'pill ' + (up ? 'up' : 'down')}>{fmtChg(q.changePct)}</span>
          <span className={'bias ' + (q.bias === 'Bullish' ? 'bull' : q.bias === 'Bearish' ? 'bear' : 'neu')}>
            <span className="bdot" />{q.bias}
          </span>
        </div>
      </div>
    </div>
  )
}

function MktCard({ q }: { q: Quote }) {
  const up = q.changePct >= 0
  return (
    <div className="mkt-card">
      <div className="mkt-sym">{q.compact}</div>
      <div className="mkt-price">{fmtPrice(q.price, q.decimals)}</div>
      <div className="mkt-foot">
        <span className={'pill ' + (up ? 'up' : 'down')}>{fmtChg(q.changePct)}</span>
        <span className={'bias ' + (q.bias === 'Bullish' ? 'bull' : q.bias === 'Bearish' ? 'bear' : 'neu')}>
          <span className="bdot" />{q.bias}
        </span>
      </div>
    </div>
  )
}
