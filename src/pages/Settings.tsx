import { useEffect, useRef, useState } from 'react'
import { db, getSettings, saveSettings, exportAll, importAll, saveAccount, deleteAccount, wipeUserData, tradesToCsv } from '../db'
import { useLiveQuery, downloadJson, fmtMoney } from '../util'
import { ACCENTS, applyAccent } from '../theme'
import { useToast } from '../components/Toast'
import { Modal } from '../components/Modal'
import { ACCOUNT_TYPES, ACCOUNT_COLORS, accountTypeLabel } from '../accounts'
import type { Settings, Trade, Account, AccountType } from '../types'
import { format, subDays } from 'date-fns'
import {
  getDriveState, requestDeviceCode, pollForToken, runBackup, disconnect,
  type DriveState, type DeviceCode,
} from '../drive'
import { isLockEnabled, setPin, removeLock } from '../lock'

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

  async function doExportCsv() {
    const csv = await tradesToCsv()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `edgefolio-trades-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast('Trades exported as CSV')
  }

  function pickAccent(key: string) {
    setForm({ ...form!, accent: key })
    applyAccent(key) // live preview
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
    if (!confirm('Clear your trades, pre-trade checks, journal entries and any checklists YOU created?\n\nYour default checklists (Pre-Trade & Psychology), your accounts, and your Google Drive connection are kept. This cannot be undone.')) return
    await wipeUserData()
    toast('Trades & custom checklists cleared · defaults kept')
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
          <h3>Appearance &amp; currency</h3>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>Currency is used for the combined view and any account without its own.</p>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Currency</label>
            <select className="select" value={form.accountCurrency} onChange={(e) => setForm({ ...form, accountCurrency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Accent colour</label>
            <div className="accent-row">
              {ACCENTS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className={'accent-swatch' + ((form.accent ?? 'gold') === a.key ? ' on' : '')}
                  style={{ background: a.accent }}
                  title={a.label}
                  onClick={() => pickAccent(a.key)}
                >{(form.accent ?? 'gold') === a.key ? '✓' : ''}</button>
              ))}
            </div>
          </div>
          <button className="btn primary" onClick={saveCurrency}>Save</button>
        </div>

        <div className="card">
          <h3>🎯 Goals &amp; targets</h3>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>Set a monthly profit goal and a max-loss limit — progress shows on your Dashboard. Leave blank to hide.</p>
          <div className="form-grid">
            <div className="field">
              <label>Monthly profit goal ({form.accountCurrency})</label>
              <input className="input" inputMode="decimal" value={form.monthlyProfitGoal ?? ''} onChange={(e) => setForm({ ...form, monthlyProfitGoal: e.target.value ? Number(e.target.value.replace(/[^0-9.]/g, '')) : undefined })} placeholder="e.g. 2000" />
            </div>
            <div className="field">
              <label>Max monthly loss ({form.accountCurrency})</label>
              <input className="input" inputMode="decimal" value={form.maxLossLimit ?? ''} onChange={(e) => setForm({ ...form, maxLossLimit: e.target.value ? Number(e.target.value.replace(/[^0-9.]/g, '')) : undefined })} placeholder="e.g. 1000" />
            </div>
          </div>
          <button className="btn primary" onClick={saveCurrency} style={{ marginTop: 12 }}>Save goals</button>
        </div>

        <div className="card">
          <h3>Backup &amp; restore</h3>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
            All your data lives on this device. Export regularly to keep a safe copy, or to move to another device.
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={doExport}>⬇️ Export backup</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>⬆️ Import backup</button>
            <button className="btn" onClick={doExportCsv}>📄 Export trades (CSV)</button>
            <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => doImport(e.target.files?.[0])} />
          </div>
          <div className="chips" style={{ marginTop: 16 }}>
            <span className="chip">{tradeCount} trades</span>
            <span className="chip">{clCount} checklists</span>
            <span className="chip">{(accounts ?? []).length} accounts</span>
          </div>
        </div>

        <DriveBackup />

        <SecurityCard />

        <div className="card">
          <h3>Data tools</h3>
          <div className="row">
            <button className="btn" onClick={loadSample}>✨ Load sample trades</button>
            <button className="btn danger" onClick={wipe}>🗑️ Clear my data</button>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            Clears your trades, pre-trade checks, journal and checklists you created. Your default checklists, accounts and Google Drive connection are kept.
          </p>
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

function SecurityCard() {
  const toast = useToast()
  const [enabled, setEnabled] = useState(() => isLockEnabled())
  const [setting, setSetting] = useState(false)
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')

  const validPin = /^[0-9]{4,8}$/.test(pin1)

  async function save() {
    if (!validPin) { toast('PIN must be 4–8 digits'); return }
    if (pin1 !== pin2) { toast('PINs do not match'); return }
    await setPin(pin1)
    setEnabled(true); setSetting(false); setPin1(''); setPin2('')
    toast('App lock enabled ✓')
  }
  function turnOff() {
    if (!confirm('Turn off the app lock? Anyone with your phone will be able to open Edgefolio.')) return
    removeLock(); setEnabled(false)
    toast('App lock removed')
  }

  return (
    <div className="card">
      <h3>🔒 Security · App lock</h3>

      {enabled && !setting && (
        <>
          <div className="drive-status"><span className="live-dot" /> App lock is ON · PIN required on open</div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => setSetting(true)}>Change PIN</button>
            <button className="btn danger" onClick={turnOff}>Turn off</button>
          </div>
        </>
      )}

      {!enabled && !setting && (
        <>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
            Lock Edgefolio with a PIN so your journal stays private if someone else picks up your phone.
          </p>
          <button className="btn primary" onClick={() => setSetting(true)} style={{ marginTop: 4 }}>Set up a PIN</button>
        </>
      )}

      {setting && (
        <>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>{enabled ? 'Set a new PIN.' : 'Choose a 4–8 digit PIN.'}</p>
          <div className="form-grid" style={{ marginTop: 6 }}>
            <div className="field">
              <label>New PIN (4–8 digits)</label>
              <input className="input" type="password" inputMode="numeric" value={pin1} onChange={(e) => setPin1(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))} placeholder="••••" />
            </div>
            <div className="field">
              <label>Confirm PIN</label>
              <input className="input" type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))} placeholder="••••" />
            </div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={save} disabled={!validPin || pin1 !== pin2}>Save PIN</button>
            <button className="btn ghost" onClick={() => { setSetting(false); setPin1(''); setPin2('') }}>Cancel</button>
          </div>
        </>
      )}
    </div>
  )
}

function DriveBackup() {
  const toast = useToast()
  const [st, setSt] = useState<DriveState>(() => getDriveState())
  const refresh = () => setSt(getDriveState())
  const [cid, setCid] = useState(st.clientId)
  const [secret, setSecret] = useState(st.clientSecret)
  const [guide, setGuide] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dc, setDc] = useState<DeviceCode | null>(null)
  const [secsLeft, setSecsLeft] = useState(0)

  async function connect() {
    if (!cid.trim() || !secret.trim()) { toast('Enter your Client ID and Client secret first'); return }
    setBusy(true)
    try {
      const code = await requestDeviceCode(cid)
      setDc(code); setSecsLeft(code.expires_in)
      await pollForToken(cid, secret, code, (s) => setSecsLeft(s))
      setDc(null); refresh()
      toast('Google Drive connected ✓')
      try { await runBackup(); refresh() } catch { /* first backup best-effort */ }
    } catch (e: any) {
      setDc(null)
      toast(e?.message || 'Connection failed')
    } finally { setBusy(false) }
  }

  async function backupNow() {
    setBusy(true)
    try { await runBackup(); refresh(); toast('Backed up to Google Drive ✓') }
    catch (e: any) { refresh(); toast(e?.message || 'Backup failed') }
    finally { setBusy(false) }
  }

  async function doDisconnect() {
    if (!confirm('Disconnect Google Drive?\n\nDaily auto-backup will stop. The backup file already in your Drive is kept.')) return
    setBusy(true)
    try { await disconnect(); refresh(); setCid(''); setSecret(''); toast('Disconnected from Google Drive') }
    finally { setBusy(false) }
  }

  const mins = Math.floor(secsLeft / 60), ss = secsLeft % 60

  return (
    <div className="card">
      <h3>☁️ Google Drive backup</h3>

      {st.connected ? (
        <>
          <div className="drive-status">
            <span className="live-dot" /> Connected · auto-backup daily when you open the app
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Your journal is saved to a single file (<strong>edgefolio-backup.json</strong>) in your Drive, replaced on each backup.
          </p>
          <div className="chips" style={{ margin: '4px 0 14px' }}>
            <span className="chip">Last backup: {st.lastBackupAt ? format(new Date(st.lastBackupAt), 'd MMM yyyy, HH:mm') : 'not yet'}</span>
          </div>
          {st.lastError && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: -4 }}>{st.lastError}</p>}
          <div className="row">
            <button className="btn primary" onClick={backupNow} disabled={busy}>{busy ? 'Backing up…' : '☁️ Back up now'}</button>
            <button className="btn danger" onClick={doDisconnect} disabled={busy}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
            Connect once and Edgefolio will back up your whole journal to your own Google Drive automatically — once a day when you open the app — always replacing the same file.
          </p>

          <button className="link-btn" onClick={() => setGuide((g) => !g)} style={{ margin: '6px 0 4px' }}>
            {guide ? '▾ Hide setup steps' : '▸ First time? How to get your Client ID (2 min)'}
          </button>
          {guide && (
            <ol className="drive-guide">
              <li>Open the <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a> and create a free project.</li>
              <li>In <em>APIs &amp; Services → Library</em>, search <strong>Google Drive API</strong> and click <strong>Enable</strong>.</li>
              <li>In <em>OAuth consent screen</em>, choose <strong>External</strong>, fill the basics, and add your own Gmail under <strong>Test users</strong>.</li>
              <li>In <em>Credentials → Create credentials → OAuth client ID</em>, set Application type to <strong>TVs and Limited Input devices</strong>.</li>
              <li>Copy the <strong>Client ID</strong> and <strong>Client secret</strong> it shows, and paste them below.</li>
            </ol>
          )}

          <div className="form-grid" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Client ID</label>
              <input className="input" value={cid} onChange={(e) => setCid(e.target.value)} placeholder="1234…apps.googleusercontent.com" autoComplete="off" />
            </div>
            <div className="field">
              <label>Client secret</label>
              <input className="input" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" autoComplete="off" />
            </div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={connect} disabled={busy}>{busy ? 'Connecting…' : 'Connect Google Drive'}</button>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            Your Client ID/secret and the login stay on this device. Edgefolio only ever touches the one backup file it creates (drive.file scope).
          </p>
        </>
      )}

      {dc && (
        <Modal title="Approve on Google" onClose={() => { setDc(null); setBusy(false) }}>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            On your phone or any device, open the link below and enter this code to approve Edgefolio:
          </p>
          <div className="drive-code">{dc.user_code}</div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}>
            <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(dc.user_code).then(() => toast('Code copied'), () => {}) }}>Copy code</button>
            <a className="btn primary sm" href={dc.verification_url} target="_blank" rel="noreferrer">Open {dc.verification_url.replace('https://', '')}</a>
          </div>
          <p className="muted" style={{ textAlign: 'center', marginTop: 16, fontSize: 12.5 }}>
            <span className="refresh-ic spin" style={{ marginRight: 6 }}>⟳</span>
            Waiting for approval… {mins}:{String(ss).padStart(2, '0')} left
          </p>
        </Modal>
      )}
    </div>
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
