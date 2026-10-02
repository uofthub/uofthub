import { canonicalUrl, isHtml, missingAsset, notFound, SITE_NAME, withHead } from './_meta.js'
import { isAppRoute } from './_routes.js'

/**
 * Runs in front of every request, after the page's own function if it has
 * one (projects/[id].js, u/[id].js, orgs/[slug].js). For the app's pages:
 *
 * - the canonical address and og:url, which no page gets right on its own —
 *   index.html can only name one address for all of them;
 * - a 404 for a path the app has no page for, where the SPA fallback in
 *   public/_redirects would answer 200 — uncached, and a plain one for a
 *   missing build file under /assets/;
 * - the site's own structured data, on the home page.
 */
export async function onRequest({ request, next }) {
  const response = await next()
  if (!isHtml(response) || !['GET', 'HEAD'].includes(request.method)) return response

  const url = canonicalUrl(request.url)
  const { pathname, origin } = new URL(url)
  // HTML for a build file means it is missing and the SPA fallback answered.
  if (pathname.startsWith('/assets/')) return missingAsset()
  if (!isAppRoute(pathname)) return notFound(response)

  return withHead(response, {
    url,
    structured:
      pathname === '/'
        ? {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE_NAME,
            url: `${origin}/`,
            description:
              'Share and discover everything students build at the University of Toronto — apps, research, films, design, music and hardware.',
          }
        : undefined,
  })
}
