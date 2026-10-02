import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Button, cx, Icon, type IconName } from '../ui'
import { AccountMenu } from './AccountMenu'
import { Logo } from './Logo'
import { MessagesButton } from './MessagesButton'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'
import { profilePath } from '../../lib/paths'

/** The Mobile feed board's 60px header: logo, then search, messages, the bell and the account menu. */
export function MobileHeader() {
  const navigate = useNavigate()
  const { user } = useAuth()
  return (
    <header className="sticky top-0 z-50 flex h-header-mobile items-center gap-4 border-b border-line bg-surface px-5">
      <Logo compact />
      <Button
        variant="ghost"
        iconOnly
        icon="search"
        iconSize={20}
        aria-label="Search"
        className="ml-auto"
        onClick={() => navigate('/explore', { state: { focusSearch: true } })}
      />
      {user ? (
        <>
          <MessagesButton bare />
          <NotificationBell bare />
          {/* Sign-out, Settings and the pages with no tab live here, as on
              desktop; it has the dark-mode switch too, so the header doesn't. */}
          <AccountMenu size={32} />
        </>
      ) : (
        <>
          <ThemeToggle bare />
          <Button size="sm" to="/session">
            Sign in
          </Button>
        </>
      )}
    </header>
  )
}

type Tab = { to: string; label: string; icon: IconName; end?: boolean }

/**
 * The phone's bottom bar: Home, Explore, the square Post button, Saved, You.
 * Saved opens the student's own bookmarks.
 */
export function BottomNav() {
  const { user } = useAuth()
  const tabs: Tab[] = [
    { to: user ? '/feed' : '/', label: 'Home', icon: 'home', end: true },
    { to: '/explore', label: 'Explore', icon: 'compass' },
    { to: '/saved', label: 'Saved', icon: 'bookmark' },
    { to: user ? profilePath(user) : '/session', label: 'You', icon: 'user' },
  ]

  const item = (t: Tab) => (
    <NavLink
      key={t.label}
      to={t.to}
      end={t.end}
      className={({ isActive }) =>
        cx(
          'flex w-14 flex-col items-center gap-0.75 text-11 font-semibold',
          isActive ? 'text-navy-ink' : 'text-muted'
        )
      }
    >
      <Icon name={t.icon} size={22} />
      {t.label}
    </NavLink>
  )

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 flex h-bottom-nav items-center justify-around border-t border-line bg-surface pb-[calc(8px+env(safe-area-inset-bottom,0px))]"
    >
      {tabs.slice(0, 2).map(item)}
      <NavLink
        to={user ? '/projects/new' : '/session'}
        aria-label="Post a project"
        className="flex size-13 items-center justify-center rounded-2xl bg-navy text-white hover:bg-navy-deep hover:text-white"
      >
        <Icon name="plus" size={24} />
      </NavLink>
      {tabs.slice(2).map(item)}
    </nav>
  )
}
