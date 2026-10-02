import { useEffect, useState } from 'react'

// Animated launch intro: logo + app name reveal, then fades away.
export function SplashIntro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t1 = window.setTimeout(() => setLeaving(true), 2100)
    const t2 = window.setTimeout(onDone, 2750)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [onDone])

  return (
    <div className={'splash' + (leaving ? ' splash-leave' : '')} onClick={onDone}>
      <div className="splash-glow" />
      <div className="splash-inner">
        <div className="splash-logo-wrap">
          <span className="splash-ring" />
          <span className="splash-logo" aria-hidden="true" />
        </div>
        <h1 className="splash-name">
          {'Edgefolio'.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${0.5 + i * 0.055}s` }}>{ch}</span>
          ))}
        </h1>
        <p className="splash-tag">Trade your edge</p>
      </div>
    </div>
  )
}
