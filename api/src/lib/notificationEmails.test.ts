import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const outbox = vi.hoisted(() => [] as { to: string; subject: string }[])
const lastEmail = vi.hoisted(() => ({ html: '', unsubscribeUserId: '' as string | undefined }))
vi.mock('./email.js', async (original) => ({
  ...(await original<object>()),
  isEmailConfigured: () => true,
  sendEmail: async (m: {
    to: string
    subject: string
    html: string
    unsubscribeUserId?: string
  }) => {
    outbox.push({ to: m.to, subject: m.subject })
    Object.assign(lastEmail, m)
  },
}))

import { db } from '../db/client.js'
import { htmlToText, readUnsubscribeToken, unsubscribeToken } from './email.js'
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
      { to: user.email, subject: 'You were invited to collaborate on a uofthub project' },
    ])
  })

  it('keeps names other students chose out of the subject line', async () => {
    const user = await createUser()
    const lure = 'IT Services: verify your UTORid at utoronto-login.co'
    await notify(user.id, 'COLLABORATOR_INVITED', { inviterName: lure, projectTitle: lure })
    await settle()
    expect(outbox[0]!.subject).not.toContain('IT Services')
    expect(lastEmail.html).toContain('IT Services')
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
    expect(outbox).toEqual([{ to: b.email, subject: 'You have a new message on uofthub' }])
  })
})

describe('unsubscribing', () => {
  it('carries a working unsubscribe link and header', async () => {
    const user = await createUser()
    await notify(user.id, 'COLLABORATOR_INVITED', { inviterName: 'Ada', projectTitle: 'Rover' })
    await settle()
    expect(lastEmail.unsubscribeUserId).toBe(user.id)
    expect(lastEmail.html).toContain(`/unsubscribe?token=${unsubscribeToken(user.id)}`)

    const app = await getApp()
    // What Gmail and Outlook send for the List-Unsubscribe-Post header.
    const res = await app.inject({
      method: 'POST',
      url: `/email/unsubscribe?token=${unsubscribeToken(user.id)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    })
    expect(res.statusCode).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailNotifications).toBe(
      false
    )
  })

  it('refuses a token made up for somebody else', async () => {
    const user = await createUser()
    expect(readUnsubscribeToken(`${user.id}.forged`)).toBeNull()
    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: '/email/unsubscribe',
      payload: { token: `${user.id}.${unsubscribeToken('someone-else').split('.')[1]}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('still honours links in mail sent before tokens had a key of their own', () => {
    const legacy = `abc.${createHmac('sha256', process.env.JWT_SECRET!)
      .update('unsubscribe:abc')
      .digest('base64url')}`
    expect(readUnsubscribeToken(legacy)).toBe('abc')
    // And new tokens are not signed with the session secret itself.
    expect(unsubscribeToken('abc')).not.toBe(legacy)
  })

  it('writes a plain-text part', () => {
    expect(htmlToText('<p><b>Ada</b> &amp; co</p><p><a href="https://x.test/a">Open</a></p>')).toBe(
      'Ada & co\n\nOpen (https://x.test/a)'
    )
  })
})
