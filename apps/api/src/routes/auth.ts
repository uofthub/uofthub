import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'

const UOFT_DOMAINS = ['@mail.utoronto.ca', '@utoronto.ca']

function getRole(email: string): 'STUDENT' | 'FACULTY' {
  return email.endsWith('@utoronto.ca') ? 'FACULTY' : 'STUDENT'
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // GET /auth/microsoft → handled by @fastify/oauth2 (registered in app.ts)

  // GET /auth/callback — Microsoft redirects here after login
  app.get('/callback', async (request, reply) => {
    const oauthResult = await app.microsoftOAuth2
      .getAccessTokenFromAuthorizationCodeFlow(request)
      .catch((err: unknown) => {
        app.log.error(err, 'OAuth token exchange failed')
        return null
      })

    if (!oauthResult) {
      return reply.code(400).send({ error: 'OAuth failed' })
    }

    const accessToken = oauthResult.token.access_token

    // Fetch user info from Microsoft Graph
    const graphRes = await fetch(
      'https://graph.microsoft.com/v1.0/me?$select=mail,displayName,userPrincipalName',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!graphRes.ok) {
      app.log.error({ status: graphRes.status }, 'Microsoft Graph request failed')
      return reply.code(502).send({ error: 'Failed to fetch user info' })
    }

    const graphUser = await graphRes.json() as {
      mail?: string
      displayName?: string
      userPrincipalName?: string
    }

    const email = (graphUser.mail || graphUser.userPrincipalName || '').toLowerCase()
    const name = graphUser.displayName ?? email

    // Enforce U of T domain
    if (!UOFT_DOMAINS.some((domain) => email.endsWith(domain))) {
      return reply
        .code(403)
        .send({ error: 'A University of Toronto account is required to sign in.' })
    }

    // Upsert user in DB
    const user = await db.user.upsert({
      where: { email },
      update: { name },
      create: { email, name },
    })

    // Issue our own JWT as an httpOnly cookie
    const jwtToken = app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: getRole(email),
    })

    reply
      .setCookie('token', jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      })
      .redirect(process.env.WEB_URL ?? 'http://localhost:5173')
  })

  // POST /auth/logout
  app.post('/logout', async (request, reply) => {
    reply.clearCookie('token', { path: '/' }).send({ ok: true })
  })

  // GET /auth/me — returns the current user from DB (requires auth)
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await db.user.findUnique({
      where: { id: request.user.sub },
      select: {
        id: true,
        email: true,
        name: true,
        faculty: true,
        program: true,
        classYear: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    })

    if (!user) return reply.code(404).send({ error: 'User not found' })
    return { ...user, role: getRole(user.email) }
  })
}
