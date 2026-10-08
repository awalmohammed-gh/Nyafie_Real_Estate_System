import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { migrateStorage } from './utils/storage'
import { watchForNewVersion } from './utils/appVersion'

migrateStorage()
watchForNewVersion()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
