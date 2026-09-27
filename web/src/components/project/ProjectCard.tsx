import { Link } from 'react-router-dom'
import type { ProjectSummary } from '../../lib/api'
import { cardAction } from '../../lib/outputs'
import { courseOf, makersLabel } from '../../lib/projectView'
import { AvatarStack, Card, CardGrid, Chip, Icon, type AvatarPerson } from '../ui'
import { Cover, CoverTag } from './Cover'
import { CardTop, HelpNeeded, ProjectStats, StatusPill, TypeBadge, VisibilityPill } from './bits'
import { projectPath } from '../../lib/paths'

/** The owner first, then everyone credited alongside them. */
function makersOf(project: Pick<ProjectSummary, 'owner' | 'collaborators'>, maker?: AvatarPerson) {
  const owner = project.owner ?? maker
  return [...(owner ? [owner] : []), ...(project.collaborators ?? []).map((c) => c.user)]
}

/** A card's title link: ink at rest, navy under the pointer. */
export const titleLink = 'text-ink hover:text-navy-ink'

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
  const href = projectPath(project)
  const makers = makersOf(project, maker)
  const course = courseOf(project)
  const group = project.orgProjects?.[0]?.org

  return (
    <Card as="article" className="flex flex-col overflow-hidden">
      <Link to={href} tabIndex={-1} aria-hidden="true">
        <Cover project={project} height={coverHeight}>
          <CoverAction project={project} />
        </Cover>
      </Link>
      <div className="flex grow flex-col gap-2 px-4 pt-3.5 pb-4">
        <CardTop project={project} />
        <h3 className="mt-0.5 font-display text-19 leading-[1.2] font-bold tracking-tight">
          <Link to={href} className={titleLink}>
            {project.title}
          </Link>
        </h3>
        {project.pitch && (
          <p className="line-clamp-2 text-14 leading-[1.45] text-ink-3">{project.pitch}</p>
        )}
        <HelpNeeded project={project} />
        <div className="mt-auto flex min-w-0 items-center gap-2 pt-2">
          {makers.length > 0 && <AvatarStack people={makers} size={28} />}
          <span className="text-13 font-semibold">
            {makersLabel(makers.map((m) => m.name ?? ''))}
          </span>
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
          <span className="ml-auto">
            <ProjectStats project={project} />
          </span>
        </div>
      </div>
    </Card>
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
  const href = projectPath(project)
  const makers = makersOf(project, maker)
  const course = courseOf(project)

  return (
    <Card as="article" className="flex items-center gap-3 p-2.5 sm:gap-4 sm:p-3">
      <Link to={href} className="block w-26 shrink-0 sm:w-44" tabIndex={-1} aria-hidden="true">
        <Cover project={project} height={104} radius={10} />
      </Link>
      <div className="flex min-w-0 grow flex-col gap-1.5">
        {(project.type || course || project.orgProjects?.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={project.type} />
            {course && <span className="text-13 text-muted">Made for {course}</span>}
            {project.orgProjects?.[0] && (
              <span className="text-13 text-muted">
                Built with {project.orgProjects[0].org.name}
              </span>
            )}
          </div>
        )}
        <h3 className="font-display text-17 leading-[1.2] font-bold sm:text-19">
          <Link to={href} className={titleLink}>
            {project.title}
          </Link>
        </h3>
        {project.pitch && <p className="line-clamp-1 text-14 text-ink-3">{project.pitch}</p>}
        <HelpNeeded project={project} clamp="line-clamp-1" />
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-2.5 pr-2 sm:flex">
        <span className="flex items-center gap-1.5">
          <VisibilityPill visibility={project.visibility} />
          <StatusPill status={project.status} />
        </span>
        <span className="flex items-center gap-2">
          {makers.length > 0 && <AvatarStack people={makers} size={26} />}
          <ProjectStats project={project} />
        </span>
      </div>
    </Card>
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
      <div className="flex flex-col gap-3.5">
        {projects.map((p) => (
          <ProjectListRow key={p.id} project={p} maker={maker} />
        ))}
      </div>
    )
  }
  return (
    <CardGrid>
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} maker={maker} />
      ))}
    </CardGrid>
  )
}
