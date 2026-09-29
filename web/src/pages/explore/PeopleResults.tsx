import { Link } from 'react-router-dom'
import type { PersonResult } from '../../lib/api'
import { personLine } from '../../lib/campus'
import { useFollow } from '../../lib/hooks'
import { profilePath } from '../../lib/paths'
import { Avatar, Button, Card, CardGrid, Heading } from '../../components/ui'

export function PeopleResults({
  people,
  title = 'People',
}: {
  people: PersonResult[]
  title?: string
}) {
  if (people.length === 0) return null
  return (
    <section className="flex flex-col gap-4">
      <Heading>{title}</Heading>
      <CardGrid>
        {people.map((p) => (
          <PersonCard key={p.id} person={p} />
        ))}
      </CardGrid>
    </section>
  )
}

function PersonCard({ person }: { person: PersonResult }) {
  const follow = useFollow(person.id)
  const line = personLine(person)
  return (
    <Card className="flex items-center gap-3 p-4">
      <Link to={profilePath(person)} tabIndex={-1} aria-hidden="true">
        <Avatar person={person} size={48} />
      </Link>
      <div className="min-w-0 grow">
        <Link to={profilePath(person)} className="block text-16 font-semibold text-ink">
          {person.name}
        </Link>
        {line && <div className="line-clamp-1 text-13 text-muted">{line}</div>}
      </div>
      {follow.canFollow && (
        <Button size="sm" onClick={follow.toggle} disabled={follow.pending}>
          {follow.following ? 'Following' : 'Follow'}
        </Button>
      )}
    </Card>
  )
}
