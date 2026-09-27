/**
 * Which Microsoft Entra tenants may sign in.
 *
 * The sign-in uses the multitenant `organizations` authority, so a token can
 * come from any work or school directory — including one an attacker created
 * for free. An admin of any directory can set a user's `mail` to whatever they
 * like, `someone@mail.utoronto.ca` included, and Graph reports it as-is. Trusting
 * that address alone would let anyone sign in as any U of T student. Only a
 * directory U of T controls can vouch for a utoronto.ca address, so the token's
 * tenant (`tid`) has to be one of U of T's.
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The tenant ids allowed to sign in: `MICROSOFT_ALLOWED_TENANT_IDS` (comma
 * separated), or `MICROSOFT_TENANT_ID` when that names a single tenant.
 * Empty means none were configured.
 */
export function allowedTenantIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const listed = (env.MICROSOFT_ALLOWED_TENANT_IDS ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)
  if (listed.length) return listed
  const authority = env.MICROSOFT_TENANT_ID?.trim().toLowerCase()
  return authority && GUID.test(authority) ? [authority] : []
}

/**
 * The `tid` claim of an id_token, or null when it has none. The token comes
 * straight from Microsoft's token endpoint over TLS in the code exchange, not
 * from the browser, so its claims are read without re-checking the signature.
 */
export function tenantOfIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null
  const payload = idToken.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof claims?.tid === 'string' ? claims.tid.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * Whether a sign-in from this id_token may go ahead. With no tenants
 * configured, development allows any (there is nothing real to take over);
 * production refuses every Microsoft sign-in rather than trust any directory.
 */
export function tenantAllowed(idToken: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const allowed = allowedTenantIds(env)
  if (!allowed.length) return env.NODE_ENV !== 'production'
  const tenant = tenantOfIdToken(idToken)
  return !!tenant && allowed.includes(tenant)
}
