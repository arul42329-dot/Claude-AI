import { useState } from 'react'
import { db } from '../db'
import { useLiveQuery } from '../util'
import type { Checklist, ChecklistItem } from '../types'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

function emptyChecklist(): Checklist {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    items: [{ id: crypto.randomUUID(), text: '' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export default function Checklists() {
  const checklists = useLiveQuery(() => db.checklists.orderBy('createdAt').toArray(), [], [])
  const [editing, setEditing] = useState<Checklist | null>(null)
  const toast = useToast()

  async function remove(id: string) {
    if (!confirm('Delete this checklist? Trades already saved with it keep their recorded answers.')) return
    await db.checklists.delete(id)
    toast('Checklist deleted')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Checklists</h1>
        </div>
        <button className="btn primary" onClick={() => setEditing(emptyChecklist())}>
          ＋ New checklist
        </button>
      </div>

      {(!checklists || checklists.length === 0) && (
        <div className="empty">
          <div className="big">✅</div>
          <p>No checklists yet. Create your first one — e.g. a "Pre-Trade" or "Risk Management" checklist.</p>
          <button className="btn primary" onClick={() => setEditing(emptyChecklist())}>
            ＋ Create checklist
          </button>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {checklists?.map((c) => (
          <div className="card" key={c.id}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{c.name || 'Untitled'}</h3>
              <div className="row" style={{ gap: 4 }}>
                <button className="icon-btn" title="Edit" onClick={() => setEditing(structuredClone(c))}>✏️</button>
                <button className="icon-btn" title="Delete" onClick={() => remove(c.id)}>🗑️</button>
              </div>
            </div>
            {c.description && <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{c.description}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {c.items.map((it) => (
                <div key={it.id} className="row" style={{ gap: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-faint)' }}>▢</span>
                  <span>{it.text}</span>
                </div>
              ))}
            </div>
            <div className="chip" style={{ marginTop: 12 }}>{c.items.length} items</div>
          </div>
        ))}
      </div>

      {editing && (
        <ChecklistEditor
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast('Checklist saved')
          }}
        />
      )}
    </>
  )
}

function ChecklistEditor({
  value,
  onClose,
  onSaved,
}: {
  value: Checklist
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(value.name)
  const [description, setDescription] = useState(value.description ?? '')
  const [items, setItems] = useState<ChecklistItem[]>(value.items.length ? value.items : [{ id: crypto.randomUUID(), text: '' }])

  function updateItem(id: string, text: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, text } : it)))
  }
  function addItem() {
    setItems((prev) => [...prev, { id: crypto.randomUUID(), text: '' }])
  }
  function removeItem(id: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev))
  }
  function move(id: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id)
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
      return copy
    })
  }

  async function save() {
    const cleanItems = items.map((it) => ({ ...it, text: it.text.trim() })).filter((it) => it.text)
    if (!name.trim()) return alert('Please give the checklist a name.')
    if (cleanItems.length === 0) return alert('Add at least one checklist item.')
    await db.checklists.put({
      ...value,
      name: name.trim(),
      description: description.trim(),
      items: cleanItems,
      updatedAt: Date.now(),
    })
    onSaved()
  }

  return (
    <Modal
      title={value.name ? 'Edit checklist' : 'New checklist'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save checklist</button>
        </>
      }
    >
      <div className="field" style={{ marginBottom: 16 }}>
        <label>Checklist name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pre-Trade Checklist" autoFocus />
      </div>
      <div className="field" style={{ marginBottom: 20 }}>
        <label>Description (optional)</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When should I run this checklist?" />
      </div>

      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Checklist items
      </label>
      <div style={{ marginTop: 10 }}>
        {items.map((it, i) => (
          <div className="check-row" key={it.id}>
            <span className="muted" style={{ width: 18, textAlign: 'center' }}>{i + 1}</span>
            <input
              type="text"
              value={it.text}
              placeholder="Describe a rule to check…"
              onChange={(e) => updateItem(it.id, e.target.value)}
            />
            <button className="icon-btn" title="Move up" onClick={() => move(it.id, -1)}>↑</button>
            <button className="icon-btn" title="Move down" onClick={() => move(it.id, 1)}>↓</button>
            <button className="icon-btn" title="Remove" onClick={() => removeItem(it.id)}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn sm" onClick={addItem} style={{ marginTop: 6 }}>＋ Add item</button>
    </Modal>
  )
}
