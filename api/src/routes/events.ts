import type { FastifyPluginAsync } from 'fastify'
import { subscribe } from '../lib/live.js'

/**
 * `GET /events` — a Server-Sent Events stream of the signed-in student's
 * `notification` and `message` events (see lib/live.ts).
 *
 * SSE rather than WebSockets: the traffic only goes one way, it rides the
 * same session cookie as every other request, and the browser's EventSource
 * reconnects by itself.
 */

/** A comment line this often keeps proxies from closing an idle stream. */
export const HEARTBEAT_MS = 25_000

/**
 * The session is checked once, when the stream opens. Ending the stream after
 * this long makes the browser reconnect and prove it again, so a signed-out or
 * expired session stops receiving events within the half hour.
 */
export const MAX_STREAM_MS = 30 * 60 * 1000

/**
 * Open streams one account may hold: a tab each on a few devices. Each one is
 * a socket held for up to half an hour, so without a cap one client could
 * hold thousands. Past it the account's oldest stream is ended rather than
 * the new one refused — the tab just opened is the one being looked at, and
 * an old one reconnects if it is still open.
 */
export const MAX_STREAMS_PER_USER = 8

export const eventRoutes: FastifyPluginAsync = async (app) => {
  // Streams are hijacked, so the server would wait on them forever when it
  // closes. Ending them lets a shutdown finish; the browser reconnects to
  // whichever instance takes over.
  const open = new Set<() => void>()
  /** Each account's open streams, oldest first. */
  const byUser = new Map<string, (() => void)[]>()
  app.addHook('onClose', async () => {
    for (const end of open) end()
  })

  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    const res = reply.raw
    let closed = false
    const write = (chunk: string) => {
      if (!closed) res.write(chunk)
    }

    let unsubscribe: () => void
    try {
      unsubscribe = await subscribe(request.user.sub, (event) =>
        write(`event: ${event}\ndata: \n\n`)
      )
    } catch (err) {
      request.log.error(err, 'could not listen for live events')
      return reply.code(503).send({ error: 'Live updates are unavailable' })
    }

    // Written straight to the socket from here on, so the headers the
    // plugins have set on the reply (CORS above all) are carried over by hand.
    reply.hijack()
    res.writeHead(200, {
      ...(reply.getHeaders() as Record<string, string>),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    // How long the browser waits before reconnecting a dropped stream.
    write('retry: 5000\n\n')

    const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS)
    const lifetime = setTimeout(() => res.end(), MAX_STREAM_MS)

    const userId = request.user.sub
    const close = () => {
      if (closed) return
      closed = true
      open.delete(end)
      const mine = byUser.get(userId)?.filter((e) => e !== end) ?? []
      if (mine.length > 0) byUser.set(userId, mine)
      else byUser.delete(userId)
      clearInterval(heartbeat)
      clearTimeout(lifetime)
      unsubscribe()
    }
    const end = () => {
      close()
      res.end()
    }
    open.add(end)
    const mine = [...(byUser.get(userId) ?? []), end]
    byUser.set(userId, mine)
    // Ending one removes it from the list, so read the oldest off a copy.
    for (const oldest of mine.slice(0, Math.max(mine.length - MAX_STREAMS_PER_USER, 0))) oldest()
    res.on('close', close)
    request.raw.on('close', close)
  })
}
