/**
 * User-supplied links are rendered as `<a href>` in the client. React does not
 * sanitize href, so a `javascript:` (or `data:`) URL stored here becomes stored
 * XSS on whoever clicks it. Only http(s) is ever accepted.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/** Normalized URL if it is a safe absolute http(s) link, otherwise null. */
export function safeExternalUrl(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null // relative or malformed
  }

  return ALLOWED_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null
}
