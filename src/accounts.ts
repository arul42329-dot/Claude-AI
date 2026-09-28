import { db, getSettings } from './db'
import { useLiveQuery } from './util'
import { useAppMode } from './mode'
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

// Which market (app mode) an account belongs to (absent = forex).
export function accountMarket(a: Account): 'forex' | 'india' {
  return a.market === 'india' ? 'india' : 'forex'
}

// Live view of accounts + the active-account scope for the CURRENT app mode.
// India and forex have fully separate account lists, active selection and
// currency (India is always INR).
export function useAccountScope() {
  const { mode } = useAppMode()
  const accounts = useLiveQuery(() => db.accounts.orderBy('createdAt').toArray(), [], [])
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const list = (accounts ?? []).filter((a) => accountMarket(a) === mode)
  const activeId = (mode === 'india' ? settings?.activeAccountIdIndia : settings?.activeAccountId) ?? 'all'
  const account = list.find((a) => a.id === activeId)
  const globalCurrency = mode === 'india' ? 'INR' : (settings?.accountCurrency ?? 'USD')
  const currency = mode === 'india' ? 'INR' : (account?.currency || globalCurrency)
  const startingBalance =
    activeId === 'all'
      ? list.reduce((s, a) => s + (a.startingBalance || 0), 0)
      : account?.startingBalance ?? (mode === 'india' ? 0 : settings?.startingBalance ?? 0)

  return { accounts: list, settings, activeId, account, currency, startingBalance, mode, ready: !!settings }
}
