import { db } from '../db/client.js'

/**
 * Housekeeping that keeps tables from growing without bound. Runs inside the
 * API process like the announcement sweep (see index.ts); every step is an
 * idempotent delete, so two instances running it at once is harmless.
 */

/** Read notifications older than this are gone; unread ones stay until read. */
export const NOTIFICATION_RETENTION_DAYS = 180

export const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000

export async function runMaintenance(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const yesterday = new Date(now)
  yesterday.setUTCHours(0, 0, 0, 0)
  await Promise.all([
    db.notification.deleteMany({ where: { read: true, createdAt: { lt: cutoff } } }),
    // Spent or expired links are worthless; the hash is not worth keeping.
    db.authToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
    }),
    // Normally pruned per project on its first view of the day; this catches
    // the projects nobody has looked at since.
    db.projectViewer.deleteMany({ where: { date: { lt: yesterday } } }),
  ])
}

export function startMaintenance(onError: (err: unknown) => void): () => void {
  const run = () => runMaintenance().catch(onError)
  void run()
  const timer = setInterval(run, MAINTENANCE_INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}
