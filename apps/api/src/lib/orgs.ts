import type { Organization, Prisma } from '@prisma/client'
import { db } from '../db/client.js'
import { ORG_TERM_ALLOWANCE_BYTES, termFor, termsSince } from './terms.js'

/**
 * Verification and per-term storage rules for student groups, in one place so
 * the routes, the sweep and the admin portal all agree. Policy lives in
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

/**
 * Grants the allowance for every term from `since` (the group's verification
 * date) up to the current one, skipping terms already granted. Idempotent, so
 * both the scheduled job and the approve-a-group path can call it — a group
 * verified mid-term gets that term's 10GB immediately rather than waiting for
 * the next one.
 */
export async function grantMissingTermAllowances(
  orgId: string,
  since: Date,
  now: Date = new Date()
): Promise<number> {
  const { count } = await db.orgStorageGrant.createMany({
    data: termsSince(since, now).map((term) => ({
      orgId,
      term,
      bytes: BigInt(ORG_TERM_ALLOWANCE_BYTES),
    })),
    // The primary key is (orgId, term), so re-running this only ever fills in
    // the terms that are actually missing.
    skipDuplicates: true,
  })
  return count
}

/** Total bytes a group may store: the sum of every term allowance it holds. */
export async function orgQuotaBytes(orgId: string): Promise<number> {
  const grants = await db.orgStorageGrant.findMany({ where: { orgId }, select: { bytes: true } })
  return grants.reduce((sum, g) => sum + Number(g.bytes), 0)
}

/** Bytes a group has already used — files stamped with its id at upload. */
export async function orgUsageBytes(orgId: string): Promise<number> {
  const usage = await db.projectFile.aggregate({ where: { orgId }, _sum: { sizeBytes: true } })
  return usage._sum.sizeBytes ?? 0
}

/**
 * The group a new file's bytes should be billed to, or null for the
 * uploader's personal quota. A project linked to several groups bills the
 * one it was linked to first, so the answer doesn't change as links are added.
 * Only VERIFIED groups have an allowance at all (docs/student-groups.md §
 * Storage policy) — an unverified group's files fall back to the uploader's
 * own 2GB rather than being blocked outright.
 */
export async function billingOrgFor(projectId: string, uploaderId: string): Promise<string | null> {
  const links = await db.orgProject.findMany({
    where: {
      projectId,
      org: { status: 'VERIFIED', members: { some: { userId: uploaderId } } },
    },
    include: { org: { select: { id: true, createdAt: true } } },
  })
  if (links.length === 0) return null

  return links.sort((a, b) => a.org.createdAt.getTime() - b.org.createdAt.getTime())[0].org.id
}

/** Current term key, re-exported so routes don't reach past this module. */
export const currentTerm = termFor
