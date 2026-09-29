import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { db } from '../db/client.js'

/**
 * Sessions: a signed JWT in an httpOnly cookie, checked against the database
 * on every request that uses it.
 *
 * The signature alone would make a session impossible to revoke — a token
 * copied before a password reset would keep working for its full seven days.
 * So each token carries the account's `sessionVersion` as `sv`, and a token
 * whose version no longer matches (the password changed, the student signed
 * out everywhere, the account is gone) is treated as no session at all.
 *
 * Signing out on one device ends just that session: each token has its own
 * id (`jti`), and signing out records it as revoked until the token would
 * have expired anyway. Clearing the cookie alone would leave a copy of the
 * token — off a shared lab computer, say — working for the rest of its week.
 */

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

/** Signs our JWT and attaches it as the session cookie. */
export function issueSession(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; email: string; sessionVersion: number }
) {
  // Expiry must be set on the token itself: the cookie's Max-Age is a client
  // hint, so without this a copied token stays valid forever.
  const token = app.jwt.sign(
    {
      sub: user.id,
      email: user.email,
      sv: user.sessionVersion,
      jti: randomUUID(),
    },
    { expiresIn: SESSION_MAX_AGE_SECONDS }
  )
  reply.setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export type SessionAccount = { id: string; suspendedAt: Date | null }

const checked = new WeakMap<FastifyRequest, SessionAccount | null>()

/**
 * The account behind this request's session, or null when there is no valid
 * one. Memoized per request, so a route that asks twice costs one query.
 */
export async function sessionAccount(request: FastifyRequest): Promise<SessionAccount | null> {
  if (checked.has(request)) return checked.get(request)!
  let account: SessionAccount | null = null
  try {
    await request.jwtVerify()
    const { jti } = request.user
    const [user, revoked] = await Promise.all([
      db.user.findUnique({
        where: { id: request.user.sub },
        select: { id: true, sessionVersion: true, suspendedAt: true },
      }),
      jti ? db.revokedSession.findUnique({ where: { jti }, select: { jti: true } }) : null,
    ])
    if (user && !revoked && user.sessionVersion === (request.user.sv ?? 0))
      account = { id: user.id, suspendedAt: user.suspendedAt }
  } catch {
    account = null
  }
  checked.set(request, account)
  return account
}

/**
 * Ends this request's session, if it has one, for good: its token stops
 * working even where a copy of it survives the cleared cookie.
 */
export async function revokeSession(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    return
  }
  const { jti, exp } = request.user
  if (!jti) return
  const expiresAt = exp
    ? new Date(exp * 1000)
    : new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
  await db.revokedSession.upsert({ where: { jti }, update: {}, create: { jti, expiresAt } })
  checked.delete(request)
}
