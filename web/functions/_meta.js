/**
 * Shared by the Cloudflare Pages Functions in this folder. They run on
 * Cloudflare, in front of the built app — see docs/ARCHITECTURE.md § Link
 * previews. Plain JavaScript: nothing here is bundled by Vite.
 */

/** Where the API is, from the same variable the app is built with. */
export const apiUrl = (env) => (env.VITE_API_URL || 'https://api.uofthub.com').replace(/\/$/, '')

export const escapeAttr = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** Fetch JSON from the API, giving up quickly: a preview is never worth a slow page. */
export async function fetchJson(url, ms = 1500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res.ok ? await res.json() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
