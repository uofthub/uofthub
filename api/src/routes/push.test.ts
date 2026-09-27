import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { isPushEndpoint, pushFor } from '../lib/push.js'
import { SUBSCRIPTIONS_PER_USER } from './push.js'
import { cookieFor, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

const subscription = (n: number) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  keys: { p256dh: 'key', auth: 'secret' },
})

async function subscribe(user: { id: string; email: string }, body: object) {
  const app = await getApp()
  return app.inject({
    method: 'POST',
    url: '/push/subscriptions',
    cookies: await cookieFor(user),
    payload: body,
  })
}

describe('push subscriptions', () => {
  it('only accepts endpoints at a known push service', async () => {
    const user = await createUser()
    for (const endpoint of [
      'http://fcm.googleapis.com/x',
      'https://169.254.169.254/latest',
      'https://evil.example/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.example/x',
    ]) {
      const res = await subscribe(user, { ...subscription(0), endpoint })
      expect(res.statusCode, endpoint).toBe(400)
    }
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true)
    expect(isPushEndpoint('https://wns2-by3p.notify.windows.com/w/?token=x')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
  })

  it('moves a browser to whoever signs in on it', async () => {
    const [a, b] = [await createUser(), await createUser()]
    expect((await subscribe(a, subscription(1))).statusCode).toBe(201)
    expect((await subscribe(b, subscription(1))).statusCode).toBe(201)
    const rows = await db.pushSubscription.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(b.id)
  })

  it('keeps only the newest few browsers per account', async () => {
    const user = await createUser()
    for (let n = 0; n <= SUBSCRIPTIONS_PER_USER; n++) await subscribe(user, subscription(n))
    const rows = await db.pushSubscription.findMany({ select: { endpoint: true } })
    expect(rows).toHaveLength(SUBSCRIPTIONS_PER_USER)
    expect(rows.map((r) => r.endpoint)).not.toContain(subscription(0).endpoint)
  })

  it('forgets a browser on unsubscribe and every browser on sign-out everywhere', async () => {
    const user = await createUser()
    await subscribe(user, subscription(1))
    await subscribe(user, subscription(2))
    const app = await getApp()
    await app.inject({
      method: 'DELETE',
      url: '/push/subscriptions',
      payload: { endpoint: subscription(1).endpoint },
    })
    expect(await db.pushSubscription.count()).toBe(1)
    await app.inject({
      method: 'POST',
      url: '/auth/logout-everywhere',
      cookies: await cookieFor(user),
      payload: {},
    })
    expect(await db.pushSubscription.count()).toBe(0)
  })
})

describe('what is pushed', () => {
  it('pushes what happened to you, not broadcasts', () => {
    expect(pushFor('FOLLOWED_YOU', { actorName: 'Ada', actorId: 'u1' })).toEqual({
      title: 'New follower',
      body: 'Ada followed you',
      url: '/u/u1',
    })
    expect(pushFor('FOLLOWING_PUBLISHED', { ownerName: 'Ada', projectTitle: 'Rover' })).toBeNull()
    expect(pushFor('PROJECT_UPDATED', { projectTitle: 'Rover' })).toBeNull()
  })
})
