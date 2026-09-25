import type { Campus } from '@uofthub/types'

/**
 * Campus vocabulary for the UI.
 *
 * Students say "UTM" and "UTSC" but almost never "UTSG" — St. George is just
 * "downtown" or "main campus". So the short code is what gets shown in tight
 * places (chips, filters) and the full name is the label on anything someone
 * has to choose from.
 */
export const CAMPUS_LABELS: Record<Campus, string> = {
  UTSG: 'St. George',
  UTM: 'Mississauga',
  UTSC: 'Scarborough',
}

export const CAMPUSES = ['UTSG', 'UTM', 'UTSC'] as const

export const CAMPUS_OPTIONS = CAMPUSES.map((value) => ({
  value,
  label: `${value} — ${CAMPUS_LABELS[value]}`,
}))

/**
 * How the boards write it in running text — "Computer Science · UTM · 2h",
 * "Engineering Science · Year 3 · St. George".
 */
export const CAMPUS_SHORT: Record<Campus, string> = {
  UTSG: 'St. George',
  UTM: 'UTM',
  UTSC: 'UTSC',
}

export function campusShort(campus?: Campus | null): string | undefined {
  return campus ? CAMPUS_SHORT[campus] : undefined
}

/** "UTM — Mississauga", or undefined when the campus is unstated. */
export function campusLabel(campus?: Campus | null): string | undefined {
  return campus ? `${campus} — ${CAMPUS_LABELS[campus]}` : undefined
}
