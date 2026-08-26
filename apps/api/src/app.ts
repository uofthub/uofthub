import './types.js'
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import oauth2 from '@fastify/oauth2'
import { authRoutes } from './routes/auth.js'
import { projectRoutes } from './routes/projects.js'
import { userRoutes } from './routes/users.js'
import { discoverRoutes } from './routes/discover.js'
import { orgRoutes } from './routes/orgs.js'

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: process.env.WEB_URL ?? 'http://localhost:5173',
    credentials: true,
  })

  await app.register(cookie)

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-prod',
    cookie: { cookieName: 'token', signed: false },
  })

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  })

  await app.register(oauth2, {
    name: 'microsoftOAuth2',
    credentials: {
      client: {
        id: process.env.MICROSOFT_CLIENT_ID!,
        secret: process.env.MICROSOFT_CLIENT_SECRET!,
      },
      auth: {
        authorizeHost: 'https://login.microsoftonline.com',
        authorizePath: `/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`,
        tokenHost: 'https://login.microsoftonline.com',
        tokenPath: `/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      },
    },
    startRedirectPath: '/auth/microsoft',
    callbackUri: process.env.MICROSOFT_REDIRECT_URI ?? 'http://localhost:3001/auth/callback',
    scope: ['openid', 'profile', 'email', 'https://graph.microsoft.com/User.Read'],
  })

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(projectRoutes, { prefix: '/projects' })
  await app.register(userRoutes, { prefix: '/users' })
  await app.register(discoverRoutes, { prefix: '/discover' })
  await app.register(orgRoutes, { prefix: '/orgs' })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
