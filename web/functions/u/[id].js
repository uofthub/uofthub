import {
  apiUrl,
  escapeHtml,
  fetchApi,
  isHtml,
  notFound,
  prerendered,
  UOFT,
  withHead,
} from '../_meta.js'

/**
 * /u/:id — a student's profile, with their name, what they study and a card
 * of them in its head. An id with no confirmed account behind it is a 404.
 */
export async function onRequest({ request, params, env, next }) {
  const page = await next()
  if (!isHtml(page) || typeof params.id !== 'string') return page

  const { status, data: card } = await fetchApi(
    `${apiUrl(env)}/users/${encodeURIComponent(params.id)}/share`
  )
  if (status === 404) return notFound(page)
  if (!card) return page

  const url = `${new URL(request.url).origin}/u/${encodeURIComponent(params.id)}`
  const description =
    card.bio ||
    [card.headline, card.campus].filter(Boolean).join(' · ') ||
    `${card.name} on uofthub.`

  return withHead(page, {
    title: card.name,
    description,
    image: card.image,
    imageSize: card.imageSize,
    type: 'profile',
    structured: {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      url,
      mainEntity: {
        '@type': 'Person',
        name: card.name,
        url,
        ...(card.bio && { description: card.bio }),
        ...(card.links.length && { sameAs: card.links }),
        affiliation: UOFT,
      },
    },
    body: prerendered(
      card.name,
      card.headline && escapeHtml(card.headline),
      card.bio && escapeHtml(card.bio),
      card.campus && escapeHtml(card.campus)
    ),
  })
}
