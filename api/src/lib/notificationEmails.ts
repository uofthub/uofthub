import type { NotificationType } from '@prisma/client'
import { db } from '../db/client.js'
import { escapeHtml, isEmailConfigured, layout, sendEmail, unsubscribeToken } from './email.js'

/**
 * The notifications that are also emailed: the ones asking the student to
 * answer something, or telling them a decision about them. Reactions,
 * comments and follows stay in the bell — email is for what would otherwise
 * wait unseen until their next visit.
 *
 * Every send respects the student's `emailNotifications` setting and never
 * holds up the request that caused it.
 */

const webUrl = () => process.env.WEB_URL ?? 'http://localhost:5173'

type Payload = Record<string, unknown>
const str = (v: unknown) => escapeHtml(String(v ?? ''))

const EMAILS: Partial<
  Record<NotificationType, (p: Payload) => { subject: string; line: string; path: string }>
> = {
  COLLABORATOR_INVITED: (p) => ({
    subject: `${p.inviterName} invited you to collaborate on uofthub`,
    line: `<b>${str(p.inviterName)}</b> invited you to be credited on <b>${str(p.projectTitle)}</b>. Accept or decline from the bell on uofthub.`,
    path: '/feed',
  }),
  ACCESS_REQUESTED: (p) => ({
    subject: `${p.requesterName} asked to see "${p.projectTitle}"`,
    line: `<b>${str(p.requesterName)}</b> asked for viewer access to <b>${str(p.projectTitle)}</b>.`,
    path: `/projects/${p.projectId}?people=1`,
  }),
  ACCESS_REQUEST_DECIDED: (p) => ({
    subject: `Your access request was ${p.accepted ? 'approved' : 'denied'}`,
    line: `Your request to see <b>${str(p.projectTitle)}</b> was ${p.accepted ? 'approved' : 'denied'}.`,
    path: `/projects/${p.projectId}`,
  }),
  PROJECT_MODERATED: (p) => ({
    subject: `A moderator reviewed "${p.projectTitle}"`,
    line: `${
      p.action === 'TAKEN_DOWN'
        ? `<b>${str(p.projectTitle)}</b> was taken down after a report. It is private to you now; nothing was deleted.`
        : p.action === 'RESTORED'
          ? `<b>${str(p.projectTitle)}</b> was restored. You can publish it again.`
          : `A moderator reviewed a report about <b>${str(p.projectTitle)}</b>.`
    }${p.note ? `<br><br>From the moderator: ${str(p.note)}` : ''}`,
    path: `/projects/${p.projectId}`,
  }),
  CONTENT_MODERATED: (p) => ({
    subject: 'A moderator reviewed something you posted',
    line: `A moderator ${p.action === 'TAKEN_DOWN' ? 'removed' : 'reviewed a report about'} your ${str(p.target)}.${p.note ? `<br><br>From the moderator: ${str(p.note)}` : ''}`,
    path: '/settings',
  }),
  ACCOUNT_MODERATED: (p) => ({
    subject:
      p.action === 'LIFTED'
        ? 'Your uofthub account is active again'
        : 'Your uofthub account was suspended',
    line: `${p.action === 'LIFTED' ? 'The suspension on your account was lifted.' : 'A moderator suspended your account. You can still sign in, read, export your data or delete your account.'}${p.note ? `<br><br>From the moderator: ${str(p.note)}` : ''}`,
    path: '/settings',
  }),
  MESSAGING_MODERATED: (p) => ({
    subject: 'A moderator reviewed your messages',
    line: `${p.action === 'TAKEN_DOWN' ? 'A moderator suspended your messaging after a report.' : 'A moderator reviewed a report about your messages.'}${p.note ? `<br><br>From the moderator: ${str(p.note)}` : ''}`,
    path: '/messages',
  }),
  ORG_INVITED: (p) => ({
    subject: `${p.inviterName} invited you to join ${p.orgName}`,
    line: `<b>${str(p.inviterName)}</b> invited you to join <b>${str(p.orgName)}</b> on uofthub.`,
    path: `/orgs/${p.slug}`,
  }),
  ORG_JOIN_REQUESTED: (p) => ({
    subject: `${p.actorName} asked to join ${p.orgName}`,
    line: `<b>${str(p.actorName)}</b> asked to join <b>${str(p.orgName)}</b>. Approve or deny from the group’s page.`,
    path: `/orgs/${p.slug}`,
  }),
}

/**
 * Why this arrived and how to stop it, in every notification email. The link
 * works without signing in: a student who has to log in to unsubscribe marks
 * the email as spam instead, and that costs every other recipient.
 */
const footer = (userId: string) =>
  `<p style="color:#767676;font-size:13px">You get these because they need an answer from you on uofthub. <a href="${webUrl()}/unsubscribe?token=${unsubscribeToken(userId)}">Unsubscribe</a> or choose in <a href="${webUrl()}/settings">Settings</a>.</p>`

const button = (href: string) =>
  `<p><a href="${href}" style="display:inline-block;background:#1E3765;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Open uofthub</a></p>`

/** Email these people about a notification, where its type is one that is emailed. */
export function emailNotification(
  userIds: string[],
  type: NotificationType,
  payload: Payload
): void {
  const build = EMAILS[type]
  if (!build || userIds.length === 0 || !isEmailConfigured()) return
  const { subject, line, path } = build(payload)
  void (async () => {
    const people = await db.user.findMany({
      where: { id: { in: userIds }, emailNotifications: true },
      select: { id: true, email: true },
    })
    for (const { id, email } of people)
      await sendEmail({
        to: email,
        subject,
        html: layout(`<p>${line}</p>${button(`${webUrl()}${path}`)}${footer(id)}`),
        unsubscribeUserId: id,
      })
  })().catch((err) => console.error('Notification email failed:', err))
}

/**
 * A new conversation: emailed when a message arrives and the recipient has
 * nothing else unread from that person — the first of a burst, not each one.
 */
export function emailNewMessage(recipientId: string, senderName: string): void {
  if (!isEmailConfigured()) return
  void (async () => {
    const recipient = await db.user.findUnique({
      where: { id: recipientId },
      select: { email: true, emailNotifications: true },
    })
    if (!recipient?.emailNotifications) return
    await sendEmail({
      to: recipient.email,
      subject: `${senderName} sent you a message on uofthub`,
      html: layout(
        `<p><b>${escapeHtml(senderName)}</b> sent you a message.</p>${button(`${webUrl()}/messages`)}${footer(recipientId)}`
      ),
      unsubscribeUserId: recipientId,
    })
  })().catch((err) => console.error('Message email failed:', err))
}
