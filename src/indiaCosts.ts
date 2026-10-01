// India trading defaults — per-instrument lot sizes and brokerage, set once in
// Settings and pre-filled into every trade form. Stored in localStorage so no
// DB migration is needed; the trade form snapshots values at save time so
// later changes here never rewrite history.

const KEY = 'edgefolio-india-defaults'

export interface IndiaDefaults {
  // qty per lot per instrument (upper-case name, e.g. 'NIFTY 50': 75)
  lotSizes: Record<string, number>
  // Options brokerage: flat ₹ per completed leg (buy leg + sell leg).
  brokerageOptionsBuy: number
  brokerageOptionsSell: number
  // Flat ₹ per trade for futures / equity / commodity segments.
  brokerageFlat: number
}

// SEBI lot sizes (editable in Settings — these are just pre-fills).
export const DEFAULT_LOT_SIZES: Record<string, number> = {
  'NIFTY 50': 75,
  'BANK NIFTY': 35,
  'FIN NIFTY': 65,
  'NIFTY MIDCAP 50': 120,
  'SENSEX': 20,
  'GOLD': 100,
  'GOLD MINI': 10,
  'SILVER': 30,
  'SILVER MINI': 5,
  'CRUDE OIL': 100,
  'CRUDE OIL MINI': 10,
  'NATURAL GAS': 1250,
  'COPPER': 2500,
  'ZINC': 5000,
  'ALUMINIUM': 5000,
}

export const DEFAULT_INDIA_DEFAULTS: IndiaDefaults = {
  lotSizes: { ...DEFAULT_LOT_SIZES },
  brokerageOptionsBuy: 5,
  brokerageOptionsSell: 5,
  brokerageFlat: 0,
}

export function getIndiaDefaults(): IndiaDefaults {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        lotSizes: { ...DEFAULT_LOT_SIZES, ...(p.lotSizes ?? {}) },
        brokerageOptionsBuy: typeof p.brokerageOptionsBuy === 'number' ? p.brokerageOptionsBuy : 5,
        brokerageOptionsSell: typeof p.brokerageOptionsSell === 'number' ? p.brokerageOptionsSell : 5,
        brokerageFlat: typeof p.brokerageFlat === 'number' ? p.brokerageFlat : 0,
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_INDIA_DEFAULTS, lotSizes: { ...DEFAULT_LOT_SIZES } }
}

export function saveIndiaDefaults(d: IndiaDefaults): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* ignore */ }
}

// Lot size for an instrument (falls back to 1 so the form always has a value).
export function lotSizeFor(pair: string): number {
  const d = getIndiaDefaults()
  return d.lotSizes[(pair || '').trim().toUpperCase()] ?? 1
}

// Brokerage for a trade, from the user's saved defaults.
// Options: flat per ORDER — the buy leg + the sell leg (₹5 + ₹5 = ₹10 per
// completed trade, regardless of lot count — how discount brokers charge).
export function brokerageFor(pair: string, segment: 'equity' | 'futures' | 'options' | 'commodity' | undefined, _lots?: number): number {
  const d = getIndiaDefaults()
  if (segment === 'options') return d.brokerageOptionsBuy + d.brokerageOptionsSell
  return d.brokerageFlat
}
