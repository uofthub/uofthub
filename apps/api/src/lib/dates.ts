/**
 * Midnight UTC, `daysAgo` days back.
 *
 * `ProjectDailyView.date` is a `@db.Date`, so every row comes back at exactly
 * midnight UTC. Comparing those against a plain `new Date()` offset would put
 * the boundary in the middle of a day and silently drop or double-count the
 * edge day of every window. The engagement windows use the same boundary so
 * "this week" means one thing across views, likes and comments alike.
 */
export function startOfUtcDay(daysAgo = 0): Date {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

/**
 * Monday 00:00 UTC of the week containing `at` — the key a weekly spotlight is
 * filed under, so "this week" means the same thing to every request.
 */
export function startOfUtcWeek(at: Date = new Date()): Date {
  const date = new Date(at)
  date.setUTCHours(0, 0, 0, 0)
  // getUTCDay: Sunday 0 … Saturday 6. Monday-based offset.
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date
}

/** Where U of T is. Show-from dates are picked as calendar days here. */
export const CAMPUS_TIME_ZONE = 'America/Toronto'

/**
 * Midnight at the start of `ymd` (YYYY-MM-DD) in Toronto, as an instant.
 * Null for anything that is not a real calendar date.
 *
 * Toronto is UTC−5 in winter and UTC−4 in summer, and no dependency is needed
 * to tell which: of the two candidate instants, the right one is the one
 * Toronto's own clock reads as 00:00 on that day.
 */
export function startOfTorontoDay(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  for (const offset of [4, 5]) {
    const at = new Date(Date.UTC(y, mo - 1, d, offset))
    if (format.format(at) === `${ymd}, 00:00`) return at
  }
  return null
}
