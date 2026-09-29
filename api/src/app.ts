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
import { adminRoutes } from './routes/admin.js'
import { discoverRoutes } from './routes/discover.js'
import { feedRoutes } from './routes/feed.js'
import { spotlightRoutes } from './routes/spotlight.js'
import { collectionRoutes } from './routes/collections.js'
import { messageRoutes } from './routes/messages.js'
import { courseRoutes } from './routes/courses.js'
import { eventRoutes } from './routes/events.js'
import { emailRoutes } from './routes/email.js'
import { pushRoutes } from './routes/push.js'
import { pathRoutes } from './routes/paths.js'
import { sessionAccount } from './lib/session.js'
import { jwtSecret } from './lib/keys.js'

export async function buildApp() {
  // A default secret is fine for local work but would silently ship forgeable
  // sessions if the env var were missing in production, so refuse to boot.
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production')
  }

  // Request logs are the first thing you want in dev and production, and the
  // last thing you want interleaved with test output.
  //
  // Behind Render's proxy every connection comes from the proxy, so without
  // trusting it `request.ip` is one address for the whole site — and every
  // IP-keyed rate limit (sign-in above all) becomes one budget shared by
  // everybody. Only the nearest hop is trusted: X-Forwarded-For entries
  // further left are whatever the client chose to send.
  const hops = Number(
    process.env.TRUST_PROXY_HOPS ?? (process.env.NODE_ENV === 'production' ? 1 : 0)
  )
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    // What `trustProxy: <n>` means, spelled as the function the types accept.
    trustProxy: hops > 0 ? (_address: string, hop: number) => hop < hops : false,
  })

  // `methods` defaults to GET,HEAD,POST, which fails the preflight for every
  // PATCH and DELETE route the web app calls (project edit, profile edit,
  // deleting a project/link/file, deciding a collaborator invite).
  await app.register(cors, {
    origin: process.env.WEB_URL ?? 'http://localhost:5173',
    credentials: true,
    // Every method a route uses: PUT is how an output's thumbnail is set.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })

  // Security headers on every response. The API only ever answers with JSON,
  // redirects and event streams, so the strict defaults cost nothing: never
  // sniffed as something else, never framed, and resources only for pages on
  // the same site (the web app is on the same registrable domain — see
  // ARCHITECTURE.md § Deployment).
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('Cross-Origin-Resource-Policy', 'same-site')
    if (process.env.NODE_ENV === 'production')
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  })

  // Cross-site request forgery, belt and braces. The session cookie is
  // SameSite=Lax, which stops other *sites* from sending it on a POST — but
  // not other origins on the same site (any uofthub.com subdomain, including
  // one left pointing somewhere it shouldn't), and "simple" requests — a
  // text/plain body, or none — skip the CORS preflight entirely. So a
  // browser's write must come from the web app itself. Browsers always send
  // Origin on a cross-origin write; a request without one is not a browser
  // being tricked, and is left to authenticate like any other.
  //
  // The one exception is unsubscribing, which mail providers POST themselves
  // and which is authorized by its signed token, not by a session.
  const webOrigin = process.env.WEB_URL ?? 'http://localhost:5173'
  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS')
      return
    if (request.url.startsWith('/email/unsubscribe')) return
    const origin = request.headers.origin
    const crossSite = request.headers['sec-fetch-site'] === 'cross-site'
    if ((origin !== undefined && origin !== webOrigin) || (origin === undefined && crossSite))
      return reply.code(403).send({ error: 'This request did not come from uofthub' })
  })

  await app.register(cookie)

  // The session is only ever the httpOnly cookie. Left to its default, the
  // plugin prefers an `Authorization: Bearer` header when one is present,
  // which the web app never sends — it would be a second way in that nothing
  // else (the rate limiter's key above all) accounts for.
  await app.register(jwt, {
    secret: jwtSecret(),
    cookie: { cookieName: 'token', signed: false },
    verify: { onlyCookie: true },
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

  // Optional locally: without credentials the button would send the student
  // to a Microsoft error page about `client_id=undefined`, so it comes
  // straight back to the sign-in page saying so instead.
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    await app.register(oauth2, {
      name: 'microsoftOAuth2',
      credentials: {
        client: {
          id: process.env.MICROSOFT_CLIENT_ID,
          secret: process.env.MICROSOFT_CLIENT_SECRET,
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
  } else {
    app.get('/auth/microsoft', async (_request, reply) =>
      reply.redirect(`${process.env.WEB_URL ?? 'http://localhost:5173'}/session?error=unavailable`)
    )
  }

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const account = await sessionAccount(request)
    if (!account) return reply.code(401).send({ error: 'Unauthorized' })
    // A suspended account can still read, and still sign out, delete or
    // export its own things (routes opt in with `allowSuspended`); every other
    // write is refused here rather than route by route.
    const allowed = request.method === 'GET' || request.routeOptions.config?.allowSuspended
    if (account.suspendedAt && !allowed) {
      return reply
        .code(403)
        .send({ error: 'A moderator has suspended this account', code: 'SUSPENDED' })
    }
  })

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(projectRoutes, { prefix: '/projects' })
  await app.register(userRoutes, { prefix: '/users' })
  await app.register(orgRoutes, { prefix: '/orgs' })
  await app.register(adminRoutes, { prefix: '/admin' })
  await app.register(discoverRoutes, { prefix: '/discover' })
  await app.register(feedRoutes, { prefix: '/feed' })
  await app.register(spotlightRoutes, { prefix: '/spotlight' })
  await app.register(collectionRoutes, { prefix: '/collections' })
  await app.register(messageRoutes, { prefix: '/messages' })
  await app.register(courseRoutes, { prefix: '/courses' })
  await app.register(eventRoutes, { prefix: '/events' })
  await app.register(emailRoutes, { prefix: '/email' })
  await app.register(pushRoutes, { prefix: '/push' })
  await app.register(pathRoutes, { prefix: '/paths' })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
