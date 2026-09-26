import Dexie, { type Table } from 'dexie'
import type { Trade, Checklist, Settings, ChecklistEntry } from './types'

export class JournalDB extends Dexie {
  trades!: Table<Trade, string>
  checklists!: Table<Checklist, string>
  checklistEntries!: Table<ChecklistEntry, string>
  settings!: Table<Settings, string>

  constructor() {
    super('fx-journal')
    this.version(1).stores({
      trades: 'id, date, pair, outcome, session, strategy, createdAt',
      checklists: 'id, name, createdAt',
      settings: 'id',
    })
    // v2 adds pre-trade checklist entries + serial indexes for linking.
    this.version(2).stores({
      trades: 'id, date, pair, outcome, session, strategy, createdAt, serial, checklistSerial',
      checklists: 'id, name, createdAt',
      checklistEntries: 'id, serial, date, pair, linkedTradeId, createdAt',
      settings: 'id',
    })
  }
}

export const db = new JournalDB()

// ---------- Serial numbers ----------
export async function nextChecklistSerial(): Promise<number> {
  const last = await db.checklistEntries.orderBy('serial').last()
  return (last?.serial ?? 0) + 1
}

export async function nextTradeSerial(): Promise<number> {
  const all = await db.trades.toArray()
  const max = all.reduce((m, t) => Math.max(m, t.serial ?? 0), 0)
  return max + 1
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  accountCurrency: 'USD',
  startingBalance: 10000,
  theme: 'dark',
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('app')
  if (!s) {
    await db.settings.put(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
  return s
}

export async function saveSettings(s: Settings) {
  await db.settings.put({ ...s, id: 'app' })
}

// ---------- Seed data ----------
// Seed a couple of starter checklists so the "create your own" feature is discoverable.
export async function seedIfEmpty() {
  const count = await db.checklists.count()
  if (count > 0) return
  const now = Date.now()
  await db.checklists.bulkPut([
    {
      id: crypto.randomUUID(),
      name: 'Pre-Trade Checklist',
      description: 'My step-by-step routine before entering any position.',
      createdAt: now,
      updatedAt: now,
      items: [
        { id: crypto.randomUUID(), text: 'Check bias (HTF directional bias — bullish / bearish)' },
        { id: crypto.randomUUID(), text: 'Mark key zones: session highs/lows and previous day high/low' },
        { id: crypto.randomUUID(), text: 'Check for a Market Structure Shift (MSS / BOS)' },
        { id: crypto.randomUUID(), text: 'Look for an Order Block or Fair Value Gap (FVG) for the entry' },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Psychology Checklist',
      description: 'Am I in the right state to trade?',
      createdAt: now,
      updatedAt: now,
      items: [
        { id: crypto.randomUUID(), text: 'Not revenge trading' },
        { id: crypto.randomUUID(), text: 'Following my plan, not FOMO' },
        { id: crypto.randomUUID(), text: 'Calm and focused' },
        { id: crypto.randomUUID(), text: 'Accepting the risk fully' },
      ],
    },
  ])
}

// One-time update so existing installs pick up the current default Pre-Trade
// checklist. Bump SEED_VERSION whenever the default routine changes.
const SEED_VERSION = 3
const DEFAULT_PRETRADE_ITEMS = [
  'Check bias (HTF directional bias — bullish / bearish)',
  'Mark key zones: session highs/lows and previous day high/low',
  'Check for a Market Structure Shift (MSS / BOS)',
  'Look for an Order Block or Fair Value Gap (FVG) for the entry',
]

export async function migrateDefaults() {
  const KEY = 'fx-seed-version'
  const current = Number(localStorage.getItem(KEY) || '1')
  if (current >= SEED_VERSION) return

  const all = await db.checklists.toArray()
  const pre = all.find((c) => c.name === 'Pre-Trade Checklist')
  const items = DEFAULT_PRETRADE_ITEMS.map((text) => ({ id: crypto.randomUUID(), text }))
  const now = Date.now()

  if (pre) {
    pre.description = 'My step-by-step routine before entering any position.'
    pre.items = items
    pre.updatedAt = now
    await db.checklists.put(pre)
  } else {
    await db.checklists.put({
      id: crypto.randomUUID(),
      name: 'Pre-Trade Checklist',
      description: 'My step-by-step routine before entering any position.',
      items,
      createdAt: now,
      updatedAt: now,
    })
  }
  localStorage.setItem(KEY, String(SEED_VERSION))
}

// ---------- Backup / restore ----------
export async function exportAll() {
  const [trades, checklists, checklistEntries, settings] = await Promise.all([
    db.trades.toArray(),
    db.checklists.toArray(),
    db.checklistEntries.toArray(),
    db.settings.toArray(),
  ])
  return { version: 2, exportedAt: new Date().toISOString(), trades, checklists, checklistEntries, settings }
}

export async function importAll(data: any, mode: 'merge' | 'replace' = 'merge') {
  if (!data || !Array.isArray(data.trades)) throw new Error('Invalid backup file')
  await db.transaction('rw', db.trades, db.checklists, db.checklistEntries, db.settings, async () => {
    if (mode === 'replace') {
      await Promise.all([db.trades.clear(), db.checklists.clear(), db.checklistEntries.clear()])
    }
    if (Array.isArray(data.trades)) await db.trades.bulkPut(data.trades)
    if (Array.isArray(data.checklists)) await db.checklists.bulkPut(data.checklists)
    if (Array.isArray(data.checklistEntries)) await db.checklistEntries.bulkPut(data.checklistEntries)
    if (Array.isArray(data.settings)) await db.settings.bulkPut(data.settings)
  })
}
