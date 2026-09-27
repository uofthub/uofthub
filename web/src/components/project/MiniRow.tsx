import { Link } from 'react-router-dom'
import type { ProjectSummary } from '../../lib/api'
import { courseOf } from '../../lib/projectView'
import { Cover } from './Cover'
import { projectPath } from '../../lib/paths'

/**
 * A 96px thumbnail beside a title — the project page's "More built for CSC309"
 * and "You might also like" rails.
 */
export function MiniRow({ project }: { project: ProjectSummary }) {
  const course = courseOf(project)
  const sub = [project.owner?.name, course && `Made for ${course}`].filter(Boolean).join(' · ')
  return (
    <Link
      to={projectPath(project)}
      className="flex items-center gap-3 text-ink hover:text-navy-ink"
    >
      <span className="block w-24 shrink-0">
        <Cover project={project} height={60} radius={8} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.75">
        <b className="line-clamp-2 text-15 font-semibold">{project.title}</b>
        {sub && <span className="line-clamp-1 text-13 text-muted">{sub}</span>}
      </span>
    </Link>
  )
}
