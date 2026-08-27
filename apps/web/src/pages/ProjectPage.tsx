import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api } from '../lib/api'
import { VisibilityChip } from '../components/ProjectCard'
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
          <p style={{ color: 'var(--v-success-base)', margin: 0 }}>
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
                  style={{ color: 'var(--v-error-base)', borderColor: 'var(--v-error-base)' }}
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
            {project.links.map(link => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.9375rem' }}
              >
                <Icon name="mdi-open-in-new" size={16} />
                {link.label}
              </a>
            ))}
          </div>
        )}

        <Divider style={{ margin: '20px 0 16px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Btn
            variant="outlined"
            onClick={() => me && likeMutation.mutate()}
            disabled={!me || likeMutation.isPending}
            style={liked ? { color: 'var(--v-red-base)', borderColor: 'var(--v-red-base)' } : undefined}
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
      <VersionsPanel projectId={id!} isOwner={isOwner} />

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
