import { useMemo, useState } from 'react'
import { db } from '../db'
import { useLiveQuery, fmtMoney, fmtNum, fmtPct, instrumentLabel, displayDirection } from '../util'
import { useAccountScope, scopeTrades } from '../accounts'
import { useAppMode, marketOf } from '../mode'
import type { Trade } from '../types'
import { TradeForm } from '../components/TradeForm'
import { TradeDetail } from '../components/TradeDetail'
import { useToast } from '../components/Toast'
import { IndiaFlag } from '../components/Icons'
import { format } from 'date-fns'
import { tradeDate, netPnlOf, tradeR } from '../stats'

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
  const [detail, setDetail] = useState<Trade | undefined>(undefined)
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

  // Summary of whatever the current filter/search shows.
  const summary = useMemo(() => {
    const closed = filtered.filter((t) => t.outcome !== 'open')
    const wins = closed.filter((t) => t.outcome === 'win').length
    return {
      count: filtered.length,
      net: filtered.reduce((a, t) => a + netPnlOf(t), 0),
      winRate: closed.length ? (wins / closed.length) * 100 : 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this trade?')) return
    await db.trades.delete(id)
    toast('Trade deleted')
  }

  async function removeTrade(t: Trade) {
    if (!confirm('Delete this trade?')) return
    await db.trades.delete(t.id)
    setDetail(undefined)
    toast('Trade deleted')
  }

  // CSV of the trades currently in view (respects search + outcome filter).
  function exportCsv() {
    const cols = [
      'serial', 'date', 'time', 'market', 'pair', 'segment', 'optionType', 'strike', 'expiry', 'lots',
      'direction', 'session', 'strategy', 'entryPrice', 'exitPrice', 'stopLoss', 'takeProfit', 'lotSize',
      'riskReward', 'outcome', 'pips', 'grossPnl', 'brokerage', 'taxes', 'pnl', 'rMultiple', 'emotion',
      'rating', 'checklistSerial', 'tags', 'notes',
    ]
    const esc = (v: any) => {
      if (v === undefined || v === null) return ''
      const str = Array.isArray(v) ? v.join('; ') : String(v)
      return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str
    }
    const rows = [...filtered]
      .sort((a, b) => (a.serial ?? 0) - (b.serial ?? 0))
      .map((t) =>
        cols
          .map((c) => (c === 'rMultiple' ? esc(tradeR(t) != null ? Math.round(tradeR(t)! * 100) / 100 : '') : esc((t as any)[c])))
          .join(','),
      )
    const csv = [cols.join(','), ...rows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `edgefolio-trades-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(`Exported ${filtered.length} trade${filtered.length === 1 ? '' : 's'}`)
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
        <button className="btn" onClick={exportCsv} title="Export the trades in view as CSV">⬇ CSV</button>
      </div>

      {filtered.length > 0 && (
        <div className="filter-summary">
          <span><strong>{summary.count}</strong> trades</span>
          <span>Net P/L <strong className={summary.net > 0 ? 'pos' : summary.net < 0 ? 'neg' : ''}>{fmtMoney(summary.net, currency)}</strong></span>
          <span>Win rate <strong>{fmtPct(summary.winRate)}</strong></span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="big">📝</div>
          <p>No trades to show. Log your first trade to start building your journal.</p>
          <button className="btn primary" onClick={openNew}>＋ New trade</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="trades-table">
            <thead>
              <tr>
                <th className="col-serial">#</th>
                {showAccountCol && <th className="col-account">Account</th>}
                <th className="col-date">Date</th>
                <th>Pair</th>
                <th className="col-dir">Dir</th>
                <th className="col-session">Session</th>
                <th className="col-strategy">Strategy</th>
                <th className="col-rr">R:R</th>
                <th style={{ textAlign: 'right' }}>R</th>
                <th>Outcome</th>
                <th style={{ textAlign: 'right' }}>P/L</th>
                <th className="col-checklist">Checklist</th>
                <th className="col-del"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const items = t.checklists.flatMap((c) => c.items)
                const done = items.filter((i) => i.checked).length
                const pct = items.length ? Math.round((done / items.length) * 100) : null
                return (
                  <tr key={t.id} onClick={() => setDetail(t)}>
                    <td className="col-serial"><strong>{t.serial ? '#' + t.serial : '—'}</strong></td>
                    {showAccountCol && (
                      <td className="col-account">
                        <span className="acct-tag">
                          <span className="acct-dot sm" style={{ background: acctMap.get(t.accountId ?? '')?.color || 'var(--text-faint)' }} />
                          {acctMap.get(t.accountId ?? '')?.name ?? '—'}
                        </span>
                      </td>
                    )}
                    <td className="col-date">{format(tradeDate(t), 'dd MMM yy')}</td>
                    <td className="pair-cell">
                      <strong>{instrumentLabel(t)}</strong>{shotCount(t) > 0 && <span className="shot-mark" title={`${shotCount(t)} screenshot${shotCount(t) === 1 ? '' : 's'}`}>📷 {shotCount(t)}</span>}
                      <span className="cell-sub">{format(tradeDate(t), 'dd MMM yy')}</span>
                    </td>
                    <td className="col-dir"><span className={displayDirection(t) === 'long' ? 'dir-buy' : 'dir-sell'}>{displayDirection(t) === 'long' ? '▲' : '▼'}</span></td>
                    <td className="muted col-session" style={{ textTransform: 'capitalize' }}>{t.session}</td>
                    <td className="muted col-strategy">{t.strategy || '—'}</td>
                    <td className="col-rr">{t.riskReward ? fmtNum(t.riskReward, 2) : '—'}</td>
                    <td style={{ textAlign: 'right' }} className={tradeR(t) != null ? (tradeR(t)! >= 0 ? 'pos' : 'neg') : ''}>
                      {tradeR(t) != null ? fmtNum(tradeR(t)!, 2) : '—'}
                    </td>
                    <td><span className={'badge ' + t.outcome}>{t.outcome}</span></td>
                    <td style={{ textAlign: 'right' }} className={netPnlOf(t) > 0 ? 'pos' : netPnlOf(t) < 0 ? 'neg' : ''}>
                      {t.pnl != null || t.grossPnl != null ? fmtMoney(netPnlOf(t), currency) : '—'}
                    </td>
                    <td className="muted col-checklist">
                      {t.checklistSerial != null
                        ? <>Chk #{t.checklistSerial}{pct != null ? ` · ${pct}%` : ''}</>
                        : (pct != null ? `${pct}%` : '—')}
                    </td>
                    <td className="col-del"><button className="icon-btn" onClick={(e) => remove(t.id, e)} title="Delete">🗑️</button></td>
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
      {detail && (
        <TradeDetail
          trade={detail}
          currency={currency}
          onClose={() => setDetail(undefined)}
          onEdit={(t) => { setDetail(undefined); openEdit(t) }}
          onDelete={removeTrade}
        />
      )}
    </>
  )
}
