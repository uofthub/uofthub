import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Kbd } from '../../components/shell/Kbd'
import {
  Button,
  Card,
  cx,
  Eyebrow,
  Heading,
  Icon,
  Page,
  PageLede,
  PageTitle,
  searchFrame,
  searchInput,
  type IconName,
} from '../../components/ui'
import { useDocumentTitle } from '../../lib/hooks'
import { GITHUB_URL } from '../../lib/site'
import { LastUpdated } from './Prose'

/** Running text inside a section; lists and links styled once here. */
const body = cx(
  'text-15 leading-[1.7] text-ink-2',
  '[&_li]:mb-1.5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5.5',
  '[&_a]:font-semibold [&_a]:text-navy-ink [&_a]:underline-offset-2 hover:[&_a]:underline',
  '[&_strong]:font-semibold [&_strong]:text-ink'
)

const QUICK_START: { icon: IconName; title: string; text: string; to: string; cta: string }[] = [
  {
    icon: 'user',
    title: 'Sign in with U of T',
    text: 'Use your U of T email. It’s the only thing we verify, and it’s what lets you publish.',
    to: '/session',
    cta: 'Sign in',
  },
  {
    icon: 'plus',
    title: 'Share a project',
    text: 'Add a title, a cover and a few links. Save it as a draft and publish when it’s ready.',
    to: '/projects/new',
    cta: 'Start a project',
  },
  {
    icon: 'compass',
    title: 'Explore what others made',
    text: 'Browse by faculty and course, follow people, and save the work you want to come back to.',
    to: '/explore',
    cta: 'Explore',
  },
]

type Visibility = { icon: IconName; label: string; text: string }

const VISIBILITY: Visibility[] = [
  { icon: 'globe', label: 'Public', text: 'Anyone on the web, including search engines.' },
  {
    icon: 'lock',
    label: 'U of T only',
    text: 'Signed-in students and staff. Good for class work.',
  },
  { icon: 'link', label: 'Unlisted', text: 'Only people you send the link to.' },
  { icon: 'eyeOff', label: 'Draft', text: 'Only you and your collaborators.' },
]

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['⌘', 'K'], action: 'Open the command palette (Ctrl K on Windows and Linux)' },
  { keys: ['/'], action: 'Jump to the search box' },
  { keys: ['↑', '↓'], action: 'Move through palette results' },
  { keys: ['Enter'], action: 'Run the highlighted result' },
  { keys: ['Esc'], action: 'Close the palette or a dialog' },
]

