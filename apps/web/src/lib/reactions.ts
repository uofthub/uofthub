import type { ReactionKind } from '@uofthub/types'
import type { IconName } from '../components/ui/Icon'

/**
 * The three reactions on the Card system board: "three meaningful reactions
 * instead of a like count". They are the app's only public engagement signal
 * — likes were folded into Impressive when the redesign shipped.
 *
 * USEFUL keeps its API name and is shown as "Learned something". COLLAB is
 * counted publicly, but who pressed it is only ever shown to the project's
 * owner, who is told privately.
 */
export type DesignReaction = {
  kind: ReactionKind
  label: string
  icon: IconName
  /** The tooltip — says what pressing it does, which for COLLAB matters. */
  hint: string
  /** How the owner's insights read the tally back: "12 learned something". */
  past: string
}

export const REACTIONS: DesignReaction[] = [
  {
    kind: 'IMPRESSIVE',
    label: 'Impressive',
    icon: 'star',
    hint: 'Impressive work',
    past: 'were impressed',
  },
  {
    kind: 'COLLAB',
    label: 'Want to collab',
    icon: 'userPlus',
    hint: 'Tells the author privately that you would like to work on this with them',
    past: 'want to collab',
  },
  {
    kind: 'USEFUL',
    label: 'Learned something',
    icon: 'bulb',
    hint: 'You learned something from it',
    past: 'learned something',
  },
]

export const reactionLabel = (kind: ReactionKind) =>
  REACTIONS.find((r) => r.kind === kind)?.label ?? kind
