import { Link } from 'react-router-dom'
import { CONTACT_EMAIL, GITHUB_URL } from '../../lib/site'
import Mark from '../brand/Mark'
import { Icon } from '../ui'

/**
 * The line at the foot of the home feed's right rail, which stands in for a
 * page footer there.
 */
export function FooterNote({ className }: { className?: string }) {
  return (
    <p className={className ? `footer-note muted ${className}` : 'footer-note muted'}>
      <Link to="/about">About</Link> ·{' '}
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
        Open source
      </a>{' '}
      · <Link to="/terms">Community guidelines</Link> · <Link to="/privacy">Privacy</Link>
      <br />
      Made by U of T students, for U of T students.
    </p>
  )
}

type FooterLink = { label: string; to: string; external?: boolean }

/** The columns the previous footer had: Community, Quick links, Resources. */
const COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Community',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Feedback & Report', to: `${GITHUB_URL}/issues`, external: true },
    ],
  },
  {
    heading: 'Quick links',
    links: [
      { label: 'Explore', to: '/explore' },
      { label: 'Discover', to: '/discover' },
      { label: 'Clubs & Labs', to: '/orgs' },
      { label: 'Share a project', to: '/projects/new' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Terms & Ownership', to: '/terms' },
      { label: 'Privacy', to: '/privacy' },
      { label: 'Source Code', to: GITHUB_URL, external: true },
      { label: 'Read the Docs', to: `${GITHUB_URL}#readme`, external: true },
    ],
  },
]

const year = new Date().getFullYear()

function Social() {
  return (
    <div className="row" style={{ gap: 4 }}>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="uofthub on GitHub"
        className="footer__social"
      >
        <Icon name="branch" size={20} />
      </a>
      <a href={`mailto:${CONTACT_EMAIL}`} aria-label="Email us" className="footer__social">
        <Icon name="mail" size={20} />
      </a>
    </div>
  )
}

function Copyright() {
  return (
    <div className="footer__bottom">
      <p>Copyright © {year} uofthub. All Rights Reserved.</p>
      <Social />
    </div>
  )
}

/** The tall footer under the signed-out home page, with its link columns. */
export function LandingFooter() {
  return (
    <footer className="footer footer--landing">
      <div className="footer__inner">
        <div className="footer__cols">
          <div className="footer__brand">
            <Mark size={60} />
            <p className="disp footer__name">uofthub</p>
            <p className="muted" style={{ fontSize: 14, maxWidth: 260 }}>
              An open home for everything students build at U of T.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.heading} className="footer__col">
              <p className="lbl">{col.heading}</p>
              {col.links.map((l) =>
                l.external ? (
                  <a
                    key={l.label}
                    href={l.to}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer__link"
                  >
                    {l.label}
                    <Icon name="external" size={12} />
                  </a>
                ) : (
                  <Link key={l.label} to={l.to} className="footer__link">
                    {l.label}
                  </Link>
                )
              )}
            </div>
          ))}
        </div>
        <Copyright />
      </div>
    </footer>
  )
}

/**
 * The links every signed-in page needs within reach — the old sidebar carried
 * them on every page, and Terms, Privacy and the feedback link otherwise live
 * only on the home feed's rail.
 */
const APP_LINKS: FooterLink[] = [
  { label: 'About', to: '/about' },
  { label: 'Feedback & Report', to: `${GITHUB_URL}/issues`, external: true },
  { label: 'Terms & Ownership', to: '/terms' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Source Code', to: GITHUB_URL, external: true },
]

/** The slim footer on every other page. */
export function AppFooter() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__bottom">
          <nav className="footer__links" aria-label="Site">
            {APP_LINKS.map((l) =>
              l.external ? (
                <a key={l.label} href={l.to} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} to={l.to}>
                  {l.label}
                </Link>
              )
            )}
          </nav>
          <p>© {year} uofthub</p>
          <Social />
        </div>
      </div>
    </footer>
  )
}
