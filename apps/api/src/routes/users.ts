import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { getOptionalUserId, visibleProjectWhere } from '../lib/visibility.js'
import { categoryFor, extOf, matchesDeclaredType } from '../lib/fileValidation.js'
import { deleteObject, putObject, signedDownloadUrl } from '../lib/storage.js'
import { avatarObjectKey, avatarUrlFor } from '../lib/avatar.js'
import { CARD_INCLUDE, decorate } from '../lib/projectShape.js'
import { isFaculty } from '../lib/faculties.js'
import { parseCampus } from '../lib/campus.js'
import { notifyOnce } from '../lib/notifications.js'
import { PIN_LIMIT } from '../lib/pins.js'
import { parseCourses, parseOpenTo, OPEN_TO_ITEM_MAX, OPEN_TO_MAX, COURSES_MAX } from '../lib/profile.js'
import { safeExternalUrl, safeGithubUrl, safeLinkedInUrl } from '../lib/url.js'

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
  openTo: true,
  websiteUrl: true,
  githubUrl: true,
  linkedinUrl: true,
  courses: true,
  allowMessages: true,
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
        openTo: true,
        websiteUrl: true,
        githubUrl: true,
        linkedinUrl: true,
        courses: true,
        allowMessages: true,
        createdAt: true,
        _count: { select: { ownedProjects: true, followers: true, following: true } },
      },
    })
    if (!user) return reply.code(404).send({ error: 'Not found' })
    return user
  })

  // GET /users/:id/projects?take&skip
  //
  // Paged, like the directory. It used to return every project a user owned:
  // fine for a student with six, and a query that grows without bound for a
  // prolific one — and now one signed cover URL per row on top.
  app.get<{ Params: { id: string }; Querystring: { take?: string; skip?: string } }>(
    '/:id/projects',
    async (request) => {
      const callerId = await getOptionalUserId(request)
      const { take = '24', skip = '0' } = request.query

      const projects = await db.project.findMany({
        where: {
          ownerId: request.params.id,
          // Signed-in viewers also see this user's UOFT projects, not just PUBLIC.
          ...visibleProjectWhere(callerId),
        },
        include: CARD_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number(take) || 24, 1), 50),
        skip: Math.max(Number(skip) || 0, 0),
      })
      return decorate(projects, callerId)
    }
  )

  // GET /users/:id/pinned — the handful a student chose to lead with
  //
  // Its own route rather than a flag on the list above: the list is paged
  // newest-first, so a project pinned a year ago would not be on the first
  // page, and the strip has to be complete to be worth anything.
  app.get<{ Params: { id: string } }>('/:id/pinned', async (request) => {
    const callerId = await getOptionalUserId(request)

    const projects = await db.project.findMany({
      where: {
        ownerId: request.params.id,
        pinnedAt: { not: null },
        // A pinned project that is still PRIVATE is pinned for the owner's own
        // benefit; the same visibility rules apply to it as to anything else.
        ...visibleProjectWhere(callerId),
      },
      include: CARD_INCLUDE,
      orderBy: { pinnedAt: 'desc' },
      take: PIN_LIMIT,
    })
    return decorate(projects, callerId)
  })

  // GET /users/me/orgs — the groups the caller belongs to, for linking a
  // project to one. Verified only: an unverified group has no public page to
  // be "built with".
  app.get('/me/orgs', { preHandler: [app.authenticate] }, async (request) => {
    return db.organization.findMany({
      where: { status: 'VERIFIED', members: { some: { userId: request.user.sub } } },
      select: { id: true, slug: true, name: true, type: true },
      orderBy: { name: 'asc' },
    })
  })

  // GET /users/me/saved?take&skip — the caller's own bookmarks, newest save
  // first. Only ever the caller's: a save is private.
  app.get<{ Querystring: { take?: string; skip?: string } }>(
    '/me/saved',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = request.user.sub
      const { take = '24', skip = '0' } = request.query
      const saves = await db.projectSave.findMany({
        // A saved project that has since gone private to its makers drops out
        // of the list rather than leaking its title.
        where: { userId, project: { is: visibleProjectWhere(userId) } },
        include: { project: { include: CARD_INCLUDE } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number(take) || 24, 1), 50),
        skip: Math.max(Number(skip) || 0, 0),
      })
      return decorate(
        saves.map((s) => s.project),
        userId
      )
    }
  )

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
      openTo?: string[]
      websiteUrl?: string | null
      githubUrl?: string | null
      linkedinUrl?: string | null
      courses?: string[]
      allowMessages?: boolean
    }
  }>('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { name, faculty, campus, program, classYear, bio, avatarUrl } = request.body
    const body = request.body

    let openTo: string[] | undefined
    if (body.openTo !== undefined) {
      const parsed = parseOpenTo(body.openTo)
      if (!parsed)
        return reply.code(400).send({
          error: `Up to ${OPEN_TO_MAX} "Open to" items, each at most ${OPEN_TO_ITEM_MAX} characters`,
        })
      openTo = parsed
    }
    let courses: string[] | undefined
    if (body.courses !== undefined) {
      const parsed = parseCourses(body.courses)
      if (!parsed)
        return reply
          .code(400)
          .send({ error: `Up to ${COURSES_MAX} course codes, like CSC343 or MAT137Y1` })
      courses = parsed
    }
    if (body.allowMessages !== undefined && typeof body.allowMessages !== 'boolean')
      return reply.code(400).send({ error: 'allowMessages must be true or false' })

    // Empty or null clears a link; anything else has to be a real link to the
    // right place — the profile shows each one behind its service's icon.
    const links: Record<string, string | null> = {}
    const checks = [
      ['websiteUrl', safeExternalUrl, 'Website must be an http(s) link'],
      ['githubUrl', safeGithubUrl, 'GitHub link must point at github.com'],
      ['linkedinUrl', safeLinkedInUrl, 'LinkedIn link must point at linkedin.com'],
    ] as const
    for (const [field, check, message] of checks) {
      const raw = body[field]
      if (raw === undefined) continue
      if (raw === null || raw.trim() === '') {
        links[field] = null
        continue
      }
      const safe = check(raw)
      if (!safe) return reply.code(400).send({ error: message })
      links[field] = safe
    }

    // Faculty comes from a fixed list (lib/faculties.ts) so filters and the
    // "Your program" feed can match it exactly. A value written before the
    // list existed may be sent back unchanged; it just cannot be newly chosen.
    if (faculty !== undefined && faculty !== '' && !isFaculty(faculty)) {
      const current = await db.user.findUnique({
        where: { id: request.user.sub },
        select: { faculty: true },
      })
      if (current?.faculty !== faculty)
        return reply.code(400).send({ error: 'Choose a faculty from the list' })
    }
    if (name !== undefined && !name.trim())
      return reply.code(400).send({ error: 'Name is required' })

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
        ...(faculty !== undefined && { faculty: faculty || null }),
        ...(nextCampus !== undefined && { campus: nextCampus }),
        ...(program !== undefined && { program }),
        ...(classYear !== undefined && { classYear }),
        ...(bio !== undefined && { bio }),
        ...(openTo !== undefined && { openTo }),
        ...(courses !== undefined && { courses }),
        ...(body.allowMessages !== undefined && { allowMessages: body.allowMessages }),
        ...links,
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
        return reply
          .code(413)
          .send({ error: `Avatar exceeds the ${category.maxSizeBytes / (1024 * 1024)}MB limit` })
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
    const existing = await db.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    })
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
    const user = await db.user.findUnique({
      where: { id: request.params.id },
      select: { avatarKey: true },
    })
    if (!user?.avatarKey) return reply.code(404).send({ error: 'No avatar' })

    const url = await signedDownloadUrl(user.avatarKey, 'avatar', { disposition: 'inline' })
    return reply.redirect(url)
  })

  // POST /users/:id/follow — toggles follow
  app.post<{ Params: { id: string } }>(
    '/:id/follow',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const followerId = request.user.sub
      const followingId = request.params.id

      if (followerId === followingId)
        return reply.code(400).send({ error: 'Cannot follow yourself' })

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

      // Keyed on the follower, so unfollow-refollow is not a way to ping
      // somebody repeatedly — you announce yourself to a person once.
      const follower = await db.user.findUnique({
        where: { id: followerId },
        select: { name: true },
      })
      await notifyOnce(followingId, 'FOLLOWED_YOU', `follow:${followerId}`, {
        actorId: followerId,
        actorName: follower?.name,
      })

      return { following: true }
    }
  )

  // GET /users/:id/follow/me — check if current user follows
  app.get<{ Params: { id: string } }>(
    '/:id/follow/me',
    { preHandler: [app.authenticate] },
    async (request) => {
      const followerId = request.user.sub
      const followingId = request.params.id
      const row = await db.follow.findUnique({
        where: { followerId_followingId: { followerId, followingId } },
      })
      return { following: !!row }
    }
  )

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
