import type { FastifyPluginAsync } from 'fastify'
import { templateFor } from '../lib/courseTemplates.js'

export const courseRoutes: FastifyPluginAsync = async (app) => {
  // GET /courses/:code/template — what the editor pre-fills for this course
  //
  // Public: a template is a course's list of prompts, not anyone's work. 404
  // when the course has none, which is most of them.
  app.get<{ Params: { code: string } }>('/:code/template', async (request, reply) => {
    const template = templateFor(request.params.code)
    if (!template) return reply.code(404).send({ error: 'No template for that course' })
    return template
  })
}
