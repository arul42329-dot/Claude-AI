import { useMemo, useState } from 'react'
import { db } from '../db'
import { useLiveQuery, fmtMoney, fmtNum } from '../util'
import type { Trade } from '../types'
import { TradeForm } from '../components/TradeForm'
import { useToast } from '../components/Toast'
import { getSettings } from '../db'
import { format } from 'date-fns'
import { tradeDate } from '../stats'

export default function Trades() {
  const trades = useLiveQuery(() => db.trades.toArray(), [], [])
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const currency = settings?.accountCurrency ?? 'USD'
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Trade | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [outcome, setOutcome] = useState('all')
  const toast = useToast()

  const filtered = useMemo(() => {
    let list = [...(trades ?? [])]
    if (outcome !== 'all') list = list.filter((t) => t.outcome === outcome)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.pair.toLowerCase().includes(q) ||
          (t.strategy ?? '').toLowerCase().includes(q) ||
          (t.notes ?? '').toLowerCase().includes(q) ||
          (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
      )
    }
    return list.sort((a, b) => tradeDate(b).getTime() - tradeDate(a).getTime())
  }, [trades, search, outcome])

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this trade?')) return
    await db.trades.delete(id)
    toast('Trade deleted')
  }

  function openNew() {
    setEditing(undefined)
    setShowForm(true)
  }
  function openEdit(t: Trade) {
    setEditing(t)
    setShowForm(true)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Trades</h1>
          <p>{trades?.length ?? 0} logged · your full trade journal</p>
        </div>
        <button className="btn primary" onClick={openNew}>＋ New trade</button>
      </div>

      <div className="toolbar">
        <input className="input" style={{ maxWidth: 280 }} placeholder="🔍 Search pair, strategy, tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="seg">
          {['all', 'win', 'loss', 'breakeven', 'open'].map((o) => (
            <button key={o} className={outcome === o ? 'active' : ''} onClick={() => setOutcome(o)}>
              {o[0].toUpperCase() + o.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="big">📝</div>
          <p>No trades to show. Log your first trade to start building your journal.</p>
          <button className="btn primary" onClick={openNew}>＋ New trade</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Pair</th>
                <th>Dir</th>
                <th>Session</th>
                <th>Strategy</th>
                <th>R:R</th>
                <th>Outcome</th>
                <th style={{ textAlign: 'right' }}>P/L</th>
                <th>Checklist</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const items = t.checklists.flatMap((c) => c.items)
                const done = items.filter((i) => i.checked).length
                const pct = items.length ? Math.round((done / items.length) * 100) : null
                return (
                  <tr key={t.id} onClick={() => openEdit(t)}>
                    <td><strong>{t.serial ? '#' + t.serial : '—'}</strong></td>
                    <td>{format(tradeDate(t), 'dd MMM yy')}</td>
                    <td><strong>{t.pair}</strong></td>
                    <td><span className={t.direction === 'long' ? 'dir-buy' : 'dir-sell'}>{t.direction === 'long' ? '▲' : '▼'}</span></td>
                    <td className="muted" style={{ textTransform: 'capitalize' }}>{t.session}</td>
                    <td className="muted">{t.strategy || '—'}</td>
                    <td>{t.riskReward ? fmtNum(t.riskReward, 2) : '—'}</td>
                    <td><span className={'badge ' + t.outcome}>{t.outcome}</span></td>
                    <td style={{ textAlign: 'right' }} className={(t.pnl ?? 0) > 0 ? 'pos' : (t.pnl ?? 0) < 0 ? 'neg' : ''}>
                      {t.pnl != null ? fmtMoney(t.pnl, currency) : '—'}
                    </td>
                    <td className="muted">
                      {t.checklistSerial != null
                        ? <>Chk #{t.checklistSerial}{pct != null ? ` · ${pct}%` : ''}</>
                        : (pct != null ? `${pct}%` : '—')}
                    </td>
                    <td><button className="icon-btn" onClick={(e) => remove(t.id, e)} title="Delete">🗑️</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <TradeForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            toast('Trade saved')
          }}
        />
      )}
    </>
  )
}
