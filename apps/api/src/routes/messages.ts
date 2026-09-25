import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { bySession } from '../lib/rateLimit.js'

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
 */

export const MESSAGE_MAX = 2000
const THREAD_PAGE = 50
const CONVERSATIONS_MAX = 50

const PERSON = { id: true, name: true, avatarUrl: true, faculty: true, campus: true } as const

// A person typing to a friend sends a few a minute; a script sends hundreds.
const sendRateLimit = { rateLimit: { max: 30, timeWindow: '10 minutes', keyGenerator: bySession } }

/** Whether `from` may message `to` right now. */
async function canMessage(from: string, to: { id: string; allowMessages: boolean }) {
  if (from === to.id) return false
  if (to.allowMessages) return true
  const wroteFirst = await db.message.findFirst({
    where: { senderId: to.id, recipientId: from },
    select: { id: true },
  })
  return !!wroteFirst
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

    const [people, unread] = await Promise.all([
      db.user.findMany({ where: { id: { in: recent.map((r) => r.other) } }, select: PERSON }),
      db.message.groupBy({
        by: ['senderId'],
        where: { recipientId: me, readAt: null },
        _count: { id: true },
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
      return {
        user,
        canMessage: await canMessage(me, { id: other.id, allowMessages }),
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
      if (!(await canMessage(me, other)))
        return reply.code(403).send({ error: 'They are not taking new messages' })

      const message = await db.message.create({
        data: { senderId: me, recipientId: other.id, body },
        select: { id: true, senderId: true, body: true, createdAt: true, readAt: true },
      })
      return reply.code(201).send({ ...message, fromMe: true })
    }
  )
}
