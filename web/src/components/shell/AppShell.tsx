import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useLiveUpdates } from '../../lib/live'
import { BARE_PAGES, rememberPath } from '../../lib/returnTo'
import { cx } from '../ui'
import { PHONE, useMediaQuery } from '../../lib/hooks'
import { CommandPalette } from './CommandPalette'
import { AppFooter, LandingFooter } from './Footer'
import { Header } from './Header'
import { BottomNav, MobileHeader } from './MobileChrome'
import { ScrollUp } from './ScrollUp'

/** Wide enough for the home feed's right rail, which carries the footer line itself. */
const RAIL = '(width >= 75rem)'

/**
 * The chrome around every page: the desktop header, or on a phone the compact
 * header and the bottom bar. /session, /verify and /reset are drawn bare.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname, hash, search } = useLocation()
  const { user, maybeSignedIn } = useAuth()
  const phone = useMediaQuery(PHONE)
  const wide = useMediaQuery(RAIL)
  useLiveUpdates()

  // A new page starts at the top — unless the link was to a spot on it.
  // Instantly: the page is already easing in, and the page smooth-scrolls by
  // default (index.css), which would otherwise glide up through the old one.
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname, hash])

  // Where to come back to after signing in — see lib/returnTo.ts.
  useEffect(() => rememberPath(pathname + search), [pathname, search])

  if (BARE_PAGES.has(pathname))
    return (
      <>
        {children}
        <CommandPalette />
      </>
    )

  const landing = pathname === '/' && !user && !maybeSignedIn
  // The feed's right rail carries its own footer line.
  const feedHasRail = pathname === '/feed' && wide

  return (
    <div className={cx('flex min-h-screen flex-col', phone && 'pb-bottom-nav')}>
      {phone ? <MobileHeader /> : <Header />}
      <main className="flex flex-1 flex-col">{children}</main>
      {landing ? <LandingFooter /> : !feedHasRail && <AppFooter />}
      {phone && <BottomNav />}
      <ScrollUp phone={phone} />
      <CommandPalette />
    </div>
  )
}
