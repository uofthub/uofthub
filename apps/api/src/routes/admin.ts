import type { FastifyPluginAsync } from 'fastify'
import type { OrgStatus, ReportStatus } from '@prisma/client'
import { db } from '../db/client.js'
import { requireAdmin } from '../lib/admin.js'
import { notify } from '../lib/notifications.js'
import { emailContactOfDecision } from '../lib/orgEmails.js'
import { startOfUtcWeek } from '../lib/dates.js'
import { isListed } from '../lib/visibility.js'

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

/** The same three outcomes, for a conversation: suspending stands in for taking down. */
const MESSAGE_DECISIONS = {
  DISMISS: 'DISMISSED',
  WARN: 'WARNED',
  SUSPEND: 'TAKEN_DOWN',
} as const

type MessageDecision = keyof typeof MESSAGE_DECISIONS

const MESSAGE_REPORT_SELECT = {
  id: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  reviewNote: true,
  messages: true,
  reporter: { select: { id: true, name: true, email: true } },
  reported: { select: { id: true, name: true, email: true, messagingSuspendedAt: true } },
  reviewedBy: { select: { id: true, name: true } },
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
      if (report.status !== 'OPEN')
        return reply.code(409).send({ error: 'This report has already been decided' })

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

  // ── MESSAGE REPORTS ─────────────────────────────────────────────────────────

  // GET /admin/message-reports?status=OPEN — reported conversations, with the
  // thread as it was filed
  app.get<{ Querystring: { status?: string } }>(
    '/message-reports',
    adminOnly,
    async (request, reply) => {
      const status = request.query.status ?? 'OPEN'
      if (status !== 'all' && !REPORT_STATUSES.includes(status as ReportStatus)) {
        return reply.code(400).send({ error: 'Unknown status' })
      }
      return db.messageReport.findMany({
        where: status === 'all' ? {} : { status: status as ReportStatus },
        select: MESSAGE_REPORT_SELECT,
        orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
        take: 100,
      })
    }
  )

  // POST /admin/message-reports/:id/decision — dismiss / warn the sender /
  // suspend their messaging
  app.post<{ Params: { id: string }; Body: { decision?: string; note?: string } }>(
    '/message-reports/:id/decision',
    adminOnly,
    async (request, reply) => {
      const decision = request.body?.decision as MessageDecision | undefined
      if (!decision || !(decision in MESSAGE_DECISIONS)) {
        return reply.code(400).send({ error: 'Decision must be DISMISS, WARN or SUSPEND' })
      }
      const note = (request.body?.note ?? '').trim().slice(0, 1000) || null

      const report = await db.messageReport.findUnique({
        where: { id: request.params.id },
        select: { id: true, status: true, reportedId: true },
      })
      if (!report) return reply.code(404).send({ error: 'Not found' })
      if (report.status !== 'OPEN')
        return reply.code(409).send({ error: 'This report has already been decided' })

      const decided = {
        status: MESSAGE_DECISIONS[decision],
        reviewedAt: new Date(),
        reviewedById: request.user.sub,
        reviewNote: note,
      }

      if (decision === 'SUSPEND') {
        // They can still read what they have, and anyone can still read what
        // they sent; they just can't send. Lifted from the same queue.
        await db.user.update({
          where: { id: report.reportedId },
          data: { messagingSuspendedAt: new Date() },
        })
        // As with take-downs: one decision closes every open report about the
        // same person, and they are told once.
        await db.messageReport.updateMany({
          where: { reportedId: report.reportedId, status: 'OPEN' },
          data: decided,
        })
      }

      const updated = await db.messageReport.update({
        where: { id: report.id },
        data: decided,
        select: MESSAGE_REPORT_SELECT,
      })

      if (decision !== 'DISMISS') {
        await notify(report.reportedId, 'MESSAGING_MODERATED', {
          action: MESSAGE_DECISIONS[decision],
          note,
        })
      }

      return updated
    }
  )

  // DELETE /admin/users/:id/messaging-suspension — lift a suspension
  app.delete<{ Params: { id: string } }>(
    '/users/:id/messaging-suspension',
    adminOnly,
    async (request, reply) => {
      const { count } = await db.user.updateMany({
        where: { id: request.params.id, messagingSuspendedAt: { not: null } },
        data: { messagingSuspendedAt: null },
      })
      if (count === 0) return reply.code(404).send({ error: 'Not suspended' })
      return { ok: true }
    }
  )

  // ── STUDENT GROUP VERIFICATION ──────────────────────────────────────────────

  const ORG_STATUSES = ['PENDING_VERIFICATION', 'IN_REVIEW', 'INFO_REQUESTED', 'VERIFIED'] as const

  // GET /admin/orgs?status=IN_REVIEW — groups waiting on a decision
  app.get<{ Querystring: { status?: string } }>('/orgs', adminOnly, async (request, reply) => {
    const status = request.query.status ?? 'IN_REVIEW'
    if (status !== 'all' && !ORG_STATUSES.includes(status as OrgStatus)) {
      return reply.code(400).send({ error: 'Unknown status' })
    }

    const orgs = await db.organization.findMany({
      where: status === 'all' ? {} : { status: status as OrgStatus },
      include: {
        members: {
          where: { role: 'ADMIN' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { members: true, projects: true, activities: true } },
      },
      // Oldest submission first — same queue discipline as the reports above.
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
    return orgs
  })

  // POST /admin/orgs/:slug/decision — approve or deny a group left over from
  // the old self-serve flow. "Request more info" went with that flow: there is
  // no longer a way for the group to answer.
  app.post<{ Params: { slug: string }; Body: { decision?: string; note?: string } }>(
    '/orgs/:slug/decision',
    adminOnly,
    async (request, reply) => {
      const decision = request.body?.decision
      if (decision !== 'APPROVE' && decision !== 'DENY') {
        return reply.code(400).send({ error: 'Decision must be APPROVE or DENY' })
      }
      const note = (request.body?.note ?? '').trim().slice(0, 1000) || null

      const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
      if (!org) return reply.code(404).send({ error: 'Not found' })
      if (org.status === 'VERIFIED') {
        return reply.code(409).send({ error: 'This group is already verified' })
      }

      if (decision === 'DENY') {
        // Denial deletes the group and everything hanging off it — reserved
        // for spam and clear-cut cases, per docs/student-groups.md. The email
        // goes out before the row disappears, since it reads from it.
        await emailContactOfDecision(org, 'DENY', note)
        await db.organization.delete({ where: { id: org.id } })
        return { ok: true, deleted: true }
      }

      const verifiedAt = new Date()
      const updated = await db.organization.update({
        where: { id: org.id },
        data: { status: 'VERIFIED', verifiedAt, reviewNote: note, verificationDeadline: null },
      })
      await emailContactOfDecision(updated, 'APPROVE', note)
      return updated
    }
  )

  // ── WEEKLY SPOTLIGHT ────────────────────────────────────────────────────────

  // GET /admin/spotlight — recent and upcoming picks
  app.get('/spotlight', adminOnly, async () => {
    return db.spotlight.findMany({
      orderBy: { weekOf: 'desc' },
      take: 12,
      include: {
        project: {
          select: {
            id: true,
            title: true,
            visibility: true,
            owner: { select: { id: true, name: true } },
          },
        },
        pickedBy: { select: { id: true, name: true } },
      },
    })
  })

  // POST /admin/spotlight — pick a project for a week (this week by default).
  // Picking a week that already has one replaces it.
  app.post<{ Body: { projectId?: string; note?: string; weekOf?: string } }>(
    '/spotlight',
    adminOnly,
    async (request, reply) => {
      const { projectId, weekOf } = request.body ?? {}
      const note = request.body?.note?.trim().slice(0, 200) || null
      if (!projectId) return reply.code(400).send({ error: 'A project is required' })

      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { id: true, visibility: true, takenDownAt: true, showFrom: true },
      })
      if (!project) return reply.code(404).send({ error: 'No project with that id' })
      // The banner is shown to everyone signed in; a draft, a link-only or a
      // still-hidden project would be published by being picked.
      if (!isListed(project)) {
        return reply
          .code(400)
          .send({ error: 'Only public or U of T-visible projects that are showing can be spotlighted' })
      }

      const when = weekOf ? new Date(weekOf) : new Date()
      if (Number.isNaN(when.getTime()))
        return reply.code(400).send({ error: 'weekOf must be a date' })
      const week = startOfUtcWeek(when)

      return db.spotlight.upsert({
        where: { weekOf: week },
        update: { projectId, note, pickedById: request.user.sub },
        create: { projectId, note, weekOf: week, pickedById: request.user.sub },
      })
    }
  )

  // DELETE /admin/spotlight/:weekOf — clear a week, back to the trending fallback
  app.delete<{ Params: { weekOf: string } }>(
    '/spotlight/:weekOf',
    adminOnly,
    async (request, reply) => {
      const when = new Date(request.params.weekOf)
      if (Number.isNaN(when.getTime()))
        return reply.code(400).send({ error: 'weekOf must be a date' })
      await db.spotlight.deleteMany({ where: { weekOf: startOfUtcWeek(when) } })
      return { ok: true }
    }
  )
}
