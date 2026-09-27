import { apiUrl, fetchApi, isHtml, notFound } from '../_meta.js'
import { movedTo } from '../_pages.js'

/**
 * /u/:id — where profiles used to live. Links to it are all over the web by
 * now, so it moves permanently to /@handle; an id with no confirmed account
 * behind it is a 404.
 */
export async function onRequest({ request, params, env, next }) {
  const page = await next()
  if (!isHtml(page) || typeof params.id !== 'string') return page

  const { status, data: card } = await fetchApi(
    `${apiUrl(env)}/users/${encodeURIComponent(params.id)}/share`
  )
  if (status === 404) return notFound(page)
  // The API is down or slow: the app finds its own way to /@handle.
  if (!card) return page
  return movedTo(request, `/@${card.handle}`)
}
