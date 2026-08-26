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
    const projects = await db.project.findMany({
      where: { ownerId: request.params.id, visibility: 'PUBLIC' },
      orderBy: { createdAt: 'desc' },
    })
    return projects
  })

  // POST /users/:id/follow
  app.post<{ Params: { id: string } }>('/:id/follow', async (request, reply) => {
    await request.jwtVerify()
    reply.code(501).send({ error: 'Not implemented' })
  })
}
