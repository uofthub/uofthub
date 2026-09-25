import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { campusShort } from '../../lib/campus'
import { useFollow } from '../../lib/hooks'
import { useFacets } from '../../lib/queries'
import { WeekActivity } from '../../components/activity/WeekActivity'
import { FooterNote } from '../../components/shell'
import { Avatar, Button, Icon, Panel } from '../../components/ui'

/** The tags on this week's projects, counted across the whole site. */
function Trending() {
  const { data: facets } = useFacets()
  const tags = facets?.tagsThisWeek.slice(0, 5) ?? []

  return (
    <Panel title="Trending this week" gap={6}>
      {!facets ? null : tags.length === 0 ? (
        <p className="muted" style={{ fontSize: 14 }}>
          Nothing tagged yet this week.
        </p>
      ) : (
        <div className="stack">
          {tags.map((t) => (
            <Link
              key={t.tag}
              to={
                t.course
                  ? `/explore?course=${encodeURIComponent(t.tag)}`
                  : `/explore?q=${encodeURIComponent(t.tag)}`
              }
              className="trend-row"
            >
              <span>{t.course ? t.tag : `#${t.tag}`}</span>
              <span className="muted">{t.count} this week</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  )
}

/** The next few events posted by verified clubs and labs. */
function ComingUp() {
  const { data: events } = useQuery({
    queryKey: ['events', 'upcoming'],
    queryFn: () => api.orgs.upcoming(3),
    staleTime: 10 * 60 * 1000,
  })

  return (
    <Panel title="Coming up" gap={16}>
      {events && events.length === 0 && (
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
          No events posted yet.{' '}
          <Link to="/orgs" style={{ fontWeight: 600 }}>
            Browse clubs &amp; labs
          </Link>
        </p>
      )}
      {events?.map((e) => (
        <Link
          key={e.id}
          to={`/orgs/${e.org.slug}`}
          className="row event-row"
          style={{ gap: 12, alignItems: 'flex-start' }}
        >
          <span className="event-icon">
            <Icon name="calendar" size={20} />
          </span>
          <span>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{e.title}</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {e.org.name} ·{' '}
              {new Date(e.date).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </span>
        </Link>
      ))}
    </Panel>
  )
}

function Person({
  person,
}: {
  person: { id: string; name: string; faculty?: string; campus?: Parameters<typeof campusShort>[0] }
}) {
  const follow = useFollow(person.id)
  return (
    <div className="row" style={{ gap: 10 }}>
      <Link to={`/u/${person.id}`} tabIndex={-1} aria-hidden="true">
        <Avatar person={person} size={40} />
      </Link>
      <div className="grow">
        <Link to={`/u/${person.id}`} className="person-name">
          {person.name}
        </Link>
        <div className="muted clamp-1" style={{ fontSize: 13 }}>
          {[person.faculty, campusShort(person.campus)].filter(Boolean).join(' · ')}
        </div>
      </div>
      {follow.canFollow && (
        <Button size="sm" onClick={follow.toggle} disabled={follow.pending}>
          {follow.following ? 'Following' : 'Follow'}
        </Button>
      )}
    </div>
  )
}

/**
 * People in the student's faculty, taken from who has published there — the
 * API has no people search, but every project carries its owner.
 */
function PeopleInProgram() {
  const { user } = useAuth()
  const { data: projects = [] } = useQuery({
    queryKey: ['projects', { faculty: user?.faculty, take: 50 }],
    queryFn: () => api.projects.list({ faculty: user!.faculty, sort: 'new', take: 50 }),
    enabled: !!user?.faculty,
  })

  const seen = new Set<string>()
  const people = projects.flatMap((p) => {
    const owner = p.owner
    if (!owner || owner.id === user?.id || seen.has(owner.id)) return []
    seen.add(owner.id)
    return [owner]
  })

  if (people.length === 0) return null

  return (
    <Panel title="People in your program">
      {people.slice(0, 3).map((p) => (
        <Person key={p.id} person={p} />
      ))}
    </Panel>
  )
}

export function RightRail() {
  return (
    <aside className="rail rail--right">
      <WeekActivity compact />
      <Trending />
      <ComingUp />
      <PeopleInProgram />
      <FooterNote />
    </aside>
  )
}
