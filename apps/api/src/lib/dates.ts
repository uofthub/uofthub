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
