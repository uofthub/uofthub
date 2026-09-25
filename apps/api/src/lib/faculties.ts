/**
 * The faculties and divisions a profile can name.
 *
 * A fixed list rather than free text: Explore's faculty tiles, the "Your
 * program" feed and the faculty filter all match on this value exactly, and
 * free text meant "Engineering", "engineering sci" and "FASE" were three
 * different faculties that never met. Mirrored in apps/web/src/lib/faculties.ts
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

/** A U of T course code — mirrors isCourseCode in apps/web/src/lib/projectView.ts. */
const COURSE_CODE = /^[a-z]{3}\d{3}(?:[hy]\d)?$/i
export const isCourseCode = (tag: string) => COURSE_CODE.test(tag.trim())
