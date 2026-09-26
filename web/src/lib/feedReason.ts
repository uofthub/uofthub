import type { FeedReason, FeedScope } from './api'

/**
 * Whether a feed item's reason is worth a line on this tab. A reason the tab
 * already implies is noise — every card on Following would say "who you
 * follow" — and TRENDING is only true of the blended feed's top-up, so a
 * scoped tab never shows it.
 */
export function reasonToShow(reason: FeedReason | undefined, scope: FeedScope): FeedReason | null {
  if (!reason) return null
  if (reason.kind === 'TRENDING') return scope === 'all' ? reason : null
  if (reason.kind === 'FOLLOWING' && scope === 'following') return null
  if (reason.kind === 'CAMPUS' && scope === 'campus') return null
  return reason
}
