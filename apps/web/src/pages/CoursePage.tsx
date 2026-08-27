import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type ProjectSummary } from '../lib/api'

const surface = { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link to={`/projects/${project.id}`}
      className="block rounded-xl p-4 no-underline transition-all"
      style={surface}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-white truncate">{project.title}</h3>
        {project.visibility !== 'PRIVATE' && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
            style={project.visibility === 'PUBLIC'
              ? { backgroundColor: '#0a3320', color: 'var(--color-success)' }
              : { backgroundColor: '#0d1e3a', color: '#7db9ee' }}>
            {project.visibility === 'UOFT' ? 'U of T' : 'Public'}
          </span>
        )}
      </div>
      {project.description && <p className="text-sm text-[#aaa] mt-1 line-clamp-2">{project.description}</p>}
      {project.owner && <p className="text-xs text-[#666] mt-2">{project.owner.name}</p>}
      <div className="flex gap-3 mt-2 text-xs text-[#555]">
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
        <Link to="/" className="text-sm text-[#666] hover:text-[#aaa] no-underline transition-colors">← All projects</Link>
        <h1 className="text-2xl font-medium text-white mt-2">{tag}</h1>
        <p className="text-[#666] text-sm mt-1">Projects tagged with <strong className="text-[#aaa]">{tag}</strong></p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-[#555]">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-[#555]">No public projects tagged with "{tag}" yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map(p => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  )
}
