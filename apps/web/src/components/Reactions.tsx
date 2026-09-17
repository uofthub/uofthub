import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactionKind } from '@uofthub/types'
import { api } from '../lib/api'
import { REACTIONS, reactionTotal } from '../lib/reactions'
import { Chip, Icon } from './ui'

/**
 * One-tap feedback on a project.
 *
 * Deliberately not a second Like and deliberately not a rating. Like is the
 * headline number and always will be; this is the row that answers "what
 * actually worked", which is the thing a blank comment box on a stranger's
 * capstone never gets an answer to. Writing a sentence about somebody else's
 * work is a real decision; tapping "Well documented" is not, and it still says
 * something the owner can use.
 */
export default function Reactions({ projectId, canReact }: { projectId: string; canReact: boolean }) {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['reactions', projectId],
    queryFn: () => api.projects.reactions(projectId),
  })

  const toggle = useMutation({
    mutationFn: (kind: ReactionKind) => api.projects.react(projectId, kind),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reactions', projectId] }),
  })

  if (!data) return null

  const mine = new Set(data.mine)
  const total = reactionTotal(data.counts)

  // Nothing to show a signed-out visitor on a project nobody has reacted to:
  // an empty row of chips they cannot press is just clutter.
  if (!canReact && total === 0) return null

  const said = REACTIONS.filter(r => data.counts[r.value] > 0)

  return (
    <div>
      <div
        className="text--disabled"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', marginBottom: 10 }}
      >
        <Icon name="mdi-message-star-outline" size={16} />
        {canReact ? 'Quick feedback — tell them what worked' : 'What readers said'}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {REACTIONS.map(reaction => {
          const count = data.counts[reaction.value]
          const chosen = mine.has(reaction.value)
          // A reaction nobody has chosen is worth offering but not worth
          // showing to somebody who cannot press it.
          if (!canReact && count === 0) return null

          return (
            <Chip
              key={reaction.value}
              label
              color={reaction.color}
              solid={chosen}
              onClick={canReact && !toggle.isPending ? () => toggle.mutate(reaction.value) : undefined}
              style={{ paddingInline: 12, height: 34 }}
            >
              <Icon name={reaction.icon} size={16} color={chosen ? '#fff' : undefined} />
              {reaction.label}
              {count > 0 && <strong style={{ marginLeft: 2 }}>{count}</strong>}
            </Chip>
          )
        })}
      </div>

      {/* The tally read back as a sentence. "4" beside a word is a score;
          "4 found this useful" is what somebody said about the work. */}
      {said.length > 0 && (
        <p className="text--disabled" style={{ fontSize: '0.8125rem', margin: '12px 0 0' }}>
          {said
            .map(r => `${data.counts[r.value]} ${r.past}`)
            .join(' · ')}
        </p>
      )}

      {!canReact && (
        <p className="text--disabled" style={{ fontSize: '0.8125rem', margin: '12px 0 0' }}>
          <Link to="/session">Sign in</Link> to add yours.
        </p>
      )}
    </div>
  )
}
