import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReportStatus } from '@uofthub/types'
import {
  api,
  type AdminReport,
  type AdminUser,
  type ReportDecision,
  type ReportTargetType,
} from '../../lib/api'
import { profilePath } from '../../lib/paths'
import { useAuth } from '../../lib/auth'
import { useDocumentTitle } from '../../lib/hooks'
import { CreateOrgDialog } from '../orgs/CreateOrgDialog'
import { MessageReportRow } from './MessageReportRow'
import { STATUS_LABELS, reasonShort } from '../../lib/moderation'
import {
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  ErrorText,
  Field,
  Heading,
  Input,
  Notice,
  Page,
  PageLede,
  PageTitle,
  Pill,
  SegmentedTabs,
  Spinner,
  SuccessText,
  TextArea,
  Toggle,
  confirmAction,
} from '../../components/ui'
import { Decisions, QueueCard, Quote } from './QueueCard'

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
    hint: 'Nothing wrong — closes the report; nobody is told.',
  },
  {
    value: 'WARN',
    label: 'Warn',
    hint: 'Notifies whoever posted it with your note; it stays up.',
  },
  {
    value: 'TAKE_DOWN',
    label: 'Take down',
    hint: 'A project goes private; a comment, collection or event is removed; a profile loses its bio, links and photo.',
  },
]

const TARGET_LABELS: Record<ReportTargetType, string> = {
  PROJECT: 'Project',
  COMMENT: 'Comment',
  COLLECTION: 'Collection',
  USER: 'Profile',
  ORG_ACTIVITY: 'Group event',
}

/** Where a report's subject lives, and what to call it in the queue. */
function reportTarget(report: AdminReport): { to: string; title: string } {
  switch (report.targetType) {
    case 'PROJECT':
      return {
        to: `/projects/${report.project?.id}`,
        title: report.project?.title ?? 'Deleted project',
      }
    case 'COMMENT':
      return {
        to: `/projects/${report.project?.id}#comments`,
        title: `Comment on “${report.project?.title ?? 'a deleted project'}”`,
      }
    case 'COLLECTION':
      return {
        to: report.collection ? `/collections/${report.collection.id}` : '/collections',
        title: report.collection?.title ?? 'Deleted collection',
      }
    case 'USER':
      return { to: `/u/${report.subject?.id}`, title: report.subject?.name ?? 'Deleted account' }
    case 'ORG_ACTIVITY':
      return {
        to: report.activity ? `/orgs/${report.activity.org.slug}` : '/orgs',
        title: report.activity
          ? `${report.activity.title} · ${report.activity.org.name}`
          : 'Deleted event',
      }
  }
}

function ReportRow({ report }: { report: AdminReport }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [suspend, setSuspend] = useState(false)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-reports'] })
    qc.invalidateQueries({ queryKey: ['admin-users'] })
  }
  const decide = useMutation({
    mutationFn: (decision: ReportDecision) =>
      api.admin.decide(report.id, { decision, note: note.trim() || undefined, suspend }),
    onSuccess: refresh,
  })
  const restore = useMutation({
    mutationFn: () => api.admin.restoreProject(report.project!.id, note.trim() || undefined),
    onSuccess: refresh,
  })
  const { to, title } = reportTarget(report)
  const subject = report.subject ?? report.project?.owner ?? null

  return (
    <QueueCard
      to={to}
      title={title}
      tags={
        <>
          <Chip size="sm">{TARGET_LABELS[report.targetType]}</Chip>
          <Chip size="sm" tone="navy">
            {reasonShort(report.reason)}
          </Chip>
          <Pill dot={REPORT_DOTS[report.status]}>{STATUS_LABELS[report.status]}</Pill>
        </>
      }
      when={new Date(report.createdAt).toLocaleString()}
      meta={
        <>
          {subject && (
            <>
              Posted by <Link to={`/u/${subject.id}`}>{subject.name}</Link> ({subject.email})
              {report.subject?.suspendedAt && ' — suspended'} ·{' '}
            </>
          )}
          reported by <Link to={`/u/${report.reporter.id}`}>{report.reporter.name}</Link> (
          {report.reporter.email})
          {report.targetType === 'PROJECT' && report.project && ` · ${report.project.visibility}`}
        </>
      }
    >
      {report.excerpt && (
        <Notice tone="navy" title="As reported">
          <p className="whitespace-pre-wrap">{report.excerpt}</p>
        </Notice>
      )}
      {report.details && <Quote>{report.details}</Quote>}
      {report.status === 'OPEN' ? (
        <>
          <TextArea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note to whoever posted it (sent with a warning, take-down or suspension)…"
          />
          {subject && !report.subject?.suspendedAt && (
            <Toggle checked={suspend} onChange={setSuspend}>
              Also suspend {subject.name}’s account
            </Toggle>
          )}
          {decide.isError && <ErrorText>{decide.error.message}</ErrorText>}
          <Decisions>
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
          </Decisions>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-13 text-muted">
          <span>
            {report.reviewedBy ? `Decided by ${report.reviewedBy.name}` : 'Decided'}
            {report.reviewedAt && ` on ${new Date(report.reviewedAt).toLocaleDateString()}`}
            {report.reviewNote && ` — “${report.reviewNote}”`}
          </span>
          {/* The appeal path: a take-down can be lifted from its report. */}
          {report.targetType === 'PROJECT' && report.project?.takenDownAt && (
            <Button size="sm" onClick={() => restore.mutate()} disabled={restore.isPending}>
              Restore project
            </Button>
          )}
          {restore.isError && <ErrorText>{restore.error.message}</ErrorText>}
        </div>
      )}
    </QueueCard>
  )
}

