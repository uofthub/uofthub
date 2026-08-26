import type { FastifyPluginAsync } from 'fastify'

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/login — exchange OAuth code for JWT
  app.post('/login', async (request, reply) => {
    // TODO: implement OAuth token exchange
    reply.code(501).send({ error: 'Not implemented' })
  })

  // POST /auth/logout
  app.post('/logout', async (request, reply) => {
    reply.send({ ok: true })
  })

  // GET /auth/me — return current user from JWT
  app.get('/me', async (request, reply) => {
    await request.jwtVerify()
    return request.user
  })
}
