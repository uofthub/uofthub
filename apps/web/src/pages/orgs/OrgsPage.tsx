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
import { Button, Chip, EmptyState, Icon, Pill, Spinner } from '../../components/ui'
import { CreateOrgDialog } from './CreateOrgDialog'
import './orgs.css'

function OrgCard({ org }: { org: Org }) {
  const lab = org.type === 'LAB'
  return (
    <Link to={`/orgs/${org.slug}`} className="card org-card">
      <div className="row" style={{ gap: 12 }}>
        <span
          className="org-card__icon"
          style={lab ? { background: 'var(--purple-tint)', color: 'var(--purple-ink)' } : undefined}
        >
          <Icon name={lab ? 'flask' : 'users'} size={22} />
        </span>
        <div className="grow">
          <h3 className="disp clamp-1" style={{ fontSize: 19 }}>
            {org.name}
          </h3>
          <span className="muted" style={{ fontSize: 13 }}>
            {lab ? 'Research lab' : 'Club'} · {org.campus ? CAMPUS_SHORT[org.campus] : 'Tri-campus'}
          </span>
        </div>
      </div>
      {org.description && (
        <p className="clamp-2" style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--ink-3)' }}>
          {org.description}
        </p>
      )}
      <div className="row wrap" style={{ gap: 12, marginTop: 'auto', fontSize: 13 }}>
        {org.status !== 'VERIFIED' && (
          <Pill dot={ORG_STATUS_DOTS[org.status]}>{ORG_STATUS_LABELS[org.status]}</Pill>
        )}
        {org._count && (
          <span className="muted">
            {org._count.members} members · {org._count.projects} projects
          </span>
        )}
      </div>
    </Link>
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
    <div className="page page--wide stack" style={{ gap: 32 }}>
      {creating && <CreateOrgDialog onClose={() => setCreating(false)} />}
      <div
        className="row wrap"
        style={{ justifyContent: 'space-between', gap: 16, alignItems: 'flex-end' }}
      >
        <div>
          <h1 className="page-title">Clubs &amp; labs</h1>
          <p className="page-lede">
            Design teams, student clubs and research groups, and everything their members have made.
          </p>
        </div>
        {user?.isAdmin ? (
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New group
          </Button>
        ) : (
          // Groups are set up by a moderator, who checks the group is real
          // before its page exists.
          <p className="muted" style={{ fontSize: 14, maxWidth: 320 }}>
            Want your club, design team or lab here?{' '}
            <a href={`mailto:${CONTACT_EMAIL}?subject=Add%20our%20group%20to%20uofthub`}>
              Email us
            </a>{' '}
            and we’ll set up its page.
          </p>
        )}
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
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
        <section className="stack" style={{ gap: 14 }}>
          <div>
            <h2 className="h2">Your groups, waiting for approval</h2>
            <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
              Only members can see these until a moderator approves them.
            </p>
          </div>
          <div className="card-grid">
            {mine.map((o) => (
              <OrgCard key={o.id} org={o} />
            ))}
          </div>
        </section>
      )}

      {isLoading ? (
        <Spinner />
      ) : verified.length === 0 ? (
        <EmptyState icon="users" title="No verified groups yet" />
      ) : (
        <div className="card-grid">
          {verified.map((o) => (
            <OrgCard key={o.id} org={o} />
          ))}
        </div>
      )}
    </div>
  )
}
