import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { getOptionalUserId, visibleProjectWhere } from '../lib/visibility.js'
import { categoryFor, extOf, matchesDeclaredType } from '../lib/fileValidation.js'
import { deleteObject, putObject, signedDownloadUrl } from '../lib/storage.js'
import { avatarObjectKey, avatarUrlFor } from '../lib/avatar.js'
import { withCovers } from '../lib/covers.js'
import { parseCampus } from '../lib/campus.js'

const ME_SELECT = {
  id: true,
  email: true,
  name: true,
  faculty: true,
  campus: true,
  program: true,
  classYear: true,
  bio: true,
  avatarUrl: true,
  createdAt: true,
} as const

// Avatars are small and infrequent — a lighter budget than project uploads,
// same pattern as auth.ts's credentialRateLimit.
const avatarRateLimit = { rateLimit: { max: 10, timeWindow: '10 minutes' } }

export const userRoutes: FastifyPluginAsync = async (app) => {
  // GET /users/:id — public profile
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = await db.user.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        name: true,
        faculty: true,
        campus: true,
        program: true,
        classYear: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
        _count: { select: { ownedProjects: true, followers: true, following: true } },
      },
    })
    if (!user) return reply.code(404).send({ error: 'Not found' })
    return user
  })

  // GET /users/:id/projects
  app.get<{ Params: { id: string } }>('/:id/projects', async (request, reply) => {
    const callerId = await getOptionalUserId(request)

    const projects = await db.project.findMany({
      where: {
        ownerId: request.params.id,
        // Signed-in viewers also see this user's UOFT projects, not just PUBLIC.
        ...visibleProjectWhere(callerId),
      },
      include: {
        _count: { select: { likes: true, comments: true } },
        links: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return withCovers(projects)
  })

  // PATCH /users/me — update own profile
  app.patch<{
    Body: {
      name?: string
      faculty?: string
      campus?: string | null
      program?: string
      classYear?: number
      bio?: string
      avatarUrl?: string
    }
  }>('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { name, faculty, campus, program, classYear, bio, avatarUrl } = request.body

    // Empty string and null both mean "clear it" — the profile form sends the
    // empty option that way. Anything else has to be a real campus.
    let nextCampus: ReturnType<typeof parseCampus> | null | undefined
    if (campus !== undefined) {
      if (campus === null || campus === '') nextCampus = null
      else {
        nextCampus = parseCampus(campus)
        if (!nextCampus) return reply.code(400).send({ error: 'Campus must be UTSG, UTM or UTSC' })
      }
    }

    const user = await db.user.update({
      where: { id: request.user.sub },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(faculty !== undefined && { faculty }),
        ...(nextCampus !== undefined && { campus: nextCampus }),
        ...(program !== undefined && { program }),
        ...(classYear !== undefined && { classYear }),
        ...(bio !== undefined && { bio }),
        // A manually-pasted URL isn't backed by our storage, so avatarKey is
        // cleared — and like an upload, it's now "custom", so the Microsoft
        // sign-in avatar sync (which only ever runs once, at signup) would
        // never have overwritten it anyway, but this keeps that rule explicit.
        ...(avatarUrl !== undefined && { avatarUrl, avatarKey: null, avatarIsCustom: true }),
      },
      select: ME_SELECT,
    })
    return user
  })

  // POST /users/me/avatar — multipart upload
  app.post(
    '/me/avatar',
    { preHandler: [app.authenticate], config: avatarRateLimit },
    async (request, reply) => {
      const data = await request.file()
      if (!data) return reply.code(400).send({ error: 'No file uploaded' })

      const ext = extOf(data.filename)
      const category = categoryFor(ext)
      if (!category || category.name !== 'images') {
        return reply.code(400).send({ error: `Unsupported avatar type: .${ext || '?'}` })
      }

      const buffer = await data.toBuffer()
      if (data.file.truncated || buffer.length > category.maxSizeBytes) {
        return reply.code(413).send({ error: `Avatar exceeds the ${category.maxSizeBytes / (1024 * 1024)}MB limit` })
      }
      if (!(await matchesDeclaredType(buffer, ext))) {
        return reply.code(400).send({ error: 'File content does not match its extension' })
      }

      const userId = request.user.sub
      const key = avatarObjectKey(userId)
      await putObject(key, buffer, data.mimetype)

      const user = await db.user.update({
        where: { id: userId },
        data: { avatarKey: key, avatarIsCustom: true, avatarUrl: avatarUrlFor(userId) },
        select: ME_SELECT,
      })
      return user
    }
  )

  // DELETE /users/me/avatar
  app.delete('/me/avatar', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub
    const existing = await db.user.findUnique({ where: { id: userId }, select: { avatarKey: true } })
    if (existing?.avatarKey) await deleteObject(existing.avatarKey)

    await db.user.update({
      where: { id: userId },
      data: { avatarKey: null, avatarUrl: null, avatarIsCustom: false },
    })
    return { ok: true }
  })

  // GET /users/:id/avatar — public redirect to a signed URL; avatars aren't
  // visibility-gated the way project files are, so no auth check here.
  app.get<{ Params: { id: string } }>('/:id/avatar', async (request, reply) => {
    const user = await db.user.findUnique({ where: { id: request.params.id }, select: { avatarKey: true } })
    if (!user?.avatarKey) return reply.code(404).send({ error: 'No avatar' })

    const url = await signedDownloadUrl(user.avatarKey, 'avatar', { disposition: 'inline' })
    return reply.redirect(url)
  })

  // POST /users/:id/follow — toggles follow
  app.post<{ Params: { id: string } }>('/:id/follow', { preHandler: [app.authenticate] }, async (request, reply) => {
    const followerId = request.user.sub
    const followingId = request.params.id

    if (followerId === followingId) return reply.code(400).send({ error: 'Cannot follow yourself' })

    // Without this, following a nonexistent id fails the foreign key and
    // surfaces as a 500 rather than a 404.
    const target = await db.user.findUnique({ where: { id: followingId }, select: { id: true } })
    if (!target) return reply.code(404).send({ error: 'User not found' })

    const existing = await db.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    })

    if (existing) {
      await db.follow.delete({ where: { followerId_followingId: { followerId, followingId } } })
      return { following: false }
    }

    await db.follow.create({ data: { followerId, followingId } })
    return { following: true }
  })

  // GET /users/:id/follow/me — check if current user follows
  app.get<{ Params: { id: string } }>('/:id/follow/me', { preHandler: [app.authenticate] }, async (request) => {
    const followerId = request.user.sub
    const followingId = request.params.id
    const row = await db.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    })
    return { following: !!row }
  })

  // GET /users/me/notifications — most recent first, for the notification bell
  app.get('/me/notifications', { preHandler: [app.authenticate] }, async (request) => {
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: request.user.sub },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.notification.count({ where: { userId: request.user.sub, read: false } }),
    ])
    return { notifications, unreadCount }
  })

  // POST /users/me/notifications/:id/read
  app.post<{ Params: { id: string } }>(
    '/me/notifications/:id/read',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      // Scoped to the caller so one user can't mark another's notification
      // read by guessing its id.
      const { count } = await db.notification.updateMany({
        where: { id: request.params.id, userId: request.user.sub },
        data: { read: true },
      })
      if (count === 0) return reply.code(404).send({ error: 'Not found' })
      return { ok: true }
    }
  )

  // POST /users/me/notifications/read-all — bulk mark-read for opening the bell dropdown
  app.post('/me/notifications/read-all', { preHandler: [app.authenticate] }, async (request) => {
    await db.notification.updateMany({
      where: { userId: request.user.sub, read: false },
      data: { read: true },
    })
    return { ok: true }
  })
}
