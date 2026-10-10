import { useEffect, useRef, useState } from 'react'
import { db, getSettings, saveSettings, exportAll, importAll, saveAccount, deleteAccount, wipeUserData, tradesToCsv } from '../db'
import { useLiveQuery, downloadJson, fmtMoney } from '../util'
import { isAmoledEnabled, setAmoled, setTouchFx, setBackdropFx, isBackdropFxOn, type TouchFx } from '../theme'
import { saveFileToUser } from '../share'
import { getIndiaDefaults, saveIndiaDefaults } from '../indiaCosts'
import { recomputeNetAndOutcomes } from '../outcome'
import { useToast } from '../components/Toast'
import { Modal } from '../components/Modal'
import { ACCOUNT_TYPES, ACCOUNT_COLORS, accountTypeLabel, accountMarket } from '../accounts'
import { useAppMode } from '../mode'
import { IndiaFlag } from '../components/Icons'
import type { Settings, Trade, Account, AccountType } from '../types'
import { format, subDays } from 'date-fns'
import {
  getDriveState, requestDeviceCode, pollForToken, runBackup, disconnect,
  type DriveState, type DeviceCode,
} from '../drive'
import { isLockEnabled, setPin, removeLock } from '../lock'
import { getEcon } from '../econ'
import {
  newsAlertsSupported, isNewsAlertsEnabled, setNewsAlertsEnabled,
  syncNewsAlerts, cancelAllNewsAlerts, sendTestNewsAlert, LEAD_MINUTES, requestNotificationPermission,
  getSessionAlertPrefs, setSessionAlertPrefs, syncSessionAlerts, cancelSessionAlerts,
  ensureNotificationPermission, notificationPermission, pendingAlertCount,
  type SessionAlertPrefs,
} from '../newsAlerts'
import { openNotificationSettings, openExactAlarmSettings, exactAlarmsAllowed } from '../biometric'
import { isIndexAlertsEnabled, setIndexAlertsEnabled, startIndexAlertPolling, stopIndexAlertPolling } from '../indexAlerts'
import { getAngelCreds, setAngelCreds, testAngelLogin, angelLinked, type AngelCreds } from '../angel'
import { Guide } from '../components/Guide'
import { appVersion, checkForUpdate, openUpdateDownload, type UpdateInfo } from '../updates'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'AED', 'ZAR']

