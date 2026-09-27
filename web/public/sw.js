/*
 * The service worker, registered only once a student turns on push
 * notifications (src/lib/push.ts). It does nothing else — no caching, no
 * offline pages — so it can never serve a stale copy of the app.
 *
 * Plain JavaScript in public/ rather than a bundled module: a worker has to
 * live at a fixed URL at the site's root to control the whole site.
 */

/** The API's address, passed in the registration URL (`/sw.js?api=…`). */
const API = new URL(self.location.href).searchParams.get('api')

/**
 * Safari revokes a subscription whose pushes it has to show nothing for, so
 * on Apple devices every push is shown even with a tab focused. Chrome and
 * Firefox allow skipping one while the site is on screen.
 */
const UA = self.navigator.userAgent
const APPLE =
  /iPhone|iPad|iPod/.test(UA) || (/Safari/.test(UA) && !/Chrome|Chromium|Firefox|Edg/.test(UA))

const windows = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true })

// What api/src/lib/push.ts sends: { title, body, url, tag?, notificationId?, badge }.
self.addEventListener('push', (event) => {
  let message
  try {
    message = event.data.json()
  } catch {
    message = { title: 'uofthub', body: event.data ? event.data.text() : '', url: '/' }
  }
  event.waitUntil(
    (async () => {
      // The count on the installed app's icon, where the platform has one.
      if (typeof message.badge === 'number' && self.navigator.setAppBadge)
        await self.navigator.setAppBadge(message.badge).catch(() => {})

      // A uofthub tab in front of the student already shows it live — the
      // bell and Messages update from the event stream — so a system
      // notification on top would say the same thing twice.
      if (!APPLE && (await windows()).some((w) => w.focused && w.visibilityState === 'visible'))
        return

      await self.registration.showNotification(message.title || 'uofthub', {
        body: message.body,
        icon: '/icons/icon-192.png',
        tag: message.tag,
        // A replaced notification buzzes again: it is a new message.
        renotify: !!message.tag,
        data: { url: message.url || '/', notificationId: message.notificationId },
      })
    })()
  )
})

// Open the page it is about — in a uofthub tab already open, if there is one —
// and mark the notification read, as clicking it in the bell would.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url: path, notificationId } = event.notification.data || {}
  const url = new URL(path || '/', self.location.origin).href
  event.waitUntil(
    Promise.all([
      notificationId && API
        ? fetch(`${API}/users/me/notifications/${encodeURIComponent(notificationId)}/read`, {
            method: 'POST',
            credentials: 'include',
          }).catch(() => {})
        : null,
      windows().then(async (tabs) => {
        const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin)
        if (tab) {
          await tab.focus()
          return tab.navigate(url).catch(() => self.clients.openWindow(url))
        }
        return self.clients.openWindow(url)
      }),
    ])
  )
})

// The browser replaced the subscription (keys rotated, or it expired): tell
// the API about the new one. Cookies ride along; the API is on a subdomain.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const key = event.oldSubscription?.options.applicationServerKey
      if (!key || !API) return
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      })
      await fetch(`${API}/push/subscriptions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
    })()
  )
})
