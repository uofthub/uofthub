import { Link } from 'react-router-dom'
import type { ProjectSummary } from '../../lib/api'
import { courseOf } from '../../lib/projectView'
import { Cover } from './Cover'

/**
 * A 96px thumbnail beside a title — the project page's "More built for CSC309"
 * and "You might also like" rails.
 */
export function MiniRow({ project }: { project: ProjectSummary }) {
  const course = courseOf(project)
  const sub = [project.owner?.name, course && `Made for ${course}`].filter(Boolean).join(' · ')
  return (
    <Link to={`/projects/${project.id}`} className="mini-row">
      <span className="mini-row__thumb">
        <Cover project={project} height={60} radius={8} />
      </span>
      <span className="stack" style={{ gap: 3, minWidth: 0 }}>
        <b className="clamp-2" style={{ fontSize: 15, fontWeight: 600 }}>
          {project.title}
        </b>
        {sub && (
          <span className="muted clamp-1" style={{ fontSize: 13 }}>
            {sub}
          </span>
        )}
      </span>
    </Link>
  )
}
