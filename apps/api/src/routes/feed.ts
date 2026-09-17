import type { FastifyPluginAsync } from 'fastify'
import type { Campus, Prisma } from '@prisma/client'
import { db } from '../db/client.js'
import { visibleProjectWhere } from '../lib/visibility.js'
import { withCovers } from '../lib/covers.js'
import { startOfUtcDay } from '../lib/dates.js'

/**
 * The signed-in home page.
 *
 * `/projects` answers "what exists"; this answers "what is worth looking at
 * today, and why". Nothing here is invented activity — every row is a real
 * project that was really published, carrying the reason it reached this
 * student:
 *
 *   FOLLOWING → its owner is somebody they follow
 *   COURSE    → it is tagged with a course they have published in themselves
 *   CAMPUS    → its owner is at their campus
 *   TRENDING  → the top-up, so a brand new account still lands on something
 *
 * The first three are the connected feed and are ordered by publish time. The
 * fourth only appears once the connected set runs out, which is what keeps a
 * student with no follows from seeing an empty page on their first visit.
 */

const PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

/** How many of a student's own projects are read to infer "their" courses. */
const TAG_SOURCE_LIMIT = 50

const OWNER_SELECT = { select: { id: true, name: true, faculty: true, campus: true } } as const

const FEED_INCLUDE = {
  owner: OWNER_SELECT,
  _count: { select: { likes: true, comments: true } },
} as const

type FeedReason =
  | { kind: 'FOLLOWING'; userId: string; userName: string }
  | { kind: 'COURSE'; tag: string }
  | { kind: 'CAMPUS'; campus: Campus }
  | { kind: 'TRENDING' }

/** What connects this student to everything the connected feed can show them. */
type Affinity = {
  followeeIds: Set<string>
  /** Lowercased, for comparing a candidate project's tags against. */
  tags: Set<string>
  /**
   * The same tags as Postgres has to be asked for them. `hasSome` matches
   * array elements exactly, and there is no case-insensitive form of it, so
   * each tag goes in as written plus its upper- and lowercase spellings —
   * which is the whole of the difference between "CSC343" and "csc343" in
   * practice, and cheaper than dropping to raw SQL for it.
   */
  tagQuery: string[]
  campus: Campus | null
}

async function affinityFor(userId: string): Promise<Affinity> {
  const [follows, mine, me] = await Promise.all([
    db.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
    // "Courses you have published in" is inferred from the tags on a student's
    // own projects rather than asked for separately — a CSC343 project is the
    // only evidence that matters, and it is evidence they already gave us.
    db.project.findMany({
      where: { ownerId: userId },
      select: { tags: true },
      orderBy: { createdAt: 'desc' },
      take: TAG_SOURCE_LIMIT,
    }),
    db.user.findUnique({ where: { id: userId }, select: { campus: true } }),
  ])

  const tags = mine.flatMap((p) => p.tags)

  return {
    followeeIds: new Set(follows.map((f) => f.followingId)),
    tags: new Set(tags.map((t) => t.toLowerCase())),
    tagQuery: [...new Set(tags.flatMap((t) => [t, t.toUpperCase(), t.toLowerCase()]))],
    campus: me?.campus ?? null,
  }
}

/**
 * Why this project reached this student, in priority order — a project from
 * somebody they follow reads as that first, even if it is also from their
 * campus and tagged with one of their courses.
 */
function reasonFor(
  project: { ownerId: string; tags: string[]; owner: { id: string; name: string; campus: Campus | null } | null },
  affinity: Affinity
): FeedReason {
  if (project.owner && affinity.followeeIds.has(project.ownerId)) {
    return { kind: 'FOLLOWING', userId: project.owner.id, userName: project.owner.name }
  }

  const tag = project.tags.find((t) => affinity.tags.has(t.toLowerCase()))
  if (tag) return { kind: 'COURSE', tag }

  if (affinity.campus && project.owner?.campus === affinity.campus) {
    return { kind: 'CAMPUS', campus: affinity.campus }
  }

  return { kind: 'TRENDING' }
}

