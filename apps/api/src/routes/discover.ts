import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { visibleProjectWhere } from '../lib/visibility.js'
import { EMPTY_FILTERS, parseQuery, windowStart, type DiscoverFilters } from '../lib/discovery.js'
import { bySession } from '../lib/rateLimit.js'

const QUERY_MAX = 300

// Each search spends Anthropic credits, so the budget is per session rather
// than per IP (see lib/rateLimit.ts) and tighter than the global ceiling.
const discoverRateLimit = { rateLimit: { max: 20, timeWindow: '1 hour', keyGenerator: bySession } }

export const discoverRoutes: FastifyPluginAsync = async (app) => {
  // GET /discover?q=natural+language+query
  // Authenticated: a signed-out visitor can search from /projects for free,
  // and this route costs money per call.
  app.get<{ Querystring: { q?: string } }>(
    '/',
    { preHandler: [app.authenticate], config: discoverRateLimit },
    async (request, reply) => {
      const q = (request.query.q ?? '').trim().slice(0, QUERY_MAX)
      if (!q) return reply.code(400).send({ error: 'A query is required' })

      let filters: DiscoverFilters | null = null
      try {
        filters = await parseQuery(q)
      } catch (err) {
        // A failed or unconfigured model call degrades to keyword search
        // rather than an error page: an imperfect result beats none.
        app.log.error(err, 'Claude query parsing failed; falling back to keyword search')
      }

      const interpreted = filters ?? { ...EMPTY_FILTERS, search: q }
      const since = windowStart(interpreted.within)

      const projects = await db.project.findMany({
        // AND-composed so the visibility OR and the search OR cannot clobber
        // each other. This route is authenticated, so callerId is always set.
        where: {
          AND: [
            visibleProjectWhere(request.user.sub),
            ...(interpreted.search
              ? [
                  {
                    OR: [
                      { title: { contains: interpreted.search, mode: 'insensitive' as const } },
                      { description: { contains: interpreted.search, mode: 'insensitive' as const } },
                      { tags: { has: interpreted.search } },
                    ],
                  },
                ]
              : []),
            ...(interpreted.tag ? [{ tags: { has: interpreted.tag } }] : []),
            ...(interpreted.faculty
              ? [{ owner: { faculty: { contains: interpreted.faculty, mode: 'insensitive' as const } } }]
              : []),
            ...(since ? [{ createdAt: { gte: since } }] : []),
          ],
        },
        include: {
          owner: { select: { id: true, name: true, faculty: true } },
          _count: { select: { likes: true, comments: true } },
        },
        orderBy:
          interpreted.sort === 'trending'
            ? [{ viewCount: 'desc' as const }, { createdAt: 'desc' as const }]
            : [{ createdAt: 'desc' as const }],
        take: 20,
      })

      return {
        // The client shows this back as chips: a student who sees "faculty:
        // Engineering" understands an empty result, where a black box that
        // simply returned nothing would just look broken.
        filters: interpreted,
        // False when the query was run as a plain keyword search because the
        // model was unavailable — the UI says so rather than implying more.
        interpreted: filters !== null,
        projects,
      }
    }
  )
}
