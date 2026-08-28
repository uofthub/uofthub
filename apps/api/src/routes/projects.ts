import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import {
  canViewProject,
  canViewProjectId,
  getOptionalUserId,
  visibleProjectWhere,
} from '../lib/visibility.js'
import { safeExternalUrl } from '../lib/url.js'
import { ACCOUNT_QUOTA_BYTES, PROJECT_FILE_COUNT_CAP, categoryFor, extOf, matchesDeclaredType } from '../lib/fileValidation.js'
import { deleteObject, objectKey, putObject, signedDownloadUrl } from '../lib/storage.js'
import { notify } from '../lib/notifications.js'

// Upload/delete cost real storage and bandwidth, so they get a tighter budget
// than the global ceiling — same pattern as auth.ts's credentialRateLimit.
const uploadRateLimit = { rateLimit: { max: 20, timeWindow: '10 minutes' } }

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
        // storageKey is an internal R2 pointer, never sent to the client —
        // downloads go through the signed-URL route below instead.
        files: { select: { id: true, name: true, sizeBytes: true, mimeType: true, uploadedAt: true } },
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

    // Reject javascript:/data: links up front rather than storing them.
    const safeLinks: { label: string; url: string }[] = []
    for (const link of links) {
      const url = safeExternalUrl(link?.url)
      if (!url) {
        return reply.code(400).send({ error: `Link "${link?.label ?? ''}" must be an http(s) URL` })
      }
      safeLinks.push({ label: String(link.label ?? '').trim(), url })
    }

    const project = await db.project.create({
      data: {
        ownerId: request.user.sub,
        title: title.trim(),
        description: description?.trim(),
        tags,
        visibility: visibility as 'PRIVATE' | 'UOFT' | 'PUBLIC',
        links: safeLinks.length ? { create: safeLinks } : undefined,
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
      const project = await db.project.findUnique({
        where: { id: request.params.id },
        include: { owner: { select: { name: true } } },
      })
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

      await notify(invitee.id, 'COLLABORATOR_INVITED', {
        projectId: project.id,
        projectTitle: project.title,
        inviterName: project.owner.name,
      })

      return reply.code(201).send(collab)
    }
  )

  // PATCH /projects/:id/collaborators/:userId — accept/deny an invite (by the
  // invitee), or approve/deny a pending VIEWER access request (by the owner)
  app.patch<{ Params: { id: string; userId: string }; Body: { accepted: boolean } }>(
    '/:id/collaborators/:userId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id, userId } = request.params

      const project = await db.project.findUnique({ where: { id }, select: { id: true, title: true, ownerId: true } })
      if (!project) return reply.code(404).send({ error: 'Not found' })

      // Without this, responding to an invite that does not exist throws
      // Prisma's P2025 and surfaces as a 500.
      const invite = await db.projectCollaborator.findUnique({
        where: { projectId_userId: { projectId: id, userId } },
        include: { user: { select: { name: true } } },
      })
      if (!invite) return reply.code(404).send({ error: 'No invitation found' })

      const isSelf = userId === request.user.sub
      // A VIEWER row is a TA/professor access request (see POST
      // .../request-access) rather than an owner-issued invite, so it's the
      // owner — not the requester — who decides it.
      const isOwnerDecidingAccessRequest = !isSelf && request.user.sub === project.ownerId && invite.role === 'VIEWER'
      if (!isSelf && !isOwnerDecidingAccessRequest) return reply.code(403).send({ error: 'Forbidden' })

      const collab = await db.projectCollaborator.update({
        where: { projectId_userId: { projectId: id, userId } },
        data: { accepted: request.body.accepted },
      })

      if (isOwnerDecidingAccessRequest) {
        await notify(userId, 'ACCESS_REQUEST_DECIDED', {
          projectId: project.id,
          projectTitle: project.title,
          accepted: request.body.accepted,
        })
      } else if (project.ownerId !== userId) {
        await notify(project.ownerId, 'COLLABORATOR_RESPONDED', {
          projectId: project.id,
          projectTitle: project.title,
          userName: invite.user.name,
          accepted: request.body.accepted,
        })
      }

      return collab
    }
  )

  // DELETE /projects/:id/collaborators/:userId
  app.delete<{ Params: { id: string; userId: string } }>(
    '/:id/collaborators/:userId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id, userId } = request.params
      const project = await db.project.findUnique({ where: { id }, select: { id: true, title: true, ownerId: true } })
      if (!project) return reply.code(404).send({ error: 'Not found' })

      const isOwner = project.ownerId === request.user.sub
      const isSelf = userId === request.user.sub
      if (!isOwner && !isSelf) return reply.code(403).send({ error: 'Forbidden' })

      const collab = await db.projectCollaborator.findUnique({
        where: { projectId_userId: { projectId: id, userId } },
      })
      if (!collab) return reply.code(404).send({ error: 'Not found' })

      await db.projectCollaborator.delete({
        where: { projectId_userId: { projectId: id, userId } },
      })

      // Owner denying a still-pending VIEWER access request (see
      // POST .../request-access) — let the requester know rather than
      // leaving the request to silently vanish.
      if (isOwner && !isSelf && collab.role === 'VIEWER' && !collab.accepted) {
        await notify(userId, 'ACCESS_REQUEST_DECIDED', {
          projectId: project.id,
          projectTitle: project.title,
          accepted: false,
        })
      }

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

      const url = safeExternalUrl(request.body.url)
      if (!url) return reply.code(400).send({ error: 'Link must be an http(s) URL' })

      const link = await db.projectLink.create({
        data: { projectId: project.id, label: String(request.body.label ?? '').trim(), url },
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

  // ── FILES ───────────────────────────────────────────────────────────────────

  // POST /projects/:id/files — multipart upload, owner only
  app.post<{ Params: { id: string } }>(
    '/:id/files',
    { preHandler: [app.authenticate], config: uploadRateLimit },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      const data = await request.file()
      if (!data) return reply.code(400).send({ error: 'No file uploaded' })

      const ext = extOf(data.filename)
      const category = categoryFor(ext)
      if (!category) return reply.code(400).send({ error: `Unsupported file type: .${ext || '?'}` })

      const buffer = await data.toBuffer()
      // @fastify/multipart truncates rather than throwing when the stream
      // exceeds the registered global limit (250MB) — buffer.length would
      // otherwise look like a plausible, if large, file.
      if (data.file.truncated) {
        return reply.code(413).send({ error: 'File exceeds the 250MB upload limit' })
      }
      if (buffer.length > category.maxSizeBytes) {
        return reply.code(413).send({
          error: `File exceeds the ${category.name} size limit (${category.maxSizeBytes / (1024 * 1024)}MB)`,
        })
      }

      // Checked against the actual bytes, not the client-declared filename or
      // MIME type — this is what stops a renamed executable getting through.
      if (!(await matchesDeclaredType(buffer, ext))) {
        return reply.code(400).send({ error: 'File content does not match its extension' })
      }

      const [fileCount, usage] = await Promise.all([
        db.projectFile.count({ where: { projectId: project.id } }),
        db.projectFile.aggregate({ where: { project: { ownerId: project.ownerId } }, _sum: { sizeBytes: true } }),
      ])
      if (fileCount >= PROJECT_FILE_COUNT_CAP) {
        return reply.code(400).send({ error: `This project already has the ${PROJECT_FILE_COUNT_CAP}-file limit` })
      }
      const usedBytes = usage._sum.sizeBytes ?? 0
      if (usedBytes + buffer.length > ACCOUNT_QUOTA_BYTES) {
        return reply.code(413).send({ error: 'This upload would exceed your storage quota' })
      }

      const key = objectKey(project.id, data.filename)
      await putObject(key, buffer, data.mimetype)

      const file = await db.projectFile.create({
        data: { projectId: project.id, name: data.filename, storageKey: key, sizeBytes: buffer.length, mimeType: data.mimetype },
        select: { id: true, name: true, sizeBytes: true, mimeType: true, uploadedAt: true },
      })
      return reply.code(201).send(file)
    }
  )

  // DELETE /projects/:id/files/:fileId — owner only
  app.delete<{ Params: { id: string; fileId: string } }>(
    '/:id/files/:fileId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      // Scope to this project, same reasoning as DELETE .../links/:linkId.
      const file = await db.projectFile.findFirst({
        where: { id: request.params.fileId, projectId: project.id },
      })
      if (!file) return reply.code(404).send({ error: 'File not found' })

      await deleteObject(file.storageKey)
      await db.projectFile.delete({ where: { id: file.id } })
      return { ok: true }
    }
  )

  // GET /projects/:id/files/:fileId/download — redirects to a short-lived signed URL
  app.get<{ Params: { id: string; fileId: string } }>('/:id/files/:fileId/download', async (request, reply) => {
    const callerId = await getOptionalUserId(request)
    if (!(await canViewProjectId(request.params.id, callerId))) {
      return reply.code(404).send({ error: 'Not found' })
    }

    const file = await db.projectFile.findFirst({
      where: { id: request.params.fileId, projectId: request.params.id },
    })
    if (!file) return reply.code(404).send({ error: 'File not found' })

    const url = await signedDownloadUrl(file.storageKey, file.name)
    return reply.redirect(url)
  })

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

      const [requester] = await Promise.all([
        db.user.findUnique({ where: { id: request.user.sub }, select: { name: true } }),
        db.projectCollaborator.create({
          data: { projectId: project.id, userId: request.user.sub, role: 'VIEWER', accepted: false },
        }),
      ])

      await notify(project.ownerId, 'ACCESS_REQUESTED', {
        projectId: project.id,
        projectTitle: project.title,
        requesterId: request.user.sub,
        requesterName: requester?.name,
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
