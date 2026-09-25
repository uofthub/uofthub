import type { Notification } from '@uofthub/types'

/**
 * What one notification says, and where it goes.
 *
 * Its own module rather than a helper inside NotificationBell, because it is
 * the part worth testing: a dozen types, each a sentence a student reads in
 * passing, and the difference between "somebody commented on your project"
 * and a notification carrying the comment is the difference between one they
 * open and one they ignore.
 */

/**
 * How a reaction is announced, in the words the reader tapped — see
 * REACTIONS in reactions.ts, where USEFUL is shown as "Learned something".
 * The two retired kinds keep their wording: notifications about them were
 * written before the redesign and are still in people's bells.
 */
const REACTION_SENTENCES: Record<string, (actor: string, title: string) => string> = {
  USEFUL: (actor, title) => `${actor} learned something from "${title}"`,
  IMPRESSIVE: (actor, title) => `${actor} found "${title}" impressive`,
  WELL_DOCUMENTED: (actor, title) => `${actor} found "${title}" well documented`,
  WOULD_USE: (actor, title) => `${actor} would use "${title}"`,
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
      return {
        text: `${p.userName} ${p.accepted ? 'accepted' : 'declined'} your invite to "${p.projectTitle}"`,
        to,
      }
    case 'ACCESS_REQUESTED':
      return { text: `${p.requesterName} requested viewer access to "${p.projectTitle}"`, to }
    case 'ACCESS_REQUEST_DECIDED':
      return {
        text: `Your access request for "${p.projectTitle}" was ${p.accepted ? 'approved' : 'denied'}`,
        to,
      }
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
        // Straight to the comments, not the top of a long project page.
        to: `${to}#comments`,
      }
    case 'PROJECT_FORKED':
      return { text: `${p.actorName} forked "${p.projectTitle}"`, to }
    case 'PROJECT_REACTED': {
      const say = typeof p.kind === 'string' ? REACTION_SENTENCES[p.kind] : undefined
      return {
        text: say
          ? say(String(p.actorName), String(p.projectTitle))
          : `${p.actorName} left feedback on "${p.projectTitle}"`,
        to,
      }
    }
    case 'FOLLOWED_YOU':
      return { text: `${p.actorName} followed you`, to: profile }
    case 'PROJECT_COLLAB_INTEREST':
      // Straight to the person: whether to reply depends on who they are.
      return { text: `${p.actorName} wants to collaborate on "${p.projectTitle}"`, to: profile }
    case 'COMMENT_REPLIED':
      return {
        text: p.excerpt
          ? `${p.actorName} replied on "${p.projectTitle}": ${p.excerpt}`
          : `${p.actorName} replied to your comment on "${p.projectTitle}"`,
        to: `${to}#comments`,
      }
    case 'FOLLOWING_PUBLISHED':
      return { text: `${p.ownerName} published "${p.projectTitle}"`, to }
    case 'PROJECT_UPDATED':
      // The note is the update; the title alone would say nothing new.
      return {
        text: p.note
          ? `Update on "${p.projectTitle}": ${p.note}`
          : `"${p.projectTitle}" posted an update`,
        to: `${to}#updates`,
      }
  }
}
