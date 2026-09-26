import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PlatformProvider } from './context/PlatformProvider.jsx'
import { AuthProvider } from './context/AuthProvider.jsx'
import { RealEstateProvider } from './context/RealEstateProvider.jsx'
import { migrateStorage } from './utils/storage'

migrateStorage()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <PlatformProvider>
        <RealEstateProvider>
          <App />
        </RealEstateProvider>
      </PlatformProvider>
    </AuthProvider>
  </StrictMode>,
)
