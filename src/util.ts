import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'

// Lightweight replacement for dexie-react-hooks useLiveQuery.
export function useLiveQuery<T>(querier: () => Promise<T> | T, deps: any[] = [], initial?: T) {
  const [value, setValue] = useState<T | undefined>(initial)
  useEffect(() => {
    const sub = liveQuery(querier).subscribe({
      next: (v) => setValue(v),
      error: (e) => console.error('liveQuery error', e),
    })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

export function fmtMoney(n: number | undefined, currency = 'USD'): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return n.toFixed(2)
  }
}

export function fmtNum(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  if (!Number.isFinite(n)) return '∞'
  return n.toFixed(digits)
}

export function fmtPct(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toFixed(1) + '%'
}

export const CURRENCY_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD', 'AUD/USD', 'NZD/USD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'EUR/AUD', 'GBP/AUD', 'EUR/CAD',
  'XAU/USD', 'XAG/USD', 'BTC/USD', 'ETH/USD', 'US30', 'NAS100', 'SPX500',
]

export const SESSIONS: { value: string; label: string }[] = [
  { value: 'sydney', label: 'Sydney' },
  { value: 'tokyo', label: 'Tokyo' },
  { value: 'london', label: 'London' },
  { value: 'newyork', label: 'New York' },
  { value: 'other', label: 'Other' },
]

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
