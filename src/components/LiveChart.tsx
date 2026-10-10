// Live chart — 5-minute candles with an automatically drawn trend line and
// breakout alerts.
//
// * Candles: Angel One's historical API first (linked users), with Yahoo's
//   5-minute chart as the fallback — SmartAPI's history often returns nothing
//   for INDEX tokens, and the chart must always draw.
// * The live price is polled every ~3s through the same Angel LTP call the
//   Markets tiles use (known-good on device) and updates the forming candle,
//   the price line and the live dot.
// * The trend line is a least-squares fit over the last 60 CLOSED candles
//   (≈ the last 5 hours) — no configuration, it redraws itself.
// * A breakout is when the live price crosses the trend line by more than
//   0.05% (noise buffer). Each crossing fires ONE phone notification (and a
//   flash inside the chart); crossing back fires again in the other
//   direction. Watching runs while the chart is open.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { fetchAngelCandles, fetchAngelLtps, angelIndexToken, type AngelCandle } from '../angel'
import { corsFetch, yfDirectUrl, isNativePlatform } from '../candles'

const CANDLE_MS = 5 * 60 * 1000
const TREND_WINDOW = 60 // closed candles used for the trend fit
const SHOW_N = 96 // candles drawn (~8 hours)
const BREAKOUT_PCT = 0.05 // % of price — the noise buffer for breakouts
const CHART_H = 232
const VOL_H = 34
const PAD_L = 6
const PAD_R = 56
const PAD_T = 10

