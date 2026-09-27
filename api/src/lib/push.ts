import type { NotificationType } from '@prisma/client'
import webpush from 'web-push'
import { db } from '../db/client.js'

/**
 * Web Push: a notification on the student's phone or desktop when no uofthub
 * tab is open. Opt-in per browser from Settings; the browser hands the API a
 * subscription (routes/push.ts) and this sends to it.
 *
 * Same degradation as email: without VAPID keys nothing is sent, and a failed
 * push is logged, never thrown — the notification row is already written and
 * the bell still shows it.
 *
 * Generate the keys once with `npx web-push generate-vapid-keys`. Changing
 * them invalidates every subscription; each browser re-subscribes with the
 * new key the next time it loads the app.
 */

let configured: boolean | undefined

export function isPushConfigured(): boolean {
  if (configured === undefined) {
    const publicKey = process.env.VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    configured = !!(publicKey && privateKey)
    if (configured)
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:hello@uofthub.com',
        publicKey!,
        privateKey!
      )
    else if (process.env.NODE_ENV !== 'test')
      console.warn('VAPID keys are not set — push notifications are disabled')
  }
  return configured
}

export const vapidPublicKey = () => (isPushConfigured() ? process.env.VAPID_PUBLIC_KEY! : null)

/**
 * The push services a subscription may point at. The API POSTs to whatever
 * endpoint a browser registered, so without this list a crafted subscription
 * would make it send requests to any host — including ones inside Render's
 * network.
 */
const PUSH_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge on Android, Samsung Internet, Opera
  'updates.push.services.mozilla.com', // Firefox
  '.push.apple.com', // Safari
  '.notify.windows.com', // Edge on Windows
]

export function isPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    PUSH_HOSTS.some((h) => (h.startsWith('.') ? url.hostname.endsWith(h) : url.hostname === h))
  )
}

/** What the service worker (web/public/sw.js) shows. */
export type PushMessage = {
  title: string
  body: string
  /** A path on the web app, opened when the notification is clicked. */
  url: string
  /** Notifications with the same tag replace each other rather than stacking. */
  tag?: string
}

/** What `sendPush` adds per recipient. */
type Delivered = PushMessage & {
  /** The bell row this announces, marked read when the push is clicked. */
  notificationId?: string
  /** Unread notifications plus unread messages, for the installed app's icon. */
  badge: number
}

/** The three switches in Settings, each a column on `User`. */
export type PushCategory = 'messages' | 'answers' | 'activity'

const PREFERENCE = {
  messages: 'pushMessages',
  answers: 'pushAnswers',
  activity: 'pushActivity',
} as const

/**
 * Which switch each notification type answers to, or null for never pushed.
 * Exhaustive on purpose: a new `NotificationType` does not compile until
 * somebody decides whether it is worth buzzing a phone for.
 *
 * Broadcasts are not pushed: a follow of somebody who publishes often, or of
 * a busy project that now logs every edit, would buzz a phone for things
 * nobody asked to be interrupted by. They stay in the bell and the feed.
 */
export const PUSH_CATEGORY: Record<NotificationType, PushCategory | null> = {
  COLLABORATOR_INVITED: 'answers',
  COLLABORATOR_RESPONDED: 'answers',
  ACCESS_REQUESTED: 'answers',
  ACCESS_REQUEST_DECIDED: 'answers',
  PROJECT_MODERATED: 'answers',
  MESSAGING_MODERATED: 'answers',
  CONTENT_MODERATED: 'answers',
  ACCOUNT_MODERATED: 'answers',
  ORG_INVITED: 'answers',
  ORG_JOIN_REQUESTED: 'answers',
  ORG_MEMBERSHIP_DECIDED: 'answers',
  PROJECT_LIKED: 'activity',
  PROJECT_REACTED: 'activity',
  PROJECT_COMMENTED: 'activity',
  COMMENT_REPLIED: 'activity',
  PROJECT_COLLAB_INTEREST: 'activity',
  FOLLOWED_YOU: 'activity',
  FOLLOWING_PUBLISHED: null,
  PROJECT_UPDATED: null,
}

type Payload = Record<string, unknown>

/**
 * A notification as a push. Shorter than the bell's sentences
 * (web/src/lib/notifications.ts) — a lock screen shows two lines — and kept
 * here because the API cannot import the web app's copy. Null for the types
 * that are not pushed.
 */
