import type { FastifyPluginAsync } from 'fastify'
import type { Prisma } from '@prisma/client'
import { db } from '../db/client.js'
import { getOptionalUserId, visibleProjectWhere } from '../lib/visibility.js'
import { CARD_INCLUDE, decorate } from '../lib/projectShape.js'
import { withCovers } from '../lib/covers.js'

/**
 * Collections: a student's hand-picked set of projects ("Best of UTM 2026").
 *
 * A collection itself is readable by anyone, but it never widens what a reader
 * can see — every list of its projects goes through `visibleProjectWhere` for
 * that reader, so a U of T-only project in a collection is still invisible to
 * a signed-out visitor, and its count does not give it away either.
 *
 * Only projects that are listed somewhere already (PUBLIC or UOFT) can be
 * added: putting a draft or a link-only project in a collection would publish
 * it on its owner's behalf.
 */

export const TITLE_MAX = 80
export const DESCRIPTION_MAX = 500
export const ITEMS_MAX = 100
export const COLLECTIONS_PER_USER_MAX = 50
const PREVIEW_COUNT = 3
const PAGE_SIZE = 12
const MAX_PAGE_SIZE = 50

const OWNER = { select: { id: true, name: true, avatarUrl: true, campus: true } } as const

// Creating is cheap and each one is a public page, so it gets a budget.
const writeRateLimit = { rateLimit: { max: 30, timeWindow: '10 minutes' } }

function cleanText(raw: unknown, max: number): string | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null) return null
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? undefined : trimmed || null
}

/** The projects of these collections this reader may see: a count and a few covers. */
async function previews(collectionIds: string[], callerId: string | null) {
  const visible = visibleProjectWhere(callerId)
  const out = new Map<
    string,
    {
      count: number
      projects: { id: string; title: string; type: string | null; coverUrl?: string }[]
    }
  >()
  if (collectionIds.length === 0) return out

  const [counts, items] = await Promise.all([
    db.collectionItem.groupBy({
      by: ['collectionId'],
      where: { collectionId: { in: collectionIds }, project: visible },
      _count: { projectId: true },
    }),
    // Newest additions first; a handful per collection is plenty for a
    // stacked-covers preview, and one query for all of them.
    db.collectionItem.findMany({
      where: { collectionId: { in: collectionIds }, project: visible },
      orderBy: { addedAt: 'desc' },
      select: {
        collectionId: true,
        project: { select: { id: true, title: true, type: true } },
      },
    }),
  ])

  const firstFew = new Map<string, { id: string; title: string; type: string | null }[]>()
  for (const item of items) {
    const list = firstFew.get(item.collectionId) ?? []
    if (list.length < PREVIEW_COUNT) list.push(item.project)
    firstFew.set(item.collectionId, list)
  }
  const covered = await withCovers([...firstFew.values()].flat())
  const byId = new Map(covered.map((p) => [p.id, p]))

  for (const id of collectionIds) {
    out.set(id, {
      count: counts.find((c) => c.collectionId === id)?._count.projectId ?? 0,
      projects: (firstFew.get(id) ?? []).map((p) => byId.get(p.id) ?? p),
    })
  }
  return out
}

async function summaries(
  rows: Prisma.CollectionGetPayload<{ include: { owner: typeof OWNER } }>[],
  callerId: string | null
) {
  const preview = await previews(
    rows.map((r) => r.id),
    callerId
  )
  return rows.map((r) => ({
    ...r,
    projectCount: preview.get(r.id)?.count ?? 0,
    preview: preview.get(r.id)?.projects ?? [],
  }))
}

/** A project that can be put in a collection: listed already, and not taken down. */
async function listable(projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { visibility: true, takenDownAt: true },
  })
  return !!project && ['PUBLIC', 'UOFT'].includes(project.visibility) && !project.takenDownAt
}

