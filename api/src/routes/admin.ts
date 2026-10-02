import type { FastifyPluginAsync } from 'fastify'
import type { ReportReason, ReportStatus } from '@prisma/client'
import { db } from '../db/client.js'
import { requireAdmin } from '../lib/admin.js'
import { notify } from '../lib/notifications.js'
import { removeComment } from '../lib/comments.js'
import { deleteObject } from '../lib/storage.js'
import { startOfUtcWeek } from '../lib/dates.js'
import { isListed } from '../lib/visibility.js'
import { changeHandle, HandleError, normalizeHandle } from '../lib/handles.js'
import { campaignSource } from '../lib/campaigns.js'
import { URGENT_REASONS } from '../lib/reports.js'
import { discardEvidence, keepEvidence } from '../lib/evidence.js'
import { releaseScan } from '../lib/imageScan.js'

const REPORT_STATUSES = ['OPEN', 'DISMISSED', 'WARNED', 'TAKEN_DOWN'] as const
const REPORT_TARGETS = ['PROJECT', 'COMMENT', 'COLLECTION', 'USER', 'ORG_ACTIVITY'] as const

/** What a moderator can do with a report, and the status it leaves behind. */
const DECISIONS = {
  DISMISS: 'DISMISSED',
  WARN: 'WARNED',
  TAKE_DOWN: 'TAKEN_DOWN',
} as const

type Decision = keyof typeof DECISIONS

const PERSON = { select: { id: true, handle: true, name: true, email: true } } as const

const REPORT_SELECT = {
  id: true,
  targetType: true,
  reason: true,
  details: true,
  excerpt: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  reviewNote: true,
  reporter: PERSON,
  reviewedBy: { select: { id: true, handle: true, name: true } },
  subject: { select: { id: true, handle: true, name: true, email: true, suspendedAt: true } },
  project: {
    select: {
      id: true,
      title: true,
      description: true,
      visibility: true,
      takenDownAt: true,
      owner: PERSON,
    },
  },
  comment: { select: { id: true, body: true, deletedAt: true } },
  collection: { select: { id: true, title: true, description: true } },
  activity: {
    select: {
      id: true,
      title: true,
      description: true,
      org: { select: { slug: true, name: true } },
    },
  },
} as const

type ReportRow = {
  id: string
  reason: ReportReason
  targetType: (typeof REPORT_TARGETS)[number]
  projectId: string | null
  commentId: string | null
  collectionId: string | null
  activityId: string | null
  subjectUserId: string | null
}

/** Every open report about the same thing as this one. */
function sameTargetWhere(report: ReportRow) {
  switch (report.targetType) {
    case 'PROJECT':
      return { targetType: report.targetType, projectId: report.projectId }
    case 'COMMENT':
      return { targetType: report.targetType, commentId: report.commentId }
    case 'COLLECTION':
      return { targetType: report.targetType, collectionId: report.collectionId }
    case 'ORG_ACTIVITY':
      return { targetType: report.targetType, activityId: report.activityId }
    case 'USER':
      return { targetType: report.targetType, subjectUserId: report.subjectUserId }
  }
}

/**
 * Taking down what a report is about. A project is forced private and kept
 * (see the route below); a comment, a collection or an event is removed; a
 * profile has its free text and picture cleared. The account itself is a
 * separate decision — see `suspend`.
 *
 * For sexual content, an image it takes off the site is kept rather than
 * deleted, and recorded on the report: if it involves a minor it is evidence,
 * and the law requires it be preserved and reported, not destroyed.
 */
