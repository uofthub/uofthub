import type { FastifyPluginAsync } from 'fastify'
import type { Campus, Prisma, ProjectType } from '@prisma/client'
import { db } from '../db/client.js'
import { listedProjectWhere } from '../lib/visibility.js'
import { facultyWhere, mainSubjects, normalizeCourseCode } from '../lib/faculties.js'
import { CARD_INCLUDE, decorate, inOrder } from '../lib/projectShape.js'
import { trendingIds, trendingScores } from '../lib/trending.js'
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
 *   TRENDING  → nothing connects them, but people engaged with it this week
 *   NEW       → nothing connects them and it is quiet: the rest of the site
 *
 * The first three are the connected feed, newest first; the last two are
 * discovery, this week's most engaged first and then everything else newest
 * first. The blended feed deals the two together — three connected to every
 * two from discovery — so a student sees past their own circle from the first
 * screen, and scrolling never runs dry until they have seen every project.
 */

const PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

/** How many of a student's own projects are read to infer "their" courses. */
const TAG_SOURCE_LIMIT = 50

type FeedReason =
  | { kind: 'FOLLOWING'; userId: string; userHandle: string; userName: string }
  | { kind: 'COURSE'; tag: string }
  | { kind: 'CAMPUS'; campus: Campus }
  | { kind: 'TRENDING' }
  | { kind: 'NEW' }

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
  /** The subjects of their main area (CSC, MAT) — the program tab. */
  subjects: string[]
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
    subjects: mainSubjects(courses),
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
    owner: { id: string; handle: string; name: string; campus: Campus | null } | null
  },
  affinity: Affinity
): FeedReason {
  if (project.owner && affinity.followeeIds.has(project.ownerId)) {
    return {
      kind: 'FOLLOWING',
      userId: project.owner.id,
      userHandle: project.owner.handle,
      userName: project.owner.name,
    }
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

/**
 * Of the first `n` items of the blended feed, how many are connected: three in
 * every five (C C D C D …) while both halves last, and once one runs out the
 * other fills every slot. Placing each item with the same function is what
 * makes any page line up exactly with the pages before it.
 */
export function connectedAmong(n: number, connected: number, discovery: number): number {
  return Math.min(connected, n, Math.max(Math.ceil((n * 3) / 5), n - discovery))
}

/**
 * The program tab: work filed under a course in the student's main subjects,
 * on any campus. A faculty is far too broad for "your program" — Arts &
 * Science alone runs from CSC to ENG — so it is only the fallback for a
 * student with no courses yet. Null when there is nothing to go on.
 */
function programWhere(affinity: Affinity): Prisma.ProjectWhereInput | null {
  if (affinity.subjects.length > 0)
    return { OR: affinity.subjects.map((s) => ({ courseCode: { startsWith: s } })) }
  return affinity.faculty ? facultyWhere(affinity.faculty) : null
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
      // Listed, not merely visible to this student: a project they only
      // collaborate on is still a draft or link-only to everyone else, and
      // never belongs in a feed.
      listedProjectWhere(true),
      { ownerId: { not: userId } },
      // Only ever-published projects: a draft opened up yesterday belongs in
      // today's feed, and publishedAt is when that happened.
      { publishedAt: { not: null } },
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
            : programWhere(affinity)
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

    const [connectedTotal, discoveryTotal] = await Promise.all([
      connectedOr.length > 0 ? db.project.count({ where: connectedWhere }) : 0,
      db.project.count({ where: trendingWhere }),
    ])
    const end = Math.min(skip + take, connectedTotal + discoveryTotal)
    if (end <= skip) return { items: [] }
    const at = (n: number) => connectedAmong(n, connectedTotal, discoveryTotal)

    const connectedSkip = at(skip)
    const connectedTake = at(end) - connectedSkip
    const discoverySkip = skip - connectedSkip
    const discoveryTake = end - skip - connectedTake

    const [connected, discoveryIds] = await Promise.all([
      connectedTake > 0
        ? db.project.findMany({
            where: connectedWhere,
            include: CARD_INCLUDE,
            orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
            skip: connectedSkip,
            take: connectedTake,
          })
        : [],
      discoveryTake > 0
        ? trendingIds(trendingWhere, { skip: discoverySkip, take: discoveryTake })
        : [],
    ])
    const [discovery, scores] = await Promise.all([
      db.project
        .findMany({ where: { id: { in: discoveryIds } }, include: CARD_INCLUDE })
        .then((rows) => inOrder(rows, discoveryIds)),
      trendingScores(discoveryIds),
    ])

    // Deal them together in the order connectedAmong lays out.
    const rows: Prisma.ProjectGetPayload<{ include: typeof CARD_INCLUDE }>[] = []
    const fromDiscovery = new Set<string>()
    let c = 0
    let d = 0
    for (let n = skip; n < end; n++) {
      if (at(n + 1) > at(n) && c < connected.length) rows.push(connected[c++])
      else if (d < discovery.length) {
        fromDiscovery.add(discovery[d].id)
        rows.push(discovery[d++])
      }
    }

    const projects = await decorate(rows, userId)
    return {
      items: projects.map((project) => ({
        project,
        reason: fromDiscovery.has(project.id)
          ? { kind: (scores.get(project.id) ?? 0) > 0 ? 'TRENDING' : 'NEW' }
          : reasonFor(project, affinity),
      })),
    }
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
    const person = { select: { id: true, handle: true, name: true, avatarUrl: true } }
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
