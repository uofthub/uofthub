import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './lib/AuthProvider'
import { ThemeProvider } from './lib/ThemeProvider'
import App from './App.tsx'

const queryClient = new QueryClient()

// A tab left open across a deploy still names the old build's chunks, and
// Pages has deleted them: opening a lazy page (Settings, Messages, the
// editor…) would fail. Load the new build instead — once, so a chunk that is
// genuinely missing can't reload forever.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('reloaded-for-new-build')) return
    sessionStorage.setItem('reloaded-for-new-build', '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

// A data router with one catch-all route: App still declares every route with
// <Routes>, but a data router is what lets the editor block leaving with
// unsaved work (useBlocker).
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    ),
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
