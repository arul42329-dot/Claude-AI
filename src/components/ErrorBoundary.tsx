// Last-resort error boundary. If anything in the render tree throws, the
// whole app would otherwise unmount into a blank screen — instead this shows
// a friendly card with a reload button.

import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { err: string | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(e: any): State {
    return { err: String(e?.message ?? e) }
  }

  componentDidCatch(e: any) {
    // Visible in remote consoles / adb logcat for diagnosis.
    try { console.error('[Edgefolio] render error:', e) } catch { /* ignore */ }
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 42, lineHeight: 1 }}>😵</div>
            <h2 style={{ margin: '12px 0 6px' }}>Something went wrong</h2>
            <p className="muted" style={{ fontSize: 12.5, wordBreak: 'break-word' }}>{this.state.err}</p>
            <button className="btn primary" onClick={() => window.location.reload()}>Reload Edgefolio</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
