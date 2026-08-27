import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useUI } from '../lib/ui'
import { useCrumbs } from '../lib/crumbs'
import { Breadcrumbs, Divider } from './ui'
import AppBar from './layout/AppBar'
import Sidebar from './layout/Sidebar'
import MobileNav from './layout/MobileNav'
import CommandModal from './layout/CommandModal'
import ScrollUp from './layout/ScrollUp'
import { AppFooter, LandingFooter } from './layout/Footer'
import { BARE_ROUTES, LANDING_ROUTES } from './layout/nav'

/**
 * Chrome for the whole app, laid out the way uoftindex.ca's App.vue is:
 *   • /session   — bare, no app bar or drawer
 *   • /          — centred landing nav + tall footer
 *   • everything — navy drawer + breadcrumb app bar + slim footer
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { collapsed, width, setMobileNav } = useUI()
  const crumbs = useCrumbs()

  const bare = BARE_ROUTES.includes(pathname)
  const landing = LANDING_ROUTES.includes(pathname)
  const narrow = width < 960

  useEffect(() => {
    window.scrollTo({ top: 0 })
    setMobileNav(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  if (bare) return <>{children}</>

  const offset = landing || narrow ? 0 : collapsed ? 'var(--sidebar-mini-width)' : 'var(--sidebar-width)'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {!landing && !narrow && <Sidebar />}

      <div style={{ marginLeft: offset, transition: 'margin-left 0.2s ease' }}>
        <AppBar variant={landing ? 'landing' : 'inner'} />
      </div>

      <main style={{ flex: 1, marginLeft: offset, transition: 'margin-left 0.2s ease', overflowX: 'hidden' }}>
        {!landing && narrow && (
          <>
            <Divider />
            <div style={{ padding: '12px 24px' }}>
              <Breadcrumbs items={crumbs} />
            </div>
          </>
        )}
        {landing ? children : <div className="contentContainer">{children}</div>}
      </main>

      {landing ? <LandingFooter /> : <AppFooter />}

      <MobileNav />
      <CommandModal />
      <ScrollUp />
    </div>
  )
}
