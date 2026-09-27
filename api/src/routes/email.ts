import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { readUnsubscribeToken } from '../lib/email.js'

/**
 * `POST /email/unsubscribe?token=` — turn off notification email without
 * signing in, from the token every notification email carries (lib/email.ts).
 *
 * Two callers: Gmail's and Outlook's own Unsubscribe button, which POSTs the
 * `List-Unsubscribe` URL with a form body (RFC 8058), and the web app's
 * /unsubscribe page, which the link in the email's footer opens.
 *
 * POST only, and never a link that acts when opened: Outlook's Safe Links and
 * other mail scanners fetch every URL in a message, and would unsubscribe
 * every U of T recipient the moment the email arrived.
 */
export const emailRoutes: FastifyPluginAsync = async (app) => {
  // The one-click body is `List-Unsubscribe=One-Click`, form-encoded. Nothing
  // in it matters — the token is in the URL — so it is read and ignored.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => done(null, body)
  )

  app.post<{ Querystring: { token?: string }; Body: { token?: string } | string }>(
    '/unsubscribe',
    async (request, reply) => {
      const body = typeof request.body === 'object' ? request.body : undefined
      const token = request.query.token ?? body?.token ?? ''
      const userId = readUnsubscribeToken(token)
      if (!userId) return reply.code(400).send({ error: 'That unsubscribe link is not valid' })
      // A deleted account has nothing left to unsubscribe; say yes all the same.
      await db.user.updateMany({ where: { id: userId }, data: { emailNotifications: false } })
      return { ok: true }
    }
  )
}
