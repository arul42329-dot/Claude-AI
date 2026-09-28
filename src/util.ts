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

// Indian-market instruments offered when the app is in India mode — the major
// indices first, then widely-traded NSE large-caps.
export const INDIA_INSTRUMENTS = [
  'NIFTY 50', 'BANK NIFTY', 'FIN NIFTY', 'NIFTY MIDCAP 50', 'SENSEX',
  'RELIANCE', 'HDFC BANK', 'ICICI BANK', 'SBIN', 'AXIS BANK', 'KOTAK BANK',
  'INFOSYS', 'TCS', 'HCL TECH', 'WIPRO', 'ITC', 'HINDUSTAN UNILEVER',
  'BAJAJ FINANCE', 'LARSEN & TOUBRO', 'BHARTI AIRTEL', 'MARUTI SUZUKI',
  'TATA MOTORS', 'TATA STEEL', 'ADANI ENTERPRISES', 'SUN PHARMA', 'TITAN',
  'ASIAN PAINTS', 'NTPC', 'POWER GRID', 'ONGC', 'COAL INDIA',
]

// The instrument list + sensible default for the given app mode.
export function instrumentsFor(mode: 'forex' | 'india'): string[] {
  return mode === 'india' ? INDIA_INSTRUMENTS : CURRENCY_PAIRS
}
export function defaultInstrument(mode: 'forex' | 'india'): string {
  return mode === 'india' ? 'NIFTY 50' : 'EUR/USD'
}

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
