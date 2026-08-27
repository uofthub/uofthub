import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useUI } from '../lib/ui'
import { Btn, Card, Divider, Icon, TextField } from '../components/ui'
import { GITHUB_URL } from '../components/layout/nav'
import Mark from '../components/Mark'
import Logo from '../components/Logo'
import heroPreview from '../assets/hero.png'

const SHAPES = ['purple', 'blue', 'light-blue', 'red', 'orange', 'cyan'] as const

const FEATURES = [
  {
    title: 'Project Showcase',
    text: 'Publish anything you built — a capstone, a hack, an essay, a studio piece — with tags, links, files and collaborators attached.',
    icon: 'mdi-view-grid-outline',
    colour: 'blue',
    page: '/projects',
  },
  {
    title: 'Collaborators',
    text: 'Invite the people you actually built it with. Every contributor gets the project on their own profile, credited properly.',
    icon: 'mdi-account-multiple-plus-outline',
    colour: 'mint',
    page: '/projects/new',
  },
  {
    title: 'Version History',
    text: 'Snapshot a project as it evolves across a term. Look back at what changed between the pitch and the final submission.',
    icon: 'mdi-history',
    colour: 'orange',
    page: '/projects',
  },
  {
    title: 'Clubs & Labs',
    text: 'Design teams, research labs and student clubs get a shared page collecting everything their members have shipped.',
    icon: 'mdi-account-group-outline',
    colour: 'pink',
    page: '/orgs',
  },
  {
    title: 'Analytics',
    text: 'See who is finding your work — views over time, likes, comments and forks, on every project you own.',
    icon: 'mdi-chart-line',
    colour: 'red',
    page: '/projects',
  },
]

const STEPS = [
  { icon: 'mdi-magnify', title: '1. Discover', text: 'Browse everything students across the three campuses have published.' },
  { icon: 'mdi-upload-outline', title: '2. Publish', text: 'Add your project once — description, tags, links, files and credits.' },
  { icon: 'mdi-account-multiple-outline', title: '3. Collaborate', text: 'Invite teammates, fork someone else’s work, leave feedback in comments.' },
  { icon: 'mdi-share-variant-outline', title: '4. Share', text: 'Choose who sees it: just you, all of U of T, or the whole internet.' },
]

function Hero() {
  const { liveAnimations, onDesktop } = useUI()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // '/' focuses the search bar, as it does on uoftindex.ca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && e.target !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(query.trim() ? `/projects?q=${encodeURIComponent(query.trim())}` : '/projects')
  }

  return (
    <section
      style={{
        position: 'relative',
        minHeight: 650,
        height: '65vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
      }}
    >
      {liveAnimations && onDesktop && (
        <div className="animatedShapes" aria-hidden="true">
          {SHAPES.map(s => (
            <span key={s} className={`shape-${s}`} />
          ))}
        </div>
      )}

      <div className="contentMaxWidth" style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
        {/* margin auto, not text-align: the logo is a block and would sit flush left */}
        <Logo width="clamp(240px, 30vw, 380px)" className="floating" style={{ margin: '0 auto' }} />
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', fontWeight: 700, marginTop: 24 }}>
          Everything students build
          <br />
          at U of T, in one place
        </h1>
        <form onSubmit={submit} style={{ maxWidth: 850, margin: '48px auto 0' }}>
          <TextField
            inputRef={inputRef}
            rounded
            prependIcon="mdi-magnify"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Project, course code, or keyword ( Press ' / ' )"
            aria-label="Search projects"
            appendIcon={
              <Btn variant="accent" type="submit">
                Search
              </Btn>
            }
          />
        </form>
      </div>
    </section>
  )
}

function FeatureCards() {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      {FEATURES.map(feature => (
        <Card key={feature.title} flat style={{ background: 'transparent', border: 'none', padding: '16px 8px' }}>
          <div
            className="rounded"
            style={{
              width: 56,
              height: 56,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `var(--tone-${feature.colour})`,
            }}
          >
            <Icon name={feature.icon} size={30} color="#fff" />
          </div>
          <h3 style={{ fontSize: '1.375rem', fontWeight: 700, marginTop: 16 }}>{feature.title}</h3>
          <p className="text--secondary" style={{ marginTop: 8 }}>
            {feature.text}
          </p>
          <button
            className="hover accent--text"
            onClick={() => navigate(feature.page)}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 500 }}
          >
            Get started
            <Icon name="mdi-chevron-right" size={16} />
          </button>
        </Card>
      ))}
    </div>
  )
}

