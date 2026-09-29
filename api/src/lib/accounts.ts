import { db } from '../db/client.js'
import { notify } from './notifications.js'
import { isUnconfirmedHandle, withSuggestedHandle } from './handles.js'

/**
 * What happens once an account's email address is proven — by Microsoft
 * sign-in, the confirmation link, or a password reset link.
 *
 * Invitations to the address — to a project or a group — made before it had
 * a confirmed account become ordinary pending invitations now, each announced the way it would have been had the
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

  // The same for groups. An invitation lapses if whoever made it is no longer
  // one of the group's admins.
  const orgInvites = await db.orgEmailInvite.findMany({
    where: { email: user.email },
    include: {
      org: { select: { id: true, slug: true, name: true } },
      invitedBy: { select: { name: true } },
    },
  })
  for (const invite of orgInvites) {
    const [inviterStillAdmin, existing] = await Promise.all([
      db.orgMember.findFirst({
        where: { orgId: invite.orgId, userId: invite.invitedById, status: 'ACTIVE', role: 'ADMIN' },
      }),
      db.orgMember.findUnique({ where: { orgId_userId: { orgId: invite.orgId, userId } } }),
    ])
    if (inviterStillAdmin && !existing) {
      await db.orgMember.create({
        data: { orgId: invite.orgId, userId, role: invite.role, status: 'INVITED' },
      })
      await notify(userId, 'ORG_INVITED', {
        slug: invite.org.slug,
        orgName: invite.org.name,
        inviterName: invite.invitedBy.name,
      })
    }
    await db.orgEmailInvite.delete({
      where: { orgId_email: { orgId: invite.orgId, email: invite.email } },
    })
  }
}
