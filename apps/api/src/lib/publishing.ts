import type { Visibility } from '@prisma/client'
import { db } from '../db/client.js'
import { FANOUT_LIMIT, notifyMany } from './notifications.js'

/**
 * The moment a project stops being private.
 *
 * Two things happen exactly once in a project's life, and both hang off this
 * transition rather than off `createdAt`: `publishedAt` is stamped (which is
 * what the home feed orders by — a capstone drafted in January and published
 * in March belongs in March), and the owner's followers are told.
 *
 * Deliberately idempotent on `publishedAt`. A student who flips a project
 * UOFT → PRIVATE → UOFT while tidying it up has not published it twice, and
 * their followers should not hear about it twice.
 *
 * Returns the stamp it applied, so the route that just wrote the project can
 * put it in its own response rather than re-reading the row.
 */
export async function announcePublish(project: {
  id: string
  ownerId: string
  title: string
  visibility: Visibility
  publishedAt: Date | null
}): Promise<Date | null> {
  if (project.visibility === 'PRIVATE' || project.publishedAt) return null

  const publishedAt = new Date()
  await db.project.update({ where: { id: project.id }, data: { publishedAt } })

  const [owner, followers] = await Promise.all([
    db.user.findUnique({ where: { id: project.ownerId }, select: { name: true } }),
    db.follow.findMany({
      where: { followingId: project.ownerId },
      select: { followerId: true },
      take: FANOUT_LIMIT,
    }),
  ])

  await notifyMany(
    followers.map((f) => f.followerId),
    'FOLLOWING_PUBLISHED',
    {
      projectId: project.id,
      projectTitle: project.title,
      ownerId: project.ownerId,
      ownerName: owner?.name,
    },
    // Stamped for traceability, not for deduplication — the `publishedAt`
    // guard above is what makes this fire once, and a fan-out cannot afford
    // an existence check per recipient anyway.
    `published:${project.id}`
  )

  return publishedAt
}
