import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useUI } from '../../lib/ui'
import { Btn, Chip, Divider, Icon, Switch } from '../ui'
import { navSections, type NavItem } from './nav'
import mark from '../../assets/uofthub-mark.svg'

/** Fullscreen mobile drawer — the `v-dialog fullscreen` nav from App.vue. */
export default function MobileNav() {
  const { mobileNav, setMobileNav, darkMode, setDarkMode } = useUI()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({})

  if (!mobileNav) return null

  const go = (item: Pick<NavItem, 'link' | 'internal'>) => {
    setMobileNav(false)
    if (item.internal) navigate(item.link)
    else window.open(item.link, '_blank')?.focus()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'var(--v-component-base)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid var(--v-border-base)',
          flexShrink: 0,
        }}
      >
        <img src={mark} alt="" aria-hidden="true" style={{ height: 32 }} />
        <div style={{ flex: 1 }} />
        <Btn icon onClick={() => setMobileNav(false)} aria-label="Close navigation">
          <Icon name="mdi-close" size={24} />
        </Btn>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 48 }}>
        <ul className="v-list" style={{ padding: '8px 0' }}>
          {navSections[0].options.map(item => (
            <li key={item.link}>
              <button className="v-list-item" onClick={() => go(item)}>
                <Icon name={item.icon} color="var(--text-secondary)" />
                <span>{item.page}</span>
                {item.beta && (
                  <Chip small color="mint" style={{ fontWeight: 700 }}>
                    BETA
                  </Chip>
                )}
              </button>
            </li>
          ))}
        </ul>

        <Divider style={{ margin: '0 16px' }} />

        <ul className="v-list" style={{ padding: '8px 0' }}>
          {navSections.slice(1).map((section, i) => (
            <li key={section.heading}>
              <button
                className="v-list-item"
                onClick={() => setOpenGroups(g => ({ ...g, [i]: !g[i] }))}
                aria-expanded={!!openGroups[i]}
              >
                <Icon name={section.icon} color="var(--text-secondary)" />
                <span style={{ flex: 1 }}>{section.heading}</span>
                <Icon name={openGroups[i] ? 'mdi-chevron-up' : 'mdi-chevron-down'} color="var(--text-secondary)" />
              </button>
              {openGroups[i] && (
                <ul className="v-list">
                  {section.options.map(item => (
                    <li key={item.link}>
                      <button className="v-list-item" style={{ paddingLeft: 52 }} onClick={() => go(item)}>
                        <span>{item.page}</span>
                        {!item.internal && <Icon name="mdi-open-in-new" size={14} color="var(--text-secondary)" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <Divider style={{ margin: '0 16px' }} />

        <ul className="v-list" style={{ padding: '8px 0' }}>
          {user ? (
            <>
              <li>
                <button className="v-list-item" onClick={() => go({ link: `/u/${user.id}`, internal: 1 })}>
                  <Icon name="mdi-account-circle-outline" color="var(--text-secondary)" />
                  My Profile
                </button>
              </li>
              <li>
                <button
                  className="v-list-item"
                  onClick={async () => {
                    setMobileNav(false)
                    await logout()
                    navigate('/')
                  }}
                >
                  <Icon name="mdi-logout" color="var(--text-secondary)" />
                  Logout
                </button>
              </li>
            </>
          ) : (
            <li>
              <button className="v-list-item" onClick={() => go({ link: '/session', internal: 1 })}>
                <Icon name="mdi-account" color="var(--text-secondary)" />
                Log in | Sign up
              </button>
            </li>
          )}
        </ul>

        <Divider style={{ margin: '0 16px' }} />

        <div style={{ padding: '20px 24px' }}>
          <Switch checked={darkMode} onChange={setDarkMode} label="Dark Mode" />
        </div>
      </div>
    </div>
  )
}
