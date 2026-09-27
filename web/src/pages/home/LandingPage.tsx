import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useDocumentTitle } from '../../lib/hooks'
import { GITHUB_URL } from '../../lib/site'
import Logo from '../../components/brand/Logo'
import Mark from '../../components/brand/Mark'
import { ProjectCard } from '../../components/project'
import {
  Button,
  Card,
  CardGrid,
  cx,
  Heading,
  Icon,
  searchFrame,
  searchInput,
  type IconName,
} from '../../components/ui'
import { HeroShapes } from './HeroShapes'

const FEATURES: { title: string; text: string; icon: IconName; colour: string; page: string }[] = [
  {
    title: 'Project Showcase',
    text: 'Publish anything you built — an app, a thesis, a short film, a studio piece — with links, files and collaborators attached.',
    icon: 'grid',
    colour: '#1E3765',
    page: '/explore',
  },
  {
    title: 'AI Discovery',
    text: 'Ask in plain English. "Machine learning projects from Engineering" or "what students built in CSC309 this year" returns exactly that.',
    icon: 'sparkle',
    colour: '#6B2A70',
    page: '/discover',
  },
  {
    title: 'Collaborators',
    text: 'Invite the people you actually built it with. Every contributor gets the project on their own profile, credited properly.',
    icon: 'userPlus',
    colour: '#1F5B34',
    page: '/projects/new',
  },
  {
    title: 'Version History',
    text: 'Snapshot a project as it evolves across a term. Look back at what changed between the pitch and the final submission.',
    icon: 'history',
    colour: '#C07A00',
    page: '/explore',
  },
  {
    title: 'Clubs & Labs',
    text: 'Design teams, research labs and student clubs get a shared page collecting everything their members have made.',
    icon: 'users',
    colour: '#8A3B12',
    page: '/orgs',
  },
  {
    title: 'Real feedback',
    text: 'Three meaningful reactions instead of a like count, comments that answer your question, and insights on who is finding your work.',
    icon: 'star',
    colour: '#2F4650',
    page: '/explore',
  },
]

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'search',
    title: '1. Discover',
    text: 'Browse everything students across the three campuses have published.',
  },
  {
    icon: 'upload',
    title: '2. Publish',
    text: 'Add your project once — a pitch, links, files, the course it was for and your team.',
  },
  {
    icon: 'users',
    title: '3. Collaborate',
    text: 'Invite teammates, find people who want to build with you, leave feedback that says something.',
  },
  {
    icon: 'globe',
    title: '4. Share',
    text: 'Choose who sees it: a private draft, all of U of T, or the whole internet.',
  },
]

/** One band of the page, centred at the site's 1200px. */
function Section({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx('relative z-1 mx-auto w-full max-w-300 px-6', className)}>
      {children}
    </section>
  )
}

const commitment = 'mb-3.5 text-16 leading-[1.65] text-ink-2'

/** A section title on this page — larger than the app's. */
function Title({ className, children }: { className?: string; children: ReactNode }) {
  return <Heading className={cx('text-30 tracking-tighter', className)}>{children}</Heading>
}

function Hero() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // '/' focuses the search bar here too, as the header's does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.key === '/' && target?.tagName !== 'INPUT' && target?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore')
  }

  return (
    <section className="relative flex min-h-120 items-center justify-center px-4 py-12 md:h-[65vh] md:min-h-[650px] md:px-6 md:py-0">
      <HeroShapes />

      <div className="relative z-2 w-full max-w-300 text-center">
        <Logo
          width="clamp(240px, 30vw, 380px)"
          className="mx-auto [filter:drop-shadow(0_15px_5px_rgba(0,0,0,0.1))_drop-shadow(10px_20px_5px_rgba(0,0,0,0.05))]"
        />
        <h1 className="mt-6 font-display text-[clamp(2rem,5vw,3.25rem)] leading-[1.1] font-extrabold tracking-tightest">
          Everything students build
          <br />
          at U of T, in one place
        </h1>
        <form
          onSubmit={submit}
          className={cx(
            searchFrame,
            'mx-auto mt-12 h-13 max-w-[850px] gap-3 rounded-full pr-2 pl-4 shadow-[0_8px_24px_rgba(21,23,28,0.06)] md:h-15 md:pl-5.5'
          )}
          role="search"
        >
          <Icon name="search" size={22} />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Project, course code, or keyword ( Press ' / ' )"
            aria-label="Search projects"
            className={cx(searchInput, 'px-0.5 text-17')}
          />
          <Button type="submit" variant="primary" className="rounded-full">
            Search
          </Button>
        </form>
        {/* The header has no Explore link — the sidebar carries it, and the
            landing page has no sidebar — so this is how a visitor looks around. */}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button variant="primary" icon="compass" to="/explore" className="rounded-full">
            Explore projects
          </Button>
          <Button icon="megaphone" to="/help-wanted" className="rounded-full">
            See who’s looking for help
          </Button>
        </div>
        <p className="mt-3 text-14 text-muted">No account needed to look around.</p>
      </div>
    </section>
  )
}

