// Option chain (Angel One) — the classic calls | strike | puts ladder for
// NIFTY / BANK NIFTY / FIN NIFTY, with LIVE LTPs, open interest and volumes
// straight from SmartAPI.
//
// * Expiries + strike tokens are resolved from the scrip master (cached).
// * ~15 strikes around the ATM are shown; CE + PE LTP / OI / volume come
//   from ONE batched FULL-mode quote call, refreshed every 5s while open.
// * IV and delta are merged in from the optionGreek endpoint when available
//   (non-fatal — the chain works without it).
// * The header shows total CE vs PE open interest and the put/call ratio.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { optionUniverse, fetchAngelQuotesFull, fetchOptionGreeks, type OptionMeta, type Greek } from '../angel'

const STRIKES_SHOWN = 15

function fmt(n: number, d = 2) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
}
function fmtOi(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1e7) return (n / 1e7).toFixed(2) + 'Cr'
  if (n >= 1e5) return (n / 1e5).toFixed(1) + 'L'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

export interface ChainRow {
  strike: number
  ce?: { ltp: number; oi: number; vol: number; iv?: number }
  pe?: { ltp: number; oi: number; vol: number; iv?: number }
}

export function OptionChain({ ocName, spot, onClose }: { ocName: string; spot: number; onClose: () => void }) {
  const [universe, setUniverse] = useState<Record<string, OptionMeta[]> | null>(null)
  const [expiry, setExpiry] = useState<string | null>(null)
  const [rows, setRows] = useState<ChainRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingContracts, setLoadingContracts] = useState(true)
  const [retry, setRetry] = useState(0)
  const [at, setAt] = useState(0)
  const spotRef = useRef(spot)
  spotRef.current = spot

  // ---- load the universe (expiries + strike tokens) ----
  useEffect(() => {
    let alive = true
    setLoadingContracts(true)
    setError(null)
    optionUniverse()
      .then((u) => {
        if (!alive) return
        setUniverse(u)
        const exps = expiriesOf(u, ocName)
        if (!exps.length) setError('No option contracts found for ' + ocName)
        else setExpiry((e) => e ?? exps[0])
      })
      .catch((e) => { if (alive) setError(e?.message || 'Could not load the option chain') })
      .finally(() => { if (alive) setLoadingContracts(false) })
    return () => { alive = false }
  }, [ocName, retry]) // eslint-disable-line react-hooks/exhaustive-deps

  const retryLoad = () => {
    // drop any half-written cache and pull the contracts again
    try { localStorage.removeItem('edgefolio-angel-optuniverse-v1') } catch { /* ignore */ }
    setUniverse(null)
    setRows(null)
    setExpiry(null)
    setRetry((n) => n + 1)
  }

  const expiries = useMemo(() => (universe ? expiriesOf(universe, ocName).slice(0, 3) : []), [universe, ocName])

  // ---- build + refresh the visible strikes ----
  const refresh = useCallback(async () => {
    if (!universe || !expiry) return
    try {
      const metas = universe[ocName] ?? []
      const forExpiry = metas.filter((m) => m.expiry === expiry).sort((a, b) => a.strike - b.strike)
      if (!forExpiry.length) { setRows([]); return }
      const strikes = [...new Set(forExpiry.map((m) => m.strike))].sort((a, b) => a - b)
      const sp = spotRef.current || strikes[Math.floor(strikes.length / 2)]
      let atmIdx = 0
      let best = Infinity
      for (let i = 0; i < strikes.length; i++) {
        const d = Math.abs(strikes[i] - sp)
        if (d < best) { best = d; atmIdx = i }
      }
      const lo = Math.max(0, atmIdx - Math.floor(STRIKES_SHOWN / 2))
      const shown = strikes.slice(lo, lo + STRIKES_SHOWN)
      const byStrike = new Map<number, { ce?: OptionMeta; pe?: OptionMeta }>()
      for (const m of forExpiry) {
        if (!shown.includes(m.strike)) continue
        const cell = byStrike.get(m.strike) ?? {}
        if (m.optionType === 'CE') cell.ce = m
        else cell.pe = m
        byStrike.set(m.strike, cell)
      }
      const tokens = [...byStrike.values()].flatMap((c) => [c.ce, c.pe].filter(Boolean) as OptionMeta[])
      const [quotes, greeks] = await Promise.all([
        fetchAngelQuotesFull(tokens),
        fetchOptionGreeks(ocName, expiry).catch(() => ({} as Record<string, Greek>)),
      ])
      const out: ChainRow[] = shown.map((strike) => {
        const cell = byStrike.get(strike)!
        const g = (t: 'CE' | 'PE') => greeks[`${strike}|${t}`]
        const ceM = cell.ce, peM = cell.pe
        const ceQ = ceM ? quotes[ceM.token] : undefined
        const peQ = peM ? quotes[peM.token] : undefined
        return {
          strike,
          ce: ceM ? {
            ltp: Number(ceQ?.ltp) || 0,
            oi: Number(ceQ?.openInterest) || 0,
            vol: Number(ceQ?.tradeVolume) || g('CE')?.volume || 0,
            iv: g('CE')?.iv,
          } : undefined,
          pe: peM ? {
            ltp: Number(peQ?.ltp) || 0,
            oi: Number(peQ?.openInterest) || 0,
            vol: Number(peQ?.tradeVolume) || g('PE')?.volume || 0,
            iv: g('PE')?.iv,
          } : undefined,
        }
      })
      setError(null)
      setRows(out)
      setAt(Date.now())
    } catch (e: any) {
      setError(e?.message || 'Could not load quotes')
    }
  }, [universe, expiry, ocName])

  useEffect(() => {
    if (!expiry) return
    refresh()
    const id = window.setInterval(refresh, 5000)
    return () => window.clearInterval(id)
  }, [refresh, expiry])

  const stats = useMemo(() => {
    let ceOi = 0, peOi = 0
    for (const r of rows ?? []) { ceOi += r.ce?.oi ?? 0; peOi += r.pe?.oi ?? 0 }
    const pcr = ceOi > 0 ? peOi / ceOi : null
    const maxOi = Math.max(1, ...(rows ?? []).flatMap((r) => [r.ce?.oi ?? 0, r.pe?.oi ?? 0]))
    // Max pain: the strike where the TOTAL option payout to holders is
    // smallest — the level option writers have the biggest incentive to pin
    // the price to near expiry.
    let maxPain: number | null = null
    if (rows && rows.length) {
      let best = Infinity
      for (const cand of rows) {
        let pain = 0
        for (const r of rows) {
          pain += (r.ce?.oi ?? 0) * Math.max(0, cand.strike - r.strike)
          pain += (r.pe?.oi ?? 0) * Math.max(0, r.strike - cand.strike)
        }
        if (pain < best) { best = pain; maxPain = cand.strike }
      }
    }
    return { ceOi, peOi, pcr, maxOi, maxPain }
  }, [rows])

  const atmStrike = useMemo(() => {
    if (!rows) return null
    let best = Infinity, atm = null as number | null
    for (const r of rows) {
      const d = Math.abs(r.strike - spot)
      if (d < best) { best = d; atm = r.strike }
    }
    return atm
  }, [rows, spot])

  return (
    <Modal title={`${ocName} · Option chain`} onClose={onClose}
      footer={<span className="muted" style={{ fontSize: 11.5 }}>Live SmartAPI quotes · refreshed every 5s while open{at ? ` · ${new Date(at).toLocaleTimeString()}` : ''}</span>}>
      <div className="row oc-head">
        <span className="oc-spot">{spot ? fmt(spot) : '—'}</span>
        <span className="muted" style={{ fontSize: 12 }}>spot</span>
        <span className="spacer" />
        {stats.pcr != null && (
          <span className={'chip oc-pcr ' + (stats.pcr >= 1 ? 'bull' : 'bear')} title="Put/Call ratio by open interest (shown strikes)">
            PCR {stats.pcr.toFixed(2)}
          </span>
        )}
        <span className="chip" title="Total open interest across the shown strikes">OI {fmtOi(stats.ceOi)} CE · {fmtOi(stats.peOi)} PE</span>
        {stats.maxPain != null && (
          <span className="chip" style={{ color: 'var(--accent-2)' }} title="Max pain — the strike with the smallest total option payout; the level writers profit most from at expiry">
            Max pain {fmt(stats.maxPain, stats.maxPain >= 1000 ? 0 : 2)}
          </span>
        )}
      </div>

      {expiries.length > 0 && (
        <div className="seg oc-expiries">
          {expiries.map((e) => (
            <button key={e} className={e === expiry ? 'active' : ''} onClick={() => { setExpiry(e); setRows(null) }}>
              {fmtExpiry(e)}
            </button>
          ))}
        </div>
      )}

      {error && !rows ? (
        <div className="empty" style={{ border: 'none' }}>
          <div className="big">⛓</div>
          <p>{error}</p>
          <button className="btn" onClick={retryLoad}>Try again</button>
        </div>
      ) : !rows ? (
        <div className="empty" style={{ border: 'none' }}>
          <div className="big">⏳</div>
          <p>{loadingContracts ? 'Downloading option contracts…' : 'Loading chain…'}</p>
          {loadingContracts && <p className="muted" style={{ fontSize: 12 }}>The first open downloads the contract list once — this can take up to a minute on mobile data.</p>}
        </div>
      ) : (
        <div className="oc-scroll">
          <table className="oc-table">
            <thead>
              <tr>
                <th colSpan={3}>CALLS</th>
                <th className="oc-strike-h">STRIKE</th>
                <th colSpan={3}>PUTS</th>
              </tr>
              <tr>
                <th>OI</th><th>IV</th><th className="oc-ltp-h">LTP</th>
                <th></th>
                <th className="oc-ltp-h">LTP</th><th>IV</th><th>OI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const atm = r.strike === atmStrike
                const ceItm = r.strike < spot
                const peItm = r.strike > spot
                return (
                  <tr key={r.strike} className={atm ? 'atm' : ''}>
                    <td className={'oi' + (ceItm ? ' itm' : '')}>
                      <span className="oi-bar" style={{ width: pct(r.ce?.oi, stats.maxOi) }} />
                      <span className="oi-val">{fmtOi(r.ce?.oi ?? 0)}</span>
                    </td>
                    <td className="iv">{r.ce?.iv != null ? r.ce.iv.toFixed(1) : '—'}</td>
                    <td className={'ltp' + (ceItm ? ' itm' : '')}>{r.ce ? (r.ce.ltp ? fmt(r.ce.ltp) : '—') : ''}</td>
                    <td className="oc-strike">{fmt(r.strike, 0)}</td>
                    <td className={'ltp' + (peItm ? ' itm' : '')}>{r.pe ? (r.pe.ltp ? fmt(r.pe.ltp) : '—') : ''}</td>
                    <td className="iv">{r.pe?.iv != null ? r.pe.iv.toFixed(1) : '—'}</td>
                    <td className={'oi' + (peItm ? ' itm' : '')}>
                      <span className="oi-bar" style={{ width: pct(r.pe?.oi, stats.maxOi) }} />
                      <span className="oi-val">{fmtOi(r.pe?.oi ?? 0)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

function expiriesOf(u: Record<string, OptionMeta[]>, name: string): string[] {
  return [...new Set((u[name] ?? []).map((m) => m.expiry))].sort()
}

function fmtExpiry(ymd: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [y, m, d] = ymd.split('-')
  return `${Number(d)} ${months[Number(m) - 1]}${new Date().getFullYear() !== Number(y) ? ' ' + y.slice(2) : ''}`
}

function pct(v: number | undefined, max: number): string {
  if (!v || v <= 0) return '0%'
  return Math.min(100, Math.round((v / max) * 100)) + '%'
}
