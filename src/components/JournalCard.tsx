import { useMemo, useState } from 'react'
import { db, saveJournalEntry, deleteJournalEntry } from '../db'
import { useLiveQuery } from '../util'
import { Modal } from './Modal'
import { useToast } from './Toast'
import type { JournalEntry } from '../types'
import { format } from 'date-fns'

const MOODS = ['😖', '😕', '😐', '🙂', '😄']
const todayStr = () => format(new Date(), 'yyyy-MM-dd')

export function JournalCard() {
  const entries = useLiveQuery(() => db.journal.toArray(), [], [])
  const [open, setOpen] = useState(false)

  const sorted = useMemo(
    () => [...(entries ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)),
    [entries],
  )
  const today = sorted.find((e) => e.date === todayStr())

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>📓 Daily journal</h3>
        <button className="btn sm primary" onClick={() => setOpen(true)}>{today ? 'Open journal' : 'Write today'}</button>
      </div>
      {today ? (
        <p style={{ marginBottom: 0 }}>
          <span style={{ fontSize: 20, marginRight: 8 }}>{today.mood ? MOODS[today.mood - 1] : '📝'}</span>
          <span className="muted">{today.text.slice(0, 140) || 'No note written yet.'}{today.text.length > 140 ? '…' : ''}</span>
        </p>
      ) : (
        <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
          {sorted.length > 0 ? `${sorted.length} past entr${sorted.length === 1 ? 'y' : 'ies'}.` : 'No entries yet.'}
        </p>
      )}
      {open && <JournalModal entries={sorted} onClose={() => setOpen(false)} />}
    </div>
  )
}

function JournalModal({ entries, onClose }: { entries: JournalEntry[]; onClose: () => void }) {
  const toast = useToast()
  const existingToday = entries.find((e) => e.date === todayStr())
  const [date, setDate] = useState(todayStr())
  const [text, setText] = useState(existingToday?.text ?? '')
  const [mood, setMood] = useState<number>(existingToday?.mood ?? 3)

  // load an entry for the chosen date into the editor
  function loadDate(d: string) {
    setDate(d)
    const e = entries.find((x) => x.date === d)
    setText(e?.text ?? '')
    setMood(e?.mood ?? 3)
  }

  async function save() {
    const existing = entries.find((e) => e.date === date)
    await saveJournalEntry({
      id: existing?.id ?? crypto.randomUUID(),
      date,
      mood,
      text: text.trim(),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })
    toast('Journal saved')
  }

  async function remove(e: JournalEntry) {
    if (!confirm(`Delete the journal entry for ${format(new Date(e.date + 'T00:00'), 'dd MMM yyyy')}?`)) return
    await deleteJournalEntry(e.id)
    if (e.date === date) { setText(''); setMood(3) }
    toast('Entry deleted')
  }

  return (
    <Modal
      title="📓 Daily journal"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={save} disabled={!text.trim()}>Save entry</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Date</label>
          <input className="input" type="date" value={date} max={todayStr()} onChange={(e) => loadDate(e.target.value)} />
        </div>
        <div className="field">
          <label>How did the day feel?</label>
          <div className="mood-row">
            {MOODS.map((m, i) => (
              <button key={i} className={'mood-btn' + (mood === i + 1 ? ' on' : '')} onClick={() => setMood(i + 1)} type="button">{m}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="field full" style={{ marginTop: 14 }}>
        <label>Reflection</label>
        <textarea className="textarea" style={{ minHeight: 130 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="What went well? What did I follow / break in my plan? How was my discipline and emotion?" />
      </div>

      {entries.length > 0 && (
        <>
          <h4 style={{ margin: '18px 0 8px' }}>Past entries</h4>
          <div className="journal-list">
            {entries.map((e) => (
              <div key={e.id} className={'journal-item' + (e.date === date ? ' active' : '')} onClick={() => loadDate(e.date)}>
                <span className="jm">{e.mood ? MOODS[e.mood - 1] : '📝'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{format(new Date(e.date + 'T00:00'), 'EEE, dd MMM yyyy')}</div>
                  <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.text || '—'}</div>
                </div>
                <button className="icon-btn" onClick={(ev) => { ev.stopPropagation(); remove(e) }} title="Delete">🗑️</button>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}
