import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'

export const projectRoutes: FastifyPluginAsync = async (app) => {
  // GET /projects — list public/uoft projects
  app.get('/', async (request, reply) => {
    const projects = await db.project.findMany({
      where: { visibility: 'PUBLIC' },
      include: { owner: { select: { id: true, name: true, faculty: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return projects
  })

  // GET /projects/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const project = await db.project.findUnique({
      where: { id: request.params.id },
      include: {
        owner: { select: { id: true, name: true, faculty: true } },
        collaborators: { include: { user: { select: { id: true, name: true } } } },
        files: true,
        links: true,
        _count: { select: { likes: true, comments: true } },
      },
    })
    if (!project) return reply.code(404).send({ error: 'Not found' })
    return project
  })

  // POST /projects — create project (auth required)
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    reply.code(501).send({ error: 'Not implemented' })
  })

  // PATCH /projects/:id — update project (owner only)
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    reply.code(501).send({ error: 'Not implemented' })
  })

  // DELETE /projects/:id
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    reply.code(501).send({ error: 'Not implemented' })
  })

  // POST /projects/:id/like
  app.post<{ Params: { id: string } }>('/:id/like', { preHandler: [app.authenticate] }, async (request, reply) => {
    reply.code(501).send({ error: 'Not implemented' })
  })
}
