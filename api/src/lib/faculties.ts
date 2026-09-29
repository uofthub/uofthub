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
 * The names are U of T's own list of faculties and academic units. Profiles
 * written before the list existed keep their free-text value until the
 * student edits it (see PATCH /users/me).
 */
export const FACULTIES = [
  'Applied Science & Engineering',
  'Architecture, Landscape & Design',
  'Arts & Science',
  'Continuing Studies',
  'Dentistry',
  'Education',
  'Information',
  'Kinesiology & Physical Education',
  'Law',
  'Management',
  'Medicine',
  'Music',
  'Nursing',
  'Pharmacy',
  'Public Health',
  'Social Work',
  'University of Toronto Mississauga',
  'University of Toronto Scarborough',
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
 * The subjects (CSC, MAT) that make up a student's main area, from the course
 * codes they take or published in: every subject with at least half as many
 * of their courses as their biggest one. Six CSC courses and two MAT gives
 * CSC; a first-year with one course each in CSC, MAT, PSY and ECO keeps all
 * four. The subject is the same on every campus — CSC108H1, CSC108H5 and
 * CSCA08H3 are all CSC — which a faculty is not.
 */
export function mainSubjects(courses: string[]): string[] {
  const codes = new Set(courses.flatMap((c) => normalizeCourseCode(c) ?? []))
  const counts = new Map<string, number>()
  for (const code of codes) counts.set(code.slice(0, 3), (counts.get(code.slice(0, 3)) ?? 0) + 1)
  const top = Math.max(0, ...counts.values())
  return [...counts].filter(([, n]) => n * 2 >= top).map(([subject]) => subject)
}

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
