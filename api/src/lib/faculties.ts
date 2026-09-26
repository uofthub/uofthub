import type { Prisma } from '@prisma/client'

/**
 * The faculties and divisions a profile can name.
 *
 * A fixed list rather than free text: Explore's faculty tiles, the "Your
 * program" feed and the faculty filter all match on this value exactly, and
 * free text meant "Engineering", "engineering sci" and "FASE" were three
 * different faculties that never met. Mirrored in web/src/lib/faculties.ts
 * — change both together.
 *
 * Profiles written before the list existed keep their free-text value until
 * the student edits it (see PATCH /users/me).
 */
export const FACULTIES = [
  'Arts & Science',
  'Engineering',
  'Architecture, Landscape & Design',
  'Music',
  'Information',
  'Rotman Commerce',
  'Kinesiology & Physical Education',
  'Medicine',
  'Nursing',
  'Pharmacy',
  'Dentistry',
  'Law',
  'Social Work',
  'Public Health',
  'Education (OISE)',
  'UTM',
  'UTSC',
] as const

export type Faculty = (typeof FACULTIES)[number]

export const isFaculty = (value: string): value is Faculty =>
  (FACULTIES as readonly string[]).includes(value)

/** A U of T course code — mirrors isCourseCode in web/src/lib/projectView.ts. */
// Three letters, then three digits (St. George and UTM: CSC343, MAT137Y1) or
// a level letter and two digits (UTSC: CSCA08, MATA31H3), then an optional
// weight and campus suffix.
const COURSE_CODE = /^[a-z]{3}(?:\d{3}|[a-d]\d{2})(?:[hy]\d)?$/i
export const isCourseCode = (tag: string) => COURSE_CODE.test(tag.trim())

/** A course code as stored: trimmed and upper-cased. Null if it is not one. */
export const normalizeCourseCode = (raw: string) =>
  isCourseCode(raw) ? raw.trim().toUpperCase() : null

/**
 * Projects filed under a course. A full code (CSC211H5) matches exactly; a
 * bare stem (CSC211) matches every weight and campus of it. Null for input
 * that is neither, so the caller can ignore it.
 */
export function courseWhere(raw: string): Prisma.ProjectWhereInput | null {
  const code = normalizeCourseCode(raw)
  if (!code) return null
  return code.length === 6 ? { courseCode: { startsWith: code } } : { courseCode: code }
}

/**
 * Projects made by someone in a faculty: the owner, or any accepted
 * collaborator. A VIEWER row is a TA's or instructor's access grant, which is
 * access to the work, not credit for it, so it does not count.
 */
export function facultyWhere(
  faculty: string,
  match: 'equals' | 'contains' = 'equals'
): Prisma.ProjectWhereInput {
  const cond = { [match]: faculty, mode: 'insensitive' as const }
  return {
    OR: [
      { owner: { faculty: cond } },
      {
        collaborators: {
          some: { accepted: true, role: { not: 'VIEWER' }, user: { faculty: cond } },
        },
      },
    ],
  }
}
