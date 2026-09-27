import { Modal } from './Modal'
import { tradeCall } from '../bias'
import type { Quote } from '../market'

function fmt(n: number, d: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
}
function fmtChg(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

// Tap-to-open Step-4 panel: full rule-based bias breakdown, support/resistance,
// reversal watch and a daily-timeframe trade call.
export function BiasPanel({ q, onClose }: { q: Quote; onClose: () => void }) {
  const d = q.biasDetail
  const dec = q.decimals

  return (
    <Modal title={`${q.symbol} · Daily Bias`} onClose={onClose}
      footer={<span className="muted" style={{ fontSize: 11.5 }}>Rule-based · daily timeframe · educational, not financial advice.</span>}>
      {!d ? (
        <div className="empty" style={{ border: 'none' }}>
          <div className="big">📊</div>
          <p>The detailed breakdown needs daily candles, which aren’t available in this view.</p>
          <p className="muted" style={{ fontSize: 13 }}>Candle data loads natively in the installed app (APK/desktop). Showing the day-change bias only for now.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="bp-summary">
            <div>
              <div className="bp-price">{fmt(q.price, dec)}</div>
              <span className={'pill ' + (q.changePct >= 0 ? 'up' : 'down')}>{fmtChg(q.changePct)} today</span>
            </div>
            <div className="bp-verdict">
              <span className={'bias ' + (d.label === 'Bullish' ? 'bull' : d.label === 'Bearish' ? 'bear' : 'neu')}>
                <span className="bdot" />{d.label}
              </span>
              <div className="bp-score">Score {d.score >= 0 ? '+' : ''}{d.score} <span className="muted">/ ±5</span></div>
            </div>
          </div>

          {/* Score meter */}
          <div className="bp-meter" aria-hidden="true">
            {[-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].map((n) => {
              const active = d.score < 0 ? n < 0 && n >= d.score : d.score > 0 ? n > 0 && n <= d.score : false
              return <span key={n} className={'bp-seg ' + (n < 0 ? 'neg' : 'pos') + (active ? ' on' : '')} />
            })}
          </div>

          {/* Votes */}
          <h4 className="bp-h">Signal votes</h4>
          <div className="bp-votes">
            {d.votes.map((v) => (
              <div key={v.name} className="bp-vote">
                <span className={'bp-vic ' + (v.value > 0 ? 'pos' : v.value < 0 ? 'neg' : 'neu')}>
                  {v.value > 0 ? '↑' : v.value < 0 ? '↓' : '–'}
                </span>
                <span className="bp-vname">{v.name}</span>
                <span className="bp-vdetail muted">{v.detail}</span>
              </div>
            ))}
          </div>

          {/* Indicators */}
          <h4 className="bp-h">Indicators</h4>
          <div className="bp-grid">
            <Metric label="EMA 20" value={fmt(d.ema20, dec)} />
            <Metric label="EMA 50" value={fmt(d.ema50, dec)} />
            <Metric label="RSI (14)" value={d.rsi.toFixed(1)} />
            <Metric label="MACD hist" value={d.macdHist.toFixed(dec > 2 ? 5 : 2)} />
            <Metric label="ATR (14)" value={fmt(d.atr, dec)} />
            <Metric label="Structure" value={d.structure} />
          </div>

          {/* Support / Resistance */}
          <h4 className="bp-h">Support &amp; resistance</h4>
          <div className="bp-sr">
            <div className="bp-sr-col">
              <div className="bp-sr-lab res">Resistance</div>
              {d.resistance.length ? d.resistance.map((r, i) => <div key={i} className="bp-sr-val res">{fmt(r, dec)}</div>)
                : <div className="bp-sr-val muted">—</div>}
            </div>
            <div className="bp-sr-col">
              <div className="bp-sr-lab sup">Support</div>
              {d.support.length ? d.support.map((s, i) => <div key={i} className="bp-sr-val sup">{fmt(s, dec)}</div>)
                : <div className="bp-sr-val muted">—</div>}
            </div>
          </div>

          {/* Reversal watch */}
          {d.reversal && (
            <div className={'bp-flag ' + (d.reversal.startsWith('Bullish') ? 'bull' : 'bear')}>
              ⚠ {d.reversal}
            </div>
          )}

          {/* Trade call */}
          <h4 className="bp-h">Trade call</h4>
          <TradeCallBox q={q} />
        </>
      )}
    </Modal>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bp-metric">
      <div className="bp-metric-lab">{label}</div>
      <div className="bp-metric-val">{value}</div>
    </div>
  )
}

function TradeCallBox({ q }: { q: Quote }) {
  const d = q.biasDetail!
  const dec = q.decimals
  // The Markets tab is a daily-timeframe view, so the "viewed" bias equals the
  // daily bias — the call fires when the daily bias is directional.
  const call = tradeCall(d, d.label, q.price)

  if (call.action === 'No trade') {
    return (
      <div className="bp-trade none">
        <div className="bp-trade-head">No trade — wait</div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{call.reason}</p>
      </div>
    )
  }

  const long = call.action === 'Long'
  const risk = Math.abs(call.entry! - call.stop!)
  return (
    <div className={'bp-trade ' + (long ? 'long' : 'short')}>
      <div className="bp-trade-head">{long ? '▲ Long setup' : '▼ Short setup'}</div>
      <div className="bp-trade-rows">
        <TRow label="Entry" value={fmt(call.entry!, dec)} />
        <TRow label="Stop-loss" value={fmt(call.stop!, dec)} sub="1.5× ATR" tone="neg" />
        <TRow label="Target 1" value={fmt(call.target1!, dec)} sub={`1.5× ATR · 1:1`} tone="pos" />
        <TRow label="Target 2" value={fmt(call.target2!, dec)} sub={`3× ATR · 1:2`} tone="pos" />
      </div>
      <p className="muted" style={{ margin: '10px 0 0', fontSize: 12 }}>
        Risk ≈ {fmt(risk, dec)} per unit. {call.reason}
      </p>
    </div>
  )
}

function TRow({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="bp-trow">
      <span className="bp-trow-lab">{label}{sub && <span className="muted"> · {sub}</span>}</span>
      <span className={'bp-trow-val' + (tone ? ' ' + tone : '')}>{value}</span>
    </div>
  )
}