/**
 * Renaming someone's handle: an impersonation report upheld, or a name its
 * rightful owner asked for. The old one is free at once for them to take.
 */
function RenameHandleDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const qc = useQueryClient()
  const [handle, setHandle] = useState('')
  const rename = useMutation({
    mutationFn: () => api.admin.renameHandle(user.id, { handle }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
  return (
    <Dialog
      title={`Change @${user.handle}`}
      onClose={onClose}
      footer={
        rename.isSuccess ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => rename.mutate()}
              disabled={!handle.trim() || rename.isPending}
            >
              {rename.isPending ? 'Saving…' : 'Change handle'}
            </Button>
          </>
        )
      }
    >
      {rename.isSuccess ? (
        <SuccessText>
          {user.name} is @{rename.data.handle} now, and @{user.handle} is free for anyone to take.
        </SuccessText>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="New handle" hint="They can change it themselves again in 30 days.">
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          {rename.isError && <ErrorText>{rename.error.message}</ErrorText>}
        </div>
      )}
    </Dialog>
  )
}

/** Finding an account, and suspending or lifting it. */
function UsersAdmin() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => api.admin.users(search),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-users'] })
  const suspend = useMutation({
    mutationFn: (id: string) => api.admin.suspend(id),
    onSuccess: refresh,
  })
  const lift = useMutation({
    mutationFn: (id: string) => api.admin.liftSuspension(id),
    onSuccess: refresh,
  })
  const liftMessaging = useMutation({
    mutationFn: (id: string) => api.admin.liftMessagingSuspension(id),
    onSuccess: refresh,
  })
  const [renaming, setRenaming] = useState<AdminUser | null>(null)
  const busy = suspend.isPending || lift.isPending || liftMessaging.isPending
  const error = [suspend, lift, liftMessaging].find((m) => m.isError)?.error

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(q.trim())
        }}
      >
        <Input
          className="grow"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, email or handle — empty lists everyone suspended"
          aria-label="Find an account"
        />
        <Button type="submit" icon="search">
          Find
        </Button>
      </form>
      {renaming && <RenameHandleDialog user={renaming} onClose={() => setRenaming(null)} />}
      {error && <ErrorText>{error.message}</ErrorText>}
      {isLoading ? (
        <Spinner />
      ) : !users?.length ? (
        <EmptyState icon="user" title={search ? 'Nobody matches' : 'Nobody is suspended'} compact />
      ) : (
        users.map((u) => (
          <Card key={u.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="flex min-w-0 grow flex-col">
              <Link to={profilePath(u)} className="font-semibold">
                {u.name}
              </Link>
              <span className="text-13 text-muted">
                @{u.handle} · {u.email} · joined {new Date(u.createdAt).toLocaleDateString()} ·{' '}
                {u._count.ownedProjects} projects · {u._count.comments} comments ·{' '}
                {u._count.reportsAbout} reports about them
                {u.isAdmin && ' · moderator'}
              </span>
            </span>
            <Button size="sm" disabled={busy} onClick={() => setRenaming(u)}>
              Change handle
            </Button>
            {u.messagingSuspendedAt && (
              <Button size="sm" disabled={busy} onClick={() => liftMessaging.mutate(u.id)}>
                Lift messaging suspension
              </Button>
            )}
            {u.suspendedAt ? (
              <Button size="sm" disabled={busy} onClick={() => lift.mutate(u.id)}>
                Lift suspension
              </Button>
            ) : (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={async () =>
                  (await confirmAction({
                    title: `Suspend ${u.name}?`,
                    body: 'They can still read, but not post, comment or message.',
                    confirmLabel: 'Suspend',
                    danger: true,
                  })) && suspend.mutate(u.id)
                }
              >
                Suspend
              </Button>
            )}
          </Card>
        ))
      )}
    </div>
  )
}

