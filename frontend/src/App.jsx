import { RouterProvider } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import router from './router/router'
import { ToastProvider } from './context/ToastProvider'
import SiteHead from './components/brand/SiteHead'

const App = () => {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <SiteHead />
        <RouterProvider router={router} />
      </ToastProvider>
    </MotionConfig>
  )
}

export default App
