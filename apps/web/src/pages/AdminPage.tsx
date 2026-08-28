import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgStatus, ReportStatus } from '@uofthub/types'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api, type AdminOrg, type AdminReport, type OrgDecision, type ReportDecision } from '../lib/api'
import { STATUS_LABELS, reasonShort } from '../lib/moderation'
import { ORG_STATUS_COLORS, ORG_STATUS_LABELS } from '../lib/orgs'
import { Btn, Card, Chip, EmptyState, ErrorText, Icon, PageHeader, Spinner, TextArea, type ChipColor } from '../components/ui'

const TABS: { value: ReportStatus | 'all'; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'all', label: 'All' },
]

const ORG_TABS: { value: OrgStatus | 'all'; label: string }[] = [
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'all', label: 'All' },
]

const ORG_DECISIONS: { value: OrgDecision; label: string; hint: string }[] = [
  { value: 'APPROVE', label: 'Approve', hint: 'Publishes the page and starts the per-term storage allowance.' },
  { value: 'REQUEST_INFO', label: 'Request info', hint: 'Sends your note and gives the group another 7 days.' },
  { value: 'DENY', label: 'Deny', hint: 'Deletes the group and its data. For spam and clear-cut cases only.' },
]

const STATUS_COLORS: Record<ReportStatus, ChipColor> = {
  OPEN: 'orange',
  DISMISSED: 'grey',
  WARNED: 'yellow',
  TAKEN_DOWN: 'error',
}

const DECISIONS: { value: ReportDecision; label: string; hint: string }[] = [
  { value: 'DISMISS', label: 'Dismiss', hint: 'Nothing wrong here — closes the report, owner is not told.' },
  { value: 'WARN', label: 'Warn owner', hint: 'Notifies the owner with your note; the project stays up.' },
  { value: 'TAKE_DOWN', label: 'Take down', hint: 'Forces the project back to private and notifies the owner.' },
]

