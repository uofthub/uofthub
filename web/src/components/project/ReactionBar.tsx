import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import type { ReactionKind } from '@uofthub/types'
import { api, type ProjectSummary } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { REACTIONS } from '../../lib/reactions'
import { cx, Icon, PillButton } from '../ui'
import { projectPath } from '../../lib/paths'

type Tally = { counts: Record<ReactionKind, number>; mine: ReactionKind[] }

/**
 * The row of pill buttons under a project: Impressive, Want to collab,
 * Learned something, and the comment count.
 *
 * It draws from the project it is handed — every list already carries the
 * counts and the reader's own reactions — so a feed of twenty cards makes no
 * requests until somebody taps. Taps land at once and are undone if the API
 * refuses.
 *
 * `compact` is the mobile card: counts only, no words. `dense` is the same
 * at a card's size — the Explore, profile and list cards.
 */
export function ReactionBar({
  project,
  compact = false,
  dense = false,
}: {
  project: Pick<ProjectSummary, 'id' | 'slug' | 'owner' | 'reactions' | 'myReactions' | '_count'>
  compact?: boolean
  dense?: boolean
}) {
  const countsOnly = compact || dense
  const pill = cx(compact && 'h-11', dense && 'h-8 gap-1 px-2.5 text-13')
  const iconSize = dense ? 15 : 16
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tally, setTally] = useState<Tally>({
    counts: project.reactions,
    mine: project.myReactions,
  })
  // A refetched project (the page reloaded its data) replaces local state.
  const [source, setSource] = useState(project)
  if (source !== project) {
    setSource(project)
    setTally({ counts: project.reactions, mine: project.myReactions })
  }

  const flip = (t: Tally, kind: ReactionKind): Tally => {
    const had = t.mine.includes(kind)
    return {
      counts: { ...t.counts, [kind]: Math.max(0, (t.counts[kind] ?? 0) + (had ? -1 : 1)) },
      mine: had ? t.mine.filter((k) => k !== kind) : [...t.mine, kind],
    }
  }

  const toggle = useMutation({
    mutationFn: (kind: ReactionKind) => api.projects.react(project.id, kind),
    onMutate: (kind) => setTally((t) => flip(t, kind)),
    onError: (_err, kind) => setTally((t) => flip(t, kind)),
  })

  const mine = new Set(tally.mine)

  return (
    <div
      className={cx('flex items-center gap-2', countsOnly ? 'flex-nowrap gap-1.5' : 'flex-wrap')}
    >
      {REACTIONS.map((r) => {
        const count = tally.counts[r.kind] ?? 0
        const pressed = mine.has(r.kind)
        return (
          <PillButton
            key={r.kind}
            className={pill}
            aria-pressed={user ? pressed : undefined}
            aria-label={`${r.label}, ${count}`}
            title={user ? r.hint : 'Sign in to react'}
            disabled={toggle.isPending}
            onClick={() => (user ? toggle.mutate(r.kind) : navigate('/session'))}
          >
            <Icon name={r.icon} size={iconSize} />
            {!countsOnly && <span>{r.label}</span>}
            {(count > 0 || countsOnly) && <b className="font-semibold">{count}</b>}
          </PillButton>
        )
      })}
      <PillButton
        as={Link}
        to={`${projectPath(project)}#comments`}
        className={pill}
        aria-label={`${project._count.comments} comments`}
      >
        <Icon name="comment" size={iconSize} />
        {project._count.comments}
      </PillButton>
    </div>
  )
}
