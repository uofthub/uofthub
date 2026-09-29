import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { templateFor } from '../lib/courseTemplates.js'
import { courseWhere, normalizeCourseCode } from '../lib/faculties.js'
import { listablePeopleWhere, PERSON_RESULT_SELECT, toPersonResult } from '../lib/people.js'
import { listedProjectWhere } from '../lib/visibility.js'

/** Every way a profile can list a course: the code itself, or its bare stem. */
function profileSpellings(code: string): string[] {
  if (code.length > 6) return [code, code.slice(0, 6)]
  // A bare stem (CSC309) is every weight and campus of it.
  return [code, ...['H', 'Y'].flatMap((w) => ['1', '3', '5'].map((c) => `${code}${w}${c}`))]
}

export const courseRoutes: FastifyPluginAsync = async (app) => {
  // GET /courses/:code/people — who takes this course: people who list it on
  // their profile, and people who posted work in it (as its owner or an
  // accepted collaborator). Signed in only, like every list of people. Most
  // followed first.
  app.get<{ Params: { code: string } }>(
    '/:code/people',
    { preHandler: [app.authenticate] },
    async (request) => {
      const code = normalizeCourseCode(request.params.code)
      const inCourse = code && courseWhere(code)
      if (!code || !inCourse) return []
      const posted = { AND: [inCourse, listedProjectWhere(false)] }
      const rows = await db.user.findMany({
        where: {
          AND: [
            listablePeopleWhere(request.user.sub),
            {
              OR: [
                { courses: { hasSome: profileSpellings(code) } },
                { ownedProjects: { some: posted } },
                {
                  collaborations: {
                    some: { accepted: true, role: { not: 'VIEWER' }, project: posted },
                  },
                },
              ],
            },
          ],
        },
        select: PERSON_RESULT_SELECT,
        orderBy: [{ followers: { _count: 'desc' } }, { name: 'asc' }],
        take: 24,
      })
      return rows.map(toPersonResult)
    }
  )

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
