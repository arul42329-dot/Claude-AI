// Accent themes — recolour the app's highlight colour. Each preset overrides the
// CSS custom properties the UI already uses for its accent, so the change is
// instant and app-wide.
export interface AccentPreset {
  key: string
  label: string
  accent: string
  accent2: string
  soft: string
  line: string
}

export const ACCENTS: AccentPreset[] = [
  { key: 'gold', label: 'Gold', accent: '#e8b458', accent2: '#f2cd7f', soft: 'rgba(232,180,88,0.14)', line: 'rgba(232,180,88,0.35)' },
  { key: 'azure', label: 'Azure', accent: '#5b8cff', accent2: '#86a9ff', soft: 'rgba(91,140,255,0.15)', line: 'rgba(91,140,255,0.38)' },
  { key: 'emerald', label: 'Emerald', accent: '#2fd3a5', accent2: '#63e6c0', soft: 'rgba(47,211,165,0.15)', line: 'rgba(47,211,165,0.38)' },
  { key: 'violet', label: 'Violet', accent: '#c084fc', accent2: '#d3a6ff', soft: 'rgba(192,132,252,0.16)', line: 'rgba(192,132,252,0.4)' },
  { key: 'rose', label: 'Rose', accent: '#fb7199', accent2: '#ff9db8', soft: 'rgba(251,113,153,0.15)', line: 'rgba(251,113,153,0.38)' },
  { key: 'teal', label: 'Teal', accent: '#43c6d8', accent2: '#74dbe9', soft: 'rgba(67,198,216,0.15)', line: 'rgba(67,198,216,0.38)' },
]

export function applyAccent(key?: string): void {
  const p = ACCENTS.find((a) => a.key === key) ?? ACCENTS[0]
  const s = document.documentElement.style
  s.setProperty('--accent', p.accent)
  s.setProperty('--accent-2', p.accent2)
  s.setProperty('--accent-soft', p.soft)
  s.setProperty('--accent-line', p.line)
}

// India mode uses a fixed saffron accent so the whole app is instantly
// recognisable as being in Indian-markets mode, regardless of the user's
// chosen forex accent.
export const INDIA_ACCENT = {
  accent: '#ff8f2e', accent2: '#ffb463',
  soft: 'rgba(255,143,46,0.15)', line: 'rgba(255,143,46,0.4)',
}

// Apply the whole-app theme for the given mode. In India mode we force the
// saffron accent and tag <html data-mode="india"> so CSS can retint the app;
// in forex mode we restore the user's chosen accent.
export function applyMode(mode: 'forex' | 'india', accentKey?: string): void {
  const root = document.documentElement
  const s = root.style
  if (mode === 'india') {
    root.setAttribute('data-mode', 'india')
    s.setProperty('--accent', INDIA_ACCENT.accent)
    s.setProperty('--accent-2', INDIA_ACCENT.accent2)
    s.setProperty('--accent-soft', INDIA_ACCENT.soft)
    s.setProperty('--accent-line', INDIA_ACCENT.line)
  } else {
    root.removeAttribute('data-mode')
    applyAccent(accentKey)
  }
}

// AMOLED pure-black display mode — swaps the graphite palette for true black
// (pixels off = battery saved on OLED screens). Persisted in localStorage and
// applied at boot (App) and from the Settings toggle.
const AMOLED_KEY = 'edgefolio-amoled'

export function isAmoledEnabled(): boolean {
  try { return localStorage.getItem(AMOLED_KEY) === 'on' } catch { return false }
}

export function applyAmoled(on: boolean): void {
  const root = document.documentElement
  if (on) root.setAttribute('data-amoled', 'on')
  else root.removeAttribute('data-amoled')
}

export function setAmoled(on: boolean): void {
  try { localStorage.setItem(AMOLED_KEY, on ? 'on' : 'off') } catch { /* ignore */ }
  applyAmoled(on)
}
