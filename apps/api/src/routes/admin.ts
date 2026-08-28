import type { FastifyPluginAsync } from 'fastify'
import type { ReportStatus } from '@prisma/client'
import { db } from '../db/client.js'
import { requireAdmin } from '../lib/admin.js'
import { notify } from '../lib/notifications.js'

const REPORT_STATUSES = ['OPEN', 'DISMISSED', 'WARNED', 'TAKEN_DOWN'] as const

/** What a moderator can do with a report, and the status it leaves behind. */
const DECISIONS = {
  DISMISS: 'DISMISSED',
  WARN: 'WARNED',
  TAKE_DOWN: 'TAKEN_DOWN',
} as const

type Decision = keyof typeof DECISIONS

const REPORT_SELECT = {
  id: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  reviewNote: true,
  reporter: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true } },
  project: {
    select: {
      id: true,
      title: true,
      description: true,
      visibility: true,
      takenDownAt: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  },
} as const

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: [app.authenticate, requireAdmin] }

  // GET /admin/reports?status=OPEN — the moderation queue. Defaults to OPEN
  // because that's the only status that needs acting on; `all` shows history.
  app.get<{ Querystring: { status?: string } }>('/reports', adminOnly, async (request, reply) => {
    const status = request.query.status ?? 'OPEN'
    if (status !== 'all' && !REPORT_STATUSES.includes(status as ReportStatus)) {
      return reply.code(400).send({ error: 'Unknown status' })
    }

    const reports = await db.report.findMany({
      where: status === 'all' ? {} : { status: status as ReportStatus },
      select: REPORT_SELECT,
      // Oldest first for the queue: the report waiting longest is the one to
      // decide next. (`findMany` without an order is not stable.)
      orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
      take: 100,
    })
    return reports
  })

  // POST /admin/reports/:id/decision — dismiss / warn the owner / take down
  app.post<{ Params: { id: string }; Body: { decision?: string; note?: string } }>(
    '/reports/:id/decision',
    adminOnly,
    async (request, reply) => {
      const decision = request.body?.decision as Decision | undefined
      if (!decision || !(decision in DECISIONS)) {
        return reply.code(400).send({ error: 'Decision must be DISMISS, WARN or TAKE_DOWN' })
      }
      const note = (request.body?.note ?? '').trim().slice(0, 1000) || null

      const report = await db.report.findUnique({
        where: { id: request.params.id },
        include: { project: { select: { id: true, title: true, ownerId: true } } },
      })
      if (!report) return reply.code(404).send({ error: 'Not found' })
      if (report.status !== 'OPEN') return reply.code(409).send({ error: 'This report has already been decided' })

      const decided = {
        status: DECISIONS[decision],
        reviewedAt: new Date(),
        reviewedById: request.user.sub,
        reviewNote: note,
      }

      // The project is actioned before the report is read back, so the
      // response carries the project's post-decision state rather than the
      // visibility it had a moment ago.
      if (decision === 'TAKE_DOWN') {
        // Forced back to PRIVATE rather than deleted — the student keeps their
        // work and their files; it just stops being visible to anyone else.
        // `takenDownAt` is what stops them simply setting it public again
        // (see PATCH /projects/:id).
        await db.project.update({
          where: { id: report.projectId },
          data: { visibility: 'PRIVATE', takenDownAt: new Date() },
        })

        // A project that drew one report usually drew several. Closing the
        // duplicates with the same decision keeps the queue honest and, more
        // to the point, stops the owner being notified once per report.
        await db.report.updateMany({
          where: { projectId: report.projectId, status: 'OPEN' },
          data: decided,
        })
      }

      const updated = await db.report.update({
        where: { id: report.id },
        data: decided,
        select: REPORT_SELECT,
      })

      if (decision !== 'DISMISS') {
        await notify(report.project.ownerId, 'PROJECT_MODERATED', {
          projectId: report.project.id,
          projectTitle: report.project.title,
          action: DECISIONS[decision],
          note,
        })
      }

      return updated
    }
  )
}
