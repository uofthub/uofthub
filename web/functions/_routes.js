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
  '/docs',
  '/feedback',
  '/saved',
  '/collections',
  '/collections/:id',
  '/messages',
  '/messages/:userId',
  '/help-wanted',
  // /@handle and /@handle/slug — see isAppRoute.
  '/:handle',
  '/:handle/:slug',
]

const segments = (path) => path.split('/').filter(Boolean)

/** A path as typed: /%40ada is /@ada. A malformed escape is left as it came. */
export function decodePath(path) {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

const PATTERNS = APP_ROUTES.map(segments)

/**
 * Whether a path segment fills a pattern's. A pattern that starts with a
 * parameter is a person's address, /@handle…, so there the segment has to
 * start with `@` — as App.tsx's PersonRoute and ProjectRoute insist too.
 */
const fills = (part, segment, i) =>
  !part.startsWith(':')
    ? part === segment
    : i > 0 || (segment.startsWith('@') && segment.length > 1)

/** Whether the app has a page at `pathname` — `/projects/abc`, `/@ada`, `/about/`. */
export function isAppRoute(pathname) {
  const parts = segments(decodePath(pathname))
  return PATTERNS.some(
    (pattern) =>
      pattern.length === parts.length && pattern.every((part, i) => fills(part, parts[i], i))
  )
}
