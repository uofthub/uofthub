import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { isPushEndpoint, vapidPublicKey } from '../lib/push.js'

/**
 * Subscribing a browser to push notifications (lib/push.ts).
 *
 *   GET    /push/key            the VAPID public key, or null when push is off
 *   POST   /push/subscriptions  { endpoint, keys: { p256dh, auth } } — this browser, for me
 *   DELETE /push/subscriptions  { endpoint } — this browser, no longer
 */

/** Browsers one account keeps subscribed; past it, the oldest is dropped. */
export const SUBSCRIPTIONS_PER_USER = 10

type Subscription = { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

export const pushRoutes: FastifyPluginAsync = async (app) => {
  app.get('/key', async () => ({ publicKey: vapidPublicKey() }))

  app.post<{ Body: Subscription }>(
    '/subscriptions',
    { preHandler: [app.authenticate], config: { allowSuspended: true } },
    async (request, reply) => {
      const me = request.user.sub
      const endpoint = String(request.body?.endpoint ?? '')
      const p256dh = String(request.body?.keys?.p256dh ?? '')
      const auth = String(request.body?.keys?.auth ?? '')
      if (endpoint.length > 1000 || !isPushEndpoint(endpoint))
        return reply.code(400).send({ error: 'That is not a push subscription this site can use' })
      if (!p256dh || !auth || p256dh.length > 200 || auth.length > 100)
        return reply.code(400).send({ error: 'The subscription is missing its keys' })

      // The same browser signing in to another account takes its subscription
      // along: pushes follow whoever is signed in on it now.
      await db.pushSubscription.upsert({
        where: { endpoint },
        update: { userId: me, p256dh, auth },
        create: { userId: me, endpoint, p256dh, auth },
      })
      const stale = await db.pushSubscription.findMany({
        where: { userId: me },
        orderBy: { createdAt: 'desc' },
        skip: SUBSCRIPTIONS_PER_USER,
        select: { id: true },
      })
      if (stale.length)
        await db.pushSubscription.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })
      return reply.code(201).send({ ok: true })
    }
  )

  // Not behind authenticate: signing out calls this after the session may
  // already be gone, and an endpoint is only known to the browser it names.
  app.delete<{ Body: { endpoint?: string } }>('/subscriptions', async (request) => {
    const endpoint = String(request.body?.endpoint ?? '')
    if (endpoint) await db.pushSubscription.deleteMany({ where: { endpoint } })
    return { ok: true }
  })
}
