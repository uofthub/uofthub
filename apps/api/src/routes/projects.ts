import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import {
  canViewProject,
  canViewProjectId,
  getOptionalUserId,
  visibleProjectWhere,
} from '../lib/visibility.js'

export const projectRoutes: FastifyPluginAsync = async (app) => {
  // GET /projects?search&faculty&sort=new|trending&visibility=PUBLIC|UOFT&take&skip
  app.get<{
    Querystring: { search?: string; faculty?: string; sort?: string; take?: string; skip?: string }
  }>('/', async (request) => {
    const { search, faculty, sort, take = '20', skip = '0' } = request.query
    const callerId = await getOptionalUserId(request)

    const orderBy =
      sort === 'trending'
        ? [{ viewCount: 'desc' as const }, { createdAt: 'desc' as const }]
        : [{ createdAt: 'desc' as const }]

    const projects = await db.project.findMany({
      // AND-composed: the visibility fragment also uses OR, so spreading it
      // alongside the search OR would silently drop one of them.
      where: {
        AND: [
          visibleProjectWhere(callerId),
          ...(search
            ? [
                {
                  OR: [
                    { title: { contains: search, mode: 'insensitive' as const } },
                    { description: { contains: search, mode: 'insensitive' as const } },
                    { tags: { has: search } },
                  ],
                },
              ]
            : []),
          ...(faculty
            ? [{ owner: { faculty: { equals: faculty, mode: 'insensitive' as const } } }]
            : []),
        ],
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
    const callerId = await getOptionalUserId(request)

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

    // 404 rather than 403: a private project should not confirm its own id.
    if (!canViewProject(project, callerId)) {
      return reply.code(404).send({ error: 'Not found' })
    }

    // Count views from everyone except the owner, so analytics reflect real
    // interest rather than the owner reloading their own page.
    if (callerId !== project.ownerId) {
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      await Promise.all([
        db.project.update({ where: { id: project.id }, data: { viewCount: { increment: 1 } } }),
        db.projectDailyView.upsert({
          where: { projectId_date: { projectId: project.id, date: today } },
          update: { count: { increment: 1 } },
          create: { projectId: project.id, date: today, count: 1 },
        }),
      ])
    }

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

    if (!(await canViewProjectId(id, userId))) {
      return reply.code(404).send({ error: 'Not found' })
    }

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
    const callerId = await getOptionalUserId(request)
    if (!(await canViewProjectId(request.params.id, callerId))) {
      return reply.code(404).send({ error: 'Not found' })
    }

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

      if (!(await canViewProjectId(request.params.id, request.user.sub))) {
        return reply.code(404).send({ error: 'Not found' })
      }

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

      // Emails are stored lowercased at sign-up, so normalize before lookup.
      const invitee = await db.user.findUnique({
        where: { email: (request.body.email ?? '').trim().toLowerCase() },
      })
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

      // Without this, responding to an invite that does not exist throws
      // Prisma's P2025 and surfaces as a 500.
      const invite = await db.projectCollaborator.findUnique({
        where: { projectId_userId: { projectId: id, userId } },
      })
      if (!invite) return reply.code(404).send({ error: 'No invitation found' })

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

      // Scope the delete to this project: owning one project must not grant
      // the ability to delete another project's link by id.
      const { count } = await db.projectLink.deleteMany({
        where: { id: request.params.linkId, projectId: project.id },
      })
      if (count === 0) return reply.code(404).send({ error: 'Link not found' })

      return { ok: true }
    }
  )

  // ── VERSIONING ─────────────────────────────────────────────────────────────

  // GET /projects/:id/versions
  app.get<{ Params: { id: string } }>('/:id/versions', async (request, reply) => {
    const callerId = await getOptionalUserId(request)
    if (!(await canViewProjectId(request.params.id, callerId))) {
      return reply.code(404).send({ error: 'Not found' })
    }

    const versions = await db.projectVersion.findMany({
      where: { projectId: request.params.id },
      orderBy: { versionNum: 'desc' },
    })
    return versions
  })

  // POST /projects/:id/versions — snapshot current state as a new version
  app.post<{ Params: { id: string }; Body: { label?: string } }>(
    '/:id/versions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      const latest = await db.projectVersion.findFirst({
        where: { projectId: project.id },
        orderBy: { versionNum: 'desc' },
      })

      const version = await db.projectVersion.create({
        data: {
          projectId: project.id,
          versionNum: (latest?.versionNum ?? 0) + 1,
          title: project.title,
          description: project.description,
          tags: project.tags,
        },
      })
      return reply.code(201).send(version)
    }
  )

  // ── FORK / REMIX ────────────────────────────────────────────────────────────

  // POST /projects/:id/fork
  app.post<{ Params: { id: string } }>(
    '/:id/fork',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const original = await db.project.findUnique({
        where: { id: request.params.id },
        include: {
          links: true,
          collaborators: { select: { userId: true, accepted: true } },
        },
      })
      if (!original) return reply.code(404).send({ error: 'Not found' })

      // Same rule as reading it, so collaborators can fork and a private id is
      // not confirmed by a 403.
      if (!canViewProject(original, request.user.sub)) {
        return reply.code(404).send({ error: 'Not found' })
      }

      const fork = await db.project.create({
        data: {
          ownerId: request.user.sub,
          title: `${original.title} (fork)`,
          description: original.description,
          tags: original.tags,
          visibility: 'PRIVATE',
          forkedFromId: original.id,
          links: original.links.length
            ? { create: original.links.map(l => ({ label: l.label, url: l.url })) }
            : undefined,
        },
        include: {
          owner: { select: { id: true, name: true, faculty: true } },
          links: true,
          _count: { select: { likes: true, comments: true } },
        },
      })
      return reply.code(201).send(fork)
    }
  )

  // ── ANALYTICS ───────────────────────────────────────────────────────────────

  // GET /projects/:id/analytics — owner-only engagement metrics
  app.get<{ Params: { id: string } }>('/:id/analytics', { preHandler: [app.authenticate] }, async (request, reply) => {
    const project = await db.project.findUnique({
      where: { id: request.params.id },
      select: { ownerId: true, viewCount: true, _count: { select: { likes: true, comments: true, forks: true } } },
    })
    if (!project) return reply.code(404).send({ error: 'Not found' })
    if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const dailyViews = await db.projectDailyView.findMany({
      where: { projectId: request.params.id, date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'asc' },
    })

    return {
      totalViews: project.viewCount,
      likes: project._count.likes,
      comments: project._count.comments,
      forks: project._count.forks,
      dailyViews: dailyViews.map(d => ({ date: d.date, count: d.count })),
    }
  })

  // ── TA / FACULTY ACCESS REQUESTS ────────────────────────────────────────────

  // POST /projects/:id/request-access — faculty/TA requests VIEWER access
  app.post<{ Params: { id: string } }>(
    '/:id/request-access',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'FACULTY') {
        return reply.code(403).send({ error: 'Only faculty/TAs can request access' })
      }

      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.visibility === 'PRIVATE') {
        return reply.code(403).send({ error: 'Cannot request access to a private project' })
      }

      const existing = await db.projectCollaborator.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: request.user.sub } },
      })
      if (existing) return reply.code(409).send({ error: 'Access already requested or granted' })

      await db.projectCollaborator.create({
        data: { projectId: project.id, userId: request.user.sub, role: 'VIEWER', accepted: false },
      })
      return { ok: true, message: 'Access request sent to project owner' }
    }
  )

  // GET /projects/:id/access-requests — owner sees pending VIEWER requests
  app.get<{ Params: { id: string } }>('/:id/access-requests', { preHandler: [app.authenticate] }, async (request, reply) => {
    const project = await db.project.findUnique({ where: { id: request.params.id } })
    if (!project) return reply.code(404).send({ error: 'Not found' })
    if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

    const requests = await db.projectCollaborator.findMany({
      where: { projectId: project.id, role: 'VIEWER', accepted: false },
      include: { user: { select: { id: true, name: true, email: true, faculty: true } } },
      orderBy: { invitedAt: 'desc' },
    })
    return requests
  })
}
