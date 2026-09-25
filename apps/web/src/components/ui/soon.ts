import type { SyntheticEvent } from 'react'

/**
 * For a control the design has and the API cannot back yet.
 *
 * It is drawn exactly as designed, so the page reads the way it will once the
 * endpoint exists, but it is inert and says so on hover — never a button that
 * appears to work and quietly drops what the student did. Everything marked
 * this way is a line item on the backend's to-do list: `grep -rn soon` finds
 * them all.
 */
export const SOON_TITLE = 'Coming soon'

export function soonProps(what?: string) {
  return {
    'data-soon': '',
    'aria-disabled': true as const,
    title: what ? `${what} — coming soon` : SOON_TITLE,
    onClick: (e: SyntheticEvent) => e.preventDefault(),
  }
}
