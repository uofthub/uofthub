import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'
import { Avatar, Menu, MenuDivider, MenuItem } from '../ui'

/**
 * The header avatar. The boards only show it as a link to the profile; it
 * opens a menu instead because sign-out has to live somewhere, as do the pages
 * the design has no nav slot for — Clubs & Labs, AI discovery and, for
 * moderators, the queue.
 */
export function AccountMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { darkMode, setDarkMode, setCommandOpen } = useTheme()
  if (!user) return null

  return (
    <Menu
      width={250}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className="account-trigger"
          aria-label="Your account"
          aria-expanded={open}
          onClick={toggle}
        >
          <Avatar person={user} size={40} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="account-head">
            <b>{user.name}</b>
            <span className="muted">{user.email}</span>
          </div>
          <MenuItem icon="user" to={`/u/${user.id}`} close={close}>
            Your profile
          </MenuItem>
          <MenuItem icon="inbox" to="/messages" close={close}>
            Messages
          </MenuItem>
          <MenuItem icon="layers" to="/collections" close={close}>
            Collections
          </MenuItem>
          <MenuItem icon="users" to="/orgs" close={close}>
            Clubs &amp; labs
          </MenuItem>
          <MenuItem icon="sparkle" to="/discover" close={close}>
            Ask AI discovery
          </MenuItem>
          {user.isAdmin && (
            <MenuItem icon="shieldCheck" to="/admin" close={close}>
              Moderation
            </MenuItem>
          )}
          <MenuDivider />
          <MenuItem
            icon={darkMode ? 'sun' : 'moon'}
            onSelect={() => setDarkMode(!darkMode)}
            close={close}
          >
            {darkMode ? 'Light mode' : 'Dark mode'}
          </MenuItem>
          <MenuItem icon="command" onSelect={() => setCommandOpen(true)} close={close}>
            Command panel <span className="muted">⌘K</span>
          </MenuItem>
          <MenuItem icon="info" to="/about" close={close}>
            About uofthub
          </MenuItem>
          <MenuItem
            icon="logout"
            close={close}
            onSelect={async () => {
              await logout()
              navigate('/')
            }}
          >
            Sign out
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
