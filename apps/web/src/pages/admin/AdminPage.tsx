import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgStatus, ReportStatus } from '@uofthub/types'
import {
  api,
  type AdminOrg,
  type AdminReport,
  type OrgDecision,
  type ReportDecision,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useDocumentTitle } from '../../lib/hooks'
import { CreateOrgDialog } from '../orgs/CreateOrgDialog'
import { MessageReportRow } from './MessageReportRow'
import { STATUS_LABELS, reasonShort } from '../../lib/moderation'
import { ORG_STATUS_DOTS, ORG_STATUS_LABELS } from '../../lib/orgs'
import {
  Button,
  Chip,
  EmptyState,
  ErrorText,
  Field,
  Input,
  SegmentedTabs,
  Spinner,
  TextArea,
  Pill,
} from '../../components/ui'

const REPORT_DOTS: Record<ReportStatus, string> = {
  OPEN: '#C07A00',
  DISMISSED: '#8A8E98',
  WARNED: '#1E3765',
  TAKEN_DOWN: '#C0392B',
}

const DECISIONS: { value: ReportDecision; label: string; hint: string }[] = [
  {
    value: 'DISMISS',
    label: 'Dismiss',
    hint: 'Nothing wrong — closes the report; the owner is not told.',
  },
  {
    value: 'WARN',
    label: 'Warn owner',
    hint: 'Notifies the owner with your note; the project stays up.',
  },
  {
    value: 'TAKE_DOWN',
    label: 'Take down',
    hint: 'Forces the project private and notifies the owner.',
  },
]
const ORG_DECISIONS: { value: OrgDecision; label: string; hint: string }[] = [
  {
    value: 'APPROVE',
    label: 'Approve',
    hint: 'Publishes the page.',
  },
  { value: 'DENY', label: 'Deny', hint: 'Deletes the group and its data.' },
]

