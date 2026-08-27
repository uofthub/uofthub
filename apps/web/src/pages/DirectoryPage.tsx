import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api } from '../lib/api'
import { ProjectGrid } from '../components/ProjectCard'
import { Btn, Chip, EmptyState, Icon, PageHeader, SelectField, Spinner, TextField } from '../components/ui'

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

/** The project directory — the browse-everything page. */
export default function DirectoryPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  usePageCrumbs([{ text: 'Projects', href: '/projects' }])

  const [search, setSearch] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(search)
  const [faculty, setFaculty] = useState('')
  const [sort, setSort] = useState<'new' | 'trending'>('new')

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setParams(search ? { q: search } : {}, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [search, setParams])

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', debounced, faculty, sort],
    queryFn: () =>
      api.projects.list({ search: debounced || undefined, faculty: faculty || undefined, sort }),
  })

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32 }}>
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

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
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

      {isLoading ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <EmptyState
          icon="mdi-file-search-outline"
          title={
            debounced || faculty
              ? 'No projects match those filters.'
              : 'No public projects yet — be the first to share one.'
          }
        />
      ) : (
        <ProjectGrid projects={projects} />
      )}
    </div>
  )
}
