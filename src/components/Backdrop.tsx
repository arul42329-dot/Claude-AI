import { useEffect, useRef, useState } from 'react'
import { isBackdropFxOn } from '../theme'

// Ambient background motion, painted on ONE fixed canvas behind every tab:
//   · a drifting ember field (accent-coloured particles floating up, twinkling)
//   · meteor streaks sweeping diagonally every few seconds
//   · an occasional lightning bolt flashing down from the top
// Everything is coloured by the ACTIVE ACCENT (re-read every second, so
// changing the theme in Settings — or India mode's saffron — carries through).
// Honours prefers-reduced-motion and the Settings toggle, pauses when hidden.
export function Backdrop() {
  const [on, setOn] = useState(isBackdropFxOn())
  const [reduced] = useState(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const sync = () => setOn(isBackdropFxOn())
    window.addEventListener('edgefolio:backfx', sync)
    return () => window.removeEventListener('edgefolio:backfx', sync)
  }, [])

  useEffect(() => {
    if (!on) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let raf = 0
    let alive = true
    let W = 0, H = 0, dpr = 1

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    // Active accent colours as "r,g,b" strings, refreshed while running.
    let accent = '232,180,88'
    let accent2 = '242,205,127'
    const readAccent = () => {
      const cs = getComputedStyle(document.documentElement)
      const parse = (v: string, fb: string) => {
        const m = v.trim().match(/^#([0-9a-f]{6})$/i)
        const h = m ? m[1] : fb
        return parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16)
      }
      accent = parse(cs.getPropertyValue('--accent'), 'e8b458')
      accent2 = parse(cs.getPropertyValue('--accent-2'), 'f2cd7f')
    }
    readAccent()
    let lastAccentRead = 0

    const rand = (a: number, b: number) => a + Math.random() * (b - a)

    // ---- ember field ----
    interface P { x: number; y: number; r: number; vy: number; drift: number; phase: number; tw: number; a: number }
    const count = Math.min(64, Math.max(26, Math.round((W * H) / 26000)))
    const ps: P[] = Array.from({ length: count }, () => ({
      x: rand(0, W), y: rand(0, H), r: rand(0.6, 2.1),
      vy: rand(7, 17), drift: rand(6, 18), phase: rand(0, Math.PI * 2),
      tw: rand(0.5, 1.6), a: rand(0.14, 0.42),
    }))

    // ---- streaks & lightning ----
    interface Streak { x: number; y: number; vx: number; vy: number; life: number; max: number }
    interface Bolt { pts: { x: number; y: number }[]; life: number }
    let streak: Streak | null = null
    let bolt: Bolt | null = null

    const spawnStreak = () => {
      const dir = Math.random() > 0.5 ? 1 : -1
      const sp = rand(420, 640)
      streak = {
        x: dir > 0 ? -80 : W + 80,
        y: rand(-60, H * 0.4),
        vx: dir * sp * 0.86,
        vy: sp * 0.5,
        life: 0,
        max: rand(0.9, 1.4),
      }
    }
    const spawnBolt = () => {
      const x0 = rand(W * 0.15, W * 0.85)
      const pts = [{ x: x0, y: -12 }]
      let x = x0, y = -12
      const segs = 6 + Math.floor(Math.random() * 4)
      for (let i = 0; i < segs; i++) {
        x += rand(-48, 48)
        y += rand(H * 0.05, H * 0.1)
        pts.push({ x, y })
      }
      bolt = { pts, life: 0 }
    }

    let nextStreak = performance.now() + rand(1500, 4000)
    let nextBolt = performance.now() + rand(3000, 7000)

    let prev = performance.now()
    const frame = (t: number) => {
      if (!alive) return
      raf = requestAnimationFrame(frame)
      if (document.hidden) { prev = t; return }
      const dt = Math.min(0.05, (t - prev) / 1000)
      prev = t
      if (t - lastAccentRead > 1000) { readAccent(); lastAccentRead = t }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // embers
      for (const p of ps) {
        p.y -= p.vy * dt
        p.phase += p.tw * dt
        if (p.y < -8) { p.y = H + 8; p.x = rand(0, W) }
        const x = p.x + Math.sin(p.phase) * p.drift
        const a = p.a * (0.55 + 0.45 * Math.sin(p.phase * 1.7))
        ctx.beginPath()
        ctx.arc(x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${accent},${Math.max(0.05, a).toFixed(3)})`
        ctx.fill()
      }

      // meteor streak
      if (!streak && t > nextStreak) { spawnStreak(); nextStreak = t + rand(3500, 8000) }
      if (streak) {
        streak.life += dt
        streak.x += streak.vx * dt
        streak.y += streak.vy * dt
        const k = 1 - streak.life / streak.max
        if (k <= 0 || streak.x < -220 || streak.x > W + 220 || streak.y > H + 120) {
          streak = null
        } else {
          const len = 130
          const n = Math.hypot(streak.vx, streak.vy) || 1
          const tx = (streak.vx / n) * len
          const ty = (streak.vy / n) * len
          const g = ctx.createLinearGradient(streak.x, streak.y, streak.x - tx, streak.y - ty)
          g.addColorStop(0, `rgba(${accent2},${(0.82 * k).toFixed(3)})`)
          g.addColorStop(1, `rgba(${accent2},0)`)
          ctx.strokeStyle = g
          ctx.lineWidth = 2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(streak.x, streak.y)
          ctx.lineTo(streak.x - tx, streak.y - ty)
          ctx.stroke()
        }
      }

      // lightning bolt (soft glow pass + bright core, ~0.45s flash)
      if (!bolt && t > nextBolt) { spawnBolt(); nextBolt = t + rand(8000, 16000) }
      if (bolt) {
        bolt.life += dt
        const k = Math.pow(Math.max(0, 1 - bolt.life / 0.6), 0.75)
        if (k <= 0) {
          bolt = null
        } else {
          ctx.lineJoin = 'round'
          ctx.lineCap = 'round'
          ctx.strokeStyle = `rgba(${accent},${(0.28 * k).toFixed(3)})`
          ctx.lineWidth = 8
          ctx.beginPath()
          bolt.pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)))
          ctx.stroke()
          ctx.strokeStyle = `rgba(${accent2},${(0.85 * k).toFixed(3)})`
          ctx.lineWidth = 1.7
          ctx.beginPath()
          bolt.pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)))
          ctx.stroke()
        }
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [on])

  if (!on || reduced) return null
  return <canvas ref={ref} className="backdrop-fx" aria-hidden="true" />
}
