import { fmtMoney, fmtNum, instrumentLabel, displayDirection } from '../util'
import { tradeR, netPnlOf, tradeDate } from '../stats'
import type { Trade } from '../types'
import { Modal } from './Modal'
import { format } from 'date-fns'

// Read-only trade detail sheet — tap a trade row anywhere to inspect it.
// Big net P/L up top, then the facts, checklist snapshot, notes and charts.
export function TradeDetail({
  trade,
  currency,
  onClose,
  onEdit,
  onDelete,
}: {
  trade: Trade
  currency: string
  onClose: () => void
  onEdit: (t: Trade) => void
  onDelete: (t: Trade) => void
}) {
  const t = trade
  const net = netPnlOf(t)
  const r = tradeR(t)
  const isIndia = t.market === 'india'
  const seg = t.segment ?? 'equity'

  const size = (() => {
    if (isIndia) {
      if (seg === 'options' || seg === 'futures' || seg === 'commodity') {
        if (t.lots == null) return undefined
        return `${t.lots} lot${t.lots === 1 ? '' : 's'}${t.lotSize != null ? ` × ${t.lotSize}` : ''}`
      }
      if (t.lots != null) return `${t.lots} shares`
    }
    if (t.lotSize != null) return `${fmtNum(t.lotSize, 0)} units`
    return undefined
  })()

  const facts: { k: string; v: string }[] = [
    { k: 'Date', v: format(tradeDate(t), 'dd MMM yyyy') },
    ...(t.time ? [{ k: 'Time', v: t.time }] : []),
    { k: 'Direction', v: displayDirection(t) === 'long' ? '▲ Long' : '▼ Short' },
    ...(t.entryPrice != null ? [{ k: 'Entry', v: fmtNum(t.entryPrice, 2) }] : []),
    ...(t.exitPrice != null ? [{ k: 'Exit', v: fmtNum(t.exitPrice, 2) }] : []),
    ...(t.stopLoss != null ? [{ k: 'Stop loss', v: fmtNum(t.stopLoss, 2) }] : []),
    ...(t.takeProfit != null ? [{ k: 'Target', v: fmtNum(t.takeProfit, 2) }] : []),
    ...(size ? [{ k: 'Size', v: size }] : []),
    ...(t.riskReward != null ? [{ k: 'Planned R:R', v: `1 : ${fmtNum(t.riskReward, 2)}` }] : []),
    { k: 'Session', v: (t.session ?? '').charAt(0).toUpperCase() + (t.session ?? '').slice(1) },
    ...(t.strategy ? [{ k: 'Strategy', v: t.strategy }] : []),
    ...(isIndia ? [{ k: 'Segment', v: seg.charAt(0).toUpperCase() + seg.slice(1) }] : []),
    ...(t.optionType ? [{ k: 'Type', v: `${t.strike ?? ''}${t.optionType}`.trim() }] : []),
    ...(t.expiry ? [{ k: 'Expiry', v: format(new Date(t.expiry), 'dd MMM yy') }] : []),
    ...(t.rating ? [{ k: 'Execution', v: '★'.repeat(t.rating) }] : []),
    ...(t.emotion ? [{ k: 'Emotion', v: t.emotion }] : []),
    ...(t.pips != null ? [{ k: 'Pips', v: fmtNum(t.pips, 1) }] : []),
  ]

  const shots = [...(t.screenshots ?? []), ...(t.screenshot ? [t.screenshot] : [])]
  const clItems = t.checklists.flatMap((c) => c.items)
  const clPct = clItems.length ? Math.round((clItems.filter((i) => i.checked).length / clItems.length) * 100) : null

  return (
    <Modal
      variant="sheet"
      title={`#${t.serial ?? '—'} · ${instrumentLabel(t)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn danger" onClick={() => onDelete(t)}>Delete</button>
          <button className="btn primary" onClick={() => onEdit(t)}>✎ Edit</button>
        </>
      }
    >
      {/* Hero — the number that matters */}
      <div className="detail-hero">
        <div>
          <div className={'detail-pnl ' + (net > 0 ? 'pos' : net < 0 ? 'neg' : '')}>
            {t.pnl != null || t.grossPnl != null ? fmtMoney(net, currency) : '—'}
          </div>
          <div className="detail-sub">
            <span className={'badge ' + t.outcome}>{t.outcome}</span>
            {r != null && <span className={'detail-r ' + (r >= 0 ? 'pos' : 'neg')}>{fmtNum(r, 2)}R</span>}
          </div>
        </div>
        {isIndia && (t.grossPnl != null || t.brokerage != null || t.taxes != null) && (
          <div className="detail-costs">
            {t.grossPnl != null && <span>Gross <strong>{fmtMoney(t.grossPnl, currency)}</strong></span>}
            {t.brokerage != null && <span>− brokerage <strong>{fmtMoney(t.brokerage, currency)}</strong></span>}
            {t.taxes != null && <span>− taxes <strong>{fmtMoney(t.taxes, currency)}</strong></span>}
          </div>
        )}
      </div>

      {/* Facts grid */}
      <div className="detail-facts">
        {facts.map((f) => (
          <div className="detail-fact" key={f.k}>
            <div className="k">{f.k}</div>
            <div className="v">{f.v}</div>
          </div>
        ))}
      </div>

      {(t.tags ?? []).length > 0 && (
        <div className="chips" style={{ marginTop: 16 }}>
          {(t.tags ?? []).map((tag) => <span className="chip" key={tag}>{tag}</span>)}
        </div>
      )}

      {clItems.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>{t.checklists[0].checklistName}</strong>
            {clPct != null && <span className="muted" style={{ fontSize: 13 }}>{clPct}%</span>}
          </div>
          {clItems.map((it) => (
            <div className="check-row" key={it.itemId} style={{ cursor: 'default' }}>
              <div className={'checkbox' + (it.checked ? ' checked' : '')}>{it.checked ? '✓' : ''}</div>
              <span style={{ flex: 1, color: it.checked ? 'var(--text)' : 'var(--text-faint)' }}>{it.text}</span>
            </div>
          ))}
        </div>
      )}

      {t.notes && <p className="detail-notes">{t.notes}</p>}

      {shots.length > 0 && (
        <div className="detail-shots">
          {shots.map((s, i) => <img key={i} src={s} alt={'chart ' + (i + 1)} loading="lazy" />)}
        </div>
      )}
    </Modal>
  )
}
