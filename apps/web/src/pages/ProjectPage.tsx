import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api, safeUrl, type ProjectFile } from '../lib/api'
import { REPORT_REASONS } from '../lib/moderation'
import type { ReportReason } from '@uofthub/types'
import { VisibilityChip } from '../components/ProjectCard'
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
  TextArea,
  TextField,
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
  if (!data) return null

  const max = Math.max(...data.dailyViews.map(d => d.count), 1)
  const stats = [
    { label: 'Total views', value: data.totalViews, icon: 'mdi-eye-outline' },
    { label: 'Likes', value: data.likes, icon: 'mdi-heart-outline' },
    { label: 'Comments', value: data.comments, icon: 'mdi-comment-outline' },
    { label: 'Forks', value: data.forks, icon: 'mdi-source-fork' },
  ]

  return (
    <Card style={{ padding: 24, marginTop: 16 }}>
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
    <Card style={{ padding: 24, marginTop: 16 }}>
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

  if (!isOwner && versions.length === 0) return null

  return (
    <Card style={{ padding: 24, marginTop: 16 }}>
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
        <p className="text--disabled" style={{ margin: 0, fontSize: '0.9375rem' }}>
          No versions saved yet.
        </p>
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

function FilesPanel({ projectId, files, isOwner }: { projectId: string; files: ProjectFile[]; isOwner: boolean }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

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

  if (!isOwner && files.length === 0) return null

  return (
    <Card style={{ padding: 24, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
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
        <p className="text--disabled" style={{ margin: 0, fontSize: '0.9375rem' }}>
          No files uploaded yet.
        </p>
      ) : (
        <ul className="v-list" style={{ display: 'grid', gap: 10 }}>
          {files.map(f => (
            <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.9375rem' }}>
              <Icon name="mdi-file-outline" size={18} color="var(--v-accent-base)" />
              <a href={api.projects.downloadUrl(projectId, f.id)} className="overflow-ellipsis" style={{ flex: 1, minWidth: 0 }}>
                {f.name}
              </a>
              <span className="text--disabled" style={{ fontSize: '0.75rem' }}>
                {(f.sizeBytes / (1024 * 1024)).toFixed(1)}MB
              </span>
              {isOwner && (
                <Btn icon size="small" onClick={() => remove.mutate(f.id)} aria-label={`Delete ${f.name}`}>
                  <Icon name="mdi-delete-outline" size={16} />
                </Btn>
              )}
            </li>
          ))}
        </ul>
      )}
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
  const [editOpen, setEditOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [comment, setComment] = useState('')

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.projects.get(id!),
    enabled: !!id,
  })
  const { data: comments = [] } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => api.projects.comments(id!),
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
  const commentMutation = useMutation({
    mutationFn: () => api.projects.addComment(id!, comment),
    onSuccess: () => {
      setComment('')
      qc.invalidateQueries({ queryKey: ['comments', id] })
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

        {project.description && (
          <p style={{ marginTop: 20, whiteSpace: 'pre-wrap' }}>{project.description}</p>
        )}

        {project.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
            {project.tags.map(tag => (
              <Link key={tag} to={`/courses/${encodeURIComponent(tag)}`}>
                <Chip small color="blue" clickable>
                  {tag}
                </Chip>
              </Link>
            ))}
          </div>
        )}

        {project.links.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
            {project.links.map(link => {
              // Drop anything that is not http(s) rather than rendering the href.
              const href = safeUrl(link.url)
              if (!href) return null
              return (
                <a
                  key={link.id}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.9375rem' }}
                >
                  <Icon name="mdi-open-in-new" size={16} />
                  {link.label}
                </a>
              )
            })}
          </div>
        )}

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

      {isOwner && <AnalyticsPanel projectId={id!} />}
      {isOwner && <AccessRequestsPanel projectId={id!} />}
      <VersionsPanel projectId={id!} isOwner={isOwner} />
      <FilesPanel projectId={id!} files={project.files} isOwner={isOwner} />

      {/* Collaborators */}
      {(project.collaborators.length > 0 || isOwner) && (
        <Card style={{ padding: 24, marginTop: 16 }}>
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
            <Btn onClick={() => setInviteOpen(true)} style={{ color: 'var(--v-accent-base)', marginTop: 12, paddingLeft: 0 }}>
              <Icon name="mdi-account-plus-outline" size={18} />
              Invite collaborator
            </Btn>
          )}
        </Card>
      )}

      {/* Comments */}
      <Card style={{ padding: 24, marginTop: 16 }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: 20 }}>Comments ({project._count.comments})</h2>

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

        {me && (
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <Avatar name={me.name} img={me.avatarUrl} size={34} />
            <div style={{ flex: 1 }}>
              <TextArea
                rows={2}
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Leave a comment…"
              />
              <Btn
                variant="accent"
                size="small"
                onClick={() => commentMutation.mutate()}
                disabled={!comment.trim() || commentMutation.isPending}
                style={{ marginTop: 10 }}
              >
                {commentMutation.isPending ? 'Posting…' : 'Post'}
              </Btn>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
