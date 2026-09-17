import type { ReactionKind } from '@uofthub/types'
import type { ChipColor } from '../components/ui'

/**
 * The four things a reader can say about a project in one tap.
 *
 * Deliberately not a rating and deliberately not a second Like. A blank
 * "Leave a comment…" box on a stranger's capstone collects nothing forever,
 * because writing a sentence about somebody else's work is a real decision.
 * These cost one tap and still say something specific — which is the whole
 * difference between feedback and a popularity score.
 *
 * `label` is the chip; `past` is how the project page reports the tally back
 * ("4 found this useful"), which reads better than a bare count beside a word.
 */
export const REACTIONS: { value: ReactionKind; label: string; past: string; icon: string; color: ChipColor }[] = [
  { value: 'USEFUL', label: 'Useful', past: 'found this useful', icon: 'mdi-lightbulb-on-outline', color: 'yellow' },
  { value: 'IMPRESSIVE', label: 'Impressive', past: 'were impressed', icon: 'mdi-star-outline', color: 'purple' },
  {
    value: 'WELL_DOCUMENTED',
    label: 'Well documented',
    past: 'found it well documented',
    icon: 'mdi-book-open-outline',
    color: 'blue',
  },
  { value: 'WOULD_USE', label: 'Would use this', past: 'would use this', icon: 'mdi-hand-back-right-outline', color: 'mint' },
]

/** Total reactions across every kind — what the project page badges the row with. */
export const reactionTotal = (counts: Record<ReactionKind, number>) =>
  Object.values(counts).reduce((sum, n) => sum + n, 0)
