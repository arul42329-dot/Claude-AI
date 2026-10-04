// Day / Night theme — the app has exactly two themes, picked automatically
// from the DEVICE TIME (no setting): warm sun gold by day (06:00–17:59),
// cool moonlight silver by night. Both apply identically to India and forex.
export interface ThemePalette {
  accent: string
  accent2: string
  faint: string
  soft: string
  line: string
  glow: string
}

export const DAY_THEME: ThemePalette = {
  accent: '#e8b458', accent2: '#f2cd7f',
  faint: 'rgba(232,180,88,0.05)', soft: 'rgba(232,180,88,0.14)',
  line: 'rgba(232,180,88,0.35)', glow: 'rgba(232,180,88,0.6)',
}

export const NIGHT_THEME: ThemePalette = {
  accent: '#8fb8e8', accent2: '#d3e4f8',
  faint: 'rgba(143,184,232,0.05)', soft: 'rgba(143,184,232,0.14)',
  line: 'rgba(143,184,232,0.38)', glow: 'rgba(143,184,232,0.6)',
}

// Day = 06:00–17:59 on the device clock; night otherwise.
export function isDaytime(d: Date = new Date()): boolean {
  const h = d.getHours()
  return h >= 6 && h < 18
}

function setAccentVars(p: ThemePalette): void {
  const s = document.documentElement.style
  s.setProperty('--accent', p.accent)
  s.setProperty('--accent-2', p.accent2)
  s.setProperty('--accent-faint', p.faint)
  s.setProperty('--accent-soft', p.soft)
  s.setProperty('--accent-line', p.line)
  s.setProperty('--accent-glow', p.glow)
}

// Apply the day or night palette based on the device time. Call on boot,
// on mode changes and every minute or so — it flips automatically at 06:00
// and 18:00 without restarting the app.
export function applyTimeTheme(d: Date = new Date()): void {
  const day = isDaytime(d)
  document.documentElement.setAttribute('data-daytime', day ? 'day' : 'night')
  setAccentVars(day ? DAY_THEME : NIGHT_THEME)
}

// Mode shell (India ⟷ forex). Both modes share the SAME day/night theme;
// only the mode marker attribute differs.
export function applyMode(mode: 'forex' | 'india'): void {
  const root = document.documentElement
  if (mode === 'india') root.setAttribute('data-mode', 'india')
  else root.removeAttribute('data-mode')
  applyTimeTheme()
}

// ---------------- Moon phase (by date) ----------------
// Synodic-month age from a known new moon (6 Jan 2000, 18:14 UTC), used by
// the night backdrop to draw the moon exactly as it looks tonight.
export interface MoonPhase {
  age: number // days into the ~29.53-day cycle
  fraction: number // illuminated fraction 0..1
  waxing: boolean
  name: string
}

export function moonPhase(d: Date = new Date()): MoonPhase {
  const SYNODIC = 29.53058867
  const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
  let age = ((d.getTime() - KNOWN_NEW_MOON) / 86400000) % SYNODIC
  if (age < 0) age += SYNODIC
  const fraction = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2
  const waxing = age < SYNODIC / 2
  const name =
    age < 1.0 || age > SYNODIC - 1.0 ? 'New moon' :
    age < 6.38 ? 'Waxing crescent' :
    age < 8.38 ? 'First quarter' :
    age < 13.76 ? 'Waxing gibbous' :
    age < 15.76 ? 'Full moon' :
    age < 21.15 ? 'Waning gibbous' :
    age < 23.15 ? 'Last quarter' : 'Waning crescent'
  return { age, fraction, waxing, name }
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


// ---------------- Background motion ----------------
// The ambient backdrop (drifting embers + streaks + lightning flashes) painted
// on a canvas behind every tab. Toggleable in Settings → Appearance.
const BACKFX_KEY = 'edgefolio-backfx'

export function isBackdropFxOn(): boolean {
  try { return localStorage.getItem(BACKFX_KEY) !== 'off' } catch { return true }
}

export function setBackdropFx(on: boolean): void {
  try { localStorage.setItem(BACKFX_KEY, on ? 'on' : 'off') } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('edgefolio:backfx'))
}
