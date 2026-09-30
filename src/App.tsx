import { useEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { maybeDailyBackup } from './drive'
import { getSettings, ensureModeAccount } from './db'
import { getEcon } from './econ'
import { syncNewsAlerts, syncSessionAlerts } from './newsAlerts'
import { checkForUpdate, appVersion } from './updates'
import { isAmoledEnabled, applyAmoled } from './theme'
import { isNativePlatform } from './candles'
import { useLiveQuery } from './util'
import { AppModeProvider, useAppMode } from './mode'
import { ToastProvider, useToast } from './components/Toast'
import { SplashIntro } from './components/SplashIntro'
import { LockScreen } from './components/LockScreen'
import { isLockEnabled } from './lock'
import { AccountSwitcher } from './components/AccountSwitcher'
import { IndiaFlag } from './components/Icons'
import {
  IconDashboard,
  IconPreTrade,
  IconTrades,
  IconAnalytics,
  IconChecklists,
  IconMarkets,
  IconSettings,
} from './components/Icons'
import logoUrl from './assets/logo.png'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import PreTrade from './pages/PreTrade'
import Checklists from './pages/Checklists'
import Analytics from './pages/Analytics'
import Markets from './pages/Markets'
import SettingsPage from './pages/Settings'

const NAV = [
  { to: '/', label: 'Dashboard', Icon: IconDashboard, end: true },
  { to: '/markets', label: 'Markets', Icon: IconMarkets, end: false },
  { to: '/pre-trade', label: 'Pre-Trade', Icon: IconPreTrade, end: false },
  { to: '/trades', label: 'Trades', Icon: IconTrades, end: false },
  { to: '/analytics', label: 'Analytics', Icon: IconAnalytics, end: false },
  { to: '/checklists', label: 'Checklists', Icon: IconChecklists, end: false },
  { to: '/settings', label: 'Settings', Icon: IconSettings, end: false },
]

function AppShell() {
  const location = useLocation()
  const nav = useNavigate()
  const toast = useToast()
  const { mode, isIndia } = useAppMode()
  // Auto-backup to Google Drive once per day, on app open (best-effort, silent).
  useEffect(() => {
    const t = window.setTimeout(() => { maybeDailyBackup() }, 2500)
    return () => window.clearTimeout(t)
  }, [])
  // Keep local notifications booked for upcoming high-impact news (Android).
  // Re-syncs on app open, every 45 min while open, and when back online —
  // scheduled alerts fire even when the app is closed.
  useEffect(() => {
    const sync = () => {
      getEcon().then((s) => { syncNewsAlerts(s) }).catch(() => {})
      syncSessionAlerts().catch(() => {})
    }
    const t = window.setTimeout(sync, 4000)
    const id = window.setInterval(sync, 45 * 60 * 1000)
    const onOnline = () => sync()
    window.addEventListener('online', onOnline)
    return () => {
      window.clearTimeout(t)
      window.clearInterval(id)
      window.removeEventListener('online', onOnline)
    }
  }, [])
  // Android hardware back button: go back a page, or double-press to exit
  // from the top level (instead of the app closing instantly on first tap).
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const navRef = useRef(nav)
  navRef.current = nav
  const toastRef = useRef(toast)
  toastRef.current = toast
  useEffect(() => {
    if (!isNativePlatform()) return
    let disposed = false
    let handle: { remove: () => void } | null = null
    import('@capacitor/app').then(({ App }) => {
      if (disposed) return
      let lastBack = 0
      App.addListener('backButton', () => {
        if (pathRef.current !== '/') { navRef.current(-1); return }
        const now = Date.now()
        if (now - lastBack < 2500) { App.exitApp(); return }
        lastBack = now
        toastRef.current('Press back again to exit')
      }).then((h) => { handle = h as any })
    }).catch(() => { /* not on Android — ignore */ })
    return () => { disposed = true; handle?.remove() }
  }, [])
  // Silent update check once a day: surface a toast if a newer release exists.
  useEffect(() => {
    const t = window.setTimeout(() => {
      checkForUpdate().then((info) => {
        if (info?.newer) toastRef.current(`Edgefolio v${info.latest} is available — see Settings → Updates`)
      }).catch(() => {})
    }, 6000)
    return () => window.clearTimeout(t)
  }, [])
  // AMOLED pure-black display mode (persisted in localStorage, set in Settings).
  useEffect(() => { applyAmoled(isAmoledEnabled()) }, [])
  // Make sure the current mode has at least one account to journal under.
  useEffect(() => { ensureModeAccount(mode) }, [mode])
  return (
    <div className="app">
      <div className="aurora" aria-hidden="true">
        <span /><span /><span />
      </div>
      <aside className="sidebar">
        <div className="brand">
          <span className="logo-shell">
            <img className="logo-img" src={logoUrl} alt="Edgefolio" />
          </span>
          <div className="name">
            Edgefolio
            <small>{isIndia ? <><IndiaFlag size={13} /> India mode</> : 'Trade your edge'}</small>
          </div>
        </div>
        <AccountSwitcher />
        <div className="nav-group">
          {NAV.map((n, i) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              style={{ animationDelay: `${0.05 * i}s` }}
              className={({ isActive }) => 'nav-link nav-enter' + (isActive ? ' active' : '')}
            >
              <span className="ic"><n.Icon /></span>
              <span className="txt">{n.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="sidebar-footer">
          <span className="dot-live" /> v{appVersion()} · Local &amp; private
          <br />
          Your data never leaves this device.
        </div>
      </aside>

      {/* Compact top bar for phones */}
      <header className="topbar">
        <span className="logo-shell sm">
          <img className="logo-img" src={logoUrl} alt="Edgefolio" />
        </span>
        <span className="topbar-name">Edgefolio{isIndia && <span className="mode-badge"><IndiaFlag size={13} /> India</span>}</span>
        <div style={{ marginLeft: 'auto' }}>
          <AccountSwitcher />
        </div>
      </header>

      <main className="main">
        {/* key on pathname re-triggers the entrance animation per page */}
        <div className="page-fade" key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pre-trade" element={<PreTrade />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/markets" element={<Markets />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/checklists" element={<Checklists />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>

      <nav className="mobile-nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <span className="ic"><n.Icon size={22} /></span>
            <span className="txt">{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const [showIntro, setShowIntro] = useState(true)
  const [locked, setLocked] = useState(() => isLockEnabled())
  const settings = useLiveQuery(() => getSettings(), [], undefined)

  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />

  return (
    <AppModeProvider accentKey={settings?.accent}>
      <ToastProvider>
        {showIntro && <SplashIntro onDone={() => setShowIntro(false)} />}
        <AppShell />
      </ToastProvider>
    </AppModeProvider>
  )
}
