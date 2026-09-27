import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { startOfUtcWeek } from '../lib/dates.js'
import { CARD_INCLUDE, decorate, inOrder } from '../lib/projectShape.js'
import { trendingIds } from '../lib/trending.js'
import { getOptionalUserId, listedProjectWhere } from '../lib/visibility.js'

/**
 * GET /spotlight — the navy banner at the top of the home feed.
 *
 * A moderator's pick for the week when there is one (`curated: true`, with
 * the moderator's note). Otherwise the most active project of the week, and
 * the response says so, so the page never calls an algorithm a pick.
 */
export const spotlightRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request) => {
    const callerId = await getOptionalUserId(request)
    // Listed, not merely visible: the banner is the same for everyone, so a
    // student's own draft or link-only project must never be its "pick".
    const eligible = {
      AND: [listedProjectWhere(!!callerId), { publishedAt: { not: null } }],
    }

    const pick = await db.spotlight.findUnique({
      where: { weekOf: startOfUtcWeek() },
      include: { project: { include: CARD_INCLUDE } },
    })
    if (pick) {
      // A pick the caller cannot see (a U of T project, signed out) falls
      // through to the trending fallback rather than leaking it.
      const visible = await db.project.count({ where: { AND: [{ id: pick.projectId }, eligible] } })
      if (visible) {
        const [project] = await decorate([pick.project], callerId)
        return { curated: true, note: pick.note, weekOf: pick.weekOf, project }
      }
    }

    const ids = await trendingIds(eligible, { skip: 0, take: 1 })
    if (ids.length === 0)
      return { curated: false, note: null, weekOf: startOfUtcWeek(), project: null }
    const rows = inOrder(
      await db.project.findMany({ where: { id: { in: ids } }, include: CARD_INCLUDE }),
      ids
    )
    const [project] = await decorate(rows, callerId)
    return { curated: false, note: null, weekOf: startOfUtcWeek(), project }
  })
}
