import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api, type ProjectSummary } from '../lib/api'

const surface = { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }

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

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link to={`/projects/${project.id}`}
      className="block rounded-xl p-4 no-underline transition-all"
      style={surface}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-white truncate">{project.title}</h3>
        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
          style={project.visibility === 'PUBLIC'
            ? { backgroundColor: '#0a3320', color: 'var(--color-success)' }
            : project.visibility === 'UOFT'
              ? { backgroundColor: '#0d1e3a', color: '#7db9ee' }
              : { backgroundColor: 'var(--color-surface-2)', color: '#666' }}>
          {project.visibility === 'UOFT' ? 'U of T' : project.visibility.charAt(0) + project.visibility.slice(1).toLowerCase()}
        </span>
      </div>
      {project.description && <p className="text-sm text-[#aaa] mt-1 line-clamp-2">{project.description}</p>}
      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {project.tags.map(tag => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full text-[#666]"
              style={{ backgroundColor: 'var(--color-surface-2)' }}>{tag}</span>
          ))}
        </div>
      )}
      <div className="flex gap-3 mt-2 text-xs text-[#555]">
        <span>♥ {project._count.likes}</span>
        <span>💬 {project._count.comments}</span>
      </div>
    </Link>
  )
}

function EditProfileModal({ onClose }: { onClose: () => void }) {
  const { user, refetch } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: user?.name ?? '',
    faculty: user?.faculty ?? '',
    program: user?.program ?? '',
    classYear: user?.classYear ? String(user.classYear) : '',
    bio: user?.bio ?? '',
  })

  const mutation = useMutation({
    mutationFn: () => api.users.updateMe({
      name: form.name,
      faculty: form.faculty || undefined,
      program: form.program || undefined,
      classYear: form.classYear ? Number(form.classYear) : undefined,
      bio: form.bio || undefined,
    }),
    onSuccess: () => {
      refetch()
      qc.invalidateQueries({ queryKey: ['profile', user?.id] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-xl w-full max-w-md p-6" style={surface}>
        <h2 className="font-medium text-white text-lg mb-4">Edit profile</h2>
        <div className="space-y-3">
          {[
            { label: 'Name', key: 'name', type: 'text' },
            { label: 'Faculty', key: 'faculty', type: 'text' },
            { label: 'Program', key: 'program', type: 'text' },
            { label: 'Class year', key: 'classYear', type: 'number' },
          ].map(({ label, key, type }) => (
            <label key={key} className="block">
              <span className="text-sm font-medium text-[#aaa]">{label}</span>
              <input type={type} value={form[key as keyof typeof form]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={inputStyle} />
            </label>
          ))}
          <label className="block">
            <span className="text-sm font-medium text-[#aaa]">Bio</span>
            <textarea value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              rows={3}
              style={{ ...inputStyle, resize: 'none' }} />
          </label>
        </div>
        <div className="flex gap-3 mt-5 justify-end">
          <button onClick={onClose} className="text-sm text-[#666] hover:text-[#aaa] px-4 py-2 cursor-pointer transition-colors">
            Cancel
          </button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="text-sm px-5 py-2 rounded-lg disabled:opacity-40 cursor-pointer transition-colors font-medium"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
        {mutation.isError && (
          <p className="text-red-400 text-sm mt-2">{(mutation.error as Error).message}</p>
        )}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', id],
    queryFn: () => api.users.get(id!),
    enabled: !!id,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['userProjects', id],
    queryFn: () => api.users.projects(id!),
    enabled: !!id,
  })

  const { data: followState } = useQuery({
    queryKey: ['follow', id],
    queryFn: () => api.users.followingMe(id!),
    enabled: !!me && me.id !== id,
  })

  const followMutation = useMutation({
    mutationFn: () => api.users.follow(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow', id] })
      qc.invalidateQueries({ queryKey: ['profile', id] })
    },
  })

  const isOwn = me?.id === id

  if (isLoading) return <div className="text-center py-16 text-[#555]">Loading…</div>
  if (!profile) return <div className="text-center py-16 text-[#555]">Profile not found.</div>

  return (
    <div className="max-w-3xl">
      {editOpen && <EditProfileModal onClose={() => setEditOpen(false)} />}

      {/* Profile header */}
      <div className="rounded-xl p-6 mb-6" style={surface}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
              style={{ backgroundColor: '#0d1e3a', color: '#7db9ee' }}>
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-medium text-white">{profile.name}</h1>
              <div className="text-sm text-[#666] mt-0.5 space-x-2">
                {profile.faculty && <span>{profile.faculty}</span>}
                {profile.program && <span>· {profile.program}</span>}
                {profile.classYear && <span>· Class of {profile.classYear}</span>}
              </div>
            </div>
          </div>

          {isOwn ? (
            <button onClick={() => setEditOpen(true)}
              className="text-sm px-4 py-1.5 rounded-lg cursor-pointer transition-colors text-[#aaa] hover:text-white"
              style={{ border: '1px solid var(--color-border)' }}>
              Edit profile
            </button>
          ) : me && (
            <button onClick={() => followMutation.mutate()} disabled={followMutation.isPending}
              className="text-sm px-4 py-1.5 rounded-lg cursor-pointer transition-colors font-medium"
              style={followState?.following
                ? { border: '1px solid var(--color-border)', color: '#aaa' }
                : { backgroundColor: 'var(--color-primary)', color: '#fff' }}>
              {followState?.following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        {profile.bio && <p className="mt-4 text-[#aaa] text-sm">{profile.bio}</p>}

        <div className="flex gap-6 mt-4 text-sm text-[#555]">
          <span><strong className="text-white">{profile._count.ownedProjects}</strong> projects</span>
          <span><strong className="text-white">{profile._count.followers}</strong> followers</span>
          <span><strong className="text-white">{profile._count.following}</strong> following</span>
        </div>
      </div>

      <h2 className="font-medium text-white mb-3">Projects</h2>
      {projects.length === 0 ? (
        <p className="text-[#555] text-sm">
          {isOwn ? (
            <>No projects yet. <Link to="/projects/new" className="hover:underline"
              style={{ color: 'var(--color-primary)' }}>Share your first one →</Link></>
          ) : 'No public projects yet.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map(p => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  )
}
