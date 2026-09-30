import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { campaignSource, isBot, visitorHash } from '../lib/campaigns.js'

/** Long enough for any real browser's; a header is whatever the client sent. */
const clip = (value: string | undefined) => (value ? value.slice(0, 512) : null)

export const campaignRoutes: FastifyPluginAsync = async (app) => {
  // GET /go/:source — where a printed QR code points (uofthub.com/lid is sent
  // here by web/functions/lid.js). Records the scan, then sends the visitor
  // to the home page tagged with where they came from.
  app.get<{ Params: { source: string } }>(
    '/:source',
    {
      // A room of people scanning the same sticker share one campus address;
      // the global 300/min would do, but this keeps a flood of scans from one
      // address writing rows without bound.
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = campaignSource.safeParse(request.params.source)
      if (!parsed.success) return reply.code(404).send({ error: 'Not found' })
      const source = parsed.data

      const userAgent = request.headers['user-agent']
      if (request.method === 'GET' && !isBot(userAgent)) {
        // Not awaited: a slow database must never hold up the redirect, and a
        // failed insert only costs one row of stats.
        db.campaignScan
          .create({
            data: {
              source,
              visitorHash: visitorHash(request.ip, userAgent ?? ''),
              userAgent: clip(userAgent),
              referer: clip(request.headers.referer),
            },
          })
          .catch((err) => request.log.error({ err, source }, 'Could not record a campaign scan'))
      }

      const home = new URL('/', process.env.WEB_URL ?? 'http://localhost:5173')
      home.searchParams.set('utm_source', source)
      home.searchParams.set('utm_medium', 'qr')
      // 302, never 301: a browser caches a permanent redirect and would skip
      // the server — and the count — on every scan after its first.
      return reply.header('Cache-Control', 'no-store').redirect(home.toString(), 302)
    }
  )
}
