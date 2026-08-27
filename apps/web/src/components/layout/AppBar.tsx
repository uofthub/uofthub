import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useUI } from '../../lib/ui'
import { useCrumbs } from '../../lib/crumbs'
import { Avatar, Breadcrumbs, Btn, Chip, Divider, Icon, Menu, Switch, Tooltip, cx } from '../ui'
import { navSections } from './nav'
import Mark from '../../components/Mark'

/** Brand lockup: the mark, then the wordmark in Jost — as on uoftindex.ca. */
export function Brand({ onNavy }: { onNavy?: boolean }) {
  return (
    <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit' }}>
      <Mark size={32} />
      <h1 className="heading" style={{ color: onNavy ? '#fff' : 'var(--v-text-base)' }}>
        uofthub
      </h1>
    </Link>
  )
}

/** One-click light/dark switch, alongside the fuller settings menu. */
function ThemeToggle() {
  const { darkMode, setDarkMode } = useUI()
  return (
    <Tooltip text={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} position="bottom">
      <Btn icon onClick={() => setDarkMode(!darkMode)} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
        <Icon name={darkMode ? 'mdi-white-balance-sunny' : 'mdi-weather-night'} size={22} />
      </Btn>
    </Tooltip>
  )
}

function SettingsMenu() {
  const { darkMode, setDarkMode, liveAnimations, setLiveAnimations } = useUI()
  return (
    <Menu
      activator={({ toggle }) => (
        <Btn icon onClick={toggle} aria-label="App settings">
          <Icon name="mdi-cog-outline" size={22} color="var(--v-accent-base)" />
        </Btn>
      )}
    >
      {() => (
        <ul className="v-list" style={{ padding: '8px 4px' }}>
          <li className="v-list-item" style={{ cursor: 'default' }}>
            <Switch checked={darkMode} onChange={setDarkMode} label="Dark Mode" />
          </li>
          <li className="v-list-item" style={{ cursor: 'default' }}>
            <Switch checked={liveAnimations} onChange={setLiveAnimations} label="Live Animations" />
          </li>
        </ul>
      )}
    </Menu>
  )
}

function AuthArea() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()

  if (loading) return <div style={{ width: 140 }} />

  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Btn onClick={() => navigate('/session', { state: { mode: 'login' } })}>Log in</Btn>
        <Btn variant="accent" onClick={() => navigate('/session', { state: { mode: 'signup' } })}>
          Sign up
        </Btn>
      </div>
    )
  }

  return (
    <Menu
      activator={({ toggle }) => (
        <button
          onClick={toggle}
          className="pointer"
          style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', padding: 0 }}
          aria-label="Account menu"
        >
          <Avatar name={user.name} img={user.avatarUrl} size={36} />
          <Icon name="mdi-menu-down" color="var(--v-text-base)" />
        </button>
      )}
    >
      {close => (
        <ul className="v-list" style={{ padding: '6px 0' }}>
          <li>
            <Link to={`/u/${user.id}`} className="v-list-item" onClick={close}>
              <Icon name="mdi-account-circle-outline" color="var(--v-accent-base)" />
              My Profile
            </Link>
          </li>
          <li>
            <Link to="/projects/new" className="v-list-item" onClick={close}>
              <Icon name="mdi-plus-box-outline" color="var(--v-accent-base)" />
              Share a Project
            </Link>
          </li>
          <li>
            <Divider style={{ margin: '6px 0' }} />
          </li>
          <li>
            <button
              className="v-list-item"
              onClick={async () => {
                close()
                await logout()
                navigate('/')
              }}
            >
              <Icon name="mdi-logout" color="var(--v-accent-base)" />
              Logout
            </button>
          </li>
        </ul>
      )}
    </Menu>
  )
}

function CommandPanelChip() {
  const { setCommandModal } = useUI()
  return (
    <Chip label color="grey" onClick={() => setCommandModal(true)} className="text--secondary" style={{ paddingInline: 16 }}>
      Command Panel
      <span
        style={{
          marginLeft: 10,
          padding: '0 6px',
          border: '1px solid var(--v-tooltip-base)',
          borderRadius: 5,
          fontSize: '0.75rem',
        }}
      >
        <Icon name="mdi-apple-keyboard-command" size={12} />
        /Ctrl + K
      </span>
    </Chip>
  )
}

export default function AppBar({ variant }: { variant: 'landing' | 'inner' }) {
  const { onDesktop, width, setMobileNav } = useUI()
  const crumbs = useCrumbs()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const compact = variant === 'landing' ? !onDesktop : width < 960

  if (compact) {
    return (
      <header id="topOfPage" className={cx('v-app-bar', scrolled && 'v-app-bar--scrolled')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', width: '100%' }}>
          <Btn icon onClick={() => setMobileNav(true)} aria-label="Open navigation">
            <Icon name="mdi-menu" size={28} />
          </Btn>
          <Brand />
          <div style={{ flex: 1 }} />
          <ThemeToggle />
          <SettingsMenu />
        </div>
      </header>
    )
  }

  return (
    <header id="topOfPage" className={cx('v-app-bar', scrolled && 'v-app-bar--scrolled')}>
      <div className={variant === 'landing' ? 'navCol' : ''} style={{ width: '100%', padding: '8px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {variant === 'landing' ? (
            <>
              <Brand />
              <nav style={{ display: 'flex', alignItems: 'center', gap: 32, marginLeft: 40 }}>
                {navSections[0].options.map(page => (
                  <NavLink
                    key={page.link}
                    to={page.link}
                    className={({ isActive }) => cx('routerLink', isActive && 'is-active')}
                  >
                    {page.page}
                    {page.beta && (
                      <Chip small color="mint" style={{ marginLeft: 6, fontWeight: 700 }}>
                        BETA
                      </Chip>
                    )}
                  </NavLink>
                ))}
              </nav>
            </>
          ) : (
            <Breadcrumbs items={crumbs} />
          )}

          <div style={{ flex: 1 }} />

          {variant === 'inner' && onDesktop && <CommandPanelChip />}
          <AuthArea />
          <Divider vertical style={{ margin: '6px 8px' }} />
          <ThemeToggle />
          <SettingsMenu />
        </div>
      </div>
    </header>
  )
}
