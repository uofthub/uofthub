/**
 * Every path the app has a page for, as src/App.tsx declares them. Anything
 * else is the app's "not found" page, which the middleware answers with a 404
 * rather than the 200 the SPA fallback would give it — so a search engine
 * drops a dead link instead of indexing a page that says "not found".
 *
 * src/lib/pagesRoutes.test.ts fails when this and App.tsx disagree.
 */
export const APP_ROUTES = [
  '/',
  '/feed',
  '/explore',
  '/projects',
  '/projects/new',
  '/projects/:id/edit',
  '/projects/:id',
  '/courses/:tag',
  '/u/:id',
  '/session',
  '/verify',
  '/reset',
  '/unsubscribe',
  '/settings',
  '/discover',
  '/orgs',
  '/orgs/:slug',
  '/admin',
  '/about',
  '/terms',
  '/privacy',
  '/saved',
  '/collections',
  '/collections/:id',
  '/messages',
  '/messages/:userId',
  '/help-wanted',
]

const segments = (path) => path.split('/').filter(Boolean)

const PATTERNS = APP_ROUTES.map(segments)

/** Whether the app has a page at `pathname` — `/projects/abc`, `/about/`. */
export function isAppRoute(pathname) {
  const parts = segments(pathname)
  return PATTERNS.some(
    (pattern) =>
      pattern.length === parts.length &&
      pattern.every((part, i) => part.startsWith(':') || part === parts[i])
  )
}
