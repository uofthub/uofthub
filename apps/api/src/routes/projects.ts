import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'

export const projectRoutes: FastifyPluginAsync = async (app) => {
  // GET /projects?search&faculty&sort=new|trending&visibility=PUBLIC|UOFT&take&skip
  app.get<{
    Querystring: { search?: string; faculty?: string; sort?: string; take?: string; skip?: string }
  }>('/', async (request) => {
    const { search, faculty, sort, take = '20', skip = '0' } = request.query

    const orderBy =
      sort === 'trending'
        ? [{ viewCount: 'desc' as const }, { createdAt: 'desc' as const }]
        : [{ createdAt: 'desc' as const }]

    const projects = await db.project.findMany({
      where: {
        visibility: 'PUBLIC',
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { tags: { has: search } },
          ],
        }),
        ...(faculty && {
          owner: { faculty: { equals: faculty, mode: 'insensitive' } },
        }),
      },
      include: {
        owner: { select: { id: true, name: true, faculty: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy,
      take: Math.min(Number(take), 50),
      skip: Number(skip),
    })
    return projects
  })

  // GET /projects/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const project = await db.project.findUnique({
      where: { id: request.params.id },
      include: {
        owner: { select: { id: true, name: true, faculty: true } },
        collaborators: {
          where: { accepted: true },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        files: true,
        links: true,
        _count: { select: { likes: true, comments: true } },
      },
    })
    if (!project) return reply.code(404).send({ error: 'Not found' })

    await db.project.update({
      where: { id: project.id },
      data: { viewCount: { increment: 1 } },
    })

    return project
  })

  // POST /projects
  app.post<{
    Body: { title: string; description?: string; tags?: string[]; visibility?: string; links?: { label: string; url: string }[] }
  }>('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { title, description, tags = [], visibility = 'PRIVATE', links = [] } = request.body

    if (!title?.trim()) return reply.code(400).send({ error: 'Title is required' })

    const project = await db.project.create({
      data: {
        ownerId: request.user.sub,
        title: title.trim(),
        description: description?.trim(),
        tags,
        visibility: visibility as 'PRIVATE' | 'UOFT' | 'PUBLIC',
        links: links.length ? { create: links } : undefined,
      },
      include: {
        owner: { select: { id: true, name: true, faculty: true } },
        links: true,
        _count: { select: { likes: true, comments: true } },
      },
    })

    return reply.code(201).send(project)
  })

  // PATCH /projects/:id
  app.patch<{
    Params: { id: string }
    Body: { title?: string; description?: string; tags?: string[]; visibility?: string }
  }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const project = await db.project.findUnique({ where: { id: request.params.id } })
    if (!project) return reply.code(404).send({ error: 'Not found' })
    if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

    const { title, description, tags, visibility } = request.body

    const updated = await db.project.update({
      where: { id: project.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(tags !== undefined && { tags }),
        ...(visibility !== undefined && { visibility: visibility as 'PRIVATE' | 'UOFT' | 'PUBLIC' }),
      },
      include: {
        owner: { select: { id: true, name: true, faculty: true } },
        links: true,
        _count: { select: { likes: true, comments: true } },
      },
    })
    return updated
  })

  // DELETE /projects/:id
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const project = await db.project.findUnique({ where: { id: request.params.id } })
    if (!project) return reply.code(404).send({ error: 'Not found' })
    if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

    await db.project.delete({ where: { id: project.id } })
    return { ok: true }
  })

  // POST /projects/:id/like — toggles like
  app.post<{ Params: { id: string } }>('/:id/like', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.sub

    const existing = await db.projectLike.findUnique({
      where: { projectId_userId: { projectId: id, userId } },
    })

    if (existing) {
      await db.projectLike.delete({ where: { projectId_userId: { projectId: id, userId } } })
      return { liked: false }
    }

    await db.projectLike.create({ data: { projectId: id, userId } })
    return { liked: true }
  })

  // GET /projects/:id/comments
  app.get<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const comments = await db.comment.findMany({
      where: { projectId: request.params.id },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return comments
  })

  // POST /projects/:id/comments
  app.post<{ Params: { id: string }; Body: { body: string } }>(
    '/:id/comments',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { body } = request.body
      if (!body?.trim()) return reply.code(400).send({ error: 'Comment body is required' })

      const comment = await db.comment.create({
        data: { projectId: request.params.id, userId: request.user.sub, body: body.trim() },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
      return reply.code(201).send(comment)
    }
  )

  // GET /projects/:id/likes/me — check if current user liked
  app.get<{ Params: { id: string } }>('/:id/likes/me', { preHandler: [app.authenticate] }, async (request) => {
    const like = await db.projectLike.findUnique({
      where: { projectId_userId: { projectId: request.params.id, userId: request.user.sub } },
    })
    return { liked: !!like }
  })

  // POST /projects/:id/collaborators — invite
  app.post<{ Params: { id: string }; Body: { email: string } }>(
    '/:id/collaborators',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      const invitee = await db.user.findUnique({ where: { email: request.body.email } })
      if (!invitee) return reply.code(404).send({ error: 'User not found' })
      if (invitee.id === request.user.sub) return reply.code(400).send({ error: 'Cannot invite yourself' })

      const collab = await db.projectCollaborator.upsert({
        where: { projectId_userId: { projectId: project.id, userId: invitee.id } },
        update: {},
        create: { projectId: project.id, userId: invitee.id, role: 'COLLABORATOR', accepted: false },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
      return reply.code(201).send(collab)
    }
  )

  // PATCH /projects/:id/collaborators/:userId — accept/deny invite
  app.patch<{ Params: { id: string; userId: string }; Body: { accepted: boolean } }>(
    '/:id/collaborators/:userId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id, userId } = request.params
      if (userId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      const collab = await db.projectCollaborator.update({
        where: { projectId_userId: { projectId: id, userId } },
        data: { accepted: request.body.accepted },
      })
      return collab
    }
  )

  // DELETE /projects/:id/collaborators/:userId
  app.delete<{ Params: { id: string; userId: string } }>(
    '/:id/collaborators/:userId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id, userId } = request.params
      const project = await db.project.findUnique({ where: { id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })

      const isOwner = project.ownerId === request.user.sub
      const isSelf = userId === request.user.sub
      if (!isOwner && !isSelf) return reply.code(403).send({ error: 'Forbidden' })

      await db.projectCollaborator.delete({
        where: { projectId_userId: { projectId: id, userId } },
      })
      return { ok: true }
    }
  )

  // POST /projects/:id/links
  app.post<{ Params: { id: string }; Body: { label: string; url: string } }>(
    '/:id/links',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      const link = await db.projectLink.create({
        data: { projectId: project.id, label: request.body.label, url: request.body.url },
      })
      return reply.code(201).send(link)
    }
  )

  // DELETE /projects/:id/links/:linkId
  app.delete<{ Params: { id: string; linkId: string } }>(
    '/:id/links/:linkId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      await db.projectLink.delete({ where: { id: request.params.linkId } })
      return { ok: true }
    }
  )
}
