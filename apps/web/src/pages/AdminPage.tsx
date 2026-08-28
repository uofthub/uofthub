import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReportStatus } from '@uofthub/types'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api, type AdminReport, type ReportDecision } from '../lib/api'
import { STATUS_LABELS, reasonShort } from '../lib/moderation'
import { Btn, Card, Chip, EmptyState, ErrorText, Icon, PageHeader, Spinner, TextArea, type ChipColor } from '../components/ui'

const TABS: { value: ReportStatus | 'all'; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'all', label: 'All' },
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

export default function AdminPage() {
  const { user, loading } = useAuth()
  const [tab, setTab] = useState<ReportStatus | 'all'>('OPEN')

  usePageCrumbs([{ text: 'Moderation', href: '/admin' }])

  const { data: reports, isLoading } = useQuery({
    queryKey: ['admin-reports', tab],
    queryFn: () => api.admin.reports(tab),
    enabled: !!user?.isAdmin,
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
        subtitle="Reports on U of T-visible and public projects, oldest first."
        actions={TABS.map(t => (
          <Btn key={t.value} variant={tab === t.value ? 'accent' : 'outlined'} size="small" onClick={() => setTab(t.value)}>
            {t.label}
          </Btn>
        ))}
      />

      {isLoading ? (
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
