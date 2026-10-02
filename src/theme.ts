// Accent themes — recolour the app's highlight colour. Each preset overrides the
// CSS custom properties the UI already uses for its accent, so the change is
// instant and app-wide.
export interface AccentPreset {
  key: string
  label: string
  accent: string
  accent2: string
  faint: string
  soft: string
  line: string
  glow: string
}

export const ACCENTS: AccentPreset[] = [
  { key: 'gold', label: 'Gold', accent: '#e8b458', accent2: '#f2cd7f', faint: 'rgba(232,180,88,0.05)', soft: 'rgba(232,180,88,0.14)', line: 'rgba(232,180,88,0.35)', glow: 'rgba(232,180,88,0.6)' },
  { key: 'azure', label: 'Azure', accent: '#5b8cff', accent2: '#86a9ff', faint: 'rgba(91,140,255,0.05)', soft: 'rgba(91,140,255,0.15)', line: 'rgba(91,140,255,0.38)', glow: 'rgba(91,140,255,0.6)' },
  { key: 'emerald', label: 'Emerald', accent: '#2fd3a5', accent2: '#63e6c0', faint: 'rgba(47,211,165,0.05)', soft: 'rgba(47,211,165,0.15)', line: 'rgba(47,211,165,0.38)', glow: 'rgba(47,211,165,0.6)' },
  { key: 'violet', label: 'Violet', accent: '#c084fc', accent2: '#d3a6ff', faint: 'rgba(192,132,252,0.05)', soft: 'rgba(192,132,252,0.16)', line: 'rgba(192,132,252,0.4)', glow: 'rgba(192,132,252,0.6)' },
  { key: 'rose', label: 'Rose', accent: '#fb7199', accent2: '#ff9db8', faint: 'rgba(251,113,153,0.05)', soft: 'rgba(251,113,153,0.15)', line: 'rgba(251,113,153,0.38)', glow: 'rgba(251,113,153,0.6)' },
  { key: 'teal', label: 'Teal', accent: '#43c6d8', accent2: '#74dbe9', faint: 'rgba(67,198,216,0.05)', soft: 'rgba(67,198,216,0.15)', line: 'rgba(67,198,216,0.38)', glow: 'rgba(67,198,216,0.6)' },
]

function setAccentVars(accent: string, accent2: string, faint: string, soft: string, line: string, glow: string): void {
  const s = document.documentElement.style
  s.setProperty('--accent', accent)
  s.setProperty('--accent-2', accent2)
  s.setProperty('--accent-faint', faint)
  s.setProperty('--accent-soft', soft)
  s.setProperty('--accent-line', line)
  s.setProperty('--accent-glow', glow)
}

export function applyAccent(key?: string): void {
  const p = ACCENTS.find((a) => a.key === key) ?? ACCENTS[0]
  setAccentVars(p.accent, p.accent2, p.faint, p.soft, p.line, p.glow)
}

// India mode uses a fixed saffron accent so the whole app is instantly
// recognisable as being in Indian-markets mode, regardless of the user's
// chosen forex accent.
export const INDIA_ACCENT = {
  accent: '#ff8f2e', accent2: '#ffb463',
  faint: 'rgba(255,143,46,0.05)', soft: 'rgba(255,143,46,0.15)',
  line: 'rgba(255,143,46,0.4)', glow: 'rgba(255,143,46,0.6)',
}

// Apply the whole-app theme for the given mode. In India mode we force the
// saffron accent and tag <html data-mode="india"> so CSS can retint the app;
// in forex mode we restore the user's chosen accent.
export function applyMode(mode: 'forex' | 'india', accentKey?: string): void {
  const root = document.documentElement
  const s = root.style
  if (mode === 'india') {
    root.setAttribute('data-mode', 'india')
    setAccentVars(INDIA_ACCENT.accent, INDIA_ACCENT.accent2, INDIA_ACCENT.faint, INDIA_ACCENT.soft, INDIA_ACCENT.line, INDIA_ACCENT.glow)
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


// ---------------- Touch feedback ----------------
// Tap effect for interactive elements, selectable in Settings:
//   ripple — accent-coloured material ripple at the touch point
//   pulse  — quick scale-down press with an accent glow
//   off    — nothing
export type TouchFx = 'ripple' | 'pulse' | 'off'
const TOUCHFX_KEY = 'edgefolio-touchfx'

export function getTouchFx(): TouchFx {
  try {
    const v = localStorage.getItem(TOUCHFX_KEY)
    return v === 'pulse' || v === 'off' ? v : 'ripple'
  } catch { return 'ripple' }
}

export function applyTouchFx(fx: TouchFx): void {
  const root = document.documentElement
  if (fx === 'off') root.removeAttribute('data-touchfx')
  else root.setAttribute('data-touchfx', fx)
}

export function setTouchFx(fx: TouchFx): void {
  try { localStorage.setItem(TOUCHFX_KEY, fx) } catch { /* ignore */ }
  applyTouchFx(fx)
}
