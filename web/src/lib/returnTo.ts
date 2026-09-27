/**
 * Sending a student back to where they were once they have signed in.
 *
 * Every link to /session would otherwise have to carry where it came from, and
 * Microsoft sign-in leaves the app entirely. So the shell notes each page
 * visited in this tab, and the sign-in page reads the last one back. Session
 * storage, so it is per tab and gone when the tab is.
 */

/** Pages drawn without the app's chrome, and never worth returning to. */
export const BARE_PAGES = new Set(['/session', '/verify', '/reset', '/unsubscribe'])

const KEY = 'return-to'

export function rememberPath(path: string): void {
  if (BARE_PAGES.has(path.split('?')[0])) return
  try {
    sessionStorage.setItem(KEY, path)
  } catch {
    // A browser refusing storage just lands on the feed.
  }
}

/** Where to go after signing in: the last page, unless that was the landing page. */
export function returnPath(): string {
  try {
    const path = sessionStorage.getItem(KEY)
    if (path && path.startsWith('/') && !path.startsWith('//') && path !== '/') return path
  } catch {
    // Fall through.
  }
  return '/feed'
}
