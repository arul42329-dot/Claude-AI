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
