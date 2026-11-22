import { Suspense, useCallback, useState } from 'react'
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

const SystemLayout = () => {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  // Number of dark heroes on screen (home hero, page headers); while > 0 the navbar overlays them
  const [heroes, setHeroes] = useState(0)
  // The location card is on screen: the agent pop-up waits so they never stack
  const [askingLocation, setAskingLocation] = useState(false)
  const registerHero = useCallback(() => {
    setHeroes((n) => n + 1)
    return () => setHeroes((n) => n - 1)
  }, [])

  // Sign in / create account open the full-screen auth pages and return here afterwards
  const openAuth = (mode) =>
    navigate(mode === 'signup' ? '/register' : '/login', { state: { from: pathname + search, voluntary: true } })

  return (
    <NavOverlayContext.Provider value={registerHero}>
      <div className="flex min-h-dvh flex-col">
        <SmoothScroll />
        <ScrollRestoration />
        <Navbar onAuth={openAuth} overHero={heroes > 0} />
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex-1"
        >
          {/* Page code loads inside the content area: the navbar and footer stay */}
          <Suspense fallback={<PageLoader label="Loading page..." />}><Outlet /></Suspense>
        </motion.main>
        <Footer />
        {/* Homes picked for comparison on this device */}
        <CompareBar />
        {/* "Use your location?" card: explains why before the browser asks (rules: utils/visitorLocation.js) */}
        <LocationPrompt onOpenChange={setAskingLocation} />
        {/* "Want to become an agent?" pop-up for visitors and customers (timing rules: utils/agentPromo.js) */}
        <AgentPromo paused={askingLocation} />
      </div>
    </NavOverlayContext.Provider>
  )
}

export default SystemLayout
