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
 * messages, bell, post, account. Where to go lives in the feed's left rail
 * and the account menu.
 */
export function Header() {
  const { user, maybeSignedIn } = useAuth()

  return (
    <header className="sticky top-0 z-50 flex h-header items-center gap-4 border-b border-line bg-surface px-5 2xl:gap-7 2xl:px-8">
      <Logo />
      <SearchBox />
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        {user ? (
          <>
            <MessagesButton />
            <NotificationBell />
            <Button
              variant="primary"
              icon="plus"
              to="/projects/new"
              className="max-[1000px]:w-11 max-[1000px]:px-0"
              aria-label="Post a project"
            >
              <span className="max-[1000px]:hidden">Post a project</span>
            </Button>
            <AccountMenu />
          </>
        ) : (
          // While a returning student's session is still being confirmed, hold
          // the space rather than flashing "Sign in" at somebody who is.
          !maybeSignedIn && (
            <>
              <Button to="/session">Sign in</Button>
              <Button variant="primary" to="/session" state={{ mode: 'signup' }}>
                Join uofthub
              </Button>
            </>
          )
        )}
      </div>
    </header>
  )
}
