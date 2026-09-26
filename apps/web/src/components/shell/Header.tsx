import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Button } from '../ui'
import { AccountMenu } from './AccountMenu'
import { Logo } from './Logo'
import { MessagesButton } from './MessagesButton'
import { NotificationBell } from './NotificationBell'
import { SearchBox } from './SearchBox'
import { ThemeToggle } from './ThemeToggle'

/**
 * The desktop header: logo, search, then the student's own things — theme,
 * messages, bell, post, account. Where to go lives in the sidebar (SideNav).
 */
export function Header() {
  const { user, maybeSignedIn } = useAuth()

  return (
    <header className="topbar">
      <Logo />
      <SearchBox />
      <div className="topbar__actions">
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
      </div>
    </header>
  )
}
