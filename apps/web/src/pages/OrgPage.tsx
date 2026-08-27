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

const surface = { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  color: '#fff',
  borderRadius: '0.5rem',
  padding: '6px 12px',
  fontSize: '0.875rem',
  outline: 'none',
  width: '100%',
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

  if (isLoading) return <div className="text-center py-16 text-[#555]">Loading…</div>
  if (!org) return <div className="text-center py-16 text-[#555]">Organization not found.</div>

  const myMembership = org.members.find(m => m.userId === me?.id)
  const isAdmin = myMembership?.role === 'ADMIN'

  const typeChip = org.type === 'LAB'
    ? { backgroundColor: '#1e0a3a', color: '#bd93e8' }
    : { backgroundColor: '#0d1e3a', color: '#7db9ee' }

  return (
    <div className="max-w-3xl">
      <Link to="/" className="text-sm text-[#666] hover:text-[#aaa] no-underline transition-colors">← Home</Link>

      {/* Header */}
      <div className="rounded-xl p-6 mt-4 mb-6" style={surface}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={typeChip}>
              {org.type === 'LAB' ? 'Research Lab' : 'Club'}
            </span>
            <h1 className="text-2xl font-medium text-white mt-2">{org.name}</h1>
            {org.description && <p className="text-[#aaa] mt-2 text-sm">{org.description}</p>}
            {org.websiteUrl && (
              <a href={org.websiteUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm mt-2 inline-block transition-colors"
                style={{ color: 'var(--color-primary)' }}>
                ↗ {org.websiteUrl}
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-6 mt-4 text-sm text-[#555]">
          <span><strong className="text-white">{org.members.length}</strong> members</span>
          <span><strong className="text-white">{org.projects.length}</strong> projects</span>
        </div>
      </div>

      {/* Members */}
      <h2 className="font-medium text-white mb-3">Members</h2>
      <div className="rounded-xl p-5 mb-6" style={surface}>
        <div className="space-y-3">
          {org.members.map(m => (
            <div key={m.userId} className="flex items-center justify-between gap-3">
              <Link to={`/u/${m.userId}`} className="flex items-center gap-3 no-underline group">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: '#0d1e3a', color: '#7db9ee' }}>
                  {m.user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-[var(--color-primary)] transition-colors">{m.user.name}</div>
                  {m.user.faculty && <div className="text-xs text-[#555]">{m.user.faculty}</div>}
                </div>
              </Link>
              <span className="text-xs text-[#555] capitalize">{m.role.toLowerCase()}</span>
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
            {showAddMember ? (
              <div className="flex gap-2">
                <input type="email" value={addMemberEmail}
                  onChange={e => setAddMemberEmail(e.target.value)}
                  placeholder="student@mail.utoronto.ca"
                  style={inputStyle} />
                <button onClick={() => addMemberMutation.mutate()}
                  disabled={!addMemberEmail || addMemberMutation.isPending}
                  className="text-sm px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap transition-colors"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                  {addMemberMutation.isPending ? 'Adding…' : 'Add'}
                </button>
                <button onClick={() => setShowAddMember(false)}
                  className="text-sm text-[#666] hover:text-[#aaa] px-2 cursor-pointer transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAddMember(true)}
                className="text-sm cursor-pointer transition-colors"
                style={{ color: 'var(--color-primary)' }}>
                + Add member
              </button>
            )}
          </div>
        )}
      </div>

      {/* Projects */}
      <h2 className="font-medium text-white mb-3">Projects</h2>
      {org.projects.length === 0 ? (
        <p className="text-[#555] text-sm">No projects linked yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {org.projects.map(({ project }) => (
            <Link key={project.id} to={`/projects/${project.id}`}
              className="block rounded-xl p-4 no-underline transition-all"
              style={surface}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
              <h3 className="font-medium text-white truncate">{project.title}</h3>
              {project.description && <p className="text-sm text-[#aaa] mt-1 line-clamp-2">{project.description}</p>}
              <div className="text-xs text-[#555] mt-2">{project.owner.name}</div>
              <div className="flex gap-3 mt-2 text-xs text-[#555]">
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
