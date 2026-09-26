import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type FeedActivity } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { timeShort } from '../../lib/projectView'
import { REACTIONS, reactionLabel } from '../../lib/reactions'
import { Avatar, Button, Card, cx, Eyebrow, Heading, Icon, Panel } from '../ui'

/** This week's views against last week's. No arrow before there is a last week. */
function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 || now === before) return null
  const up = now > before
  return (
    <span className={cx('text-13 font-bold', up ? 'text-green-ink' : 'text-muted')}>
      {up ? '+' : ''}
      {now - before}
    </span>
  )
}

function Metric({
  value,
  label,
  children,
}: {
  value: number
  label: string
  children?: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-26 leading-[1.1] font-bold">{value}</span>
        {children}
      </div>
      <div className="text-13 text-muted">{label}</div>
    </div>
  )
}

function Body({ activity, compact }: { activity: FeedActivity; compact: boolean }) {
  const engagement = activity.comments + activity.reactions
  const history = activity.recentReactions.length > 0 || activity.recentComments.length > 0
  const comments = activity.recentComments.slice(0, compact ? 2 : 4)
  const latest = activity.recentReactions[0]

  return (
    <>
      <div
        className={
          compact
            ? 'grid grid-cols-2 gap-x-4 gap-y-3'
            : 'flex flex-wrap gap-9 border-y border-line-soft py-3.5'
        }
      >
        <Metric value={activity.views} label={activity.views === 1 ? 'view' : 'views'}>
          <Delta now={activity.views} before={activity.previousViews} />
        </Metric>
        <Metric
          value={activity.comments}
          label={activity.comments === 1 ? 'comment' : 'comments'}
        />
        <Metric
          value={activity.reactions}
          label={activity.reactions === 1 ? 'reaction' : 'reactions'}
        />
        <Metric value={activity.collabRequests} label="want to collab" />
      </div>

      {/* Names and sentences, not just counters — a counter that only moves
          when you reload is exactly the "nobody reads it" feeling. */}
      {comments.length > 0 && (
        <ul className="flex flex-col gap-3.5">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <Link to={`/u/${c.user.id}`} tabIndex={-1} aria-hidden="true">
                <Avatar person={c.user} size={compact ? 28 : 32} />
              </Link>
              <div className="min-w-0 grow">
                <div className="text-14">
                  <Link to={`/u/${c.user.id}`} className="font-semibold text-ink">
                    {c.user.name}
                  </Link>{' '}
                  <span className="text-muted">on</span>{' '}
                  <Link to={`/projects/${c.project.id}#comments`}>{c.project.title}</Link>
                  {!compact && <span className="text-muted"> · {timeShort(c.createdAt)}</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-14 leading-[1.45] text-ink-3">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* All-time, and worded so it doesn't pretend to be this week's news. */}
      {latest && (
        <p className="flex items-start gap-1.5 text-13 text-muted">
          <Icon name={REACTIONS.find((r) => r.kind === latest.kind)?.icon ?? 'star'} size={15} />
          <span>
            Most recent reaction: <Link to={`/u/${latest.user.id}`}>{latest.user.name}</Link> —{' '}
            {reactionLabel(latest.kind).toLowerCase()} on{' '}
            <Link to={`/projects/${latest.project.id}`}>{latest.project.title}</Link>
          </span>
        </p>
      )}

      {/* Only for somebody who has never had a visitor: telling a student whose
          work was read last month that nobody has been by would be wrong. */}
      {engagement === 0 && activity.views === 0 && !history && (
        <p className="text-14 leading-normal text-muted">
          Nobody has been by yet. Projects set to <b>U of T only</b> or <b>Public</b> show up in
          other students’ feeds — a draft is only visible to you.
        </p>
      )}
    </>
  )
}

/**
 * "Your work this week" — what happened to the student's own projects, from
 * `/feed/activity`. Only shown to somebody who has published something: there
 * is nothing honest to report before that.
 *
 * `compact` is the home feed's right-rail version; the full one leads the
 * student's own profile with a greeting.
 */
export function WeekActivity({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  const { data: activity } = useQuery({
    queryKey: ['feed-activity'],
    queryFn: () => api.feed.activity(),
    enabled: !!user,
  })

  if (!user || !activity || activity.projectCount === 0) return null

  if (compact) {
    return (
      <Panel title="Your work this week">
        <Body activity={activity} compact />
      </Panel>
    )
  }

  return (
    <Card as="section" className="flex flex-col gap-4.5 px-6 py-5.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow as="span">Hey, {user.name.split(/\s+/)[0]}</Eyebrow>
          <Heading className="mt-1 text-20">Your work this week</Heading>
        </div>
        <Button size="sm" icon="plus" to="/projects/new">
          Share a project
        </Button>
      </div>
      <Body activity={activity} compact={false} />
    </Card>
  )
}
