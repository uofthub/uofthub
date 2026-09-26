import type { Prisma } from '@prisma/client'
import { db } from '../db/client.js'
import { startOfUtcDay } from './dates.js'

/**
 * "Trending" means this week, and it means people engaging, not just looking.
 *
 * It used to be all-time views, which kept last year's projects on top forever
 * and made a "Trending this week" heading untrue. The score is the last seven
 * days only:
 *
 *   unique views + 2 × comments + 3 × reactions
 *
 * A reaction or a comment is someone deciding the work was worth saying
 * something about, so it outweighs a glance. Ties go to the more recently
 * published project.
 */

export const TRENDING_WINDOW_DAYS = 7
const WEIGHT = { view: 1, comment: 2, reaction: 3 }

/** Active projects are scored in memory; beyond this many, the newest win entry. */
const CANDIDATE_CAP = 5000

export type TrendingScore = { id: string; score: number }

/** Seven-day scores for a set of project ids. Ids with no activity score 0. */
export async function trendingScores(ids: string[]): Promise<Map<string, number>> {
  const scores = new Map<string, number>(ids.map((id) => [id, 0]))
  if (ids.length === 0) return scores
  const since = startOfUtcDay(TRENDING_WINDOW_DAYS)

  const [views, comments, reactions] = await Promise.all([
    db.projectDailyView.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids }, date: { gte: since } },
      _sum: { count: true },
    }),
    db.comment.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.projectReaction.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ])

  const add = (id: string, n: number) => scores.set(id, (scores.get(id) ?? 0) + n)
  for (const v of views) add(v.projectId, WEIGHT.view * (v._sum.count ?? 0))
  for (const c of comments) add(c.projectId, WEIGHT.comment * c._count._all)
  for (const r of reactions) add(r.projectId, WEIGHT.reaction * r._count._all)
  return scores
}

/**
 * The ids matching `where`, ranked by this week's score, then paged. Callers
 * load the page's rows themselves (see `inOrder` in projectShape.ts).
 *
 * Only projects with some activity this week are scored — every other one
 * scores 0, and among those the order is simply newest first, which the
 * database can page without loading them. So the work grows with how much
 * happened this week, not with how many projects exist.
 */
export async function trendingIds(
  where: Prisma.ProjectWhereInput,
  page: { skip: number; take: number }
): Promise<string[]> {
  const since = startOfUtcDay(TRENDING_WINDOW_DAYS)
  const active = await db.project.findMany({
    where: {
      AND: [
        where,
        {
          OR: [
            { dailyViews: { some: { date: { gte: since }, count: { gt: 0 } } } },
            { comments: { some: { createdAt: { gte: since } } } },
            { reactions: { some: { createdAt: { gte: since } } } },
          ],
        },
      ],
    },
    select: { id: true, publishedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: CANDIDATE_CAP,
  })
  const scores = await trendingScores(active.map((c) => c.id))
  const when = (c: (typeof active)[number]) => (c.publishedAt ?? c.createdAt).getTime()
  const ranked = active
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || when(b) - when(a))
    .map((c) => c.id)

  const end = page.skip + page.take
  if (end <= ranked.length) return ranked.slice(page.skip, end)

  // The quiet ones, newest first, after every project with activity.
  const quiet = await db.project.findMany({
    where: { AND: [where, ...(ranked.length ? [{ id: { notIn: ranked } }] : [])] },
    select: { id: true },
    orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    skip: Math.max(0, page.skip - ranked.length),
    take: end - Math.max(ranked.length, page.skip),
  })
  return [...ranked.slice(page.skip), ...quiet.map((q) => q.id)]
}
