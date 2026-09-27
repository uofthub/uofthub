import { apiUrl, fetchApi, isHtml, notFound } from '../_meta.js'
import { decodePath } from '../_routes.js'
import { movedTo, sharedProject } from '../_pages.js'

/**
 * /@handle/slug — a project. Every other two-segment path without a function
 * of its own comes through here too (/assets/…, /collections/…); without the
 * @ it passes straight on.
 *
 * A retired handle or slug — a rename, a new title — moves permanently to the
 * address the project has now. Anything the reader (signed in as nobody, for
 * a crawler or a preview) may not see is a 404, as GET /paths answers it.
 */
export async function onRequest({ request, params, env, next }) {
  const segment = decodePath(String(params.handle))
  if (!segment.startsWith('@') || segment.length < 2) return next()
  const page = await next()
  if (!isHtml(page)) return page

  const slug = decodePath(String(params.slug))
  const { status, data: found } = await fetchApi(
    `${apiUrl(env)}/paths/${encodeURIComponent(segment.slice(1))}/${encodeURIComponent(slug)}`
  )
  if (status === 404) return notFound(page)
  if (!found) return page
  // Compared as sent, so /%40ada/… settles on /@ada/… too.
  const path = `/@${found.handle}/${found.slug}`
  if (new URL(request.url).pathname !== path) return movedTo(request, path)

  return sharedProject(page, env, found.projectId, new URL(request.url).origin)
}