/**
 * `/` for somebody who is not signed in — the page it has always been (the
 * floating logo over drifting shapes, features, steps, the commitment and the
 * call to action), drawn with the new design's components. Where the old page
 * showed a screenshot of the product, this one shows the product: the projects
 * students are reading right now.
 */
export default function LandingPage() {
  useDocumentTitle()
  const { data: trending = [] } = useQuery({
    queryKey: ['projects', 'landing-trending'],
    queryFn: () => api.projects.list({ sort: 'trending', take: 6 }),
  })

  return (
    <div className="w-full overflow-x-hidden">
      <Hero />

      <Section>
        {trending.length > 0 && (
          <Card className="flex flex-col gap-4.5 p-6 shadow-pop">
            <div className="flex items-baseline justify-between">
              <Heading>Being read right now</Heading>
              <Link to="/explore" className="text-14 font-semibold">
                Explore everything →
              </Link>
            </div>
            <CardGrid>
              {trending.map((p) => (
                <ProjectCard key={p.id} project={p} coverHeight={160} />
              ))}
            </CardGrid>
          </Card>
        )}

        <div className="mx-auto my-16 max-w-175 text-center">
          <Title>One place with all of the work</Title>
          <p className="mt-3 text-17 leading-[1.6] text-ink-3">
            Student work at U of T lives scattered across GitHub, Drive, Discord, Quercus and
            personal sites. uofthub pulls it into a single searchable home — a living portfolio
            built out of what you actually did while you were here.
          </p>
        </div>

        <hr className="mx-auto mb-16 max-w-200 border-line" />

        <Title className="mb-8">Features to Explore</Title>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-8">
          {FEATURES.map((f) => (
            <div key={f.title} className="px-2 py-4">
              <span
                className="flex size-14 items-center justify-center rounded-xl text-white"
                style={{ background: f.colour }}
              >
                <Icon name={f.icon} size={28} />
              </span>
              <h3 className="mt-4 font-display text-22 font-bold">{f.title}</h3>
              <p className="mt-2 text-15 leading-[1.55] text-muted">{f.text}</p>
              <Link
                to={f.page}
                className="mt-2.5 inline-flex items-center gap-0.5 font-semibold text-navy-ink hover:text-navy-deep"
              >
                Get started
                <Icon name="chevronRight" size={16} />
              </Link>
            </div>
          ))}
        </div>
      </Section>

      <div className="my-20 bg-fill-soft py-16">
        <Section className="text-center">
          <Title>Every Step of the Way</Title>
          <p className="pb-8 text-16 text-muted">
            From the first idea to the thing you show a recruiter.
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-8">
            {STEPS.map((s) => (
              <div key={s.title}>
                <span className="inline-flex text-navy-ink">
                  <Icon name={s.icon} size={44} />
                </span>
                <h3 className="mt-4 font-display text-20 font-bold">{s.title}</h3>
                <p className="mt-1.5 text-15 leading-normal text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section className="max-w-[750px] text-center">
        <Mark size={122} className="mx-auto mb-10" />
        <Title className="mb-4">Our Commitment</Title>
        <p className={commitment}>
          uofthub is open source and built by students, for students. It is not officially
          affiliated with the University of Toronto. What we promise is an ad-free, clean place to
          keep your work, where you decide exactly how much of it the world gets to see — a private
          draft, U of T only, or fully public.
        </p>
        <p className={commitment}>
          Anyone with a U of T email can sign in and publish. Everything else — the code, the
          roadmap, the open issues — is on GitHub, and contributions are welcome.
        </p>
        <p className={cx(commitment, 'my-8 font-semibold')}>~ The uofthub team</p>
      </Section>

      <Section className="pb-16">
        <div className="rounded-[20px] bg-panel px-6 py-12 text-center text-white">
          <h2 className="pb-4 font-display text-32 font-bold tracking-tighter">
            Missing something?
          </h2>
          <p className="mx-auto max-w-175 text-16 leading-[1.6] text-navy-text">
            uofthub is early and shaped by the people using it. If something you need is missing — a
            file type, an integration, a way to show your work — open an issue and tell us.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button variant="gold" icon="sparkle" href={`${GITHUB_URL}/issues/new`}>
              Request a feature
            </Button>
            <Button
              to="/session"
              state={{ mode: 'signup' }}
              className="border-white bg-white text-[#1e3765] hover:bg-[#f3f1eb] hover:text-[#1e3765]"
            >
              Get started
            </Button>
          </div>
        </div>
      </Section>
    </div>
  )
}
