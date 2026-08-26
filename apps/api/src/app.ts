import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import { authRoutes } from './routes/auth.js'
import { projectRoutes } from './routes/projects.js'
import { userRoutes } from './routes/users.js'

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: process.env.WEB_URL ?? 'http://localhost:5173',
    credentials: true,
  })

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-prod',
  })

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  })

  app.addHook('onRequest', async (request, reply) => {
    const PUBLIC_ROUTES = ['/health', '/auth/callback']
    if (PUBLIC_ROUTES.some((r) => request.url.startsWith(r))) return
    // Routes that require auth will call request.jwtVerify() themselves
  })

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(projectRoutes, { prefix: '/projects' })
  await app.register(userRoutes, { prefix: '/users' })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
