import Dexie, { type Table } from 'dexie'
import type { Trade, Checklist, Settings, ChecklistEntry, Account, JournalEntry } from './types'

export class JournalDB extends Dexie {
  trades!: Table<Trade, string>
  checklists!: Table<Checklist, string>
  checklistEntries!: Table<ChecklistEntry, string>
  accounts!: Table<Account, string>
  journal!: Table<JournalEntry, string>
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
    // v3 adds multiple trading accounts; trades gain an accountId index.
    this.version(3).stores({
      trades: 'id, date, pair, outcome, session, strategy, createdAt, serial, checklistSerial, accountId',
      checklists: 'id, name, createdAt',
      checklistEntries: 'id, serial, date, pair, linkedTradeId, createdAt',
      accounts: 'id, name, type, createdAt, archived',
      settings: 'id',
    })
    // v4 adds a daily reflection journal table.
    this.version(4).stores({
      trades: 'id, date, pair, outcome, session, strategy, createdAt, serial, checklistSerial, accountId',
      checklists: 'id, name, createdAt',
      checklistEntries: 'id, serial, date, pair, linkedTradeId, createdAt',
      accounts: 'id, name, type, createdAt, archived',
      journal: 'id, date, createdAt',
      settings: 'id',
    })
  }
}

export const db = new JournalDB()

// ---------- Accounts ----------
// Ensure at least one account exists and that every trade is assigned to one.
// Robust for both fresh installs and upgrades from v1/v2.
export async function ensureAccounts(): Promise<void> {
  const count = await db.accounts.count()
  let defaultId: string

  if (count === 0) {
    const s = await getSettings()
    const acc: Account = {
      id: crypto.randomUUID(),
      name: 'Main',
      type: 'live',
      startingBalance: s.startingBalance ?? 10000,
      color: '#e8b458',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.accounts.add(acc)
    defaultId = acc.id
  } else {
    const first = await db.accounts.orderBy('createdAt').first()
    defaultId = first!.id
  }

  // Backfill any trades that don't yet have an accountId.
  const orphans = await db.trades.filter((t) => !t.accountId).toArray()
  if (orphans.length) {
    await db.trades.bulkPut(orphans.map((t) => ({ ...t, accountId: defaultId })))
  }

  // Make sure settings has an active-account selection.
  const s = await getSettings()
  if (!s.activeAccountId) {
    await saveSettings({ ...s, activeAccountId: 'all' })
  }
}

export async function listAccounts(): Promise<Account[]> {
  return db.accounts.orderBy('createdAt').toArray()
}

export async function saveAccount(a: Account): Promise<void> {
  await db.accounts.put({ ...a, updatedAt: Date.now() })
}

// Deletes an account and ALL trades journalled under it.
export async function deleteAccount(id: string): Promise<void> {
  await db.transaction('rw', db.trades, db.accounts, async () => {
    await db.trades.where('accountId').equals(id).delete()
    await db.accounts.delete(id)
  })
}

export async function setActiveAccount(id: string): Promise<void> {
  const s = await getSettings()
  await saveSettings({ ...s, activeAccountId: id })
}

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
  activeAccountId: 'all',
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
      isDefault: true,
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
      isDefault: true,
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

// The names of the checklists that ship with the app. These are treated as
// "default" and are preserved when the user clears all their data.
const DEFAULT_CHECKLIST_NAMES = ['Pre-Trade Checklist', 'Psychology Checklist']

// One-time update so existing installs pick up the current default Pre-Trade
// checklist. Bump SEED_VERSION whenever the default routine changes.
const SEED_VERSION = 4
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
    pre.isDefault = true
    pre.updatedAt = now
    await db.checklists.put(pre)
  } else {
    await db.checklists.put({
      id: crypto.randomUUID(),
      name: 'Pre-Trade Checklist',
      description: 'My step-by-step routine before entering any position.',
      isDefault: true,
      items,
      createdAt: now,
      updatedAt: now,
    })
  }

  // Flag any shipped default checklists (e.g. Psychology) so they survive a
  // "Clear all data" — for installs created before the isDefault flag existed.
  const toFlag = all.filter((c) => DEFAULT_CHECKLIST_NAMES.includes(c.name) && !c.isDefault && c.name !== 'Pre-Trade Checklist')
  if (toFlag.length) {
    await db.checklists.bulkPut(toFlag.map((c) => ({ ...c, isDefault: true, updatedAt: now })))
  }

  localStorage.setItem(KEY, String(SEED_VERSION))
}

