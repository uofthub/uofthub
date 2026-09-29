/**
 * Paging parameters from a query string, made safe to hand to Prisma.
 *
 * `Number()` alone lets through `Infinity`, `1e308` and `2.5`, each of which
 * Prisma rejects with a 500, and any large finite offset, which makes Postgres
 * walk and discard that many rows before answering. Nobody pages 10,000 rows
 * deep through a UI that loads 20 at a time.
 */
export const MAX_SKIP = 10_000

const whole = (raw: unknown): number => {
  const n = Math.trunc(Number(raw))
  return Number.isFinite(n) ? n : 0
}

/** Rows to skip: a whole number from 0 to MAX_SKIP. */
export const pageSkip = (raw: unknown): number => Math.min(Math.max(whole(raw), 0), MAX_SKIP)

/** Rows to take: a whole number from 1 to `max`, or `fallback` when absent. */
export const pageTake = (raw: unknown, fallback: number, max: number): number =>
  Math.min(Math.max(whole(raw) || fallback, 1), max)
