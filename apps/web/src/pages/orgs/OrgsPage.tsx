import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Campus } from '@uofthub/types'
import { api, type Org } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { CAMPUS_SHORT, CAMPUSES } from '../../lib/campus'
import { useDocumentTitle } from '../../lib/hooks'
import { ORG_STATUS_DOTS, ORG_STATUS_LABELS } from '../../lib/orgs'
import { CONTACT_EMAIL } from '../../lib/site'
import {
  Button,
  Card,
  CardGrid,
  Chip,
  cx,
  EmptyState,
  Heading,
  Icon,
  Page,
  PageLede,
  PageTitle,
  Pill,
  Spinner,
} from '../../components/ui'
import { CreateOrgDialog } from './CreateOrgDialog'

function OrgCard({ org }: { org: Org }) {
  const lab = org.type === 'LAB'
  return (
    <Card
      as={Link}
      to={`/orgs/${org.slug}`}
      className="flex flex-col gap-3 p-5 text-ink hover:border-line-strong hover:text-ink"
    >
      <div className="flex items-center gap-3">
        <span
          className={cx(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            lab ? 'bg-purple-tint text-purple-ink' : 'bg-navy-tint text-navy-ink'
          )}
        >
          <Icon name={lab ? 'flask' : 'users'} size={22} />
        </span>
        <div className="min-w-0 grow">
          <h3 className="line-clamp-1 font-display text-19 font-bold">{org.name}</h3>
          <span className="text-13 text-muted">
            {lab ? 'Research lab' : 'Club'} · {org.campus ? CAMPUS_SHORT[org.campus] : 'Tri-campus'}
          </span>
        </div>
      </div>
      {org.description && (
        <p className="line-clamp-2 text-14 leading-[1.45] text-ink-3">{org.description}</p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-3 text-13">
        {org.status !== 'VERIFIED' && (
          <Pill dot={ORG_STATUS_DOTS[org.status]}>{ORG_STATUS_LABELS[org.status]}</Pill>
        )}
        {org._count && (
          <span className="text-muted">
            {org._count.members} members · {org._count.projects} projects
          </span>
        )}
      </div>
    </Card>
  )
}

/** Clubs, design teams and labs — reached from the account menu. */
export default function OrgsPage() {
  const { user } = useAuth()
  const [creating, setCreating] = useState(false)
  const [campus, setCampus] = useState<Campus | ''>('')
  useDocumentTitle('Clubs & labs')

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['orgs', campus],
    queryFn: () => api.orgs.list({ campus: campus || undefined }),
  })
  // Only a group's own members are ever sent an unverified group.
  const verified = orgs.filter((o) => o.status === 'VERIFIED')
  const mine = orgs.filter((o) => o.status !== 'VERIFIED')

  return (
    <Page width="wide" className="flex flex-col gap-8">
      {creating && <CreateOrgDialog onClose={() => setCreating(false)} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Clubs &amp; labs</PageTitle>
          <PageLede>
            Design teams, student clubs and research groups, and everything their members have made.
          </PageLede>
        </div>
        {user?.isAdmin ? (
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New group
          </Button>
        ) : (
          // Groups are set up by a moderator, who checks the group is real
          // before its page exists.
          <p className="max-w-80 text-14 text-muted">
            Want your club, design team or lab here?{' '}
            <a href={`mailto:${CONTACT_EMAIL}?subject=Add%20our%20group%20to%20uofthub`}>
              Email us
            </a>{' '}
            and we’ll set up its page.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={campus === '' ? 'active' : 'default'} onClick={() => setCampus('')}>
          All campuses
        </Chip>
        {CAMPUSES.map((c) => (
          <Chip
            key={c}
            tone={campus === c ? 'active' : 'default'}
            onClick={() => setCampus(campus === c ? '' : c)}
          >
            {CAMPUS_SHORT[c]}
          </Chip>
        ))}
      </div>

      {mine.length > 0 && (
        <section className="flex flex-col gap-3.5">
          <div>
            <Heading>Your groups, waiting for approval</Heading>
            <p className="mt-1 text-14 text-muted">
              Only members can see these until a moderator approves them.
            </p>
          </div>
          <CardGrid>
            {mine.map((o) => (
              <OrgCard key={o.id} org={o} />
            ))}
          </CardGrid>
        </section>
      )}

      {isLoading ? (
        <Spinner />
      ) : verified.length === 0 ? (
        <EmptyState icon="users" title="No verified groups yet" />
      ) : (
        <CardGrid>
          {verified.map((o) => (
            <OrgCard key={o.id} org={o} />
          ))}
        </CardGrid>
      )}
    </Page>
  )
}
