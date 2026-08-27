import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api, safeUrl } from '../lib/api'
import { Stat } from '../components/ProjectCard'
import { Avatar, Btn, Card, Chip, Divider, EmptyState, ErrorText, Icon, Spinner, TextField } from '../components/ui'

type OrgDetail = {
  id: string
  slug: string
  name: string
  type: 'CLUB' | 'LAB'
  description?: string
  websiteUrl?: string
  members: {
    orgId: string
    userId: string
    role: string
    user: { id: string; name: string; avatarUrl?: string; faculty?: string }
  }[]
  projects: {
    orgId: string
    projectId: string
    project: {
      id: string
      title: string
      description?: string
      owner: { id: string; name: string }
      _count: { likes: number; comments: number }
    }
  }[]
}

export default function OrgPage() {
  const { slug } = useParams<{ slug: string }>()
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)

  const { data: org, isLoading } = useQuery({
    queryKey: ['org', slug],
    queryFn: () => api.orgs.get(slug!) as Promise<OrgDetail>,
    enabled: !!slug,
  })

  const addMember = useMutation({
    mutationFn: () => api.orgs.addMember(slug!, email),
    onSuccess: () => {
      setEmail('')
      setAdding(false)
      qc.invalidateQueries({ queryKey: ['org', slug] })
    },
  })

  usePageCrumbs([{ text: 'Clubs & Labs', href: '/orgs' }, { text: org?.name ?? 'Group' }])

  if (isLoading) return <Spinner />
  if (!org) return <EmptyState icon="mdi-account-group-outline" title="Organization not found." />

  const isAdmin = org.members.find(m => m.userId === me?.id)?.role === 'ADMIN'
  const lab = org.type === 'LAB'

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 960 }}>
      <Card style={{ padding: 28 }}>
        <Chip color={lab ? 'purple' : 'blue'} small style={{ fontWeight: 700 }}>
          {lab ? 'Research Lab' : 'Club'}
        </Chip>
        <h1 style={{ fontSize: '1.75rem', marginTop: 10 }}>{org.name}</h1>
        {org.description && (
          <p className="text--secondary" style={{ marginTop: 10, marginBottom: 0 }}>
            {org.description}
          </p>
        )}
        {safeUrl(org.websiteUrl) && (
          <a
            href={safeUrl(org.websiteUrl)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: '0.9375rem' }}
          >
            <Icon name="mdi-open-in-new" size={16} />
            {org.websiteUrl}
          </a>
        )}
        <div className="text--disabled" style={{ display: 'flex', gap: 24, marginTop: 20, fontSize: '0.9375rem' }}>
          <span>
            <strong style={{ color: 'var(--v-text-base)' }}>{org.members.length}</strong> members
          </span>
          <span>
            <strong style={{ color: 'var(--v-text-base)' }}>{org.projects.length}</strong> projects
          </span>
        </div>
      </Card>

      <h2 style={{ margin: '40px 0 16px' }}>Members</h2>
      <Card style={{ padding: 20 }}>
        <ul className="v-list" style={{ display: 'grid', gap: 4 }}>
          {org.members.map(m => (
            <li key={m.userId}>
              <Link to={`/u/${m.userId}`} className="v-list-item" style={{ borderRadius: 6 }}>
                <Avatar name={m.user.name} img={m.user.avatarUrl} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{m.user.name}</div>
                  {m.user.faculty && (
                    <div className="text--disabled" style={{ fontSize: '0.8125rem' }}>
                      {m.user.faculty}
                    </div>
                  )}
                </div>
                <span className="text--disabled" style={{ fontSize: '0.8125rem', textTransform: 'capitalize' }}>
                  {m.role.toLowerCase()}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {isAdmin && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            {adding ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px' }}>
                  <TextField
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="student@mail.utoronto.ca"
                  />
                </div>
                <Btn variant="accent" onClick={() => addMember.mutate()} disabled={!email || addMember.isPending} style={{ height: 44 }}>
                  {addMember.isPending ? 'Adding…' : 'Add'}
                </Btn>
                <Btn onClick={() => setAdding(false)} style={{ height: 44 }}>
                  Cancel
                </Btn>
              </div>
            ) : (
              <Btn onClick={() => setAdding(true)} style={{ color: 'var(--v-accent-base)' }}>
                <Icon name="mdi-plus" />
                Add member
              </Btn>
            )}
            {addMember.isError && <ErrorText>{(addMember.error as Error).message}</ErrorText>}
          </>
        )}
      </Card>

      <h2 style={{ margin: '40px 0 16px' }}>Projects</h2>
      {org.projects.length === 0 ? (
        <EmptyState icon="mdi-folder-open-outline" title="No projects linked to this group yet." />
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {org.projects.map(({ project }) => (
            <Card key={project.id} hover to={`/projects/${project.id}`} style={{ padding: 20 }}>
              <h3 className="overflow-ellipsis" style={{ fontSize: '1.0625rem', fontWeight: 500 }}>
                {project.title}
              </h3>
              {project.description && (
                <p
                  className="text--secondary"
                  style={{
                    fontSize: '0.9rem',
                    margin: '6px 0 0',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {project.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'center' }}>
                <span className="text--secondary" style={{ fontSize: '0.8125rem' }}>
                  {project.owner.name}
                </span>
                <Stat icon="mdi-heart-outline" value={project._count.likes} />
                <Stat icon="mdi-comment-outline" value={project._count.comments} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
