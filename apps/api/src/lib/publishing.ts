import type { Visibility } from '@prisma/client'
import { db } from '../db/client.js'
import { FANOUT_LIMIT, notifyMany } from './notifications.js'

/**
 * The moment a project stops being private.
 *
 * Two things hang off that moment rather than off `createdAt`: `publishedAt`
 * is stamped (which is what the home feed orders by — a capstone drafted in
 * January and published in March belongs in March), and the owner's followers
 * are told.
 *
 * A project with a show-from date in the future is published now but cannot
 * be seen until then, so the two come apart: `publishedAt` is set to the
 * reveal time, which is when it enters feeds, and the announcement waits for
 * `announceDueProjects` in announcements.ts to find it once that time passes.
 *
 * Announcing happens exactly once, keyed on `announcedAt`. A student who flips
 * a project UOFT → PRIVATE → UOFT while tidying it up has not published it
 * twice, and their followers should not hear about it twice.
 *
 * Returns the project's `publishedAt` as it now stands, so the route that just
 * saved the project can put it in its own response rather than re-reading.
 */
export async function announcePublish(project: {
  id: string
  ownerId: string
  title: string
  visibility: Visibility
  publishedAt: Date | null
  showFrom: Date | null
  announcedAt: Date | null
}): Promise<Date | null> {
  // Once announced, the publish date is history and nothing here moves it.
  if (project.announcedAt) return project.publishedAt

  // Link-only is not published: it reaches nobody who was not handed the URL,
  // so it is not stamped and followers are not told. A draft that was waiting
  // for its show-from date and went back to private is no longer scheduled.
  if (project.visibility === 'PRIVATE' || project.visibility === 'UNLISTED') {
    if (!project.publishedAt) return null
    await db.project.update({ where: { id: project.id }, data: { publishedAt: null } })
    return null
  }

  const now = new Date()
  if (project.showFrom && project.showFrom > now) {
    // Scheduled. It enters feeds when it appears; the sweep announces it then.
    if (project.publishedAt?.getTime() === project.showFrom.getTime()) return project.showFrom
    await db.project.update({
      where: { id: project.id },
      data: { publishedAt: project.showFrom },
    })
    return project.showFrom
  }

  // Visible now. A reveal time already in the past (the sweep has not run
  // yet) is kept; anything else is published this moment.
  const publishedAt =
    project.publishedAt && project.publishedAt <= now ? project.publishedAt : now
  // Claimed and marked in one statement, so a concurrent sweep or a second
  // request cannot announce the same project again.
  const { count } = await db.project.updateMany({
    where: { id: project.id, announcedAt: null },
    data: { announcedAt: now, publishedAt },
  })
  if (count === 1) await notifyFollowersOfPublish(project)
  return publishedAt
}

/** Tell the owner's followers, once. Callers must have claimed `announcedAt` first. */
export async function notifyFollowersOfPublish(project: {
  id: string
  ownerId: string
  title: string
}): Promise<void> {
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
    // Stamped for traceability, not for deduplication — the `announcedAt`
    // claim is what makes this fire once, and a fan-out cannot afford an
    // existence check per recipient anyway.
    `published:${project.id}`
  )
}
