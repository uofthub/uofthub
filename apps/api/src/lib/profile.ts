import { isCourseCode } from './faculties.js'

/**
 * The free-form parts of a profile, cleaned before they are stored. Each
 * returns null for input that is not a list of strings at all, so the route
 * can tell "malformed" from "empty".
 */

export const OPEN_TO_MAX = 6
export const OPEN_TO_ITEM_MAX = 40
export const COURSES_MAX = 12

function strings(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) return null
  return raw as string[]
}

/** Dedupe case-insensitively, keeping the first spelling and the order. */
function unique(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((v) => {
    const k = v.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** "Open to" chips: short, trimmed, at most OPEN_TO_MAX of them. */
export function parseOpenTo(raw: unknown): string[] | null {
  const list = strings(raw)
  if (!list) return null
  const cleaned = unique(list.map((v) => v.trim().replace(/\s+/g, ' ')).filter(Boolean))
  if (cleaned.length > OPEN_TO_MAX || cleaned.some((v) => v.length > OPEN_TO_ITEM_MAX)) return null
  return cleaned
}

/** Course codes, upper-cased. Anything that is not a course code is refused. */
export function parseCourses(raw: unknown): string[] | null {
  const list = strings(raw)
  if (!list) return null
  const cleaned = unique(list.map((v) => v.trim().toUpperCase()).filter(Boolean))
  if (cleaned.length > COURSES_MAX || !cleaned.every(isCourseCode)) return null
  return cleaned
}
