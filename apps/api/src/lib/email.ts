import { Resend } from 'resend'

/**
 * Resend transport (see ARCHITECTURE.md § Stack decisions). Unlike storage,
 * email isn't load-bearing for anything yet — no route depends on a send
 * succeeding — so a missing API key logs and no-ops instead of throwing.
 * The Phase 3 org-verification flow will be the first real caller.
 */
let client: Resend | null | undefined

function getClient(): Resend | null {
  if (client === undefined) {
    const apiKey = process.env.RESEND_API_KEY
    client = apiKey ? new Resend(apiKey) : null
    if (!client) console.warn('RESEND_API_KEY is not set — email sending is disabled')
  }
  return client
}

export async function sendEmail(options: { to: string; subject: string; html: string }): Promise<void> {
  const resend = getClient()
  if (!resend) return

  const from = process.env.EMAIL_FROM ?? 'uofthub <notifications@uofthub.com>'
  const { error } = await resend.emails.send({ from, to: options.to, subject: options.subject, html: options.html })
  if (error) console.error('Failed to send email:', error)
}