function fmt(n: number, d = 2) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
}
function hhmm(t: number) {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Yahoo 5-minute candles (with range retries — some symbols return an empty
// array for one range but work for the next).
async function yahoo5m(ySymbol: string): Promise<AngelCandle[]> {
  if (!ySymbol) return []
  for (const range of ['5d', '1mo', '7d']) {
    try {
      const r = await corsFetch(yfDirectUrl(ySymbol, range, '5m'), { timeoutMs: 15000 })
      if (!r.ok) continue
      const j: any = await r.json()
      const res = j?.chart?.result?.[0]
      const ts: number[] = res?.timestamp || []
      const q = res?.indicators?.quote?.[0] || {}
      const out: AngelCandle[] = []
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
        if ([o, h, l, c].every((v) => Number.isFinite(v))) out.push({ t: ts[i] * 1000, o, h, l, c, v: Number(q.volume?.[i]) || 0 })
      }
      if (out.length >= 2) return out.slice(-160)
    } catch { /* try the next range */ }
  }
  return []
}

export interface Trend {
  slope: number // price change per candle
  intercept: number // value at regression x = 0
  startIdx: number // candle index the fit starts at
  at: (i: number) => number // trend value at (fractional) candle index
}

// Least-squares fit of close over the last `win` closed candles.
export function fitTrend(candles: AngelCandle[]): Trend | null {
  const closed = candles.slice(0, -1)
  if (closed.length < 12) return null
  const ys = closed.slice(-TREND_WINDOW).map((c) => c.c)
  const n = ys.length
  const startIdx = closed.length - n
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) {
    sx += i; sy += ys[i]; sxy += i * ys[i]; sxx += i * i
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return null
  const slope = (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { slope, intercept, startIdx, at: (i) => intercept + slope * (i - startIdx) }
}

export function LiveChart({
  symbol,
  ySymbol,
  token,
  onClose,
}: {
  symbol: string
  ySymbol?: string
  token: { exchange: string; token: string }
  onClose: () => void
}) {
  const [candles, setCandles] = useState<AngelCandle[] | null>(null)
  const [ltp, setLtp] = useState<number | null>(null)
  const [chgPct, setChgPct] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; at: number; price: number } | null>(null)
  const sideRef = useRef<'above' | 'below' | null>(null)
  const [w, setW] = useState(340)

  // ---- size the SVG to its container (callback ref fires when it mounts) ----
  const boxEl = useRef<HTMLDivElement | null>(null)
  const boxRef = useCallback((el: HTMLDivElement | null) => {
    boxEl.current = el
    if (el) setW(Math.max(280, el.clientWidth))
  }, [])
  useEffect(() => {
    const measure = () => { if (boxEl.current) setW(Math.max(280, boxEl.current.clientWidth)) }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // ---- candles (initial + every 60s): Angel history first, Yahoo fallback ----
  useEffect(() => {
    let alive = true
    const load = async () => {
      let cs: AngelCandle[] = []
      try {
        const to = new Date()
        const from = new Date(to.getTime() - 4 * 24 * 3600 * 1000) // ~2-3 trading days
        cs = await fetchAngelCandles(token, 'FIVE_MINUTE', from, to)
      } catch { /* Angel history unavailable — fall back */ }
      if (!alive) return
      if (cs.length < 2) cs = await yahoo5m(ySymbol || '')
      if (!alive) return
      if (cs.length < 2) { setError('No candle data for ' + symbol); return }
      setError(null)
      setCandles(cs.slice(-160))
      // re-anchor the breakout side to the (possibly moved) line — silently
      sideRef.current = null
    }
    load()
    const id = window.setInterval(load, 60000)
    return () => { alive = false; window.clearInterval(id) }
  }, [symbol, ySymbol, token.exchange, token.token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- live LTP (every 3s) + breakout watch ----
  const trend = useMemo(() => (candles ? fitTrend(candles) : null), [candles])
  // Refs for the poller: it must NOT depend on candle/ltp state (it updates
  // them), or each tick would re-arm the effect into a hot loop.
  const candlesRef = useRef<AngelCandle[] | null>(null)
  const trendRef = useRef<Trend | null>(null)
  candlesRef.current = candles
  trendRef.current = trend

  useEffect(() => {
    const poll = async () => {
      const trend = trendRef.current
      const candles = candlesRef.current
      if (!trend || !candles) return
      try {
        // the same LTP call the Markets tiles use — the known-good path
        const ltps = await fetchAngelLtps()
        const row = ltps[symbol] ?? (angelIndexToken(symbol) ? ltps[angelIndexToken(symbol)!.ocName] : undefined)
        const price = Number(row?.ltp)
        if (!Number.isFinite(price) || price <= 0) return
        setLtp(price)
        if (row?.changePct != null) setChgPct(row.changePct)
        // update the forming candle so the chart itself moves
        setCandles((cs) => {
          if (!cs || !cs.length) return cs
          const out = cs.slice()
          const last = { ...out[out.length - 1] }
          const bucket = Math.floor(Date.now() / CANDLE_MS) * CANDLE_MS
          if (last.t === bucket) {
            last.c = price
            last.h = Math.max(last.h, price)
            last.l = Math.min(last.l, price)
            out[out.length - 1] = last
          } else if (bucket > last.t) {
            out[out.length - 1] = { t: bucket, o: price, h: price, l: price, c: price, v: 0 }
          }
          return out
        })
        // ---- breakout watch: live price vs the trend line at "now" ----
        const xNow = Math.max(0, candles.length - 1.5)
        const line = trend.at(xNow)
        if (!Number.isFinite(line)) return
        const buffer = Math.max(price * (BREAKOUT_PCT / 100), 0.05)
        const side = price > line + buffer ? 'above' : price < line - buffer ? 'below' : null
        const prev = sideRef.current
        if (side && prev && side !== prev) fireBreakout(side, price, line)
        if (side) sideRef.current = side
        else if (prev == null) sideRef.current = price >= line ? 'above' : 'below'
      } catch { /* transient — keep last price */ }
    }
    const fireBreakout = (side: 'above' | 'below', price: number, line: number) => {
      setFlash({ dir: side === 'above' ? 'up' : 'down', at: Date.now(), price })
      if (isNativePlatform()) {
        import('@capacitor/local-notifications')
          .then(({ LocalNotifications }) => LocalNotifications.schedule({
            notifications: [{
              id: 902000001,
              title: side === 'above' ? `🚀 ${symbol} breakout ▲` : `💥 ${symbol} breakdown ▼`,
              body: side === 'above'
                ? `Price ${fmt(price)} crossed ABOVE the 5-min trend line (${fmt(line)}) — breakout.`
                : `Price ${fmt(price)} broke BELOW the 5-min trend line (${fmt(line)}) — breakdown.`,
              schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
            }],
          }))
          .catch(() => { /* notification failed — the in-app flash still shows */ })
      }
    }
    poll()
    const id = window.setInterval(poll, 3000)
    return () => window.clearInterval(id)
  }, [symbol, token.exchange, token.token]) // eslint-disable-line react-hooks/exhaustive-deps

  // clear the flash banner after a while
  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 12000)
    return () => window.clearTimeout(id)
  }, [flash])

  const price = ltp ?? (candles?.length ? candles[candles.length - 1].c : null)

  return (
    <Modal title={`${symbol} · Live chart`} onClose={onClose}
      footer={<span className="muted" style={{ fontSize: 11.5 }}>5-min candles · trend auto-fit over the last {TREND_WINDOW} closed candles · breakout alerts while this chart is open.</span>}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <span className="lc-price">{price != null ? fmt(price) : '…'}</span>
          {chgPct != null && (
            <span className={'pill ' + (chgPct >= 0 ? 'up' : 'down')} style={{ marginLeft: 10 }}>{chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%</span>
          )}
        </div>
        {ltp != null && <span className="chip" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}><span className="live-dot" /> LIVE</span>}
      </div>

      {flash && (
        <div className={'lc-flash ' + flash.dir}>
          {flash.dir === 'up' ? '▲ BREAKOUT above trend' : '▼ BREAKDOWN below trend'} · {fmt(flash.price)}
        </div>
      )}

      {error ? (
        <div className="empty" style={{ border: 'none' }}>
          <div className="big">📉</div>
          <p>{error}</p>
        </div>
      ) : !candles ? (
        <div className="empty" style={{ border: 'none' }}><div className="big">⏳</div><p>Loading candles…</p></div>
      ) : (
        <div ref={boxRef} className="lc-box">
          <ChartSvg w={w} candles={candles} trend={trend} price={price} />
        </div>
      )}

      {trend && candles && (
        <div className="lc-legend muted">
          <span>Trend {trend.slope > 0 ? '▲ rising' : trend.slope < 0 ? '▼ falling' : '– flat'} {Math.abs(trend.slope * TREND_WINDOW).toFixed(0)} pts / 5h</span>
          <span>·</span>
          <span>breakout buffer ±{BREAKOUT_PCT}%</span>
        </div>
      )}
    </Modal>
  )
}

function ChartSvg({ w, candles, trend, price }: {
  w: number
  candles: AngelCandle[]
  trend: Trend | null
  price: number | null
}) {
  const shown = candles.slice(-SHOW_N)
  const offset = candles.length - shown.length
  const plotW = w - PAD_L - PAD_R
  const totalH = CHART_H + VOL_H + 18

  if (shown.length < 2) return null

  // y-domain: candle bodies + trendline + live price, padded 8%
  let lo = Infinity, hi = -Infinity
  for (const c of shown) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h) }
  if (trend) {
    const end = candles.length - 1.5
    for (let i = Math.max(trend.startIdx - offset, 0); i <= end; i += 4) {
      const v = trend.at(i)
      if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
    }
  }
  if (price != null) { lo = Math.min(lo, price); hi = Math.max(hi, price) }
  const pad = (hi - lo) * 0.08 || 1
  lo -= pad; hi += pad

  const x = (i: number) => PAD_L + ((i - offset) / Math.max(1, SHOW_N - 1)) * plotW
  const y = (p: number) => PAD_T + (1 - (p - lo) / (hi - lo)) * (CHART_H - 2 * PAD_T)
  const cw = Math.max(2, (plotW / SHOW_N) * 0.62)
  const maxVol = Math.max(1, ...shown.map((c) => c.v))

  // grid + price labels (5 lines)
  const lines: number[] = []
  for (let i = 0; i <= 4; i++) lines.push(lo + ((hi - lo) * i) / 4)

  const trendPts: [number, number][] = []
  if (trend) {
    const i0 = Math.max(trend.startIdx, offset)
    const i1 = candles.length - 1.5
    const v0 = trend.at(i0), v1 = trend.at(i1)
    if (Number.isFinite(v0) && Number.isFinite(v1)) trendPts.push([x(i0), y(v0)], [x(i1), y(v1)])
  }

  const lastC = shown[shown.length - 1]
  const liveX = x(candles.length - 1.5)

  return (
    <svg width={w} height={totalH} className="lc-svg" role="img" aria-label="live candle chart">
      {lines.map((p, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={w - PAD_R} y1={y(p)} y2={y(p)} className="lc-grid" />
          <text x={w - PAD_R + 4} y={y(p) + 3} className="lc-axis">{fmt(p, 0)}</text>
        </g>
      ))}

      {shown.map((c, i) => {
        const idx = offset + i
        const up = c.c >= c.o
        const stroke = up ? 'var(--green)' : 'var(--red)'
        const yO = y(c.o), yC = y(c.c)
        const top = Math.min(yO, yC)
        const h = Math.max(1, Math.abs(yC - yO))
        return (
          <g key={c.t}>
            <line x1={x(idx)} x2={x(idx)} y1={y(c.h)} y2={y(c.l)} stroke={stroke} strokeWidth={1} opacity={0.85} />
            <rect x={x(idx) - cw / 2} y={top} width={cw} height={h} fill={stroke} opacity={up ? 0.9 : 0.9} rx={0.5} />
            <rect
              x={x(idx) - cw / 2} y={CHART_H + 4 + (1 - c.v / maxVol) * (VOL_H - 6)}
              width={cw} height={Math.max(0.5, (c.v / maxVol) * (VOL_H - 6))}
              fill={stroke} opacity={0.35}
            />
            {(i === 0 || (idx - offset) % 18 === 0) && (
              <text x={x(idx)} y={totalH - 3} className="lc-axis" textAnchor="middle">{hhmm(c.t)}</text>
            )}
          </g>
        )
      })}

      {trendPts.length === 2 && (
        <>
          <line x1={trendPts[0][0]} y1={trendPts[0][1]} x2={trendPts[1][0]} y2={trendPts[1][1]} className="lc-trend" />
          <circle cx={trendPts[1][0]} cy={trendPts[1][1]} r={3} className="lc-trend-dot" />
        </>
      )}

      {price != null && (
        <>
          <line x1={PAD_L} x2={w - PAD_R} y1={y(price)} y2={y(price)} className="lc-live" />
          <rect x={w - PAD_R + 1} y={y(price) - 8} width={PAD_R - 3} height={16} rx={3} className="lc-live-tag" />
          <text x={w - PAD_R + 4} y={y(price) + 4} className="lc-live-txt">{fmt(price, 0)}</text>
          <circle cx={liveX} cy={y(lastC.c)} r={3.5} className="lc-live-dot" />
        </>
      )}
    </svg>
  )
}
