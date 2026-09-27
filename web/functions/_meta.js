/**
 * Shared by the Cloudflare Pages Functions in this folder. They run on
 * Cloudflare, in front of the built app — see docs/ARCHITECTURE.md § Link
 * previews and search. Plain JavaScript: nothing here is bundled by Vite.
 */

export const SITE_NAME = 'uofthub'

/** Where the API is, from the same variable the app is built with. */
export const apiUrl = (env) => (env.VITE_API_URL || 'https://api.uofthub.com').replace(/\/$/, '')

/** Safe in an attribute and in text alike. */
export const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/**
 * GET from the API, giving up quickly: a preview is never worth a slow page.
 * `status` is 0 when the API could not be reached — which is not a 404, and
 * must never be answered as one.
 */
export async function fetchApi(url, ms = 1500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return { status: res.status, data: res.ok ? await res.json() : null }
  } catch {
    return { status: 0, data: null }
  } finally {
    clearTimeout(timer)
  }
}

export const isHtml = (response) =>
  (response.headers.get('content-type') || '').includes('text/html')

/**
 * The address a page is known by: no query string, no trailing slash. So
 * /explore?type=APP and /explore/ are both /explore to a search engine.
 */
export function canonicalUrl(requestUrl) {
  const url = new URL(requestUrl)
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/'
  return `${url.origin}${path}`
}

/** JSON inside a <script>: `<` escaped, so no string in it can close the tag. */
const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`

/**
 * The built index.html, with its head rewritten for one page. Every tag it
 * touches is already in index.html with the site's defaults, so this sets
 * attributes rather than adding tags — a page never ends up with two
 * og:titles because a function and the middleware both ran.
 *
 * - `title` — the page's own name, without the site's; `description` likewise.
 * - `image` — absolute. `imageSize` when it is one of our 1200×630 cards;
 *   left out for a student's cover, whose size we don't know.
 * - `type` — og:type: `article` for a project, `profile` for a person.
 * - `url` — the canonical address; the middleware sets it for every page.
 * - `structured` — schema.org data, written into the head as JSON-LD.
 * - `body` — HTML for #root, for crawlers that don't run the app. React
 *   replaces it on first render.
 * - `noindex` — keep the page out of search results; it drops the canonical
 *   link, and a later `url` for the same page is ignored.
 * - `status` — the response's status, 404 for a page about nothing.
 */
export function withHead(response, meta) {
  const set = (selector, attribute, value) => [
    selector,
    {
      element(el) {
        el.setAttribute(attribute, value)
      },
    },
  ]
  const handlers = []

  if (meta.title !== undefined) {
    const full = `${meta.title} · ${SITE_NAME}`
    handlers.push(
      ['title', { element: (el) => el.setInnerContent(full) }],
      set('meta[property="og:title"]', 'content', meta.title),
      set('meta[name="twitter:title"]', 'content', meta.title)
    )
  }
  if (meta.description) {
    handlers.push(
      set('meta[name="description"]', 'content', meta.description),
      set('meta[property="og:description"]', 'content', meta.description),
      set('meta[name="twitter:description"]', 'content', meta.description)
    )
  }
  if (meta.image) {
    handlers.push(
      set('meta[property="og:image"]', 'content', meta.image),
      set('meta[name="twitter:image"]', 'content', meta.image),
      set('meta[property="og:image:alt"]', 'content', meta.imageAlt || meta.title || SITE_NAME)
    )
    for (const side of ['width', 'height']) {
      const selector = `meta[property="og:image:${side}"]`
      handlers.push(
        meta.imageSize
          ? set(selector, 'content', String(meta.imageSize[side]))
          : [selector, { element: (el) => el.remove() }]
      )
    }
  }
  if (meta.type) handlers.push(set('meta[property="og:type"]', 'content', meta.type))
  // A page that isn't one names no address: without this, a dead link would
  // keep index.html's canonical and claim to be the home page.
  if (meta.noindex) {
    handlers.push(['link[rel="canonical"]', { element: (el) => el.remove() }])
  } else if (meta.url) {
    handlers.push(
      set('link[rel="canonical"]', 'href', meta.url),
      set('meta[property="og:url"]', 'content', meta.url)
    )
  }
  if (meta.structured || meta.noindex) {
    const extra =
      (meta.structured ? jsonLd(meta.structured) : '') +
      (meta.noindex ? '<meta name="robots" content="noindex">' : '')
    handlers.push(['head', { element: (el) => el.append(extra, { html: true }) }])
  }
  if (meta.body) {
    handlers.push(['#root', { element: (el) => el.setInnerContent(meta.body, { html: true }) }])
  }

  const rewriter = handlers.reduce(
    (r, [selector, handler]) => r.on(selector, handler),
    new HTMLRewriter()
  )
  const transformed = rewriter.transform(response)
  if (!meta.status || meta.status === response.status) return transformed
  return new Response(transformed.body, {
    status: meta.status,
    headers: transformed.headers,
  })
}

/**
 * A page's content as plain HTML: what a crawler that doesn't run the app
 * reads, and what a slow connection shows until it does. `lines` are HTML,
 * already escaped by the caller.
 */
export const prerendered = (heading, ...lines) =>
  `<main class="prerender"><p><a href="/">${SITE_NAME}</a></p><h1>${escapeHtml(heading)}</h1>${lines
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('')}</main>`

/** How schema.org names U of T, as the institution a person or group is part of. */
export const UOFT = {
  '@type': 'CollegeOrUniversity',
  name: 'University of Toronto',
  url: 'https://www.utoronto.ca',
}

/** A page about nothing: the app's own "not found", with a 404 to match. */
export const notFound = (response) => withHead(response, { noindex: true, status: 404 })
