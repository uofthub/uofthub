import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

type OrgDetail = {
  id: string
  slug: string
  name: string
  type: 'CLUB' | 'LAB'
  description?: string
  websiteUrl?: string
  members: { orgId: string; userId: string; role: string; user: { id: string; name: string; avatarUrl?: string; faculty?: string } }[]
  projects: { orgId: string; projectId: string; project: { id: string; title: string; description?: string; owner: { id: string; name: string }; _count: { likes: number; comments: number } } }[]
}

export default function OrgPage() {
  const { slug } = useParams<{ slug: string }>()
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [addMemberEmail, setAddMemberEmail] = useState('')
  const [showAddMember, setShowAddMember] = useState(false)

  const { data: org, isLoading } = useQuery({
    queryKey: ['org', slug],
    queryFn: () => api.orgs.get(slug!) as Promise<OrgDetail>,
    enabled: !!slug,
  })

  const addMemberMutation = useMutation({
    mutationFn: () => api.orgs.addMember(slug!, addMemberEmail),
    onSuccess: () => {
      setAddMemberEmail('')
      setShowAddMember(false)
      qc.invalidateQueries({ queryKey: ['org', slug] })
    },
  })

  if (isLoading) return <div className="text-center py-16 text-gray-400">Loading…</div>
  if (!org) return <div className="text-center py-16 text-gray-400">Organization not found.</div>

  const myMembership = org.members.find(m => m.userId === me?.id)
  const isAdmin = myMembership?.role === 'ADMIN'

  return (
    <div className="max-w-3xl">
      <Link to="/" className="text-sm text-gray-400 hover:text-gray-700">← Home</Link>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mt-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                org.type === 'LAB' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {org.type === 'LAB' ? 'Research Lab' : 'Club'}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
            {org.description && <p className="text-gray-600 mt-2 text-sm">{org.description}</p>}
            {org.websiteUrl && (
              <a href={org.websiteUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-blue-700 hover:underline mt-2 inline-block">
                ↗ {org.websiteUrl}
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-6 mt-4 text-sm text-gray-500">
          <span><strong className="text-gray-900">{org.members.length}</strong> members</span>
          <span><strong className="text-gray-900">{org.projects.length}</strong> projects</span>
        </div>
      </div>

      {/* Members */}
      <h2 className="font-semibold text-gray-900 mb-3">Members</h2>
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="space-y-3">
          {org.members.map(m => (
            <div key={m.userId} className="flex items-center justify-between gap-3">
              <Link to={`/u/${m.userId}`} className="flex items-center gap-3 hover:text-blue-900">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-900">
                  {m.user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{m.user.name}</div>
                  {m.user.faculty && <div className="text-xs text-gray-400">{m.user.faculty}</div>}
                </div>
              </Link>
              <span className="text-xs text-gray-400 capitalize">{m.role.toLowerCase()}</span>
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            {showAddMember ? (
              <div className="flex gap-2">
                <input type="email" value={addMemberEmail} onChange={e => setAddMemberEmail(e.target.value)}
                  placeholder="student@mail.utoronto.ca"
                  className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <button onClick={() => addMemberMutation.mutate()} disabled={!addMemberEmail || addMemberMutation.isPending}
                  className="bg-blue-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors">
                  {addMemberMutation.isPending ? 'Adding…' : 'Add'}
                </button>
                <button onClick={() => setShowAddMember(false)} className="text-sm text-gray-400 hover:text-gray-700 px-2">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowAddMember(true)} className="text-sm text-blue-700 hover:underline">+ Add member</button>
            )}
          </div>
        )}
      </div>

      {/* Projects */}
      <h2 className="font-semibold text-gray-900 mb-3">Projects</h2>
      {org.projects.length === 0 ? (
        <p className="text-gray-400 text-sm">No projects linked yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {org.projects.map(({ project }) => (
            <Link key={project.id} to={`/projects/${project.id}`}
              className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all">
              <h3 className="font-medium text-gray-900 truncate">{project.title}</h3>
              {project.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>}
              <div className="text-xs text-gray-400 mt-2">{project.owner.name}</div>
              <div className="flex gap-3 mt-2 text-xs text-gray-400">
                <span>♥ {project._count.likes}</span>
                <span>💬 {project._count.comments}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
