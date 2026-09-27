import { beforeEach, describe, expect, it, vi } from 'vitest'

type Sent = { endpoint: string; body: Record<string, unknown> }
const sent = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = 'test-public'
  process.env.VAPID_PRIVATE_KEY = 'test-private'
  return { list: [] as Sent[], gone: new Set<string>() }
})
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, body: string) => {
      if (sent.gone.has(sub.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 })
      sent.list.push({ endpoint: sub.endpoint, body: JSON.parse(body) })
    },
  },
}))

import { db } from '../db/client.js'
import { notify, notifyMany } from './notifications.js'
import { PUSH_CATEGORY } from './push.js'
import { cookieFor, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
  sent.list.length = 0
  sent.gone.clear()
})

/** The sends are fire-and-forget; give them a moment to land. */
const settle = () => new Promise((r) => setTimeout(r, 150))

async function subscribed(overrides: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(overrides)
  const endpoint = `https://fcm.googleapis.com/fcm/send/${user.id}`
  await db.pushSubscription.create({
    data: { userId: user.id, endpoint, p256dh: 'k', auth: 'a' },
  })
  return { user, endpoint }
}

describe('pushing notifications', () => {
  it('names the bell row it announces and carries the unread badge', async () => {
    const { user } = await subscribed()
    const other = await createUser()
    await db.message.create({ data: { senderId: other.id, recipientId: user.id, body: 'hi' } })
    await notify(user.id, 'FOLLOWED_YOU', { actorName: 'Ada', actorId: other.id })
    await settle()

    const row = await db.notification.findFirstOrThrow({ where: { userId: user.id } })
    expect(sent.list).toHaveLength(1)
    expect(sent.list[0].body).toMatchObject({
      title: 'New follower',
      notificationId: row.id,
      // This notification and the unread message.
      badge: 2,
    })
  })

  it('respects each category switch', async () => {
    const { user } = await subscribed()
    await db.user.update({ where: { id: user.id }, data: { pushActivity: false } })
    await notify(user.id, 'FOLLOWED_YOU', { actorName: 'Ada' })
    await notify(user.id, 'COLLABORATOR_INVITED', { inviterName: 'Ada', projectTitle: 'Rover' })
    await settle()
    expect(sent.list.map((s) => s.body.title)).toEqual(['Collaboration invite'])
  })

  it('gives each recipient of a fan-out their own row', async () => {
    const a = await subscribed()
    const b = await subscribed()
    await notifyMany([a.user.id, b.user.id], 'ORG_JOIN_REQUESTED', {
      orgName: 'Robotics',
      slug: 'robotics',
      actorName: 'Ada',
    })
    await settle()
    const rows = await db.notification.findMany({ select: { id: true, userId: true } })
    for (const { user, endpoint } of [a, b]) {
      const push = sent.list.find((s) => s.endpoint === endpoint)!
      expect(push.body.notificationId).toBe(rows.find((r) => r.userId === user.id)!.id)
    }
  })

  it('never pushes broadcasts', async () => {
    const { user } = await subscribed()
    await notifyMany([user.id], 'PROJECT_UPDATED', { projectTitle: 'Rover' })
    await notifyMany([user.id], 'FOLLOWING_PUBLISHED', { projectTitle: 'Rover' })
    await settle()
    expect(sent.list).toEqual([])
    expect(PUSH_CATEGORY.PROJECT_UPDATED).toBeNull()
  })

  it('forgets a subscription the push service says is gone', async () => {
    const { user, endpoint } = await subscribed()
    sent.gone.add(endpoint)
    await notify(user.id, 'FOLLOWED_YOU', { actorName: 'Ada' })
    await settle()
    expect(await db.pushSubscription.count()).toBe(0)
  })

  it('pushes messages under their own switch, one tag per sender', async () => {
    const sender = await createUser({ name: 'Ada' })
    const { user } = await subscribed()
    const app = await getApp()
    const cookies = await cookieFor(sender)
    for (const body of ['hi', 'there'])
      await app.inject({ method: 'POST', url: `/messages/${user.id}`, cookies, payload: { body } })
    await settle()
    // Each send is fire-and-forget, so the two can reach the push service in
    // either order.
    expect(sent.list).toHaveLength(2)
    expect(sent.list.map((s) => s.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Ada',
          body: 'Sent you a message',
          tag: `message:${sender.id}`,
        }),
        expect.objectContaining({ body: 'Sent you 2 messages', tag: `message:${sender.id}` }),
      ])
    )

    sent.list.length = 0
    await db.user.update({ where: { id: user.id }, data: { pushMessages: false } })
    await app.inject({
      method: 'POST',
      url: `/messages/${user.id}`,
      cookies,
      payload: { body: '?' },
    })
    await settle()
    expect(sent.list).toEqual([])
  })

  it('saves the switches from Settings', async () => {
    const user = await createUser()
    const app = await getApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(user),
      payload: { pushActivity: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ pushActivity: false, pushMessages: true })
    const bad = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(user),
      payload: { pushMessages: 'no' },
    })
    expect(bad.statusCode).toBe(400)
  })
})