function ReportRow({ report }: { report: AdminReport }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const decide = useMutation({
    mutationFn: (decision: ReportDecision) =>
      api.admin.decide(report.id, { decision, note: note.trim() || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  })
  return (
    <article className="card stack" style={{ padding: 22, gap: 12 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <Link
          to={`/projects/${report.project.id}`}
          className="disp"
          style={{ fontSize: 19, fontWeight: 700 }}
        >
          {report.project.title}
        </Link>
        <Chip size="sm" tone="navy">
          {reasonShort(report.reason)}
        </Chip>
        <Pill dot={REPORT_DOTS[report.status]}>{STATUS_LABELS[report.status]}</Pill>
        <span className="muted push" style={{ fontSize: 13 }}>
          {new Date(report.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        Owner <Link to={`/u/${report.project.owner.id}`}>{report.project.owner.name}</Link> (
        {report.project.owner.email}) · reported by{' '}
        <Link to={`/u/${report.reporter.id}`}>{report.reporter.name}</Link> ({report.reporter.email}
        ) · {report.project.visibility}
      </div>
      {report.details && <p style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>“{report.details}”</p>}
      {report.status === 'OPEN' ? (
        <>
          <TextArea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note to the owner (sent with a warning or take-down)…"
          />
          {decide.isError && <ErrorText>{(decide.error as Error).message}</ErrorText>}
          <div className="row wrap" style={{ gap: 8 }}>
            {DECISIONS.map((d) => (
              <Button
                key={d.value}
                size="sm"
                variant={d.value === 'TAKE_DOWN' ? 'danger' : 'default'}
                title={d.hint}
                onClick={() => decide.mutate(d.value)}
                disabled={decide.isPending}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <div className="muted" style={{ fontSize: 13 }}>
          {report.reviewedBy ? `Decided by ${report.reviewedBy.name}` : 'Decided'}
          {report.reviewedAt && ` on ${new Date(report.reviewedAt).toLocaleDateString()}`}
          {report.reviewNote && ` — “${report.reviewNote}”`}
        </div>
      )}
    </article>
  )
}

function OrgRow({ org }: { org: AdminOrg }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const decide = useMutation({
    mutationFn: (decision: OrgDecision) =>
      api.admin.decideOrg(org.slug, { decision, note: note.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-orgs'] })
      qc.invalidateQueries({ queryKey: ['orgs'] })
    },
  })
  const creator = org.members[0]?.user
  return (
    <article className="card stack" style={{ padding: 22, gap: 12 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <Link to={`/orgs/${org.slug}`} className="disp" style={{ fontSize: 19, fontWeight: 700 }}>
          {org.name}
        </Link>
        <Chip size="sm" tone="navy">
          {org.type === 'LAB' ? 'Lab' : 'Club'}
        </Chip>
        <Pill dot={ORG_STATUS_DOTS[org.status]}>{ORG_STATUS_LABELS[org.status]}</Pill>
        <span className="muted push" style={{ fontSize: 13 }}>
          created {new Date(org.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        Claimed role <b>{org.contactRole ?? '—'}</b> · contact {org.contactEmail ?? '—'}
        {creator && (
          <>
            {' '}
            · created by <Link to={`/u/${creator.id}`}>{creator.name}</Link> ({creator.email})
          </>
        )}{' '}
        · {org._count.members} members, {org._count.projects} projects, {org._count.activities}{' '}
        events
      </div>
      {org.description && <p style={{ fontSize: 15 }}>{org.description}</p>}
      {org.verificationNote ? (
        <div className="notice notice--navy" style={{ margin: 0 }}>
          <div>
            <b>Evidence submitted</b>
            <p style={{ whiteSpace: 'pre-wrap' }}>{org.verificationNote}</p>
          </div>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 14 }}>
          Nothing submitted yet.
        </p>
      )}
      {org.status !== 'VERIFIED' && (
        <>
          <TextArea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note to the group contact (sent with every decision)…"
          />
          {decide.isError && <ErrorText>{(decide.error as Error).message}</ErrorText>}
          <div className="row wrap" style={{ gap: 8 }}>
            {ORG_DECISIONS.map((d) => (
              <Button
                key={d.value}
                size="sm"
                variant={d.value === 'DENY' ? 'danger' : 'default'}
                title={d.hint}
                disabled={decide.isPending}
                // Denial deletes the group outright, so it takes two clicks.
                onClick={() =>
                  d.value === 'DENY' && !confirming ? setConfirming(true) : decide.mutate(d.value)
                }
              >
                {d.value === 'DENY' && confirming ? 'Confirm delete' : d.label}
              </Button>
            ))}
            {confirming && (
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            )}
          </div>
        </>
      )}
    </article>
  )
}

/** A project link or bare id, as a moderator might paste either. */
function projectIdFrom(raw: string): string {
  const match = raw.match(/projects\/([0-9a-f-]{36})/i)
  return (match ? match[1] : raw).trim()
}

/** Picking the home feed's weekly spotlight. */
function SpotlightAdmin() {
  const qc = useQueryClient()
  const [project, setProject] = useState('')
  const [note, setNote] = useState('')
  const [week, setWeek] = useState(() => new Date().toISOString().slice(0, 10))
  const { data: picks, isLoading } = useQuery({
    queryKey: ['admin-spotlight'],
    queryFn: () => api.admin.spotlights(),
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-spotlight'] })
    qc.invalidateQueries({ queryKey: ['spotlight'] })
  }
  const pick = useMutation({
    mutationFn: () =>
      api.admin.pickSpotlight({
        projectId: projectIdFrom(project),
        note: note.trim() || undefined,
        weekOf: week,
      }),
    onSuccess: () => {
      setProject('')
      setNote('')
      refresh()
    },
  })
  const clear = useMutation({
    mutationFn: (weekOf: string) => api.admin.clearSpotlight(weekOf),
    onSuccess: refresh,
  })

  return (
    <div className="stack" style={{ gap: 20 }}>
      <form
        className="card stack"
        style={{ padding: 22, gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (project.trim()) pick.mutate()
        }}
      >
        <h2 className="h2" style={{ fontSize: 18 }}>
          Pick a week’s spotlight
        </h2>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
          Shown at the top of every student’s home feed for the week (Monday to Sunday). Without a
          pick, the banner shows the week’s most active project and says so.
        </p>
        <Field label="Project" hint="Paste its link or id. Public or U of T-visible projects only.">
          <Input
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="https://uofthub.com/projects/…"
          />
        </Field>
        <Field label="Why it was picked" hint="Optional — shown under the title.">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Picked by students, Faculty of Music week"
          />
        </Field>
        <Field label="Week of">
          <Input
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </Field>
        {pick.isError && <ErrorText>{(pick.error as Error).message}</ErrorText>}
        <div>
          <Button
            type="submit"
            variant="primary"
            icon="star"
            disabled={!project.trim() || pick.isPending}
          >
            {pick.isPending ? 'Saving…' : 'Set spotlight'}
          </Button>
        </div>
      </form>

      {isLoading ? (
        <Spinner />
      ) : picks?.length ? (
        picks.map((p) => (
          <article key={p.id} className="card row" style={{ padding: 18, gap: 14 }}>
            <div className="grow">
              <div className="muted" style={{ fontSize: 13 }}>
                Week of{' '}
                {new Date(p.weekOf).toLocaleDateString(undefined, {
                  timeZone: 'UTC',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              <Link
                to={`/projects/${p.project.id}`}
                className="disp"
                style={{ fontSize: 18, fontWeight: 700 }}
              >
                {p.project.title}
              </Link>
              <div className="muted" style={{ fontSize: 13 }}>
                by {p.project.owner.name}
                {p.pickedBy && ` · picked by ${p.pickedBy.name}`}
                {p.note && ` · “${p.note}”`}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon="close"
              onClick={() => clear.mutate(p.weekOf)}
              disabled={clear.isPending}
            >
              Clear
            </Button>
          </article>
        ))
      ) : (
        <EmptyState icon="star" title="No spotlights picked yet" compact />
      )}
    </div>
  )
}

export default function AdminPage() {
  const { user, loading } = useAuth()
  const [section, setSection] = useState<'reports' | 'messages' | 'groups' | 'spotlight'>('reports')
  const [reportTab, setReportTab] = useState<ReportStatus | 'all'>('OPEN')
  const [orgTab, setOrgTab] = useState<OrgStatus | 'all'>('IN_REVIEW')
  const [creatingOrg, setCreatingOrg] = useState(false)
  useDocumentTitle('Moderation')

  const reports = useQuery({
    queryKey: ['admin-reports', reportTab],
    queryFn: () => api.admin.reports(reportTab),
    enabled: !!user?.isAdmin && section === 'reports',
  })
  const messageReports = useQuery({
    queryKey: ['admin-message-reports', reportTab],
    queryFn: () => api.admin.messageReports(reportTab),
    enabled: !!user?.isAdmin && section === 'messages',
  })
  const orgs = useQuery({
    queryKey: ['admin-orgs', orgTab],
    queryFn: () => api.admin.orgs(orgTab),
    enabled: !!user?.isAdmin && section === 'groups',
  })

  if (loading) return <Spinner />
  // The API gate is the real one; this only avoids an empty page.
  if (!user?.isAdmin) {
    return (
      <div className="page">
        <EmptyState icon="lock" title="Moderators only" />
      </div>
    )
  }

  const list = section === 'reports' ? reports : section === 'messages' ? messageReports : orgs

  return (
    <div className="page page--narrow stack" style={{ gap: 24 }}>
      <div>
        <h1 className="page-title">Moderation</h1>
        <p className="page-lede">
          {section === 'reports'
            ? 'Reports on U of T-visible and public projects, oldest first.'
            : section === 'messages'
              ? 'Conversations students reported, with the messages as they were when reported.'
              : section === 'groups'
                ? 'Create group pages, and approve or deny groups left from the old self-serve flow.'
                : 'The project at the top of everyone’s home feed this week.'}
        </p>
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', gap: 12 }}>
        <SegmentedTabs
          label="Queue"
          value={section}
          onChange={setSection}
          options={[
            { value: 'reports', label: 'Project reports' },
            { value: 'messages', label: 'Message reports' },
            { value: 'groups', label: 'Groups' },
            { value: 'spotlight', label: 'Spotlight' },
          ]}
        />
        {section === 'spotlight' ? null : section === 'reports' || section === 'messages' ? (
          <SegmentedTabs<ReportStatus | 'all'>
            label="Report status"
            value={reportTab}
            onChange={setReportTab}
            options={[
              { value: 'OPEN', label: 'Open' },
              { value: 'all', label: 'All' },
            ]}
          />
        ) : (
          <SegmentedTabs<OrgStatus | 'all'>
            label="Group status"
            value={orgTab}
            onChange={setOrgTab}
            options={[
              { value: 'IN_REVIEW', label: 'In review' },
              { value: 'all', label: 'All' },
            ]}
          />
        )}
      </div>
      {creatingOrg && <CreateOrgDialog onClose={() => setCreatingOrg(false)} />}
      {section === 'groups' && (
        <div
          className="card row wrap"
          style={{ padding: 18, gap: 12, justifyContent: 'space-between' }}
        >
          <span className="muted" style={{ fontSize: 14 }}>
            Groups are set up here, published at once, and handed to their exec.
          </span>
          <Button variant="primary" icon="plus" onClick={() => setCreatingOrg(true)}>
            New group
          </Button>
        </div>
      )}
      {section === 'spotlight' ? (
        <SpotlightAdmin />
      ) : list.isLoading ? (
        <Spinner />
      ) : section === 'reports' ? (
        reports.data?.length ? (
          reports.data.map((r) => <ReportRow key={r.id} report={r} />)
        ) : (
          <EmptyState
            icon="flag"
            title={reportTab === 'OPEN' ? 'Nothing to review' : 'No reports yet'}
          />
        )
      ) : section === 'messages' ? (
        messageReports.data?.length ? (
          messageReports.data.map((r) => <MessageReportRow key={r.id} report={r} />)
        ) : (
          <EmptyState
            icon="flag"
            title={reportTab === 'OPEN' ? 'Nothing to review' : 'No reports yet'}
          />
        )
      ) : orgs.data?.length ? (
        orgs.data.map((o) => <OrgRow key={o.id} org={o} />)
      ) : (
        <EmptyState
          icon="users"
          title={orgTab === 'IN_REVIEW' ? 'No groups waiting for approval' : 'No groups yet'}
        />
      )}
    </div>
  )
}
