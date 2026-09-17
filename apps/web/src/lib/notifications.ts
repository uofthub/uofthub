import type { Notification } from '@uofthub/types'

/**
 * What one notification says, and where it goes.
 *
 * Its own module rather than a helper inside NotificationBell, because it is
 * the part worth testing: eleven types, each a sentence a student reads in
 * passing, and the difference between "somebody commented on your project"
 * and a notification carrying the comment is the difference between one they
 * open and one they ignore.
 */

/** The label a reaction is announced under — mirrors REACTIONS in reactions.ts. */
const REACTION_LABELS: Record<string, string> = {
  USEFUL: 'useful',
  IMPRESSIVE: 'impressive',
  WELL_DOCUMENTED: 'well documented',
  WOULD_USE: 'something they would use',
}

export function messageFor(n: Notification): { text: string; to: string } {
  const p = n.payload as Record<string, string | boolean | undefined>
  const to = typeof p.projectId === 'string' ? `/projects/${p.projectId}` : '/'
  // The social notifications all name whoever acted, and a few of them are
  // about a person rather than a project — those link to the profile.
  const profile = typeof p.actorId === 'string' ? `/u/${p.actorId}` : '/'

  switch (n.type) {
    case 'COLLABORATOR_INVITED':
      return { text: `${p.inviterName} invited you to collaborate on "${p.projectTitle}"`, to }
    case 'COLLABORATOR_RESPONDED':
      return { text: `${p.userName} ${p.accepted ? 'accepted' : 'declined'} your invite to "${p.projectTitle}"`, to }
    case 'ACCESS_REQUESTED':
      return { text: `${p.requesterName} requested viewer access to "${p.projectTitle}"`, to }
    case 'ACCESS_REQUEST_DECIDED':
      return { text: `Your access request for "${p.projectTitle}" was ${p.accepted ? 'approved' : 'denied'}`, to }
    case 'PROJECT_MODERATED': {
      const action =
        p.action === 'TAKEN_DOWN'
          ? `"${p.projectTitle}" was taken down after a report`
          : `A moderator reviewed a report about "${p.projectTitle}"`
      return { text: p.note ? `${action}: ${p.note}` : action, to }
    }
    case 'PROJECT_LIKED':
      return { text: `${p.actorName} liked "${p.projectTitle}"`, to }
    case 'PROJECT_COMMENTED':
      // The excerpt is what makes this worth opening — "somebody commented"
      // is a notification you have to go and decode.
      return {
        text: p.excerpt
          ? `${p.actorName} on "${p.projectTitle}": ${p.excerpt}`
          : `${p.actorName} commented on "${p.projectTitle}"`,
        // Straight to the comment, not the overview tab it is hidden behind.
        to: `${to}?tab=comments`,
      }
    case 'PROJECT_FORKED':
      return { text: `${p.actorName} forked "${p.projectTitle}"`, to }
    case 'PROJECT_REACTED': {
      const what = typeof p.kind === 'string' ? REACTION_LABELS[p.kind] : undefined
      return {
        text: what
          ? `${p.actorName} found "${p.projectTitle}" ${what}`
          : `${p.actorName} left feedback on "${p.projectTitle}"`,
        to,
      }
    }
    case 'FOLLOWED_YOU':
      return { text: `${p.actorName} followed you`, to: profile }
    case 'FOLLOWING_PUBLISHED':
      return { text: `${p.ownerName} published "${p.projectTitle}"`, to }
  }
}
