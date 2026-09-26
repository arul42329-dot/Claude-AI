import { useEffect, useRef, useState } from 'react'

/**
 * Smoothly animates a number toward `target` (from its previous value) using
 * an easeOutExpo curve. Honors prefers-reduced-motion by snapping instantly.
 */
export function useCountUp(target: number, duration = 950): number {
  const [val, setVal] = useState(target)
  const prev = useRef(target)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const from = prev.current
    const to = Number.isFinite(target) ? target : 0

    if (reduce || from === to) {
      setVal(to)
      prev.current = to
      return
    }

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t) // easeOutExpo
      setVal(from + (to - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else prev.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return val
}
