import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ProjectDetail } from '../../lib/api'
import { formatBytes, lookFor, previewKindFor } from '../../lib/files'
import { safeLinks, LINK_ICONS, timeAgo } from '../../lib/projectView'
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_KEYS,
  PROJECT_TYPES,
  PROJECT_TYPE_KEYS,
  type ProjectStatus,
  type ProjectType,
} from '../../lib/projectMeta'
import { REACTIONS, reactionLabel } from '../../lib/reactions'
import {
  Avatar,
  Button,
  Dialog,
  ErrorText,
  Field,
  Icon,
  Input,
  Select,
  Spinner,
  TextArea,
} from '../../components/ui'

const invalidate = (qc: ReturnType<typeof useQueryClient>, id: string) =>
  qc.invalidateQueries({ queryKey: ['project', id] })

/* ---------------------------------- edit ----------------------------------- */

export function EditProjectDialog({
  project,
  onClose,
}: {
  project: ProjectDetail
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: project.title,
    pitch: project.pitch ?? '',
    description: project.description ?? '',
    type: (project.type ?? '') as ProjectType | '',
    status: (project.status ?? '') as ProjectStatus | '',
    tags: project.tags.join(', '),
    courseCode: project.courseCode ?? '',
    visibility: project.visibility,
  })
  // Short labelled facts. Rows left half-filled are dropped by the API.
  const [details, setDetails] = useState(project.details ?? [])
  const setDetail = (i: number, key: 'label' | 'value', value: string) =>
    setDetails((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  const save = useMutation({
    mutationFn: () =>
      api.projects.update(project.id, {
        title: form.title,
        pitch: form.pitch.trim() || null,
        description: form.description,
        type: form.type || null,
        status: form.status || null,
        details,
        courseCode: form.courseCode.trim() || null,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        // A taken-down project cannot change visibility, so it is not sent.
        ...(project.takenDownAt ? {} : { visibility: form.visibility }),
      }),
    onSuccess: () => {
      invalidate(qc, project.id)
      onClose()
    },
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <Dialog
      title="Edit project"
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={!form.title.trim() || save.isPending}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label="Title">
        <Input value={form.title} onChange={set('title')} />
      </Field>
      <Field label="One-line pitch" hint="What shows on cards. One sentence.">
        <Input value={form.pitch} onChange={set('pitch')} maxLength={280} />
      </Field>
      <div className="row wrap" style={{ gap: 16 }}>
        <Field label="Type" className="grow">
          <Select value={form.type} onChange={set('type')}>
            <option value="">Not set</option>
            {PROJECT_TYPE_KEYS.map((k) => (
              <option key={k} value={k}>
                {PROJECT_TYPES[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" className="grow">
          <Select value={form.status} onChange={set('status')}>
            <option value="">Not set</option>
            {PROJECT_STATUS_KEYS.map((k) => (
              <option key={k} value={k}>
                {PROJECT_STATUSES[k].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Overview" hint="Markdown. Leave it empty and the project page won’t show it.">
        <TextArea rows={10} value={form.description} onChange={set('description')} />
      </Field>
      <div className="stack" style={{ gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Details</span>
        {details.map((d, i) => (
          <div key={i} className="row" style={{ gap: 8 }}>
            <Input
              aria-label={`Detail ${i + 1} label`}
              value={d.label}
              onChange={(e) => setDetail(i, 'label', e.target.value)}
              placeholder="Supervisor"
              maxLength={40}
              style={{ width: 160 }}
            />
            <Input
              aria-label={`Detail ${i + 1} value`}
              value={d.value}
              onChange={(e) => setDetail(i, 'value', e.target.value)}
              placeholder="Prof. Ada Lovelace"
              maxLength={200}
              className="grow"
            />
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon="close"
              aria-label={`Remove detail ${i + 1}`}
              onClick={() => setDetails((rows) => rows.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        {details.length < 12 && (
          <div>
            <Button
              size="sm"
              icon="plus"
              onClick={() => setDetails((rows) => [...rows, { label: '', value: '' }])}
            >
              Add a detail
            </Button>
          </div>
        )}
        <span className="muted" style={{ fontSize: 13 }}>
          Short facts like a supervisor, a runtime or who performed.
        </span>
      </div>
      <div className="row wrap" style={{ gap: 16 }}>
        <Field label="Made for a course?" hint="Files it under that course" className="grow">
          <Input
            value={form.courseCode}
            onChange={set('courseCode')}
            placeholder="e.g. CSC211H5"
            maxLength={8}
          />
        </Field>
        <Field label="Tags" hint="Comma-separated topics" className="grow">
          <Input value={form.tags} onChange={set('tags')} />
        </Field>
      </div>
      <Field label="Who can see this?">
        <Select
          value={form.visibility}
          onChange={set('visibility')}
          disabled={!!project.takenDownAt}
        >
          <option value="PUBLIC">Public — anyone on the web</option>
          <option value="UOFT">U of T only — signed-in students and staff</option>
          <option value="UNLISTED">Unlisted — only people with the link</option>
          <option value="PRIVATE">Draft — only you and your collaborators</option>
        </Select>
      </Field>
      {save.isError && <ErrorText>{(save.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

/* --------------------------------- update ---------------------------------- */

/**
 * "Post an update" — a line about what changed, saved with a snapshot of the
 * project as a new version. It is what the project's Updates timeline shows.
 */
export function UpdateDialog({
  project,
  onClose,
}: {
  project: Pick<ProjectDetail, 'id' | 'title'>
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const post = useMutation({
    mutationFn: () => api.projects.createVersion(project.id, note.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['versions', project.id] })
      onClose()
    },
  })

  return (
    <Dialog
      title={`Post an update to ${project.title}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="send"
            onClick={() => post.mutate()}
            disabled={!note.trim() || post.isPending}
          >
            {post.isPending ? 'Posting…' : 'Post update'}
          </Button>
        </>
      }
    >
      <Field
        label="What changed?"
        hint="One line — it goes on the project’s Updates timeline, saved as a new version."
      >
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          placeholder="Added Gerstein Library and a quiet-floors filter"
          autoFocus
        />
      </Field>
      {post.isError && <ErrorText>{(post.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

/* ---------------------------------- links ---------------------------------- */

export function LinksDialog({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const add = useMutation({
    mutationFn: () => api.projects.addLink(project.id, { label: label.trim(), url: url.trim() }),
    onSuccess: () => {
      setLabel('')
      setUrl('')
      invalidate(qc, project.id)
    },
  })
  const remove = useMutation({
    mutationFn: (linkId: string) => api.projects.deleteLink(project.id, linkId),
    onSuccess: () => invalidate(qc, project.id),
  })
  const links = safeLinks(project.links)

  return (
    <Dialog title="Links" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <p className="muted" style={{ fontSize: 14 }}>
        A live site becomes the “Try it live” button, a GitHub link becomes “View code”, a YouTube
        or Vimeo link becomes “Watch”.
      </p>
      {links.length > 0 && (
        <ul className="stack" style={{ gap: 8, listStyle: 'none', padding: 0 }}>
          {links.map((l) => (
            <li key={l.id} className="row manage-row">
              <Icon name={LINK_ICONS[l.role]} size={18} />
              <span className="grow">
                <b style={{ fontWeight: 600 }}>{l.label || 'Link'}</b>
                <span className="muted clamp-1" style={{ fontSize: 13 }}>
                  {l.url}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="trash"
                aria-label={`Remove ${l.label}`}
                onClick={() => remove.mutate(l.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <form
        className="row wrap"
        style={{ gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (url.trim()) add.mutate()
        }}
      >
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label, e.g. Live demo"
          style={{ flex: '1 1 150px', width: 'auto' }}
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          style={{ flex: '2 1 220px', width: 'auto' }}
        />
        <Button type="submit" icon="plus" disabled={!url.trim() || add.isPending}>
          Add
        </Button>
      </form>
      {add.isError && <ErrorText>{(add.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

/* ---------------------------------- files ---------------------------------- */

export function FilesDialog({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const upload = useMutation({
    mutationFn: (file: File) => api.projects.uploadFile(project.id, file),
    onSuccess: () => invalidate(qc, project.id),
  })
  const remove = useMutation({
    mutationFn: (fileId: string) => api.projects.deleteFile(project.id, fileId),
    onSuccess: () => invalidate(qc, project.id),
  })

  return (
    <Dialog title="Files" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <p className="muted" style={{ fontSize: 14 }}>
        Images and videos appear in the gallery; the first image is the cover on cards. Anything
        else is listed for download.
      </p>
      {project.files.length > 0 && (
        <ul className="stack" style={{ gap: 8, listStyle: 'none', padding: 0 }}>
          {project.files.map((f) => {
            const look = lookFor(f.name)
            return (
              <li key={f.id} className="row manage-row">
                <span className="file-glyph" style={{ background: look.bg, color: look.ink }}>
                  <Icon name={look.icon} size={16} />
                </span>
                <span className="grow">
                  <b className="clamp-1" style={{ fontWeight: 600 }}>
                    {f.name}
                  </b>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {formatBytes(f.sizeBytes)}
                    {!previewKindFor(f.name) && ' · download only'}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="trash"
                  aria-label={`Delete ${f.name}`}
                  onClick={() => remove.mutate(f.id)}
                />
              </li>
            )
          })}
        </ul>
      )}
      <label className="dropzone">
        <span className="dropzone__icon">
          <Icon name="upload" size={20} />
        </span>
        <span className="grow">
          <b style={{ fontWeight: 600 }}>{upload.isPending ? 'Uploading…' : 'Upload a file'}</b>
          <span className="muted" style={{ display: 'block', fontSize: 13 }}>
            Images, video, audio, PDFs, documents, slides, spreadsheets or a .zip
          </span>
        </span>
        <span className="btn btn--md">Browse files</span>
        <input
          type="file"
          className="sr-only"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) upload.mutate(file)
          }}
        />
      </label>
      {upload.isError && <ErrorText>{(upload.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

/* ------------------------------ collaborators ------------------------------ */

export function InviteDialog({
  project,
  onClose,
}: {
  project: ProjectDetail
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const invite = useMutation({
    mutationFn: () => api.projects.inviteCollaborator(project.id, email.trim()),
  })

  return (
    <Dialog
      title="Invite a collaborator"
      onClose={onClose}
      footer={
        invite.isSuccess ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              icon="userPlus"
              onClick={() => invite.mutate()}
              disabled={!email.trim() || invite.isPending}
            >
              {invite.isPending ? 'Inviting…' : 'Invite'}
            </Button>
          </>
        )
      }
    >
      {invite.isSuccess ? (
        <p className="row" style={{ gap: 8, color: 'var(--green-ink)' }}>
          <Icon name="check" /> Invitation sent. They appear on the project once they accept.
        </p>
      ) : (
        <Field
          label="Their U of T email"
          hint="Collaborators confirm before they appear on the project."
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@mail.utoronto.ca"
          />
        </Field>
      )}
      {invite.isError && <ErrorText>{(invite.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

/* --------------------------------- insights -------------------------------- */

/** Thirty days of views as thin navy bars — one series, so no legend. */
function ViewsChart({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(...days.map((d) => d.count), 1)
  const label = (d: { date: string; count: number }) =>
    `${new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${d.count} view${d.count === 1 ? '' : 's'}`

  return (
    <figure className="stack" style={{ gap: 8 }}>
      <figcaption className="lbl">Views, last 30 days</figcaption>
      <div
        className="views-chart"
        role="img"
        aria-label={`Daily views over the last ${days.length} days, peaking at ${max}`}
      >
        {days.map((d) => (
          <span key={d.date} className="views-chart__slot" title={label(d)}>
            <span
              className="views-chart__bar"
              style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
            />
          </span>
        ))}
      </div>
      <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 12 }}>
        <span>
          {new Date(days[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        <span>Peak {max}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function AccessRequests({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data: requests = [] } = useQuery({
    queryKey: ['access-requests', projectId],
    queryFn: () => api.projects.accessRequests(projectId),
  })
  const done = () => {
    qc.invalidateQueries({ queryKey: ['access-requests', projectId] })
    invalidate(qc, projectId)
  }
  const approve = useMutation({
    mutationFn: (userId: string) => api.projects.approveAccessRequest(projectId, userId),
    onSuccess: done,
  })
  const deny = useMutation({
    mutationFn: (userId: string) => api.projects.removeCollaborator(projectId, userId),
    onSuccess: done,
  })

  if (requests.length === 0) return null
  const busy = approve.isPending || deny.isPending

  return (
    <div className="stack" style={{ gap: 10 }}>
      <span className="lbl">Access requests</span>
      {requests.map((r) => (
        <div key={r.userId} className="row" style={{ gap: 10 }}>
          <Avatar person={r.user} size={32} />
          <div className="grow">
            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.user.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {r.user.faculty ?? r.user.email} — wants viewer access
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => approve.mutate(r.userId)}
            disabled={busy}
          >
            Approve
          </Button>
          <Button size="sm" onClick={() => deny.mutate(r.userId)} disabled={busy}>
            Deny
          </Button>
        </div>
      ))}
    </div>
  )
}

/** The owner's own numbers — the Insights tab of the old page, in a dialog. */
export function InsightsDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['analytics', projectId],
    queryFn: () => api.projects.analytics(projectId),
  })

  const change = data ? data.viewsThisWeek - data.viewsLastWeek : 0
  const said = data ? REACTIONS.filter((r) => data.reactions[r.kind] > 0) : []

  return (
    <Dialog
      title="Insights"
      onClose={onClose}
      width={620}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="stat-row">
            {[
              { label: 'Views', value: data.totalViews },
              { label: 'Comments', value: data.comments },
              { label: 'Saves', value: data.saves },
              { label: 'Following', value: data.followers },
              { label: 'Forks', value: data.forks },
            ].map((s) => (
              <div key={s.label}>
                <div className="disp" style={{ fontSize: 24, fontWeight: 700 }}>
                  {s.value}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Two adjacent weeks tell "quiet" apart from "slowing down", which a
              lifetime total cannot. */}
          <p style={{ fontSize: 15 }}>
            <b>{data.viewsThisWeek}</b> {data.viewsThisWeek === 1 ? 'view' : 'views'} this week
            {data.viewsLastWeek > 0 && (
              <>
                , against {data.viewsLastWeek} last week
                {change !== 0 && (
                  <span
                    style={{
                      color: change > 0 ? 'var(--green-ink)' : 'var(--muted)',
                      fontWeight: 600,
                    }}
                  >
                    {' '}
                    ({change > 0 ? '+' : ''}
                    {change})
                  </span>
                )}
              </>
            )}
            .
          </p>

          {data.dailyViews.length > 0 && <ViewsChart days={data.dailyViews} />}

          {said.length > 0 && (
            <p className="muted" style={{ fontSize: 14 }}>
              {said.map((r) => `${data.reactions[r.kind]} ${r.past}`).join(' · ')}.
            </p>
          )}

          {/* The one list nobody else sees: who offered to work on this. */}
          {data.collabInterest.length > 0 && (
            <div className="stack" style={{ gap: 10 }}>
              <span className="lbl">Want to collaborate</span>
              {data.collabInterest.map(({ user, createdAt }) => (
                <Link
                  key={user.id}
                  to={`/u/${user.id}`}
                  className="row"
                  style={{ gap: 10, color: 'var(--ink)' }}
                >
                  <Avatar person={user} size={32} />
                  <span className="grow">
                    <b style={{ fontWeight: 600, fontSize: 14, display: 'block' }}>{user.name}</b>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {[user.faculty, timeAgo(createdAt)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={16} />
                </Link>
              ))}
            </div>
          )}

          {/* Views are anonymous and stay that way; a reaction is attributed. */}
          {data.recentReactions.length > 0 && (
            <div className="stack" style={{ gap: 10 }}>
              <span className="lbl">Recent reactions</span>
              {data.recentReactions.map((r) => (
                <Link
                  key={`${r.user.id}-${r.kind}`}
                  to={`/u/${r.user.id}`}
                  className="row"
                  style={{ gap: 8, fontSize: 14, color: 'var(--ink-3)' }}
                >
                  <Avatar person={r.user} size={26} />
                  <span>
                    <b style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.user.name}</b> ·{' '}
                    {reactionLabel(r.kind).toLowerCase()}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <AccessRequests projectId={projectId} />
        </>
      )}
    </Dialog>
  )
}

/* --------------------------------- groups ---------------------------------- */

/**
 * "Built with" — link the project to the groups its owner belongs to. It then
 * shows on the project's cards and on the group's page.
 */
export function GroupsDialog({
  project,
  onClose,
}: {
  project: ProjectDetail
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: mine, isLoading } = useQuery({
    queryKey: ['my-orgs'],
    queryFn: () => api.users.myOrgs(),
  })
  const linked = new Set(project.orgProjects.map((o) => o.org.slug))
  const toggle = useMutation({
    mutationFn: (slug: string) =>
      linked.has(slug)
        ? api.orgs.removeProject(slug, project.id)
        : api.orgs.addProject(slug, project.id),
    onSuccess: () => invalidate(qc, project.id),
  })

  return (
    <Dialog title="Built with" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      {isLoading ? (
        <Spinner />
      ) : !mine?.length ? (
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
          You’re not a member of any club or lab yet. Ask your group’s exec to add you from its page
          on{' '}
          <Link to="/orgs" onClick={onClose}>
            Clubs &amp; labs
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 14 }}>
            A linked group shows as “Built with …” on this project, and the project appears on the
            group’s page.
          </p>
          {mine.map((org) => {
            const on = linked.has(org.slug)
            return (
              <div key={org.slug} className="row manage-row">
                <Icon name={org.type === 'LAB' ? 'flask' : 'users'} size={18} />
                <span className="grow" style={{ fontWeight: 600 }}>
                  {org.name}
                </span>
                <Button
                  size="sm"
                  variant={on ? 'default' : 'primary'}
                  icon={on ? 'check' : 'plus'}
                  onClick={() => toggle.mutate(org.slug)}
                  disabled={toggle.isPending}
                >
                  {on ? 'Linked' : 'Link'}
                </Button>
              </div>
            )
          })}
        </>
      )}
      {toggle.isError && <ErrorText>{(toggle.error as Error).message}</ErrorText>}
    </Dialog>
  )
}
