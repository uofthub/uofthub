import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type CollectionSummary } from '../../lib/api'
import { Button, Dialog, ErrorText, Field, Icon, Input, Spinner, TextArea } from '../ui'

const TITLE_MAX = 80
const DESCRIPTION_MAX = 500

/**
 * Make a collection, or rename one. Given a `projectId`, the new collection
 * starts with that project in it.
 */
export function CollectionDialog({
  collection,
  projectId,
  onClose,
  onCreated,
}: {
  collection?: Pick<CollectionSummary, 'id' | 'title' | 'description'>
  projectId?: string
  onClose: () => void
  onCreated?: (c: CollectionSummary) => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [title, setTitle] = useState(collection?.title ?? '')
  const [description, setDescription] = useState(collection?.description ?? '')

  const save = useMutation({
    mutationFn: () =>
      collection
        ? api.collections.update(collection.id, {
            title: title.trim(),
            description: description.trim() || null,
          })
        : api.collections.create({
            title: title.trim(),
            description: description.trim() || undefined,
            projectId,
          }),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      onClose()
      if (collection) return
      if (onCreated) onCreated(saved)
      else navigate(`/collections/${saved.id}`)
    },
  })

  return (
    <Dialog
      title={collection ? 'Edit collection' : 'New collection'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={!title.trim() || save.isPending}
          >
            {save.isPending ? 'Saving…' : collection ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <Field label="Title">
        <Input
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Best of UTM 2026"
          autoFocus
        />
      </Field>
      <Field label="What ties it together" hint="Optional">
        <TextArea
          rows={3}
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="First-year projects that punch above their weight."
        />
      </Field>
      <p className="muted" style={{ fontSize: 13 }}>
        Anyone can see a collection. Each person only sees the projects in it they could already
        see.
      </p>
      {save.isError && <ErrorText>{(save.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

/** Put a project in (or take it out of) any of your collections. */
export function AddToCollectionDialog({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['collections', 'mine', projectId],
    queryFn: () => api.collections.mine(projectId),
  })

  const toggle = useMutation({
    mutationFn: ({ id, has }: { id: string; has: boolean }) =>
      has ? api.collections.remove(id, projectId) : api.collections.add(id, projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  })

  if (creating)
    return (
      <CollectionDialog
        projectId={projectId}
        onClose={() => setCreating(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['collections'] })}
      />
    )

  return (
    <Dialog
      title="Add to collection"
      onClose={onClose}
      footer={
        <>
          <Button icon="plus" onClick={() => setCreating(true)}>
            New collection
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <p className="muted" style={{ fontSize: 15 }}>
          You don’t have a collection yet. Start one with this project in it.
        </p>
      ) : (
        <ul className="pick-list">
          {data.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="pick-list__item"
                aria-pressed={c.hasProject}
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ id: c.id, has: c.hasProject })}
              >
                <span className={c.hasProject ? 'pick-box pick-box--on' : 'pick-box'}>
                  {c.hasProject && <Icon name="check" size={14} />}
                </span>
                <span className="grow" style={{ textAlign: 'left' }}>
                  <b style={{ fontWeight: 600 }}>{c.title}</b>
                  <span className="muted" style={{ fontSize: 13, display: 'block' }}>
                    {c.projectCount} project{c.projectCount === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {toggle.isError && <ErrorText>{(toggle.error as Error).message}</ErrorText>}
    </Dialog>
  )
}
