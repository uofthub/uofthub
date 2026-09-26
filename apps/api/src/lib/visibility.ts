import type { FastifyRequest } from 'fastify'
import type { Prisma, Visibility } from '@prisma/client'
import { db } from '../db/client.js'

/**
 * Project visibility rules, in one place so every read route agrees:
 *   PUBLIC   — anyone, signed in or not
 *   UOFT     — any signed-in user (sign-in already requires a utoronto.ca address)
 *   UNLISTED — anyone who has the link; never in a list, search or feed
 *   PRIVATE  — the owner and accepted collaborators only
 *
 * On top of that, a project with a `showFrom` date in the future is PRIVATE to
 * everyone else until that moment, whatever its visibility says — course work
 * can be posted before grading and appear after it. The owner and accepted
 * collaborators always see their own work.
 *
 * Nothing outside this file decides who may see a project. A route that needs
 * the answer asks one of the functions below.
 */

/**
 * Resolve the caller when a route is readable both signed in and signed out.
 * Returns null instead of throwing when there is no valid session.
 */
export async function getOptionalUserId(request: FastifyRequest): Promise<string | null> {
  try {
    await request.jwtVerify()
    return request.user.sub
  } catch {
    return null
  }
}

/** A project whose show-from date, if it has one, has passed. */
const revealedWhere = (now: Date): Prisma.ProjectWhereInput => ({
  OR: [{ showFrom: null }, { showFrom: { lte: now } }],
})

const isRevealed = (showFrom: Date | null, now: Date) => !showFrom || showFrom <= now

/**
 * Prisma `where` fragment matching only the projects this caller may read.
 * Use for any query that returns projects in bulk. UNLISTED is deliberately
 * absent: a link-only project is readable by id but never listed, except to
 * its own makers.
 *
 * Compose it with `AND: [visibleProjectWhere(...), ...]` rather than spreading
 * it: its top level is an `OR`, and a second `OR` beside it would replace it.
 */
export function visibleProjectWhere(
  callerId: string | null,
  now: Date = new Date()
): Prisma.ProjectWhereInput {
  if (!callerId) return { AND: [{ visibility: 'PUBLIC' }, revealedWhere(now)] }
  return {
    OR: [
      { AND: [{ visibility: { in: ['PUBLIC', 'UOFT'] } }, revealedWhere(now)] },
      { ownerId: callerId },
      { collaborators: { some: { userId: callerId, accepted: true } } },
    ],
  }
}

/**
 * The projects an audience can find without being handed a link: PUBLIC for
 * everyone, UOFT too once signed in, never taken down, never still hidden.
 * Unlike `visibleProjectWhere` it grants nothing for being a project's maker —
 * it is for aggregates everyone sees alike, like Explore's counts.
 */
export function listedProjectWhere(
  signedIn: boolean,
  now: Date = new Date()
): Prisma.ProjectWhereInput {
  return {
    AND: [
      { visibility: { in: signedIn ? ['PUBLIC', 'UOFT'] : ['PUBLIC'] } },
      { takenDownAt: null },
      revealedWhere(now),
    ],
  }
}

/**
 * Whether one loaded project is listed to signed-in students: the bar for
 * putting it anywhere others will come across it, like a collection or the
 * weekly spotlight. Picking a draft, a link-only or a still-hidden project
 * would publish it by the back door.
 */
export function isListed(
  project: { visibility: Visibility; takenDownAt: Date | null; showFrom: Date | null },
  now: Date = new Date()
): boolean {
  return (
    (project.visibility === 'PUBLIC' || project.visibility === 'UOFT') &&
    !project.takenDownAt &&
    isRevealed(project.showFrom, now)
  )
}

/**
 * Whether a caller may read one already-loaded project. `collaborators` may be
 * omitted, in which case only owner access is granted for PRIVATE projects.
 *
 * `showFrom` is required, not optional, so that a route loading the project
 * with its own `select` cannot forget it: leaving it out is a type error rather
 * than a hidden project quietly shown.
 */
export function canViewProject(
  project: {
    ownerId: string
    visibility: Visibility
    showFrom: Date | null
    collaborators?: { userId: string; accepted: boolean }[]
  },
  callerId: string | null,
  now: Date = new Date()
): boolean {
  // Makers first: they see their own work whatever its date or visibility.
  if (callerId && project.ownerId === callerId) return true
  if (callerId && (project.collaborators ?? []).some((c) => c.userId === callerId && c.accepted))
    return true
  if (!isRevealed(project.showFrom, now)) return false
  if (project.visibility === 'PUBLIC' || project.visibility === 'UNLISTED') return true
  return !!callerId && project.visibility === 'UOFT'
}

/** What `canViewProject` needs, for routes that load a project themselves. */
export const VIEW_CHECK_SELECT = {
  ownerId: true,
  visibility: true,
  showFrom: true,
  collaborators: { select: { userId: true, accepted: true } },
} satisfies Prisma.ProjectSelect

/**
 * Authorize a read of one project by id, loading just what the check needs.
 * Returns true only if the project exists and the caller may see it — callers
 * should 404 on false rather than 403, so private ids are not confirmed.
 */
export async function canViewProjectId(projectId: string, callerId: string | null): Promise<boolean> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: VIEW_CHECK_SELECT,
  })
  return project ? canViewProject(project, callerId) : false
}
