import { Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api, type FeedActivity, type FeedReason } from '../lib/api'
import { campusLabel } from '../lib/campus'
import { ProjectRow } from '../components/ProjectCard'
import { Avatar, Btn, Card, EmptyState, Icon, Spinner } from '../components/ui'

/**
 * What a signed-in student lands on.
 *
 * `/` used to be the sales pitch whether or not you had an account, so a
 * student who had been here for a month still arrived at "Get started" and a
 * product screenshot. This is the other half of the same complaint that put
 * the directory in a list: publishing into a void, and never seeing that
 * anybody had been by.
 *
 * Two cards answer those separately — what happened to your work this week,
 * then what other people have published and why it reached you. Nothing here
 * is manufactured activity: every row is a real project that was really
 * published, and the reason line says plainly how it got here.
 */

const PAGE_SIZE = 20

/* -------------------------------------------------------------------------- */
/* Your work this week                                                        */
/* -------------------------------------------------------------------------- */

function Delta({ now, before }: { now: number; before: number }) {
  // No arrow in the first week a project exists: "up 100%" from a week that
  // had not happened yet is noise dressed up as a trend.
  if (before === 0) return null
  const change = now - before
  if (change === 0) return null

  const up = change > 0
  return (
    <span
      style={{ fontSize: '0.75rem', fontWeight: 600, color: up ? 'var(--tone-success)' : 'var(--text-secondary)' }}
    >
      <Icon name={up ? 'mdi-trending-up' : 'mdi-trending-down'} size={14} />
      {up ? '+' : ''}
      {change}
    </span>
  )
}

function Metric({ value, label, children }: { value: number; label: string; children?: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 500 }}>{value}</span>
        {children}
      </div>
      <div className="text--disabled" style={{ fontSize: '0.8125rem' }}>
        {label}
      </div>
    </div>
  )
}

