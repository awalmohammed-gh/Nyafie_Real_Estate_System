import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { migrateStorage } from './utils/storage'
import { watchForNewVersion } from './utils/appVersion'
import { resolveAdminEntry } from './utils/adminEntry'
import { startMonitoring } from './utils/monitoring'
import { registerServiceWorker, watchInstallPrompt } from './utils/pwa'

migrateStorage()
watchForNewVersion()
watchInstallPrompt() // before the app loads, so the browser's install event isn't missed
registerServiceWorker()

// The router is built when App loads, so the admin console's private address is
// recognised first (a hash check that takes well under a millisecond).
resolveAdminEntry().finally(async () => {
  startMonitoring() // error monitoring (only with VITE_SENTRY_DSN), once the admin address can be hidden
  const { default: App } = await import('./App.jsx')
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
