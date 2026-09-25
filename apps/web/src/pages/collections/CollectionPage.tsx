import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { timeAgo } from '../../lib/projectView'
import { useDocumentTitle } from '../../lib/hooks'
import { CollectionDialog } from '../../components/collection'
import {
  LayoutToggle,
  ProjectCollection,
  ProjectListRow,
  type CardLayout,
} from '../../components/project'
import { Avatar, Button, EmptyState, Spinner } from '../../components/ui'

/** One collection: who put it together, why, and the projects in it you can see. */
export default function CollectionPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [layout, setLayout] = useState<CardLayout>('card')

  const { data, isLoading } = useQuery({
    queryKey: ['collections', 'one', id],
    queryFn: () => api.collections.get(id!),
    enabled: !!id,
  })
  useDocumentTitle(data?.title ?? 'Collection')

  const remove = useMutation({
    mutationFn: (projectId: string) => api.collections.remove(id!, projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  })
  const destroy = useMutation({
    mutationFn: () => api.collections.delete(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      navigate('/collections')
    },
  })

  if (isLoading) return <Spinner />
  if (!data)
    return (
      <div className="page">
        <EmptyState icon="layers" title="That collection doesn’t exist" />
      </div>
    )

  const own = user?.id === data.owner.id
  const n = data.projectCount

  return (
    <div className="page page--wide stack" style={{ gap: 28 }}>
      {editing && <CollectionDialog collection={data} onClose={() => setEditing(false)} />}
      <div className="stack" style={{ gap: 12 }}>
        <Link to="/collections" className="muted" style={{ fontSize: 14, fontWeight: 600 }}>
          ← Collections
        </Link>
        <div className="row wrap" style={{ justifyContent: 'space-between', gap: 16 }}>
          <h1 className="page-title">{data.title}</h1>
          {(own || user?.isAdmin) && (
            <span className="row" style={{ gap: 8 }}>
              {own && (
                <Button icon="pen" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              <Button
                variant="danger"
                icon="trash"
                disabled={destroy.isPending}
                onClick={() => {
                  if (window.confirm(`Delete “${data.title}”? The projects themselves stay.`))
                    destroy.mutate()
                }}
              >
                Delete
              </Button>
            </span>
          )}
        </div>
        {data.description && <p className="page-lede">{data.description}</p>}
        <Link to={`/u/${data.owner.id}`} className="row" style={{ gap: 10, fontSize: 14 }}>
          <Avatar person={data.owner} size={28} />
          <span>
            Curated by <b style={{ fontWeight: 600 }}>{data.owner.name}</b>
            <span className="muted">
              {' '}
              · {n} project{n === 1 ? '' : 's'} · updated {timeAgo(data.updatedAt)}
            </span>
          </span>
        </Link>
      </div>

      {n === 0 ? (
        <EmptyState icon="layers" title={own ? 'Nothing in it yet' : 'Nothing here you can see'}>
          {own && 'Open any project and choose “Add to collection” from its More menu.'}
        </EmptyState>
      ) : own ? (
        // The curator gets rows with a way to take a project out.
        <div className="stack" style={{ gap: 14 }}>
          {data.projects.map((p) => (
            <div key={p.id} className="row" style={{ gap: 10, alignItems: 'stretch' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <ProjectListRow project={p} />
              </div>
              <Button
                iconOnly
                icon="close"
                aria-label={`Remove ${p.title} from this collection`}
                title="Remove from collection"
                disabled={remove.isPending}
                onClick={() => remove.mutate(p.id)}
                style={{ alignSelf: 'center' }}
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <LayoutToggle value={layout} onChange={setLayout} />
          </div>
          <ProjectCollection projects={data.projects} layout={layout} />
        </>
      )}
    </div>
  )
}
