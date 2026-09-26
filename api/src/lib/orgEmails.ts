import type { Organization } from '@prisma/client'
import { CONTACT_EMAIL, sendEmail } from './email.js'

/**
 * Emails about a group left over from the old self-serve verification flow. Every send is
 * best-effort: `sendEmail` already no-ops without `RESEND_API_KEY`, and a
 * failed send must never fail the request that triggered it, so the caller's
 * decision is committed to the database first and these are awaited only for
 * their (swallowed) side effect.
 */

const webUrl = () => process.env.WEB_URL ?? 'http://localhost:5173'

const escape = (value: string) =>
  value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function layout(body: string): string {
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#1c1c1c">
${body}
<p style="color:#767676;font-size:13px;margin-top:28px">uofthub — an open home for everything students build at U of T.</p>
</div>`
}

type Decision = 'APPROVE' | 'DENY'

/** Tells the group's contact what was decided. */
export async function emailContactOfDecision(
  org: Organization,
  decision: Decision,
  note: string | null
): Promise<void> {
  if (!org.contactEmail) return

  const noteHtml = note ? `<p><strong>From the reviewer:</strong><br>${escape(note)}</p>` : ''
  const link = `${webUrl()}/orgs/${org.slug}`

  const messages: Record<Decision, { subject: string; body: string }> = {
    APPROVE: {
      subject: `${org.name} is verified on uofthub`,
      body: `<p><strong>${escape(org.name)}</strong> has been verified. The page is now listed publicly.</p>
${noteHtml}
<p><a href="${link}">View the group page →</a></p>`,
    },
    DENY: {
      subject: `${org.name} was not verified on uofthub`,
      body: `<p>We could not verify that <strong>${escape(org.name)}</strong> is an authorized U of T group, so the page and its data have been deleted.</p>
${noteHtml}
<p>If this was a mistake, write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> and a person will look at it again.</p>`,
    },
  }

  const { subject, body } = messages[decision]
  await sendEmail({ to: org.contactEmail, subject, html: layout(body) })
}