export default function SettingsPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const allAccounts = useLiveQuery(() => db.accounts.orderBy('createdAt').toArray(), [], [])
  const { mode, isIndia } = useAppMode()
  const accounts = (allAccounts ?? []).filter((a) => accountMarket(a) === mode)
  const [form, setForm] = useState<Settings | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const loadedRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const tradeCount = useLiveQuery(() => db.trades.count(), [], 0)
  const clCount = useLiveQuery(() => db.checklists.count(), [], 0)

  const [editing, setEditing] = useState<Account | null | undefined>(undefined) // undefined = closed
  const [amoled, setAmoledState] = useState(() => isAmoledEnabled())
  const [touchFx, setTouchFxState] = useState<TouchFx>(() => (localStorage.getItem('edgefolio-touchfx') as TouchFx) || 'ripple')
  const [backfx, setBackfxState] = useState(() => isBackdropFxOn())

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

  // Android: cache file + system share sheet (WhatsApp, Gmail, Drive, …).
  // Web/desktop keeps the download button.
  async function doShareCsv() {
    try {
      const csv = await tradesToCsv()
      const outcome = await saveFileToUser(
        `edgefolio-trades-${format(new Date(), 'yyyy-MM-dd')}.csv`,
        'text/csv',
        csv,
        { title: 'Edgefolio trades', dialogTitle: 'Share trades' },
      )
      if (outcome === 'canceled') return
      toast(outcome === 'shared' ? 'Trades shared ✓' : 'Trades exported as CSV')
    } catch (e: any) {
      if (String(e?.message || e).toLowerCase().includes('cancel')) return
      toast(e?.message || 'Could not share the CSV')
    }
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

  // Maintenance: rewrite P/L as NET (gross move − brokerage − taxes) for India
  // trades with price/size data, and re-derive Win/Loss/Breakeven from net.
  async function doRecompute() {
    const r = await recomputeNetAndOutcomes()
    const bits: string[] = []
    if (r.pnlUpdated) bits.push(`${r.pnlUpdated} P/L → net`)
    if (r.outcomeUpdated) bits.push(`${r.outcomeUpdated} outcomes fixed`)
    if (r.skipped) bits.push(`${r.skipped} skipped (no size)`)
    toast(bits.length ? `Done — ${bits.join(' · ')} ✓` : `All ${r.pnlChecked} trades already net & correct ✓`)
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
        </div>
        <button className="btn" onClick={() => setShowGuide(true)}>❓ How to use</button>
      </div>

      {showGuide && <Guide onClose={() => setShowGuide(false)} />}

      {/* Accounts */}
      <div className="card" style={{ marginBottom: 16, maxWidth: 900 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{isIndia ? <><IndiaFlag size={15} /> Indian trading accounts</> : 'Trading accounts'}</h3>
          <button className="btn primary sm" onClick={() => setEditing(null)}>＋ Add {isIndia ? 'Indian ' : ''}account</button>
        </div>
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
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Currency</label>
            <select className="select" value={form.accountCurrency} onChange={(e) => setForm({ ...form, accountCurrency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer', fontSize: 13.5 }}>
            <input type="checkbox" checked={amoled} onChange={(e) => { setAmoled(e.target.checked); setAmoledState(e.target.checked) }} />
            <span>🖤 Pure black (AMOLED)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer', fontSize: 13.5 }}>
            <input type="checkbox" checked={backfx} onChange={(e) => { setBackdropFx(e.target.checked); setBackfxState(e.target.checked) }} />
            <span>✨ Background motion</span>
          </label>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Touch feedback</label>
            <div className="seg">
              {(['ripple', 'pulse', 'off'] as TouchFx[]).map((fx) => (
                <button key={fx} className={touchFx === fx ? 'active' : ''} onClick={() => { setTouchFx(fx); setTouchFxState(fx) }}>
                  {fx === 'ripple' ? 'Ripple' : fx === 'pulse' ? 'Pulse' : 'Off'}
                </button>
              ))}
            </div>
          </div>
          <button className="btn primary" onClick={saveCurrency}>Save</button>
        </div>

        <div className="card">
          <h3>🎯 Goals &amp; targets · {isIndia ? 'India (₹)' : 'Forex'}</h3>
          <div className="form-grid">
            <div className="field">
              <label>Monthly profit goal ({isIndia ? '₹ INR' : form.accountCurrency})</label>
              <input className="input" inputMode="decimal" value={isIndia ? form.monthlyProfitGoalIndia ?? '' : form.monthlyProfitGoal ?? ''} onChange={(e) => { const v = e.target.value ? Number(e.target.value.replace(/[^0-9.]/g, '')) : undefined; setForm(isIndia ? { ...form, monthlyProfitGoalIndia: v } : { ...form, monthlyProfitGoal: v }) }} placeholder="e.g. 2000" />
            </div>
            <div className="field">
              <label>Max monthly loss ({isIndia ? '₹ INR' : form.accountCurrency})</label>
              <input className="input" inputMode="decimal" value={isIndia ? form.maxLossLimitIndia ?? '' : form.maxLossLimit ?? ''} onChange={(e) => { const v = e.target.value ? Number(e.target.value.replace(/[^0-9.]/g, '')) : undefined; setForm(isIndia ? { ...form, maxLossLimitIndia: v } : { ...form, maxLossLimit: v }) }} placeholder="e.g. 1000" />
            </div>
          </div>
          <button className="btn primary" onClick={saveCurrency} style={{ marginTop: 12 }}>Save {isIndia ? 'India' : 'forex'} goals</button>
        </div>

        <div className="card">
          <h3>Backup &amp; restore</h3>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={doExport}>⬇️ Export backup</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>⬆️ Import backup</button>
            <button className="btn" onClick={doExportCsv}>📄 Export trades (CSV)</button>
            <button className="btn" onClick={doShareCsv}>📤 Share CSV</button>
            <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => doImport(e.target.files?.[0])} />
          </div>
          <div className="chips" style={{ marginTop: 16 }}>
            <span className="chip">{tradeCount} trades</span>
            <span className="chip">{clCount} checklists</span>
            <span className="chip">{(accounts ?? []).length} accounts</span>
          </div>
        </div>

        <IndiaDefaultsCard />
        <AngelCard />

        <DriveBackup />

        <SecurityCard />

        <NewsAlertsCard />

        <div className="card">
          <h3>Data tools</h3>
          <div className="row">
            <button className="btn" onClick={doRecompute}>↻ Recalculate to net P/L</button>
            <button className="btn" onClick={loadSample}>✨ Load sample trades</button>
            <button className="btn danger" onClick={wipe}>🗑️ Clear my data</button>
          </div>
        </div>

        <UpdateCard />

      </div>

      {editing !== undefined && (
        <AccountEditor
          initial={editing ?? undefined}
          market={mode}
          globalCurrency={isIndia ? 'INR' : form.accountCurrency}
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
          <button className="btn primary" onClick={() => setSetting(true)} style={{ marginTop: 4 }}>Set up a PIN</button>
        </>
      )}

      {setting && (
        <>
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

function NewsAlertsCard() {
  const toast = useToast()
  const { isIndia } = useAppMode()
  const [supported] = useState(() => newsAlertsSupported())
  const [enabled, setEnabled] = useState(() => isNewsAlertsEnabled())
  const [sessions, setSessions] = useState<SessionAlertPrefs>(() => getSessionAlertPrefs())
  const [indexOn, setIndexOn] = useState(() => isIndexAlertsEnabled())
  const [perm, setPerm] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown')
  const [exact, setExact] = useState(true)
  const [pending, setPending] = useState(-1)
  const [busy, setBusy] = useState(false)

  async function refreshPerm() {
    setPerm(await notificationPermission())
    setExact(await exactAlarmsAllowed())
    setPending(await pendingAlertCount())
  }

  useEffect(() => { refreshPerm() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function turnOn() {
    setBusy(true)
    setNewsAlertsEnabled(true)
    setEnabled(true)
    try {
      const snap = await getEcon()
      const res = await syncNewsAlerts(snap)
      await syncSessionAlerts()
      if (res.permissionDenied) {
        toast('Android blocked notifications — tap "Open phone settings" below and allow them')
      } else {
        toast('Alerts on ✓')
      }
    } catch {
      toast('Alerts on ✓ — will schedule once the calendar loads')
    } finally {
      setBusy(false)
      refreshPerm()
    }
  }

  async function turnOff() {
    setBusy(true)
    setNewsAlertsEnabled(false)
    setEnabled(false)
    await cancelAllNewsAlerts()
    setBusy(false)
    toast('News alerts off')
  }

  async function test() {
    setBusy(true)
    await ensureNotificationPermission()
    const ok = await sendTestNewsAlert()
    setBusy(false)
    refreshPerm()
    if (ok) toast('Test alert sent — should pop up in a few seconds')
    else toast('Blocked — tap "Open phone settings" below and allow notifications')
  }

  async function toggleSession(key: keyof SessionAlertPrefs, on: boolean) {
    const next = { ...sessions, [key]: on }
    setSessions(next)
    setSessionAlertPrefs(next)
    if (!next.london && !next.newyork) {
      await cancelSessionAlerts()
      return
    }
    const n = await syncSessionAlerts()
    if (n > 0) toast('Session alert booked ✓')
  }

  async function toggleIndex(on: boolean) {
    setIndexOn(on)
    setIndexAlertsEnabled(on)
    if (on) {
      startIndexAlertPolling()
      try {
        const r = await requestNotificationPermission()
        if (r === 'granted') toast('Index trend alerts on ✓')
        else if (r === 'denied') toast('Alerts on, but Android blocked them — tap "Open phone settings" above')
        else toast('Index trend alerts on ✓')
      } catch {
        toast('Index trend alerts on ✓')
      } finally {
        refreshPerm()
      }
    } else {
      stopIndexAlertPolling()
      toast('Index trend alerts off')
    }
  }

  if (!supported) return null

  return (
    <div className="card">
      <h3>🔔 Alerts</h3>

      {supported && (
        <div className="row" style={{ alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Phone notifications:</span>
          {perm === 'granted' && <span className="chip" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>✓ Allowed</span>}
          {perm === 'denied' && <span className="chip" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>✗ Blocked</span>}
          {(perm === 'prompt' || perm === 'unknown') && <span className="chip">Not allowed yet</span>}
          {(perm === 'prompt' || perm === 'unknown') && (
            <button
              className="btn sm primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const r = await requestNotificationPermission()
                  if (r === 'granted') toast('Notifications allowed ✓')
                  else if (r === 'denied') toast('Android blocked them — tap "Open phone settings" below')
                  else if (r === 'prompt') toast('Dialog dismissed — tap Enable notifications again')
                  else toast('Notifications not available in this build')
                } catch {
                  toast('Notifications not available in this build')
                } finally {
                  setBusy(false)
                  refreshPerm()
                }
              }}
            >
              Enable notifications
            </button>
          )}
          {perm === 'denied' && (
            <button className="btn sm" onClick={() => openNotificationSettings()}>Open phone settings</button>
          )}
          {perm === 'granted' && !exact && (
            <button className="btn sm" onClick={() => openExactAlarmSettings()} title="Allows alerts to fire at the exact minute">Enable exact alarms</button>
          )}
          {pending >= 0 && (
            <span className="chip" title="Alerts booked on this phone right now">{pending} booked</span>
          )}
        </div>
      )}

      {enabled ? (
        <>
          <div className="drive-status"><span className="live-dot" /> News alerts ON · ~{LEAD_MINUTES} min before red-folder events</div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={test} disabled={busy}>Send test alert</button>
            <button className="btn danger" onClick={turnOff} disabled={busy}>Turn off news alerts</button>
          </div>
        </>
      ) : (
        <>
          <button className="btn primary" onClick={turnOn} disabled={busy} style={{ marginTop: 4 }}>Turn on news alerts</button>
        </>
      )}

      {!isIndia && (
        <>
          <div style={{ borderTop: '1px solid var(--hairline)', margin: '16px 0 12px' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5, marginBottom: 6 }}>
            <input type="checkbox" checked={sessions.london} onChange={(e) => toggleSession('london', e.target.checked)} />
            <span>🇬🇧 London session open <span className="muted" style={{ fontSize: 12 }}>(08:00 London time)</span></span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
            <input type="checkbox" checked={sessions.newyork} onChange={(e) => toggleSession('newyork', e.target.checked)} />
            <span>🇺🇸 New York session open <span className="muted" style={{ fontSize: 12 }}>(08:00 New York time)</span></span>
          </label>
        </>
      )}

      {isIndia && (
        <>
          <div style={{ borderTop: '1px solid var(--hairline)', margin: '16px 0 12px' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
            <input type="checkbox" checked={indexOn} onChange={(e) => toggleIndex(e.target.checked)} />
            <span>📈 Index 15m trend flip <span className="muted" style={{ fontSize: 12 }}>(NIFTY · BANKNIFTY · SENSEX)</span></span>
          </label>
        </>
      )}
    </div>
  )
}


// Angel One SmartAPI link — live (tick-like) prices for indices, USDINR and
// MCX commodities. Market data ONLY: Edgefolio never places orders.
function AngelCard() {
  const toast = useToast()
  const { isIndia } = useAppMode()
  const [creds, setCreds] = useState<AngelCreds>(() => getAngelCreds() ?? { apiKey: '', clientCode: '', pin: '', totpSecret: '' })
  const [linked, setLinked] = useState(() => angelLinked())
  const [busy, setBusy] = useState(false)
  if (!isIndia) return null

  async function link() {
    if (!creds.apiKey.trim() || !creds.clientCode.trim() || !creds.pin.trim() || !creds.totpSecret.trim()) {
      toast('Fill all four fields first')
      return
    }
    setBusy(true)
    try {
      await testAngelLogin(creds)
      setLinked(true)
      toast('Angel One linked ✓ — live prices on the Markets tab')
    } catch (e: any) {
      setLinked(false)
      toast(e?.message ? 'Link failed: ' + e.message : 'Link failed — check the details')
    } finally {
      setBusy(false)
    }
  }

  function unlink() {
    setAngelCreds(null)
    setLinked(false)
    toast('Angel One unlinked — back to delayed prices')
  }

  return (
    <div className="card">
      <h3>📈 Angel One · live prices</h3>
      {linked && <div className="drive-status"><span className="live-dot" /> Live tick prices on the Markets tab</div>}
      {linked ? (
        <button className="btn danger" onClick={unlink}>Unlink</button>
      ) : (
        <>
          <div className="form-grid" style={{ marginTop: 4 }}>
            <div className="field">
              <label>API key (SmartAPI app)</label>
              <input className="input" value={creds.apiKey} onChange={(e) => setCreds({ ...creds, apiKey: e.target.value })} placeholder="From smartapi.angelbroking.com" />
            </div>
            <div className="field">
              <label>Client code</label>
              <input className="input" value={creds.clientCode} onChange={(e) => setCreds({ ...creds, clientCode: e.target.value })} placeholder="e.g. A12345" />
            </div>
            <div className="field">
              <label>PIN or password</label>
              <input className="input" type="password" value={creds.pin} onChange={(e) => setCreds({ ...creds, pin: e.target.value })} />
            </div>
            <div className="field">
              <label>TOTP secret (the setup key, not the 6-digit code)</label>
              <input className="input" type="password" value={creds.totpSecret} onChange={(e) => setCreds({ ...creds, totpSecret: e.target.value })} placeholder="e.g. JBSWY3DPEHPK3PXP" />
            </div>
          </div>
          <button className="btn primary" style={{ marginTop: 12 }} onClick={link} disabled={busy}>{busy ? 'Linking…' : 'Link & test'}</button>
        </>
      )}
    </div>
  )
}


function UpdateCard() {
  const toast = useToast()
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [busy, setBusy] = useState(false)

  async function check(force: boolean) {
    setBusy(true)
    const r = await checkForUpdate(force)
    setInfo(r)
    setBusy(false)
    if (force) {
      if (r?.newer) toast(`v${r.latest} is available ✓`)
      else if (r) toast('You are up to date ✓')
      else toast('Could not check for updates right now')
    }
  }

  useEffect(() => { check(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <h3>⬆️ Updates</h3>
      <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
        Installed: <strong>v{appVersion()}</strong>
        {info && <> · Latest release: <strong>v{info.latest}</strong></>}
      </p>
      {info?.newer ? (
        <>
          <div className="drive-status" style={{ color: 'var(--green)' }}>
            <span className="live-dot" /> A new version is available
          </div>
          {info.notes && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', marginBottom: 0 }}>
              {info.notes.slice(0, 600)}
            </p>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => openUpdateDownload(info)}>⬇️ Download v{info.latest}</button>
            <button className="btn" onClick={() => check(true)} disabled={busy}>{busy ? 'Checking…' : 'Check again'}</button>
          </div>
        </>
      ) : (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => check(true)} disabled={busy}>{busy ? 'Checking…' : 'Check for updates'}</button>
          {info && !info.newer && <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>You’re up to date ✓</span>}
        </div>
      )}
    </div>
  )
}


function IndiaDefaultsCard() {
  const { isIndia } = useAppMode()
  const toast = useToast()
  const [d, setD] = useState(() => getIndiaDefaults())
  // Lot editor modal: null = closed; { original } = editing, undefined original = adding.
  const [editor, setEditor] = useState<{ original?: string; name: string; qty: number } | null>(null)
  // Lot sizes + brokerage live behind one button → popup.
  const [open, setOpen] = useState(false)
  if (!isIndia) return null // India-only card (switch to India mode to edit)

  function persist(next: ReturnType<typeof getIndiaDefaults>) {
    setD(next)
    saveIndiaDefaults(next)
  }

  function setBrokerage(patch: Partial<ReturnType<typeof getIndiaDefaults>>) {
    persist({ ...d, ...patch })
  }

  function saveLot() {
    if (!editor) return
    const key = editor.name.trim().toUpperCase()
    if (!key) { toast('Enter an instrument name'); return }
    if (!Number.isFinite(editor.qty) || editor.qty < 1) { toast('Qty per lot must be at least 1'); return }
    const lotSizes = { ...d.lotSizes }
    if (editor.original && editor.original !== key) delete lotSizes[editor.original]
    lotSizes[key] = Math.round(editor.qty)
    persist({ ...d, lotSizes })
    setEditor(null)
    toast(editor.original ? `${key} lot size updated ✓` : `${key} added ✓`)
  }

  function removeLot(name: string) {
    const lotSizes = { ...d.lotSizes }
    delete lotSizes[name]
    persist({ ...d, lotSizes })
    toast(`${name} removed`)
  }

  const names = Object.keys(d.lotSizes).sort()

  return (
    <div className="card">
      <h3>🇮🇳 India trading defaults</h3>

      <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        <button className="btn primary" onClick={() => setOpen(true)}>Lot sizes & brokerage</button>
        <span className="muted" style={{ fontSize: 12 }}>
          {names.length} instrument{names.length === 1 ? '' : 's'} · options ₹{d.brokerageOptionsBuy}+₹{d.brokerageOptionsSell} / order
        </span>
      </div>

      {open && (
      <Modal
        title="Lot sizes & brokerage"
        onClose={() => setOpen(false)}
        footer={<button className="btn primary" onClick={() => setOpen(false)}>Done</button>}
      >
      <div className="form-grid" style={{ marginTop: 4 }}>
        <div className="field">
          <label>Options brokerage · BUY leg (₹ per order)</label>
          <input className="input" type="number" step="any" value={d.brokerageOptionsBuy} onChange={(e) => setBrokerage({ brokerageOptionsBuy: Number(e.target.value) || 0 })} />
        </div>
        <div className="field">
          <label>Options brokerage · SELL leg (₹ per order)</label>
          <input className="input" type="number" step="any" value={d.brokerageOptionsSell} onChange={(e) => setBrokerage({ brokerageOptionsSell: Number(e.target.value) || 0 })} />
        </div>
        <div className="field">
          <label>Futures / equity / commodity brokerage (₹ per trade)</label>
          <input className="input" type="number" step="any" value={d.brokerageFlat} onChange={(e) => setBrokerage({ brokerageFlat: Number(e.target.value) || 0 })} />
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label>Lot sizes (qty per lot · auto-filled per instrument)</label>
        {names.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>No instruments yet — add one below.</p>}
        <div className="lot-list">
          {names.map((n) => (
            <div key={n} className="acct-row lot-line">
              <span className="lot-name">{n}</span>
              <span className="chip">{d.lotSizes[n]} <span className="muted" style={{ fontSize: 10.5 }}>/ lot</span></span>
              <span className="row" style={{ gap: 4, marginLeft: 'auto' }}>
                <button className="icon-btn" title="Edit lot size" onClick={() => setEditor({ original: n, name: n, qty: d.lotSizes[n] })}>✏️</button>
                <button className="icon-btn" title="Remove" onClick={() => removeLot(n)}>🗑️</button>
              </span>
            </div>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => setEditor({ name: '', qty: 75 })}>＋ Add instrument</button>
      </div>


      {editor && (
        <Modal
          title={editor.original ? `Edit · ${editor.original}` : 'Add instrument'}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn primary" onClick={saveLot}>{editor.original ? 'Save changes' : 'Add instrument'}</button>
            </>
          }
        >
          <div className="form-grid">
            <div className="field">
              <label>Instrument name</label>
              <input className="input" value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="e.g. NIFTY NEXT 50" autoFocus />
            </div>
            <div className="field">
              <label>Qty per lot</label>
              <input className="input" type="number" min={1} step={1} value={editor.qty} onChange={(e) => setEditor({ ...editor, qty: Number(e.target.value) })} />
            </div>
          </div>

        </Modal>
      )}
      </Modal>
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
  market,
  globalCurrency,
  onClose,
  onSaved,
}: {
  initial?: Account
  market: 'forex' | 'india'
  globalCurrency: string
  onClose: () => void
  onSaved: () => void
}) {
  const acctMarket = initial ? (initial.market === 'india' ? 'india' : 'forex') : market
  const isIndia = acctMarket === 'india'
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<AccountType>(initial?.type ?? (isIndia ? 'live' : 'evaluation'))
  const [balanceStr, setBalanceStr] = useState(initial ? String(initial.startingBalance) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? (isIndia ? 'INR' : ''))
  const [color, setColor] = useState(initial?.color ?? (isIndia ? '#ff8f2e' : ACCOUNT_COLORS[0]))
  const [targetStr, setTargetStr] = useState(initial?.profitTarget != null ? String(initial.profitTarget) : '')
  const [archived, setArchived] = useState(!!initial?.archived)

  async function save() {
    if (!name.trim()) return alert('Give the account a name.')
    const acc: Account = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      type,
      market: acctMarket,
      startingBalance: Number(balanceStr) || 0,
      currency: isIndia ? 'INR' : (currency || undefined),
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
      title={initial ? 'Edit account' : (isIndia ? 'New Indian account (₹ INR)' : 'New account')}
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
          {isIndia ? (
            <input className="input" value="₹ INR (fixed)" readOnly style={{ background: 'var(--bg-2)', cursor: 'default' }} />
          ) : (
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="">Use display currency ({globalCurrency})</option>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
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
