// Global app mode: the whole app runs in either Forex or India mode. The mode is
// toggled from the Dashboard, persisted to localStorage, and drives (a) the app
// theme/colour, (b) which market's trades & checklists are shown across every
// tab, and (c) the Markets view. India and Forex journals stay fully separate.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { applyMode } from './theme'

export type AppMode = 'forex' | 'india'
const KEY = 'edgefolio-app-mode'

export function getStoredMode(): AppMode {
  try { return localStorage.getItem(KEY) === 'india' ? 'india' : 'forex' } catch { return 'forex' }
}

interface Ctx {
  mode: AppMode
  isIndia: boolean
  setMode: (m: AppMode) => void
  toggle: () => void
}

const ModeContext = createContext<Ctx>({ mode: 'forex', isIndia: false, setMode: () => {}, toggle: () => {} })

export function AppModeProvider({ accentKey, children }: { accentKey?: string; children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(getStoredMode)

  // Re-apply the theme whenever the mode changes or the user's forex accent loads.
  useEffect(() => { applyMode(mode, accentKey) }, [mode, accentKey])

  const setMode = (m: AppMode) => {
    try { localStorage.setItem(KEY, m) } catch { /* ignore */ }
    setModeState(m)
  }
  const toggle = () => setMode(mode === 'india' ? 'forex' : 'india')

  return (
    <ModeContext.Provider value={{ mode, isIndia: mode === 'india', setMode, toggle }}>
      {children}
    </ModeContext.Provider>
  )
}

export function useAppMode(): Ctx {
  return useContext(ModeContext)
}

// Market tag stored on trades / checklist entries. Absent = 'forex' (legacy data).
export function marketOf(x: { market?: AppMode }): AppMode {
  return x.market === 'india' ? 'india' : 'forex'
}