export function pushFor(type: NotificationType, p: Payload): PushMessage | null {
  if (!PUSH_CATEGORY[type]) return null
  const s = (v: unknown) => String(v ?? '')
  const project = typeof p.projectId === 'string' ? `/projects/${p.projectId}` : '/'
  const profile = typeof p.actorId === 'string' ? `/u/${p.actorId}` : '/'
  const title = `"${s(p.projectTitle)}"`
  const moderated = (what: string) =>
    `${p.action === 'TAKEN_DOWN' ? `A moderator removed ${what}` : p.action === 'RESTORED' ? `${what} was restored` : `A moderator reviewed ${what}`}`
  switch (type) {
    case 'COLLABORATOR_INVITED':
      return {
        title: 'Collaboration invite',
        body: `${s(p.inviterName)} invited you to ${title}`,
        url: '/feed',
      }
    case 'COLLABORATOR_RESPONDED':
      return {
        title: 'Invite answered',
        body: `${s(p.userName)} ${p.accepted ? 'accepted' : 'declined'} your invite to ${title}`,
        url: project,
      }
    case 'ACCESS_REQUESTED':
      return {
        title: 'Access request',
        body: `${s(p.requesterName)} asked to see ${title}`,
        url: `${project}?people=1`,
      }
    case 'ACCESS_REQUEST_DECIDED':
      return {
        title: 'Access request',
        body: `Your request to see ${title} was ${p.accepted ? 'approved' : 'denied'}`,
        url: project,
      }
    case 'PROJECT_MODERATED':
      return { title: 'Moderation', body: moderated(title), url: project }
    case 'MESSAGING_MODERATED':
      return {
        title: 'Moderation',
        body: moderated('a report about your messages'),
        url: '/messages',
      }
    case 'CONTENT_MODERATED':
      return {
        title: 'Moderation',
        body: moderated(`your ${s(p.target) || 'post'}`),
        url: '/settings',
      }
    case 'ACCOUNT_MODERATED':
      return {
        title: 'Your account',
        body:
          p.action === 'LIFTED'
            ? 'Your suspension was lifted'
            : 'A moderator suspended your account',
        url: '/settings',
      }
    case 'ORG_INVITED':
      return {
        title: s(p.orgName),
        body: `${s(p.inviterName)} invited you to join`,
        url: `/orgs/${p.slug}`,
      }
    case 'ORG_JOIN_REQUESTED':
      return {
        title: s(p.orgName),
        body: `${s(p.actorName)} asked to join`,
        url: `/orgs/${p.slug}`,
      }
    case 'ORG_MEMBERSHIP_DECIDED':
      return {
        title: s(p.orgName),
        body: p.accepted ? 'You’re now a member' : 'Your request wasn’t approved',
        url: `/orgs/${p.slug}`,
      }
    case 'PROJECT_LIKED':
      return { title: s(p.projectTitle), body: `${s(p.actorName)} liked it`, url: project }
    case 'PROJECT_REACTED':
      return { title: s(p.projectTitle), body: `${s(p.actorName)} reacted to it`, url: project }
    case 'PROJECT_COMMENTED':
      return {
        title: `${s(p.actorName)} on ${title}`,
        body: s(p.excerpt) || 'New comment',
        url: `${project}#comments`,
      }
    case 'COMMENT_REPLIED':
      return {
        title: `${s(p.actorName)} replied on ${title}`,
        body: s(p.excerpt) || 'New reply',
        url: `${project}#comments`,
      }
    case 'PROJECT_COLLAB_INTEREST':
      return {
        title: s(p.projectTitle),
        body: `${s(p.actorName)} wants to collaborate`,
        url: profile,
      }
    case 'FOLLOWED_YOU':
      return { title: 'New follower', body: `${s(p.actorName)} followed you`, url: profile }
    default:
      return null
  }
}

/** Unread notifications plus unread messages — what the app icon's badge shows. */
async function unreadCounts(userIds: string[]): Promise<Map<string, number>> {
  const [notifications, messages] = await Promise.all([
    db.notification.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, read: false },
      _count: { _all: true },
    }),
    db.message.groupBy({
      by: ['recipientId'],
      where: { recipientId: { in: userIds }, readAt: null },
      _count: { _all: true },
    }),
  ])
  const counts = new Map<string, number>()
  for (const n of notifications) counts.set(n.userId, n._count._all)
  for (const m of messages)
    counts.set(m.recipientId, (counts.get(m.recipientId) ?? 0) + m._count._all)
  return counts
}

export type PushTarget = { userId: string; notificationId?: string }

/**
 * Push `message` to every browser the targets subscribed, for those who left
 * `category` switched on. Never throws, never waits on the caller.
 */
export function sendPush(
  targets: PushTarget[],
  message: PushMessage,
  category: PushCategory
): void {
  if (targets.length === 0 || !isPushConfigured()) return
  void (async () => {
    const byUser = new Map(targets.map((t) => [t.userId, t]))
    const subscriptions = await db.pushSubscription.findMany({
      where: { userId: { in: [...byUser.keys()] }, user: { [PREFERENCE[category]]: true } },
    })
    if (subscriptions.length === 0) return
    const badges = await unreadCounts([...new Set(subscriptions.map((s) => s.userId))])
    await Promise.all(
      subscriptions.map(async (sub) => {
        const delivered: Delivered = {
          ...message,
          notificationId: byUser.get(sub.userId)?.notificationId,
          badge: badges.get(sub.userId) ?? 0,
        }
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(delivered),
            // A day: a phone that was off longer than that gets a stale ping.
            { TTL: 24 * 60 * 60, urgency: 'normal' }
          )
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          // The browser unsubscribed or the subscription expired (404, 410),
          // or it was made with VAPID keys this server no longer has (401,
          // 403): forget it. A browser still subscribed hands it back, made
          // with the current key, the next time it loads the app
          // (web/src/lib/push.ts, syncPush).
          if (status === 401 || status === 403 || status === 404 || status === 410)
            await db.pushSubscription.deleteMany({ where: { id: sub.id } })
          else console.error('Push failed:', status ?? err)
        }
      })
    )
  })().catch((err) => console.error('Push failed:', err))
}

/** Push the notification rows just written, when their type is one that is pushed. */
export function pushNotification(
  rows: { id: string; userId: string }[],
  type: NotificationType,
  payload: Payload
): void {
  const category = PUSH_CATEGORY[type]
  const message = pushFor(type, payload)
  if (category && message)
    sendPush(
      rows.map((r) => ({ userId: r.userId, notificationId: r.id })),
      message,
      category
    )
}
