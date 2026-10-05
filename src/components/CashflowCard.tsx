import { useMemo, useState } from 'react'
import { db } from '../db'
import { useLiveQuery, fmtMoney } from '../util'
import { useAccountScope } from '../accounts'
import { useAppMode } from '../mode'
import type { Cashflow, Account } from '../types'
import { Modal } from './Modal'
import { useToast } from './Toast'
import { format } from 'date-fns'

// Deposits & withdrawals log. Money in/out of the account that is NOT trading
// P/L — it never touches the Net P/L stats, but the account balance and equity
// curve move with it (see Dashboard / stats.equityCurve).
export function CashflowCard() {
  const all = useLiveQuery(() => db.cashflows.toArray(), [], [])
  const { accounts, activeId, currency } = useAccountScope()
  const { mode } = useAppMode()
  const [editing, setEditing] = useState<Cashflow | undefined>(undefined)
  const [showForm, setShowForm] = useState(false)
  const toast = useToast()

  const flows = useMemo(
    () =>
      (all ?? [])
        .filter((c) => (c.market ?? 'forex') === mode)
        .filter((c) => !activeId || activeId === 'all' || c.accountId === activeId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)),
    [all, activeId, mode], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const totals = useMemo(() => {
    let dep = 0, wd = 0
    for (const c of flows) {
      if (c.type === 'deposit') dep += c.amount
      else wd += c.amount
    }
    return { dep, wd, net: dep - wd }
  }, [flows]) // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setEditing(undefined)
    setShowForm(true)
  }
  function openEdit(c: Cashflow) {
    setEditing(c)
    setShowForm(true)
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>💰 Deposits &amp; withdrawals</h3>
        <button className="btn sm" onClick={openNew}>＋ Add</button>
      </div>

      <div className="chips" style={{ marginBottom: flows.length ? 12 : 0 }}>
        <span className="chip" style={{ color: 'var(--green)', borderColor: 'var(--green-dim)' }}>In {fmtMoney(totals.dep, currency)}</span>
        <span className="chip" style={{ color: 'var(--red)', borderColor: 'var(--red-dim)' }}>Out {fmtMoney(totals.wd, currency)}</span>
        <span className={'chip ' + (totals.net > 0 ? 'pos' : totals.net < 0 ? 'neg' : '')}>Net {fmtMoney(totals.net, currency)}</span>
      </div>

      {flows.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>No deposits or withdrawals yet.</p>
      ) : (
        <div className="table-wrap" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Note</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr>
            </thead>
            <tbody>
              {flows.slice(0, 8).map((c) => (
                <tr key={c.id} onClick={() => openEdit(c)}>
                  <td>{format(parse(c.date), 'dd MMM yy')}</td>
                  <td>
                    {c.type === 'deposit'
                      ? <span className="dir-buy">⬇ Deposit</span>
                      : <span className="dir-sell">⬆ Withdraw</span>}
                  </td>
                  <td className="muted">{c.note || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }} className={c.type === 'deposit' ? 'pos' : 'neg'}>
                    {c.type === 'deposit' ? '+' : '−'}{fmtMoney(c.amount, currency)}
                  </td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CashflowForm
          initial={editing}
          accounts={accounts}
          defaultAccountId={activeId !== 'all' ? activeId : accounts[0]?.id}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); toast(editing ? 'Entry updated' : 'Entry saved') }}
        />
      )}
    </div>
  )
}

function parse(d: string): Date {
  try { return new Date(d + 'T00:00') } catch { return new Date(d) }
}

function CashflowForm({
  initial,
  accounts,
  defaultAccountId,
  onClose,
  onSaved,
}: {
  initial?: Cashflow
  accounts: Account[]
  defaultAccountId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const { mode } = useAppMode()
  const [type, setType] = useState<'deposit' | 'withdraw'>(initial?.type ?? 'deposit')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [date, setDate] = useState(initial?.date ?? format(new Date(), 'yyyy-MM-dd'))
  const [note, setNote] = useState(initial?.note ?? '')
  const [accountId, setAccountId] = useState(initial?.accountId ?? defaultAccountId ?? '')

  async function save() {
    const amt = Number(amount.replace(/[^0-9.]/g, ''))
    if (!amt || amt <= 0) return
    await db.cashflows.put({
      id: initial?.id ?? crypto.randomUUID(),
      market: mode,
      accountId: accountId || undefined,
      type,
      amount: Math.round(amt * 100) / 100,
      date,
      note: note.trim() || undefined,
      createdAt: initial?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })
    onSaved()
  }

  async function remove() {
    if (!initial) return
    if (!confirm('Delete this entry?')) return
    await db.cashflows.delete(initial.id)
    onClose()
  }

  return (
    <Modal
      title={initial ? 'Edit entry' : 'Deposit / withdraw'}
      onClose={onClose}
      footer={
        <>
          {initial && <button className="btn danger" onClick={remove}>Delete</button>}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Type</label>
          <div className="seg">
            <button className={type === 'deposit' ? 'active' : ''} onClick={() => setType('deposit')}>⬇ Deposit</button>
            <button className={type === 'withdraw' ? 'active' : ''} onClick={() => setType('withdraw')}>⬆ Withdraw</button>
          </div>
        </div>
        <div className="field">
          <label>Amount</label>
          <input className="input" type="number" step="any" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" autoFocus />
        </div>
        <div className="field">
          <label>Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {accounts.length > 1 && (
          <div className="field">
            <label>Account</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        <div className="field full">
          <label>Note</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
        </div>
      </div>
    </Modal>
  )
}
