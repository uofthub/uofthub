import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Campus } from '@uofthub/types'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { personLine } from '../../lib/campus'
import { useFollow } from '../../lib/hooks'
import { useFacets } from '../../lib/queries'
import { WeekActivity } from '../../components/activity/WeekActivity'
import { FooterNote } from '../../components/shell'
import { Avatar, Button, Icon, Panel } from '../../components/ui'
import { Rail } from './Rail'
import { profilePath } from '../../lib/paths'

/** The tags on this week's projects, counted across the whole site. */
function Trending() {
  const { data: facets } = useFacets()
  const tags = facets?.tagsThisWeek.slice(0, 5) ?? []

  return (
    <Panel title="Trending this week" className="gap-1.5">
      {!facets ? null : tags.length === 0 ? (
        <p className="text-14 text-muted">Nothing tagged yet this week.</p>
      ) : (
        <div className="flex flex-col">
          {tags.map((t) => (
            <Link
              key={t.tag}
              to={
                t.course
                  ? `/explore?course=${encodeURIComponent(t.tag)}`
                  : `/explore?q=${encodeURIComponent(t.tag)}`
              }
              className="flex items-center justify-between border-b border-line-soft py-2 text-15 font-semibold text-ink last:border-b-0 hover:text-navy-ink"
            >
              <span>{t.course ? t.tag : `#${t.tag}`}</span>
              <span className="text-13 font-normal text-muted">{t.count} this week</span>
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
    <Panel title="Coming up" className="gap-4">
      {events && events.length === 0 && (
        <p className="text-14 leading-normal text-muted">
          No events posted yet.{' '}
          <Link to="/orgs" className="font-semibold">
            Browse clubs &amp; labs
          </Link>
        </p>
      )}
      {events?.map((e) => (
        <Link
          key={e.id}
          to={`/orgs/${e.org.slug}`}
          className="flex items-start gap-3 text-ink hover:text-navy-ink"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-btn bg-gold-tint text-gold-ink">
            <Icon name="calendar" size={20} />
          </span>
          <span>
            <span className="block text-15 font-semibold">{e.title}</span>
            <span className="text-13 text-muted">
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
  person: {
    id: string
    name: string
    program?: string
    campus?: Campus
  }
}) {
  const follow = useFollow(person.id)
  return (
    <div className="flex items-center gap-2.5">
      <Link to={profilePath(person)} tabIndex={-1} aria-hidden="true">
        <Avatar person={person} size={40} />
      </Link>
      <div className="min-w-0 grow">
        <Link to={profilePath(person)} className="block text-15 font-semibold text-ink">
          {person.name}
        </Link>
        <div className="line-clamp-1 text-13 text-muted">{personLine(person)}</div>
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
 * People in the student's program, taken from who has published on the feed's
 * program tab — the API has no people search, but every project carries its
 * owner.
 */
function PeopleInProgram() {
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ['feed', 'program', 'people'],
    queryFn: () => api.feed.list({ scope: 'program' }),
    enabled: !!user,
  })

  const seen = new Set<string>()
  const people = (data?.items ?? []).flatMap(({ project: p }) => {
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
    <Rail className="hidden gap-5 2xl:flex">
      <WeekActivity compact />
      <Trending />
      <ComingUp />
      <PeopleInProgram />
      <FooterNote />
    </Rail>
  )
}
