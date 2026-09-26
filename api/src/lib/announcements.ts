import { db } from '../db/client.js'
import { notifyFollowersOfPublish } from './publishing.js'

/**
 * Announcing projects whose show-from date has passed.
 *
 * A project published with a future show-from date is hidden from everyone
 * but its makers until then (see visibility.ts), so its followers cannot be
 * told when it is saved — they would get a notification for a page that 404s.
 * This finds the ones whose moment has come and tells them.
 *
 * Each due project is claimed and marked in the same statement that finds it.
 * Two API instances, or a run that overlaps the previous one, can never both
 * claim a row, so nobody is told twice. The price is at-most-once: a crash
 * between the claim and the fan-out loses that announcement rather than
 * repeating it, which is the right way round for a notification.
 */

/** How often the sweep runs. A reveal is announced within this of its time. */
export const ANNOUNCE_INTERVAL_MS = 5 * 60 * 1000

/** Announce every project that is due at `now`. Returns the ids announced. */
export async function announceDueProjects(now: Date = new Date()): Promise<string[]> {
  // Only projects that are listed to someone: one taken down, or put back to
  // private or link-only while it waited, has nothing to announce.
  const due = await db.$queryRaw<{ id: string; ownerId: string; title: string }[]>`
    UPDATE "Project"
    SET "announcedAt" = ${now}, "publishedAt" = "showFrom"
    WHERE "announcedAt" IS NULL
      AND "publishedAt" IS NOT NULL
      AND "showFrom" <= ${now}
      AND "visibility" IN ('PUBLIC', 'UOFT')
      AND "takenDownAt" IS NULL
    RETURNING "id", "ownerId", "title"
  `
  for (const project of due) await notifyFollowersOfPublish(project)
  return due.map((p) => p.id)
}

/**
 * Run the sweep now and then every `ANNOUNCE_INTERVAL_MS`. The run at boot
 * catches whatever came due while no instance was up. Returns a stop function.
 */
export function startAnnouncementSweep(onError: (err: unknown) => void): () => void {
  const run = () => announceDueProjects().catch(onError)
  void run()
  const timer = setInterval(run, ANNOUNCE_INTERVAL_MS)
  // The sweep should never be what keeps the process alive.
  timer.unref()
  return () => clearInterval(timer)
}
