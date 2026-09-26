import type { FastifyPluginAsync } from 'fastify'
import type { Campus, Prisma, ProjectType } from '@prisma/client'
import { db } from '../db/client.js'
import { visibleProjectWhere } from '../lib/visibility.js'
import { facultyWhere, normalizeCourseCode } from '../lib/faculties.js'
import { CARD_INCLUDE, decorate, inOrder } from '../lib/projectShape.js'
import { trendingIds } from '../lib/trending.js'
import { parseCampus } from '../lib/campus.js'
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
  /** Course codes, upper-cased: ones they published in, and ones they take. */
  courses: string[]
  campus: Campus | null
  faculty: string | null
}

const PROJECT_TYPES: ProjectType[] = [
  'APP',
  'RESEARCH',
  'FILM',
  'DESIGN',
  'AUDIO',
  'HARDWARE',
  'WRITING',
  'OTHER',
]

/**
 * The feed's tabs. `all` is the blended feed described above; the others are
 * one connection each, newest first, with no trending top-up — a tab called
 * Following that filled up with strangers would be lying.
 */
type Scope = 'all' | 'following' | 'campus' | 'program'
const SCOPES: Scope[] = ['all', 'following', 'campus', 'program']

async function affinityFor(userId: string): Promise<Affinity> {
  const [follows, mine, me] = await Promise.all([
    db.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
    // "Courses you have published in" is inferred from the tags on a student's
    // own projects rather than asked for separately — a CSC343 project is the
    // only evidence that matters, and it is evidence they already gave us.
    db.project.findMany({
      where: { ownerId: userId },
      select: { tags: true, courseCode: true },
      orderBy: { createdAt: 'desc' },
      take: TAG_SOURCE_LIMIT,
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { campus: true, faculty: true, courses: true },
    }),
  ])

  // Plus the courses they told us they take, which is how a first-year with
  // nothing published yet still gets a course-shaped feed.
  const tags = [...mine.flatMap((p) => p.tags), ...(me?.courses ?? [])]

  const courses = [
    ...new Set(
      [...mine.map((p) => p.courseCode), ...(me?.courses ?? [])].flatMap((c) => {
        const code = c && normalizeCourseCode(c)
        return code ? [code] : []
      })
    ),
  ]

  return {
    followeeIds: new Set(follows.map((f) => f.followingId)),
    courses,
    tags: new Set(tags.map((t) => t.toLowerCase())),
    tagQuery: [...new Set(tags.flatMap((t) => [t, t.toUpperCase(), t.toLowerCase()]))],
    campus: me?.campus ?? null,
    faculty: me?.faculty ?? null,
  }
}

/**
 * Why this project reached this student, in priority order — a project from
 * somebody they follow reads as that first, even if it is also from their
 * campus and tagged with one of their courses.
 */
function reasonFor(
  project: {
    ownerId: string
    tags: string[]
    courseCode: string | null
    owner: { id: string; name: string; campus: Campus | null } | null
  },
  affinity: Affinity
): FeedReason {
  if (project.owner && affinity.followeeIds.has(project.ownerId)) {
    return { kind: 'FOLLOWING', userId: project.owner.id, userName: project.owner.name }
  }

  if (project.courseCode && affinity.courses.includes(project.courseCode))
    return { kind: 'COURSE', tag: project.courseCode }
  const tag = project.tags.find((t) => affinity.tags.has(t.toLowerCase()))
  if (tag) return { kind: 'COURSE', tag }

  if (affinity.campus && project.owner?.campus === affinity.campus) {
    return { kind: 'CAMPUS', campus: affinity.campus }
  }

  return { kind: 'TRENDING' }
}

