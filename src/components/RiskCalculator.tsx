import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { fmtMoney, fmtNum } from '../util'

// Pip value per 1.00 standard lot (100,000 units), in the account currency.
// These are the common approximations traders use; the field stays editable so
// you can fine-tune for exotic pairs / your broker's contract size.
const PRESETS: { label: string; pip: number }[] = [
  { label: 'FX majors (non-JPY)', pip: 10 },
  { label: 'JPY pairs', pip: 9.1 },
  { label: 'Gold XAU/USD (per $0.10)', pip: 1 },
  { label: 'Indices / custom', pip: 1 },
]

export function RiskCalculator({ balance, currency, onClose }: { balance: number; currency: string; onClose: () => void }) {
  const [bal, setBal] = useState(balance ? String(Math.round(balance)) : '')
  const [risk, setRisk] = useState('1')
  const [stop, setStop] = useState('')
  const [pipVal, setPipVal] = useState('10')

  const result = useMemo(() => {
    const b = parseFloat(bal) || 0
    const r = parseFloat(risk) || 0
    const s = parseFloat(stop) || 0
    const pv = parseFloat(pipVal) || 0
    const riskAmount = b * (r / 100)
    const lots = s > 0 && pv > 0 ? riskAmount / (s * pv) : 0
    return { riskAmount, lots, units: lots * 100000, perPip: lots * pv }
  }, [bal, risk, stop, pipVal])

  return (
    <Modal
      title="🧮 Position-size calculator"
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Work out the exact lot size so a losing trade only costs the risk you intend.
      </p>

      <div className="form-grid">
        <div className="field">
          <label>Account balance ({currency})</label>
          <input className="input" inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="10000" />
        </div>
        <div className="field">
          <label>Risk per trade (%)</label>
          <input className="input" inputMode="decimal" value={risk} onChange={(e) => setRisk(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="1" />
        </div>
        <div className="field">
          <label>Stop loss (pips)</label>
          <input className="input" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="20" />
        </div>
        <div className="field">
          <label>Pip value / 1.0 lot ({currency})</label>
          <input className="input" inputMode="decimal" value={pipVal} onChange={(e) => setPipVal(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="10" />
        </div>
      </div>

      <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button key={p.label} className="btn sm ghost" onClick={() => setPipVal(String(p.pip))}>{p.label}</button>
        ))}
      </div>

      <div className="calc-out">
        <div className="calc-row">
          <span>Amount at risk</span>
          <strong className={result.riskAmount > 0 ? 'neg' : ''}>{fmtMoney(result.riskAmount, currency)}</strong>
        </div>
        <div className="calc-row big">
          <span>Suggested lot size</span>
          <strong className="accent">{result.lots > 0 ? fmtNum(result.lots, 2) : '—'}</strong>
        </div>
        <div className="calc-row">
          <span>Units</span>
          <strong>{result.units > 0 ? Math.round(result.units).toLocaleString() : '—'}</strong>
        </div>
        <div className="calc-row">
          <span>Value per pip</span>
          <strong>{result.perPip > 0 ? fmtMoney(result.perPip, currency) : '—'}</strong>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
        Tip: for FX majors 1 pip ≈ {currency} 10 per standard lot; JPY pairs ≈ 9. Always double-check against your broker's contract size.
      </p>
    </Modal>
  )
}
