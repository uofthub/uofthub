import { apiUrl, escapeHtml, fetchApi } from './_meta.js'

/**
 * /sitemap.xml — the public pages worth indexing: the site's own, every
 * public project, every group, and the profiles of students with something
 * public to show (GET /users/sitemap says which).
 */
export async function onRequest({ request, env }) {
  const origin = new URL(request.url).origin
  const api = apiUrl(env)
  const [projects, orgs, users] = await Promise.all(
    ['/projects/sitemap', '/orgs', '/users/sitemap'].map(
      async (path) => (await fetchApi(`${api}${path}`, 5000)).data || []
    )
  )

  const entry = (path, lastmod) =>
    `<url><loc>${origin}${escapeHtml(path)}</loc>${
      lastmod ? `<lastmod>${escapeHtml(String(lastmod).slice(0, 10))}</lastmod>` : ''
    }</url>`

  const urls = [
    entry('/'),
    entry('/explore'),
    entry('/help-wanted'),
    entry('/orgs'),
    entry('/about'),
    ...projects.map((p) => entry(`/projects/${encodeURIComponent(p.id)}`, p.updatedAt)),
    ...orgs.map((o) => entry(`/orgs/${encodeURIComponent(o.slug)}`)),
    ...users.map((u) => entry(`/u/${encodeURIComponent(u.id)}`, u.updatedAt)),
  ]
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
    {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    }
  )
}
