import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '../lib/password.js'
import { putObject } from '../lib/storage.js'
import { avatarObjectKey, avatarUrlFor } from '../lib/avatar.js'
import { issueSession, roleFor } from '../lib/session.js'
import { consumeToken, issueToken } from '../lib/authTokens.js'
import {
  sendAlreadyRegisteredEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../lib/authEmails.js'
import { onEmailVerified } from '../lib/accounts.js'
import { matchesDeclaredType } from '../lib/fileValidation.js'
import { tenantAllowed, tenantOfIdToken } from '../lib/microsoftTenant.js'

const UOFT_DOMAINS = ['@mail.utoronto.ca', '@utoronto.ca']

const isUofTEmail = (email: string) => UOFT_DOMAINS.some((domain) => email.endsWith(domain))

const webUrl = () => process.env.WEB_URL ?? 'http://localhost:5173'

/** Longest avatar Microsoft Graph may hand us; its photos are small. */
const GRAPH_PHOTO_MAX_BYTES = 4 * 1024 * 1024

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
    // Graph serves JPEGs; anything else is not stored under our name.
    if (buffer.length > GRAPH_PHOTO_MAX_BYTES || !(await matchesDeclaredType(buffer, 'jpg'))) return
    const key = avatarObjectKey(userId)
    await putObject(key, buffer, 'image/jpeg')

    await db.user.updateMany({
      where: { id: userId, avatarIsCustom: false },
      data: { avatarKey: key, avatarUrl: avatarUrlFor(userId) },
    })
  } catch {
    // Best-effort — a missing/misconfigured storage provider should never
    // block sign-in over something as inconsequential as an avatar.
  }
}

/**
 * Upper bound on password length. scrypt cost scales with input, so an
 * unbounded password lets one request burn CPU deliberately.
 */
const MAX_PASSWORD_LENGTH = 200
const NAME_MAX = 80

