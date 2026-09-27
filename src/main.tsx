import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource-variable/plus-jakarta-sans/index.css'
import './styles.css'
import { seedIfEmpty, getSettings, migrateDefaults, ensureAccounts } from './db'
import { applyAccent } from './theme'

async function bootstrap() {
  const settings = await getSettings()
  applyAccent(settings.accent)
  await seedIfEmpty()
  await migrateDefaults()
  await ensureAccounts()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  )

  // App is mounted (behind the animated splash) — fade out the instant backdrop.
  requestAnimationFrame(() => {
    const boot = document.getElementById('boot')
    if (boot) {
      boot.classList.add('hide')
      window.setTimeout(() => boot.remove(), 450)
    }
  })
}

bootstrap()
