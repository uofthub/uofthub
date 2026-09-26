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
 */

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

export const roleFor = (email: string): 'STUDENT' | 'FACULTY' =>
  email.endsWith('@utoronto.ca') ? 'FACULTY' : 'STUDENT'

/** Signs our JWT and attaches it as the session cookie. */
export function issueSession(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; email: string; sessionVersion: number }
) {
  // Expiry must be set on the token itself: the cookie's Max-Age is a client
  // hint, so without this a copied token stays valid forever.
  const token = app.jwt.sign(
    { sub: user.id, email: user.email, role: roleFor(user.email), sv: user.sessionVersion },
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
    const user = await db.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, sessionVersion: true, suspendedAt: true },
    })
    if (user && user.sessionVersion === (request.user.sv ?? 0))
      account = { id: user.id, suspendedAt: user.suspendedAt }
  } catch {
    account = null
  }
  checked.set(request, account)
  return account
}
