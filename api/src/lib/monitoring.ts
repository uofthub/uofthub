import { createClient, type CluelineClient } from '@clueline/core'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

/**
 * Error reporting to Clueline (clueline.dev).
 *
 * Same degradation as email and AI discovery: with no `CLUELINE_API_KEY` this
 * is a no-op with a warning, so local dev and a deploy without monitoring both
 * work. The SDK's own contract is that `reportError` never throws and never
 * rejects, so nothing here can turn a handled request error into a crash.
 */

let client: CluelineClient | null | undefined

function getClient(): CluelineClient | null {
  if (client === undefined) {
    client = process.env.CLUELINE_API_KEY
      ? createClient({
          apiKey: process.env.CLUELINE_API_KEY,
          // The SDK types this as the two it knows about, so anything else
          // (NODE_ENV=test, say) reports as development rather than inventing
          // a third environment in the dashboard.
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
          release: process.env.RELEASE,
        })
      : null
    if (!client) console.warn('CLUELINE_API_KEY is not set — error reporting is disabled')
  }
  return client
}

/**
 * Whether a failed request is worth a human's attention. A 401 on an expired
 * session, a 404 for a private project, a 400 on a bad payload and a 429 from
 * the rate limiter are all the API working correctly — reporting them would
 * bury the real failures in noise. 5xx and anything unclassified is a bug.
 */
export function isReportable(statusCode: number): boolean {
  return statusCode >= 500 || statusCode === 0
}

/**
 * Fastify `onError` hook. Runs for every error that reaches the error handler,
 * without changing the response the client gets.
 */
export function reportRequestError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: FastifyError
): void {
  const clueline = getClient()
  if (!clueline) return

  const status = reply.statusCode || error.statusCode || 500
  if (!isReportable(status)) return

  // Deliberately fire-and-forget: the response is already on its way out, and
  // waiting on the report would add its latency to every failed request.
  void clueline.reportError(
    error,
    {
      method: request.method,
      // The route pattern (`/projects/:id`), not the filled-in URL — ids are
      // noise for grouping, and a private project's id is not ours to ship.
      route: request.routeOptions?.url ?? request.url,
      statusCode: status,
      requestId: request.id,
      // Present only on authenticated routes; `jwtVerify` populates it.
      userId: request.user?.sub,
    },
    'api_error'
  )
}

/**
 * Last-resort process handlers. An unhandled rejection or uncaught exception
 * usually means the process is about to be in an undefined state, so this
 * reports and then gets out of the way rather than swallowing it.
 */
export function installProcessHandlers(log: (err: unknown, msg: string) => void): void {
  const clueline = getClient()
  if (!clueline) return

  process.on('unhandledRejection', (reason) => {
    log(reason, 'Unhandled rejection')
    void clueline.reportError(
      reason instanceof Error ? reason : new Error(String(reason)),
      { scope: 'process' },
      'unhandled_rejection'
    )
  })

  process.on('uncaughtException', (error) => {
    log(error, 'Uncaught exception')
    void clueline.reportError(error, { scope: 'process' }, 'global_error')
  })
}