// ---------- Daily journal ----------
export async function listJournal(): Promise<JournalEntry[]> {
  const all = await db.journal.toArray()
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
}
export async function saveJournalEntry(e: JournalEntry): Promise<void> {
  await db.journal.put({ ...e, updatedAt: Date.now() })
}
export async function deleteJournalEntry(id: string): Promise<void> {
  await db.journal.delete(id)
}

// ---------- Clear user data (keeps default checklists + accounts + settings) ----------
export async function wipeUserData(): Promise<void> {
  await db.transaction('rw', db.trades, db.checklists, db.checklistEntries, db.journal, async () => {
    await db.trades.clear()
    await db.checklistEntries.clear()
    await db.journal.clear()
    const custom = await db.checklists.filter((c) => !c.isDefault).toArray()
    if (custom.length) await db.checklists.bulkDelete(custom.map((c) => c.id))
  })
  // Restore the default checklists if somehow none remain.
  const remaining = await db.checklists.count()
  if (remaining === 0) await seedIfEmpty()
}

// ---------- CSV export ----------
export async function tradesToCsv(): Promise<string> {
  const [trades, accounts] = await Promise.all([db.trades.toArray(), db.accounts.toArray()])
  const acctName = new Map(accounts.map((a) => [a.id, a.name]))
  const cols = [
    'serial', 'date', 'time', 'account', 'pair', 'direction', 'session', 'strategy',
    'entryPrice', 'exitPrice', 'stopLoss', 'takeProfit', 'lotSize', 'riskPercent',
    'riskReward', 'outcome', 'pips', 'pnl', 'emotion', 'rating', 'checklistSerial', 'tags', 'notes',
  ]
  const esc = (v: any) => {
    if (v === undefined || v === null) return ''
    const s = Array.isArray(v) ? v.join('; ') : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const rows = trades
    .sort((a, b) => (a.serial ?? 0) - (b.serial ?? 0))
    .map((t) => cols.map((c) => (c === 'account' ? esc(acctName.get(t.accountId ?? '') ?? '') : esc((t as any)[c]))).join(','))
  return [cols.join(','), ...rows].join('\n')
}

// ---------- Backup / restore ----------
export async function exportAll() {
  const [trades, checklists, checklistEntries, accounts, journal, settings] = await Promise.all([
    db.trades.toArray(),
    db.checklists.toArray(),
    db.checklistEntries.toArray(),
    db.accounts.toArray(),
    db.journal.toArray(),
    db.settings.toArray(),
  ])
  return { version: 4, exportedAt: new Date().toISOString(), trades, checklists, checklistEntries, accounts, journal, settings }
}

export async function importAll(data: any, mode: 'merge' | 'replace' = 'merge') {
  if (!data || !Array.isArray(data.trades)) throw new Error('Invalid backup file')
  await db.transaction('rw', [db.trades, db.checklists, db.checklistEntries, db.accounts, db.journal, db.settings], async () => {
    if (mode === 'replace') {
      await Promise.all([db.trades.clear(), db.checklists.clear(), db.checklistEntries.clear(), db.accounts.clear(), db.journal.clear()])
    }
    if (Array.isArray(data.trades)) await db.trades.bulkPut(data.trades)
    if (Array.isArray(data.checklists)) await db.checklists.bulkPut(data.checklists)
    if (Array.isArray(data.checklistEntries)) await db.checklistEntries.bulkPut(data.checklistEntries)
    if (Array.isArray(data.accounts)) await db.accounts.bulkPut(data.accounts)
    if (Array.isArray(data.journal)) await db.journal.bulkPut(data.journal)
    if (Array.isArray(data.settings)) await db.settings.bulkPut(data.settings)
  })
  await ensureAccounts()
}
