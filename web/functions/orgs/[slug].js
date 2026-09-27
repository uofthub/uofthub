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

/** /orgs/:slug — a club's or a lab's page, with the group's own card in its head. */
export async function onRequest({ request, params, env, next }) {
  const page = await next()
  if (!isHtml(page) || typeof params.slug !== 'string') return page

  const { status, data: card } = await fetchApi(
    `${apiUrl(env)}/orgs/${encodeURIComponent(params.slug)}/share`
  )
  if (status === 404) return notFound(page)
  if (!card) return page

  const url = `${new URL(request.url).origin}/orgs/${encodeURIComponent(params.slug)}`
  const kind = card.type === 'LAB' ? 'A lab' : 'A student group'
  const description =
    card.description ||
    `${kind} at the University of Toronto${card.campus ? `, ${card.campus}` : ''}.`

  return withHead(page, {
    title: card.name,
    description,
    image: card.image,
    imageSize: card.imageSize,
    structured: {
      '@context': 'https://schema.org',
      '@type': card.type === 'LAB' ? 'ResearchOrganization' : 'Organization',
      name: card.name,
      url,
      description,
      ...(card.websiteUrl && { sameAs: [card.websiteUrl] }),
      parentOrganization: UOFT,
    },
    body: prerendered(
      card.name,
      escapeHtml(description),
      card.websiteUrl &&
        `<a href="${escapeHtml(card.websiteUrl)}" rel="nofollow">${escapeHtml(card.websiteUrl)}</a>`
    ),
  })
}
