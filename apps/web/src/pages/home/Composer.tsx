import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { UpdateDialog } from '../project/OwnerDialogs'
import { Avatar, Button, Dialog, ErrorText, Field, Icon, Select } from '../../components/ui'

type Mode = 'update' | 'help'

/**
 * Both composer actions start from one of the student's own projects: an
 * update is a note about what changed in it, and "Looking for…" marks it as
 * asking for help — which is what puts it in the Looking for help list.
 */
function ComposerDialog({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: mine, isLoading } = useQuery({
    queryKey: ['userProjects', user?.id, 'first'],
    queryFn: () => api.users.projects(user!.id),
    enabled: !!user,
  })
  const [projectId, setProjectId] = useState('')
  const [updating, setUpdating] = useState<{ id: string; title: string } | null>(null)
  const chosen = mine?.find((p) => p.id === projectId) ?? mine?.[0]

  const askForHelp = useMutation({
    mutationFn: () => api.projects.update(chosen!.id, { status: 'HELP_WANTED' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facets'] })
      qc.invalidateQueries({ queryKey: ['project', chosen!.id] })
      onClose()
    },
  })

  if (updating) return <UpdateDialog project={updating} onClose={onClose} />

  const empty = !isLoading && (mine?.length ?? 0) === 0

  return (
    <Dialog
      title={mode === 'update' ? 'Post an update' : 'Ask for help'}
      onClose={onClose}
      footer={
        empty ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            {mode === 'update' ? (
              <Button
                variant="primary"
                icon="send"
                disabled={!chosen}
                onClick={() => chosen && setUpdating({ id: chosen.id, title: chosen.title })}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="primary"
                icon="megaphone"
                disabled={!chosen || askForHelp.isPending}
                onClick={() => askForHelp.mutate()}
              >
                {askForHelp.isPending ? 'Saving…' : 'Mark as looking for help'}
              </Button>
            )}
          </>
        )
      }
    >
      {empty ? (
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
          {mode === 'update'
            ? 'Updates belong to a project, and you haven’t posted one yet.'
            : 'Share the project first, then ask for help on it.'}{' '}
          <Link
            to={mode === 'help' ? '/projects/new?status=HELP_WANTED' : '/projects/new'}
            onClick={onClose}
          >
            Post a project
          </Link>
        </p>
      ) : (
        <>
          <Field label="Which project?">
            <Select
              value={chosen?.id ?? ''}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={isLoading}
            >
              {mine?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </Field>
          {mode === 'help' && (
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
              It shows up under <b>Looking for help</b> and in Explore’s filter. Say what you need
              in its pitch or story — or{' '}
              <Link to="/projects/new?status=HELP_WANTED" onClick={onClose}>
                start a new project that asks for help
              </Link>
              .
            </p>
          )}
          {askForHelp.isError && <ErrorText>{(askForHelp.error as Error).message}</ErrorText>}
        </>
      )}
    </Dialog>
  )
}

/** "Share what you're working on" — the doorway to posting. */
export function Composer() {
  const { user } = useAuth()
  const [open, setOpen] = useState<Mode | null>(null)
  if (!user) return null

  return (
    <section className="card composer">
      {open && <ComposerDialog mode={open} onClose={() => setOpen(null)} />}
      <div className="row" style={{ gap: 12 }}>
        <Avatar person={user} size={40} />
        <Link to="/projects/new" className="composer__prompt">
          Share what you’re working on. It doesn’t need to be finished.
        </Link>
      </div>
      <div className="composer__actions">
        <Link className="rx" to="/projects/new" style={{ color: 'var(--navy-ink)' }}>
          <Icon name="layers" size={16} />
          Project
        </Link>
        <button
          type="button"
          className="rx"
          style={{ color: 'var(--green-ink)' }}
          onClick={() => setOpen('update')}
        >
          <Icon name="send" size={16} />
          Update
        </button>
        <button
          type="button"
          className="rx"
          style={{ color: 'var(--purple-ink)' }}
          onClick={() => setOpen('help')}
        >
          <Icon name="megaphone" size={16} />
          Looking for…
        </button>
      </div>
    </section>
  )
}
