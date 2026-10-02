/**
 * The date the Terms last changed in a way everyone must agree to again —
 * the `updated` date on web/src/pages/info/TermsPage.tsx, kept in step by
 * hand. An account whose `termsAcceptedAt` is older is asked to agree before
 * it can write anything (see `authenticate` in app.ts).
 */
export const TERMS_VERSION = new Date('2026-10-02T00:00:00Z')

/** Whether an account has agreed to the Terms as they stand. */
export const hasAcceptedTerms = (acceptedAt: Date | null) =>
  !!acceptedAt && acceptedAt >= TERMS_VERSION
