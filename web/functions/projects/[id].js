import { apiUrl, fetchApi, isHtml, notFound } from '../_meta.js'
import { movedTo } from '../_pages.js'

/**
 * /projects/:id — where projects used to live. A public one moves permanently
 * to /@handle/slug.
 *
 * Anything else — a draft, a U of T-only project, an id that was never used —
 * is a 404, as the API answers it: a private project must not confirm its own
 * id (GET /projects/:id), so it can't be redirected either. The app still
 * renders for someone signed in who may see it, and moves the address itself;
 * only the status says "not found", and only a crawler reads that.
 */
export async function onRequest({ request, params, env, next }) {
  const page = await next()
  // /projects/new is the editor, not a project called "new".
  if (!isHtml(page) || typeof params.id !== 'string' || params.id === 'new') return page

  const { status, data: card } = await fetchApi(
    `${apiUrl(env)}/projects/${encodeURIComponent(params.id)}/share`
  )
  if (status === 404) return notFound(page)
  if (!card) return page
  return movedTo(request, `/@${card.ownerHandle}/${card.slug}`)
}