async function takeDown(report: ReportRow): Promise<void> {
  const sexual = report.reason === 'SEXUAL_CONTENT'
  const keep = (key: string | null | undefined) => (key ? keepEvidence(report.id, key) : undefined)
  switch (report.targetType) {
    case 'PROJECT':
      if (report.projectId)
        await db.project.update({
          where: { id: report.projectId },
          data: { visibility: 'PRIVATE', takenDownAt: new Date() },
        })
      return
    case 'COMMENT': {
      if (!report.commentId) return
      const comment = await db.comment.findUnique({
        where: { id: report.commentId },
        select: { _count: { select: { replies: true } } },
      })
      if (comment) await removeComment(report.commentId, comment._count.replies > 0)
      return
    }
    case 'COLLECTION':
      if (report.collectionId)
        await db.collection.deleteMany({ where: { id: report.collectionId } })
      return
    case 'ORG_ACTIVITY': {
      if (!report.activityId) return
      if (sexual) {
        const activity = await db.orgActivity.findUnique({
          where: { id: report.activityId },
          select: { imageKey: true },
        })
        await keep(activity?.imageKey)
      }
      await db.orgActivity.deleteMany({ where: { id: report.activityId } })
      return
    }
    case 'USER': {
      if (!report.subjectUserId) return
      const user = await db.user.findUnique({
        where: { id: report.subjectUserId },
        select: { avatarKey: true },
      })
      await db.user.update({
        where: { id: report.subjectUserId },
        data: {
          bio: null,
          openTo: [],
          websiteUrl: null,
          githubUrl: null,
          linkedinUrl: null,
          avatarUrl: null,
          avatarKey: null,
          avatarIsCustom: false,
        },
      })
      if (sexual) await keep(user?.avatarKey)
      else if (user?.avatarKey) await deleteObject(user.avatarKey).catch(() => undefined)
      return
    }
  }
}

/**
 * The open queue with urgent reasons ahead of everything else, each part
 * oldest first, capped at 100 in all.
 */
async function urgentFirst<T>(
  find: (reason: { in: ReportReason[] } | { notIn: ReportReason[] }, take: number) => Promise<T[]>
): Promise<T[]> {
  const urgent = await find({ in: [...URGENT_REASONS] }, 100)
  const rest = await find({ notIn: [...URGENT_REASONS] }, 100 - urgent.length)
  return [...urgent, ...rest]
}

/** What a report's subject is told happened, in the words the bell uses. */
const TARGET_WORDS: Record<ReportRow['targetType'], string> = {
  PROJECT: 'project',
  COMMENT: 'comment',
  COLLECTION: 'collection',
  USER: 'profile',
  ORG_ACTIVITY: 'group event',
}

