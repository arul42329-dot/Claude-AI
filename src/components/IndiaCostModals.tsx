// India cost settings — lot sizes & brokerage — as standalone dialogs opened
// from the Trades tab (next to Day tax), so the whole India cost model is
// editable in one place. Moved out of Settings.

import { useState } from 'react'
import { getIndiaDefaults, saveIndiaDefaults } from '../indiaCosts'
import { Modal } from './Modal'
import { useToast } from './Toast'

// Lot size per instrument (quantity in one lot). Auto-fills the trade form
// and drives quantity = lots × lot size everywhere.
export function LotSizesModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [d, setD] = useState(() => getIndiaDefaults())
  // Lot editor: null = closed; { original } = editing, undefined original = adding.
  const [editor, setEditor] = useState<{ original?: string; name: string; qty: number } | null>(null)

  function persist(next: ReturnType<typeof getIndiaDefaults>) {
    setD(next)
    saveIndiaDefaults(next)
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
    <Modal
      title="Lot sizes"
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}
    >
      <div className="field">
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
  )
}

// Brokerage rates. Options are flat per ORDER leg (buy leg + sell leg — never
// multiplied by lots); futures / equity / commodity are flat per trade.
export function BrokerageModal({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState(() => getIndiaDefaults())

  function setBrokerage(patch: Partial<ReturnType<typeof getIndiaDefaults>>) {
    const next = { ...d, ...patch }
    setD(next)
    saveIndiaDefaults(next)
  }

  return (
    <Modal
      title="Brokerage"
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}
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
    </Modal>
  )
}
