import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import App from './App.tsx'

const queryClient = new QueryClient()

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
