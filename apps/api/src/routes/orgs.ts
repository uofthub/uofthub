import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'

export const orgRoutes: FastifyPluginAsync = async (app) => {
  // GET /orgs
  app.get('/', async () => {
    return db.organization.findMany({
      include: { _count: { select: { members: true, projects: true } } },
      orderBy: { createdAt: 'desc' },
    })
  })

  // POST /orgs — create org (auth required)
  app.post<{ Body: { name: string; slug: string; type?: string; description?: string; websiteUrl?: string } }>(
    '/',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { name, slug, type = 'CLUB', description, websiteUrl } = request.body
      if (!name?.trim() || !slug?.trim()) return reply.code(400).send({ error: 'name and slug are required' })

      const slugified = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')

      const org = await db.organization.create({
        data: {
          name: name.trim(),
          slug: slugified,
          type: type as 'CLUB' | 'LAB',
          description: description?.trim(),
          websiteUrl: websiteUrl?.trim() || undefined,
          members: { create: { userId: request.user.sub, role: 'ADMIN' } },
        },
        include: {
          members: { include: { user: { select: { id: true, name: true } } } },
          _count: { select: { members: true, projects: true } },
        },
      })
      return reply.code(201).send(org)
    }
  )

  // GET /orgs/:slug
  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    const org = await db.organization.findUnique({
      where: { slug: request.params.slug },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, avatarUrl: true, faculty: true } } },
        },
        projects: {
          include: {
            project: {
              include: {
                owner: { select: { id: true, name: true } },
                _count: { select: { likes: true, comments: true } },
              },
            },
          },
        },
      },
    })
    if (!org) return reply.code(404).send({ error: 'Not found' })
    return org
  })

  // POST /orgs/:slug/projects — link a project to this org
  app.post<{ Params: { slug: string }; Body: { projectId: string } }>(
    '/:slug/projects',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
      if (!org) return reply.code(404).send({ error: 'Org not found' })

      const member = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId: org.id, userId: request.user.sub } },
      })
      if (!member) return reply.code(403).send({ error: 'Not a member of this org' })

      const link = await db.orgProject.upsert({
        where: { orgId_projectId: { orgId: org.id, projectId: request.body.projectId } },
        update: {},
        create: { orgId: org.id, projectId: request.body.projectId },
      })
      return reply.code(201).send(link)
    }
  )

  // POST /orgs/:slug/members — add a member by email
  app.post<{ Params: { slug: string }; Body: { email: string; role?: string } }>(
    '/:slug/members',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
      if (!org) return reply.code(404).send({ error: 'Org not found' })

      const requester = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId: org.id, userId: request.user.sub } },
      })
      if (requester?.role !== 'ADMIN') return reply.code(403).send({ error: 'Admins only' })

      const user = await db.user.findUnique({ where: { email: request.body.email } })
      if (!user) return reply.code(404).send({ error: 'User not found' })

      const member = await db.orgMember.upsert({
        where: { orgId_userId: { orgId: org.id, userId: user.id } },
        update: { role: request.body.role ?? 'MEMBER' },
        create: { orgId: org.id, userId: user.id, role: request.body.role ?? 'MEMBER' },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
      return reply.code(201).send(member)
    }
  )
}
