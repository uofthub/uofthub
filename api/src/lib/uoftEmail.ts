/**
 * The U of T address check, at every boundary where an address decides who
 * somebody is: sign-up, Microsoft sign-in and invitations.
 *
 * An allowlist of the whole address, not a suffix test. `endsWith` alone let
 * `me@gmail.com,x@mail.utoronto.ca` through — a string that ends in the right
 * domain but that a mail API may read as two recipients, one of them
 * off-campus, which is all it would take for a verification link to reach an
 * inbox the university never vouched for. Nothing that could be a list, a
 * display name, a quoted local part or a header break (commas, spaces, quotes,
 * angle brackets, newlines) passes.
 *
 * Expects the address already trimmed and lower-cased, as every caller stores it.
 */
const LOCAL = "[a-z0-9](?:[a-z0-9._'+-]{0,62}[a-z0-9])?"
/** One DNS label: letters, digits and inner hyphens. */
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'

/**
 * The university's domains: `utoronto.ca` and `toronto.edu`, and any
 * department's subdomain of either (`mail.utoronto.ca`, `math.utoronto.ca`,
 * `cs.toronto.edu`, `stats.toronto.edu`…). Mirrored in
 * web/src/lib/uoftEmail.ts; change both together.
 */
const UOFT_EMAIL = new RegExp(`^${LOCAL}@(?:${LABEL}\\.)*(?:utoronto\\.ca|toronto\\.edu)$`)

/** Longest address the mail standards allow. */
const EMAIL_MAX = 254

export const isUofTEmail = (email: string): boolean =>
  email.length <= EMAIL_MAX && UOFT_EMAIL.test(email)

/** What to say when an address is refused for its domain. */
export const NOT_UOFT_EMAIL =
  'That address doesn’t end in utoronto.ca or toronto.edu. If it is a U of T address, email hello@uofthub.com from it and we’ll sort it out.'
