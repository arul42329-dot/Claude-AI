import { useEffect, useRef, useState } from 'react'
import { db, getSettings, saveSettings, exportAll, importAll, saveAccount, deleteAccount } from '../db'
import { useLiveQuery, downloadJson, fmtMoney } from '../util'
import { useToast } from '../components/Toast'
import { Modal } from '../components/Modal'
import { ACCOUNT_TYPES, ACCOUNT_COLORS, accountTypeLabel } from '../accounts'
import type { Settings, Trade, Account, AccountType } from '../types'
import { format, subDays } from 'date-fns'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'AED', 'ZAR']

export default function SettingsPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const accounts = useLiveQuery(() => db.accounts.orderBy('createdAt').toArray(), [], [])
  const [form, setForm] = useState<Settings | null>(null)
  const loadedRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const tradeCount = useLiveQuery(() => db.trades.count(), [], 0)
  const clCount = useLiveQuery(() => db.checklists.count(), [], 0)

  const [editing, setEditing] = useState<Account | null | undefined>(undefined) // undefined = closed

  // Load the form ONCE — don't overwrite what the user is typing on later emissions.
  useEffect(() => {
    if (settings && !loadedRef.current) {
      setForm(settings)
      loadedRef.current = true
    }
  }, [settings])

  if (!form) return null

  async function saveCurrency() {
    await saveSettings({ ...form! })
    toast('Settings saved')
  }

  async function doExport() {
    const data = await exportAll()
    downloadJson(`edgefolio-backup-${format(new Date(), 'yyyy-MM-dd')}.json`, data)
    toast('Backup downloaded')
  }

  async function doImport(file: File | undefined) {
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const mode = confirm('OK = MERGE with existing data.\nCancel = REPLACE all existing data.') ? 'merge' : 'replace'
      await importAll(data, mode)
      toast('Backup imported')
    } catch (e: any) {
      alert('Import failed: ' + e.message)
    }
  }

  async function loadSample() {
    if (!confirm('Add 20 sample trades so you can explore the analytics?')) return
    const acctId = (accounts ?? [])[0]?.id
    await db.trades.bulkPut(makeSampleTrades(acctId))
    toast('Sample trades added')
  }

  async function wipe() {
    if (!confirm('Delete ALL trades, pre-trade checks and checklists permanently? This cannot be undone.')) return
    await Promise.all([db.trades.clear(), db.checklists.clear(), db.checklistEntries.clear()])
    toast('All data cleared')
  }

  async function removeAccount(a: Account) {
    const n = (await db.trades.where('accountId').equals(a.id).count())
    const msg = n > 0
      ? `Delete "${a.name}" and its ${n} trade${n === 1 ? '' : 's'}? This cannot be undone.`
      : `Delete "${a.name}"?`
    if (!confirm(msg)) return
    if ((accounts ?? []).length <= 1) {
      alert('You need at least one account. Add another before deleting this one.')
      return
    }
    await deleteAccount(a.id)
    toast('Account deleted')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Accounts, preferences, backups and data</p>
        </div>
      </div>

      {/* Accounts */}
      <div className="card" style={{ marginBottom: 16, maxWidth: 900 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Trading accounts</h3>
          <button className="btn primary sm" onClick={() => setEditing(null)}>＋ Add account</button>
        </div>
        <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          Journal each account separately — e.g. your prop-firm evaluation phases, funded account and live account.
          Switch between them (or view all combined) using the selector in the sidebar.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {(accounts ?? []).map((a) => (
            <div key={a.id} className="acct-row">
              <span className="acct-dot" style={{ background: a.color || 'var(--accent)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>
                  {a.name}
                  {a.archived && <span className="chip" style={{ marginLeft: 8, fontSize: 10 }}>archived</span>}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {accountTypeLabel(a.type)} · start {fmtMoney(a.startingBalance, a.currency || form!.accountCurrency)}
                  {a.profitTarget ? ` · target ${fmtMoney(a.profitTarget, a.currency || form!.accountCurrency)}` : ''}
                </div>
              </div>
              <button className="btn sm ghost" onClick={() => setEditing(a)}>Edit</button>
              <button className="btn sm danger" onClick={() => removeAccount(a)}>Delete</button>
            </div>
          ))}
          {(accounts ?? []).length === 0 && <p className="muted">No accounts yet.</p>}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', maxWidth: 900 }}>
        <div className="card">
          <h3>Display currency</h3>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>Used for the combined view and any account without its own currency.</p>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Currency</label>
            <select className="select" value={form.accountCurrency} onChange={(e) => setForm({ ...form, accountCurrency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button className="btn primary" onClick={saveCurrency}>Save</button>
        </div>

        <div className="card">
          <h3>Backup &amp; restore</h3>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
            All your data lives on this device. Export regularly to keep a safe copy, or to move to another device.
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={doExport}>⬇️ Export backup</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>⬆️ Import backup</button>
            <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => doImport(e.target.files?.[0])} />
          </div>
          <div className="chips" style={{ marginTop: 16 }}>
            <span className="chip">{tradeCount} trades</span>
            <span className="chip">{clCount} checklists</span>
            <span className="chip">{(accounts ?? []).length} accounts</span>
          </div>
        </div>

        <div className="card">
          <h3>Data tools</h3>
          <div className="row">
            <button className="btn" onClick={loadSample}>✨ Load sample trades</button>
            <button className="btn danger" onClick={wipe}>🗑️ Clear all data</button>
          </div>
        </div>

        <div className="card">
          <h3>About</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            <strong>Edgefolio</strong> — a private, offline Forex trade journal.<br />
            Log trades across multiple accounts, build custom checklists, and analyse your edge daily, weekly and monthly.<br /><br />
            Available for Android and Windows. Your data never leaves your device.
          </p>
        </div>
      </div>

      {editing !== undefined && (
        <AccountEditor
          initial={editing ?? undefined}
          globalCurrency={form.accountCurrency}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); toast('Account saved') }}
        />
      )}
    </>
  )
}

function AccountEditor({
  initial,
  globalCurrency,
  onClose,
  onSaved,
}: {
  initial?: Account
  globalCurrency: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<AccountType>(initial?.type ?? 'evaluation')
  const [balanceStr, setBalanceStr] = useState(initial ? String(initial.startingBalance) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? '')
  const [color, setColor] = useState(initial?.color ?? ACCOUNT_COLORS[0])
  const [targetStr, setTargetStr] = useState(initial?.profitTarget != null ? String(initial.profitTarget) : '')
  const [archived, setArchived] = useState(!!initial?.archived)

  async function save() {
    if (!name.trim()) return alert('Give the account a name.')
    const acc: Account = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      type,
      startingBalance: Number(balanceStr) || 0,
      currency: currency || undefined,
      color,
      profitTarget: targetStr ? Number(targetStr) : undefined,
      archived,
      createdAt: initial?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }
    await saveAccount(acc)
    onSaved()
  }

  return (
    <Modal
      title={initial ? 'Edit account' : 'New account'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save account</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label>Account name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FTMO Phase 1" autoFocus />
        </div>
        <div className="field">
          <label>Type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Starting balance / account size</label>
          <input className="input" inputMode="decimal" value={balanceStr} onChange={(e) => setBalanceStr(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 100000" />
        </div>
        <div className="field">
          <label>Currency</label>
          <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">Use display currency ({globalCurrency})</option>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Profit target (optional)</label>
          <input className="input" inputMode="decimal" value={targetStr} onChange={(e) => setTargetStr(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 10000" />
        </div>
        <div className="field full">
          <label>Colour tag</label>
          <div className="swatches">
            {ACCOUNT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={'swatch' + (c === color ? ' active' : '')}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        {initial && (
          <div className="field full">
            <label className="row" style={{ gap: 10, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
              Archive this account (hides it, keeps its trades)
            </label>
          </div>
        )}
      </div>
    </Modal>
  )
}

function makeSampleTrades(accountId?: string): Trade[] {
  const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'AUD/USD', 'GBP/JPY']
  const sessions = ['london', 'newyork', 'tokyo', 'sydney'] as const
  const strategies = ['Breakout', 'OB retest', 'Trend pullback', 'Range reversal']
  const out: Trade[] = []
  for (let i = 0; i < 20; i++) {
    const win = Math.random() > 0.42
    const be = !win && Math.random() > 0.85
    const rr = Math.round((1 + Math.random() * 2.5) * 100) / 100
    const risk = 50 + Math.round(Math.random() * 100)
    const pnl = be ? 0 : win ? Math.round(risk * rr) : -risk
    const now = Date.now()
    out.push({
      id: crypto.randomUUID(),
      accountId,
      date: format(subDays(new Date(), Math.floor(Math.random() * 75)), 'yyyy-MM-dd'),
      time: `${String(8 + Math.floor(Math.random() * 8)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      pair: pairs[Math.floor(Math.random() * pairs.length)],
      direction: Math.random() > 0.5 ? 'long' : 'short',
      session: sessions[Math.floor(Math.random() * sessions.length)],
      strategy: strategies[Math.floor(Math.random() * strategies.length)],
      outcome: be ? 'breakeven' : win ? 'win' : 'loss',
      pnl,
      pips: be ? 0 : win ? Math.round(20 * rr) : -20,
      riskReward: rr,
      riskPercent: 1,
      rating: 1 + Math.floor(Math.random() * 5),
      checklists: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    })
  }
  return out
}
