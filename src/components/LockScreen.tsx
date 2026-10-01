import { useEffect, useState } from 'react'
import { verifyPin } from '../lock'
import logoUrl from '../assets/logo.png'

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  async function submit(value: string) {
    if (await verifyPin(value)) {
      onUnlock()
    } else {
      setError(true)
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 500)
    }
  }

  function press(d: string) {
    if (pin.length >= 8) return
    const next = pin + d
    setPin(next)
    setError(false)
    if (next.length >= 4) {
      // allow up to 8, but auto-submit attempt at 4+ on OK only; here just keep typing
    }
  }
  function back() { setPin((p) => p.slice(0, -1)); setError(false) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') back()
      else if (e.key === 'Enter' && pin.length >= 4) submit(pin)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="lock-screen">
      <div className="aurora" aria-hidden="true"><span /><span /><span /></div>
      <div className={'lock-card' + (shake ? ' shake' : '')}>
        <img className="lock-logo" src={logoUrl} alt="Edgefolio" />
        <h2>Enter PIN</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>{error ? 'Wrong PIN, try again' : 'Unlock your journal'}</p>
        <div className="pin-dots">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <span key={i} className={'pin-dot' + (i < pin.length ? ' on' : '')} />
          ))}
        </div>
        <div className="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} className="pin-key" onClick={() => press(d)}>{d}</button>
          ))}
          <button className="pin-key ghost" onClick={back}>⌫</button>
          <button className="pin-key" onClick={() => press('0')}>0</button>
          <button className="pin-key ok" onClick={() => submit(pin)} disabled={pin.length < 4}>✓</button>
        </div>
      </div>
    </div>
  )
}
