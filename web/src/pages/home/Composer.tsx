import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { HelpNeededDialog, UpdateDialog } from '../project/OwnerDialogs'
import { Avatar, Button, Card, Dialog, Field, Icon, PillButton, Select } from '../../components/ui'

type Mode = 'update' | 'help'

/**
 * Both composer actions start from one of the student's own projects: an
 * update is a note about what changed in it, and "Looking for…" says what
 * help it needs — which is what puts it in the Looking for help list.
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
  const [next, setNext] = useState(false)
  const chosen = mine?.find((p) => p.id === projectId) ?? mine?.[0]

  if (next && chosen)
    return mode === 'update' ? (
      <UpdateDialog project={chosen} onClose={onClose} />
    ) : (
      <HelpNeededDialog
        project={chosen}
        onClose={onClose}
        onSaved={() => qc.invalidateQueries({ queryKey: ['userProjects', user?.id] })}
      />
    )

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
            <Button
              variant="primary"
              icon={mode === 'update' ? 'send' : 'megaphone'}
              disabled={!chosen}
              onClick={() => setNext(true)}
            >
              Next
            </Button>
          </>
        )
      }
    >
      {empty ? (
        <p className="text-15 leading-normal text-muted">
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
            <p className="text-14 leading-normal text-muted">
              Next you’ll say what you need. It shows up under <b>Looking for help</b> and in
              Explore’s filter — or{' '}
              <Link to="/projects/new?status=HELP_WANTED" onClick={onClose}>
                start a new project that asks for help
              </Link>
              .
            </p>
          )}
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
    <Card as="section" className="flex flex-col gap-3.5 px-4.5 py-4">
      {open && <ComposerDialog mode={open} onClose={() => setOpen(null)} />}
      <div className="flex items-center gap-3">
        <Avatar person={user} size={40} />
        <Link
          to="/projects/new"
          className="flex h-11 grow items-center rounded-xl bg-fill px-4 text-15 text-muted hover:bg-fill-soft hover:text-ink-3"
        >
          Share what you’re working on. It doesn’t need to be finished.
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 pl-13">
        <PillButton as={Link} to="/projects/new" className="text-navy-ink hover:text-navy-ink">
          <Icon name="layers" size={16} />
          Project
        </PillButton>
        <PillButton
          className="text-green-ink hover:text-green-ink"
          onClick={() => setOpen('update')}
        >
          <Icon name="send" size={16} />
          Update
        </PillButton>
        <PillButton
          className="text-purple-ink hover:text-purple-ink"
          onClick={() => setOpen('help')}
        >
          <Icon name="megaphone" size={16} />
          Looking for…
        </PillButton>
      </div>
    </Card>
  )
}
