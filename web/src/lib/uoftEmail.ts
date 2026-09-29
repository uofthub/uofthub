import { CONTACT_EMAIL } from './site'

/**
 * The domain rule the API enforces on sign-up and invitations: `utoronto.ca`
 * and `toronto.edu`, and any department's subdomain of either. Mirrors
 * api/src/lib/uoftEmail.ts (which also checks the rest of the address);
 * change both together.
 */
const UOFT_DOMAIN = /@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*(?:utoronto\.ca|toronto\.edu)$/

export const isUofTEmail = (email: string) => UOFT_DOMAIN.test(email.trim().toLowerCase())

/** Where somebody whose real U of T address is refused can write to. */
export const domainHelpHref = (email?: string) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('My U of T email isn’t accepted')}${
    email ? `&body=${encodeURIComponent(`The address I tried: ${email}`)}` : ''
  }`
