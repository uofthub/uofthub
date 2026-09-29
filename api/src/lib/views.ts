import { createHmac } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { db } from '../db/client.js'
import { derivedKey } from './keys.js'

/**
 * Counting a view: one person, once a day.
 *
 * A signed-in viewer is keyed by their id. Anyone else is keyed by an HMAC
 * of their address and browser, which is enough to tell a reload from a
 * second person without storing anything that identifies them — the key is
 * the server's own secret, and only today's keys are ever kept.
 */

function viewerKey(request: FastifyRequest, callerId: string | null): string {
  if (callerId) return `u:${callerId}`
  const who = `${request.ip}|${request.headers['user-agent'] ?? ''}`
  return `a:${createHmac('sha256', derivedKey('view-salt-v1')).update(who).digest('hex').slice(0, 32)}`
}

function todayUtc(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * Record a view of `projectId` unless this viewer was already counted today.
 * Returns whether it counted. The owner's own views never reach here.
 */
export async function recordView(
  projectId: string,
  request: FastifyRequest,
  callerId: string | null
): Promise<boolean> {
  const date = todayUtc()
  try {
    await db.projectViewer.create({
      data: { projectId, date, viewerKey: viewerKey(request, callerId) },
    })
  } catch (err) {
    // Already seen today: the primary key says so, and that is the whole check.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false
    throw err
  }

  await Promise.all([
    db.project.update({ where: { id: projectId }, data: { viewCount: { increment: 1 } } }),
    db.projectDailyView.upsert({
      where: { projectId_date: { projectId, date } },
      update: { count: { increment: 1 } },
      create: { projectId, date, count: 1 },
    }),
    // Yesterday's keys have done their job. Pruned here, per project, so the
    // table only ever holds a day's worth and no scheduled job is needed.
    db.projectViewer.deleteMany({ where: { projectId, date: { lt: date } } }),
  ])
  return true
}
