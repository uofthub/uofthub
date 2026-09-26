import { db } from '../db/client.js'

/**
 * Student groups. Every group page is public: groups are created by
 * moderators (POST /orgs), who check the claim to speak for real people once,
 * up front. Policy lives in docs/student-groups.md.
 *
 * Membership is agreed to from both sides — an admin invites and the person
 * accepts, or the person asks and an admin approves — and only an ACTIVE row
 * is a member. Every check of "is this person in the group" goes through here.
 */

export const ORG_ROLES = ['MEMBER', 'ADMIN'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export const isOrgRole = (value: unknown): value is OrgRole => ORG_ROLES.includes(value as OrgRole)

/** The caller's active membership of a group, or null. */
export async function activeMembership(orgId: string, userId: string | null) {
  if (!userId) return null
  const row = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true, status: true },
  })
  return row?.status === 'ACTIVE' ? row : null
}

export async function isOrgAdmin(orgId: string, userId: string | null): Promise<boolean> {
  return (await activeMembership(orgId, userId))?.role === 'ADMIN'
}
