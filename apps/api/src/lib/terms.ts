/**
 * Academic term boundaries. Config, not user-facing: the only thing terms are
 * used for is granting a student group its per-term storage allowance
 * (docs/student-groups.md § Storage policy), so the calendar only has to be
 * right about *when a new allowance is due*, not about registrarial dates.
 *
 * U of T runs three: Fall (Sep–Dec), Winter (Jan–Apr), Summer (May–Aug). A
 * term key is the calendar year of its start plus that letter — `2026F`.
 * Everything is computed in UTC so a grant doesn't land in a different term
 * depending on where the server is.
 */

/** Fresh allowance granted to a VERIFIED group each term. Allowances stack. */
export const ORG_TERM_ALLOWANCE_BYTES = 10 * 1024 * 1024 * 1024

const CODES = ['W', 'W', 'W', 'W', 'S', 'S', 'S', 'S', 'F', 'F', 'F', 'F'] as const

export type TermCode = 'F' | 'W' | 'S'

export function termFor(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}${CODES[date.getUTCMonth()]}`
}

/** First instant of a term, used to walk forward from one term to the next. */
export function termStart(key: string): Date {
  const year = Number(key.slice(0, 4))
  const code = key.slice(4) as TermCode
  const month = code === 'W' ? 0 : code === 'S' ? 4 : 8
  return new Date(Date.UTC(year, month, 1))
}

/**
 * Every term from the one containing `from` up to and including the current
 * one. This is what makes allowances stack: a group verified two terms ago is
 * owed three grants, not one, even if nothing ran in between.
 */
export function termsSince(from: Date, until: Date = new Date()): string[] {
  const last = termFor(until)
  const terms: string[] = []
  let cursor = termStart(termFor(from))

  // Bounded by construction (each step advances four months), but a guard
  // keeps a bad `from` — a year 1970 date, say — from spinning for long.
  for (let i = 0; i < 400; i++) {
    const key = termFor(cursor)
    terms.push(key)
    if (key === last) break
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 4, 1))
  }
  return terms
}

/** Human label for a term key — `2026F` → `Fall 2026`. */
export function termLabel(key: string): string {
  const names: Record<TermCode, string> = { F: 'Fall', W: 'Winter', S: 'Summer' }
  return `${names[key.slice(4) as TermCode] ?? key} ${key.slice(0, 4)}`
}
