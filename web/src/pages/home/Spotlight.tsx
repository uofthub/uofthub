import { useQuery } from '@tanstack/react-query'
import { personLine } from '../../lib/campus'
import { api } from '../../lib/api'
import { actionTarget, cardAction } from '../../lib/outputs'
import { Cover } from '../../components/project'
import { Banner, BannerKicker, Button } from '../../components/ui'
import { projectPath } from '../../lib/paths'

/** A button drawn onto the navy banner: outlined in its line colour, white text. */
const ghost = 'border-navy-line bg-transparent text-white hover:bg-white/8 hover:text-white'

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

  const line = personLine(project.owner)
  const action = cardAction(project)
  const kicker = data.curated
    ? `Weekly spotlight${line ? ` · ${line}` : ''}`
    : `Most active this week${line ? ` · ${line}` : ''}`
  const text = data.curated && data.note ? data.note : project.pitch

  return (
    <Banner aria-label="Spotlight" className="flex items-center gap-5.5 p-5.5">
      <div className="flex min-w-0 grow flex-col gap-2.5">
        <BannerKicker icon="star">{kicker}</BannerKicker>
        <h2 className="font-display text-30 leading-[1.1] font-bold tracking-tighter">
          {project.title}
        </h2>
        {(text || project.owner) && (
          <p className="text-15 leading-normal text-navy-text">
            {text}
            {text && project.owner && ' '}
            {project.owner && `By ${project.owner.name}.`}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          {action ? (
            <Button variant="gold" {...actionTarget(action)}>
              {action.label}
            </Button>
          ) : (
            <Button variant="gold" icon="chevronRight" to={projectPath(project)}>
              Take a look
            </Button>
          )}
          {action ? (
            <Button to={projectPath(project)} className={ghost}>
              Read about it
            </Button>
          ) : (
            <Button to="/explore?sort=trending" className={ghost}>
              More trending
            </Button>
          )}
        </div>
      </div>
      <div className="hidden w-62.5 shrink-0 xl:block">
        <Cover project={project} height={150} radius={12} />
      </div>
    </Banner>
  )
}
