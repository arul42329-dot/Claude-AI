import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource-variable/plus-jakarta-sans/index.css'
import './styles.css'
import { seedIfEmpty, getSettings, migrateDefaults } from './db'

async function bootstrap() {
  await getSettings()
  await seedIfEmpty()
  await migrateDefaults()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  )
}

bootstrap()