/** A project link — /@handle/slug or /projects/:id — or a bare id, as a moderator might paste any. */
async function projectIdFrom(raw: string): Promise<string> {
  const readable = raw.match(/\/@([\w-]+)\/([\w-]+)/)
  if (readable) return (await api.paths.project(readable[1], readable[2])).projectId
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
    mutationFn: async () =>
      api.admin.pickSpotlight({
        projectId: await projectIdFrom(project),
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
    <div className="flex flex-col gap-5">
      <Card
        as="form"
        className="flex flex-col gap-3.5 p-5.5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (project.trim()) pick.mutate()
        }}
      >
        <Heading className="text-18">Pick a week’s spotlight</Heading>
        <p className="text-14 leading-normal text-muted">
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
            className="max-w-55"
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
      </Card>

      {isLoading ? (
        <Spinner />
      ) : picks?.length ? (
        picks.map((p) => (
          <Card as="article" key={p.id} className="flex items-center gap-3.5 p-4.5">
            <div className="min-w-0 grow">
              <div className="text-13 text-muted">
                Week of{' '}
                {new Date(p.weekOf).toLocaleDateString(undefined, {
                  timeZone: 'UTC',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              <Link to={`/projects/${p.project.id}`} className="font-display text-18 font-bold">
                {p.project.title}
              </Link>
              <div className="text-13 text-muted">
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
          </Card>
        ))
      ) : (
        <EmptyState icon="star" title="No spotlights picked yet" compact />
      )}
    </div>
  )
}

type Section = 'reports' | 'messages' | 'users' | 'groups' | 'spotlight'

export default function AdminPage() {
  const { user, loading } = useAuth()
  const [section, setSection] = useState<Section>('reports')
  const [reportTab, setReportTab] = useState<ReportStatus | 'all'>('OPEN')
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

  if (loading) return <Spinner />
  // The API gate is the real one; this only avoids an empty page.
  if (!user?.isAdmin) {
    return (
      <Page>
        <EmptyState icon="lock" title="Moderators only" />
      </Page>
    )
  }

  const LEDES: Record<Section, string> = {
    reports: 'Reported projects, comments, collections, profiles and group events, oldest first.',
    messages: 'Conversations students reported, with the messages as they were when reported.',
    users: 'Find an account to suspend it, or lift a suspension.',
    groups: 'Group pages are created here, published at once, and handed to their exec.',
    spotlight: 'The project at the top of everyone’s home feed this week.',
  }
  const queue = section === 'reports' ? reports : messageReports

  return (
    <Page width="narrow" className="flex flex-col gap-6">
      <div>
        <PageTitle>Moderation</PageTitle>
        <PageLede>{LEDES[section]}</PageLede>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs<Section>
          label="Queue"
          value={section}
          onChange={setSection}
          options={[
            { value: 'reports', label: 'Reports' },
            { value: 'messages', label: 'Messages' },
            { value: 'users', label: 'Users' },
            { value: 'groups', label: 'Groups' },
            { value: 'spotlight', label: 'Spotlight' },
          ]}
        />
        {(section === 'reports' || section === 'messages') && (
          <SegmentedTabs<ReportStatus | 'all'>
            label="Report status"
            value={reportTab}
            onChange={setReportTab}
            options={[
              { value: 'OPEN', label: 'Open' },
              { value: 'all', label: 'All' },
            ]}
          />
        )}
      </div>
      {creatingOrg && <CreateOrgDialog onClose={() => setCreatingOrg(false)} />}
      {/* Keyed on the queue too, so switching Open / All fades like a tab. */}
      <div
        key={`${section}:${reportTab}`}
        className="flex flex-col gap-6 motion-safe:animate-tab-in"
      >
        {section === 'spotlight' ? (
          <SpotlightAdmin />
        ) : section === 'users' ? (
          <UsersAdmin />
        ) : section === 'groups' ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4.5">
            <span className="text-14 text-muted">
              Each group’s admins manage its members and page. Moderators can delete a group from
              its own page.
            </span>
            <Button variant="primary" icon="plus" onClick={() => setCreatingOrg(true)}>
              New group
            </Button>
          </Card>
        ) : queue.isLoading ? (
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
        ) : messageReports.data?.length ? (
          messageReports.data.map((r) => <MessageReportRow key={r.id} report={r} />)
        ) : (
          <EmptyState
            icon="flag"
            title={reportTab === 'OPEN' ? 'Nothing to review' : 'No reports yet'}
          />
        )}
      </div>
    </Page>
  )
}