/** Why a new password is refused, or null when it is fine. */
function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password.length > MAX_PASSWORD_LENGTH)
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`
  return null
}

/**
 * What every "check your email" route answers, whatever happened. Saying
 * anything else — "that address already has an account" — would let anyone
 * test which addresses are registered.
 */
const CHECK_EMAIL = { checkEmail: true }

export const authRoutes: FastifyPluginAsync = async (app) => {
  // GET /auth/microsoft → handled by @fastify/oauth2 (registered in app.ts)

  /** Back to the sign-in page, saying what went wrong, rather than raw JSON on the API's domain. */
  const failSignIn = (reply: Parameters<typeof issueSession>[1], error: string) =>
    reply.redirect(`${webUrl()}/session?error=${error}`)

  // GET /auth/callback — Microsoft redirects here after login
  app.get('/callback', async (request, reply) => {
    // Not registered without credentials (see app.ts).
    if (!app.hasDecorator('microsoftOAuth2')) return failSignIn(reply, 'unavailable')
    const oauthResult = await app.microsoftOAuth2
      .getAccessTokenFromAuthorizationCodeFlow(request)
      .catch((err: unknown) => {
        app.log.error(err, 'OAuth token exchange failed')
        return null
      })

    if (!oauthResult) return failSignIn(reply, 'oauth')

    // Before anything the token says about an address is believed: see
    // lib/microsoftTenant.ts for why any other directory's word is worthless.
    if (!tenantAllowed(oauthResult.token.id_token)) {
      app.log.warn(
        { tenant: tenantOfIdToken(oauthResult.token.id_token) },
        'Microsoft sign-in from a tenant not in MICROSOFT_ALLOWED_TENANT_IDS'
      )
      return failSignIn(reply, 'domain')
    }

    const accessToken = oauthResult.token.access_token

    // Fetch user info from Microsoft Graph
    const graphRes = await fetch(
      'https://graph.microsoft.com/v1.0/me?$select=mail,displayName,userPrincipalName',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!graphRes.ok) {
      app.log.error({ status: graphRes.status }, 'Microsoft Graph request failed')
      return failSignIn(reply, 'oauth')
    }

    const graphUser = (await graphRes.json()) as {
      mail?: string
      displayName?: string
      userPrincipalName?: string
    }

    const email = (graphUser.mail || graphUser.userPrincipalName || '').toLowerCase()
    const name = (graphUser.displayName ?? email).slice(0, NAME_MAX)

    // Enforce U of T domain
    if (!isUofTEmail(email)) return failSignIn(reply, 'domain')

    // Checked separately from the write, rather than a single upsert, so a
    // genuinely new account (and only that) can trigger the avatar sync below.
    const existing = await db.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    })

    // Microsoft has just proved this person owns the address. An account that
    // was never confirmed was nobody's until now, so any password set on it
    // was set by somebody who could not prove the address — it goes, or its
    // author could sign in to the real owner's account from here on.
    const user = existing
      ? await db.user.update({
          where: { email },
          data: {
            name,
            ...(!existing.emailVerifiedAt && { emailVerifiedAt: new Date(), passwordHash: null }),
          },
        })
      : await db.user.create({ data: { email, name, emailVerifiedAt: new Date() } })

    if (!existing?.emailVerifiedAt) await onEmailVerified(user.id)

    // Fire-and-forget: never blocks the redirect, and syncMicrosoftAvatar
    // already swallows its own errors, so there is nothing to await here.
    if (!existing) void syncMicrosoftAvatar(user.id, accessToken)

    issueSession(app, reply, user)
    // Through the sign-in page, which sends the student on to wherever they
    // were headed before they left to sign in.
    return reply.redirect(`${webUrl()}/session`)
  })

  // Credential endpoints are the ones worth brute-forcing, so they get a far
  // tighter budget than the global ceiling.
  const credentialRateLimit = {
    rateLimit: { max: 10, timeWindow: '15 minutes' },
  }

  // POST /auth/register — email + password sign-up
  //
  // Nothing signs in from here. The account is created unconfirmed and a link
  // goes to the address; only following it (POST /auth/verify) proves the
  // address is theirs and starts a session. An address that already has an
  // account gets an email saying so instead — never a password set on it,
  // which would hand the account to whoever typed the address.
  app.post<{ Body: { email?: string; password?: string; name?: string } }>(
    '/register',
    { config: credentialRateLimit },
    async (request, reply) => {
      const email = String(request.body?.email ?? '')
        .trim()
        .toLowerCase()
      const password = String(request.body?.password ?? '')
      const name = String(request.body?.name ?? '').trim()

      if (!email || !password || !name) {
        return reply.code(400).send({ error: 'Name, email and password are all required.' })
      }
      if (name.length > NAME_MAX)
        return reply.code(400).send({ error: `A name is at most ${NAME_MAX} characters.` })
      if (!isUofTEmail(email)) {
        return reply
          .code(403)
          .send({ error: 'Sign up with your @mail.utoronto.ca or @utoronto.ca address.' })
      }
      const problem = passwordProblem(password)
      if (problem) return reply.code(400).send({ error: problem })

      const existing = await db.user.findUnique({
        where: { email },
        select: { id: true, emailVerifiedAt: true, passwordHash: true },
      })

      if (existing?.emailVerifiedAt) {
        if (existing.passwordHash) await sendAlreadyRegisteredEmail(email)
        else
          await sendPasswordResetEmail(
            email,
            await issueToken(existing.id, 'RESET_PASSWORD'),
            'set'
          )
        return reply.code(202).send(CHECK_EMAIL)
      }

      // A confirmed account is somebody's; an unconfirmed one is not yet, so
      // signing up again simply starts it over with the new details.
      const passwordHash = await hashPassword(password)
      const user = existing
        ? await db.user.update({ where: { email }, data: { name, passwordHash } })
        : await db.user.create({ data: { email, name, passwordHash } })

      await sendVerificationEmail(email, name, await issueToken(user.id, 'VERIFY_EMAIL'))
      return reply.code(202).send(CHECK_EMAIL)
    }
  )

  // POST /auth/verify — { token } from the confirmation email
  app.post<{ Body: { token?: string } }>(
    '/verify',
    { config: credentialRateLimit },
    async (request, reply) => {
      const userId = await consumeToken(request.body?.token, 'VERIFY_EMAIL')
      if (!userId)
        return reply
          .code(400)
          .send({ error: 'That link has expired or was already used. Sign in to get a new one.' })

      const before = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { emailVerifiedAt: true },
      })
      const user = await db.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: before.emailVerifiedAt ?? new Date() },
      })
      if (!before.emailVerifiedAt) await onEmailVerified(user.id)
      issueSession(app, reply, user)
      return { id: user.id, email: user.email, name: user.name }
    }
  )

  // POST /auth/resend-verification — { email }. Same answer whatever happened.
  app.post<{ Body: { email?: string } }>(
    '/resend-verification',
    { config: credentialRateLimit },
    async (request, reply) => {
      const email = String(request.body?.email ?? '')
        .trim()
        .toLowerCase()
      const user = email
        ? await db.user.findUnique({
            where: { email },
            select: { id: true, name: true, emailVerifiedAt: true, passwordHash: true },
          })
        : null
      if (user && !user.emailVerifiedAt && user.passwordHash)
        await sendVerificationEmail(email, user.name, await issueToken(user.id, 'VERIFY_EMAIL'))
      return reply.code(202).send(CHECK_EMAIL)
    }
  )

  // POST /auth/forgot-password — { email }. Same answer whatever happened.
  app.post<{ Body: { email?: string } }>(
    '/forgot-password',
    { config: credentialRateLimit },
    async (request, reply) => {
      const email = String(request.body?.email ?? '')
        .trim()
        .toLowerCase()
      const user = email
        ? await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } })
        : null
      if (user)
        await sendPasswordResetEmail(
          email,
          await issueToken(user.id, 'RESET_PASSWORD'),
          user.passwordHash ? 'reset' : 'set'
        )
      return reply.code(202).send(CHECK_EMAIL)
    }
  )

  // POST /auth/reset-password — { token, password }
  //
  // Following the link proves the address, so it also confirms an account
  // that never was. Every other session on the account ends.
  app.post<{ Body: { token?: string; password?: string } }>(
    '/reset-password',
    { config: credentialRateLimit },
    async (request, reply) => {
      const password = String(request.body?.password ?? '')
      const problem = passwordProblem(password)
      if (problem) return reply.code(400).send({ error: problem })

      const userId = await consumeToken(request.body?.token, 'RESET_PASSWORD')
      if (!userId)
        return reply
          .code(400)
          .send({ error: 'That link has expired or was already used. Ask for a new one.' })

      const before = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { emailVerifiedAt: true },
      })
      const user = await db.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hashPassword(password),
          emailVerifiedAt: before.emailVerifiedAt ?? new Date(),
          sessionVersion: { increment: 1 },
        },
      })
      if (!before.emailVerifiedAt) await onEmailVerified(user.id)
      issueSession(app, reply, user)
      return { id: user.id, email: user.email, name: user.name }
    }
  )

  // POST /auth/login — email + password sign-in
  app.post<{ Body: { email?: string; password?: string } }>(
    '/login',
    { config: credentialRateLimit },
    async (request, reply) => {
      const email = String(request.body?.email ?? '')
        .trim()
        .toLowerCase()
      const password = String(request.body?.password ?? '')

      if (!email || !password) {
        return reply.code(400).send({ error: 'Email and password are required.' })
      }
      // Bound the work before hashing; a valid password can never be this long.
      if (password.length > MAX_PASSWORD_LENGTH) {
        return reply.code(401).send({ error: 'Incorrect email or password.' })
      }

      const user = await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          emailVerifiedAt: true,
          sessionVersion: true,
        },
      })

      // Distinguishing "no password set" from "wrong password" is worth the small
      // disclosure here: without it, OAuth users get stuck with no way to know why.
      if (user && !user.passwordHash) {
        return reply.code(409).send({
          error:
            'That account signs in with Microsoft. Use the UTORid button, or “Forgot password” to add one.',
        })
      }

      if (!user || !(await verifyPassword(password, user.passwordHash!))) {
        return reply.code(401).send({ error: 'Incorrect email or password.' })
      }

      // Checked after the password, so it says nothing to someone guessing.
      if (!user.emailVerifiedAt) {
        return reply.code(403).send({
          error: 'Confirm your email first — follow the link we sent you.',
          code: 'UNVERIFIED',
        })
      }

      issueSession(app, reply, user)
      return { id: user.id, email: user.email, name: user.name }
    }
  )

  // POST /auth/password — { currentPassword?, newPassword }. Signed in.
  //
  // The current password is required whenever there is one. Every other
  // session ends; this one is reissued so the student stays signed in here.
  app.post<{ Body: { currentPassword?: string; newPassword?: string } }>(
    '/password',
    { preHandler: [app.authenticate], config: { ...credentialRateLimit, allowSuspended: true } },
    async (request, reply) => {
      const newPassword = String(request.body?.newPassword ?? '')
      const problem = passwordProblem(newPassword)
      if (problem) return reply.code(400).send({ error: problem })

      const current = await db.user.findUniqueOrThrow({
        where: { id: request.user.sub },
        select: { passwordHash: true },
      })
      if (current.passwordHash) {
        const given = String(request.body?.currentPassword ?? '')
        if (
          !given ||
          given.length > MAX_PASSWORD_LENGTH ||
          !(await verifyPassword(given, current.passwordHash))
        )
          return reply.code(403).send({ error: 'Your current password is not right.' })
      }

      const user = await db.user.update({
        where: { id: request.user.sub },
        data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } },
      })
      issueSession(app, reply, user)
      return { ok: true }
    }
  )

  // POST /auth/logout
  app.post('/logout', { config: { allowSuspended: true } }, async (_request, reply) => {
    reply.clearCookie('token', { path: '/' }).send({ ok: true })
  })

  // POST /auth/logout-everywhere — ends every session on the account, this one included
  app.post(
    '/logout-everywhere',
    { preHandler: [app.authenticate], config: { allowSuspended: true } },
    async (request, reply) => {
      await db.user.update({
        where: { id: request.user.sub },
        data: { sessionVersion: { increment: 1 } },
      })
      reply.clearCookie('token', { path: '/' }).send({ ok: true })
    }
  )

  // GET /auth/me — returns the current user from DB (requires auth)
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await db.user.findUnique({
      where: { id: request.user.sub },
      select: {
        id: true,
        email: true,
        name: true,
        faculty: true,
        campus: true,
        program: true,
        classYear: true,
        avatarUrl: true,
        bio: true,
        openTo: true,
        websiteUrl: true,
        githubUrl: true,
        linkedinUrl: true,
        courses: true,
        allowMessages: true,
        emailNotifications: true,
        isAdmin: true,
        suspendedAt: true,
        passwordHash: true,
        createdAt: true,
      },
    })

    if (!user) return reply.code(404).send({ error: 'User not found' })
    const { passwordHash, ...rest } = user
    return { ...rest, hasPassword: !!passwordHash, role: roleFor(user.email) }
  })
}
