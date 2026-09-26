import type { Prisma, ReactionKind } from '@prisma/client'
import { db } from '../db/client.js'
import { withCovers } from './covers.js'
import { signedDownloadUrl } from './storage.js'
import { thumbnailContentType } from './outputs.js'

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
  // Accepted collaborators only: an invitation nobody has answered is not a
  // credit, and nor is a TA's viewer access — that is access to the work, not
  // a part in making it.
  collaborators: {
    where: { accepted: true, role: 'COLLABORATOR' },
    select: { title: true, user: { select: { id: true, name: true, avatarUrl: true } } },
  },
  _count: { select: { comments: true } },
  // "Built with UofT Robotics".
  orgProjects: {
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
  const {
    sections: _sections,
    details: _details,
    ...rest
  } = row as T & {
    sections?: unknown
    details?: unknown
  }
  return rest
}

/** What a single project carries that a card does not. */
export const CONTENT_INCLUDE = {
  references: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      kind: true,
      title: true,
      url: true,
      doi: true,
      authors: true,
      year: true,
      note: true,
      key: true,
    },
  },
  outputs: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      kind: true,
      label: true,
      fileId: true,
      linkId: true,
      primaryOfProjectId: true,
      thumbnailKey: true,
    },
  },
} satisfies Prisma.ProjectInclude

type ContentRow = Prisma.ProjectGetPayload<{ include: typeof CONTENT_INCLUDE }>

/** A signed thumbnail URL, or undefined where storage is not configured. */
async function signThumbnail(key: string | null): Promise<string | undefined> {
  if (!key) return undefined
  try {
    return await signedDownloadUrl(key, 'thumbnail', {
      disposition: 'inline',
      contentType: thumbnailContentType(key),
    })
  } catch {
    return undefined
  }
}

/**
 * A decorated single project with its long-form content back on. Outputs are
 * sent with a signed thumbnail URL and a `primary` flag in place of the
 * storage key and the uniqueness marker, neither of which a client needs.
 */
export async function withContent<T extends object>(
  shaped: T,
  row: Pick<ContentRow, 'sections' | 'details' | 'references' | 'outputs'>
) {
  const outputs = await Promise.all(
    row.outputs.map(async ({ thumbnailKey, primaryOfProjectId, ...o }) => ({
      ...o,
      primary: primaryOfProjectId !== null,
      thumbnailUrl: await signThumbnail(thumbnailKey),
    }))
  )
  return {
    ...shaped,
    sections: row.sections,
    details: row.details,
    references: row.references,
    outputs,
  }
}

/** Rows come back from `where: { id: { in } }` in no useful order; restore it. */
export function inOrder<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}
