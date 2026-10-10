import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchIndia, readCachedIndia, nseStatus, type IndiaQuote, type IndiaSnapshot } from '../india'
import { fetchIndiaNews, readCachedIndiaNews, type NewsSnapshot } from '../indiaNews'
import { fetchGlobal, readCachedGlobal, GLOBAL_SYMBOLS, type GlobalSnapshot } from '../premarket'
import { fetchAngelLtps, angelLinked } from '../angel'
import { computeBias, type BiasResult } from '../bias'
import { corsFetch, yfDirectUrl, isNativePlatform } from '../candles'
import { BiasPanel } from './BiasPanel'
import type { Candle } from '../bias'

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

// Self-ticking "x ago" label. The whole page used to re-render every second
// for these — now only this tiny component does (one big jank source gone).
function TimeAgo({ ts }: { ts: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <>{timeAgo(ts)}</>
}

export function IndiaMarkets({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [snap, setSnap] = useState<IndiaSnapshot | null>(() => readCachedIndia())
  const [news, setNews] = useState<NewsSnapshot | null>(() => readCachedIndiaNews())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<IndiaQuote | null>(null)
  const [global, setGlobal] = useState<GlobalSnapshot | null>(() => readCachedGlobal())
  const [pmOpen, setPmOpen] = useState(false)
  const [ltps, setLtps] = useState<Record<string, { ltp: number; changePct?: number }>>({})
  const [bias15, setBias15] = useState<Record<string, string>>({})
  const [commodityDetail, setCommodityDetail] = useState<Record<string, BiasResult | null>>({})

  // Prices refresh fast (~5s); news is slow-moving so it loads on mount and only
  // every few minutes — otherwise the headline times would reset every 5s.
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
  }, [])

  const loadNews = useCallback(() => {
    fetchIndiaNews().then(setNews).catch(() => { /* keep last cached news */ })
  }, [])

  useEffect(() => {
    load()
    loadNews()
    const id = window.setInterval(load, 5000) // live-ish auto refresh (~5s)
    const newsId = window.setInterval(loadNews, 180000) // news every 3 min
    // Pre-market dashboard (USD/INR, US indices, commodities) — every 15s.
    const loadGlobal = () => { fetchGlobal().then(setGlobal).catch(() => {}) }
    loadGlobal()
    const gid = window.setInterval(loadGlobal, 15000)
    // Angel One live LTPs (tick-like) when linked — every 3s.
    const loadLtps = () => {
      if (angelLinked() && isNativePlatform()) fetchAngelLtps().then(setLtps).catch(() => {})
      else setLtps({})
    }
    loadLtps()
    const lid = window.setInterval(loadLtps, 3000)
    // 15-minute bias for the index tiles (60s refresh).
    const loadBias15 = () => {
      fetchIndia().then((s) => {
        const out: Record<string, string> = {}
        void Promise.all(s.quotes.map(async (q) => {
          const c = await fetch15m(q.ySymbol)
          if (c) { const b = computeBias(c); if (b) out[q.symbol] = b.label }
        })).then(() => setBias15({ ...out }))
      }).catch(() => {})
    }
    loadBias15()
    const bid = window.setInterval(loadBias15, 60000)
    // Commodity panels: prefetch 1y daily candles once (per app session) so
    // tapping CRUDE/GOLD/SILVER/NAT GAS opens the bias panel instantly with
    // full S/R + votes — exactly like the index tiles.
    prefetchCommodityBias().then(setCommodityDetail).catch(() => {})
    const onWake = () => { load(); loadNews(); loadGlobal(); loadLtps(); loadBias15() }
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    return () => {
      window.clearInterval(id)
      window.clearInterval(newsId)
      window.clearInterval(gid)
      window.clearInterval(lid)
      window.clearInterval(bid)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [load, loadNews])

  // Reload when the shared top Refresh button is pressed.
  useEffect(() => { if (refreshSignal) { load(); loadNews() } }, [refreshSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build the full bias quote for a commodity tile (uses the prefetched daily
  // candles so the panel opens with S/R + votes, not the "no data" state).
  function openCommodity(g: { symbol: string; ySymbol: string; price: number; changePct: number; decimals: number }) {
    const def = GLOBAL_SYMBOLS.find((s) => s.symbol === g.symbol)
    const detail = commodityDetail[g.symbol] ?? null
    const arrow = (v: number) => (v > 0 ? '↑' : v < 0 ? '↓' : '–')
    setSelected({
      symbol: g.symbol,
      ySymbol: def?.ySymbol ?? g.ySymbol ?? '',
      price: g.price,
      changePct: g.changePct,
      decimals: g.decimals,
      bias: detail?.label ?? 'Neutral',
      biasDetail: detail ?? undefined,
      biasVotes: detail
        ? [`Daily bias: ${detail.label} (score ${detail.score >= 0 ? '+' : ''}${detail.score})`,
           ...detail.votes.map((v) => `${arrow(v.value)} ${v.name} — ${v.detail}`)]
        : undefined,
    })
  }

  // Merge Angel One live prices into the index quotes (same shape, fresher price).
  const quotes: IndiaQuote[] = (snap?.quotes ?? []).map((q) => {
    const l = ltps[q.symbol]
    if (!l) return q
    return { ...q, price: l.ltp, changePct: l.changePct ?? q.changePct }
  })
  const anyLive = Object.keys(ltps).length > 0
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
        {snap && <span className="muted" style={{ fontSize: 12 }}>Updated <TimeAgo ts={snap.at} /></span>}
      </div>

      {error && quotes.length === 0 && (
        <div className="empty">
          <div className="big">📡</div>
          <p>{navigator.onLine ? 'Could not reach the market feed right now.' : 'You appear to be offline.'}</p>
          <button className="btn primary" onClick={load} disabled={loading}>Try again</button>
        </div>
      )}

      {/* Pre-market check — tucked behind one button so the page stays clean.
          Tap it to expand the global dashboard (GIFT Nifty, INDIA VIX, USD/INR,
          US indices, commodities), tap again to hide it. */}
      {global && global.quotes.some((q) => q.price > 0) && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={'pm-toggle' + (pmOpen ? ' open' : '')}
            onClick={() => setPmOpen((o) => !o)}
            aria-expanded={pmOpen}
          >
            <span className="pm-toggle-title">🧭 Pre-market check</span>
            {anyLive && <span className="chip pm-live"><span className="live-dot" /> LIVE · Angel One</span>}
            <span className="pm-caret" aria-hidden="true">{pmOpen ? '▾' : '▸'}</span>
          </button>
          {pmOpen && (
            <div className="card pm-card">
              <div className="premarket-grid">
                {global.quotes.map((g) => (
                  <div key={g.symbol} className="premarket-row">
                    <span className="premarket-sym">{g.symbol}</span>
                    <span className="premarket-price">
                      {g.price > 0 ? fmtPrice(g.price, g.decimals) : '—'}
                      {g.live && <span className="live-dot" style={{ marginLeft: 6 }} />}
                    </span>
                    <span className={'pill ' + (g.changePct >= 0 ? 'up' : 'down')}>{g.price > 0 ? fmtChg(g.changePct) : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Index prices */}
      {quotes.length > 0 && (
        <>
          {(error || snap?.partial) && (
            <div className="stale-note">
              {error ? 'Showing last saved values — live feed unavailable.' : 'Some indices are temporarily unavailable; showing what we have.'}
            </div>
          )}

          <div className="mkt-grid">
            {quotes.map((x) => (
              <IndiaCard key={x.symbol} q={x} biasOverride={bias15[x.symbol]} live={!!ltps[x.symbol]} onOpen={() => setSelected(x)} />
            ))}
            {(global?.quotes ?? []).filter((g) => ['CRUDE', 'GOLD', 'SILVER', 'NAT GAS'].includes(g.symbol) && g.price > 0).map((g) => {
              const angelName = GLOBAL_SYMBOLS.find((s) => s.symbol === g.symbol)?.angel
              const live = angelName ? ltps[angelName] : undefined
              return (
                <CommodityCard
                  key={g.symbol}
                  g={live ? { ...g, price: live.ltp, changePct: live.changePct ?? g.changePct } : g}
                  ready={commodityDetail[g.symbol] != null}
                  onOpen={() => openCommodity(g)}
                />
              )
            })}
          </div>
        </>
      )}

      {/* Indian market news below the prices (no ForexFactory calendar in India mode) */}
      {news && news.items.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>📰 Market news</h3>
            <span className="muted" style={{ fontSize: 12 }}>Updated <TimeAgo ts={news.at} /></span>
          </div>
          <div className="news-list">
            {news.items.map((n, i) => (
              <a key={i} className="news-item" href={n.link} target="_blank" rel="noopener noreferrer">
                <span className="news-item-title">{n.title}</span>
                <span className="news-item-time"><TimeAgo ts={n.at} /></span>
              </a>
            ))}
          </div>
        </div>
      )}


      {selectedLive && <BiasPanel q={selectedLive} onClose={() => setSelected(null)} />}
    </>
  )
}

// 15-minute candles for the tile bias (60s cache, independent of the panel's).
const cache15 = new Map<string, { at: number; candles: any[] }>()

// Commodity daily candles + bias (prefetched once per session so tiles open
// instantly). MCX names → Yahoo symbols come from GLOBAL_SYMBOLS.
const commodityBiasCache = new Map<string, BiasResult | null>()
async function prefetchCommodityBias(): Promise<Record<string, BiasResult | null>> {
  const out: Record<string, BiasResult | null> = {}
  await Promise.all(
    GLOBAL_SYMBOLS
      .filter((g) => ['CRUDE', 'GOLD', 'SILVER', 'NAT GAS'].includes(g.symbol))
      .map(async (g) => {
        if (commodityBiasCache.has(g.symbol)) {
          out[g.symbol] = commodityBiasCache.get(g.symbol) ?? null
          return
        }
        try {
          const r = await corsFetch(yfDirectUrl(g.ySymbol, '1y'), { timeoutMs: 15000 })
          if (!r.ok) throw new Error('commodity ' + g.symbol)
          const j: any = await r.json()
          const res = j?.chart?.result?.[0]
          const ts: number[] = res?.timestamp || []
          const q = res?.indicators?.quote?.[0] || {}
          const candles: Candle[] = []
          for (let i = 0; i < ts.length; i++) {
            const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
            if ([o, h, l, c].every((v) => Number.isFinite(v))) candles.push({ t: ts[i] * 1000, o, h, l, c })
          }
          const detail = computeBias(candles) ?? null
          commodityBiasCache.set(g.symbol, detail)
          out[g.symbol] = detail
        } catch {
          commodityBiasCache.set(g.symbol, null)
          out[g.symbol] = null
        }
      }),
  )
  return out
}
async function fetch15m(ySymbol: string): Promise<any[] | null> {
  const hit = cache15.get(ySymbol)
  if (hit && Date.now() - hit.at < 60000) return hit.candles
  try {
    const r = await corsFetch(yfDirectUrl(ySymbol, '5d', '15m'), { timeoutMs: 12000 })
    if (!r.ok) return hit ? hit.candles : null
    const j: any = await r.json()
    const res = j?.chart?.result?.[0]
    const ts: number[] = res?.timestamp || []
    const q = res?.indicators?.quote?.[0] || {}
    const candles: any[] = []
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
      if ([o, h, l, c].every((v) => Number.isFinite(v))) candles.push({ t: ts[i] * 1000, o, h, l, c })
    }
    if (candles.length) { cache15.set(ySymbol, { at: Date.now(), candles }); return candles }
  } catch { /* fall back to cache */ }
  return hit ? hit.candles : null
}

function IndiaCard({ q, biasOverride, live, onOpen }: { q: IndiaQuote; biasOverride?: string; live?: boolean; onOpen?: () => void }) {
  const up = q.changePct >= 0
  const b = biasOverride || q.bias // the tile shows the 15-minute read
  return (
    <div className="mkt-card mkt-clickable india" role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}>
      <div className="mkt-sym">
        {q.symbol}{live && <span className="live-dot" style={{ marginLeft: 6 }} />}
        <span className="mkt-chev" aria-hidden="true">›</span>
      </div>
      <div className="mkt-price">{fmtPrice(q.price, q.decimals)}</div>
      <div className="mkt-foot">
        <span className={'pill ' + (up ? 'up' : 'down')}>{fmtChg(q.changePct)}</span>
        <span className={'bias ' + (b === 'Bullish' ? 'bull' : b === 'Bearish' ? 'bear' : 'neu')} title={'15-minute bias: ' + b + (q.biasVotes ? '\n\nDaily bias: ' + q.bias + '\n' + q.biasVotes.join('\n') : '')}>
          <span className="bdot" />{b}
        </span>
      </div>
    </div>
  )
}

function CommodityCard({ g, ready, onOpen }: {
  g: { symbol: string; price: number; changePct: number; decimals: number; live: boolean; ySymbol?: string }
  ready?: boolean
  onOpen?: () => void
}) {
  const up = g.changePct >= 0
  return (
    <div
      className="mkt-card mkt-clickable india"
      role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
      title={g.live ? 'Live MCX price (Angel One) — tap for the bias panel' : 'Delayed price (Yahoo) — tap for the bias panel'}
    >
      <div className="mkt-sym">
        {g.symbol}{g.live && <span className="live-dot" style={{ marginLeft: 6 }} />}
        <span className="mkt-chev" aria-hidden="true">›</span>
      </div>
      <div className="mkt-price">{fmtPrice(g.price, g.decimals)}</div>
      <div className="mkt-foot">
        <span className={'pill ' + (up ? 'up' : 'down')}>{fmtChg(g.changePct)}</span>
        <span className="bias neu"><span className="bdot" />{ready ? 'MCX' : '…'}</span>
      </div>
    </div>
  )
}
