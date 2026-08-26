import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api, type ProjectSummary } from '../lib/api'

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
    <div className="mb-8 bg-gradient-to-br from-blue-900 to-blue-700 rounded-xl p-5 text-white">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">✦</span>
        <h2 className="font-semibold">AI-powered discovery</h2>
      </div>
      <p className="text-blue-200 text-sm mb-3">Ask in plain English — "show me ML projects from Engineering" or "trending bioinformatics research"</p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="What are you looking for?"
          className="flex-1 bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        <button type="submit" disabled={!query.trim() || isFetching}
          className="bg-white text-blue-900 text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-50 disabled:opacity-50 transition-colors">
          {isFetching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {isError && (
        <p className="text-red-300 text-sm mt-3">{(error as Error).message}</p>
      )}

      {data && (
        <div className="mt-4">
          {data.params && Object.keys(data.params).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(data.params).map(([k, v]) => (
                <span key={k} className="text-xs bg-white/20 rounded-full px-2 py-0.5">{k}: {v}</span>
              ))}
            </div>
          )}
          {data.projects.length === 0 ? (
            <p className="text-blue-200 text-sm">No projects matched this query.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.projects.map(p => (
                <Link key={p.id} to={`/projects/${p.id}`}
                  className="block bg-white/10 hover:bg-white/20 rounded-lg p-3 transition-colors">
                  <div className="font-medium text-sm truncate">{p.title}</div>
                  {p.owner && <div className="text-xs text-blue-200 mt-0.5">{p.owner.name}</div>}
                  <div className="flex gap-3 mt-1.5 text-xs text-blue-200">
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

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="block bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{project.title}</h3>
          {project.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
          )}
        </div>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
          project.visibility === 'PUBLIC' ? 'bg-green-100 text-green-700' :
          project.visibility === 'UOFT' ? 'bg-blue-100 text-blue-700' :
          'bg-gray-100 text-gray-600'
        }`}>
          {project.visibility === 'UOFT' ? 'U of T' : project.visibility.charAt(0) + project.visibility.slice(1).toLowerCase()}
        </span>
      </div>

      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {project.tags.map(tag => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
        {project.owner && (
          <span>{project.owner.name}</span>
        )}
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

      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-blue-900 mb-2">uofthub</h1>
        <p className="text-gray-600">An open-source home for everything students build at U of T.</p>
        {user && (
          <Link
            to="/projects/new"
            className="inline-block mt-4 bg-blue-900 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            + Share a project
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="search"
          placeholder="Search projects…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        <select
          value={faculty}
          onChange={e => setFaculty(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
        >
          <option value="">All faculties</option>
          {FACULTIES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        <div className="flex rounded-md border border-gray-300 overflow-hidden text-sm">
          <button
            onClick={() => setSort('new')}
            className={`px-3 py-2 ${sort === 'new' ? 'bg-blue-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            New
          </button>
          <button
            onClick={() => setSort('trending')}
            className={`px-3 py-2 ${sort === 'trending' ? 'bg-blue-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Trending
          </button>
        </div>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
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
