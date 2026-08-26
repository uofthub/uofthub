import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type ProjectSummary } from '../lib/api'

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link to={`/projects/${project.id}`}
      className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-gray-900 truncate">{project.title}</h3>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
          project.visibility === 'PUBLIC' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {project.visibility === 'UOFT' ? 'U of T' : 'Public'}
        </span>
      </div>
      {project.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>}
      {project.owner && (
        <p className="text-xs text-gray-400 mt-2">{project.owner.name}</p>
      )}
      <div className="flex gap-3 mt-2 text-xs text-gray-400">
        <span>♥ {project._count.likes}</span>
        <span>💬 {project._count.comments}</span>
      </div>
    </Link>
  )
}

export default function CoursePage() {
  const { tag } = useParams<{ tag: string }>()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['courseProjects', tag],
    queryFn: () => api.projects.list({ search: tag }),
    enabled: !!tag,
  })

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-700">← All projects</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{tag}</h1>
        <p className="text-gray-500 text-sm mt-1">Projects tagged with <strong>{tag}</strong></p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No public projects tagged with "{tag}" yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map(p => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  )
}
