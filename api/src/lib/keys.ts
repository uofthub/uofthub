import { hkdfSync } from 'node:crypto'

/**
 * Secrets, one per job.
 *
 * `JWT_SECRET` is the one secret a deployment must set (app.ts refuses to boot
 * without it in production). Everything else that needs a key derives its own
 * from it with HKDF, labelled by purpose, rather than reusing the session key
 * directly: a key that leaks from one use — an unsubscribe signature, a view
 * hash — then says nothing about the others, and none of them is the key that
 * signs sessions.
 */
export const jwtSecret = (): string => process.env.JWT_SECRET ?? 'dev-secret-change-in-prod'

const derived = new Map<string, Buffer>()

/** A 32-byte key for one purpose, derived from `JWT_SECRET`. */
export function derivedKey(purpose: 'unsubscribe-v1' | 'view-salt-v1'): Buffer {
  const secret = jwtSecret()
  const cacheKey = `${purpose}\0${secret}`
  let key = derived.get(cacheKey)
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', secret, 'uofthub', purpose, 32))
    derived.set(cacheKey, key)
  }
  return key
}
