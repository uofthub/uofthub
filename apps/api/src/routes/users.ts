import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'

export const userRoutes: FastifyPluginAsync = async (app) => {
  // GET /users/:id — public profile
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = await db.user.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        name: true,
        faculty: true,
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
    // Try to get authenticated user to determine visibility rules
    let callerId: string | null = null
    try {
      await request.jwtVerify()
      callerId = request.user.sub
    } catch {}

    const isOwner = callerId === request.params.id

    const projects = await db.project.findMany({
      where: {
        ownerId: request.params.id,
        visibility: isOwner ? undefined : 'PUBLIC',
      },
      include: {
        _count: { select: { likes: true, comments: true } },
        links: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return projects
  })

  // PATCH /users/me — update own profile
  app.patch<{
    Body: { name?: string; faculty?: string; program?: string; classYear?: number; bio?: string; avatarUrl?: string }
  }>('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { name, faculty, program, classYear, bio, avatarUrl } = request.body

    const user = await db.user.update({
      where: { id: request.user.sub },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(faculty !== undefined && { faculty }),
        ...(program !== undefined && { program }),
        ...(classYear !== undefined && { classYear }),
        ...(bio !== undefined && { bio }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        faculty: true,
        program: true,
        classYear: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
      },
    })
    return user
  })

  // POST /users/:id/follow — toggles follow
  app.post<{ Params: { id: string } }>('/:id/follow', { preHandler: [app.authenticate] }, async (request, reply) => {
    const followerId = request.user.sub
    const followingId = request.params.id

    if (followerId === followingId) return reply.code(400).send({ error: 'Cannot follow yourself' })

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
}
