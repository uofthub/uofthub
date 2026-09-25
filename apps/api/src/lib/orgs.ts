import type { Organization, Prisma } from '@prisma/client'
import { db } from '../db/client.js'

/**
 * Verification rules for student groups, in one place so the routes, the
 * sweep and the admin portal all agree. Policy lives in
 * docs/student-groups.md.
 */

/** How long a group has to submit (or re-submit) verification material. */
export const VERIFICATION_WINDOW_DAYS = 7

export function verificationDeadlineFromNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + VERIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

/** Statuses whose deadline the sweep enforces; VERIFIED and IN_REVIEW have none. */
export const EXPIRING_STATUSES = ['PENDING_VERIFICATION', 'INFO_REQUESTED'] as const

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
