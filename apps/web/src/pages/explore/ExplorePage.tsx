import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Campus } from '@uofthub/types'
import { api } from '../../lib/api'
import { CAMPUS_SHORT, CAMPUSES } from '../../lib/campus'
import { facultyByName } from '../../lib/faculties'
import { PROJECT_TYPES, PROJECT_TYPE_KEYS, type ProjectType } from '../../lib/projectMeta'
import { useDocumentTitle } from '../../lib/hooks'
import { useFacets, useProjectPages } from '../../lib/queries'
import { LayoutToggle, ProjectCollection, type CardLayout } from '../../components/project'
import {
  Button,
  Chip,
  EmptyState,
  Icon,
  Input,
  Menu,
  MenuItem,
  Spinner,
  Toggle,
} from '../../components/ui'
import { CollectionCard, CollectionDialog } from '../../components/collection'
import { useAuth } from '../../lib/auth'
import { FacultyTiles } from './FacultyTiles'
import './explore.css'

type Sort = 'new' | 'trending'

/** One control in the filter row, as the board's "Type ▾" button. */
function FilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | ''
  options: { value: T; label: string }[]
  onChange: (v: T | '') => void
}) {
  const current = options.find((o) => o.value === value)
  return (
    <Menu
      align="left"
      width={220}
      trigger={({ toggle, open }) => (
        <button type="button" className="btn btn--md" aria-expanded={open} onClick={toggle}>
          {current ? `${label}: ${current.label}` : label}
          <Icon name="chevronDown" size={16} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={value === '' ? 'check' : undefined}
            onSelect={() => onChange('')}
            close={close}
          >
            Any
          </MenuItem>
          {options.map((o) => (
            <MenuItem
              key={o.value}
              icon={o.value === value ? 'check' : undefined}
              onSelect={() => onChange(o.value)}
              close={close}
            >
              {o.label}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  )
}

function CourseBrowser() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const { data: facets } = useFacets()
  const popular = (facets?.courses ?? []).slice(0, 5).map((c) => ({ tag: c.code, count: c.count }))

  return (
    <section className="stack" style={{ gap: 16 }}>
      <h2 className="h2">Browse by course</h2>
      <div className="course-browser">
        <form
          className="course-search"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim())
              navigate(`/explore?course=${encodeURIComponent(code.trim().toUpperCase())}`)
          }}
        >
          <Icon name="search" size={18} />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Course code, e.g. MAT102"
            aria-label="Course code"
          />
        </form>
        {popular.length > 0 && (
          <>
            <span className="muted" style={{ fontSize: 14 }}>
              Popular:
            </span>
            {popular.map((t) => (
              <Link
                key={t.tag}
                to={`/explore?course=${encodeURIComponent(t.tag)}`}
                className="chip course-chip"
              >
                <b>{t.tag}</b>
                <span className="muted">{t.count}</span>
              </Link>
            ))}
          </>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        See what past students made for a course before you start yours.
      </p>
    </section>
  )
}

/** The board's three collections, newest first, with the way to start one. */
function Collections() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [making, setMaking] = useState(false)
  const { data = [], isLoading } = useQuery({
    queryKey: ['collections', 'list', 'explore'],
    queryFn: () => api.collections.list({ take: 3 }),
  })
  return (
    <section className="stack" style={{ gap: 16 }}>
      {making && <CollectionDialog onClose={() => setMaking(false)} />}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="h2">Collections</h2>
        <span className="row" style={{ gap: 18 }}>
          {data.length > 0 && (
            <Link to="/collections" style={{ fontSize: 14, fontWeight: 600 }}>
              See all
            </Link>
          )}
          <button
            type="button"
            className="link-btn"
            style={{ fontSize: 14, fontWeight: 600 }}
            onClick={() => (user ? setMaking(true) : navigate('/session'))}
          >
            Make a collection →
          </button>
        </span>
      </div>
      {isLoading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <p className="muted" style={{ fontSize: 15 }}>
          No collections yet. Put together the projects you’d show a friend — “Best of UTM”, “Built
          in first year” — and they’ll show up here.
        </p>
      ) : (
        <div className="collection-grid">
          {data.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      )}
    </section>
  )
}

/** The Explore board, and search results when there is something to search for. */
export default function ExplorePage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const searchRef = useRef<HTMLInputElement>(null)

  const q = params.get('q') ?? ''
  const course = params.get('course') ?? ''
  const faculty = params.get('faculty') ?? ''
  const campus = (params.get('campus') ?? '') as Campus | ''
  const sort = (params.get('sort') as Sort | null) ?? 'new'
  const type = (PROJECT_TYPE_KEYS as string[]).includes(params.get('type') ?? '')
    ? (params.get('type') as ProjectType)
    : ''
  const helpOnly = params.get('help') === '1'

  const [draft, setDraft] = useState(q)
  const [layout, setLayout] = useState<CardLayout>('list')
  const [trendingLayout, setTrendingLayout] = useState<CardLayout>('card')

  useDocumentTitle(course || (q ? `“${q}”` : faculty) || 'Explore')

  // The phone header's search button lands here asking for the field.
  useEffect(() => {
    if ((location.state as { focusSearch?: boolean } | null)?.focusSearch)
      searchRef.current?.focus()
  }, [location.state])

  // Typing updates the URL after a pause, so results follow without a submit
  // and the back button still steps through searches rather than keystrokes.
  useEffect(() => {
    if (draft === q) return
    const t = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (draft.trim()) next.set('q', draft.trim())
          else next.delete('q')
          return next
        },
        { replace: true }
      )
    }, 300)
    return () => clearTimeout(t)
  }, [draft, q, setParams])

  // A search started from the header replaces what is in the box here.
  const [lastQ, setLastQ] = useState(q)
  if (q !== lastQ) {
    setLastQ(q)
    setDraft(q)
  }

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })

  const searching = !!(q || course || faculty || campus || type || helpOnly)
  const results = useProjectPages(
    {
      search: q || undefined,
      course: course || undefined,
      faculty: faculty || undefined,
      campus: campus || undefined,
      type: type || undefined,
      status: helpOnly ? 'HELP_WANTED' : undefined,
      sort,
    },
    searching
  )
  const trending = useQuery({
    queryKey: ['projects', 'explore-trending'],
    queryFn: () => api.projects.list({ sort: 'trending', take: 6 }),
    enabled: !searching,
  })

  const heading = course
    ? course
    : faculty
      ? (facultyByName(faculty)?.short ?? faculty)
      : q
        ? `Results for “${q}”`
        : campus
          ? CAMPUS_SHORT[campus]
          : type
            ? PROJECT_TYPES[type].plural
            : helpOnly
              ? 'Looking for help'
              : ''

  return (
    <div className="page page--wide stack" style={{ gap: 44 }}>
      <div className="stack" style={{ gap: 18 }}>
        <div>
          <h1 className="page-title page-title--xl">Explore</h1>
          <p className="page-lede" style={{ fontSize: 18 }}>
            Work from every faculty and all three campuses.
          </p>
        </div>

        <label className="big-search">
          <Icon name="search" size={22} />
          <Input
            inputRef={searchRef}
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search projects, people, tags or a course code"
            aria-label="Search"
          />
        </label>

        <div className="filter-row">
          <span
            className="muted row"
            style={{ gap: 6, fontSize: 14, fontWeight: 600, marginRight: 4 }}
          >
            <Icon name="filter" size={16} />
            Filter
          </span>
          <FilterMenu<ProjectType>
            label="Type"
            value={type}
            options={PROJECT_TYPE_KEYS.map((k) => ({ value: k, label: PROJECT_TYPES[k].plural }))}
            onChange={(v) => set('type', v)}
          />
          <FilterMenu
            label="Campus"
            value={campus}
            options={CAMPUSES.map((c) => ({ value: c, label: CAMPUS_SHORT[c] }))}
            onChange={(v) => set('campus', v)}
          />
          <FilterMenu<Sort>
            label="Sort"
            value={sort === 'new' ? '' : sort}
            options={[{ value: 'trending', label: 'Trending this week' }]}
            onChange={(v) => set('sort', v)}
          />
          <span className="push">
            <Toggle checked={helpOnly} onChange={(on) => set('help', on ? '1' : '')}>
              Only projects looking for help
            </Toggle>
          </span>
        </div>
      </div>

      {searching ? (
        <section className="stack" style={{ gap: 16 }}>
          <div className="row wrap" style={{ justifyContent: 'space-between', gap: 12 }}>
            <div className="stack" style={{ gap: 6 }}>
              <h2 className="h2">{heading}</h2>
              <div className="row wrap" style={{ gap: 6 }}>
                {q && (
                  <Chip size="sm" tone="outline" onClick={() => set('q', '')}>
                    “{q}” ✕
                  </Chip>
                )}
                {course && (
                  <Chip size="sm" tone="outline" onClick={() => set('course', '')}>
                    {course} ✕
                  </Chip>
                )}
                {faculty && (
                  <Chip size="sm" tone="outline" onClick={() => set('faculty', '')}>
                    {facultyByName(faculty)?.short ?? faculty} ✕
                  </Chip>
                )}
                {campus && (
                  <Chip size="sm" tone="outline" onClick={() => set('campus', '')}>
                    {CAMPUS_SHORT[campus]} ✕
                  </Chip>
                )}
                {type && (
                  <Chip size="sm" tone="outline" onClick={() => set('type', '')}>
                    {PROJECT_TYPES[type].plural} ✕
                  </Chip>
                )}
                {helpOnly && (
                  <Chip size="sm" tone="outline" onClick={() => set('help', '')}>
                    Looking for help ✕
                  </Chip>
                )}
              </div>
            </div>
            <LayoutToggle value={layout} onChange={setLayout} label={false} />
          </div>

          {results.isLoading ? (
            <Spinner />
          ) : results.projects.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nothing matched"
              action={
                <Button onClick={() => setParams({})} icon="close">
                  Clear the search
                </Button>
              }
            >
              {course
                ? `Nobody has posted work for ${course} yet — yours could be the first.`
                : 'Try fewer words, or a course code.'}
            </EmptyState>
          ) : (
            <ProjectCollection projects={results.projects} layout={layout} />
          )}

          {results.hasNextPage && (
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button onClick={() => results.fetchNextPage()} disabled={results.isFetchingNextPage}>
                {results.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="stack" style={{ gap: 16 }}>
            <h2 className="h2">Browse by faculty</h2>
            <FacultyTiles />
          </section>

          <CourseBrowser />

          <Collections />

          <section className="stack" style={{ gap: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="h2">Trending this week</h2>
              <LayoutToggle value={trendingLayout} onChange={setTrendingLayout} label={false} />
            </div>
            {trending.isLoading ? (
              <Spinner />
            ) : trending.data?.length ? (
              <ProjectCollection projects={trending.data} layout={trendingLayout} />
            ) : (
              <EmptyState icon="layers" title="Nothing published yet" />
            )}
          </section>
        </>
      )}
    </div>
  )
}
