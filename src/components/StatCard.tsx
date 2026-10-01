import { useRef } from 'react'
import { useCountUp } from '../hooks/useCountUp'

export function StatCard({
  label,
  value,
  numeric,
  format,
  sub,
  tone,
}: {
  label: string
  /** Pre-formatted string value (used when `numeric` is not provided). */
  value?: string
  /** Numeric value — when provided (with `format`), the number counts up. */
  numeric?: number
  format?: (n: number) => string
  sub?: string
  tone?: 'pos' | 'neg' | 'neutral'
}) {
  const animate = typeof numeric === 'number' && !!format
  const n = useCountUp(animate ? (numeric as number) : 0)
  const display = animate ? (format as (n: number) => string)(n) : value ?? ''

  const cls = tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : ''
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el) return
    if (window.matchMedia?.('(pointer: coarse)').matches) return // skip touch
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty('--rx', ((0.5 - py) * 6).toFixed(2) + 'deg')
      el.style.setProperty('--ry', ((px - 0.5) * 8).toFixed(2) + 'deg')
      el.style.setProperty('--mx', (px * 100).toFixed(1) + '%')
      el.style.setProperty('--my', (py * 100).toFixed(1) + '%')
      el.style.setProperty('--lift', '1')
    })
  }

  function onLeave() {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(raf.current)
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--lift', '0')
  }

  return (
    <div ref={ref} className="stat tilt" onPointerMove={onMove} onPointerLeave={onLeave}>
      <span className="stat-spot" aria-hidden="true" />
      <div className="stat-content">
        <div className="label">{label}</div>
        <div className={'value ' + cls}>{display}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  )
}
