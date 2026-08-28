import type { FastifyPluginAsync, FastifyInstance, FastifyReply } from 'fastify'
import { db } from '../db/client.js'
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '../lib/password.js'
import { putObject } from '../lib/storage.js'
import { avatarObjectKey, avatarUrlFor } from '../lib/avatar.js'

const UOFT_DOMAINS = ['@mail.utoronto.ca', '@utoronto.ca']

function getRole(email: string): 'STUDENT' | 'FACULTY' {
  return email.endsWith('@utoronto.ca') ? 'FACULTY' : 'STUDENT'
}

const isUofTEmail = (email: string) => UOFT_DOMAINS.some((domain) => email.endsWith(domain))

/**
 * Pulls the signed-in-user's photo from Microsoft Graph and stores it as
 * their avatar. Only called for a brand new account (see the callback below)
 * — that's what "on signup" means here, and it also means avatarIsCustom is
 * guaranteed false, though the update is still scoped to it for the same
 * reason the fileValidation checks run against real bytes: the guarantee
 * should be explicit in the code, not just true by the caller's construction.
 * Many accounts simply have no photo set, which Graph reports as a 404 —
 * that's expected, not an error, and sign-in must never fail because of it.
 */
async function syncMicrosoftAvatar(userId: string, accessToken: string): Promise<void> {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return

    const buffer = Buffer.from(await res.arrayBuffer())
    const key = avatarObjectKey(userId)
    await putObject(key, buffer, res.headers.get('content-type') ?? undefined)

    await db.user.updateMany({
      where: { id: userId, avatarIsCustom: false },
      data: { avatarKey: key, avatarUrl: avatarUrlFor(userId) },
    })
  } catch {
    // Best-effort — a missing/misconfigured storage provider should never
    // block sign-in over something as inconsequential as an avatar.
  }
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

/**
 * Upper bound on password length. scrypt cost scales with input, so an
 * unbounded password lets one request burn CPU deliberately.
 */
const MAX_PASSWORD_LENGTH = 200

/** Signs our JWT and attaches it as the session cookie. */
function issueSession(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; email: string },
) {
  // Expiry must be set on the token itself: the cookie's Max-Age is a client
  // hint, so without this a copied token stays valid forever.
  const token = app.jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: getRole(user.email),
    },
    { expiresIn: SESSION_MAX_AGE_SECONDS },
  )

  reply.setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
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
    if (!isUofTEmail(email)) {
      return reply
        .code(403)
        .send({ error: 'A University of Toronto account is required to sign in.' })
    }

    // Checked separately from the write, rather than a single upsert, so a
    // genuinely new account (and only that) can trigger the avatar sync below.
    const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } })

    // Never touches passwordHash, so linking Microsoft to an existing
    // password account leaves that password working.
    const user = existingUser
      ? await db.user.update({ where: { email }, data: { name } })
      : await db.user.create({ data: { email, name } })

    // Fire-and-forget: never blocks the redirect, and syncMicrosoftAvatar
    // already swallows its own errors, so there is nothing to await here.
    if (!existingUser) {
      void syncMicrosoftAvatar(user.id, accessToken)
    }

    issueSession(app, reply, user)
    return reply.redirect(process.env.WEB_URL ?? 'http://localhost:5173')
  })

  // Credential endpoints are the ones worth brute-forcing, so they get a far
  // tighter budget than the global ceiling.
  const credentialRateLimit = {
    rateLimit: { max: 10, timeWindow: '15 minutes' },
  }

  // POST /auth/register — email + password sign-up
  app.post<{ Body: { email?: string; password?: string; name?: string } }>(
    '/register',
    { config: credentialRateLimit },
    async (request, reply) => {
      const email = (request.body?.email ?? '').trim().toLowerCase()
      const password = request.body?.password ?? ''
      const name = (request.body?.name ?? '').trim()

      if (!email || !password || !name) {
        return reply.code(400).send({ error: 'Name, email and password are all required.' })
      }
      if (!isUofTEmail(email)) {
        return reply
          .code(403)
          .send({ error: 'Sign up with your @mail.utoronto.ca or @utoronto.ca address.' })
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return reply
          .code(400)
          .send({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
      }
      if (password.length > MAX_PASSWORD_LENGTH) {
        return reply
          .code(400)
          .send({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` })
      }

      const existing = await db.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true },
      })

      if (existing?.passwordHash) {
        return reply.code(409).send({ error: 'An account with that email already exists.' })
      }

      const passwordHash = await hashPassword(password)

      // An account may already exist from a Microsoft sign-in. Setting a
      // password on it links the two methods rather than colliding.
      const user = existing
        ? await db.user.update({ where: { email }, data: { passwordHash } })
        : await db.user.create({ data: { email, name, passwordHash } })

      issueSession(app, reply, user)
      return reply.code(201).send({ id: user.id, email: user.email, name: user.name })
    },
  )

  // POST /auth/login — email + password sign-in
  app.post<{ Body: { email?: string; password?: string } }>(
    '/login',
    { config: credentialRateLimit },
    async (request, reply) => {
    const email = (request.body?.email ?? '').trim().toLowerCase()
    const password = request.body?.password ?? ''

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required.' })
    }
    // Bound the work before hashing; a valid password can never be this long.
    if (password.length > MAX_PASSWORD_LENGTH) {
      return reply.code(401).send({ error: 'Incorrect email or password.' })
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, passwordHash: true },
    })

    // Distinguishing "no password set" from "wrong password" is worth the small
    // disclosure here: without it, OAuth users get stuck with no way to know why.
    if (user && !user.passwordHash) {
      return reply
        .code(409)
        .send({ error: 'That account signs in with Microsoft. Use the UTORid button instead.' })
    }

    if (!user || !(await verifyPassword(password, user.passwordHash!))) {
      return reply.code(401).send({ error: 'Incorrect email or password.' })
    }

      issueSession(app, reply, user)
      return { id: user.id, email: user.email, name: user.name }
    },
  )

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
