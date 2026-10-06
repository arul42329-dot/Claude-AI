import { useEffect, useRef, useState } from 'react'
import { isBackdropFxOn, isDaytime, moonPhase } from '../theme'

// Ambient background motion, painted on ONE fixed canvas behind every tab:
//   · a SUN by day / a MOON at night — living inside a dedicated sky zone
//     (always fully visible) where it slowly orbits so the movement is easy
//     to see: on phones it sits at ONE FIXED spot in the title band — the
//     same on every tab, clear of every page name — and on desktop in the
//     top-right corner; the moon is drawn with its REAL phase for today's
//     date
//   · BIRDS — little flapping silhouettes drifting across the sky zone at
//     random heights and speeds, passing the sun by day / the moon by night
//   · STARS at night — twinkling pinpricks all over the sky, a few with a
//     soft glow and a four-point sparkle
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
    const rand = (a: number, b: number) => a + Math.random() * (b - a)

    // ---- stars (night only) ----
    // Twinkling pinpricks scattered over the whole sky. Regenerated on resize
    // so they always spread across the current screen. A handful are larger
    // and get a soft glow + a little four-point sparkle.
    interface Star { x: number; y: number; r: number; base: number; amp: number; ph: number; sp: number; bright: boolean }
    let stars: Star[] = []
    const makeStars = () => {
      const n = Math.round(Math.min(150, Math.max(45, (W * H) / 13000)))
      stars = Array.from({ length: n }, () => ({
        x: rand(0, W), y: rand(0, H),
        r: rand(0.5, 1.7),
        base: rand(0.18, 0.5), amp: rand(0.18, 0.4),
        ph: rand(0, Math.PI * 2), sp: rand(0.4, 1.6),
        bright: Math.random() < 0.12,
      }))
    }

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      makeStars()
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
    // Phone sky-zone anchor: ONE FIXED spot for every tab — in the title row
    // (which never holds buttons; they wrap to a second row below), just
    // right of the longest page name ("Pre-Trade Checklist" ends ~227px), so
    // the sun/moon never overlaps any title and never changes place per tab.
    // Desktop keeps its zone in the top-right corner (left side = sidebar).
    readTheme()
    let lastRead = 0

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

    // ---- birds: little silhouettes flapping across the sky zone ----
    interface Bird { x: number; y: number; vx: number; size: number; flap: number; flapSpeed: number; bob: number; bobPhase: number }
    const newBird = (): Bird => {
      const dir = Math.random() > 0.5 ? 1 : -1
      return {
        x: dir > 0 ? -40 - rand(0, W * 0.4) : W + 40 + rand(0, W * 0.4),
        y: W <= 820
          ? rand(70, 110) // the fixed title band — same strip on every tab
          : rand(20, 164), // desktop sky band
        vx: dir * rand(46, 95),
        size: rand(4.5, 8),
        flap: rand(0, Math.PI * 2),
        flapSpeed: rand(6.5, 10),
        bob: rand(2.5, 7),
        bobPhase: rand(0, Math.PI * 2),
      }
    }
    const birds: Bird[] = [0, 1, 2].map(() => {
      const b = newBird()
      b.x = rand(0, W) // start mid-flight so the sky is never empty
      return b
    })
    const drawBird = (b: Bird, t: number) => {
      const wing = Math.sin(b.flap) * 0.5 + 0.22 // wing tips: down-stroke..up-stroke
      const y = b.y + Math.sin(t * 0.0012 + b.bobPhase) * b.bob
      const s = b.size
      ctx.strokeStyle = day ? 'rgba(26,30,40,0.5)' : 'rgba(208,216,230,0.42)'
      ctx.lineWidth = Math.max(1.1, s * 0.17)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(b.x - s, y - wing * s * 0.95)
      ctx.quadraticCurveTo(b.x - s * 0.45, y + s * 0.2, b.x, y)
      ctx.quadraticCurveTo(b.x + s * 0.45, y + s * 0.2, b.x + s, y - wing * s * 0.95)
      ctx.stroke()
    }

    // The sun/moon lives ONLY inside a dedicated sky zone — a circular area
    // that is always fully visible and never drifts off-screen. On phones it
    // sits on the LEFT, just below the page name ("Dashboard" …); on desktop
    // it stays in the top-right corner (the left side there is the sidebar).
    // Inside the zone the body slowly orbits (~90s per lap, a clearly visible
    // rotation); which body is up still follows the clock — sun by day, the
    // phase-true moon by night.
    const celestialPos = (t: number) => {
      const a = t * 0.00007 // ~90s per revolution — gently visible drift
      if (W <= 820) {
        // fixed spot in the title band — same on EVERY tab: a small body in
        // a gently elliptical micro-orbit, clear of the topbar (above), the
        // second-row buttons and the stat cards (below), and every page name
        const bodyR = Math.max(11, Math.min(13, W * 0.034))
        const rx = 8
        const ry = 4
        const zx = Math.min(252, W - 68)
        const zy = 92
        return { x: zx + Math.cos(a) * rx, y: zy + Math.sin(a) * ry, r: bodyR }
      }
      const zoneR = Math.max(56, Math.min(92, Math.min(W, H) * 0.16))
      const margin = Math.max(14, W * 0.05)
      const zx = W - zoneR - margin
      const zy = 14 + zoneR
      const bodyR = Math.max(15, Math.min(24, zoneR * 0.26))
      const orbit = zoneR - bodyR - 5
      return {
        x: zx + Math.cos(a) * orbit,
        y: zy + Math.sin(a) * orbit * 0.72, // gently elliptical
        r: bodyR,
      }
    }

    // ---- Realistic SUN: limb-darkened core, layered corona, diffraction spikes ----
    const drawSun = (x: number, y: number, r: number, t: number) => {
      const breathe = 1 + 0.04 * Math.sin(t * 0.0011)

      // wide corona (outer atmosphere) — two soft layers
      const corona = (radius: number, a: number) => {
        const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, radius)
        g.addColorStop(0, `rgba(${accent},${a})`)
        g.addColorStop(0.55, `rgba(${accent},${(a * 0.45).toFixed(3)})`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      corona(r * 4.4 * breathe, 0.16)
      corona(r * 2.5 * breathe, 0.22)

      // photosphere: near-white hot core -> gold limb (limb darkening)
      const disc = ctx.createRadialGradient(x, y, r * 0.05, x, y, r)
      disc.addColorStop(0, 'rgba(255,251,240,1)')
      disc.addColorStop(0.45, `rgba(${accent2},1)`)
      disc.addColorStop(0.85, `rgba(${accent},1)`)
      disc.addColorStop(1, `rgba(${accent},0.92)`)
      ctx.fillStyle = disc
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()

      // thin bright rim just inside the limb
      ctx.strokeStyle = `rgba(${accent2},0.35)`
      ctx.lineWidth = r * 0.05
      ctx.beginPath()
      ctx.arc(x, y, r * 0.985, 0, Math.PI * 2)
      ctx.stroke()

      // diffraction spikes: 4 tapered light streaks (lens effect), very slow drift
      const rot = t * 0.00003
      const spike = (angle: number, len: number, w: number, a: number) => {
        const x2 = x + Math.cos(angle) * len
        const y2 = y + Math.sin(angle) * len
        const nx = -Math.sin(angle) * w
        const ny = Math.cos(angle) * w
        const g = ctx.createLinearGradient(x, y, x2, y2)
        g.addColorStop(0, `rgba(255,250,235,${a})`)
        g.addColorStop(1, 'rgba(255,250,235,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(x + nx * 0.5, y + ny * 0.5)
        ctx.lineTo(x2 + nx, y2 + ny)
        ctx.lineTo(x2 - nx, y2 - ny)
        ctx.lineTo(x - nx * 0.5, y - ny * 0.5)
        ctx.closePath()
        ctx.fill()
      }
      for (let i = 0; i < 4; i++) {
        const a = rot + (i * Math.PI) / 2
        spike(a, r * (i % 2 === 0 ? 5.2 : 3.4) * breathe, r * 0.09, i % 2 === 0 ? 0.14 : 0.08)
      }
    }

    // ---- Realistic MOON: true phase shape, soft terminator, earthshine,
    // ---- maria patches and rim-lit craters ----
    const drawMoon = (x: number, y: number, r: number) => {
      const f = phase.fraction
      const k = 2 * f - 1 // -1..1: terminator ellipse curvature

      // halo
      const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3)
      g.addColorStop(0, `rgba(${accent2},0.15)`)
      g.addColorStop(0.5, `rgba(${accent},0.05)`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r * 3, 0, Math.PI * 2)
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.clip()

      // dark side: earthshine — faintly visible, not pure black
      ctx.fillStyle = 'rgba(16,20,29,0.96)'
      ctx.fillRect(x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 2)
      ctx.fillStyle = `rgba(${accent},0.07)`
      ctx.fillRect(x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 2)

      // lit region (true phase: semicircle + elliptical terminator)
      const lit = ctx.createLinearGradient(x - r, y - r, x + r, y + r)
      lit.addColorStop(0, `rgba(${accent2},0.97)`)
      lit.addColorStop(0.6, `rgba(${accent2},0.92)`)
      lit.addColorStop(1, `rgba(${accent},0.9)`)
      ctx.fillStyle = lit
      ctx.beginPath()
      const rx = r * Math.abs(k)
      if (phase.waxing) {
        ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, false)
        ctx.ellipse(x, y, rx, r, 0, Math.PI / 2, -Math.PI / 2, k > 0 ? false : true)
      } else {
        ctx.arc(x, y, r, Math.PI / 2, -Math.PI / 2, false)
        ctx.ellipse(x, y, rx, r, 0, -Math.PI / 2, Math.PI / 2, k > 0 ? false : true)
      }
      ctx.fill()

      // surface features: maria (dark basalt plains) as soft blobs
      const maria: [number, number, number][] = [
        [-0.34, -0.30, 0.30], [0.10, -0.42, 0.20], [0.30, 0.02, 0.24],
        [-0.12, 0.12, 0.26], [-0.42, 0.30, 0.16], [0.16, 0.38, 0.14],
      ]
      for (const [mx, my, mr] of maria) {
        const mg = ctx.createRadialGradient(x + mx * r, y + my * r, 0, x + mx * r, y + my * r, mr * r)
        mg.addColorStop(0, 'rgba(24,29,42,0.30)')
        mg.addColorStop(1, 'rgba(24,29,42,0)')
        ctx.fillStyle = mg
        ctx.beginPath()
        ctx.arc(x + mx * r, y + my * r, mr * r, 0, Math.PI * 2)
        ctx.fill()
      }

      // craters: dark bowl + bright rim on the lit side
      const craters: [number, number, number][] = [
        [0.42, -0.18, 0.10], [-0.20, -0.05, 0.075], [0.05, 0.30, 0.065],
        [-0.48, -0.12, 0.05], [0.24, 0.12, 0.045], [0.50, 0.34, 0.04],
      ]
      for (const [cx, cy, cr] of craters) {
        const px = x + cx * r, py = y + cy * r, pr = cr * r
        ctx.fillStyle = 'rgba(20,25,37,0.28)'
        ctx.beginPath()
        ctx.arc(px, py, pr, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = `rgba(${accent2},0.22)`
        ctx.lineWidth = Math.max(0.7, pr * 0.28)
        const rimSide = phase.waxing ? -1 : 1 // rim faces the sun
        ctx.beginPath()
        ctx.arc(px + rimSide * pr * 0.12, py, pr * 0.9, phase.waxing ? Math.PI * 0.7 : -Math.PI * 0.3, phase.waxing ? Math.PI * 1.4 : Math.PI * 0.4)
        ctx.stroke()
      }

      // soft terminator: layered strokes fade the edge (fake penumbra)
      const term = () => {
        ctx.beginPath()
        if (phase.waxing) ctx.ellipse(x, y, rx, r, 0, -Math.PI / 2, Math.PI / 2, k > 0)
        else ctx.ellipse(x, y, rx, r, 0, Math.PI / 2, -Math.PI / 2, k > 0)
        ctx.stroke()
      }
      const passes: [number, number][] = [[r * 0.22, 0.08], [r * 0.13, 0.12], [r * 0.06, 0.16]]
      for (const [w, a] of passes) {
        ctx.strokeStyle = `rgba(14,18,27,${a})`
        ctx.lineWidth = w
        term()
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

      // stars come out at night — twinkling across the whole sky
      if (!day) {
        for (const st of stars) {
          const a = Math.max(0.04, st.base + st.amp * Math.sin(t * 0.001 * st.sp + st.ph))
          if (st.bright) {
            // soft glow halo
            const g = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, st.r * 5)
            g.addColorStop(0, `rgba(226,232,246,${(a * 0.35).toFixed(3)})`)
            g.addColorStop(1, 'rgba(226,232,246,0)')
            ctx.fillStyle = g
            ctx.beginPath()
            ctx.arc(st.x, st.y, st.r * 5, 0, Math.PI * 2)
            ctx.fill()
            // four-point sparkle
            ctx.strokeStyle = `rgba(240,244,252,${(a * 0.5).toFixed(3)})`
            ctx.lineWidth = 0.7
            const l = st.r * 4
            ctx.beginPath()
            ctx.moveTo(st.x - l, st.y); ctx.lineTo(st.x + l, st.y)
            ctx.moveTo(st.x, st.y - l); ctx.lineTo(st.x, st.y + l)
            ctx.stroke()
          }
          ctx.fillStyle = `rgba(230,236,248,${a.toFixed(3)})`
          ctx.beginPath()
          ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // sun by day / moon (with tonight's real phase) by night — confined to
      // the sky zone, orbiting slowly so the motion is visible
      const pos = celestialPos(t)
      if (day) drawSun(pos.x, pos.y, pos.r, t)
      else drawMoon(pos.x, pos.y, pos.r)

      // birds drift past, flapping (drawn after the body so they can pass
      // in front of the sun/moon as little silhouettes)
      for (const b of birds) {
        b.x += b.vx * dt
        b.flap += b.flapSpeed * dt
        if ((b.vx > 0 && b.x > W + 60) || (b.vx < 0 && b.x < -60)) Object.assign(b, newBird())
        drawBird(b, t)
      }

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
