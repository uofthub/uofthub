import { apiUrl } from './_meta.js'

/**
 * /lid — where the QR code on the laptop-lid sticker points. The API counts
 * the scan and sends the visitor on to the home page (api/src/routes/
 * campaigns.ts), so this only hands over to it.
 *
 * A redirect rather than a proxied fetch: the API hashes the scanner's own
 * address, which a fetch from here would replace with Cloudflare's. And a
 * function rather than a line in public/_redirects: every request already
 * runs through _middleware.js, and Pages does not apply _redirects to
 * requests its Functions serve.
 *
 * 302 and no-store, never 301: a cached permanent redirect would send repeat
 * scans straight past the API without being counted.
 */
export function onRequest({ env }) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${apiUrl(env)}/go/lid`, 'Cache-Control': 'no-store' },
  })
}
