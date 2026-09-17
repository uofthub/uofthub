import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useUI } from '../lib/ui'
import { useAuth } from '../lib/auth'
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
 *   • /session        — bare, no app bar or drawer
 *   • / signed out    — centred landing nav + tall footer
 *   • everything else — navy drawer + breadcrumb app bar + slim footer
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { collapsed, width, setMobileNav } = useUI()
  const { maybeSignedIn } = useAuth()
  const crumbs = useCrumbs()

  const bare = BARE_ROUTES.includes(pathname)
  // `/` is a sales pitch to a visitor and a feed to a student, and those want
  // different chrome: the pitch is centred and full-bleed, the feed belongs in
  // the app, beside the same sidebar as every other signed-in page.
  //
  // `maybeSignedIn` rather than `user`, so a returning student does not watch
  // the landing header and tall footer paint and then vanish on every visit
  // while /auth/me is in flight.
  const landing = LANDING_ROUTES.includes(pathname) && !maybeSignedIn
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
