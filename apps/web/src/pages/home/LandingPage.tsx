import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useDocumentTitle } from '../../lib/hooks'
import { GITHUB_URL } from '../../lib/site'
import Logo from '../../components/brand/Logo'
import Mark from '../../components/brand/Mark'
import { ProjectCard } from '../../components/project'
import { Button, Icon, type IconName } from '../../components/ui'
import './landing.css'
import './shapes.css'

const SHAPES = ['purple', 'blue', 'light-blue', 'red', 'orange', 'cyan'] as const

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
    text: 'Invite teammates, fork someone else’s work, leave feedback that says something.',
  },
  {
    icon: 'globe',
    title: '4. Share',
    text: 'Choose who sees it: a private draft, all of U of T, or the whole internet.',
  },
]

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
    <section className="hero">
      <div className="animatedShapes" aria-hidden="true">
        {SHAPES.map((s) => (
          <span key={s} className={`shape-${s}`} />
        ))}
      </div>

      <div className="hero__inner">
        <Logo width="clamp(240px, 30vw, 380px)" className="floating" style={{ margin: '0 auto' }} />
        <h1 className="disp hero__title">
          Everything students build
          <br />
          at U of T, in one place
        </h1>
        <form onSubmit={submit} className="hero__search" role="search">
          <Icon name="search" size={22} />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Project, course code, or keyword ( Press ' / ' )"
            aria-label="Search projects"
          />
          <Button type="submit" variant="primary">
            Search
          </Button>
        </form>
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
    <div className="landing">
      <Hero />

      <section className="landing__section">
        {trending.length > 0 && (
          <div className="card landing__preview">
            <div
              className="row"
              style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <h2 className="h2">Being read right now</h2>
              <Link to="/explore" style={{ fontSize: 14, fontWeight: 600 }}>
                Explore everything →
              </Link>
            </div>
            <div className="card-grid">
              {trending.map((p) => (
                <ProjectCard key={p.id} project={p} coverHeight={160} />
              ))}
            </div>
          </div>
        )}

        <div className="landing__intro">
          <h2 className="h2 landing__h">One place with all of the work</h2>
          <p className="landing__lede">
            Student work at U of T lives scattered across GitHub, Drive, Discord, Quercus and
            personal sites. uofthub pulls it into a single searchable home — a living portfolio
            built out of what you actually did while you were here.
          </p>
        </div>

        <hr className="landing__rule" />

        <h2 className="h2 landing__h" style={{ marginBottom: 32 }}>
          Features to Explore
        </h2>
        <div className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature">
              <span className="feature__icon" style={{ background: f.colour }}>
                <Icon name={f.icon} size={28} />
              </span>
              <h3 className="disp feature__title">{f.title}</h3>
              <p className="muted feature__text">{f.text}</p>
              <Link to={f.page} className="feature__link">
                Get started
                <Icon name="chevronRight" size={16} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="steps">
        <div className="landing__section" style={{ textAlign: 'center' }}>
          <h2 className="h2 landing__h">Every Step of the Way</h2>
          <p className="muted" style={{ fontSize: 16, paddingBottom: 32 }}>
            From the first idea to the thing you show a recruiter.
          </p>
          <div className="steps__grid">
            {STEPS.map((s) => (
              <div key={s.title}>
                <span className="steps__icon">
                  <Icon name={s.icon} size={44} />
                </span>
                <h3 className="disp" style={{ fontSize: 20, marginTop: 16 }}>
                  {s.title}
                </h3>
                <p className="muted" style={{ fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing__section commitment">
        <Mark size={122} style={{ margin: '0 auto 40px' }} />
        <h2 className="h2 landing__h" style={{ marginBottom: 16 }}>
          Our Commitment
        </h2>
        <p>
          uofthub is open source and built by students, for students. It is not officially
          affiliated with the University of Toronto. What we promise is an ad-free, clean place to
          keep your work, where you decide exactly how much of it the world gets to see — a private
          draft, U of T only, or fully public.
        </p>
        <p>
          Anyone with a U of T email can sign in and publish. Everything else — the code, the
          roadmap, the open issues — is on GitHub, and contributions are welcome.
        </p>
        <p style={{ margin: '32px 0', fontWeight: 600 }}>~ The uofthub team</p>
      </section>

      <section className="landing__section" style={{ paddingBottom: 64 }}>
        <div className="cta">
          <h2 className="disp cta__title">Missing something?</h2>
          <p className="cta__text">
            uofthub is early and shaped by the people using it. If something you need is missing — a
            file type, an integration, a way to show your work — open an issue and tell us.
          </p>
          <div className="row wrap" style={{ gap: 12, justifyContent: 'center', marginTop: 32 }}>
            <Button variant="gold" icon="sparkle" href={`${GITHUB_URL}/issues/new`}>
              Request a feature
            </Button>
            <Link to="/session" state={{ mode: 'signup' }} className="btn cta__start">
              Get started
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
