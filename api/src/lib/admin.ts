import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db/client.js'

/**
 * Moderator gate. Runs after `app.authenticate` and checks the database rather
 * than the JWT: sessions last 7 days, so a token minted while the flag was set
 * would otherwise keep moderator powers for the rest of its life after the
 * flag is revoked. `role` in the JWT is derived from the email domain and is a
 * different thing entirely — it separates students from faculty, not
 * moderators from everyone else.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await db.user.findUnique({
    where: { id: request.user.sub },
    select: { isAdmin: true },
  })
  // Returned, not just sent: an async hook that replies without returning the
  // reply leaves Fastify to decide whether the handler still runs.
  if (!user?.isAdmin) return reply.code(403).send({ error: 'Forbidden' })
}

/** Whether this account is a moderator, for routes open to others too. */
export async function isModerator(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
  return !!user?.isAdmin
}
