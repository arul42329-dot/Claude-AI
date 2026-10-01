import { useEffect, useRef, useState } from 'react'
import { setActiveAccount } from '../db'
import { useAccountScope, accountTypeLabel } from '../accounts'
import { useAppMode } from '../mode'
import { fmtMoney } from '../util'

export function AccountSwitcher() {
  const { accounts, activeId, account, currency } = useAccountScope()
  const { mode } = useAppMode()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const isAll = activeId === 'all' || !account
  const label = isAll ? 'All accounts' : account!.name
  const dot = isAll ? 'var(--accent)' : account!.color || 'var(--accent)'

  async function pick(id: string) {
    await setActiveAccount(id, mode)
    setOpen(false)
  }

  return (
    <div className={'acct-switch' + (open ? ' open' : '')} ref={ref}>
      <button className="acct-trigger" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="acct-dot" style={isAll ? { background: 'transparent', backgroundImage: 'linear-gradient(135deg,#e8b458,#3ddc97,#5b8cff)' } : { background: dot }} />
        <span className="acct-label">
          <span className="acct-name">{label}</span>
          <span className="acct-sub">{isAll ? 'Combined' : accountTypeLabel(account!.type)}</span>
        </span>
        <svg className="acct-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="acct-menu" role="listbox">
          <button className={'acct-item' + (isAll ? ' active' : '')} onClick={() => pick('all')} role="option" aria-selected={isAll}>
            <span className="acct-dot" style={{ backgroundImage: 'linear-gradient(135deg,#e8b458,#3ddc97,#5b8cff)' }} />
            <span className="acct-label"><span className="acct-name">All accounts</span><span className="acct-sub">Combined view</span></span>
          </button>
          {accounts.length === 0 && (
            <div className="acct-empty">No accounts yet — add one in Settings.</div>
          )}
          {accounts.map((a) => (
            <button key={a.id} className={'acct-item' + (a.id === activeId ? ' active' : '')} onClick={() => pick(a.id)} role="option" aria-selected={a.id === activeId}>
              <span className="acct-dot" style={{ background: a.color || 'var(--accent)' }} />
              <span className="acct-label">
                <span className="acct-name">{a.name}{a.archived ? ' · archived' : ''}</span>
                <span className="acct-sub">{accountTypeLabel(a.type)} · {fmtMoney(a.startingBalance, a.currency || currency)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
