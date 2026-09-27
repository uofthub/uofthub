import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { publish } from '../lib/live.js'
import { block } from '../lib/blocks.js'
import { emailNewMessage } from '../lib/notificationEmails.js'
import { sendPush } from '../lib/push.js'
import { bySession } from '../lib/rateLimit.js'
import { isReportReason, reportDetails, reportRateLimit } from '../lib/reports.js'

/**
 * Direct messages between two students.
 *
 * Deliberately small: one-to-one, text only, no groups, no attachments. A
 * conversation is just the messages between two people, so there is nothing
 * to create before the first one.
 *
 * Anyone may start a conversation with a student who allows messages (the
 * default). A student who turns that off can still be answered by the people
 * they wrote to — turning it off stops strangers, not replies.
 *
 * Blocking is what stops replies too. It closes the conversation both ways
 * until the blocker lifts it, and the blocked student is never told: they see
 * the same "not taking new messages" as an opt-out. A student who has been
 * messaged can also report the conversation, which files the recent thread
 * with moderators; a moderator can suspend the sender's messaging.
 */

export const MESSAGE_MAX = 2000
const THREAD_PAGE = 50
const CONVERSATIONS_MAX = 50

const PERSON = { id: true, name: true, avatarUrl: true, faculty: true, campus: true } as const

// A person typing to a friend sends a few a minute; a script sends hundreds.
const sendRateLimit = { rateLimit: { max: 30, timeWindow: '10 minutes', keyGenerator: bySession } }

// How much of a conversation a report files with moderators.
const REPORT_SNAPSHOT = 30

/**
 * Why `from` can't message `to` right now, or null if they can.
 *   suspended   — a moderator suspended `from`'s messaging
 *   blocked     — `from` blocked `to`, and can unblock
 *   unavailable — `to` blocked `from`, or isn't taking messages from strangers.
 *                 One answer for both, so a block is indistinguishable from an
 *                 opt-out.
 */
type Closed = 'suspended' | 'blocked' | 'unavailable'

async function whyClosed(
  from: string,
  to: { id: string; allowMessages: boolean }
): Promise<Closed | null> {
  const [sender, blocks, openToThem] = await Promise.all([
    db.user.findUnique({ where: { id: from }, select: { messagingSuspendedAt: true } }),
    db.userBlock.findMany({
      where: {
        OR: [
          { blockerId: from, blockedId: to.id },
          { blockerId: to.id, blockedId: from },
        ],
      },
      select: { blockerId: true },
    }),
    to.allowMessages || wroteTo(to.id, from),
  ])
  if (sender?.messagingSuspendedAt) return 'suspended'
  if (blocks.some((b) => b.blockerId === from)) return 'blocked'
  if (blocks.length > 0) return 'unavailable'
  if (!openToThem) return 'unavailable'
  return null
}

const CLOSED_ERRORS: Record<Closed, string> = {
  suspended: 'A moderator has suspended your messaging',
  blocked: 'Unblock them to send a message',
  unavailable: 'They are not taking new messages',
}

/** Whether `from` has ever sent `to` a message. */
async function wroteTo(from: string, to: string) {
  const found = await db.message.findFirst({
    where: { senderId: from, recipientId: to },
    select: { id: true },
  })
  return !!found
}

