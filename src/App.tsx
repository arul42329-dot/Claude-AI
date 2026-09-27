import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { maybeDailyBackup } from './drive'
import { ToastProvider } from './components/Toast'
import { SplashIntro } from './components/SplashIntro'
import { LockScreen } from './components/LockScreen'
import { isLockEnabled } from './lock'
import { AccountSwitcher } from './components/AccountSwitcher'
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
  // Auto-backup to Google Drive once per day, on app open (best-effort, silent).
  useEffect(() => {
    const t = window.setTimeout(() => { maybeDailyBackup() }, 2500)
    return () => window.clearTimeout(t)
  }, [])
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
            <small>Trade your edge</small>
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
          <span className="dot-live" /> v1.3.2 · Local &amp; private
          <br />
          Your data never leaves this device.
        </div>
      </aside>

      {/* Compact top bar for phones */}
      <header className="topbar">
        <span className="logo-shell sm">
          <img className="logo-img" src={logoUrl} alt="Edgefolio" />
        </span>
        <span className="topbar-name">Edgefolio</span>
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

  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />

  return (
    <ToastProvider>
      {showIntro && <SplashIntro onDone={() => setShowIntro(false)} />}
      <AppShell />
    </ToastProvider>
  )
}
