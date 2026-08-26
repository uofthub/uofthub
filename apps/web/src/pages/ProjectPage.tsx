import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-xl">
        <h2 className="font-semibold text-lg mb-4">Edit project</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Title</span>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Description</span>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Tags (comma-separated)</span>
            <input
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="React, Machine Learning, …"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Visibility</span>
            <select
              value={form.visibility}
              onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            >
              <option value="PRIVATE">Private</option>
              <option value="UOFT">U of T only</option>
              <option value="PUBLIC">Public</option>
            </select>
          </label>
        </div>
        <div className="flex gap-3 mt-5 justify-end">
          <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-blue-900 text-white text-sm px-5 py-2 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
        {mutation.isError && <p className="text-red-500 text-sm mt-2">{(mutation.error as Error).message}</p>}
      </div>
    </div>
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-xl">
        <h2 className="font-semibold text-lg mb-4">Invite collaborator</h2>
        {success ? (
          <div>
            <p className="text-green-600 text-sm">Invitation sent!</p>
            <button onClick={onClose} className="mt-4 text-sm text-gray-600 hover:text-gray-900">Close</button>
          </div>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="student@mail.utoronto.ca"
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2">Cancel</button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !email}
                className="bg-blue-900 text-white text-sm px-5 py-2 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {mutation.isPending ? 'Inviting…' : 'Invite'}
              </button>
            </div>
            {mutation.isError && <p className="text-red-500 text-sm mt-2">{(mutation.error as Error).message}</p>}
          </>
        )}
      </div>
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

  if (isLoading) return <div className="text-center py-16 text-gray-400">Loading…</div>
  if (!project) return <div className="text-center py-16 text-gray-400">Project not found.</div>

  const isOwner = me?.id === project.ownerId

  return (
    <div className="max-w-3xl">
      {editOpen && <EditProjectModal projectId={id!} onClose={() => setEditOpen(false)} />}
      {inviteOpen && <InviteModal projectId={id!} onClose={() => setInviteOpen(false)} />}

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
              <Link to={`/u/${project.ownerId}`} className="hover:text-blue-900">
                {project.owner?.name ?? 'Unknown'}
              </Link>
              <span>·</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                project.visibility === 'PUBLIC' ? 'bg-green-100 text-green-700' :
                project.visibility === 'UOFT' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {project.visibility === 'UOFT' ? 'U of T only' : project.visibility.charAt(0) + project.visibility.slice(1).toLowerCase()}
              </span>
              <span>· {project.viewCount} views</span>
            </div>
          </div>

          {isOwner && (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setEditOpen(true)}
                className="text-sm border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm('Delete this project?')) deleteMutation.mutate()
                }}
                className="text-sm border border-red-200 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {project.description && (
          <p className="mt-4 text-gray-700">{project.description}</p>
        )}

        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {project.tags.map(tag => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        )}

        {/* Links */}
        {project.links.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-4">
            {project.links.map(link => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-700 hover:underline flex items-center gap-1"
              >
                ↗ {link.label}
              </a>
            ))}
          </div>
        )}

        {/* Like button */}
        <div className="flex items-center gap-4 mt-5">
          <button
            onClick={() => me && likeMutation.mutate()}
            disabled={!me || likeMutation.isPending}
            className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-md border transition-colors ${
              likeState?.liked
                ? 'bg-red-50 border-red-200 text-red-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            } disabled:opacity-50`}
          >
            ♥ {project._count.likes} {likeState?.liked ? 'Liked' : 'Like'}
          </button>
          {!me && <span className="text-xs text-gray-400">Sign in to like or comment</span>}
        </div>
      </div>

      {/* Collaborators */}
      {project.collaborators.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <h2 className="font-semibold text-sm text-gray-700 mb-3">Collaborators</h2>
          <div className="flex flex-wrap gap-3">
            {project.collaborators.map(c => (
              <Link key={c.user.id} to={`/u/${c.user.id}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-900">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-900">
                  {c.user.name.charAt(0).toUpperCase()}
                </div>
                {c.user.name}
              </Link>
            ))}
          </div>
          {isOwner && (
            <button
              onClick={() => setInviteOpen(true)}
              className="mt-3 text-sm text-blue-700 hover:underline"
            >
              + Invite collaborator
            </button>
          )}
        </div>
      )}

      {isOwner && project.collaborators.length === 0 && (
        <div className="mb-4">
          <button onClick={() => setInviteOpen(true)} className="text-sm text-blue-700 hover:underline">
            + Invite collaborator
          </button>
        </div>
      )}

      {/* Comments */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-4">
          Comments ({project._count.comments})
        </h2>

        <div className="space-y-4 mb-6">
          {comments.length === 0 ? (
            <p className="text-sm text-gray-400">No comments yet.</p>
          ) : comments.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-900 shrink-0">
                {c.user?.name?.charAt(0).toUpperCase() ?? '?'}
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <Link to={`/u/${c.userId}`} className="text-sm font-medium text-gray-900 hover:text-blue-900">
                    {c.user?.name ?? 'Unknown'}
                  </Link>
                  <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-gray-700 mt-0.5">{c.body}</p>
              </div>
            </div>
          ))}
        </div>

        {me && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-900 shrink-0">
              {me.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Leave a comment…"
                rows={2}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
              <button
                onClick={() => commentMutation.mutate()}
                disabled={!comment.trim() || commentMutation.isPending}
                className="mt-2 bg-blue-900 text-white text-sm px-4 py-1.5 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {commentMutation.isPending ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
