import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { migrateStorage } from './utils/storage'
import { watchForNewVersion } from './utils/appVersion'
import { resolveAdminEntry } from './utils/adminEntry'

migrateStorage()
watchForNewVersion()

// The router is built when App loads, so the admin console's private address is
// recognised first (a hash check that takes well under a millisecond).
resolveAdminEntry().finally(async () => {
  const { default: App } = await import('./App.jsx')
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
