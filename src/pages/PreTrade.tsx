import { useMemo, useState } from 'react'
import { db, nextChecklistSerial } from '../db'
import { useLiveQuery, instrumentsFor, indiaInstruments, defaultInstrument, SEGMENTS, type Segment } from '../util'
import type { ChecklistEntry, Direction } from '../types'
import { Modal } from '../components/Modal'
import { Combobox } from '../components/Combobox'
import { NumberStepper } from '../components/NumberStepper'
import { RiskCalculator } from '../components/RiskCalculator'
import { useToast } from '../components/Toast'
import { useAccountScope } from '../accounts'
import { useAppMode, marketOf } from '../mode'
import { format } from 'date-fns'

function compliancePct(e: ChecklistEntry) {
  if (!e.items.length) return 0
  return Math.round((e.items.filter((i) => i.checked).length / e.items.length) * 100)
}

export default function PreTrade() {
  const allEntries = useLiveQuery(() => db.checklistEntries.orderBy('serial').reverse().toArray(), [], [])
  const templates = useLiveQuery(() => db.checklists.toArray(), [], [])
  const [editing, setEditing] = useState<ChecklistEntry | null>(null)
  const [showCalc, setShowCalc] = useState(false)
  const { currency, startingBalance } = useAccountScope()
  const { mode } = useAppMode()
  const toast = useToast()

  const entries = (allEntries ?? []).filter((e) => marketOf(e) === mode)

  async function openNew() {
    const serial = await nextChecklistSerial()
    const firstTemplate = templates?.[0]
    setEditing({
      id: crypto.randomUUID(),
      serial,
      market: mode,
      segment: mode === 'india' ? 'equity' : undefined,
      date: format(new Date(), 'yyyy-MM-dd'),
      time: format(new Date(), 'HH:mm'),
      pair: defaultInstrument(mode),
      direction: 'long',
      bias: '',
      checklistId: firstTemplate?.id ?? '',
      checklistName: firstTemplate?.name ?? '',
      items: (firstTemplate?.items ?? []).map((it) => ({ itemId: it.id, text: it.text, checked: false })),
      notes: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  async function remove(id: string) {
    if (!confirm('Delete this pre-trade checklist entry?')) return
    await db.checklistEntries.delete(id)
    toast('Entry deleted')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pre-Trade Checklist</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => setShowCalc(true)}>🧮 Risk calc</button>
          <button className="btn primary" onClick={openNew} disabled={!templates || templates.length === 0}>
            ＋ New pre-trade check
          </button>
        </div>
      </div>

      {showCalc && <RiskCalculator balance={startingBalance} currency={currency} onClose={() => setShowCalc(false)} />}

      {templates && templates.length === 0 && (
        <div className="empty">
          <div className="big">📋</div>
          <p>Create a checklist template first on the <strong>Checklists</strong> page, then come back to run it before a trade.</p>
        </div>
      )}

      {templates && templates.length > 0 && (!entries || entries.length === 0) && (
        <div className="empty">
          <div className="big">✅</div>
          <p>No pre-trade checks yet. Before your next trade, run your checklist and save it here.</p>
          <button className="btn primary" onClick={openNew}>＋ New pre-trade check</button>
        </div>
      )}

      {entries && entries.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Pair</th>
                <th>Dir</th>
                <th>Checklist</th>
                <th>Score</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const pct = compliancePct(e)
                return (
                  <tr key={e.id} onClick={() => setEditing(structuredClone(e))}>
                    <td><strong>#{e.serial}</strong></td>
                    <td>{format(new Date(e.date + 'T00:00'), 'dd MMM yy')}</td>
                    <td><strong>{e.pair}</strong></td>
                    <td><span className={e.direction === 'short' ? 'dir-sell' : 'dir-buy'}>{e.direction === 'short' ? '▼' : '▲'}</span></td>
                    <td className="muted">{e.checklistName}</td>
                    <td>
                      <div className="row" style={{ gap: 8, minWidth: 120 }}>
                        <div className="compliance-bar" style={{ flex: 1 }}><div style={{ width: pct + '%' }} /></div>
                        <span className="muted" style={{ fontSize: 12 }}>{pct}%</span>
                      </div>
                    </td>
                    <td>
                      {e.linkedTradeId
                        ? <span className="badge win">Linked</span>
                        : <span className="badge open">Pending</span>}
                    </td>
                    <td><button className="icon-btn" title="Delete" onClick={(ev) => { ev.stopPropagation(); remove(e.id) }}>🗑️</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PreTradeEditor
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); toast('Pre-trade check saved') }}
        />
      )}
    </>
  )
}