function ReportRow({ report }: { report: AdminReport }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')

  const decide = useMutation({
    mutationFn: (decision: ReportDecision) => api.admin.decide(report.id, { decision, note: note.trim() || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  })

  const open = report.status === 'OPEN'

  return (
    <Card style={{ padding: 24, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <Link to={`/projects/${report.project.id}`} style={{ fontSize: '1.0625rem', fontWeight: 500 }}>
          {report.project.title}
        </Link>
        <Chip small color="blue">
          {reasonShort(report.reason)}
        </Chip>
        <Chip small color={STATUS_COLORS[report.status]}>
          {STATUS_LABELS[report.status]}
        </Chip>
        <div style={{ flex: 1 }} />
        <span className="text--disabled" style={{ fontSize: '0.75rem' }}>
          {new Date(report.createdAt).toLocaleString()}
        </span>
      </div>

      <div className="text--disabled" style={{ fontSize: '0.8125rem' }}>
        Owner{' '}
        <Link to={`/u/${report.project.owner.id}`}>{report.project.owner.name}</Link> ({report.project.owner.email}) ·
        reported by <Link to={`/u/${report.reporter.id}`}>{report.reporter.name}</Link> ({report.reporter.email}) ·
        visibility {report.project.visibility}
      </div>

      {report.details && (
        <p className="text--secondary" style={{ margin: 0, fontSize: '0.9375rem', whiteSpace: 'pre-wrap' }}>
          “{report.details}”
        </p>
      )}

      {open ? (
        <>
          <TextArea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note to the owner (sent with a warning or take-down)…"
          />
          {decide.isError && <ErrorText>{(decide.error as Error).message}</ErrorText>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DECISIONS.map(d => (
              <Btn
                key={d.value}
                variant="outlined"
                size="small"
                title={d.hint}
                onClick={() => decide.mutate(d.value)}
                disabled={decide.isPending}
                style={d.value === 'TAKE_DOWN' ? { color: 'var(--tone-error)', borderColor: 'var(--tone-error)' } : undefined}
              >
                {d.label}
              </Btn>
            ))}
          </div>
        </>
      ) : (
        <div className="text--disabled" style={{ fontSize: '0.8125rem' }}>
          {report.reviewedBy ? `Decided by ${report.reviewedBy.name}` : 'Decided'}
          {report.reviewedAt && ` on ${new Date(report.reviewedAt).toLocaleDateString()}`}
          {report.reviewNote && ` — “${report.reviewNote}”`}
        </div>
      )}
    </Card>
  )
}

function OrgRow({ org }: { org: AdminOrg }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  const decide = useMutation({
    mutationFn: (decision: OrgDecision) => api.admin.decideOrg(org.slug, { decision, note: note.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-orgs'] })
      qc.invalidateQueries({ queryKey: ['orgs'] })
    },
  })

  const admin = org.members[0]?.user
  const pending = org.status !== 'VERIFIED'

  return (
    <Card style={{ padding: 24, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <Link to={`/orgs/${org.slug}`} style={{ fontSize: '1.0625rem', fontWeight: 500 }}>
          {org.name}
        </Link>
        <Chip small color={org.type === 'LAB' ? 'purple' : 'blue'}>
          {org.type === 'LAB' ? 'Lab' : 'Club'}
        </Chip>
        <Chip small color={ORG_STATUS_COLORS[org.status]}>
          {ORG_STATUS_LABELS[org.status]}
        </Chip>
        <div style={{ flex: 1 }} />
        <span className="text--disabled" style={{ fontSize: '0.75rem' }}>
          created {new Date(org.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="text--disabled" style={{ fontSize: '0.8125rem' }}>
        Claimed role <strong>{org.contactRole ?? '—'}</strong> · contact {org.contactEmail ?? '—'}
        {admin && (
          <>
            {' '}
            · created by <Link to={`/u/${admin.id}`}>{admin.name}</Link> ({admin.email})
          </>
        )}{' '}
        · {org._count.members} members, {org._count.projects} projects, {org._count.activities} activities
      </div>

      {org.description && (
        <p className="text--secondary" style={{ margin: 0, fontSize: '0.9375rem' }}>
          {org.description}
        </p>
      )}

      {org.verificationNote ? (
        <Card style={{ padding: 14, borderLeft: '4px solid var(--v-accent-base)' }}>
          <strong style={{ fontSize: '0.8125rem' }}>Evidence submitted</strong>
          <p className="text--secondary" style={{ margin: '4px 0 0', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
            {org.verificationNote}
          </p>
        </Card>
      ) : (
        <p className="text--disabled" style={{ margin: 0, fontSize: '0.875rem' }}>
          Nothing submitted yet.
        </p>
      )}

      {pending && (
        <>
          <TextArea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note to the group contact (sent with every decision)…"
          />
          {decide.isError && <ErrorText>{(decide.error as Error).message}</ErrorText>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {ORG_DECISIONS.map(d => (
              <Btn
                key={d.value}
                variant="outlined"
                size="small"
                title={d.hint}
                onClick={() => (d.value === 'DENY' && !confirming ? setConfirming(true) : decide.mutate(d.value))}
                disabled={decide.isPending}
                style={d.value === 'DENY' ? { color: 'var(--tone-error)', borderColor: 'var(--tone-error)' } : undefined}
              >
                {/* Denial deletes the group outright, so it takes two clicks. */}
                {d.value === 'DENY' && confirming ? 'Confirm delete' : d.label}
              </Btn>
            ))}
            {confirming && (
              <Btn size="small" onClick={() => setConfirming(false)}>
                Cancel
              </Btn>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

export default function AdminPage() {
  const { user, loading } = useAuth()
  const [section, setSection] = useState<'reports' | 'groups'>('reports')
  const [tab, setTab] = useState<ReportStatus | 'all'>('OPEN')
  const [orgTab, setOrgTab] = useState<OrgStatus | 'all'>('IN_REVIEW')

  usePageCrumbs([{ text: 'Moderation', href: '/admin' }])

  const { data: reports, isLoading } = useQuery({
    queryKey: ['admin-reports', tab],
    queryFn: () => api.admin.reports(tab),
    enabled: !!user?.isAdmin && section === 'reports',
  })
  const { data: orgs, isLoading: orgsLoading } = useQuery({
    queryKey: ['admin-orgs', orgTab],
    queryFn: () => api.admin.orgs(orgTab),
    enabled: !!user?.isAdmin && section === 'groups',
  })

  if (loading) return <Spinner />
  // The API gate is the real one (see lib/admin.ts) — this only keeps the page
  // from rendering an empty queue to someone who wandered onto the URL.
  if (!user?.isAdmin) {
    return <EmptyState icon="mdi-shield-lock-outline" title="Moderators only." />
  }

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 900 }}>
      <PageHeader
        title="Moderation"
        subtitle={
          section === 'reports'
            ? 'Reports on U of T-visible and public projects, oldest first.'
            : 'Student groups waiting on a verification decision, oldest first.'
        }
        actions={
          section === 'reports'
            ? TABS.map(t => (
                <Btn key={t.value} variant={tab === t.value ? 'accent' : 'outlined'} size="small" onClick={() => setTab(t.value)}>
                  {t.label}
                </Btn>
              ))
            : ORG_TABS.map(t => (
                <Btn
                  key={t.value}
                  variant={orgTab === t.value ? 'accent' : 'outlined'}
                  size="small"
                  onClick={() => setOrgTab(t.value)}
                >
                  {t.label}
                </Btn>
              ))
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['reports', 'groups'] as const).map(s => (
          <Btn key={s} variant={section === s ? 'accent' : 'text'} onClick={() => setSection(s)}>
            <Icon name={s === 'reports' ? 'mdi-flag-outline' : 'mdi-account-group-outline'} size={18} color={section === s ? '#fff' : undefined} />
            {s === 'reports' ? 'Project reports' : 'Group verification'}
          </Btn>
        ))}
      </div>

      {section === 'groups' ? (
        orgsLoading ? (
          <Spinner />
        ) : orgs?.length ? (
          <div style={{ display: 'grid', gap: 16 }}>
            {orgs.map(o => (
              <OrgRow key={o.id} org={o} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="mdi-account-group-outline"
            title={orgTab === 'IN_REVIEW' ? 'No groups waiting on review.' : 'No groups yet.'}
            action={
              orgTab === 'IN_REVIEW' && (
                <Btn variant="outlined" onClick={() => setOrgTab('all')}>
                  <Icon name="mdi-history" size={18} />
                  See every group
                </Btn>
              )
            }
          />
        )
      ) : isLoading ? (
        <Spinner />
      ) : reports?.length ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {reports.map(r => (
            <ReportRow key={r.id} report={r} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="mdi-flag-outline"
          title={tab === 'OPEN' ? 'Nothing to review.' : 'No reports yet.'}
          action={
            tab === 'OPEN' && (
              <Btn variant="outlined" onClick={() => setTab('all')}>
                <Icon name="mdi-history" size={18} />
                See decided reports
              </Btn>
            )
          }
        />
      )}
    </div>
  )
}
