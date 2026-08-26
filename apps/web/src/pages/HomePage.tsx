import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api, type ProjectSummary } from '../lib/api'

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
