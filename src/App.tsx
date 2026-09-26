import { NavLink, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Checklists from './pages/Checklists'
import Analytics from './pages/Analytics'
import SettingsPage from './pages/Settings'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/trades', label: 'Trades', icon: '📝', end: false },
  { to: '/analytics', label: 'Analytics', icon: '📈', end: false },
  { to: '/checklists', label: 'Checklists', icon: '✅', end: false },
  { to: '/settings', label: 'Settings', icon: '⚙️', end: false },
]

export default function App() {
  return (
    <ToastProvider>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="logo">FX</div>
            <div className="name">
              FX Journal
              <small>Trade smarter</small>
            </div>
          </div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <span className="ic">{n.icon}</span>
              <span className="txt">{n.label}</span>
            </NavLink>
          ))}
          <div className="sidebar-footer">
            v1.0 · Local &amp; private
            <br />
            Your data never leaves this device.
          </div>
        </aside>

        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/checklists" element={<Checklists />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
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
    </ToastProvider>
  )
}
