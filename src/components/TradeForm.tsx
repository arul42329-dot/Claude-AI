import { useEffect, useMemo, useState } from 'react'
import { db, nextTradeSerial } from '../db'
import { useLiveQuery } from '../util'
import type { Trade, Direction, Outcome, Session } from '../types'
import { Modal } from './Modal'
import { useToast } from './Toast'
import { CURRENCY_PAIRS, SESSIONS } from '../util'
import { format } from 'date-fns'

function emptyTrade(): Trade {
  return {
    id: crypto.randomUUID(),
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    pair: 'EUR/USD',
    direction: 'long',
    session: 'london',
    strategy: '',
    outcome: 'open',
    checklists: [],
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function TradeForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Trade
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const entries = useLiveQuery(() => db.checklistEntries.orderBy('serial').reverse().toArray(), [], [])
  const [t, setT] = useState<Trade>(initial ? structuredClone(initial) : emptyTrade())
  const [tagInput, setTagInput] = useState('')

  function set<K extends keyof Trade>(key: K, value: Trade[K]) {
    setT((prev) => ({ ...prev, [key]: value }))
  }
  function setNum<K extends keyof Trade>(key: K, value: string) {
    setT((prev) => ({ ...prev, [key]: value === '' ? undefined : Number(value) } as Trade))
  }

  // Auto R:R from entry / SL / TP
  const autoRr = useMemo(() => {
    const { entryPrice: e, stopLoss: sl, takeProfit: tp } = t
    if (e == null || sl == null || tp == null) return undefined
    const risk = Math.abs(e - sl)
    const reward = Math.abs(tp - e)
    if (risk === 0) return undefined
    return Math.round((reward / risk) * 100) / 100
  }, [t.entryPrice, t.stopLoss, t.takeProfit])

  // Keep the stored riskReward in sync with the auto calculation as inputs change.
  useEffect(() => {
    if (autoRr != null && autoRr !== t.riskReward) {
      setT((prev) => ({ ...prev, riskReward: autoRr }))
    }
  }, [autoRr])

  // Entries that can be linked: still pending, or already linked to THIS trade.
  const linkable = (entries ?? []).filter((e) => !e.linkedTradeId || e.linkedTradeId === t.id)
  const selectedEntry = t.checklistSerial != null ? (entries ?? []).find((e) => e.serial === t.checklistSerial) : undefined

  function addTag() {
    const v = tagInput.trim()
    if (!v) return
    if (!(t.tags ?? []).includes(v)) set('tags', [...(t.tags ?? []), v])
    setTagInput('')
  }

  async function handleScreenshot(file: File | undefined) {
    if (!file) return
    if (file.size > 3_500_000) {
      alert('Please choose an image under ~3.5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => set('screenshot', reader.result as string)
    reader.readAsDataURL(file)
  }

  async function save() {
    if (!t.pair) return alert('Choose a currency pair.')
    const serial = t.serial ?? (await nextTradeSerial())

    // Snapshot the linked pre-trade checklist onto the trade so analytics keep working.
    const chosen = t.checklistSerial != null ? (entries ?? []).find((e) => e.serial === t.checklistSerial) : undefined
    const checklists = chosen
      ? [{ checklistId: chosen.checklistId, checklistName: `${chosen.checklistName} · #${chosen.serial}`, items: chosen.items }]
      : []

    const payload: Trade = {
      ...t,
      serial,
      riskReward: autoRr ?? t.riskReward,
      checklists,
      updatedAt: Date.now(),
    }
    await db.trades.put(payload)

    // Maintain the two-way link between trade and pre-trade checklist entry.
    for (const e of entries ?? []) {
      if (e.linkedTradeId === t.id && e.serial !== t.checklistSerial) {
        await db.checklistEntries.update(e.id, { linkedTradeId: undefined })
      }
    }
    if (chosen) await db.checklistEntries.update(chosen.id, { linkedTradeId: t.id })

    onSaved()
  }

  const selPct = selectedEntry && selectedEntry.items.length
    ? Math.round((selectedEntry.items.filter((i) => i.checked).length / selectedEntry.items.length) * 100)
    : null

  return (
    <Modal
      title={initial ? `Edit trade${t.serial ? ' #' + t.serial : ''}` : 'New trade log'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save trade</button>
        </>
      }
    >
      {/* Link to pre-trade checklist — first, so it's front and centre */}
      <h3 style={{ margin: '0 0 12px' }}>Link pre-trade checklist</h3>
      {linkable.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No pre-trade checks available to link. Run a checklist on the <strong>Pre-Trade</strong> tab before your trade, then link it here by its serial #.
        </p>
      ) : (
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Which pre-trade check does this trade belong to?</label>
          <select
            className="select"
            value={t.checklistSerial ?? ''}
            onChange={(e) => set('checklistSerial', e.target.value === '' ? undefined : Number(e.target.value))}
          >
            <option value="">— Not linked —</option>
            {linkable.map((e) => {
              const pct = e.items.length ? Math.round((e.items.filter((i) => i.checked).length / e.items.length) * 100) : 0
              return (
                <option key={e.id} value={e.serial}>
                  #{e.serial} · {e.pair} · {e.checklistName} ({pct}%)
                </option>
              )
            })}
          </select>
        </div>
      )}

      {selectedEntry && (
        <div className="card" style={{ marginBottom: 20, padding: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>#{selectedEntry.serial} · {selectedEntry.checklistName}</strong>
            {selPct != null && <span className="muted" style={{ fontSize: 13 }}>{selPct}% completed</span>}
          </div>
          {selectedEntry.items.map((it) => (
            <div className="check-row" key={it.itemId} style={{ cursor: 'default' }}>
              <div className={'checkbox' + (it.checked ? ' checked' : '')}>{it.checked ? '✓' : ''}</div>
              <span style={{ flex: 1, color: it.checked ? 'var(--text)' : 'var(--text-faint)' }}>{it.text}</span>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Recorded on the Pre-Trade tab (read-only here).</p>
        </div>
      )}

      {/* Basics */}
      <h3 style={{ margin: '10px 0 12px' }}>Trade details</h3>
      <div className="form-grid">
        <div className="field">
          <label>Date</label>
          <input className="input" type="date" value={t.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="field">
          <label>Time</label>
          <input className="input" type="time" value={t.time ?? ''} onChange={(e) => set('time', e.target.value)} />
        </div>
        <div className="field">
          <label>Pair / Instrument</label>
          <input className="input" list="pairs" value={t.pair} onChange={(e) => set('pair', e.target.value.toUpperCase())} />
          <datalist id="pairs">
            {CURRENCY_PAIRS.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div className="field">
          <label>Direction</label>
          <div className="seg">
            <button className={t.direction === 'long' ? 'active' : ''} onClick={() => set('direction', 'long' as Direction)}>▲ Buy</button>
            <button className={t.direction === 'short' ? 'active' : ''} onClick={() => set('direction', 'short' as Direction)}>▼ Sell</button>
          </div>
        </div>
        <div className="field">
          <label>Session</label>
          <select className="select" value={t.session} onChange={(e) => set('session', e.target.value as Session)}>
            {SESSIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Strategy / Setup</label>
          <input className="input" value={t.strategy ?? ''} onChange={(e) => set('strategy', e.target.value)} placeholder="e.g. Breakout, OB retest" />
        </div>
      </div>

      {/* Prices */}
      <h3 style={{ margin: '22px 0 12px' }}>Prices &amp; risk</h3>
      <div className="form-grid">
        <div className="field"><label>Entry price</label><input className="input" type="number" step="any" value={t.entryPrice ?? ''} onChange={(e) => setNum('entryPrice', e.target.value)} /></div>
        <div className="field"><label>Exit price</label><input className="input" type="number" step="any" value={t.exitPrice ?? ''} onChange={(e) => setNum('exitPrice', e.target.value)} /></div>
        <div className="field"><label>Stop loss</label><input className="input" type="number" step="any" value={t.stopLoss ?? ''} onChange={(e) => setNum('stopLoss', e.target.value)} /></div>
        <div className="field"><label>Take profit</label><input className="input" type="number" step="any" value={t.takeProfit ?? ''} onChange={(e) => setNum('takeProfit', e.target.value)} /></div>
        <div className="field"><label>Lot size</label><input className="input" type="number" step="any" value={t.lotSize ?? ''} onChange={(e) => setNum('lotSize', e.target.value)} /></div>
        <div className="field"><label>Risk %</label><input className="input" type="number" step="any" value={t.riskPercent ?? ''} onChange={(e) => setNum('riskPercent', e.target.value)} /></div>
        <div className="field">
          <label>Risk : Reward (auto)</label>
          <input
            className="input"
            type="text"
            readOnly
            value={autoRr != null ? `1 : ${autoRr}` : (t.riskReward != null ? `1 : ${t.riskReward}` : '—')}
            title="Automatically calculated from Entry, Stop loss and Take profit"
            style={{ background: 'var(--bg-2)', cursor: 'default', fontWeight: 700 }}
          />
          <span className="muted" style={{ fontSize: 11 }}>Calculated from Entry, Stop loss &amp; Take profit</span>
        </div>
      </div>

      {/* Result */}
      <h3 style={{ margin: '22px 0 12px' }}>Result</h3>
      <div className="form-grid">
        <div className="field">
          <label>Outcome</label>
          <select className="select" value={t.outcome} onChange={(e) => set('outcome', e.target.value as Outcome)}>
            <option value="open">Open</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
          </select>
        </div>
        <div className="field"><label>P/L (account currency)</label><input className="input" type="number" step="any" value={t.pnl ?? ''} onChange={(e) => setNum('pnl', e.target.value)} placeholder="e.g. 125 or -80" /></div>
        <div className="field"><label>Pips</label><input className="input" type="number" step="any" value={t.pips ?? ''} onChange={(e) => setNum('pips', e.target.value)} /></div>
        <div className="field">
          <label>Execution rating</label>
          <select className="select" value={t.rating ?? ''} onChange={(e) => setNum('rating', e.target.value)}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
          </select>
        </div>
        <div className="field"><label>Emotion</label><input className="input" value={t.emotion ?? ''} onChange={(e) => set('emotion', e.target.value)} placeholder="Calm, FOMO, fearful…" /></div>
      </div>

      {/* Notes / tags / screenshot */}
      <h3 style={{ margin: '22px 0 12px' }}>Notes</h3>
      <div className="field full" style={{ marginBottom: 16 }}>
        <label>Trade notes</label>
        <textarea className="textarea" value={t.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="What was the idea? What did you learn?" />
      </div>
      <div className="field full" style={{ marginBottom: 16 }}>
        <label>Tags</label>
        <div className="row">
          <input className="input" style={{ maxWidth: 220 }} value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="Add tag + Enter" />
          <div className="chips">
            {(t.tags ?? []).map((tag) => (
              <span key={tag} className="chip" style={{ cursor: 'pointer' }} onClick={() => set('tags', (t.tags ?? []).filter((x) => x !== tag))}>{tag} ✕</span>
            ))}
          </div>
        </div>
      </div>
      <div className="field full">
        <label>Chart screenshot (optional)</label>
        <input className="input" type="file" accept="image/*" onChange={(e) => handleScreenshot(e.target.files?.[0])} />
        {t.screenshot && (
          <div style={{ marginTop: 10 }}>
            <img src={t.screenshot} alt="screenshot" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)' }} />
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => set('screenshot', undefined)}>Remove image</button>
          </div>
        )}
      </div>
    </Modal>
  )
}

export { emptyTrade }
