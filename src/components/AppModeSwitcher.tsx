import { useEffect, useRef, useState } from 'react'
import { useAppMode } from '../mode'
import { GlobeIcon, IndiaFlag } from './Icons'

/** Global mobile-header mode picker. Kept beside the account picker on every tab. */
export function AppModeSwitcher() {
  const { mode, isIndia, setMode } = useAppMode()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function pick(next: 'forex' | 'india') {
    setMode(next)
    setOpen(false)
  }

  return (
    <div className={'app-mode-switch' + (open ? ' open' : '')} ref={ref}>
      <button className="app-mode-trigger" onClick={() => setOpen((value) => !value)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="app-mode-icon">{isIndia ? <IndiaFlag size={18} /> : <GlobeIcon size={18} />}</span>
        <span className="app-mode-label">
          <span className="app-mode-name">{isIndia ? 'India' : 'Forex'}</span>
          <span className="app-mode-sub">App mode</span>
        </span>
        <svg className="app-mode-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="app-mode-menu" role="listbox">
          <button className={mode === 'forex' ? 'active' : ''} onClick={() => pick('forex')} role="option" aria-selected={mode === 'forex'}><GlobeIcon size={17} /> Forex</button>
          <button className={mode === 'india' ? 'active' : ''} onClick={() => pick('india')} role="option" aria-selected={mode === 'india'}><IndiaFlag size={17} /> India</button>
        </div>
      )}
    </div>
  )
}
