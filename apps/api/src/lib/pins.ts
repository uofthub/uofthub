/**
 * The most projects one student may pin to the top of their profile.
 *
 * Six, which is GitHub's number, and it is the right one for the same reason:
 * the pinned strip is the only place a profile still renders cards, and a card
 * grid stops ranking anything the moment it spills past a row or two. Shared
 * between the route that enforces it (`POST /projects/:id/pin`) and the route
 * that reads the strip back (`GET /users/:id/pinned`), so the two can't drift.
 *
 * See docs/feed-and-density.md § Pinned projects.
 */
export const PIN_LIMIT = 6
