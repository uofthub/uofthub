import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

const surface: React.CSSProperties = { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }
const surfaceAlt: React.CSSProperties = { backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  color: '#fff',
  borderRadius: '0.5rem',
  padding: '8px 12px',
  fontSize: '0.875rem',
  outline: 'none',
  marginTop: '4px',
}

function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-xl w-full max-w-lg p-6" style={surface}>{children}</div>
    </div>
  )
}

function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-sm px-5 py-2 rounded-lg disabled:opacity-40 cursor-pointer transition-colors font-medium"
      style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
      {children}
    </button>
  )
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="text-sm px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-[#aaa] hover:text-white"
      style={{ border: '1px solid var(--color-border)' }}>
      {children}
    </button>
  )
}

function EditProjectModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: project } = useQuery({ queryKey: ['project', projectId], queryFn: () => api.projects.get(projectId) })
  const [form, setForm] = useState({
    title: project?.title ?? '',
    description: project?.description ?? '',
    tags: project?.tags.join(', ') ?? '',
    visibility: project?.visibility ?? 'PRIVATE',
  })

  const mutation = useMutation({
    mutationFn: () => api.projects.update(projectId, {
      title: form.title,
      description: form.description,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      visibility: form.visibility,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project', projectId] }); onClose() },
  })

  return (
    <ModalShell>
      <h2 className="font-medium text-white text-lg mb-4">Edit project</h2>
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-[#aaa]">Title</span>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[#aaa]">Description</span>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={4} style={{ ...inputStyle, resize: 'none' }} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[#aaa]">Tags (comma-separated)</span>
          <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} style={inputStyle} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[#aaa]">Visibility</span>
          <select value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="PRIVATE">Private</option>
            <option value="UOFT">U of T only</option>
            <option value="PUBLIC">Public</option>
          </select>
        </label>
      </div>
      <div className="flex gap-3 mt-5 justify-end">
        <button onClick={onClose} className="text-sm text-[#666] hover:text-[#aaa] px-4 py-2 cursor-pointer transition-colors">Cancel</button>
        <PrimaryBtn onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </PrimaryBtn>
      </div>
      {mutation.isError && <p className="text-red-400 text-sm mt-2">{(mutation.error as Error).message}</p>}
    </ModalShell>
  )
}

function InviteModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [success, setSuccess] = useState(false)
  const mutation = useMutation({
    mutationFn: () => api.projects.inviteCollaborator(projectId, email),
    onSuccess: () => setSuccess(true),
  })
  return (
    <ModalShell>
      <h2 className="font-medium text-white text-lg mb-4">Invite collaborator</h2>
      {success ? (
        <div>
          <p className="text-sm" style={{ color: 'var(--color-success)' }}>Invitation sent!</p>
          <button onClick={onClose} className="mt-4 text-sm text-[#666] hover:text-[#aaa] cursor-pointer transition-colors">Close</button>
        </div>
      ) : (
        <>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="student@mail.utoronto.ca" style={inputStyle} />
          <div className="flex gap-3 mt-4 justify-end">
            <button onClick={onClose} className="text-sm text-[#666] hover:text-[#aaa] px-4 py-2 cursor-pointer transition-colors">Cancel</button>
            <PrimaryBtn onClick={() => mutation.mutate()} disabled={mutation.isPending || !email}>
              {mutation.isPending ? 'Inviting…' : 'Invite'}
            </PrimaryBtn>
          </div>
          {mutation.isError && <p className="text-red-400 text-sm mt-2">{(mutation.error as Error).message}</p>}
        </>
      )}
    </ModalShell>
  )
}

function AnalyticsPanel({ projectId }: { projectId: string }) {
  const { data } = useQuery({
    queryKey: ['analytics', projectId],
    queryFn: () => api.projects.analytics(projectId),
  })
  if (!data) return <div className="text-sm text-[#555]">Loading analytics…</div>

  const maxCount = Math.max(...data.dailyViews.map(d => d.count), 1)

  return (
    <div className="rounded-xl p-5 mb-4" style={surface}>
      <h2 className="font-medium text-white mb-4">Analytics</h2>
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total views', value: data.totalViews },
          { label: 'Likes', value: data.likes },
          { label: 'Comments', value: data.comments },
          { label: 'Forks', value: data.forks },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-2xl font-medium" style={{ color: 'var(--color-primary)' }}>{value}</div>
            <div className="text-xs text-[#555] mt-0.5">{label}</div>
          </div>
        ))}
      </div>
      {data.dailyViews.length > 0 && (
        <div>
          <p className="text-xs text-[#555] mb-2">Views — last 30 days</p>
          <div className="flex items-end gap-0.5 h-16">
            {data.dailyViews.map(d => (
              <div key={d.date} title={`${new Date(d.date).toLocaleDateString()}: ${d.count}`}
                className="flex-1 rounded-sm transition-colors"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  opacity: 0.4 + (d.count / maxCount) * 0.6,
                  height: `${(d.count / maxCount) * 100}%`,
                  minHeight: '2px',
                }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function VersionsPanel({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const qc = useQueryClient()
  const { data: versions = [] } = useQuery({
    queryKey: ['versions', projectId],
    queryFn: () => api.projects.versions(projectId),
  })

  const createMutation = useMutation({
    mutationFn: () => api.projects.createVersion(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['versions', projectId] }),
  })

  if (!isOwner && versions.length === 0) return null

  return (
    <div className="rounded-xl p-5 mb-4" style={surface}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-white">Version history</h2>
        {isOwner && (
          <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
            className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-40 cursor-pointer transition-colors"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
            {createMutation.isPending ? 'Saving…' : '+ Save version'}
          </button>
        )}
      </div>
      {versions.length === 0 ? (
        <p className="text-sm text-[#555]">No versions saved yet.</p>
      ) : (
        <ul className="space-y-2">
          {versions.map(v => (
            <li key={v.id} className="flex items-start gap-3 text-sm">
              <span className="shrink-0 font-mono font-semibold w-8" style={{ color: 'var(--color-primary)' }}>v{v.versionNum}</span>
              <div className="min-w-0">
                <span className="text-white font-medium">{v.title}</span>
                {v.description && <p className="text-[#666] text-xs mt-0.5 truncate">{v.description}</p>}
              </div>
              <span className="shrink-0 text-[#555] text-xs ml-auto">{new Date(v.createdAt).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

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
    onSuccess: () => navigate('/'),
  })

  const forkMutation = useMutation({
    mutationFn: () => api.projects.fork(id!),
    onSuccess: (fork) => navigate(`/projects/${fork.id}`),
  })

  const requestAccessMutation = useMutation({
    mutationFn: () => api.projects.requestAccess(id!),
  })

  if (isLoading) return <div className="text-center py-16 text-[#555]">Loading…</div>
  if (!project) return <div className="text-center py-16 text-[#555]">Project not found.</div>

  const isOwner = me?.id === project.ownerId
  const isFaculty = me?.role === 'FACULTY'

  const visChip = project.visibility === 'PUBLIC'
    ? { backgroundColor: '#0a3320', color: 'var(--color-success)' }
    : project.visibility === 'UOFT'
      ? { backgroundColor: '#0d1e3a', color: '#7db9ee' }
      : { backgroundColor: 'var(--color-surface-2)', color: '#666' }

  return (
    <div className="max-w-3xl">
      {editOpen && <EditProjectModal projectId={id!} onClose={() => setEditOpen(false)} />}
      {inviteOpen && <InviteModal projectId={id!} onClose={() => setInviteOpen(false)} />}

      {/* Header */}
      <div className="rounded-xl p-6 mb-4" style={surface}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-medium text-white">{project.title}</h1>
            {project.forkedFromId && (
              <p className="text-xs text-[#555] mt-0.5">
                Forked from{' '}
                <Link to={`/projects/${project.forkedFromId}`}
                  className="hover:underline" style={{ color: 'var(--color-primary)' }}>
                  another project
                </Link>
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5 text-sm text-[#666]">
              <Link to={`/u/${project.ownerId}`}
                className="hover:text-white no-underline transition-colors">
                {project.owner?.name ?? 'Unknown'}
              </Link>
              <span>·</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={visChip}>
                {project.visibility === 'UOFT' ? 'U of T only' : project.visibility.charAt(0) + project.visibility.slice(1).toLowerCase()}
              </span>
              <span>· {project.viewCount} views</span>
            </div>
          </div>

          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
            {isOwner && (
              <>
                <GhostBtn onClick={() => setEditOpen(true)}>Edit</GhostBtn>
                <button onClick={() => { if (confirm('Delete this project?')) deleteMutation.mutate() }}
                  className="text-sm px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-red-400 hover:text-red-300"
                  style={{ border: '1px solid #3a1515' }}>
                  Delete
                </button>
              </>
            )}
            {me && !isOwner && (
              <GhostBtn onClick={() => forkMutation.mutate()}>
                {forkMutation.isPending ? 'Forking…' : '⑂ Fork'}
              </GhostBtn>
            )}
            {isFaculty && !isOwner && (
              <button onClick={() => requestAccessMutation.mutate()}
                disabled={requestAccessMutation.isPending || requestAccessMutation.isSuccess}
                className="text-sm px-3 py-1.5 rounded-lg cursor-pointer transition-colors disabled:opacity-40"
                style={{ border: '1px solid #0d2a4a', color: '#7db9ee' }}>
                {requestAccessMutation.isSuccess ? 'Requested ✓' : 'Request access'}
              </button>
            )}
          </div>
        </div>

        {project.description && <p className="mt-4 text-[#aaa]">{project.description}</p>}

        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {project.tags.map(tag => (
              <Link key={tag} to={`/courses/${encodeURIComponent(tag)}`}
                className="text-xs px-2 py-0.5 rounded-full no-underline transition-colors text-[#aaa] hover:text-white"
                style={{ backgroundColor: 'var(--color-surface-2)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#333')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-surface-2)')}>
                {tag}
              </Link>
            ))}
          </div>
        )}

        {project.links.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-4">
            {project.links.map(link => (
              <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                className="text-sm hover:underline flex items-center gap-1 no-underline"
                style={{ color: 'var(--color-primary)' }}>
                ↗ {link.label}
              </a>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 mt-5">
          <button onClick={() => me && likeMutation.mutate()} disabled={!me || likeMutation.isPending}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-40"
            style={likeState?.liked
              ? { backgroundColor: '#3a0a15', border: '1px solid #5a1525', color: '#d25276' }
              : { border: '1px solid var(--color-border)', color: '#aaa' }}>
            ♥ {project._count.likes} {likeState?.liked ? 'Liked' : 'Like'}
          </button>
          {!me && <span className="text-xs text-[#555]">Sign in to like, comment, or fork</span>}
        </div>
      </div>

      {isOwner && <AnalyticsPanel projectId={id!} />}
      <VersionsPanel projectId={id!} isOwner={isOwner} />

      {/* Collaborators */}
      {(project.collaborators.length > 0 || isOwner) && (
        <div className="rounded-xl p-5 mb-4" style={surface}>
          <h2 className="font-medium text-sm text-[#aaa] mb-3">Collaborators</h2>
          <div className="flex flex-wrap gap-3">
            {project.collaborators.map(c => (
              <Link key={c.user.id} to={`/u/${c.user.id}`}
                className="flex items-center gap-2 text-sm text-[#aaa] hover:text-white no-underline transition-colors">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: '#0d1e3a', color: '#7db9ee' }}>
                  {c.user.name.charAt(0).toUpperCase()}
                </div>
                {c.user.name}
              </Link>
            ))}
          </div>
          {isOwner && (
            <button onClick={() => setInviteOpen(true)}
              className="mt-3 text-sm cursor-pointer hover:underline transition-colors"
              style={{ color: 'var(--color-primary)' }}>
              + Invite collaborator
            </button>
          )}
        </div>
      )}

      {/* Comments */}
      <div className="rounded-xl p-5" style={surface}>
        <h2 className="font-medium text-white mb-4">Comments ({project._count.comments})</h2>
        <div className="space-y-4 mb-6">
          {comments.length === 0 ? (
            <p className="text-sm text-[#555]">No comments yet.</p>
          ) : comments.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ backgroundColor: '#0d1e3a', color: '#7db9ee' }}>
                {c.user?.name?.charAt(0).toUpperCase() ?? '?'}
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <Link to={`/u/${c.userId}`}
                    className="text-sm font-medium text-white hover:text-[var(--color-primary)] no-underline transition-colors">
                    {c.user?.name ?? 'Unknown'}
                  </Link>
                  <span className="text-xs text-[#555]">{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-[#aaa] mt-0.5">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
        {me && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ backgroundColor: '#0d1e3a', color: '#7db9ee' }}>
              {me.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Leave a comment…" rows={2}
                style={{ ...inputStyle, resize: 'none' }} />
              <button onClick={() => commentMutation.mutate()} disabled={!comment.trim() || commentMutation.isPending}
                className="mt-2 text-sm px-4 py-1.5 rounded-lg disabled:opacity-40 cursor-pointer transition-colors"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                {commentMutation.isPending ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
