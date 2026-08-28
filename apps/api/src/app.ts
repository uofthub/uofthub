import './types.js'
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import oauth2 from '@fastify/oauth2'
import rateLimit from '@fastify/rate-limit'
import { authRoutes } from './routes/auth.js'
import { projectRoutes } from './routes/projects.js'
import { userRoutes } from './routes/users.js'
import { orgRoutes } from './routes/orgs.js'

export async function buildApp() {
  // A default secret is fine for local work but would silently ship forgeable
  // sessions if the env var were missing in production, so refuse to boot.
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production')
  }

  const app = Fastify({ logger: true })

  // `methods` defaults to GET,HEAD,POST, which fails the preflight for every
  // PATCH and DELETE route the web app calls (project edit, profile edit,
  // deleting a project/link/file, deciding a collaborator invite).
  await app.register(cors, {
    origin: process.env.WEB_URL ?? 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
  })

  await app.register(cookie)

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-prod',
    cookie: { cookieName: 'token', signed: false },
  })

  // Matches the largest per-category cap (video, see lib/fileValidation.ts) so
  // the stream isn't truncated before the tighter per-category checks run.
  await app.register(multipart, {
    limits: { fileSize: 250 * 1024 * 1024 },
  })

  // Generous global ceiling; the routes worth abusing set their own below.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  })

  // Authority segment. A tenant GUID only admits users homed in that tenant, so
  // signing in with a utoronto.ca account requires the multitenant authority
  // `organizations` (any work/school tenant). Domain access is enforced on the
  // callback in routes/auth.ts, not here.
  const tenant = process.env.MICROSOFT_TENANT_ID || 'organizations'

  await app.register(oauth2, {
    name: 'microsoftOAuth2',
    credentials: {
      client: {
        id: process.env.MICROSOFT_CLIENT_ID!,
        secret: process.env.MICROSOFT_CLIENT_SECRET!,
      },
      auth: {
        authorizeHost: 'https://login.microsoftonline.com',
        authorizePath: `/${tenant}/oauth2/v2.0/authorize`,
        tokenHost: 'https://login.microsoftonline.com',
        tokenPath: `/${tenant}/oauth2/v2.0/token`,
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
  await app.register(orgRoutes, { prefix: '/orgs' })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
