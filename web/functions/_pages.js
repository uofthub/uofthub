import { apiUrl, escapeHtml, fetchApi, prerendered, UOFT, withHead } from './_meta.js'

/**
 * A person's page and a project's, as the functions for their addresses
 * write them: /@handle and /@handle/slug ([handle].js, [handle]/[slug].js).
 * The old /u/:id and /projects/:id only redirect to those now.
 */

export const profileUrl = (origin, handle) => `${origin}/@${handle}`
export const projectUrl = (origin, handle, slug) => `${origin}/@${handle}/${slug}`

/** A permanent move, keeping the query string: search engines carry the old address's standing over. */
export const movedTo = (request, path) => {
  const url = new URL(request.url)
  return Response.redirect(`${url.origin}${path}${url.search}`, 301)
}

/** The head and body of a profile, from GET /users/:id/share. */
export function profilePage(page, card, origin) {
  const url = profileUrl(origin, card.handle)
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
        alternateName: `@${card.handle}`,
        url,
        ...(card.bio && { description: card.bio }),
        ...(card.links.length && { sameAs: card.links }),
        affiliation: UOFT,
      },
    },
    body: prerendered(
      card.name,
      `@${escapeHtml(card.handle)}`,
      card.headline && escapeHtml(card.headline),
      card.bio && escapeHtml(card.bio),
      card.campus && escapeHtml(card.campus)
    ),
  })
}

/** The head and body of a project, from GET /projects/:id/share. */
export function projectPage(page, card, origin) {
  const url = projectUrl(origin, card.ownerHandle, card.slug)
  const ownerUrl = profileUrl(origin, card.ownerHandle)
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

/**
 * /@handle/slug, once GET /paths has said the reader may see it. A project
 * that is open to its link but not public (unlisted) has no preview and stays
 * out of search, but it is no 404.
 */
export async function sharedProject(page, env, projectId, origin) {
  const { status, data: card } = await fetchApi(
    `${apiUrl(env)}/projects/${encodeURIComponent(projectId)}/share`
  )
  if (status === 404) return withHead(page, { noindex: true })
  if (!card) return page
  return projectPage(page, card, origin)
}
