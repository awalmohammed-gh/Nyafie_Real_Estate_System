import { RouterProvider } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import router from './router/router'
import { ToastProvider } from './context/ToastProvider'

const App = () => {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </MotionConfig>
  )
}

export default App
