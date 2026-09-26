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

/** Candidates are scored in memory; beyond this many, the newest win entry. */
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
 */
export async function trendingIds(
  where: Prisma.ProjectWhereInput,
  page: { skip: number; take: number }
): Promise<string[]> {
  const candidates = await db.project.findMany({
    where,
    select: { id: true, publishedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: CANDIDATE_CAP,
  })
  const scores = await trendingScores(candidates.map((c) => c.id))
  const when = (c: (typeof candidates)[number]) => (c.publishedAt ?? c.createdAt).getTime()

  return candidates
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || when(b) - when(a))
    .slice(page.skip, page.skip + page.take)
    .map((c) => c.id)
}
