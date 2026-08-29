import type { Campus } from '@prisma/client'

/**
 * The campus allowlist, and the one place untrusted input becomes a `Campus`.
 *
 * Prisma would reject a bad value anyway, but with a 500 rather than a 400 —
 * a student sending nonsense should be told they sent nonsense, and the model
 * behind /discover should have its answer dropped rather than crash a search.
 */
export const CAMPUSES = ['UTSG', 'UTM', 'UTSC'] as const

export function parseCampus(raw: unknown): Campus | undefined {
  const value = String(raw ?? '').trim().toUpperCase()
  return (CAMPUSES as readonly string[]).includes(value) ? (value as Campus) : undefined
}
