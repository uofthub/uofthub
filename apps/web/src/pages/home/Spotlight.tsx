import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { primaryAction, safeLinks } from '../../lib/projectView'
import { Cover } from '../../components/project'
import { Button, Icon } from '../../components/ui'

/**
 * The navy banner at the top of the feed: the week's spotlight.
 *
 * A moderator's pick when there is one, with their note about why. Otherwise
 * the most active project this week — and it says so, so the banner never
 * calls an algorithm a pick.
 */
export function Spotlight() {
  const { data } = useQuery({
    queryKey: ['spotlight'],
    queryFn: () => api.spotlight.current(),
    staleTime: 10 * 60 * 1000,
  })
  const project = data?.project
  if (!project) return null

  const faculty = project.owner?.faculty
  const action = primaryAction(safeLinks(project.links))
  const kicker = data.curated
    ? `Weekly spotlight${faculty ? ` · ${faculty}` : ''}`
    : `Most active this week${faculty ? ` · ${faculty}` : ''}`
  const text = data.curated && data.note ? data.note : project.pitch

  return (
    <section aria-label="Spotlight" className="spotlight">
      <div className="stack grow" style={{ gap: 10 }}>
        <span className="spotlight__kicker">
          <Icon name="star" size={15} />
          {kicker}
        </span>
        <h2 className="disp spotlight__title">{project.title}</h2>
        {(text || project.owner) && (
          <p className="spotlight__text">
            {text}
            {text && project.owner && ' '}
            {project.owner && `By ${project.owner.name}.`}
          </p>
        )}
        <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
          {action ? (
            <Button variant="gold" icon={action.icon} href={action.href}>
              {action.label}
            </Button>
          ) : (
            <Button variant="gold" icon="chevronRight" to={`/projects/${project.id}`}>
              Take a look
            </Button>
          )}
          {action ? (
            <Button to={`/projects/${project.id}`} className="spotlight__ghost">
              Read about it
            </Button>
          ) : (
            <Button to="/explore?sort=trending" className="spotlight__ghost">
              More trending
            </Button>
          )}
        </div>
      </div>
      <div className="spotlight__media">
        <Cover project={project} height={150} radius={12} />
      </div>
    </section>
  )
}
