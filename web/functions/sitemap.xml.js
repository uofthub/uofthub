import { apiUrl, escapeAttr, fetchJson } from './_meta.js'

/** /sitemap.xml — the public pages worth indexing, with every public project. */
export async function onRequest({ request, env }) {
  const origin = new URL(request.url).origin
  const projects = (await fetchJson(`${apiUrl(env)}/projects/sitemap`, 5000)) || []
  const urls = [
    `<url><loc>${origin}/</loc></url>`,
    `<url><loc>${origin}/explore</loc></url>`,
    `<url><loc>${origin}/orgs</loc></url>`,
    `<url><loc>${origin}/about</loc></url>`,
    ...projects.map(
      (p) =>
        `<url><loc>${origin}/projects/${escapeAttr(p.id)}</loc><lastmod>${escapeAttr(
          String(p.updatedAt).slice(0, 10)
        )}</lastmod></url>`
    ),
  ]
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } }
  )
}