export const feedRoutes: FastifyPluginAsync = async (app) => {
  // GET /feed?scope=all|following|campus|program&campus&type&skip&take
  //
  // `campus` narrows any scope to one campus (the rail's campus chips) and
  // `type` to one kind of work (the phone feed's chips). On the campus tab a
  // campus chip replaces the student's own campus rather than stacking on it.
  app.get<{
    Querystring: { skip?: string; take?: string; scope?: string; campus?: string; type?: string }
  }>('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub
    const take = Math.min(Math.max(Number(request.query.take) || PAGE_SIZE, 1), MAX_PAGE_SIZE)
    const skip = Math.max(Number(request.query.skip) || 0, 0)
    const scope = SCOPES.includes(request.query.scope as Scope)
      ? (request.query.scope as Scope)
      : 'all'
    const onCampus = parseCampus(request.query.campus)
    const type = PROJECT_TYPES.includes(request.query.type as ProjectType)
      ? (request.query.type as ProjectType)
      : null

    const affinity = await affinityFor(userId)

    const eligible: Prisma.ProjectWhereInput[] = [
      visibleProjectWhere(userId),
      { ownerId: { not: userId } },
      // Only ever-published projects: a draft opened up yesterday belongs in
      // today's feed, and publishedAt is when that happened.
      { publishedAt: { not: null } },
      { takenDownAt: null },
      ...(onCampus && scope !== 'campus' ? [{ owner: { campus: onCampus } }] : []),
      ...(type ? [{ type }] : []),
    ]

    const decorateItems = async (
      rows: Prisma.ProjectGetPayload<{ include: typeof CARD_INCLUDE }>[]
    ) => {
      const projects = await decorate(rows, userId)
      return {
        items: projects.map((project) => ({ project, reason: reasonFor(project, affinity) })),
      }
    }

    if (scope !== 'all') {
      const campus = onCampus ?? affinity.campus
      const scoped: Prisma.ProjectWhereInput | null =
        scope === 'following'
          ? affinity.followeeIds.size > 0
            ? { ownerId: { in: [...affinity.followeeIds] } }
            : null
          : scope === 'campus'
            ? campus
              ? { owner: { campus } }
              : {}
            : affinity.faculty
              ? facultyWhere(affinity.faculty)
              : null
      if (!scoped) return { items: [] }

      const rows = await db.project.findMany({
        where: { AND: [...eligible, scoped] },
        include: CARD_INCLUDE,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      })
      return decorateItems(rows)
    }

    // Everything a "connected" project can be connected by. Empty for a
    // brand new account, in which case the whole feed is the top-up below.
    const connectedOr: Prisma.ProjectWhereInput[] = []
    if (affinity.followeeIds.size > 0)
      connectedOr.push({ ownerId: { in: [...affinity.followeeIds] } })
    if (affinity.tagQuery.length > 0) connectedOr.push({ tags: { hasSome: affinity.tagQuery } })
    if (affinity.courses.length > 0) connectedOr.push({ courseCode: { in: affinity.courses } })
    if (affinity.campus) connectedOr.push({ owner: { campus: affinity.campus } })

    const connectedWhere: Prisma.ProjectWhereInput = { AND: [...eligible, { OR: connectedOr }] }
    // Excludes the connected set so a project can never appear in both
    // halves, which would show it twice across a page boundary.
    const trendingWhere: Prisma.ProjectWhereInput = {
      AND: [...eligible, ...(connectedOr.length > 0 ? [{ NOT: { OR: connectedOr } }] : [])],
    }

    const connectedTotal =
      connectedOr.length > 0 ? await db.project.count({ where: connectedWhere }) : 0

    const connected =
      skip < connectedTotal
        ? await db.project.findMany({
            where: connectedWhere,
            include: CARD_INCLUDE,
            orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
            skip,
            take,
          })
        : []

    // The top-up picks up where the connected set ran out, and is ranked by
    // this week's activity (lib/trending.ts), not all-time views.
    const trendingSkip = skip < connectedTotal ? 0 : skip - connectedTotal
    const trendingTake = take - connected.length
    let trending: typeof connected = []
    if (trendingTake > 0) {
      const ids = await trendingIds(trendingWhere, { skip: trendingSkip, take: trendingTake })
      trending = inOrder(
        await db.project.findMany({ where: { id: { in: ids } }, include: CARD_INCLUDE }),
        ids
      )
    }

    return decorateItems([...connected, ...trending])
  })

  // GET /feed/activity — the student's own week: how their work is landing
  app.get('/activity', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub
    const mine = { project: { ownerId: userId } }
    // Everything below excludes the owner's own actions — reacting to or
    // commenting on your own project is allowed, but it is not engagement.
    const others = { userId: { not: userId } }
    const since = startOfUtcDay(7)
    const previously = startOfUtcDay(14)
    const person = { select: { id: true, name: true, avatarUrl: true } }
    const project = { select: { id: true, title: true } }

    const [
      projectCount,
      views,
      previousViews,
      comments,
      reactions,
      collab,
      recentComments,
      recentReactions,
    ] = await Promise.all([
      db.project.count({ where: { ownerId: userId } }),
      db.projectDailyView.aggregate({
        where: { ...mine, date: { gte: since } },
        _sum: { count: true },
      }),
      db.projectDailyView.aggregate({
        where: { ...mine, date: { gte: previously, lt: since } },
        _sum: { count: true },
      }),
      db.comment.count({ where: { ...mine, ...others, createdAt: { gte: since } } }),
      db.projectReaction.count({ where: { ...mine, ...others, createdAt: { gte: since } } }),
      db.projectReaction.count({
        where: { ...mine, ...others, kind: 'COLLAB', createdAt: { gte: since } },
      }),
      db.comment.findMany({
        where: { ...mine, ...others },
        include: { user: person, project },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      db.projectReaction.findMany({
        where: { ...mine, ...others },
        include: { user: person, project },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

    return {
      projectCount,
      views: views._sum.count ?? 0,
      previousViews: previousViews._sum.count ?? 0,
      comments,
      reactions,
      // Of this week's reactions, how many were offers to collaborate.
      collabRequests: collab,
      recentComments: recentComments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        user: c.user,
        project: c.project,
      })),
      recentReactions: recentReactions.map((r) => ({
        kind: r.kind,
        createdAt: r.createdAt,
        user: r.user,
        project: r.project,
      })),
    }
  })
}
