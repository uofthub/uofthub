import type { FastifyRequest } from 'fastify'
import type { Prisma, Visibility } from '@prisma/client'
import { db } from '../db/client.js'

/**
 * Project visibility rules, in one place so every read route agrees:
 *   PUBLIC   — anyone, signed in or not
 *   UOFT     — any signed-in user (sign-in already requires a utoronto.ca address)
 *   UNLISTED — anyone who has the link; never in a list, search or feed
 *   PRIVATE  — the owner and accepted collaborators only
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

/**
 * Prisma `where` fragment matching only the projects this caller may read.
 * Use for any query that returns projects in bulk. UNLISTED is deliberately
 * absent: a link-only project is readable by id but never listed, except to
 * its own makers.
 */
export function visibleProjectWhere(callerId: string | null): Prisma.ProjectWhereInput {
  if (!callerId) return { visibility: 'PUBLIC' }
  return {
    OR: [
      { visibility: { in: ['PUBLIC', 'UOFT'] } },
      { ownerId: callerId },
      { collaborators: { some: { userId: callerId, accepted: true } } },
    ],
  }
}

/**
 * Whether a caller may read one already-loaded project. `collaborators` may be
 * omitted, in which case only owner access is granted for PRIVATE projects.
 */
export function canViewProject(
  project: {
    ownerId: string
    visibility: Visibility
    collaborators?: { userId: string; accepted: boolean }[]
  },
  callerId: string | null,
): boolean {
  if (project.visibility === 'PUBLIC' || project.visibility === 'UNLISTED') return true
  if (!callerId) return false
  if (project.visibility === 'UOFT') return true
  if (project.ownerId === callerId) return true
  return (project.collaborators ?? []).some((c) => c.userId === callerId && c.accepted)
}

/**
 * Authorize a read of one project by id, loading just what the check needs.
 * Returns true only if the project exists and the caller may see it — callers
 * should 404 on false rather than 403, so private ids are not confirmed.
 */
export async function canViewProjectId(projectId: string, callerId: string | null): Promise<boolean> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      visibility: true,
      collaborators: { select: { userId: true, accepted: true } },
    },
  })
  return project ? canViewProject(project, callerId) : false
}
