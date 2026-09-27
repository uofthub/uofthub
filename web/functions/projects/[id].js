import { apiUrl, escapeHtml, fetchApi, isHtml, notFound, prerendered, withHead } from '../_meta.js'

/**
 * /projects/:id — the app's page, with the project's own title, pitch and
 * image in its head, so a link pasted into Discord, Slack or iMessage shows
 * the project rather than the site's generic card, and a search engine reads
 * what the page is about.
 *
 * Only public projects have a preview. Anything else — a draft, a U of T-only
 * project, an id that was never used — is a 404, as the API answers it: a
 * private project must not confirm its own id (GET /projects/:id). The app
 * still renders for someone signed in who may see it; only the status says
 * "not found", and only a crawler reads that.
 */
export async function onRequest({ request, params, env, next }) {
  const page = await next()
  // /projects/new is the editor, not a project called "new".
  if (!isHtml(page) || typeof params.id !== 'string' || params.id === 'new') return page

  const { status, data: card } = await fetchApi(
    `${apiUrl(env)}/projects/${encodeURIComponent(params.id)}/share`
  )
  if (status === 404) return notFound(page)
  // The API is down or slow: the page as it is beats no page.
  if (!card) return page

  const origin = new URL(request.url).origin
  const url = `${origin}/projects/${encodeURIComponent(params.id)}`
  const ownerUrl = `${origin}/u/${encodeURIComponent(card.ownerId)}`
  const description = card.pitch || `By ${card.ownerName}, on uofthub.`

  return withHead(page, {
    title: card.title,
    description,
    image: card.image,
    imageSize: card.imageSize,
    type: 'article',
    structured: {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: card.title,
      ...(card.pitch && { abstract: card.pitch }),
      description,
      url,
      image: card.image,
      author: { '@type': 'Person', name: card.ownerName, url: ownerUrl },
      ...(card.publishedAt && { datePublished: card.publishedAt }),
      dateModified: card.updatedAt,
      ...(card.tags?.length && { keywords: card.tags.join(', ') }),
    },
    body: prerendered(
      card.title,
      card.pitch && escapeHtml(card.pitch),
      `By <a href="${escapeHtml(ownerUrl)}">${escapeHtml(card.ownerName)}</a>`,
      card.tags?.length && card.tags.map(escapeHtml).join(' · ')
    ),
  })
}