type Section = {
  id: string
  icon: IconName
  title: string
  /** Extra words the filter matches on, beyond the title. */
  keywords: string
  body: ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'accounts',
    icon: 'user',
    title: 'Your account',
    keywords: 'sign in sign up email verify password handle profile settings delete',
    body: (
      <>
        <p>
          Anyone with a U of T email — any address ending in utoronto.ca or toronto.edu — can sign
          up. We send a link to confirm the address, and once it’s confirmed you can publish,
          comment and message. If your U of T address isn’t accepted, email us from it and we’ll
          sort it out.
        </p>
        <ul>
          <li>
            Your <strong>handle</strong> is your address on the site — uofthub.com/@you. You can
            change it from <Link to="/settings">Settings</Link>, with a short wait between changes.
          </li>
          <li>
            Add a bio, your program, and links to your website, GitHub or LinkedIn from your
            profile.
          </li>
          <li>
            Settings is also where you set a password, sign out other sessions, download your data
            or delete your account.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'projects',
    icon: 'layers',
    title: 'Sharing a project',
    keywords: 'post publish new project editor cover links files gallery live demo code video',
    body: (
      <>
        <p>
          A project is anything you made — an app, a paper, a design, a film, a lab result. Start
          one from <Link to="/projects/new">Share a project</Link>; it’s saved as a draft until you
          choose who can see it.
        </p>
        <ul>
          <li>
            <strong>Links become buttons.</strong> A live site turns into “Try it live”, a GitHub
            link into “View code”, and a YouTube or Vimeo link into “Watch”.
          </li>
          <li>
            <strong>Tag the course</strong> it came from so classmates and future students can find
            it by course code.
          </li>
          <li>
            Add images and files to build a gallery, and write up what you made, how, and what you
            learned.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'visibility',
    icon: 'eye',
    title: 'Who can see it',
    keywords: 'visibility public private draft unlisted uoft only privacy',
    body: (
      <>
        <p>
          Every project has its own visibility, and you can change it any time. Nothing is public by
          default.
        </p>
        <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {VISIBILITY.map((v) => (
            <div
              key={v.label}
              className="flex items-start gap-3 rounded-btn border border-line bg-fill-soft p-3.5"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-navy-tint text-navy-ink">
                <Icon name={v.icon} size={16} />
              </span>
              <span className="flex flex-col">
                <span className="text-14 font-semibold text-ink">{v.label}</span>
                <span className="text-13 leading-snug text-muted">{v.text}</span>
              </span>
            </div>
          ))}
        </div>
        <p>
          Read the full details in <Link to="/privacy">Privacy</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'collaborators',
    icon: 'users',
    title: 'Collaborators & credit',
    keywords: 'group team invite collaborator credit accept profile help wanted',
    body: (
      <>
        <p>
          Group work is the norm here. Invite your teammates by their U of T email from the project
          page. If they aren’t on uofthub yet, we email them to join, and the invitation waits for
          them. Once they accept, the project shows up on every collaborator’s profile, and
          collaborators can edit the write-up, files and links. Visibility and credits stay with the
          owner.
        </p>
        <p>
          Looking for people to build with? Set the project’s status to “Looking for help”, say what
          you need, and it appears in <Link to="/help-wanted">Help wanted</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'discovering',
    icon: 'compass',
    title: 'Finding work',
    keywords: 'explore search discover ai feed follow faculty course trending saved',
    body: (
      <>
        <ul>
          <li>
            <Link to="/explore">Explore</Link> browses everything by faculty, course and type.
          </li>
          <li>
            <Link to="/discover">Ask discovery</Link> turns a plain-English description — “robotics
            projects using computer vision” — into a search.
          </li>
          <li>
            Your home feed shows new work from people and courses you follow, plus what’s trending
            this week.
          </li>
          <li>
            Save any project with the bookmark and find it again under{' '}
            <Link to="/saved">Saved</Link>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'collections',
    icon: 'bookmark',
    title: 'Collections',
    keywords: 'collections curate list set group projects',
    body: (
      <p>
        A collection is a hand-picked set of projects — “best CSC309 final projects”, “hardware from
        this year’s design teams”. Make one from <Link to="/collections">Collections</Link> and add
        any project you can see.
      </p>
    ),
  },
  {
    id: 'orgs',
    icon: 'flask',
    title: 'Clubs & labs',
    keywords: 'clubs labs orgs organizations design team research group members',
    body: (
      <p>
        Design teams, student clubs and research groups each get a page with their members and
        everything they’ve made. Find yours under <Link to="/orgs">Clubs &amp; labs</Link>, and ask
        us through <Link to="/feedback?type=other">Feedback</Link> if it isn’t there yet.
      </p>
    ),
  },
  {
    id: 'messages',
    icon: 'inbox',
    title: 'Messages & notifications',
    keywords: 'messages dm chat notifications push email unsubscribe bell',
    body: (
      <>
        <p>
          Message anyone from their profile. Notifications cover comments, reactions, collaborator
          invites and new messages.
        </p>
        <ul>
          <li>
            Turn on <strong>push notifications</strong> in <Link to="/settings">Settings</Link> to
            get them on your phone or desktop.
          </li>
          <li>
            Every notification email has a one-click unsubscribe link, and Settings turns email off
            entirely.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'safety',
    icon: 'shieldCheck',
    title: 'Reporting & safety',
    keywords:
      'report block moderation abuse spam plagiarism takedown suspended appeal nudity sexual scan',
    body: (
      <>
        <p>
          Use the <strong>Report</strong> option in the menu on any project, profile or
          conversation. Reports go straight to a moderator, and the person you report is never told
          who sent it. Reports of sexual content or nudity are read first.
        </p>
        <p>
          Images you upload are checked automatically for nudity a minute or two after they go up.
          If one is flagged, it is hidden — and a project made private — until a moderator has
          looked; if it was a false alarm, it comes back as it was.
        </p>
        <p>
          For anything else — a copyright take-down, an appeal, or something urgent — use{' '}
          <Link to="/feedback?type=report">Feedback &amp; report</Link>. The rules we moderate by
          are in <Link to="/terms">Terms &amp; ownership</Link>.
        </p>
      </>
    ),
  },
]

const matches = (s: Section, q: string) =>
  !q || `${s.title} ${s.keywords}`.toLowerCase().includes(q)

/** The section nearest the top of the viewport, for the contents' highlight. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  const key = ids.join(',')
  useEffect(() => {
    const els = key
      .split(',')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length) {
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          setActive(visible[0].target.id)
        }
      },
      { rootMargin: '-15% 0px -70% 0px' }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [key])
  return active
}

export default function DocsPage() {
  useDocumentTitle('Docs')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => SECTIONS.filter((s) => matches(s, q)), [q])
  const active = useActiveSection(shown.map((s) => s.id))

  return (
    <Page width="wide" className="flex flex-col gap-10">
      {/* Header */}
      <header className="flex flex-col gap-5">
        <div>
          <Eyebrow className="mb-2 flex items-center gap-1.5">
            <Icon name="file" size={14} /> Documentation
          </Eyebrow>
          <PageTitle>How uofthub works</PageTitle>
          <PageLede className="max-w-170">
            Everything you need to share your work, find other people’s, and keep control of who
            sees what.
          </PageLede>
          <LastUpdated date="2026-09-28" className="mt-2" />
        </div>
        <label className={cx(searchFrame, 'h-13 max-w-140 gap-3 rounded-2xl px-4.5')}>
          <Icon name="search" size={18} className="text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the docs — “visibility”, “collaborators”, “report”…"
            aria-label="Search the docs"
            className={cx(searchInput, 'h-full text-16')}
          />
        </label>
      </header>

      {/* Quick start */}
      {!q && (
        <section className="flex flex-col gap-4" aria-labelledby="quick-start">
          <Heading id="quick-start">Get started in three steps</Heading>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {QUICK_START.map((s, i) => (
              <li key={s.title}>
                <Card className="flex h-full flex-col gap-3 p-5.5">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-btn bg-navy-tint text-navy-ink">
                      <Icon name={s.icon} size={20} />
                    </span>
                    <span className="font-display text-28 font-bold text-line-strong">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="font-display text-19 font-bold">{s.title}</h3>
                  <p className="grow text-14 leading-normal text-muted">{s.text}</p>
                  <Link
                    to={s.to}
                    className="inline-flex items-center gap-1 text-14 font-semibold text-navy-ink hover:underline"
                  >
                    {s.cta} <Icon name="chevronRight" size={14} />
                  </Link>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        {/* Contents */}
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-1">
            <Eyebrow className="mb-2 px-3">On this page</Eyebrow>
            {shown.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cx(
                  'flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-1.75 text-14 transition-colors',
                  active === s.id
                    ? 'border-navy bg-navy-wash font-semibold text-navy-ink'
                    : 'border-transparent text-ink-3 hover:bg-fill hover:text-ink'
                )}
              >
                <Icon name={s.icon} size={15} />
                {s.title}
              </a>
            ))}
            <a
              href="#shortcuts"
              className="flex items-center gap-2.5 rounded-lg border-l-2 border-transparent px-3 py-1.75 text-14 text-ink-3 hover:bg-fill hover:text-ink"
            >
              <Icon name="command" size={15} />
              Keyboard shortcuts
            </a>
          </div>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          {shown.length === 0 && (
            <Card className="flex flex-col items-center gap-3 p-10 text-center">
              <Icon name="search" size={28} className="text-muted" />
              <p className="text-16 font-semibold">Nothing matches “{query.trim()}”</p>
              <p className="text-14 text-muted">
                Try another word, or ask us directly and we’ll add it here.
              </p>
              <Button size="md" icon="megaphone" to="/feedback?type=question">
                Ask a question
              </Button>
            </Card>
          )}

          {shown.map((s) => (
            <Card key={s.id} as="section" id={s.id} className="scroll-mt-24 p-6 md:p-7">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-btn bg-navy-tint text-navy-ink">
                  <Icon name={s.icon} size={20} />
                </span>
                <Heading className="text-21">
                  <a href={`#${s.id}`} className="group inline-flex items-center gap-2">
                    {s.title}
                    <Icon
                      name="link"
                      size={15}
                      className="text-muted opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </a>
                </Heading>
              </div>
              <div className={body}>{s.body}</div>
            </Card>
          ))}

          {!q && (
            <Card as="section" id="shortcuts" className="scroll-mt-24 p-6 md:p-7">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-btn bg-navy-tint text-navy-ink">
                  <Icon name="command" size={20} />
                </span>
                <Heading className="text-21">Keyboard shortcuts</Heading>
              </div>
              <dl className="divide-y divide-line-soft">
                {SHORTCUTS.map((s) => (
                  <div key={s.action} className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="text-15 text-ink-2">{s.action}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {s.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          {/* Still stuck */}
          <div className="mt-3 flex flex-col gap-5 rounded-card bg-panel p-7 text-white md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-display text-22 font-bold tracking-tight">
                Didn’t find what you need?
              </h2>
              <p className="max-w-120 text-15 leading-normal text-navy-text">
                Ask us, or read the code and the roadmap on GitHub. Both help us make these docs
                better.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2.5">
              <Button variant="gold" icon="megaphone" to="/feedback?type=question">
                Ask a question
              </Button>
              <Button
                icon="branch"
                href={GITHUB_URL}
                className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                GitHub
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Page>
  )
}