export const messageRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] }

  // GET /messages — conversations, most recent first, each with its last
  // message and how many of the other person's messages are unread
  app.get('/', auth, async (request) => {
    const me = request.user.sub

    // The latest message per other person, in one pass. DISTINCT ON is the
    // Postgres way to say "first row of each group", which Prisma cannot.
    const latest = await db.$queryRaw<
      { other: string; id: string; body: string; senderId: string; createdAt: Date }[]
    >`
      SELECT DISTINCT ON (other) other, id, body, "senderId", "createdAt"
      FROM (
        SELECT CASE WHEN "senderId" = ${me} THEN "recipientId" ELSE "senderId" END AS other,
               id, body, "senderId", "createdAt"
        FROM "Message"
        WHERE "senderId" = ${me} OR "recipientId" = ${me}
      ) m
      ORDER BY other, "createdAt" DESC
    `
    latest.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const recent = latest.slice(0, CONVERSATIONS_MAX)

    const [people, unread, blocks] = await Promise.all([
      db.user.findMany({ where: { id: { in: recent.map((r) => r.other) } }, select: PERSON }),
      db.message.groupBy({
        by: ['senderId'],
        where: { recipientId: me, readAt: null },
        _count: { id: true },
      }),
      db.userBlock.findMany({
        where: { blockerId: me, blockedId: { in: recent.map((r) => r.other) } },
        select: { blockedId: true },
      }),
    ])

    return recent.flatMap((r) => {
      const user = people.find((p) => p.id === r.other)
      if (!user) return []
      return [
        {
          user,
          lastMessage: {
            id: r.id,
            body: r.body,
            fromMe: r.senderId === me,
            createdAt: r.createdAt,
          },
          unread: unread.find((u) => u.senderId === r.other)?._count.id ?? 0,
          blocked: blocks.some((b) => b.blockedId === r.other),
        },
      ]
    })
  })

  // GET /messages/unread — the header badge
  app.get('/unread', auth, async (request) => {
    const count = await db.message.count({
      where: { recipientId: request.user.sub, readAt: null },
    })
    return { count }
  })

  // GET /messages/:userId?before — one conversation, oldest first, a page at a
  // time going back. Reading it marks the other person's messages read.
  app.get<{ Params: { userId: string }; Querystring: { before?: string } }>(
    '/:userId',
    auth,
    async (request, reply) => {
      const me = request.user.sub
      const other = await db.user.findUnique({
        where: { id: request.params.userId },
        select: { ...PERSON, allowMessages: true },
      })
      if (!other || other.id === me) return reply.code(404).send({ error: 'Not found' })

      const before = request.query.before ? new Date(request.query.before) : null
      if (before && Number.isNaN(before.getTime()))
        return reply.code(400).send({ error: 'before must be a date' })

      const page = await db.message.findMany({
        where: {
          OR: [
            { senderId: me, recipientId: other.id },
            { senderId: other.id, recipientId: me },
          ],
          ...(before && { createdAt: { lt: before } }),
        },
        orderBy: { createdAt: 'desc' },
        take: THREAD_PAGE,
        select: { id: true, senderId: true, body: true, createdAt: true, readAt: true },
      })

      if (!before) {
        await db.message.updateMany({
          where: { senderId: other.id, recipientId: me, readAt: null },
          data: { readAt: new Date() },
        })
      }

      const { allowMessages, ...user } = other
      const [closed, reported] = await Promise.all([
        whyClosed(me, { id: other.id, allowMessages }),
        db.messageReport.findFirst({
          where: { reporterId: me, reportedId: other.id, status: 'OPEN' },
          select: { id: true },
        }),
      ])
      return {
        user,
        canMessage: closed === null,
        closed,
        // A report needs something to report: at least one message from them.
        canReport: page.some((m) => m.senderId === other.id) || (await wroteTo(other.id, me)),
        reported: !!reported,
        hasMore: page.length === THREAD_PAGE,
        messages: page.reverse().map((m) => ({ ...m, fromMe: m.senderId === me })),
      }
    }
  )

  // POST /messages/:userId — { body }
  app.post<{ Params: { userId: string }; Body: { body?: string } }>(
    '/:userId',
    { ...auth, config: sendRateLimit },
    async (request, reply) => {
      const me = request.user.sub
      const body = (request.body?.body ?? '').trim()
      if (!body) return reply.code(400).send({ error: 'Write something first' })
      if (body.length > MESSAGE_MAX)
        return reply.code(400).send({ error: `A message is at most ${MESSAGE_MAX} characters` })

      const other = await db.user.findUnique({
        where: { id: request.params.userId },
        select: { id: true, allowMessages: true },
      })
      if (!other || other.id === me) return reply.code(404).send({ error: 'Not found' })
      const closed = await whyClosed(me, other)
      if (closed) return reply.code(403).send({ error: CLOSED_ERRORS[closed] })

      // Whether this starts something new for them: nothing of ours unread.
      const waiting = await db.message.count({
        where: { senderId: me, recipientId: other.id, readAt: null },
      })
      const message = await db.message.create({
        data: { senderId: me, recipientId: other.id, body },
        select: { id: true, senderId: true, body: true, createdAt: true, readAt: true },
      })
      const sender = await db.user.findUnique({ where: { id: me }, select: { name: true } })
      const senderName = sender?.name ?? 'Someone'
      if (waiting === 0) emailNewMessage(other.id, senderName)
      // Every message is pushed, unlike email, but under one tag per sender:
      // a burst replaces itself on the lock screen instead of stacking up. The
      // text stays off it — a lock screen is not a private place.
      sendPush(
        [{ userId: other.id }],
        {
          title: senderName,
          body: waiting === 0 ? 'Sent you a message' : `Sent you ${waiting + 1} messages`,
          url: `/messages/${me}`,
          tag: `message:${me}`,
        },
        'messages'
      )
      // The sender too: their other tabs list this conversation as well.
      await publish([other.id, me], 'message')
      return reply.code(201).send({ ...message, fromMe: true })
    }
  )

  // POST /messages/:userId/block — stop the conversation both ways, and the
  // rest of what two students can do to each other (see lib/blocks.ts)
  app.post<{ Params: { userId: string } }>(
    '/:userId/block',
    { ...auth, config: { allowSuspended: true } },
    async (request, reply) => {
      const me = request.user.sub
      const other = await db.user.findUnique({
        where: { id: request.params.userId },
        select: { id: true },
      })
      if (!other || other.id === me) return reply.code(404).send({ error: 'Not found' })
      await block(me, other.id)
      return { blocked: true }
    }
  )

  // DELETE /messages/:userId/block — lift it. Their own opt-out still applies.
  app.delete<{ Params: { userId: string } }>(
    '/:userId/block',
    { ...auth, config: { allowSuspended: true } },
    async (request) => {
      await db.userBlock.deleteMany({
        where: { blockerId: request.user.sub, blockedId: request.params.userId },
      })
      return { blocked: false }
    }
  )

  // POST /messages/:userId/report — { reason, details?, block? }. Files the
  // recent thread with moderators; `block` (the dialog's default) also blocks.
  app.post<{
    Params: { userId: string }
    Body: { reason?: string; details?: string; block?: boolean }
  }>('/:userId/report', { ...auth, config: reportRateLimit }, async (request, reply) => {
    const me = request.user.sub
    const reason = request.body?.reason
    if (!isReportReason(reason))
      return reply.code(400).send({ error: 'A valid reason is required' })

    const other = await db.user.findUnique({
      where: { id: request.params.userId },
      select: { id: true },
    })
    if (!other || other.id === me) return reply.code(404).send({ error: 'Not found' })

    // Only what they sent you can be reported — otherwise a report is a way
    // to put a stranger in front of a moderator with nothing to judge.
    if (!(await wroteTo(other.id, me)))
      return reply.code(400).send({ error: 'They have not messaged you' })

    const existing = await db.messageReport.findFirst({
      where: { reporterId: me, reportedId: other.id, status: 'OPEN' },
      select: { id: true },
    })
    if (existing)
      return reply.code(409).send({ error: 'You have already reported this conversation' })

    const recent = await db.message.findMany({
      where: {
        OR: [
          { senderId: me, recipientId: other.id },
          { senderId: other.id, recipientId: me },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: REPORT_SNAPSHOT,
      select: { senderId: true, body: true, createdAt: true },
    })

    const report = await db.messageReport.create({
      data: {
        reporterId: me,
        reportedId: other.id,
        reason,
        details: reportDetails(request.body.details),
        messages: recent.reverse().map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      },
      select: { id: true, reason: true, status: true, createdAt: true },
    })
    if (request.body.block !== false) await block(me, other.id)

    return reply.code(201).send(report)
  })
}
