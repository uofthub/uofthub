import { useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api, safeUrl, type MeUser, type ProjectDetail, type ProjectFile } from '../lib/api'
import { formatBytes, lookFor, previewKindFor } from '../lib/files'
import { REPORT_REASONS } from '../lib/moderation'
import type { ReportReason } from '@uofthub/types'
import { VisibilityChip } from '../components/ProjectCard'
import FileViewer from '../components/FileViewer'
import { CONTACT_EMAIL } from '../components/layout/nav'
import {
  Avatar,
  Btn,
  Card,
  Chip,
  Dialog,
  DialogTitle,
  Divider,
  EmptyState,
  ErrorText,
  Field,
  Icon,
  SelectField,
  Spinner,
  Tabs,
  TextArea,
  TextField,
  type TabItem,
} from '../components/ui'

/* -------------------------------------------------------------------------- */
/* Dialogs                                                                    */
/* -------------------------------------------------------------------------- */

function EditProjectDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: project } = useQuery({ queryKey: ['project', projectId], queryFn: () => api.projects.get(projectId) })
  const [form, setForm] = useState({
    title: project?.title ?? '',
    description: project?.description ?? '',
    tags: project?.tags.join(', ') ?? '',
    visibility: project?.visibility ?? 'PRIVATE',
  })

  const mutation = useMutation({
    mutationFn: () =>
      api.projects.update(projectId, {
        title: form.title,
        description: form.description,
        tags: form.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
        visibility: form.visibility,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      onClose()
    },
  })

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <Dialog onClose={onClose}>
      <DialogTitle onClose={onClose}>Edit project</DialogTitle>
      <div style={{ padding: 22, display: 'grid', gap: 16 }}>
        <Field label="Title">
          <TextField value={form.title} onChange={set('title')} />
        </Field>
        <Field label="Description">
          <TextArea rows={5} value={form.description} onChange={set('description')} />
        </Field>
        <Field label="Tags" hint="Comma-separated.">
          <TextField value={form.tags} onChange={set('tags')} />
        </Field>
        <Field label="Visibility">
          <SelectField value={form.visibility} onChange={set('visibility')}>
            <option value="PRIVATE">Private</option>
            <option value="UOFT">U of T only</option>
            <option value="PUBLIC">Public</option>
          </SelectField>
        </Field>
        {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 22px 22px' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Btn>
      </div>
    </Dialog>
  )
}

function InviteDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const mutation = useMutation({ mutationFn: () => api.projects.inviteCollaborator(projectId, email) })

  return (
    <Dialog onClose={onClose}>
      <DialogTitle onClose={onClose}>Invite collaborator</DialogTitle>
      <div style={{ padding: 22 }}>
        {mutation.isSuccess ? (
          <p style={{ color: 'var(--tone-success)', margin: 0 }}>
            <Icon name="mdi-check-circle-outline" /> Invitation sent.
          </p>
        ) : (
          <Field label="U of T email">
            <TextField
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="student@mail.utoronto.ca"
            />
          </Field>
        )}
        {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 22px 22px' }}>
        <Btn onClick={onClose}>{mutation.isSuccess ? 'Close' : 'Cancel'}</Btn>
        {!mutation.isSuccess && (
          <Btn variant="accent" onClick={() => mutation.mutate()} disabled={!email || mutation.isPending}>
            {mutation.isPending ? 'Inviting…' : 'Invite'}
          </Btn>
        )}
      </div>
    </Dialog>
  )
}

function ReportDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0].value)
  const [details, setDetails] = useState('')
  const mutation = useMutation({
    mutationFn: () => api.projects.report(projectId, { reason, details: details.trim() || undefined }),
  })

  return (
    <Dialog onClose={onClose}>
      <DialogTitle onClose={onClose}>Report this project</DialogTitle>
      <div style={{ padding: 22, display: 'grid', gap: 16 }}>
        {mutation.isSuccess ? (
          <p style={{ color: 'var(--tone-success)', margin: 0 }}>
            <Icon name="mdi-check-circle-outline" /> Thanks — a moderator will review this.
          </p>
        ) : (
          <>
            <Field label="What is wrong with it?">
              <SelectField value={reason} onChange={e => setReason(e.target.value as ReportReason)}>
                {REPORT_REASONS.map(r => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Anything else we should know?" hint="Optional, but it is what a moderator reads first.">
              <TextArea
                rows={4}
                maxLength={1000}
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Which part of the project, and why…"
              />
            </Field>
          </>
        )}
        {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 22px 22px' }}>
        <Btn onClick={onClose}>{mutation.isSuccess ? 'Close' : 'Cancel'}</Btn>
        {!mutation.isSuccess && (
          <Btn variant="accent" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Sending…' : 'Send report'}
          </Btn>
        )}
      </div>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Panels                                                                     */
/* -------------------------------------------------------------------------- */

function AnalyticsPanel({ projectId }: { projectId: string }) {
  const { data } = useQuery({ queryKey: ['analytics', projectId], queryFn: () => api.projects.analytics(projectId) })
  if (!data) return <Spinner />

  const max = Math.max(...data.dailyViews.map(d => d.count), 1)
  const stats = [
    { label: 'Total views', value: data.totalViews, icon: 'mdi-eye-outline' },
    { label: 'Likes', value: data.likes, icon: 'mdi-heart-outline' },
    { label: 'Comments', value: data.comments, icon: 'mdi-comment-outline' },
    { label: 'Forks', value: data.forks, icon: 'mdi-source-fork' },
  ]

  return (
    <Card style={{ padding: 24 }}>
      <h2 style={{ fontSize: '1.125rem', marginBottom: 20 }}>Analytics</h2>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        {stats.map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <Icon name={s.icon} size={20} color="var(--v-accent-base)" />
            <div style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--v-accent-base)' }}>{s.value}</div>
            <div className="text--disabled" style={{ fontSize: '0.75rem' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {data.dailyViews.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p className="text--disabled" style={{ fontSize: '0.75rem', marginBottom: 8 }}>
            Views — last 30 days
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64 }}>
            {data.dailyViews.map(d => (
              <div
                key={d.date}
                title={`${new Date(d.date).toLocaleDateString()}: ${d.count}`}
                style={{
                  flex: 1,
                  borderRadius: 2,
                  background: 'var(--v-accent-base)',
                  opacity: 0.4 + (d.count / max) * 0.6,
                  height: `${(d.count / max) * 100}%`,
                  minHeight: 2,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function AccessRequestsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data: requests = [] } = useQuery({
    queryKey: ['access-requests', projectId],
    queryFn: () => api.projects.accessRequests(projectId),
  })
  const onDecided = () => {
    qc.invalidateQueries({ queryKey: ['access-requests', projectId] })
    qc.invalidateQueries({ queryKey: ['project', projectId] })
  }
  const approve = useMutation({
    mutationFn: (userId: string) => api.projects.approveAccessRequest(projectId, userId),
    onSuccess: onDecided,
  })
  const deny = useMutation({
    mutationFn: (userId: string) => api.projects.removeCollaborator(projectId, userId),
    onSuccess: onDecided,
  })

  if (requests.length === 0) return null

  return (
    <Card style={{ padding: 24 }}>
      <h2 style={{ fontSize: '1.125rem', marginBottom: 16 }}>Access requests</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {requests.map(r => (
          <div key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={r.user.name} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.9375rem' }}>{r.user.name}</div>
              <div className="text--disabled" style={{ fontSize: '0.75rem' }}>
                {r.user.faculty ?? r.user.email} — wants viewer access
              </div>
            </div>
            <Btn
              variant="outlined"
              size="small"
              onClick={() => approve.mutate(r.userId)}
              disabled={approve.isPending || deny.isPending}
            >
              Approve
            </Btn>
            <Btn
              size="small"
              onClick={() => deny.mutate(r.userId)}
              disabled={approve.isPending || deny.isPending}
              style={{ color: 'var(--tone-error)' }}
            >
              Deny
            </Btn>
          </div>
        ))}
      </div>
    </Card>
  )
}

function VersionsPanel({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const qc = useQueryClient()
  const { data: versions = [] } = useQuery({
    queryKey: ['versions', projectId],
    queryFn: () => api.projects.versions(projectId),
  })
  const create = useMutation({
    mutationFn: () => api.projects.createVersion(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['versions', projectId] }),
  })

  return (
    <Card style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.125rem' }}>Version history</h2>
        {isOwner && (
          <Btn variant="accent" size="small" onClick={() => create.mutate()} disabled={create.isPending}>
            <Icon name="mdi-content-save-outline" size={16} color="#fff" />
            {create.isPending ? 'Saving…' : 'Save version'}
          </Btn>
        )}
      </div>
      {versions.length === 0 ? (
        <EmptyState
          icon="mdi-history"
          title={
            isOwner
              ? 'No versions saved yet — snapshot the project to keep a record of where it stood.'
              : 'No versions saved yet.'
          }
        />
      ) : (
        <ul className="v-list" style={{ display: 'grid', gap: 10 }}>
          {versions.map(v => (
            <li key={v.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: '0.9375rem' }}>
              <Chip small color="accent" style={{ fontWeight: 700 }}>
                v{v.versionNum}
              </Chip>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{v.title}</div>
                {v.description && (
                  <p className="text--disabled overflow-ellipsis" style={{ fontSize: '0.8125rem', margin: 0 }}>
                    {v.description}
                  </p>
                )}
              </div>
              <span className="text--disabled" style={{ fontSize: '0.75rem' }}>
                {new Date(v.createdAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function FileRow({
  file,
  projectId,
  isOwner,
  onOpen,
  onDelete,
}: {
  file: ProjectFile
  projectId: string
  isOwner: boolean
  onOpen?: () => void
  onDelete: () => void
}) {
  const look = lookFor(file.name)

  return (
    <li
      className="v-list-item"
      style={{ gap: 14, padding: '10px 12px', borderRadius: 8, cursor: onOpen ? 'pointer' : 'default' }}
      onClick={onOpen}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: 8,
          flexShrink: 0,
          background: `color-mix(in srgb, var(--tone-${look.color}) 15%, transparent)`,
        }}
      >
        <Icon name={look.icon} size={22} color={`var(--tone-${look.color})`} />
      </span>

      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="overflow-ellipsis" style={{ display: 'block' }}>
          {file.name}
        </span>
        <span className="text--disabled" style={{ fontSize: '0.75rem' }}>
          {formatBytes(file.sizeBytes)} · {new Date(file.uploadedAt).toLocaleDateString()}
          {!onOpen && ' · preview not available'}
        </span>
      </span>

      {/* The row itself opens the viewer, so the actions inside it stop the
          click rather than each guarding separately — Btn's link form renders
          a plain <a> and has no onClick to guard with anyway. */}
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onClick={e => e.stopPropagation()}
      >
        {onOpen && (
          <Btn size="small" className="accent--text" onClick={onOpen}>
            <Icon name="mdi-eye-outline" size={16} />
            View
          </Btn>
        )}
        <Btn icon size="small" href={api.projects.downloadUrl(projectId, file.id)} aria-label={`Download ${file.name}`}>
          <Icon name="mdi-download-outline" size={17} />
        </Btn>
        {isOwner && (
          <Btn icon size="small" onClick={onDelete} aria-label={`Delete ${file.name}`}>
            <Icon name="mdi-delete-outline" size={17} />
          </Btn>
        )}
      </span>
    </li>
  )
}

function FilesPanel({ projectId, files, isOwner }: { projectId: string; files: ProjectFile[]; isOwner: boolean }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)

  // The viewer's arrows page through what it can actually render, so a .zip
  // sitting between two PDFs doesn't become a dead end mid-sequence.
  const previewable = files.filter(f => previewKindFor(f.name))

  const upload = useMutation({
    mutationFn: (file: File) => api.projects.uploadFile(projectId, file),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
    onError: (err: Error) => setError(err.message),
  })
  const remove = useMutation({
    mutationFn: (fileId: string) => api.projects.deleteFile(projectId, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  return (
    <Card style={{ padding: 24 }}>
      {viewing && (
        <FileViewer
          projectId={projectId}
          files={previewable}
          fileId={viewing}
          onSelect={setViewing}
          onClose={() => setViewing(null)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.125rem' }}>Files</h2>
        {isOwner && (
          <label
            className="pointer hover accent--text"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.875rem', fontWeight: 500 }}
          >
            <Icon name="mdi-upload-outline" size={18} />
            {upload.isPending ? 'Uploading…' : 'Upload file'}
            <input
              type="file"
              hidden
              disabled={upload.isPending}
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) upload.mutate(file)
              }}
            />
          </label>
        )}
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {files.length === 0 ? (
        <EmptyState
          icon="mdi-file-upload-outline"
          title={
            isOwner
              ? 'No files yet — upload a report, slide deck, image or video and it will render right here.'
              : 'No files on this project.'
          }
        />
      ) : (
        <ul className="v-list" style={{ display: 'grid', gap: 4 }}>
          {files.map(f => (
            <FileRow
              key={f.id}
              file={f}
              projectId={projectId}
              isOwner={isOwner}
              onOpen={previewKindFor(f.name) ? () => setViewing(f.id) : undefined}
              onDelete={() => remove.mutate(f.id)}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

function OverviewPanel({
  project,
  isOwner,
  onInvite,
}: {
  project: ProjectDetail
  isOwner: boolean
  onInvite: () => void
}) {
  const links = project.links.map(l => ({ ...l, href: safeUrl(l.url) })).filter(l => l.href)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card style={{ padding: 24 }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: 16 }}>About this project</h2>
        {project.description ? (
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{project.description}</p>
        ) : (
          <p className="text--disabled" style={{ margin: 0, fontSize: '0.9375rem' }}>
            {isOwner ? 'No description yet — Edit adds one.' : 'No description.'}
          </p>
        )}

        {project.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 20 }}>
            {project.tags.map(tag => (
              <Link key={tag} to={`/courses/${encodeURIComponent(tag)}`}>
                <Chip small color="blue" clickable>
                  {tag}
                </Chip>
              </Link>
            ))}
          </div>
        )}

        {/* Anything that is not http(s) was dropped above rather than rendered. */}
        {links.length > 0 && (
          <>
            <Divider style={{ margin: '20px 0 16px' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {links.map(link => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.9375rem' }}
                >
                  <Icon name="mdi-open-in-new" size={16} />
                  {link.label}
                </a>
              ))}
            </div>
          </>
        )}
      </Card>

      {(project.collaborators.length > 0 || isOwner) && (
        <Card style={{ padding: 24 }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: 16 }}>Collaborators</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {project.collaborators.map(c => (
              <Link
                key={c.user.id}
                to={`/u/${c.user.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.9375rem' }}
              >
                <Avatar name={c.user.name} img={c.user.avatarUrl} size={28} />
                {c.user.name}
              </Link>
            ))}
            {project.collaborators.length === 0 && (
              <p className="text--disabled" style={{ margin: 0, fontSize: '0.9375rem' }}>
                Just you so far.
              </p>
            )}
          </div>
          {isOwner && (
            <Btn onClick={onInvite} style={{ color: 'var(--v-accent-base)', marginTop: 12, paddingLeft: 0 }}>
              <Icon name="mdi-account-plus-outline" size={18} />
              Invite collaborator
            </Btn>
          )}
        </Card>
      )}
    </div>
  )
}

function CommentsPanel({ projectId, canPost }: { projectId: string; canPost: MeUser | null }) {
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const { data: comments = [] } = useQuery({
    queryKey: ['comments', projectId],
    queryFn: () => api.projects.comments(projectId),
  })
  const post = useMutation({
    mutationFn: () => api.projects.addComment(projectId, body),
    onSuccess: () => {
      setBody('')
      qc.invalidateQueries({ queryKey: ['comments', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })

  return (
    <Card style={{ padding: 24 }}>
      <h2 style={{ fontSize: '1.125rem', marginBottom: 20 }}>Comments</h2>

      {canPost && (
        <div style={{ display: 'flex', gap: 12, marginBottom: comments.length ? 28 : 0 }}>
          <Avatar name={canPost.name} img={canPost.avatarUrl} size={34} />
          <div style={{ flex: 1 }}>
            <TextArea rows={2} value={body} onChange={e => setBody(e.target.value)} placeholder="Leave a comment…" />
            <Btn
              variant="accent"
              size="small"
              onClick={() => post.mutate()}
              disabled={!body.trim() || post.isPending}
              style={{ marginTop: 10 }}
            >
              {post.isPending ? 'Posting…' : 'Post'}
            </Btn>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 20 }}>
        {comments.length === 0 ? (
          <p className="text--disabled" style={{ margin: 0, fontSize: '0.9375rem' }}>
            No comments yet.
          </p>
        ) : (
          comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 12 }}>
              <Avatar name={c.user?.name} size={34} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <Link to={`/u/${c.userId}`} style={{ fontWeight: 500, color: 'var(--v-text-base)' }}>
                    {c.user?.name ?? 'Unknown'}
                  </Link>
                  <span className="text--disabled" style={{ fontSize: '0.75rem' }}>
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text--secondary" style={{ margin: '2px 0 0', fontSize: '0.9375rem' }}>
                  {c.body}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const { user: me } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.projects.get(id!),
    enabled: !!id,
  })
  const { data: likeState } = useQuery({
    queryKey: ['like', id],
    queryFn: () => api.projects.likedByMe(id!),
    enabled: !!me && !!id,
  })

  const likeMutation = useMutation({
    mutationFn: () => api.projects.like(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['like', id] })
      qc.invalidateQueries({ queryKey: ['project', id] })
    },
  })
  const deleteMutation = useMutation({
    mutationFn: () => api.projects.delete(id!),
    onSuccess: () => navigate('/projects'),
  })
  const forkMutation = useMutation({
    mutationFn: () => api.projects.fork(id!),
    onSuccess: fork => navigate(`/projects/${fork.id}`),
  })
  const requestAccess = useMutation({ mutationFn: () => api.projects.requestAccess(id!) })

  usePageCrumbs([{ text: 'Projects', href: '/projects' }, { text: project?.title ?? 'Project' }])

  if (isLoading) return <Spinner />
  if (!project) return <EmptyState icon="mdi-file-remove-outline" title="Project not found." />

  const isOwner = me?.id === project.ownerId
  const isFaculty = me?.role === 'FACULTY'
  const liked = likeState?.liked

  const tabs: TabItem[] = [
    { value: 'overview', label: 'Overview', icon: 'mdi-text-box-outline' },
    { value: 'files', label: 'Files', icon: 'mdi-folder-outline', badge: project.files.length },
    { value: 'versions', label: 'Versions', icon: 'mdi-history' },
    { value: 'comments', label: 'Comments', icon: 'mdi-comment-outline', badge: project._count.comments },
    // Analytics and access requests are the owner's own instrumentation —
    // nobody else has anything to read on that tab.
    ...(isOwner ? [{ value: 'insights', label: 'Insights', icon: 'mdi-chart-line' }] : []),
  ]
  // A ?tab= naming a panel this viewer has no business seeing (or none at all)
  // falls back rather than rendering an empty page.
  const requested = params.get('tab') ?? ''
  const tab = tabs.some(t => t.value === requested) ? requested : 'overview'

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 900 }}>
      {editOpen && <EditProjectDialog projectId={id!} onClose={() => setEditOpen(false)} />}
      {inviteOpen && <InviteDialog projectId={id!} onClose={() => setInviteOpen(false)} />}
      {reportOpen && <ReportDialog projectId={id!} onClose={() => setReportOpen(false)} />}

      {/* Only the owner and accepted collaborators can still load a taken-down
          project — it is forced back to PRIVATE — so this banner is for them. */}
      {project.takenDownAt && (
        <Card style={{ padding: 20, marginBottom: 16, borderLeft: '4px solid var(--tone-error)' }}>
          <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="mdi-alert-octagon-outline" size={20} color="var(--tone-error)" />
            Taken down by a moderator
          </h2>
          <p className="text--secondary" style={{ margin: '8px 0 0', fontSize: '0.9375rem' }}>
            This project was reported and reviewed on {new Date(project.takenDownAt).toLocaleDateString()}. It is
            private to you now and its visibility cannot be changed. Nothing has been deleted — your files and
            history are intact. Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to appeal.
          </p>
        </Card>
      )}

      {/* Header */}
      <Card style={{ padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <h1 style={{ fontSize: '1.75rem' }}>{project.title}</h1>
            {project.forkedFromId && (
              <p className="text--disabled" style={{ fontSize: '0.8125rem', margin: '4px 0 0' }}>
                <Icon name="mdi-source-fork" size={14} /> Forked from{' '}
                <Link to={`/projects/${project.forkedFromId}`}>another project</Link>
              </p>
            )}
            <div
              className="text--secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: '0.9375rem', flexWrap: 'wrap' }}
            >
              <Link to={`/u/${project.ownerId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'inherit' }}>
                <Avatar name={project.owner?.name} size={26} />
                {project.owner?.name ?? 'Unknown'}
              </Link>
              <VisibilityChip visibility={project.visibility} />
              <span className="text--disabled" style={{ fontSize: '0.8125rem' }}>
                <Icon name="mdi-eye-outline" size={15} /> {project.viewCount} views
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isOwner && (
              <>
                <Btn variant="outlined" onClick={() => setEditOpen(true)}>
                  <Icon name="mdi-pencil-outline" size={18} />
                  Edit
                </Btn>
                <Btn
                  variant="outlined"
                  onClick={() => confirm('Delete this project?') && deleteMutation.mutate()}
                  style={{ color: 'var(--tone-error)', borderColor: 'var(--tone-error)' }}
                >
                  <Icon name="mdi-delete-outline" size={18} />
                  Delete
                </Btn>
              </>
            )}
            {me && !isOwner && (
              <Btn variant="outlined" onClick={() => forkMutation.mutate()} disabled={forkMutation.isPending}>
                <Icon name="mdi-source-fork" size={18} />
                {forkMutation.isPending ? 'Forking…' : 'Fork'}
              </Btn>
            )}
            {isFaculty && !isOwner && (
              <Btn
                variant="outlined"
                onClick={() => requestAccess.mutate()}
                disabled={requestAccess.isPending || requestAccess.isSuccess}
              >
                {requestAccess.isSuccess ? 'Requested ✓' : 'Request access'}
              </Btn>
            )}
            {/* A PRIVATE project has no audience beyond the owner and the
                collaborators who accepted, so there is nothing to report. */}
            {me && !isOwner && project.visibility !== 'PRIVATE' && (
              <Btn onClick={() => setReportOpen(true)} className="text--disabled" aria-label="Report this project">
                <Icon name="mdi-flag-outline" size={18} />
                Report
              </Btn>
            )}
          </div>
        </div>

        <Divider style={{ margin: '20px 0 16px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Btn
            variant="outlined"
            onClick={() => me && likeMutation.mutate()}
            disabled={!me || likeMutation.isPending}
            style={liked ? { color: 'var(--tone-red)', borderColor: 'var(--tone-red)' } : undefined}
          >
            <Icon name={liked ? 'mdi-heart' : 'mdi-heart-outline'} size={18} />
            {project._count.likes} {liked ? 'Liked' : 'Like'}
          </Btn>
          {!me && (
            <span className="text--disabled" style={{ fontSize: '0.8125rem' }}>
              <Link to="/session">Sign in</Link> to like, comment or fork.
            </span>
          )}
        </div>
      </Card>

      {/* One panel at a time. Everything below used to stack onto the page at
          once — analytics, versions, files, collaborators and comments — which
          buried the project itself under its own machinery. */}
      <div style={{ margin: '24px 0 16px' }}>
        <Tabs items={tabs} value={tab} onChange={t => setParams({ tab: t }, { replace: true })} />
      </div>

      {tab === 'overview' && (
        <OverviewPanel project={project} isOwner={isOwner} onInvite={() => setInviteOpen(true)} />
      )}
      {tab === 'files' && <FilesPanel projectId={id!} files={project.files} isOwner={isOwner} />}
      {tab === 'versions' && <VersionsPanel projectId={id!} isOwner={isOwner} />}
      {tab === 'comments' && <CommentsPanel projectId={id!} canPost={me} />}
      {tab === 'insights' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <AnalyticsPanel projectId={id!} />
          <AccessRequestsPanel projectId={id!} />
        </div>
      )}
    </div>
  )
}
