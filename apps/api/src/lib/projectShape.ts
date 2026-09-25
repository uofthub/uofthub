import type { Prisma, ReactionKind } from '@prisma/client'
import { db } from '../db/client.js'
import { withCovers } from './covers.js'

/**
 * The one shape every project list returns — directory, feed, profile,
 * pinned, discover, spotlight — so a card never has to make a second request
 * for anything it draws.
 *
 * Before this each list returned a bare row plus like and comment counts, and
 * the web app fetched reactions once per card. A feed page was twenty-one
 * requests; now it is one.
 */

export const REACTION_KINDS: ReactionKind[] = ['USEFUL', 'IMPRESSIVE', 'COLLAB']

export const OWNER_SELECT = {
  select: { id: true, name: true, faculty: true, campus: true, avatarUrl: true },
} as const

/** Include for any `findMany` whose rows are shown as project cards. */
export const CARD_INCLUDE = {
  owner: OWNER_SELECT,
  links: true,
  // Accepted only: an invitation nobody has answered is not a credit.
  collaborators: {
    where: { accepted: true },
    select: { user: { select: { id: true, name: true, avatarUrl: true } } },
  },
  _count: { select: { comments: true } },
  // "Built with UofT Robotics" — only verified groups: an unverified page is
  // invisible to everyone but its members, and so is being linked to it.
  orgProjects: {
    where: { org: { status: 'VERIFIED' } },
    select: { org: { select: { slug: true, name: true, type: true } } },
  },
} satisfies Prisma.ProjectInclude

type CardRow = { id: string; ownerId: string; viewCount: number }

export type ReactionCounts = Record<ReactionKind, number>

export const emptyReactions = (): ReactionCounts =>
  Object.fromEntries(REACTION_KINDS.map((k) => [k, 0])) as ReactionCounts

/** Reaction tallies for many projects in one query. */
export async function reactionCounts(projectIds: string[]): Promise<Map<string, ReactionCounts>> {
  const out = new Map<string, ReactionCounts>()
  if (projectIds.length === 0) return out
  const rows = await db.projectReaction.groupBy({
    by: ['projectId', 'kind'],
    where: { projectId: { in: projectIds } },
    _count: { kind: true },
  })
  for (const row of rows) {
    const counts = out.get(row.projectId) ?? emptyReactions()
    counts[row.kind] = row._count.kind
    out.set(row.projectId, counts)
  }
  return out
}

/**
 * Everything a card needs on top of the row: its cover, its reaction tally,
 * which of those reactions are the caller's, and whether they saved it.
 *
 * `viewCount` is removed for everyone but the owner. Views are the owner's
 * feedback, not a public score — a public count rewards whatever gets clicked
 * and makes niche work look unwanted.
 */
export async function decorate<T extends CardRow>(projects: T[], callerId: string | null) {
  const ids = projects.map((p) => p.id)
  const mineOnly = callerId && ids.length ? { userId: callerId, projectId: { in: ids } } : null
  const [withCover, reactions, saved, mine] = await Promise.all([
    withCovers(projects),
    reactionCounts(ids),
    mineOnly
      ? db.projectSave.findMany({ where: mineOnly, select: { projectId: true } })
      : Promise.resolve([]),
    mineOnly
      ? db.projectReaction.findMany({ where: mineOnly, select: { projectId: true, kind: true } })
      : Promise.resolve([]),
  ])
  const savedIds = new Set(saved.map((s) => s.projectId))
  const myReactions = new Map<string, ReactionKind[]>()
  for (const r of mine)
    myReactions.set(r.projectId, [...(myReactions.get(r.projectId) ?? []), r.kind])

  return withCover.map((row) => {
    const { viewCount, ...project } = withoutContent(row)
    const counts = reactions.get(project.id) ?? emptyReactions()
    return {
      ...project,
      ...(project.ownerId === callerId ? { viewCount } : {}),
      reactions: counts,
      reactionTotal: Object.values(counts).reduce((sum, n) => sum + n, 0),
      /** The caller's own reactions, so a card can show them pressed without asking. */
      myReactions: myReactions.get(project.id) ?? [],
      saved: savedIds.has(project.id),
    }
  })
}

/**
 * A row without its long-form content. Sections can run to 100KB, and a card
 * draws none of it, so lists never carry it; the routes that return a single
 * project put it back with `withContent`.
 */
function withoutContent<T extends object>(row: T): Omit<T, 'sections' | 'details'> {
  const { sections: _sections, details: _details, ...rest } = row as T & {
    sections?: unknown
    details?: unknown
  }
  return rest
}

/** A decorated single project with its sections and details back on. */
export function withContent<T extends object>(
  shaped: T,
  row: { sections: Prisma.JsonValue; details: Prisma.JsonValue }
) {
  return { ...shaped, sections: row.sections, details: row.details }
}

/** Rows come back from `where: { id: { in } }` in no useful order; restore it. */
export function inOrder<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}
