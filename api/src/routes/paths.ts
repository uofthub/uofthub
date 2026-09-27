import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { canViewProject, getOptionalUserId, VIEW_CHECK_SELECT } from '../lib/visibility.js'
import { resolveHandle, resolveProjectSlug } from '../lib/handles.js'

/**
 * What a readable address names: /@handle and /@handle/slug, turned into the
 * ids every other route takes. The answer carries the handle and slug as they
 * are now, so an old address — a handle or title since changed — can
 * redirect to the current one. See lib/handles.ts.
 */
export const pathRoutes: FastifyPluginAsync = async (app) => {
  // GET /paths/:handle — a profile
  app.get<{ Params: { handle: string } }>('/:handle', async (request, reply) => {
    const person = await resolveHandle(request.params.handle)
    return person ?? reply.code(404).send({ error: 'Not found' })
  })

  // GET /paths/:handle/:slug — a project, for whoever may see it. Anyone else
  // gets the same 404 as an address that names nothing: a private project
  // must not confirm it exists (see GET /projects/:id).
  app.get<{ Params: { handle: string; slug: string } }>(
    '/:handle/:slug',
    async (request, reply) => {
      const person = await resolveHandle(request.params.handle)
      const projectId = person && (await resolveProjectSlug(person.userId, request.params.slug))
      const project =
        projectId &&
        (await db.project.findUnique({
          where: { id: projectId },
          select: { id: true, slug: true, ...VIEW_CHECK_SELECT },
        }))
      if (!person || !project || !canViewProject(project, await getOptionalUserId(request)))
        return reply.code(404).send({ error: 'Not found' })
      return { ...person, projectId: project.id, slug: project.slug }
    }
  )
}
