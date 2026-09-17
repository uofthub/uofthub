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
