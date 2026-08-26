import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api, type ProjectSummary } from '../lib/api'

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-gray-900 truncate">{project.title}</h3>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
          project.visibility === 'PUBLIC' ? 'bg-green-100 text-green-700' :
          project.visibility === 'UOFT' ? 'bg-blue-100 text-blue-700' :
          'bg-gray-100 text-gray-600'
        }`}>
          {project.visibility === 'UOFT' ? 'U of T' : project.visibility.charAt(0) + project.visibility.slice(1).toLowerCase()}
        </span>
      </div>
      {project.description && (
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
      )}
      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {project.tags.map(tag => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{tag}</span>
          ))}
        </div>
      )}
      <div className="flex gap-3 mt-2 text-xs text-gray-400">
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
        <h2 className="font-semibold text-lg mb-4">Edit profile</h2>
        <div className="space-y-3">
          {[
            { label: 'Name', key: 'name', type: 'text' },
            { label: 'Faculty', key: 'faculty', type: 'text' },
            { label: 'Program', key: 'program', type: 'text' },
            { label: 'Class year', key: 'classYear', type: 'number' },
          ].map(({ label, key, type }) => (
            <label key={key} className="block">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <input
                type={type}
                value={form[key as keyof typeof form]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </label>
          ))}
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Bio</span>
            <textarea
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              rows={3}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </label>
        </div>
        <div className="flex gap-3 mt-5 justify-end">
          <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-blue-900 text-white text-sm px-5 py-2 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
        {mutation.isError && (
          <p className="text-red-500 text-sm mt-2">{(mutation.error as Error).message}</p>
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

  if (isLoading) return <div className="text-center py-16 text-gray-400">Loading…</div>
  if (!profile) return <div className="text-center py-16 text-gray-400">Profile not found.</div>

  return (
    <div className="max-w-3xl">
      {editOpen && <EditProfileModal onClose={() => setEditOpen(false)} />}

      {/* Profile header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-900">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{profile.name}</h1>
              <div className="text-sm text-gray-500 mt-0.5 space-x-2">
                {profile.faculty && <span>{profile.faculty}</span>}
                {profile.program && <span>· {profile.program}</span>}
                {profile.classYear && <span>· Class of {profile.classYear}</span>}
              </div>
            </div>
          </div>

          {isOwn ? (
            <button
              onClick={() => setEditOpen(true)}
              className="text-sm border border-gray-300 px-4 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            >
              Edit profile
            </button>
          ) : me && (
            <button
              onClick={() => followMutation.mutate()}
              disabled={followMutation.isPending}
              className={`text-sm px-4 py-1.5 rounded-md transition-colors font-medium ${
                followState?.following
                  ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  : 'bg-blue-900 text-white hover:bg-blue-800'
              }`}
            >
              {followState?.following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        {profile.bio && <p className="mt-4 text-gray-700 text-sm">{profile.bio}</p>}

        <div className="flex gap-6 mt-4 text-sm text-gray-500">
          <span><strong className="text-gray-900">{profile._count.ownedProjects}</strong> projects</span>
          <span><strong className="text-gray-900">{profile._count.followers}</strong> followers</span>
          <span><strong className="text-gray-900">{profile._count.following}</strong> following</span>
        </div>
      </div>

      {/* Projects */}
      <h2 className="font-semibold text-gray-900 mb-3">Projects</h2>
      {projects.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {isOwn ? (
            <>No projects yet. <Link to="/projects/new" className="text-blue-600 hover:underline">Share your first one →</Link></>
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
