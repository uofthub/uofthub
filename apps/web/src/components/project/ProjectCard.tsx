import { Link } from 'react-router-dom'
import type { ProjectSummary } from '../../lib/api'
import { cardAction } from '../../lib/outputs'
import { courseOf, makersLabel } from '../../lib/projectView'
import { AvatarStack, Chip, Icon, type AvatarPerson } from '../ui'
import { Cover, CoverTag } from './Cover'
import { CardTop, ProjectStats, StatusPill, TypeBadge, VisibilityPill } from './bits'

/** The owner first, then everyone credited alongside them. */
function makersOf(project: Pick<ProjectSummary, 'owner' | 'collaborators'>, maker?: AvatarPerson) {
  const owner = project.owner ?? maker
  return [...(owner ? [owner] : []), ...(project.collaborators ?? []).map((c) => c.user)]
}

/** "Live demo", "View poster" on the cover: what opening it gets you. */
function CoverAction({ project }: { project: Pick<ProjectSummary, 'id' | 'links' | 'lead'> }) {
  const action = cardAction(project)
  if (!action) return null
  return (
    <CoverTag icon={<Icon name={action.icon === 'external' ? 'globe' : action.icon} size={14} />}>
      {action.icon === 'external' ? 'Live demo' : action.label}
    </CoverTag>
  )
}

/**
 * The Card system board's tile: cover, badge and status, title, pitch, and a
 * footer of who made it and how it landed.
 *
 * Only the cover and the title are links. The board has it that way, and it is
 * what keeps a card from being an anchor with other anchors inside it — the
 * browser closes the outer one early and the card stops being clickable.
 */
export function ProjectCard({
  project,
  maker,
  coverHeight = 190,
}: {
  project: ProjectSummary
  /** Who to credit when the payload has no owner. */
  maker?: AvatarPerson
  coverHeight?: number
}) {
  const href = `/projects/${project.id}`
  const makers = makersOf(project, maker)
  const course = courseOf(project)
  const group = project.orgProjects?.[0]?.org

  return (
    <article className="card pcard">
      <Link to={href} tabIndex={-1} aria-hidden="true">
        <Cover project={project} height={coverHeight}>
          <CoverAction project={project} />
        </Cover>
      </Link>
      <div className="pcard__body">
        <CardTop project={project} />
        <h3 className="disp pcard__title">
          <Link to={href}>{project.title}</Link>
        </h3>
        {project.pitch && <p className="pcard__pitch clamp-2">{project.pitch}</p>}
        <div className="pcard__foot">
          {makers.length > 0 && <AvatarStack people={makers} size={28} />}
          <span className="pcard__who">{makersLabel(makers.map((m) => m.name ?? ''))}</span>
          {course ? (
            <Chip size="xs" tone="subtle">
              Made for {course}
            </Chip>
          ) : (
            group && (
              <Chip size="xs" tone="subtle" to={`/orgs/${group.slug}`}>
                Built with {group.name}
              </Chip>
            )
          )}
          <span className="push">
            <ProjectStats project={project} />
          </span>
        </div>
      </div>
    </article>
  )
}

/** The board's "List layout · denser, for reading and search results". */
export function ProjectListRow({
  project,
  maker,
}: {
  project: ProjectSummary
  maker?: AvatarPerson
}) {
  const href = `/projects/${project.id}`
  const makers = makersOf(project, maker)
  const course = courseOf(project)

  return (
    <article className="card prow">
      <Link to={href} className="prow__thumb" tabIndex={-1} aria-hidden="true">
        <Cover project={project} height={104} radius={10} />
      </Link>
      <div className="prow__main">
        {(project.type || course || project.orgProjects?.length > 0) && (
          <div className="row wrap" style={{ gap: 8 }}>
            <TypeBadge type={project.type} />
            {course && (
              <span className="muted" style={{ fontSize: 13 }}>
                Made for {course}
              </span>
            )}
            {project.orgProjects?.[0] && (
              <span className="muted" style={{ fontSize: 13 }}>
                Built with {project.orgProjects[0].org.name}
              </span>
            )}
          </div>
        )}
        <h3 className="disp prow__title">
          <Link to={href}>{project.title}</Link>
        </h3>
        {project.pitch && <p className="prow__pitch clamp-1">{project.pitch}</p>}
      </div>
      <div className="prow__side">
        <span className="row" style={{ gap: 6 }}>
          <VisibilityPill visibility={project.visibility} />
          <StatusPill status={project.status} />
        </span>
        <span className="row" style={{ gap: 8 }}>
          {makers.length > 0 && <AvatarStack people={makers} size={26} />}
          <ProjectStats project={project} />
        </span>
      </div>
    </article>
  )
}

/** A list of projects in whichever layout the reader picked. */
export function ProjectCollection({
  projects,
  layout,
  maker,
}: {
  projects: ProjectSummary[]
  layout: 'card' | 'list'
  maker?: AvatarPerson
}) {
  if (layout === 'list') {
    return (
      <div className="stack" style={{ gap: 14 }}>
        {projects.map((p) => (
          <ProjectListRow key={p.id} project={p} maker={maker} />
        ))}
      </div>
    )
  }
  return (
    <div className="card-grid">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} maker={maker} />
      ))}
    </div>
  )
}
