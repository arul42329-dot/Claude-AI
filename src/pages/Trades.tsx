import { useMemo, useState } from 'react'
import { db } from '../db'
import { useLiveQuery, fmtMoney, fmtNum, instrumentLabel } from '../util'
import { useAccountScope, scopeTrades } from '../accounts'
import { useAppMode, marketOf } from '../mode'
import type { Trade } from '../types'
import { TradeForm } from '../components/TradeForm'
import { useToast } from '../components/Toast'
import { IndiaFlag } from '../components/Icons'
import { format } from 'date-fns'
import { tradeDate } from '../stats'

// Number of screenshots attached to a trade (new multi-image + legacy single).
function shotCount(t: Trade): number {
  return (t.screenshots?.length ?? 0) + (t.screenshot ? 1 : 0)
}

export default function Trades() {
  const allTradesRaw = useLiveQuery(() => db.trades.toArray(), [], [])
  const { mode } = useAppMode()
  const allTrades = (allTradesRaw ?? []).filter((t) => marketOf(t) === mode)
  const { accounts, activeId, account, currency } = useAccountScope()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Trade | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [outcome, setOutcome] = useState('all')
  const toast = useToast()

  const trades = scopeTrades(allTrades ?? [], activeId)
  const showAccountCol = activeId === 'all' && accounts.length > 1
  const acctMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const scopeName = activeId === 'all' ? 'All accounts' : account?.name ?? 'Account'

  const filtered = useMemo(() => {
    let list = [...trades]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTrades, activeId, search, outcome])

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
          <h1>Trades{mode === 'india' && <span className="mode-badge"><IndiaFlag size={13} /> India</span>}</h1>
          <p>{scopeName} · {trades.length} logged</p>
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
                {showAccountCol && <th>Account</th>}
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
                    {showAccountCol && (
                      <td>
                        <span className="acct-tag">
                          <span className="acct-dot sm" style={{ background: acctMap.get(t.accountId ?? '')?.color || 'var(--text-faint)' }} />
                          {acctMap.get(t.accountId ?? '')?.name ?? '—'}
                        </span>
                      </td>
                    )}
                    <td>{format(tradeDate(t), 'dd MMM yy')}</td>
                    <td><strong>{instrumentLabel(t)}</strong>{shotCount(t) > 0 && <span className="shot-mark" title={`${shotCount(t)} screenshot${shotCount(t) === 1 ? '' : 's'}`}>📷 {shotCount(t)}</span>}</td>
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
