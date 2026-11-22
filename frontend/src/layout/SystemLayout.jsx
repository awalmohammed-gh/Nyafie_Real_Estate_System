import { Suspense, useCallback, useRef, useState } from 'react'
import { Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import Navbar from './Navbar'
import Footer from './Footer'
import CompareBar from '../components/property/CompareBar'
import PageLoader from '../components/ui/PageLoader'
import AgentPromo from '../components/ui/AgentPromo'
import LocationPrompt from '../components/location/LocationPrompt'
import SmoothScroll from '../components/ui/SmoothScroll'
import { NavOverlayContext } from '../context/navOverlay'
import { PageLoaderCoverContext } from '../context/pageLoaderCover'
import BottomNav from './BottomNav'
import { useAuth } from '../context/useAuth'
import { bottomNavAllowedOn } from '../utils/bottomNav'

const SystemLayout = () => {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { domain } = useAuth()
  // Phone tab bar: customer pages only, never over a page's own bottom action bar (utils/bottomNav.js)
  const bottomNav = domain === 'customer' && bottomNavAllowedOn(pathname)
  // Number of dark heroes on screen (home hero, page headers); while > 0 the navbar overlays them
  const [heroes, setHeroes] = useState(0)
  // The location card is on screen: the agent pop-up waits so they never stack
  const [askingLocation, setAskingLocation] = useState(false)
  const registerHero = useCallback(() => {
    setHeroes((n) => n + 1)
    return () => setHeroes((n) => n - 1)
  }, [])
  // The phone menu: opened from the header's button, or from the tab bar's centre Menu button
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTriggerRef = useRef(null)
  // Any navigation (including back/forward) closes it
  const routeKey = pathname + search
  const [menuRoute, setMenuRoute] = useState(routeKey)
  if (menuRoute !== routeKey) {
    setMenuRoute(routeKey)
    setMenuOpen(false)
  }

  // Sign in / create account open the full-screen auth pages and return here afterwards
  const openAuth = (mode) =>
    navigate(mode === 'signup' ? '/register' : '/login', { state: { from: pathname + search, voluntary: true } })

  return (
    // While a page loads (its code, or its data), the loader covers the screen: no navbar, footer or half-styled page
    <PageLoaderCoverContext.Provider value={true}>
    <NavOverlayContext.Provider value={registerHero}>
      <div className={`flex min-h-dvh flex-col ${bottomNav ? 'has-bottom-nav' : ''}`}>
        <SmoothScroll />
        <ScrollRestoration />
        <Navbar onAuth={openAuth} overHero={heroes > 0} bottomNav={bottomNav} menuOpen={menuOpen} onMenuOpenChange={setMenuOpen} menuTriggerRef={menuTriggerRef} />
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex-1"
        >
          {/* Page code loads inside the content area (shown as a full-screen loader: components/ui/PageLoader.jsx) */}
          <Suspense fallback={<PageLoader label="Loading page..." />}><Outlet /></Suspense>
        </motion.main>
        <Footer />
        {/* Homes picked for comparison on this device */}
        <CompareBar />
        {/* "Use your location?" card: explains why before the browser asks (rules: utils/visitorLocation.js) */}
        <LocationPrompt onOpenChange={setAskingLocation} paused={menuOpen} />
        {/* "Want to become an agent?" pop-up for visitors and customers (timing rules: utils/agentPromo.js) */}
        <AgentPromo paused={askingLocation || menuOpen} />
        {bottomNav && <BottomNav menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((open) => !open)} onNavigate={() => setMenuOpen(false)} menuButtonRef={menuTriggerRef} />}
      </div>
    </NavOverlayContext.Provider>
    </PageLoaderCoverContext.Provider>
  )
}

export default SystemLayout
