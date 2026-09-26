import { apiUrl, escapeAttr, fetchJson } from '../_meta.js'

/**
 * /projects/:id — the app's page, with the project's own title, pitch and
 * image in its head, so a link pasted into Discord, Slack or iMessage shows
 * the project rather than the site's generic card. Only public projects have
 * a preview; anything else gets the page unchanged.
 */
export async function onRequest({ request, params, env, next }) {
  const page = await next()
  const type = page.headers.get('content-type') || ''
  if (!type.includes('text/html') || typeof params.id !== 'string') return page

  const card = await fetchJson(`${apiUrl(env)}/projects/${encodeURIComponent(params.id)}/share`)
  if (!card) return page

  const title = `${card.title} — uofthub`
  const description = card.pitch || `By ${card.ownerName}, on uofthub.`
  const tags = [
    ['og:type', 'article'],
    ['og:site_name', 'uofthub'],
    ['og:url', request.url],
    ['og:title', card.title],
    ['og:description', description],
    ...(card.image ? [['og:image', card.image]] : []),
  ]
    .map(([property, content]) => `<meta property="${property}" content="${escapeAttr(content)}">`)
    .join('')
  const twitter = `<meta name="twitter:card" content="${card.image ? 'summary_large_image' : 'summary'}">`

  return new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(title)
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', description)
      },
    })
    .on('head', {
      element(el) {
        el.append(tags + twitter, { html: true })
      },
    })
    .transform(page)
}
