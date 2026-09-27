import { createHmac, timingSafeEqual } from 'node:crypto'
import { Resend } from 'resend'

/**
 * Resend transport (see ARCHITECTURE.md § Stack decisions). A missing API key
 * logs once and no-ops instead of throwing, and a failed send is logged rather
 * than thrown: no request should fail because an email could not go out.
 *
 * Mail goes out from the `notifications.uofthub.com` subdomain, so its sending
 * reputation is its own: a bad week there never lands `hello@uofthub.com`, the
 * address people actually write to, in spam.
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

/**
 * The same email as plain text. A message with a text part scores better with
 * spam filters than HTML alone, and it is what a text-only client shows.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs, (_, href: string, label: string) =>
      label.replace(/<[^>]+>/g, '') === href ? href : `${label} (${href})`
    )
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|div)>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(
      /&(amp|lt|gt|quot|#39);/g,
      (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!
    )
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * A one-click unsubscribe token for `userId`: their id and an HMAC of it, so
 * it cannot be made up for somebody else, and needs no table. It turns off
 * notification email and nothing else, which is why it may never expire —
 * people unsubscribe from mail months old.
 */
function unsubscribeSignature(userId: string): string {
  return createHmac('sha256', process.env.JWT_SECRET ?? 'dev-secret-change-in-prod')
    .update(`unsubscribe:${userId}`)
    .digest('base64url')
}

export const unsubscribeToken = (userId: string) => `${userId}.${unsubscribeSignature(userId)}`

/** The user a token was made for, or null when it is not one of ours. */
export function readUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const userId = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(unsubscribeSignature(userId))
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null
}

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  /**
   * Set on notification email, never on account email (confirm, reset):
   * nobody can opt out of those. Adds the `List-Unsubscribe` headers that
   * put an Unsubscribe button beside the sender in Gmail and Outlook — the
   * alternative a student reaches for otherwise is "Report spam".
   */
  unsubscribeUserId?: string
}): Promise<void> {
  const resend = getClient()
  if (!resend) return

  const from = process.env.EMAIL_FROM ?? 'uofthub <notifications@notifications.uofthub.com>'
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const { error } = await resend.emails.send({
      from,
      to: options.to,
      // Replies reach a person rather than an inbox nobody reads.
      replyTo: CONTACT_EMAIL,
      subject: options.subject,
      html: options.html,
      text: htmlToText(options.html),
      ...(options.unsubscribeUserId && {
        headers: {
          // RFC 8058 one-click: the mail provider POSTs here itself.
          'List-Unsubscribe': `<${apiUrl}/email/unsubscribe?token=${unsubscribeToken(options.unsubscribeUserId)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    })
    if (error) console.error('Failed to send email:', error)
  } catch (err) {
    console.error('Failed to send email:', err)
  }
}