/** Suspend an account, and tell its owner. */
async function suspend(userId: string, note: string | null) {
  await db.user.update({ where: { id: userId }, data: { suspendedAt: new Date() } })
  await notify(userId, 'ACCOUNT_MODERATED', { action: 'SUSPENDED', note })
}

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
  reporter: { select: { id: true, handle: true, name: true, email: true } },
  reported: {
    select: { id: true, handle: true, name: true, email: true, messagingSuspendedAt: true },
  },
  reviewedBy: { select: { id: true, handle: true, name: true } },
} as const

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: [app.authenticate, requireAdmin] }

  // GET /admin/reports?status=OPEN&type — the moderation queue. Defaults to
  // OPEN because that's the only status that needs acting on; `all` shows
  // history. `type` narrows it to one kind of thing reported.
  app.get<{ Querystring: { status?: string; type?: string } }>(
    '/reports',
    adminOnly,
    async (request, reply) => {
      const status = request.query.status ?? 'OPEN'
      if (status !== 'all' && !REPORT_STATUSES.includes(status as ReportStatus)) {
        return reply.code(400).send({ error: 'Unknown status' })
      }
      const type = request.query.type
      if (type && !REPORT_TARGETS.includes(type as ReportRow['targetType']))
        return reply.code(400).send({ error: 'Unknown type' })

      const where = {
        ...(status !== 'all' && { status: status as ReportStatus }),
        ...(type && { targetType: type as ReportRow['targetType'] }),
      }
      // Oldest first for the queue: the report waiting longest is the one to
      // decide next. (`findMany` without an order is not stable.)
      const orderBy = { createdAt: status === 'OPEN' ? 'asc' : 'desc' } as const
      if (status !== 'OPEN')
        return db.report.findMany({ where, select: REPORT_SELECT, orderBy, take: 100 })
      return urgentFirst((reason, take) =>
        db.report.findMany({ where: { ...where, reason }, select: REPORT_SELECT, orderBy, take })
      )
    }
  )

  // POST /admin/reports/:id/decision — { decision, note?, suspend? }
  //
  // Dismiss, warn whoever posted it, or take it down. A warning or a
  // take-down closes every other open report about the same thing, so a
  // much-reported comment tells its author once. `suspend` also suspends the
  // author's account, whatever the decision about the content.
  app.post<{
    Params: { id: string }
    Body: { decision?: string; note?: string; suspend?: boolean }
  }>('/reports/:id/decision', adminOnly, async (request, reply) => {
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
    // Filed before reports named their subject: a project's is its owner.
    const subjectId = report.subjectUserId ?? report.project?.ownerId ?? null
    if (report.status !== 'OPEN')
      return reply.code(409).send({ error: 'This report has already been decided' })
    if (request.body?.suspend && subjectId === request.user.sub)
      return reply.code(400).send({ error: 'You cannot suspend yourself' })

    const decided = {
      status: DECISIONS[decision],
      reviewedAt: new Date(),
      reviewedById: request.user.sub,
      reviewNote: note,
    }

    // Reports are closed before the content goes: removing a comment or a
    // collection unlinks the reports about it.
    if (decision === 'DISMISS') {
      await db.report.update({ where: { id: report.id }, data: decided })
      // A scanner's false alarm: put back what it hid, and keep no copy.
      if (report.scanKey) {
        await releaseScan(report.scanKey)
        await discardEvidence(report.id, report.evidenceKeys)
      }
    } else {
      await db.report.updateMany({
        where: { status: 'OPEN', ...sameTargetWhere(report) },
        data: decided,
      })
    }
    if (decision === 'TAKE_DOWN') await takeDown(report)

    if (decision !== 'DISMISS' && subjectId) {
      if (report.targetType === 'PROJECT' && report.project) {
        await notify(subjectId, 'PROJECT_MODERATED', {
          projectId: report.project.id,
          projectTitle: report.project.title,
          action: DECISIONS[decision],
          note,
        })
      } else {
        await notify(subjectId, 'CONTENT_MODERATED', {
          target: TARGET_WORDS[report.targetType],
          projectId: report.projectId,
          action: DECISIONS[decision],
          note,
        })
      }
    }
    if (request.body?.suspend && subjectId) await suspend(subjectId, note)

    return db.report.findUniqueOrThrow({ where: { id: report.id }, select: REPORT_SELECT })
  })

  // POST /admin/projects/:id/restore — { note? } lift a take-down, after an
  // appeal. The project stays private; its owner can publish it again.
  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    '/projects/:id/restore',
    adminOnly,
    async (request, reply) => {
      const note = (request.body?.note ?? '').trim().slice(0, 1000) || null
      const project = await db.project.findUnique({
        where: { id: request.params.id },
        select: { id: true, title: true, ownerId: true, takenDownAt: true },
      })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (!project.takenDownAt)
        return reply.code(409).send({ error: 'This project is not taken down' })
      await db.project.update({ where: { id: project.id }, data: { takenDownAt: null } })
      await notify(project.ownerId, 'PROJECT_MODERATED', {
        projectId: project.id,
        projectTitle: project.title,
        action: 'RESTORED',
        note,
      })
      return { ok: true }
    }
  )

  // ── ACCOUNTS ────────────────────────────────────────────────────────────────

  // GET /admin/users?q= — find an account by name or email
  app.get<{ Querystring: { q?: string } }>('/users', adminOnly, async (request) => {
    const q = (request.query.q ?? '').trim().slice(0, 100)
    return db.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { handle: { contains: normalizeHandle(q) } },
            ],
          }
        : { OR: [{ suspendedAt: { not: null } }, { messagingSuspendedAt: { not: null } }] },
      select: {
        id: true,
        name: true,
        handle: true,
        email: true,
        createdAt: true,
        isAdmin: true,
        suspendedAt: true,
        messagingSuspendedAt: true,
        _count: { select: { ownedProjects: true, comments: true, reportsAbout: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    })
  })

  // POST /admin/users/:id/suspend — { note? }
  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    '/users/:id/suspend',
    adminOnly,
    async (request, reply) => {
      if (request.params.id === request.user.sub)
        return reply.code(400).send({ error: 'You cannot suspend yourself' })
      const user = await db.user.findUnique({
        where: { id: request.params.id },
        select: { id: true, suspendedAt: true },
      })
      if (!user) return reply.code(404).send({ error: 'Not found' })
      if (user.suspendedAt) return reply.code(409).send({ error: 'Already suspended' })
      await suspend(user.id, (request.body?.note ?? '').trim().slice(0, 1000) || null)
      return { ok: true }
    }
  )

  // POST /admin/users/:id/handle — { handle } rename someone's handle: an
  // impersonation report upheld, or a name its rightful owner asked for. The
  // old one is free for them to take at once.
  app.post<{ Params: { id: string }; Body: { handle?: string } }>(
    '/users/:id/handle',
    adminOnly,
    async (request, reply) => {
      const user = await db.user.findUnique({
        where: { id: request.params.id },
        select: { id: true },
      })
      if (!user) return reply.code(404).send({ error: 'Not found' })
      try {
        const handle = await changeHandle(user.id, request.body?.handle, { byModerator: true })
        return { handle }
      } catch (err) {
        if (err instanceof HandleError) return reply.code(err.status).send({ error: err.message })
        throw err
      }
    }
  )

  // DELETE /admin/users/:id/suspension — lift an account suspension
  app.delete<{ Params: { id: string } }>(
    '/users/:id/suspension',
    adminOnly,
    async (request, reply) => {
      const { count } = await db.user.updateMany({
        where: { id: request.params.id, suspendedAt: { not: null } },
        data: { suspendedAt: null },
      })
      if (count === 0) return reply.code(404).send({ error: 'Not suspended' })
      await notify(request.params.id, 'ACCOUNT_MODERATED', { action: 'LIFTED', note: null })
      return { ok: true }
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
      if (status !== 'OPEN')
        return db.messageReport.findMany({
          where: status === 'all' ? {} : { status: status as ReportStatus },
          select: MESSAGE_REPORT_SELECT,
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      return urgentFirst((reason, take) =>
        db.messageReport.findMany({
          where: { status: 'OPEN', reason },
          select: MESSAGE_REPORT_SELECT,
          orderBy: { createdAt: 'asc' },
          take,
        })
      )
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
      const note =
        typeof request.body?.note === 'string'
          ? request.body.note.trim().slice(0, 1000) || null
          : null

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
            owner: { select: { id: true, handle: true, name: true } },
          },
        },
        pickedBy: { select: { id: true, handle: true, name: true } },
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
      const note =
        typeof request.body?.note === 'string'
          ? request.body.note.trim().slice(0, 200) || null
          : null
      if (!projectId) return reply.code(400).send({ error: 'A project is required' })

      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { id: true, visibility: true, takenDownAt: true, showFrom: true },
      })
      if (!project) return reply.code(404).send({ error: 'No project with that id' })
      // The banner is shown to everyone signed in; a draft, a link-only or a
      // still-hidden project would be published by being picked.
      if (!isListed(project)) {
        return reply.code(400).send({
          error: 'Only public or U of T-visible projects that are showing can be spotlighted',
        })
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

  // ── QR CAMPAIGNS ────────────────────────────────────────────────────────────

  // GET /admin/scans?source=lid — how many times a printed code was scanned.
  // `uniqueVisitors` counts distinct visitor hashes, which rotate daily
  // (lib/campaigns.ts): one person scanning on three days counts three times,
  // so it is an upper bound on people, and exact per day.
  app.get<{ Querystring: { source?: string } }>('/scans', adminOnly, async (request, reply) => {
    const parsed = campaignSource.safeParse(request.query.source ?? 'lid')
    if (!parsed.success) return reply.code(400).send({ error: 'Unknown source' })
    const source = parsed.data

    const [[totals], days] = await Promise.all([
      db.$queryRaw<{ total: number; uniqueVisitors: number }[]>`
        SELECT COUNT(*)::int AS "total",
               COUNT(DISTINCT "visitorHash")::int AS "uniqueVisitors"
        FROM "CampaignScan"
        WHERE "source" = ${source}
      `,
      // The last 30 UTC days, today included, with the empty ones as zeros.
      db.$queryRaw<{ date: string; scans: number; uniqueVisitors: number }[]>`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS "date",
               COUNT(s."id")::int AS "scans",
               COUNT(DISTINCT s."visitorHash")::int AS "uniqueVisitors"
        FROM generate_series(
          (now() AT TIME ZONE 'UTC')::date - 29,
          (now() AT TIME ZONE 'UTC')::date,
          interval '1 day'
        ) AS d(day)
        LEFT JOIN "CampaignScan" s
          ON s."source" = ${source}
         AND s."createdAt" >= d.day
         AND s."createdAt" < d.day + interval '1 day'
        GROUP BY d.day
        ORDER BY d.day
      `,
    ])
    return { source, ...totals, days }
  })
}
