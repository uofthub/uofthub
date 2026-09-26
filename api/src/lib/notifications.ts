import type { NotificationType, Prisma } from '@prisma/client'
import { db } from '../db/client.js'

/**
 * Writing to somebody's notification feed.
 *
 * Every social notification here is triggered by another student's action, so
 * each one is also a way to pester somebody. The rules that keep that in check
 * live in this file rather than at the call sites:
 *
 *   - `notify` announces something genuinely new each time (a comment, a fork).
 *   - `notifyOnce` announces a state a person can toggle (a like, a follow, a
 *     reaction) and fires only the first time. Un-liking and re-liking a
 *     project twenty times is otherwise twenty pings.
 *   - `notifyMany` fans one announcement out to a bounded audience.
 *
 * Nobody is ever notified about their own action; that check belongs to the
 * caller, which is the only place that knows who the actor is.
 */

export async function notify(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
  key?: string
): Promise<void> {
  await db.notification.create({
    data: { userId, type, key, payload: payload as Prisma.InputJsonValue },
  })
}

/**
 * Notify unless this exact announcement has already been made. `key` is the
 * identity of the thing being announced (`like:<projectId>:<actorId>`), not of
 * the notification — two different people liking the same project are two
 * different keys and both get through.
 */
export async function notifyOnce(
  userId: string,
  type: NotificationType,
  key: string,
  payload: Record<string, unknown>
): Promise<void> {
  const existing = await db.notification.findFirst({
    where: { userId, type, key },
    select: { id: true },
  })
  if (existing) return
  await notify(userId, type, payload, key)
}

/**
 * "Somebody did something to your project."
 *
 * Every engagement notification is shaped the same way — look up the project,
 * skip it if the actor is the owner, and denormalize both names into the
 * payload — so the routes say what happened and this says how it is delivered.
 * Passing a `key` makes it fire only the first time (see `notifyOnce`).
 */
export async function notifyProjectOwner(
  projectId: string,
  actorId: string,
  type: NotificationType,
  options: { key?: string; extra?: Record<string, unknown> } = {}
): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, ownerId: true },
  })
  // Liking your own project is allowed; being told about it is not useful.
  if (!project || project.ownerId === actorId) return

  const actor = await db.user.findUnique({ where: { id: actorId }, select: { name: true } })
  const payload = {
    projectId: project.id,
    projectTitle: project.title,
    actorId,
    actorName: actor?.name,
    ...options.extra,
  }

  if (options.key) await notifyOnce(project.ownerId, type, options.key, payload)
  else await notify(project.ownerId, type, payload)
}

/**
 * The most followers one publish will notify.
 *
 * A fan-out is the one notification that scales with somebody else's
 * popularity rather than with their own actions, so it gets a ceiling. At the
 * size this site is built for, nobody reaches it; if somebody ever does, the
 * publish still succeeds and the feed on `/` still shows their project to
 * every follower — only the bell stops short.
 */
export const FANOUT_LIMIT = 500

/** One announcement to many people, in a single insert. */
export async function notifyMany(
  userIds: string[],
  type: NotificationType,
  payload: Record<string, unknown>,
  key?: string
): Promise<void> {
  if (userIds.length === 0) return
  await db.notification.createMany({
    data: userIds.slice(0, FANOUT_LIMIT).map((userId) => ({
      userId,
      type,
      key,
      payload: payload as Prisma.InputJsonValue,
    })),
  })
}
