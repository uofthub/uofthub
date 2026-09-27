import { apiUrl, fetchApi, isHtml, notFound } from './_meta.js'
import { decodePath } from './_routes.js'
import { movedTo, profilePage } from './_pages.js'

/**
 * /@handle — a student's profile. Every other one-segment path comes through
 * here too (/explore, /favicon.svg); without the @ it passes straight on.
 *
 * An old handle, or one typed in capitals, moves permanently to the handle
 * they go by now.
 */
export async function onRequest({ request, params, env, next }) {
  const segment = decodePath(String(params.handle))
  if (!segment.startsWith('@') || segment.length < 2) return next()
  const page = await next()
  if (!isHtml(page)) return page

  const api = apiUrl(env)
  const { status, data: person } = await fetchApi(
    `${api}/paths/${encodeURIComponent(segment.slice(1))}`
  )
  if (status === 404) return notFound(page)
  if (!person) return page
  // Compared as sent, so /%40ada settles on /@ada too.
  const path = `/@${person.handle}`
  if (new URL(request.url).pathname !== path) return movedTo(request, path)

  const { data: card } = await fetchApi(`${api}/users/${encodeURIComponent(person.userId)}/share`)
  return card ? profilePage(page, card, new URL(request.url).origin) : page
}