function PreTradeEditor({
  value,
  onClose,
  onSaved,
}: {
  value: ChecklistEntry
  onClose: () => void
  onSaved: () => void
}) {
  const templates = useLiveQuery(() => db.checklists.toArray(), [], [])
  const [e, setE] = useState<ChecklistEntry>(value)

  function set<K extends keyof ChecklistEntry>(key: K, v: ChecklistEntry[K]) {
    setE((prev) => ({ ...prev, [key]: v }))
  }

  // When user picks a different checklist template, load its items fresh.
  function pickTemplate(id: string) {
    const tpl = templates?.find((c) => c.id === id)
    if (!tpl) return
    setE((prev) => ({
      ...prev,
      checklistId: tpl.id,
      checklistName: tpl.name,
      items: tpl.items.map((it) => ({ itemId: it.id, text: it.text, checked: false })),
    }))
  }

  function toggle(itemId: string) {
    setE((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.itemId === itemId ? { ...it, checked: !it.checked } : it)),
    }))
  }

  const pct = e.items.length ? Math.round((e.items.filter((i) => i.checked).length / e.items.length) * 100) : 0

  async function save() {
    if (!e.checklistId) return alert('Pick a checklist to run.')
    await db.checklistEntries.put({ ...e, updatedAt: Date.now() })
    onSaved()
  }

  return (
    <Modal
      title={`Pre-Trade Check #${e.serial}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save check</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Date</label>
          <input className="input" type="date" value={e.date} onChange={(ev) => set('date', ev.target.value)} />
        </div>
        <div className="field">
          <label>Time</label>
          <input className="input" type="time" value={e.time ?? ''} onChange={(ev) => set('time', ev.target.value)} />
        </div>
        {marketOf(e) === 'india' && (
          <div className="field">
            <label>Segment</label>
            <select className="select" value={e.segment ?? 'equity'} onChange={(ev) => set('segment', ev.target.value as Segment)}>
              {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label>{marketOf(e) === 'india' ? ((e.segment ?? 'equity') === 'commodity' ? 'Commodity' : 'Instrument / Underlying') : 'Pair / Instrument'}</label>
          <Combobox
            value={e.pair}
            onChange={(v) => set('pair', v)}
            options={marketOf(e) === 'india' ? indiaInstruments(e.segment ?? 'equity') : instrumentsFor('forex')}
            placeholder={marketOf(e) === 'india' ? 'Search index, stock or commodity…' : 'Search pair…'}
          />
        </div>
        <div className="field">
          <label>Bias</label>
          <div className="seg">
            <button className={e.direction === 'long' ? 'active' : ''} onClick={() => set('direction', 'long' as Direction)}>▲ Bullish</button>
            <button className={e.direction === 'short' ? 'active' : ''} onClick={() => set('direction', 'short' as Direction)}>▼ Bearish</button>
          </div>
        </div>
      </div>

      {marketOf(e) === 'india' && (e.segment ?? 'equity') === 'options' && (
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Call / Put</label>
            <div className="seg">
              <button className={e.optionType === 'CE' ? 'active' : ''} onClick={() => set('optionType', 'CE')}>Call (CE)</button>
              <button className={e.optionType === 'PE' ? 'active' : ''} onClick={() => set('optionType', 'PE')}>Put (PE)</button>
            </div>
          </div>
          <div className="field"><label>Strike</label><NumberStepper value={e.strike} onChange={(v) => set('strike', v)} step={50} min={0} placeholder="e.g. 25000" /></div>
          <div className="field"><label>Expiry</label><input className="input" type="date" value={e.expiry ?? ''} onChange={(ev) => set('expiry', ev.target.value)} /></div>
        </div>
      )}

      <div className="field" style={{ margin: '18px 0' }}>
        <label>Which checklist are you running?</label>
        <select className="select" value={e.checklistId} onChange={(ev) => pickTemplate(ev.target.value)}>
          <option value="">— Select a checklist —</option>
          {templates?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {e.items.length > 0 && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <strong>{e.checklistName}</strong>
            <div className="row" style={{ gap: 8, minWidth: 150 }}>
              <div className="compliance-bar" style={{ flex: 1 }}><div style={{ width: pct + '%' }} /></div>
              <span className="muted" style={{ fontSize: 13 }}>{pct}%</span>
            </div>
          </div>
          {e.items.map((it) => (
            <div className="check-row" key={it.itemId} onClick={() => toggle(it.itemId)} style={{ cursor: 'pointer' }}>
              <div className={'checkbox' + (it.checked ? ' checked' : '')}>{it.checked ? '✓' : ''}</div>
              <span style={{ flex: 1 }}>{it.text}</span>
            </div>
          ))}
        </>
      )}

      <div className="field full" style={{ marginTop: 16 }}>
        <label>Notes (setup idea, confluences…)</label>
        <textarea className="textarea" value={e.notes ?? ''} onChange={(ev) => set('notes', ev.target.value)} placeholder="What's the plan for this trade?" />
      </div>
    </Modal>
  )
}