function ActivityCard({ activity }: { activity: FeedActivity }) {
  const engagement = activity.likes + activity.comments + activity.reactions
  const history = activity.recentLikes.length > 0 || activity.recentComments.length > 0

  return (
    <Card style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ fontSize: '1.125rem' }}>Your work this week</h2>
        <Btn size="small" className="accent--text" to="/projects/new">
          <Icon name="mdi-plus" size={16} />
          Share a project
        </Btn>
      </div>

      <div style={{ display: 'flex', gap: 36, marginTop: 20, flexWrap: 'wrap' }}>
        <Metric value={activity.views} label="views">
          <Delta now={activity.views} before={activity.previousViews} />
        </Metric>
        <Metric value={activity.likes} label={activity.likes === 1 ? 'like' : 'likes'} />
        <Metric value={activity.comments} label={activity.comments === 1 ? 'comment' : 'comments'} />
        <Metric value={activity.reactions} label="reactions" />
      </div>

      {/* The named half. A counter that only moves when you reload your own
          page is exactly the "nobody interacts with it" feeling; a name and a
          sentence is not. */}
      {activity.recentComments.length > 0 && (
        <ul className="v-list" style={{ display: 'grid', gap: 14, marginTop: 24 }}>
          {activity.recentComments.map(comment => (
            <li key={comment.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Avatar name={comment.user.name} img={comment.user.avatarUrl} size={30} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.875rem' }}>
                  <Link to={`/u/${comment.user.id}`} style={{ fontWeight: 500, color: 'var(--v-text-base)' }}>
                    {comment.user.name}
                  </Link>{' '}
                  <span className="text--disabled">on</span>{' '}
                  <Link to={`/projects/${comment.project.id}`}>{comment.project.title}</Link>
                </div>
                <p className="text--secondary overflow-ellipsis" style={{ fontSize: '0.875rem', margin: '2px 0 0' }}>
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* All-time, and worded so it does not pretend to be this week's news.
          A quiet week is much easier to read next to "the last person who
          liked this was Ada" than next to nothing at all. */}
      {activity.recentLikes.length > 0 && (
        <p className="text--disabled" style={{ fontSize: '0.8125rem', margin: '16px 0 0' }}>
          <Icon name="mdi-heart-outline" size={15} /> Most recently liked by{' '}
          <Link to={`/u/${activity.recentLikes[0].user.id}`}>{activity.recentLikes[0].user.name}</Link>
          {activity.recentLikes.length > 1 && ` and ${activity.recentLikes.length - 1} others`}
        </p>
      )}

      {/* Only for somebody who has never had a visitor at all. Saying "nobody
          has been by" to a student whose work was read last month would be
          both wrong and discouraging. */}
      {engagement === 0 && activity.views === 0 && !history && (
        <p className="text--disabled" style={{ fontSize: '0.875rem', margin: '18px 0 0' }}>
          Nobody has been by yet. Projects set to <strong>U of T</strong> or <strong>Public</strong> show up in other
          students' feeds — a private one is only ever visible to you.
        </p>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Why a project is in the feed                                               */
/* -------------------------------------------------------------------------- */

function Reason({ reason }: { reason: FeedReason }) {
  const content = (() => {
    switch (reason.kind) {
      case 'FOLLOWING':
        return {
          icon: 'mdi-account-check-outline',
          body: (
            <>
              <Link to={`/u/${reason.userId}`} style={{ fontWeight: 500 }}>
                {reason.userName}
              </Link>
              , who you follow, published this
            </>
          ),
        }
      case 'COURSE':
        return {
          icon: 'mdi-school-outline',
          body: (
            <>
              Tagged <Link to={`/courses/${encodeURIComponent(reason.tag)}`}>{reason.tag}</Link> — a course you have
              published in
            </>
          ),
        }
      case 'CAMPUS':
        return { icon: 'mdi-map-marker-outline', body: <>From {campusLabel(reason.campus)}</> }
      case 'TRENDING':
        return { icon: 'mdi-fire', body: <>Being read across uofthub</> }
    }
  })()

  return (
    <div
      className="text--disabled"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', marginBottom: 6 }}
    >
      <Icon name={content.icon} size={16} />
      {content.body}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function FeedHome() {
  const { user } = useAuth()
  usePageCrumbs([{ text: 'Home', href: '/' }])

  const { data: activity } = useQuery({
    queryKey: ['feed-activity'],
    queryFn: () => api.feed.activity(),
  })

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => api.feed.list({ skip: pageParam }),
    initialPageParam: 0,
    // A short page is the end, same rule the directory uses.
    getNextPageParam: (last, all) => (last.items.length < PAGE_SIZE ? undefined : all.length * PAGE_SIZE),
  })

  const items = data?.pages.flatMap(p => p.items) ?? []

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 860 }}>
      <h1 className="pageHeading" style={{ marginBottom: 24 }}>
        {user?.name ? `Hey, ${user.name.split(' ')[0]}` : 'Home'}
      </h1>

      {/* Only for students who have published something — there is nothing
          honest to report to somebody with no work on the site yet. */}
      {activity && activity.projectCount > 0 && (
        <div style={{ marginBottom: 32 }}>
          <ActivityCard activity={activity} />
        </div>
      )}

      <h2 style={{ fontSize: '1.125rem', marginBottom: 16 }}>Around campus</h2>

      {isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon="mdi-compass-outline"
          title="Nothing here yet. Follow a few people and this fills up on its own."
          action={
            <Btn variant="accent" to="/projects" style={{ marginTop: 16 }}>
              Browse projects
            </Btn>
          }
        />
      ) : (
        <>
          <ul className="v-list" style={{ display: 'grid', gap: 18 }}>
            {items.map(({ project, reason }) => (
              <li key={project.id}>
                <Reason reason={reason} />
                {/* The reason line already names the owner when it is somebody
                    they follow, so the row does not say it twice. */}
                <ProjectRow project={project} showOwner={reason.kind !== 'FOLLOWING'} />
              </li>
            ))}
          </ul>

          {hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '28px 0' }}>
              <Btn variant="outlined" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : 'Show more'}
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  )
}
