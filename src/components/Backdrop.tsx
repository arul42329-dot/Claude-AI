import { useEffect, useRef, useState } from 'react'
import { isBackdropFxOn, isDaytime, moonPhase } from '../theme'

// Ambient background motion, painted on ONE fixed canvas behind every tab:
//   · a SUN by day / a MOON at night — placed by the time of day (it arcs
//     across the sky from 06:00 to 18:00, and through the night), and the
//     moon is drawn with its REAL phase for today's date
//   · a drifting ember field (accent-coloured particles floating up, twinkling)
//   · meteor streaks sweeping diagonally every few seconds
//   · an occasional lightning bolt flashing down from the top
// The whole scene is coloured by the active theme — warm sun gold by day,
// cool moonlight silver by night (see theme.ts), re-read every second.
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
    if (reduced) return
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
    let day = true
    let phase = moonPhase()
    const readTheme = () => {
      const cs = getComputedStyle(document.documentElement)
      const parse = (v: string, fb: string) => {
        const m = v.trim().match(/^#([0-9a-f]{6})$/i)
        const h = m ? m[1] : fb
        return parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16)
      }
      accent = parse(cs.getPropertyValue('--accent'), 'e8b458')
      accent2 = parse(cs.getPropertyValue('--accent-2'), 'f2cd7f')
      day = isDaytime()
      phase = moonPhase()
    }
    readTheme()
    let lastRead = 0

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

    // Where the sun/moon sits right now: it rises at the start of the period,
    // arcs high across the sky and sets at the end (06:00–18:00 for the sun,
    // 18:00–06:00 for the moon).
    const celestialPos = () => {
      const now = new Date()
      const h = now.getHours() + now.getMinutes() / 60
      const p = day ? (h - 6) / 12 : (h >= 18 ? (h - 18) / 12 : (h + 6) / 12)
      const t = Math.max(0, Math.min(1, p))
      return {
        x: W * (0.14 + 0.72 * t),
        y: H * 0.30 - Math.sin(t * Math.PI) * H * 0.17,
      }
    }

    const drawSun = (x: number, y: number, r: number, t: number) => {
      const breathe = 1 + 0.05 * Math.sin(t * 0.0011)
      const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 3.4 * breathe)
      g.addColorStop(0, `rgba(${accent2},0.30)`)
      g.addColorStop(0.5, `rgba(${accent},0.10)`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r * 3.4 * breathe, 0, Math.PI * 2)
      ctx.fill()
      // disc
      const d = ctx.createLinearGradient(x, y - r, x, y + r)
      d.addColorStop(0, `rgba(${accent2},1)`)
      d.addColorStop(1, `rgba(${accent},1)`)
      ctx.fillStyle = d
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      // slowly rotating rays
      const rot = t * 0.00012
      ctx.strokeStyle = `rgba(${accent2},0.13)`
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      for (let i = 0; i < 8; i++) {
        const a = rot + (i * Math.PI) / 4
        ctx.beginPath()
        ctx.moveTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35)
        ctx.lineTo(x + Math.cos(a) * r * 1.85, y + Math.sin(a) * r * 1.85)
        ctx.stroke()
      }
    }

    const drawMoon = (x: number, y: number, r: number) => {
      const f = phase.fraction
      const k = 2 * f - 1 // -1..1: terminator curvature
      // soft halo
      const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3)
      g.addColorStop(0, `rgba(${accent2},0.16)`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r * 3, 0, Math.PI * 2)
      ctx.fill()
      // disc: dark base + phase-accurate lit region, clipped to the circle
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = 'rgba(19,23,32,0.92)'
      ctx.fillRect(x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 2)
      const lit = ctx.createLinearGradient(x - r, y - r, x + r, y + r)
      lit.addColorStop(0, `rgba(${accent2},0.98)`)
      lit.addColorStop(1, `rgba(${accent},0.95)`)
      ctx.fillStyle = lit
      ctx.beginPath()
      const rx = r * Math.abs(k)
      if (phase.waxing) {
        ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, false) // lit right half
        ctx.ellipse(x, y, rx, r, 0, Math.PI / 2, -Math.PI / 2, k > 0 ? false : true)
      } else {
        ctx.arc(x, y, r, Math.PI / 2, -Math.PI / 2, false) // lit left half
        ctx.ellipse(x, y, rx, r, 0, -Math.PI / 2, Math.PI / 2, k > 0 ? false : true)
      }
      ctx.fill()
      // a few subtle craters on the surface
      ctx.fillStyle = 'rgba(10,14,22,0.10)'
      for (const [cx, cy, cr] of [[-0.3, -0.25, 0.16], [0.22, 0.1, 0.11], [-0.05, 0.38, 0.09], [0.38, -0.35, 0.07]] as const) {
        ctx.beginPath()
        ctx.arc(x + cx * r, y + cy * r, cr * r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    let prev = performance.now()
    const frame = (t: number) => {
      if (!alive) return
      raf = requestAnimationFrame(frame)
      if (document.hidden) { prev = t; return }
      const dt = Math.min(0.05, (t - prev) / 1000)
      prev = t
      if (t - lastRead > 1000) { readTheme(); lastRead = t }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // sun by day / moon (with tonight's real phase) by night
      const r = Math.max(26, Math.min(46, Math.min(W, H) * 0.085))
      const pos = celestialPos()
      if (day) drawSun(pos.x, pos.y, r, t)
      else drawMoon(pos.x, pos.y, r)

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

      // lightning bolt (soft glow pass + bright core, ~0.6s flash)
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
  }, [on, reduced])

  if (!on || reduced) return null
  return <canvas ref={ref} className="backdrop-fx" aria-hidden="true" />
}
