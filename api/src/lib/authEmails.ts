import { isEmailConfigured, layout, sendEmail, escapeHtml } from './email.js'

/**
 * The account emails: confirm your address, reset your password, and the
 * notes sent instead when somebody tries to sign up with an address that
 * already has an account. Every one of them ends in a link to the web app.
 */

const webUrl = () => process.env.WEB_URL ?? 'http://localhost:5173'

/**
 * With no email transport (local development), the link is printed instead,
 * so signing up locally still works end to end. Never in production, where a
 * missing key must not put working links in the logs.
 */
async function deliver(to: string, subject: string, body: string, link: string) {
  if (
    !isEmailConfigured() &&
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV !== 'test'
  ) {
    console.info(`[email to ${to}] ${subject}\n  ${link}`)
    return
  }
  await sendEmail({ to, subject, html: layout(body) })
}

const button = (href: string, label: string) =>
  `<p><a href="${href}" style="display:inline-block;background:#1E3765;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">${label}</a></p>
<p style="color:#767676;font-size:13px">Or paste this link into your browser: ${escapeHtml(href)}</p>`

export async function sendVerificationEmail(to: string, name: string, token: string) {
  const link = `${webUrl()}/verify?token=${encodeURIComponent(token)}`
  await deliver(
    to,
    'Confirm your uofthub account',
    `<p>Hi ${escapeHtml(name)},</p>
<p>Confirm this is your address to finish creating your uofthub account. The link works for 24 hours.</p>
${button(link, 'Confirm my email')}
<p style="color:#767676;font-size:13px">If you didn’t sign up, ignore this email — nothing happens without the link.</p>`,
    link
  )
}

export async function sendPasswordResetEmail(to: string, token: string, reason: 'reset' | 'set') {
  const link = `${webUrl()}/reset?token=${encodeURIComponent(token)}`
  const intro =
    reason === 'set'
      ? 'Somebody asked to add a password to the uofthub account for this address, which signs in with Microsoft today. If it was you, choose one here — your Microsoft sign-in keeps working either way.'
      : 'Somebody asked to reset the password for the uofthub account with this address. If it was you, choose a new one here.'
  await deliver(
    to,
    reason === 'set' ? 'Add a password to your uofthub account' : 'Reset your uofthub password',
    `<p>${intro} The link works for one hour.</p>
${button(link, 'Choose a password')}
<p style="color:#767676;font-size:13px">If you didn’t ask, ignore this email — your account is unchanged.</p>`,
    link
  )
}

export async function sendAlreadyRegisteredEmail(to: string) {
  const link = `${webUrl()}/session`
  await deliver(
    to,
    'You already have a uofthub account',
    `<p>Somebody tried to sign up for uofthub with this address, but it already has an account. If it was you, sign in instead — or use “Forgot password” on the sign-in page.</p>
${button(link, 'Sign in')}`,
    link
  )
}

/** To an address with no account: somebody wants to credit you on their project. */
export async function sendProjectInviteEmail(
  to: string,
  inviterName: string,
  projectTitle: string
) {
  const link = `${webUrl()}/session`
  await deliver(
    to,
    `${inviterName} invited you to collaborate on uofthub`,
    `<p><b>${escapeHtml(inviterName)}</b> invited you to be credited as a collaborator on <b>${escapeHtml(projectTitle)}</b> on uofthub, where U of T students share what they build.</p>
<p>Sign up with this address and the invitation will be waiting for you to accept.</p>
${button(link, 'Sign up')}`,
    link
  )
}
