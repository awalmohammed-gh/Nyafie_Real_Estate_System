import { Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import Navbar from './Navbar'
import Footer from './Footer'

const SystemLayout = () => {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()

  // Sign in / create account open the full-screen auth pages and return here afterwards
  const openAuth = (mode) =>
    navigate(mode === 'signup' ? '/register' : '/login', { state: { from: pathname + search, voluntary: true } })

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollRestoration />
      <Navbar onAuth={openAuth} />
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="flex-1"
      >
        <Outlet />
      </motion.main>
      <Footer />
    </div>
  )
}

export default SystemLayout
