import { useNavigate } from 'react-router-dom'
import { useUI } from '../../lib/ui'
import { Divider, Icon } from '../ui'
import { CONTACT_EMAIL, GITHUB_URL, navSections, type NavItem } from './nav'
import mark from '../../assets/uofthub-mark.svg'

function Social() {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
        <Icon name="mdi-github" size={22} color="#707070" />
      </a>
      <a href={`mailto:${CONTACT_EMAIL}`} aria-label="Email us">
        <Icon name="mdi-email-outline" size={22} color="#707070" />
      </a>
    </div>
  )
}

const year = new Date().getFullYear()

/** Tall landing-page footer with link columns (App.vue's `.footerBar`). */
export function LandingFooter() {
  const navigate = useNavigate()
  const go = (item: NavItem) => {
    if (item.internal) navigate(item.link)
    else window.open(item.link, '_blank')?.focus()
  }

  // Same column order the original uses: Community, main nav, Resources.
  const columns = [navSections[1], navSections[0], navSections[2]]

  return (
    <footer className="footerBar">
      <div className="contentMaxWidth" style={{ padding: '32px 0 12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
          <div className="footerCol" style={{ flex: '1 1 240px' }}>
            <img src={mark} alt="" aria-hidden="true" style={{ height: 64, width: 'auto' }} />
            <p className="heading accent--text" style={{ margin: '8px 0 0' }}>
              uofthub
            </p>
            <p className="text--secondary" style={{ fontSize: '0.875rem', marginTop: 4, maxWidth: 260 }}>
              An open home for everything students build at U of T.
            </p>
          </div>

          {columns.map((section, i) => (
            <div key={i} className="footerCol" style={{ flex: '1 1 200px' }}>
              <p
                className="text--disabled"
                style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                {section.heading || 'Quick Links'}
              </p>
              {section.options.map(option => (
                <p key={option.link} style={{ marginBottom: 12 }}>
                  <button
                    className="pointer"
                    onClick={() => go(option)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      font: 'inherit',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {option.page}
                  </button>
                  {!option.internal && (
                    <Icon name="mdi-open-in-new" size={12} color="var(--text-secondary)" style={{ marginLeft: 4 }} />
                  )}
                </p>
              ))}
            </div>
          ))}
        </div>

        <Divider style={{ margin: '8px 0' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 20 }}>
          <p style={{ fontSize: '0.875rem', margin: 0 }}>Copyright © {year} uofthub. All Rights Reserved.</p>
          <div style={{ flex: 1 }} />
          <Social />
        </div>
      </div>
    </footer>
  )
}

/** Slim footer used on inner pages, offset by the drawer width. */
export function AppFooter() {
  const { collapsed, width } = useUI()
  const offset = width < 960 ? 0 : collapsed ? 'var(--sidebar-mini-width)' : 'var(--sidebar-width)'

  return (
    <footer style={{ marginLeft: offset, padding: 16, transition: 'margin-left 0.2s ease' }}>
      <Divider />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24, paddingInline: 4 }}>
        <p style={{ fontSize: '0.875rem', margin: 0 }}>Copyright © {year} uofthub. All Rights Reserved.</p>
        <div style={{ flex: 1 }} />
        <Social />
      </div>
    </footer>
  )
}
