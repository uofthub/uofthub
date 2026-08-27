import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useUI } from '../../lib/ui'
import { Chip, Icon, Tooltip, cx } from '../ui'
import { navSections, type NavItem } from './nav'
import Mark from '../../components/Mark'

/**
 * Navy navigation drawer — a port of the `v-navigation-drawer` in App.vue.
 * Collapses to a 65px mini-variant with tooltips, same as uoftindex.ca.
 */
export default function Sidebar() {
  const { collapsed, setCollapsed } = useUI()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const width = collapsed ? 'var(--sidebar-mini-width)' : 'var(--sidebar-width)'

  const go = (item: NavItem) => {
    if (item.internal) navigate(item.link)
    else window.open(item.link, '_blank')?.focus()
  }

  return (
    <aside
      style={{
        position: 'fixed',
        insetBlock: 0,
        left: 0,
        width,
        background: 'var(--navy)',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 8px',
        transition: 'width 0.2s ease',
        overflowX: 'hidden',
      }}
    >
      <Link
        to="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 'var(--app-bar-height)',
          flexShrink: 0,
          paddingLeft: 4,
          color: '#fff',
        }}
      >
        <Mark size={28} tone="white" />
        {!collapsed && (
          <h1 className="heading" style={{ color: '#fff' }}>
            uofthub
          </h1>
        )}
      </Link>

      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 5 }}>
        {navSections.map((section, idx) => (
          <div key={section.heading || idx}>
            <ul className="v-list">
              {section.heading && !collapsed && (
                <li className="v-subheader" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {section.heading}
                </li>
              )}
              {section.options.map(item => {
                const active = pathname === item.link
                const iconColor = active ? 'var(--navy-accent)' : '#fff'
                return (
                  <li key={item.link}>
                    <button
                      onClick={() => go(item)}
                      className={cx('v-list-item', active ? 'activeSideBarItem' : 'sideBarItem')}
                      style={{
                        color: '#fff',
                        margin: '4px 0',
                        padding: collapsed ? '8px 0' : '8px 12px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                      }}
                    >
                      {collapsed ? (
                        <Tooltip text={item.page}>
                          <Icon name={item.icon} size={22} color={iconColor} />
                        </Tooltip>
                      ) : (
                        <>
                          <Icon name={item.icon} size={22} color={iconColor} />
                          <span
                            className="overflow-ellipsis"
                            style={{ fontSize: '0.9rem', fontWeight: 500, flex: 1 }}
                          >
                            {item.page}
                          </span>
                          {item.new && (
                            <Chip small color="orange" style={{ fontWeight: 700 }}>
                              NEW
                            </Chip>
                          )}
                          {item.beta && (
                            <Chip small color="mint" style={{ fontWeight: 700 }}>
                              BETA
                            </Chip>
                          )}
                          {!item.internal && <Icon name="mdi-open-in-new" size={14} color="#fff" />}
                        </>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            {idx + 1 < navSections.length && (
              <hr style={{ border: 'none', borderTop: '1px solid var(--navy-divider)', margin: '16px 8px 8px' }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', padding: '24px 10px' }}>
        <Tooltip text={collapsed ? 'Show Sidebar' : 'Hide Sidebar'}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="pointer"
            style={{ background: 'none', border: 'none', padding: 0, display: 'flex' }}
            aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            <Icon name={collapsed ? 'mdi-page-last' : 'mdi-page-first'} size={26} color="#fff" />
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}
