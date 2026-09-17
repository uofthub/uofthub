import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api } from '../lib/api'
import { ProjectGrid } from '../components/ProjectCard'
import { CAMPUS_LABELS, CAMPUSES } from '../lib/campus'
import { Btn, Chip, EmptyState, Icon, PageHeader, SelectField, Spinner, TextField, Tooltip } from '../components/ui'

const FACULTIES = [
  'Arts & Science',
  'Engineering',
  'Medicine',
  'Law',
  'Education',
  'Rotman',
  'Music',
  'Architecture',
]

const SORTS = [
  { value: 'new', label: 'Newest', icon: 'mdi-clock-outline' },
  { value: 'trending', label: 'Trending', icon: 'mdi-fire' },
] as const

/** Matches the API's default page size, so a short page means the end. */
const PAGE_SIZE = 20

const VIEW_KEY = 'projects-view'
type View = 'grid' | 'list'

/**
 * List, unless this student has said otherwise.
 *
 * The grid used to be the default, and it was the wrong one: a card grid only
 * pays for its vertical space when the cover image is what you are choosing
 * by, and most projects here have never had a file uploaded — their card is a
 * coloured letter of the alphabet above a title. A list also ranks, which a
 * grid cannot: row one is unambiguously first, where a grid's twelve tiles all
 * read as equally important. See docs/feed-and-density.md.
 */
const storedView = (): View => (localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list')

/**
 * The reading column. A 76px thumbnail and a 14px description stretched across
 * a 1600px monitor is its own kind of unreadable, so the list mode narrows the
 * whole page — header and filters included, so nothing sits off on its own.
 * The grid keeps the full width, which is what a gallery wants.
 */
const LIST_MAX_WIDTH = 920

/** The project directory — the browse-everything page. */
export default function DirectoryPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  usePageCrumbs([{ text: 'Projects', href: '/projects' }])

  const [search, setSearch] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(search)
  const [faculty, setFaculty] = useState('')
  const [campus, setCampus] = useState('')
  const [sort, setSort] = useState<'new' | 'trending'>('new')
  const [view, setView] = useState<View>(storedView)

  const chooseView = (next: View) => {
    localStorage.setItem(VIEW_KEY, next)
    setView(next)
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setParams(search ? { q: search } : {}, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [search, setParams])

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['projects', debounced, faculty, campus, sort],
    queryFn: ({ pageParam }) =>
      api.projects.list({
        search: debounced || undefined,
        faculty: faculty || undefined,
        campus: campus || undefined,
        sort,
        skip: pageParam,
      }),
    initialPageParam: 0,
    // A full page means there is probably another; a short one is the end.
    // The list endpoint returns an array rather than a total, and asking it
    // for one would change a response shape four other callers depend on.
    getNextPageParam: (last, all) => (last.length < PAGE_SIZE ? undefined : all.length * PAGE_SIZE),
  })

  const projects = data?.pages.flat() ?? []
  const filtered = !!debounced || !!faculty || !!campus

  return (
    <div
      className="contentMaxWidth"
      style={{ paddingTop: 32, maxWidth: view === 'list' ? LIST_MAX_WIDTH : undefined }}
    >
      <PageHeader
        title="Projects"
        subtitle="Everything students have published — capstones, research, side projects and studio work."
        actions={
          user ? (
            <Btn variant="accent" to="/projects/new">
              <Icon name="mdi-plus" color="#fff" />
              Share a project
            </Btn>
          ) : (
            <Btn variant="accent" to="/session">
              Sign in to publish
            </Btn>
          )
        }
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: '2 1 280px' }}>
          <TextField
            prependIcon="mdi-magnify"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search titles, descriptions and tags…"
            aria-label="Search projects"
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <SelectField value={faculty} onChange={e => setFaculty(e.target.value)} aria-label="Filter by faculty">
            <option value="">All faculties</option>
            {FACULTIES.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </SelectField>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {SORTS.map(s => (
            <Chip
              key={s.value}
              label
              color={sort === s.value ? 'accent' : 'grey'}
              onClick={() => setSort(s.value)}
              style={{ height: 44, paddingInline: 16 }}
            >
              <Icon name={s.icon} size={18} />
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Campus is its own row of pills rather than another dropdown: there
          are only three, students think in them, and a select would hide the
          whole axis behind a click. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <span className="text--disabled" style={{ fontSize: '0.8125rem' }}>
          <Icon name="mdi-map-marker-outline" size={16} /> Campus
        </span>
        <Chip
          label
          color={campus === '' ? 'accent' : 'grey'}
          onClick={() => setCampus('')}
          style={{ paddingInline: 14 }}
        >
          All
        </Chip>
        {CAMPUSES.map(c => (
          <Chip
            key={c}
            label
            color={campus === c ? 'accent' : 'grey'}
            onClick={() => setCampus(campus === c ? '' : c)}
            style={{ paddingInline: 14 }}
          >
            {c} — {CAMPUS_LABELS[c]}
          </Chip>
        ))}
      </div>

      {/* Result count and density, on one line above the results. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, minHeight: 32 }}>
        <span className="text--disabled" style={{ fontSize: '0.8125rem' }}>
          {isLoading
            ? ' '
            : `${hasNextPage ? 'Showing ' : ''}${projects.length} project${projects.length === 1 ? '' : 's'}`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {([
            { value: 'grid', icon: 'mdi-view-grid-outline', label: 'Grid view' },
            { value: 'list', icon: 'mdi-view-list-outline', label: 'List view' },
          ] as const).map(option => (
            <Tooltip key={option.value} text={option.label} position="bottom">
              <Btn
                icon
                aria-label={option.label}
                aria-pressed={view === option.value}
                onClick={() => chooseView(option.value)}
                className={view === option.value ? 'accent--text' : 'text--disabled'}
              >
                <Icon name={option.icon} size={20} />
              </Btn>
            </Tooltip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <EmptyState
          icon="mdi-file-search-outline"
          title={filtered ? 'No projects match those filters.' : 'No public projects yet — be the first to share one.'}
          action={
            filtered ? (
              <Btn
                variant="outlined"
                style={{ marginTop: 12 }}
                onClick={() => {
                  setSearch('')
                  setFaculty('')
                  setCampus('')
                }}
              >
                Clear filters
              </Btn>
            ) : undefined
          }
        />
      ) : (
        <>
          <ProjectGrid projects={projects} view={view} />
          {hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '28px 0' }}>
              <Btn variant="outlined" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  )
}
