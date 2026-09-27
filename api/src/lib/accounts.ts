import { db } from '../db/client.js'
import { notify } from './notifications.js'
import { isUnconfirmedHandle, withSuggestedHandle } from './handles.js'

/**
 * What happens once an account's email address is proven — by Microsoft
 * sign-in, the confirmation link, or a password reset link.
 *
 * Invitations sent to the address before it had an account become ordinary
 * pending invitations now, each announced the way it would have been had the
 * account existed. Only now, and not at sign-up: until the address is proven,
 * the account is not necessarily the person who was invited.
 *
 * So is the account's handle: until now it held a placeholder, so a sign-up
 * with somebody else's address could not squat a name (see User.handle).
 */
export async function onEmailVerified(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, handle: true },
  })
  if (!user) return
  if (isUnconfirmedHandle(user.handle))
    await withSuggestedHandle(user.name, (handle) =>
      db.user.update({ where: { id: userId }, data: { handle } })
    )
  const invites = await db.projectEmailInvite.findMany({
    where: { email: user.email },
    include: {
      project: { select: { id: true, title: true, ownerId: true } },
      invitedBy: { select: { name: true } },
    },
  })
  for (const invite of invites) {
    // The invitation lapses if whoever sent it no longer owns the project.
    if (invite.project.ownerId === invite.invitedById && invite.project.ownerId !== userId) {
      const existing = await db.projectCollaborator.findUnique({
        where: { projectId_userId: { projectId: invite.projectId, userId } },
      })
      if (!existing) {
        await db.projectCollaborator.create({
          data: { projectId: invite.projectId, userId, title: invite.title },
        })
        await notify(userId, 'COLLABORATOR_INVITED', {
          projectId: invite.project.id,
          projectTitle: invite.project.title,
          inviterName: invite.invitedBy.name,
          title: invite.title,
        })
      }
    }
    await db.projectEmailInvite.delete({
      where: { projectId_email: { projectId: invite.projectId, email: invite.email } },
    })
  }
}
