import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { createUser, resetDb } from '../test/helpers.js'
import { NOTIFICATION_RETENTION_DAYS, runMaintenance } from './maintenance.js'

beforeEach(resetDb)

describe('runMaintenance', () => {
  it('drops old read notifications and keeps unread and recent ones', async () => {
    const user = await createUser()
    const old = new Date(Date.now() - (NOTIFICATION_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000)
    const base = { userId: user.id, type: 'FOLLOWED_YOU' as const, payload: {} }
    await db.notification.createMany({
      data: [
        { ...base, read: true, createdAt: old },
        { ...base, read: false, createdAt: old },
        { ...base, read: true },
      ],
    })
    await runMaintenance()
    const left = await db.notification.findMany({ select: { read: true } })
    expect(left).toHaveLength(2)
  })

  it('drops spent and expired auth tokens', async () => {
    const user = await createUser()
    await db.authToken.createMany({
      data: [
        {
          userId: user.id,
          kind: 'VERIFY_EMAIL',
          tokenHash: 'a',
          expiresAt: new Date(Date.now() - 1000),
        },
        {
          userId: user.id,
          kind: 'VERIFY_EMAIL',
          tokenHash: 'b',
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: new Date(),
        },
        {
          userId: user.id,
          kind: 'VERIFY_EMAIL',
          tokenHash: 'c',
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    })
    await runMaintenance()
    expect((await db.authToken.findMany()).map((t) => t.tokenHash)).toEqual(['c'])
  })
})

describe('GET /users/me/notifications paging', () => {
  it('pages back with nextBefore', async () => {
    const { getApp, cookieFor } = await import('../test/helpers.js')
    const user = await createUser()
    await db.notification.createMany({
      data: Array.from({ length: 35 }, (_, i) => ({
        userId: user.id,
        type: 'FOLLOWED_YOU' as const,
        payload: {},
        createdAt: new Date(Date.now() - i * 1000),
      })),
    })
    const app = await getApp()
    const cookies = await cookieFor(user)
    const first = (
      await app.inject({ method: 'GET', url: '/users/me/notifications', cookies })
    ).json()
    expect(first.notifications).toHaveLength(30)
    const second = (
      await app.inject({
        method: 'GET',
        url: `/users/me/notifications?before=${encodeURIComponent(first.nextBefore)}`,
        cookies,
      })
    ).json()
    expect(second.notifications).toHaveLength(5)
    expect(second.nextBefore).toBeNull()
  })
})
