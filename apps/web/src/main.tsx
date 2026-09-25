import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import { IdentifyViewer, Monitoring, monitoringEnabled } from './lib/monitoring'
import App from './App.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outermost, so a crash while the rest of the tree is mounting is still
        caught and reported rather than blanking the page. */}
    <Monitoring>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemeProvider>
              {monitoringEnabled && <IdentifyViewer />}
              <App />
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </Monitoring>
  </StrictMode>
)
