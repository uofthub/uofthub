import type { FastifyPluginAsync } from 'fastify'
import type { Prisma } from '@prisma/client'
import { db } from '../db/client.js'
import { visibleProjectWhere } from '../lib/visibility.js'
import { EMPTY_FILTERS, parseQuery, windowStart, type DiscoverFilters } from '../lib/discovery.js'
import { CARD_INCLUDE, decorate, inOrder } from '../lib/projectShape.js'
import { trendingIds } from '../lib/trending.js'
import { parseCampus } from '../lib/campus.js'
import { searchProjectIds } from '../lib/search.js'
import { bySession } from '../lib/rateLimit.js'

const QUERY_MAX = 300

// Each search spends model credits, so the budget is per session rather
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
        app.log.error(err, 'Model query parsing failed; falling back to keyword search')
      }

      const interpreted = filters ?? { ...EMPTY_FILTERS, search: q }
      const since = windowStart(interpreted.within)
      // Re-validated rather than trusted: the zod schema constrains what the
      // model may answer, but its output is still untrusted input to a query.
      const onCampus = parseCampus(interpreted.campus)
      // Same full-text path the directory uses, so both searches agree on what
      // "matches" means and neither falls back to a sequential scan.
      const matchedIds = interpreted.search ? await searchProjectIds(interpreted.search) : null

      const where: Prisma.ProjectWhereInput = {
        // AND-composed: the visibility fragment is itself an OR, so spreading
        // another one alongside it would silently drop one of them. This route
        // is authenticated, so callerId is always set.
        AND: [
          visibleProjectWhere(request.user.sub),
          ...(matchedIds ? [{ id: { in: matchedIds } }] : []),
          ...(interpreted.tag ? [{ tags: { has: interpreted.tag } }] : []),
          ...(interpreted.faculty
            ? [
                {
                  owner: {
                    faculty: { contains: interpreted.faculty, mode: 'insensitive' as const },
                  },
                },
              ]
            : []),
          ...(onCampus ? [{ owner: { campus: onCampus } }] : []),
          ...(since ? [{ createdAt: { gte: since } }] : []),
        ],
      }
      // Trending is this week's activity, the same ranking /projects uses.
      const projects =
        interpreted.sort === 'trending'
          ? await (async () => {
              const ids = await trendingIds(where, { skip: 0, take: 20 })
              return inOrder(
                await db.project.findMany({ where: { id: { in: ids } }, include: CARD_INCLUDE }),
                ids
              )
            })()
          : await db.project.findMany({
              where,
              include: CARD_INCLUDE,
              orderBy: [{ createdAt: 'desc' }],
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
        projects: await decorate(projects, request.user.sub),
      }
    }
  )
}