export default function HomePage() {
  const { user } = useAuth()

  return (
    <div>
      <Hero />

      {/* Product preview. Positioned so it paints above the hero's shape layer,
          which is a viewport tall and overhangs the hero itself. */}
      <section style={{ padding: '0 24px', position: 'relative', zIndex: 1 }}>
        <div className="contentMaxWidth">
          <img
            src={heroPreview}
            alt="A project page on uofthub"
            style={{
              width: '100%',
              borderRadius: 12,
              border: '1px solid var(--v-border-base)',
              boxShadow: 'var(--elevation-8)',
            }}
          />

          <div style={{ maxWidth: 700, margin: '64px auto', textAlign: 'center' }}>
            <h2>One place with all of the work</h2>
            <p className="text--secondary">
              Student work at U of T lives scattered across GitHub, Drive, Discord, Canvas and personal sites.
              uofthub pulls it into a single searchable home — a living portfolio built out of what you actually
              did while you were here.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Divider style={{ maxWidth: 800 }} />
          </div>

          <div style={{ marginTop: 64 }}>
            <h2 style={{ marginBottom: 32 }}>Features to Explore</h2>
            <FeatureCards />
          </div>
        </div>
      </section>

      {/* Every step of the way */}
      <section style={{ background: 'var(--v-border-base)', padding: '64px 24px', margin: '80px 0' }}>
        <div className="contentMaxWidth" style={{ textAlign: 'center' }}>
          <h2>Every Step of the Way</h2>
          <p className="text--secondary" style={{ paddingBottom: 32 }}>
            From the first idea to the thing you show a recruiter.
          </p>
          <div style={{ display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {STEPS.map(step => (
              <div key={step.title}>
                <Icon name={step.icon} size={64} color="var(--v-accent-base)" />
                <h3 style={{ marginTop: 16 }}>{step.title}</h3>
                <p className="text--secondary" style={{ fontSize: '0.9375rem' }}>
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commitment */}
      <section style={{ padding: '0 24px', textAlign: 'center' }}>
        <div className="contentMaxWidth" style={{ maxWidth: 750 }}>
          <Mark size={122} style={{ margin: '0 auto 40px' }} />
          <h2 style={{ marginBottom: 16 }}>Our Commitment</h2>
          <p>
            uofthub is open source and built by students, for students. It is not officially affiliated with the
            University of Toronto. What we promise is an ad-free, clean place to keep your work, where you decide
            exactly how much of it the world gets to see — private, U of T only, or fully public.
          </p>
          <p>
            Anyone with a U of T email can sign in and publish. Everything else — the code, the roadmap, the open
            issues — is on GitHub, and contributions are welcome.
          </p>
          <p style={{ margin: '32px 0', fontWeight: 500 }}>~ The uofthub team</p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '48px 24px 64px' }}>
        <div className="contentMaxWidth">
          <Card
            flat
            style={{
              background: '#003C85',
              border: 'none',
              borderRadius: 20,
              padding: '48px 24px',
              textAlign: 'center',
            }}
          >
            <h2 style={{ color: '#fff', paddingBottom: 16 }}>Missing something?</h2>
            <p style={{ color: '#fff', maxWidth: 700, margin: '0 auto' }}>
              uofthub is early and shaped by the people using it. If something you need is missing — a file type,
              an integration, a way to show your work — open an issue and tell us.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 32, flexWrap: 'wrap' }}>
              <Btn
                size="large"
                href={`${GITHUB_URL}/issues/new`}
                target="_blank"
                style={{ background: 'var(--v-warning-base)', color: '#fff', fontWeight: 700 }}
              >
                <Icon name="mdi-cake-variant" color="#fff" />
                Request a feature
              </Btn>
              <Btn
                size="large"
                to={user ? '/projects/new' : '/session'}
                style={{ background: '#fff', color: '#003C85', fontWeight: 700 }}
              >
                {user ? 'Share a project' : 'Get started'}
              </Btn>
            </div>
          </Card>
        </div>
      </section>
    </div>
  )
}
