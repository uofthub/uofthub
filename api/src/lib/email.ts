import { Resend } from 'resend'

/**
 * Resend transport (see ARCHITECTURE.md § Stack decisions). A missing API key
 * logs once and no-ops instead of throwing, and a failed send is logged rather
 * than thrown: no request should fail because an email could not go out.
 */

/**
 * Where a recipient can reach a human — the address our outbound mail tells
 * people to write to. Must be a real monitored inbox on our own domain, not
 * the unattended `notifications@` sender. Mirrored client-side in
 * `web/src/lib/site.ts`; change both together.
 */
export const CONTACT_EMAIL = 'hello@uofthub.com'

let client: Resend | null | undefined

function getClient(): Resend | null {
  if (client === undefined) {
    const apiKey = process.env.RESEND_API_KEY
    client = apiKey ? new Resend(apiKey) : null
    if (!client && process.env.NODE_ENV !== 'test')
      console.warn('RESEND_API_KEY is not set — email sending is disabled')
  }
  return client
}

export const isEmailConfigured = (): boolean => getClient() !== null

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )

/** The frame every email shares. */
export function layout(body: string): string {
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#1c1c1c">
${body}
<p style="color:#767676;font-size:13px;margin-top:28px">uofthub — an open home for everything students build at U of T.</p>
</div>`
}

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const resend = getClient()
  if (!resend) return

  const from = process.env.EMAIL_FROM ?? 'uofthub <notifications@uofthub.com>'
  try {
    const { error } = await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    })
    if (error) console.error('Failed to send email:', error)
  } catch (err) {
    console.error('Failed to send email:', err)
  }
}
