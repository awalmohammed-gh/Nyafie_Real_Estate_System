import { useState } from 'react'
import { Link, Outlet, ScrollRestoration, useNavigate } from 'react-router-dom'
import { Loader2, LogOut } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import BrandLogo from '../components/brand/BrandLogo'
import '../pages/agent/workspace.css'

// Agent onboarding (profile, subscription, payment, status): a focused screen with
// only the logo and the signed-in account. No site navbar or footer.
const OnboardingLayout = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  const signOut = async () => {
    setLeaving(true)
    try {
      await logout()
      navigate('/agent/login', { replace: true })
    } finally {
      setLeaving(false)
    }
  }

  return (
    <div className="agent-onboarding flex min-h-dvh flex-col bg-gray-50">
      <ScrollRestoration />
      <header className="border-b border-gray-200 bg-white">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Link to="/" aria-label="Go to the homepage"><BrandLogo size="sm" /></Link>
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="hidden truncate text-gray-500 sm:inline">{user?.email}</span>
            <button type="button" onClick={signOut} disabled={leaving} className="btn btn-light px-3.5 py-2 text-sm">
              {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export default OnboardingLayout
