import Dexie, { type Table } from 'dexie'
import type { Trade, Checklist, Settings } from './types'

export class JournalDB extends Dexie {
  trades!: Table<Trade, string>
  checklists!: Table<Checklist, string>
  settings!: Table<Settings, string>

  constructor() {
    super('fx-journal')
    this.version(1).stores({
      trades: 'id, date, pair, outcome, session, strategy, createdAt',
      checklists: 'id, name, createdAt',
      settings: 'id',
    })
  }
}

export const db = new JournalDB()

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
      description: 'Confirm before entering any position.',
      createdAt: now,
      updatedAt: now,
      items: [
        { id: crypto.randomUUID(), text: 'Higher timeframe trend identified' },
        { id: crypto.randomUUID(), text: 'Key support/resistance marked' },
        { id: crypto.randomUUID(), text: 'Clear entry trigger present' },
        { id: crypto.randomUUID(), text: 'Stop loss placed at logical level' },
        { id: crypto.randomUUID(), text: 'Risk is <= 1-2% of account' },
        { id: crypto.randomUUID(), text: 'Risk:Reward is at least 1:2' },
        { id: crypto.randomUUID(), text: 'No high-impact news imminent' },
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

// ---------- Backup / restore ----------
export async function exportAll() {
  const [trades, checklists, settings] = await Promise.all([
    db.trades.toArray(),
    db.checklists.toArray(),
    db.settings.toArray(),
  ])
  return { version: 1, exportedAt: new Date().toISOString(), trades, checklists, settings }
}

export async function importAll(data: any, mode: 'merge' | 'replace' = 'merge') {
  if (!data || !Array.isArray(data.trades)) throw new Error('Invalid backup file')
  await db.transaction('rw', db.trades, db.checklists, db.settings, async () => {
    if (mode === 'replace') {
      await Promise.all([db.trades.clear(), db.checklists.clear()])
    }
    if (Array.isArray(data.trades)) await db.trades.bulkPut(data.trades)
    if (Array.isArray(data.checklists)) await db.checklists.bulkPut(data.checklists)
    if (Array.isArray(data.settings)) await db.settings.bulkPut(data.settings)
  })
}
