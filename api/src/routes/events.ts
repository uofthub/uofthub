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

export const eventRoutes: FastifyPluginAsync = async (app) => {
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

    const close = () => {
      if (closed) return
      closed = true
      clearInterval(heartbeat)
      clearTimeout(lifetime)
      unsubscribe()
    }
    res.on('close', close)
    request.raw.on('close', close)
  })
}
