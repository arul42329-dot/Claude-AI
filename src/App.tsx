import { useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { SplashIntro } from './components/SplashIntro'
import logoUrl from './assets/logo.png'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import PreTrade from './pages/PreTrade'
import Checklists from './pages/Checklists'
import Analytics from './pages/Analytics'
import SettingsPage from './pages/Settings'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/pre-trade', label: 'Pre-Trade', icon: '✅', end: false },
  { to: '/trades', label: 'Trades', icon: '📝', end: false },
  { to: '/analytics', label: 'Analytics', icon: '📈', end: false },
  { to: '/checklists', label: 'Checklists', icon: '📋', end: false },
  { to: '/settings', label: 'Settings', icon: '⚙️', end: false },
]

function AppShell() {
  const location = useLocation()
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="logo-img" src={logoUrl} alt="Edgefolio" />
          <div className="name">
            Edgefolio
            <small>Trade your edge</small>
          </div>
        </div>
        {NAV.map((n, i) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            style={{ animationDelay: `${0.05 * i}s` }}
            className={({ isActive }) => 'nav-link nav-enter' + (isActive ? ' active' : '')}
          >
            <span className="ic">{n.icon}</span>
            <span className="txt">{n.label}</span>
          </NavLink>
        ))}
        <div className="sidebar-footer">
          v1.2 · Local &amp; private
          <br />
          Your data never leaves this device.
        </div>
      </aside>

      <main className="main">
        {/* key on pathname re-triggers the entrance animation per page */}
        <div className="page-fade" key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pre-trade" element={<PreTrade />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/checklists" element={<Checklists />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>

      <nav className="mobile-nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <span className="ic">{n.icon}</span>
            <span className="txt">{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const [showIntro, setShowIntro] = useState(true)
  return (
    <ToastProvider>
      {showIntro && <SplashIntro onDone={() => setShowIntro(false)} />}
      <AppShell />
    </ToastProvider>
  )
}
