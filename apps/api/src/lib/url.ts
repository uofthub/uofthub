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

/**
 * A link that has to actually point at the service it is labelled with.
 * Stricter than `safeExternalUrl` on purpose: the org page renders these
 * behind a service badge, so a link to somewhere else entirely would be a
 * small piece of misdirection we'd be hosting.
 */
function safeUrlOnHosts(raw: string | undefined | null, hosts: Set<string>): string | null {
  const url = safeExternalUrl(raw)
  if (!url) return null
  return hosts.has(new URL(url).hostname.toLowerCase()) ? url : null
}

/** Hosts a Discord invite can legitimately live on. */
const DISCORD_HOSTS = new Set(['discord.gg', 'discord.com', 'www.discord.com', 'discordapp.com'])

/** Hosts a GroupMe group share link can legitimately live on. */
const GROUPME_HOSTS = new Set(['groupme.com', 'www.groupme.com', 'app.groupme.com'])

export const safeDiscordUrl = (raw: string | undefined | null): string | null =>
  safeUrlOnHosts(raw, DISCORD_HOSTS)

export const safeGroupMeUrl = (raw: string | undefined | null): string | null =>
  safeUrlOnHosts(raw, GROUPME_HOSTS)
