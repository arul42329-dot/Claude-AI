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

// Indian-market instruments, grouped by segment.
export const INDIA_INDICES_LIST = ['NIFTY 50', 'BANK NIFTY', 'FIN NIFTY', 'NIFTY MIDCAP 50', 'SENSEX']
export const INDIA_STOCKS = [
  'RELIANCE', 'HDFC BANK', 'ICICI BANK', 'SBIN', 'AXIS BANK', 'KOTAK BANK',
  'INFOSYS', 'TCS', 'HCL TECH', 'WIPRO', 'ITC', 'HINDUSTAN UNILEVER',
  'BAJAJ FINANCE', 'LARSEN & TOUBRO', 'BHARTI AIRTEL', 'MARUTI SUZUKI',
  'TATA MOTORS', 'TATA STEEL', 'ADANI ENTERPRISES', 'SUN PHARMA', 'TITAN',
  'ASIAN PAINTS', 'NTPC', 'POWER GRID', 'ONGC', 'COAL INDIA',
]
// MCX commodities (logged as instruments; no free keyless live feed to price them).
export const INDIA_COMMODITIES = [
  'GOLD', 'GOLD MINI', 'SILVER', 'SILVER MINI', 'CRUDE OIL', 'NATURAL GAS',
  'COPPER', 'ZINC', 'ALUMINIUM', 'LEAD', 'NICKEL', 'COTTON', 'MENTHA OIL',
]

export type Segment = 'equity' | 'futures' | 'options' | 'commodity'

export const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'equity', label: 'Equity / Index' },
  { value: 'futures', label: 'Futures' },
  { value: 'options', label: 'Options' },
  { value: 'commodity', label: 'Commodity (MCX)' },
]

// Instruments to suggest for a given India segment.
// Options & futures can be on indices, stocks OR commodities, so they list all.
export function indiaInstruments(segment: Segment = 'equity'): string[] {
  if (segment === 'commodity') return INDIA_COMMODITIES
  if (segment === 'options' || segment === 'futures') return [...INDIA_INDICES_LIST, ...INDIA_STOCKS, ...INDIA_COMMODITIES]
  return [...INDIA_INDICES_LIST, ...INDIA_STOCKS]
}

// Combined India list for generic/backward-compatible uses.
export const INDIA_INSTRUMENTS = [...INDIA_INDICES_LIST, ...INDIA_STOCKS, ...INDIA_COMMODITIES]

// The instrument list + sensible default for the given app mode.
export function instrumentsFor(mode: 'forex' | 'india'): string[] {
  return mode === 'india' ? INDIA_INSTRUMENTS : CURRENCY_PAIRS
}
export function defaultInstrument(mode: 'forex' | 'india'): string {
  return mode === 'india' ? 'NIFTY 50' : 'EUR/USD'
}

// Display label for a trade/entry instrument — appends strike + CE/PE for options.
export function instrumentLabel(t: { pair: string; segment?: string; optionType?: string; strike?: number }): string {
  if (t.segment === 'options' && (t.strike != null || t.optionType)) {
    return `${t.pair} ${t.strike ?? ''}${t.optionType ?? ''}`.trim()
  }
  return t.pair
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
