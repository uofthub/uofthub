import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/**
 * scrypt parameters. N=2^15 with r=8 costs ~32MB per hash, which sits in the
 * range OWASP recommends and is cheap enough to run per login request.
 * `maxmem` must be raised past Node's 32MB default to allow it.
 */
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 }
const KEY_LENGTH = 64
const SALT_LENGTH = 16

/** Minimum length we accept. Length beats composition rules; no other checks. */
export const MIN_PASSWORD_LENGTH = 10

/** Hash a password for storage. Format: `scrypt$N$r$p$<salt hex>$<key hex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS)
  const { N, r, p } = PARAMS
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${key.toString('hex')}`
}

/**
 * Verify a password against a stored hash. Returns false rather than throwing
 * on a malformed or unknown-format hash.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, n, r, p, saltHex, keyHex] = parts
  const salt = Buffer.from(saltHex!, 'hex')
  const expected = Buffer.from(keyHex!, 'hex')
  if (salt.length === 0 || expected.length === 0) return false

  let actual: Buffer
  try {
    actual = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMS.maxmem,
    })
  } catch {
    return false
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
