import type { Organization, Prisma } from '@prisma/client'
import { db } from '../db/client.js'

/**
 * Who can see a student group. Groups are created by moderators, already
 * verified (see POST /orgs); the unverified states only remain for groups
 * created by the old self-serve flow, which a moderator can still approve or
 * deny from the queue. Policy lives in docs/student-groups.md.
 */

/**
 * Prisma `where` fragment for the groups this caller may see: the verified
 * ones, plus their own, whatever state those are in. An unverified group is
 * invisible to everyone else — that's the whole point of the gate — but
 * hiding it from its own creator too would leave them no way back to the page
 * they need to verify.
 */
export function visibleOrgWhere(callerId: string | null): Prisma.OrganizationWhereInput {
  if (!callerId) return { status: 'VERIFIED' }
  return {
    OR: [{ status: 'VERIFIED' }, { members: { some: { userId: callerId } } }],
  }
}

/** Whether an already-loaded group may be read by this caller. */
export async function canViewOrg(org: Organization, callerId: string | null): Promise<boolean> {
  if (org.status === 'VERIFIED') return true
  if (!callerId) return false
  const member = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: callerId } },
    select: { userId: true },
  })
  return !!member
}
