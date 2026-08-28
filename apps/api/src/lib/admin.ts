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
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: request.user.sub },
    select: { isAdmin: true },
  })
  if (!user?.isAdmin) {
    reply.code(403).send({ error: 'Forbidden' })
  }
}
