import { useEffect, useRef, useState } from 'react'
import { db, getSettings, saveSettings, exportAll, importAll } from '../db'
import { useLiveQuery, downloadJson } from '../util'
import { useToast } from '../components/Toast'
import type { Settings, Trade } from '../types'
import { format, subDays } from 'date-fns'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'AED', 'ZAR']

export default function SettingsPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const [form, setForm] = useState<Settings | null>(null)
  const [balanceStr, setBalanceStr] = useState('')
  const loadedRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const tradeCount = useLiveQuery(() => db.trades.count(), [], 0)
  const clCount = useLiveQuery(() => db.checklists.count(), [], 0)

  // Load the form ONCE — don't overwrite what the user is typing on later emissions.
  useEffect(() => {
    if (settings && !loadedRef.current) {
      setForm(settings)
      setBalanceStr(String(settings.startingBalance ?? 0))
      loadedRef.current = true
    }
  }, [settings])

  if (!form) return null

  async function save() {
    const startingBalance = Number(balanceStr)
    await saveSettings({ ...form!, startingBalance: Number.isFinite(startingBalance) ? startingBalance : 0 })
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
    await db.trades.bulkPut(makeSampleTrades())
    toast('Sample trades added')
  }

  async function wipe() {
    if (!confirm('Delete ALL trades, pre-trade checks and checklists permanently? This cannot be undone.')) return
    await Promise.all([db.trades.clear(), db.checklists.clear(), db.checklistEntries.clear()])
    toast('All data cleared')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Account preferences, backups and data</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', maxWidth: 900 }}>
        <div className="card">
          <h3>Account</h3>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Account currency</label>
            <select className="select" value={form.accountCurrency} onChange={(e) => setForm({ ...form, accountCurrency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Account size / starting balance</label>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 10000"
              value={balanceStr}
              onChange={(e) => setBalanceStr(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
          <button className="btn primary" onClick={save}>Save settings</button>
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
            <strong>Edgefolio v1.0</strong> — a private, offline Forex trade journal.<br />
            Log trades, build custom checklists, and analyse your edge daily, weekly and monthly.<br /><br />
            Available for Android and Windows. Your data never leaves your device.
          </p>
        </div>
      </div>
    </>
  )
}

function makeSampleTrades(): Trade[] {
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
