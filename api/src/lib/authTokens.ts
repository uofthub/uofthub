import { createHash, randomBytes } from 'node:crypto'
import type { AuthTokenKind } from '@prisma/client'
import { db } from '../db/client.js'

/**
 * Single-use links we email: confirming an address, setting a new password.
 *
 * The raw token only ever exists in the email. The table keeps its SHA-256,
 * so a leaked copy of the database cannot be replayed as links, and a token
 * is claimed and spent in one statement so two clicks cannot both use it.
 */

export const TOKEN_TTL_MS: Record<AuthTokenKind, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
}

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex')

/** A fresh token of `kind` for `userId`. Any earlier unused one of that kind stops working. */
export async function issueToken(userId: string, kind: AuthTokenKind): Promise<string> {
  const raw = randomBytes(32).toString('base64url')
  await db.$transaction([
    db.authToken.deleteMany({ where: { userId, kind, usedAt: null } }),
    db.authToken.create({
      data: {
        userId,
        kind,
        tokenHash: hash(raw),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS[kind]),
      },
    }),
  ])
  return raw
}

/** Spend a token. Returns its user, or null when it is unknown, used, expired or the wrong kind. */
export async function consumeToken(raw: unknown, kind: AuthTokenKind): Promise<string | null> {
  if (typeof raw !== 'string' || !raw) return null
  const tokenHash = hash(raw)
  const now = new Date()
  const { count } = await db.authToken.updateMany({
    where: { tokenHash, kind, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  })
  if (count !== 1) return null
  const token = await db.authToken.findUnique({ where: { tokenHash }, select: { userId: true } })
  return token?.userId ?? null
}
