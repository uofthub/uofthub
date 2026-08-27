import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api, type ProjectSummary } from '../lib/api'

const surface = { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }

function AIDiscovery() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['discover', submitted],
    queryFn: () => api.discover.search(submitted),
    enabled: !!submitted,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) setSubmitted(query.trim())
  }

  return (
    <div className="mb-8 rounded-xl p-6" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[var(--color-primary)]">✦</span>
        <h2 className="font-medium text-white text-sm">AI-powered discovery</h2>
      </div>
      <p className="text-[#666] text-sm mb-4">
        Ask in plain English — "ML projects from Engineering" or "trending bioinformatics research"
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="What are you looking for?"
          className="flex-1 rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] outline-none transition-colors"
          style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
        />
        <button type="submit" disabled={!query.trim() || isFetching}
          className="text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40 cursor-pointer transition-colors"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)' }}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}>
          {isFetching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {isError && <p className="text-red-400 text-sm mt-3">{(error as Error).message}</p>}

      {data && (
        <div className="mt-5">
          {data.params && Object.keys(data.params).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(data.params).map(([k, v]) => (
                <span key={k} className="text-xs rounded-full px-2 py-0.5 text-[#aaa]"
                  style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          )}
          {data.projects.length === 0 ? (
            <p className="text-[#555] text-sm">No projects matched this query.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.projects.map(p => (
                <Link key={p.id} to={`/projects/${p.id}`}
                  className="block rounded-lg p-3 no-underline transition-colors"
                  style={{ backgroundColor: 'var(--color-surface-2)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                  <div className="font-medium text-sm text-white truncate">{p.title}</div>
                  {p.owner && <div className="text-xs text-[#666] mt-0.5">{p.owner.name}</div>}
                  <div className="flex gap-3 mt-1.5 text-xs text-[#555]">
                    <span>♥ {p._count.likes}</span>
                    <span>💬 {p._count.comments}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const FACULTIES = ['Arts & Science', 'Engineering', 'Medicine', 'Law', 'Education', 'Rotman', 'Music', 'Architecture']

function VisibilityChip({ v }: { v: string }) {
  if (v === 'PUBLIC') return (
    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: '#0a3320', color: 'var(--color-success)' }}>Public</span>
  )
  if (v === 'UOFT') return (
    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: '#0d1e3a', color: '#7db9ee' }}>U of T</span>
  )
  return (
    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: 'var(--color-surface-2)', color: '#666' }}>Private</span>
  )
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link to={`/projects/${project.id}`}
      className="block rounded-xl p-5 no-underline transition-all group"
      style={surface}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-medium text-white truncate">{project.title}</h3>
          {project.description && (
            <p className="text-sm text-[#aaa] mt-1 line-clamp-2">{project.description}</p>
          )}
        </div>
        <VisibilityChip v={project.visibility} />
      </div>

      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {project.tags.map(tag => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full text-[#aaa]"
              style={{ backgroundColor: 'var(--color-surface-2)' }}>{tag}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-xs text-[#555]">
        {project.owner && <span className="text-[#777]">{project.owner.name}</span>}
        <span>♥ {project._count.likes}</span>
        <span>💬 {project._count.comments}</span>
        <span className="ml-auto">{new Date(project.createdAt).toLocaleDateString()}</span>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [faculty, setFaculty] = useState('')
  const [sort, setSort] = useState<'new' | 'trending'>('new')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', debouncedSearch, faculty, sort],
    queryFn: () => api.projects.list({ search: debouncedSearch || undefined, faculty: faculty || undefined, sort }),
  })

  const handleSearch = (val: string) => {
    setSearch(val)
    clearTimeout((window as unknown as { _st: ReturnType<typeof setTimeout> })._st)
    ;(window as unknown as { _st: ReturnType<typeof setTimeout> })._st = setTimeout(() => setDebouncedSearch(val), 300)
  }

  return (
    <div>
      <AIDiscovery />

      <div className="mb-8">
        <h1 className="text-3xl font-medium text-white mb-1">uofthub</h1>
        <p className="text-[#666]">An open-source home for everything students build at U of T.</p>
        {user && (
          <Link to="/projects/new"
            className="inline-block mt-4 px-5 py-2 rounded-lg text-sm font-medium no-underline transition-colors"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}>
            + Share a project
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input type="search" placeholder="Search projects…" value={search}
          onChange={e => handleSearch(e.target.value)}
          className="flex-1 min-w-48 rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] outline-none transition-colors"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border)')} />

        <select value={faculty} onChange={e => setFaculty(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm text-white outline-none cursor-pointer"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <option value="">All faculties</option>
          {FACULTIES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        <div className="flex rounded-lg overflow-hidden text-sm"
          style={{ border: '1px solid var(--color-border)' }}>
          {(['new', 'trending'] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className="px-3 py-2 capitalize cursor-pointer transition-colors"
              style={{
                backgroundColor: sort === s ? 'var(--color-primary)' : 'var(--color-surface)',
                color: sort === s ? '#fff' : '#aaa',
              }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-[#555]">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-[#555]">
          {debouncedSearch || faculty ? 'No projects match your filters.' : 'No public projects yet. Be the first to share one!'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map(p => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  )
}
