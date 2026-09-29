import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CONTACT_EMAIL, GITHUB_URL, SOURCE_URL } from '../../lib/site'
import Mark from '../brand/Mark'
import { cx, Eyebrow, Icon } from '../ui'

const noteLink = 'text-muted hover:text-ink'

/**
 * The line at the foot of the home feed's right rail, which stands in for a
 * page footer there.
 */
export function FooterNote({ className }: { className?: string }) {
  return (
    <p className={cx('px-1 text-13 leading-[1.8] text-muted', className)}>
      <Link to="/about" className={noteLink}>
        About
      </Link>{' '}
      ·{' '}
      <Link to="/docs" className={noteLink}>
        Docs
      </Link>{' '}
      ·{' '}
      <Link to="/feedback" className={noteLink}>
        Feedback
      </Link>{' '}
      ·{' '}
      <Link to="/terms" className={noteLink}>
        Community guidelines
      </Link>{' '}
      ·{' '}
      <Link to="/privacy" className={noteLink}>
        Privacy
      </Link>
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
      { label: 'Feedback & Report', to: '/feedback' },
      { label: 'GitHub', to: GITHUB_URL, external: true },
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
      { label: 'Read the Docs', to: '/docs' },
    ],
  },
]

const year = new Date().getFullYear()

const social =
  'flex size-9 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink'

function Social() {
  return (
    <div className="flex items-center gap-1">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="uofthub on GitHub"
        className={social}
      >
        <Icon name="branch" size={20} />
      </a>
      <a href={`mailto:${CONTACT_EMAIL}`} aria-label="Email us" className={social}>
        <Icon name="mail" size={20} />
      </a>
    </div>
  )
}

/** The copyright row both footers end on. */
function Bottom({ ruled, children }: { ruled?: boolean; children: ReactNode }) {
  return (
    <div
      className={cx(
        'flex flex-wrap items-center justify-between gap-4 pt-5',
        ruled && 'border-t border-line'
      )}
    >
      {children}
    </div>
  )
}

const footerLink = 'inline-flex items-center gap-1 text-14 text-ink hover:text-navy-ink'

/** The tall footer under the signed-out home page, with its link columns. */
export function LandingFooter() {
  return (
    <footer className="mt-12 border-t border-line bg-fill-warm px-6 pt-8 pb-5">
      <div className="mx-auto max-w-300">
        <div className="flex flex-wrap gap-8 border-b border-line pb-6">
          <div className="flex flex-[1_1_240px] flex-col gap-1">
            <Mark size={60} />
            <p className="mt-2 font-display text-22 font-extrabold tracking-tighter text-navy-ink">
              uofthub
            </p>
            <p className="max-w-65 text-14 text-muted">
              An open home for everything students build at U of T.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.heading} className="flex flex-[1_1_180px] flex-col gap-3">
              <Eyebrow className="mb-1">{col.heading}</Eyebrow>
              {col.links.map((l) =>
                l.external ? (
                  <a
                    key={l.label}
                    href={l.to}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={footerLink}
                  >
                    {l.label}
                    <Icon name="external" size={12} className="text-muted" />
                  </a>
                ) : (
                  <Link key={l.label} to={l.to} className={footerLink}>
                    {l.label}
                  </Link>
                )
              )}
            </div>
          ))}
        </div>
        <Bottom>
          <p className="text-14 text-ink-3">
            © {year} uofthub contributors · Free software under the{' '}
            <a href={SOURCE_URL} className="underline hover:text-navy-ink">
              AGPL-3.0 — get the source
            </a>
          </p>
          <Social />
        </Bottom>
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
  { label: 'Docs', to: '/docs' },
  { label: 'Feedback & Report', to: '/feedback' },
  { label: 'Terms & Ownership', to: '/terms' },
  { label: 'Privacy', to: '/privacy' },
]

const appLink = 'text-ink-3 hover:text-navy-ink'

/** The slim footer on every other page. */
export function AppFooter() {
  return (
    <footer className="px-6 pb-5">
      <div className="mx-auto max-w-300">
        <Bottom ruled>
          <nav className="flex flex-wrap gap-x-4.5 gap-y-1.5 text-14" aria-label="Site">
            {APP_LINKS.map((l) =>
              l.external ? (
                <a
                  key={l.label}
                  href={l.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={appLink}
                >
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} to={l.to} className={appLink}>
                  {l.label}
                </Link>
              )
            )}
          </nav>
          <p className="ml-auto text-14 text-ink-3">© {year} uofthub</p>
          <Social />
        </Bottom>
      </div>
    </footer>
  )
}
