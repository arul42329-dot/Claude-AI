import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Modal({
  title,
  onClose,
  children,
  footer,
  variant,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** 'sheet' docks to the bottom edge on phones (stays centred on desktop). */
  variant?: 'sheet'
}) {
  // onClose in a ref: parents (e.g. the Markets page) re-render every second
  // and pass a NEW function identity — a plain effect dependency would re-run
  // the scroll lock on every tick, re-capturing values and fighting the
  // user's scroll (the "page stuck / can't swipe" bug). Mount-only below.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lock background scroll while the dialog is open. MOUNT-ONLY: captures the
  // prior state once, restores it once on unmount. (Re-running this on parent
  // re-renders restored stale values and scrolled the page back every second.)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    const prevScrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      // Android WebView can leave the page offset after the keyboard closes —
      // restore the exact position the page had before the dialog opened.
      window.scrollTo(0, prevScrollY)
    }
  }, [])

  // Portal to <body> so the fixed overlay is positioned against the viewport
  // (page-entrance transforms on ancestors would otherwise re-anchor `fixed`,
  // making the dialog appear off-centre / near the bottom on mobile).
  return createPortal(
    <div className={'modal-backdrop' + (variant === 'sheet' ? ' sheet' : '')} onClick={onClose}>
      <div className={'modal' + (variant === 'sheet' ? ' sheet' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>, 
    document.body,
  )
}