export const collectionRoutes: FastifyPluginAsync = async (app) => {
  // GET /collections?owner&take&skip — most recently changed first
  //
  // Collections with nothing this reader can see are left out, unless they
  // are the reader's own: an empty collection is only interesting to its
  // curator.
  app.get<{ Querystring: { owner?: string; take?: string; skip?: string } }>(
    '/',
    async (request) => {
      const callerId = await getOptionalUserId(request)
      const take = Math.min(Math.max(Number(request.query.take) || PAGE_SIZE, 1), MAX_PAGE_SIZE)
      const skip = Math.max(Number(request.query.skip) || 0, 0)
      const hasVisible = { items: { some: { project: visibleProjectWhere(callerId) } } }

      const rows = await db.collection.findMany({
        where: {
          ...(request.query.owner && { ownerId: request.query.owner }),
          ...(callerId ? { OR: [hasVisible, { ownerId: callerId }] } : hasVisible),
        },
        include: { owner: OWNER },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      })
      return summaries(rows, callerId)
    }
  )

  // GET /collections/mine?projectId — the caller's collections, for the
  // "Add to collection" menu, each saying whether it holds that project
  app.get<{ Querystring: { projectId?: string } }>(
    '/mine',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { projectId } = request.query
      const rows = await db.collection.findMany({
        where: { ownerId: request.user.sub },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          _count: { select: { items: true } },
          ...(projectId && { items: { where: { projectId }, select: { projectId: true } } }),
        },
      })
      return rows.map(({ items, _count, ...c }) => ({
        ...c,
        projectCount: _count.items,
        hasProject: !!items?.length,
      }))
    }
  )

  // GET /collections/:id — the collection and the projects in it this reader
  // may see, newest addition first
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const callerId = await getOptionalUserId(request)
    const collection = await db.collection.findUnique({
      where: { id: request.params.id },
      include: { owner: OWNER },
    })
    if (!collection) return reply.code(404).send({ error: 'Not found' })

    const items = await db.collectionItem.findMany({
      where: { collectionId: collection.id, project: visibleProjectWhere(callerId) },
      orderBy: { addedAt: 'desc' },
      take: ITEMS_MAX,
      include: { project: { include: CARD_INCLUDE } },
    })
    const projects = await decorate(
      items.map((i) => i.project),
      callerId
    )
    return { ...collection, projectCount: projects.length, projects }
  })

  // POST /collections — { title, description?, projectId? }
  app.post<{ Body: { title?: string; description?: string; projectId?: string } }>(
    '/',
    { preHandler: [app.authenticate], config: writeRateLimit },
    async (request, reply) => {
      const ownerId = request.user.sub
      const title = cleanText(request.body?.title, TITLE_MAX)
      const description = cleanText(request.body?.description, DESCRIPTION_MAX)
      if (!title) return reply.code(400).send({ error: `A title of up to ${TITLE_MAX} characters` })
      if (description === undefined && request.body?.description !== undefined)
        return reply
          .code(400)
          .send({ error: `A description is at most ${DESCRIPTION_MAX} characters` })

      const projectId = request.body?.projectId
      if (projectId && !(await listable(projectId)))
        return reply.code(400).send({ error: 'Only public or U of T projects can be collected' })

      if ((await db.collection.count({ where: { ownerId } })) >= COLLECTIONS_PER_USER_MAX)
        return reply
          .code(400)
          .send({ error: `You can have at most ${COLLECTIONS_PER_USER_MAX} collections` })

      const collection = await db.collection.create({
        data: {
          ownerId,
          title,
          description: description ?? null,
          ...(projectId && { items: { create: { projectId } } }),
        },
        include: { owner: OWNER },
      })
      return reply.code(201).send(collection)
    }
  )

  // Loads a collection for a write, or answers 404 / 403.
  const ownCollection = async (id: string, userId: string) => {
    const collection = await db.collection.findUnique({ where: { id } })
    if (!collection) return { status: 404 as const }
    if (collection.ownerId !== userId) return { status: 403 as const }
    return { collection }
  }

  // PATCH /collections/:id — { title?, description? }
  app.patch<{ Params: { id: string }; Body: { title?: string; description?: string | null } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const found = await ownCollection(request.params.id, request.user.sub)
      if (!found.collection)
        return reply
          .code(found.status)
          .send({ error: found.status === 404 ? 'Not found' : 'Forbidden' })

      const title = cleanText(request.body?.title, TITLE_MAX)
      const description = cleanText(request.body?.description, DESCRIPTION_MAX)
      if (request.body?.title !== undefined && !title)
        return reply.code(400).send({ error: `A title of up to ${TITLE_MAX} characters` })
      if (request.body?.description !== undefined && description === undefined)
        return reply
          .code(400)
          .send({ error: `A description is at most ${DESCRIPTION_MAX} characters` })

      return db.collection.update({
        where: { id: found.collection.id },
        data: {
          ...(title && { title }),
          ...(description !== undefined && { description }),
        },
        include: { owner: OWNER },
      })
    }
  )

  // DELETE /collections/:id — the curator, or a moderator
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const collection = await db.collection.findUnique({ where: { id: request.params.id } })
      if (!collection) return reply.code(404).send({ error: 'Not found' })
      if (collection.ownerId !== request.user.sub) {
        const me = await db.user.findUnique({
          where: { id: request.user.sub },
          select: { isAdmin: true },
        })
        if (!me?.isAdmin) return reply.code(403).send({ error: 'Forbidden' })
      }
      await db.collection.delete({ where: { id: collection.id } })
      return { ok: true }
    }
  )

  // POST /collections/:id/items — { projectId }. Adding one already there is a no-op.
  app.post<{ Params: { id: string }; Body: { projectId?: string } }>(
    '/:id/items',
    { preHandler: [app.authenticate], config: writeRateLimit },
    async (request, reply) => {
      const found = await ownCollection(request.params.id, request.user.sub)
      if (!found.collection)
        return reply
          .code(found.status)
          .send({ error: found.status === 404 ? 'Not found' : 'Forbidden' })

      const projectId = request.body?.projectId
      if (!projectId) return reply.code(400).send({ error: 'A project is required' })
      if (!(await listable(projectId)))
        return reply.code(400).send({ error: 'Only public or U of T projects can be collected' })

      const where = { collectionId_projectId: { collectionId: found.collection.id, projectId } }
      if (!(await db.collectionItem.findUnique({ where }))) {
        const count = await db.collectionItem.count({
          where: { collectionId: found.collection.id },
        })
        if (count >= ITEMS_MAX)
          return reply.code(400).send({ error: `A collection holds at most ${ITEMS_MAX} projects` })
        await db.collectionItem.create({
          data: { collectionId: found.collection.id, projectId },
        })
        // Touched so "recently updated" means a project was added.
        await db.collection.update({
          where: { id: found.collection.id },
          data: { updatedAt: new Date() },
        })
      }
      return { ok: true, inCollection: true }
    }
  )

  // DELETE /collections/:id/items/:projectId
  app.delete<{ Params: { id: string; projectId: string } }>(
    '/:id/items/:projectId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const found = await ownCollection(request.params.id, request.user.sub)
      if (!found.collection)
        return reply
          .code(found.status)
          .send({ error: found.status === 404 ? 'Not found' : 'Forbidden' })

      await db.collectionItem.deleteMany({
        where: { collectionId: found.collection.id, projectId: request.params.projectId },
      })
      return { ok: true, inCollection: false }
    }
  )
}
