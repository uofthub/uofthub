import { beforeEach, describe, expect, it, vi } from 'vitest'

const outbox = vi.hoisted(() => [] as { to: string; subject: string }[])
vi.mock('./email.js', async (original) => ({
  ...(await original<object>()),
  isEmailConfigured: () => true,
  sendEmail: async (m: { to: string; subject: string }) => {
    outbox.push({ to: m.to, subject: m.subject })
  },
}))

import { db } from '../db/client.js'
import { notify } from './notifications.js'
import { cookieFor, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
  outbox.length = 0
})

/** The sends are fire-and-forget; give them a moment to land. */
const settle = () => new Promise((r) => setTimeout(r, 100))

describe('emailed notifications', () => {
  it('emails what needs an answer, and not what does not', async () => {
    const user = await createUser()
    await notify(user.id, 'COLLABORATOR_INVITED', { inviterName: 'Ada', projectTitle: 'Rover' })
    await notify(user.id, 'FOLLOWED_YOU', { actorName: 'Bo' })
    await settle()
    expect(outbox).toEqual([
      { to: user.email, subject: 'Ada invited you to collaborate on uofthub' },
    ])
  })

  it('respects the opt-out', async () => {
    const user = await createUser()
    await db.user.update({ where: { id: user.id }, data: { emailNotifications: false } })
    await notify(user.id, 'COLLABORATOR_INVITED', { inviterName: 'Ada', projectTitle: 'Rover' })
    await settle()
    expect(outbox).toEqual([])
  })

  it('emails the first message of a burst, not every one', async () => {
    const a = await createUser({ name: 'Ada' })
    const b = await createUser()
    const app = await getApp()
    const cookies = await cookieFor(a)
    for (const body of ['hi', 'are you there', '?'])
      await app.inject({ method: 'POST', url: `/messages/${b.id}`, cookies, payload: { body } })
    await settle()
    expect(outbox).toEqual([{ to: b.email, subject: 'Ada sent you a message on uofthub' }])
  })
})
