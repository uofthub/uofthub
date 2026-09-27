import { API_URL, api } from './api'

/**
 * Push notifications on this browser: the service worker (public/sw.js), the
 * browser's permission, and the subscription the API sends to
 * (api/src/lib/push.ts). Per device, not per account — turning it on on a
 * laptop leaves the phone as it was.
 */

export type PushState =
  /** The browser has no Web Push, or this is an iPhone not added to the home screen. */
  | 'unsupported'
  /** The API has no VAPID keys, so there is nothing to subscribe to. */
  | 'unavailable'
  /** The student said no in the browser's prompt; only the browser's site settings undo that. */
  | 'blocked'
  | 'off'
  | 'on'

export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/')
  return (await registration?.pushManager.getSubscription()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const { publicKey } = await api.push.key()
  if (!publicKey) return 'unavailable'
  return (await currentSubscription()) ? 'on' : 'off'
}

/** The VAPID key as the bytes PushManager wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/** Ask the browser, subscribe, and hand the subscription to the API. Must run from a click. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported'
  const { publicKey } = await api.push.key()
  if (!publicKey) return 'unavailable'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off'

  // The API's address rides along so the worker can re-subscribe by itself.
  const registration = await navigator.serviceWorker.register(
    `/sw.js?api=${encodeURIComponent(API_URL)}`,
    { scope: '/' }
  )
  await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }))
  await api.push.subscribe(subscription.toJSON())
  return 'on'
}

/** Stop pushing to this browser. Also called on sign-out, so it never throws. */
export async function disablePush(): Promise<void> {
  if (!supported()) return
  try {
    const subscription = await currentSubscription()
    if (!subscription) return
    await api.push.unsubscribe(subscription.endpoint).catch(() => {})
    await subscription.unsubscribe()
  } catch {
    // Nothing to undo, or the browser refused; the API forgets a dead
    // subscription the first time a push to it fails.
  }
}

/**
 * Close the system notifications this device is still showing, once the app
 * has shown the student the same thing — the bell opened, or a conversation
 * read. `match` picks them by what the worker stored: the tag (messages use
 * `message:<senderId>`) and whether it announced a bell row.
 */
export async function closeShownNotifications(
  match: (n: { tag: string; notificationId?: string }) => boolean
): Promise<void> {
  if (!supported()) return
  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    for (const n of (await registration?.getNotifications()) ?? [])
      if (match({ tag: n.tag, notificationId: n.data?.notificationId })) n.close()
  } catch {
    // Nothing shown, or no worker: nothing to close.
  }
}

/**
 * The count on the installed app's icon: unread notifications plus unread
 * messages, the same sum the API sends with each push. Each half is reported
 * by the header button that already fetches it.
 */
const badge = { notifications: 0, messages: 0 }

export function setBadgePart(part: keyof typeof badge, count: number): void {
  if (badge[part] === count || !('setAppBadge' in navigator)) return
  badge[part] = count
  const total = badge.notifications + badge.messages
  ;(total > 0 ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {})
}

const NUDGE_KEY = 'push-nudge-dismissed'

/** Whether the bell's "get these on this device?" line was waved away here. */
export function nudgeDismissed(): boolean {
  try {
    return localStorage.getItem(NUDGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function dismissNudge(): void {
  try {
    localStorage.setItem(NUDGE_KEY, 'true')
  } catch {
    // Blocked storage: it comes back next visit, which is harmless.
  }
}

/** An iPhone already running uofthub from its home screen, where push works. */
export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