export const feedRoutes: FastifyPluginAsync = async (app) => {
  // GET /feed?skip&take — the home stream
  app.get<{ Querystring: { skip?: string; take?: string } }>(
    '/',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = request.user.sub
      const take = Math.min(Math.max(Number(request.query.take) || PAGE_SIZE, 1), MAX_PAGE_SIZE)
      const skip = Math.max(Number(request.query.skip) || 0, 0)

      const affinity = await affinityFor(userId)

      // Shared by both halves: something the caller may read, that somebody
      // else published. A student's own work belongs on their profile and in
      // the activity summary, not in the stream of what other people are doing.
      const eligible: Prisma.ProjectWhereInput[] = [
        visibleProjectWhere(userId),
        { ownerId: { not: userId } },
        { publishedAt: { not: null } },
        { takenDownAt: null },
      ]

      const connectedOr: Prisma.ProjectWhereInput[] = []
      if (affinity.followeeIds.size > 0) connectedOr.push({ ownerId: { in: [...affinity.followeeIds] } })
      if (affinity.tagQuery.length > 0) connectedOr.push({ tags: { hasSome: affinity.tagQuery } })
      if (affinity.campus) connectedOr.push({ owner: { campus: affinity.campus } })

      const connectedWhere: Prisma.ProjectWhereInput = { AND: [...eligible, { OR: connectedOr }] }

      // The top-up is everything *else*, not everything. Two disjoint sets are
      // what make paging exact: each half is skipped independently, and no row
      // can land on two pages because the connected half narrowed underneath
      // it. It is also what makes the reason correct without a special case —
      // nothing in this half can match a connection, so every row here is
      // genuinely trending rather than a campus project relabelled.
      const trendingWhere: Prisma.ProjectWhereInput = {
        AND: [...eligible, ...(connectedOr.length > 0 ? [{ NOT: { OR: connectedOr } }] : [])],
      }

      // Skipped entirely for an account with no follows, no projects and no
      // campus — there is nothing for the connected half to match, and
      // everything they see comes from the trending top-up below.
      const connectedTotal = connectedOr.length > 0 ? await db.project.count({ where: connectedWhere }) : 0

      const connected =
        skip < connectedTotal
          ? await db.project.findMany({
              where: connectedWhere,
              include: FEED_INCLUDE,
              // Publish time, not creation time: a capstone drafted in January
              // and opened up in March is March's news.
              orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
              skip,
              take,
            })
          : []

      // The two halves are one list to the caller, so paging past the end of
      // the connected half continues into trending rather than stopping.
      const trendingSkip = skip < connectedTotal ? 0 : skip - connectedTotal
      const trendingTake = take - connected.length

      const trending =
        trendingTake > 0
          ? await db.project.findMany({
              where: trendingWhere,
              include: FEED_INCLUDE,
              orderBy: [{ viewCount: 'desc' }, { publishedAt: 'desc' }],
              skip: trendingSkip,
              take: trendingTake,
            })
          : []

      const projects = await withCovers([...connected, ...trending])

      return {
        items: projects.map((project) => ({ project, reason: reasonFor(project, affinity) })),
      }
    }
  )

  // GET /feed/activity — what happened on this student's own work
  //
  // The other half of "nobody interacts with my project": a view counter that
  // only moves when you reload the page tells you nothing. This is the same
  // data read as a week, with names attached to the parts that have them.
  app.get('/activity', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub
    const mine = { project: { ownerId: userId } }
    const since = startOfUtcDay(7)
    const previously = startOfUtcDay(14)

    const [projectCount, views, previousViews, likes, comments, reactions, recentComments, recentLikes] =
      await Promise.all([
        db.project.count({ where: { ownerId: userId } }),
        db.projectDailyView.aggregate({ where: { ...mine, date: { gte: since } }, _sum: { count: true } }),
        db.projectDailyView.aggregate({
          where: { ...mine, date: { gte: previously, lt: since } },
          _sum: { count: true },
        }),
        // Everything below excludes the owner's own actions — liking and
        // commenting on your own project is allowed, but it is not engagement.
        db.projectLike.count({ where: { ...mine, userId: { not: userId }, createdAt: { gte: since } } }),
        db.comment.count({ where: { ...mine, userId: { not: userId }, createdAt: { gte: since } } }),
        db.projectReaction.count({ where: { ...mine, userId: { not: userId }, createdAt: { gte: since } } }),
        db.comment.findMany({
          where: { ...mine, userId: { not: userId } },
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
            project: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        db.projectLike.findMany({
          where: { ...mine, userId: { not: userId } },
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
            project: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ])

    return {
      projectCount,
      views: views._sum.count ?? 0,
      previousViews: previousViews._sum.count ?? 0,
      likes,
      comments,
      reactions,
      recentComments: recentComments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        user: c.user,
        project: c.project,
      })),
      recentLikes: recentLikes.map((l) => ({
        createdAt: l.createdAt,
        user: l.user,
        project: l.project,
      })),
    }
  })
}
