import { db, getSettings } from './db'
import { useLiveQuery } from './util'
import type { Account, AccountType, Trade } from './types'

export const ACCOUNT_TYPES: { value: AccountType; label: string; short: string }[] = [
  { value: 'evaluation', label: 'Evaluation / Challenge', short: 'Eval' },
  { value: 'funded', label: 'Funded', short: 'Funded' },
  { value: 'live', label: 'Live', short: 'Live' },
  { value: 'demo', label: 'Demo', short: 'Demo' },
  { value: 'other', label: 'Other', short: 'Other' },
]

export const ACCOUNT_COLORS = [
  '#e8b458', '#3ddc97', '#5b8cff', '#c084fc',
  '#fb6f8d', '#43c6d8', '#f59e0b', '#a3e635',
]

export function accountTypeLabel(t: AccountType): string {
  return ACCOUNT_TYPES.find((x) => x.value === t)?.short ?? 'Other'
}

// Restrict a list of trades to the active account ('all' = combined).
export function scopeTrades(trades: Trade[], activeId: string): Trade[] {
  if (!activeId || activeId === 'all') return trades
  return trades.filter((t) => t.accountId === activeId)
}

// Live view of accounts + the active-account scope (currency + starting balance).
export function useAccountScope() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('createdAt').toArray(), [], [])
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const list = accounts ?? []
  const activeId = settings?.activeAccountId ?? 'all'
  const account = list.find((a) => a.id === activeId)
  const globalCurrency = settings?.accountCurrency ?? 'USD'
  const currency = account?.currency || globalCurrency
  const startingBalance =
    activeId === 'all'
      ? list.reduce((s, a) => s + (a.startingBalance || 0), 0)
      : account?.startingBalance ?? settings?.startingBalance ?? 0

  return { accounts: list, settings, activeId, account, currency, startingBalance, ready: !!settings }
}
