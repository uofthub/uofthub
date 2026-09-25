import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Button, Icon, type IconName } from '../ui'
import { AccountMenu } from './AccountMenu'
import { Logo } from './Logo'
import { MessagesButton } from './MessagesButton'
import { NotificationBell } from './NotificationBell'
import { SearchBox } from './SearchBox'
import { ThemeToggle } from './ThemeToggle'

const PRIMARY: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/explore', label: 'Explore', icon: 'compass' },
]

/** The desktop header from every board: logo, search, Home/Explore, bell, post, you. */
export function Header() {
  const { user, maybeSignedIn } = useAuth()

  return (
    <header className="topbar">
      <Logo />
      <SearchBox />
      <nav aria-label="Primary" className="topbar__nav">
        {PRIMARY.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="topbar__link">
            <Icon name={item.icon} size={18} />
            <span className="topbar__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <ThemeToggle />
      {user ? (
        <>
          <MessagesButton />
          <NotificationBell />
          <Button
            variant="primary"
            icon="plus"
            to="/projects/new"
            className="topbar__post"
            aria-label="Post a project"
          >
            <span className="topbar__post-label">Post a project</span>
          </Button>
          <AccountMenu />
        </>
      ) : (
        // While a returning student's session is still being confirmed, hold
        // the space rather than flashing "Sign in" at somebody who is.
        !maybeSignedIn && (
          <>
            <Link to="/session" className="btn">
              Sign in
            </Link>
            <Link to="/session" state={{ mode: 'signup' }} className="btn btn-p">
              Join uofthub
            </Link>
          </>
        )
      )}
    </header>
  )
}
