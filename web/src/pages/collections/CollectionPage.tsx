import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { timeAgo } from '../../lib/projectView'
import { ReportDialog } from '../../components/project'
import { useDocumentTitle } from '../../lib/hooks'
import { CollectionDialog } from '../../components/collection'
import {
  LayoutToggle,
  ProjectCollection,
  ProjectListRow,
  type CardLayout,
} from '../../components/project'
import { Avatar, Button, EmptyState, Page, PageLede, PageTitle, Spinner } from '../../components/ui'

/** One collection: who put it together, why, and the projects in it you can see. */
export default function CollectionPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [reporting, setReporting] = useState(false)
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
      <Page>
        <EmptyState icon="layers" title="That collection doesn’t exist" />
      </Page>
    )

  const own = user?.id === data.owner.id
  const n = data.projectCount

  return (
    <Page width="wide" className="flex flex-col gap-7">
      {editing && <CollectionDialog collection={data} onClose={() => setEditing(false)} />}
      {reporting && (
        <ReportDialog
          target={{ kind: 'collection', collectionId: data.id }}
          onClose={() => setReporting(false)}
        />
      )}
      <div className="flex flex-col gap-3">
        <Link to="/collections" className="text-14 font-semibold text-muted hover:text-navy-deep">
          ← Collections
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <PageTitle>{data.title}</PageTitle>
          {user && !own && (
            <Button icon="flag" variant="ghost" onClick={() => setReporting(true)}>
              Report
            </Button>
          )}
          {(own || user?.isAdmin) && (
            <span className="flex items-center gap-2">
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
        {data.description && <PageLede>{data.description}</PageLede>}
        <Link to={`/u/${data.owner.id}`} className="flex items-center gap-2.5 text-14">
          <Avatar person={data.owner} size={28} />
          <span>
            Curated by <b className="font-semibold">{data.owner.name}</b>
            <span className="text-muted">
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
        <div className="flex flex-col gap-3.5">
          {data.projects.map((p) => (
            <div key={p.id} className="flex items-stretch gap-2.5">
              <div className="min-w-0 grow">
                <ProjectListRow project={p} />
              </div>
              <Button
                iconOnly
                icon="close"
                aria-label={`Remove ${p.title} from this collection`}
                title="Remove from collection"
                disabled={remove.isPending}
                onClick={() => remove.mutate(p.id)}
                className="self-center"
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-end">
            <LayoutToggle value={layout} onChange={setLayout} />
          </div>
          <ProjectCollection projects={data.projects} layout={layout} />
        </>
      )}
    </Page>
  )
}
