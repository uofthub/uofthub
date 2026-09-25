import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Button, Icon, type IconName } from '../ui'
import { Logo } from './Logo'
import { MessagesButton } from './MessagesButton'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'

/** The Mobile feed board's 60px header: logo, then search and the bell. */
export function MobileHeader() {
  const navigate = useNavigate()
  const { user } = useAuth()
  return (
    <header className="topbar topbar--mobile">
      <Logo compact />
      <Button
        variant="ghost"
        iconOnly
        icon="search"
        iconSize={20}
        aria-label="Search"
        className="push"
        onClick={() => navigate('/explore', { state: { focusSearch: true } })}
      />
      <ThemeToggle bare />
      {user ? (
        <>
          <MessagesButton bare />
          <NotificationBell bare />
        </>
      ) : (
        <Button size="sm" to="/session">
          Sign in
        </Button>
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
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/explore', label: 'Explore', icon: 'compass' },
    { to: '/saved', label: 'Saved', icon: 'bookmark' },
    { to: user ? `/u/${user.id}` : '/session', label: 'You', icon: 'user' },
  ]

  const item = (t: Tab) => (
    <NavLink key={t.label} to={t.to} end={t.end} className="bottomnav__item">
      <Icon name={t.icon} size={22} />
      {t.label}
    </NavLink>
  )

  return (
    <nav aria-label="Main" className="bottomnav">
      {tabs.slice(0, 2).map(item)}
      <NavLink
        to={user ? '/projects/new' : '/session'}
        aria-label="Post a project"
        className="bottomnav__post"
      >
        <Icon name="plus" size={24} />
      </NavLink>
      {tabs.slice(2).map(item)}
    </nav>
  )
}
