import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

const NEW_ORG = {
  name: 'Robotics Association',
  slug: 'robotics',
  contactEmail: 'exec@mail.utoronto.ca',
  contactRole: 'President',
}

async function createOrg(user: { id: string; email: string }, body: Record<string, unknown> = {}) {
  const app = await getApp()
  return app.inject({
    method: 'POST',
    url: '/orgs',
    cookies: await cookieFor(user),
    payload: { ...NEW_ORG, ...body },
  })
}

async function decide(
  admin: { id: string; email: string },
  slug: string,
  decision: string,
  note?: string
) {
  const app = await getApp()
  return app.inject({
    method: 'POST',
    url: `/admin/orgs/${slug}/decision`,
    cookies: await cookieFor(admin),
    payload: { decision, note },
  })
}

describe('POST /orgs', () => {
  it('requires a contact email and a claimed role', async () => {
    const creator = await createUser()
    expect((await createOrg(creator, { contactEmail: undefined })).statusCode).toBe(400)
    expect((await createOrg(creator, { contactRole: '' })).statusCode).toBe(400)
    expect((await createOrg(creator, { contactEmail: 'not-an-email' })).statusCode).toBe(400)
    expect(await db.organization.count()).toBe(0)
  })

  it('creates the group pending, with a 7-day deadline, not published', async () => {
    const creator = await createUser()
    const res = await createOrg(creator)
    expect(res.statusCode).toBe(201)

    const org = await db.organization.findUnique({ where: { slug: 'robotics' } })
    expect(org?.status).toBe('PENDING_VERIFICATION')
    expect(org?.verifiedAt).toBeNull()

    const daysOut = (org!.verificationDeadline!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(daysOut).toBeGreaterThan(6.9)
    expect(daysOut).toBeLessThan(7.1)
  })

  it('rejects a Discord link that is not a Discord host', async () => {
    const creator = await createUser()
    const res = await createOrg(creator, { discordUrl: 'https://example.com/not-discord' })
    expect(res.statusCode).toBe(400)
  })
})

describe('visibility of an unverified group', () => {
  it('hides it from the directory and from strangers, but not from its members', async () => {
    const creator = await createUser()
    const stranger = await createUser()
    await createOrg(creator)
    const app = await getApp()

    const anon = await app.inject({ method: 'GET', url: '/orgs' })
    expect(anon.json()).toEqual([])

    const asStranger = await app.inject({ method: 'GET', url: '/orgs', cookies: await cookieFor(stranger) })
    expect(asStranger.json()).toEqual([])

    // Its own members still see it listed — otherwise nobody has a route back
    // to the page they have seven days to verify.
    const asCreator = await app.inject({ method: 'GET', url: '/orgs', cookies: await cookieFor(creator) })
    expect(asCreator.json()).toHaveLength(1)

    expect((await app.inject({ method: 'GET', url: '/orgs/robotics' })).statusCode).toBe(404)
    expect(
      (await app.inject({ method: 'GET', url: '/orgs/robotics', cookies: await cookieFor(stranger) })).statusCode
    ).toBe(404)
    expect(
      (await app.inject({ method: 'GET', url: '/orgs/robotics', cookies: await cookieFor(creator) })).statusCode
    ).toBe(200)
  })
})

describe('POST /orgs/:slug/verify', () => {
  it('moves the group to review and clears the deadline', async () => {
    const creator = await createUser()
    await createOrg(creator)
    const app = await getApp()

    const res = await app.inject({
      method: 'POST',
      url: '/orgs/robotics/verify',
      cookies: await cookieFor(creator),
      payload: { note: 'Listed on the UTSU directory; I am the 2026 president.' },
    })
    expect(res.statusCode).toBe(200)

    const org = await db.organization.findUnique({ where: { slug: 'robotics' } })
    expect(org?.status).toBe('IN_REVIEW')
    // The clock was on the group to submit; review has no deadline on them.
    expect(org?.verificationDeadline).toBeNull()
    expect(org?.verificationNote).toContain('UTSU')
  })

  it('refuses an empty submission, a non-member, and an expired window', async () => {
    const creator = await createUser()
    const stranger = await createUser()
    await createOrg(creator)
    const app = await getApp()

    const empty = await app.inject({
      method: 'POST',
      url: '/orgs/robotics/verify',
      cookies: await cookieFor(creator),
      payload: { note: '   ' },
    })
    expect(empty.statusCode).toBe(400)

    const outsider = await app.inject({
      method: 'POST',
      url: '/orgs/robotics/verify',
      cookies: await cookieFor(stranger),
      payload: { note: 'let me in' },
    })
    expect(outsider.statusCode).toBe(403)

    await db.organization.update({
      where: { slug: 'robotics' },
      data: { verificationDeadline: new Date(Date.now() - 1000) },
    })
    const late = await app.inject({
      method: 'POST',
      url: '/orgs/robotics/verify',
      cookies: await cookieFor(creator),
      payload: { note: 'too late' },
    })
    // Enforced here as well as in the sweep, so a missed cron run delays
    // cleanup rather than reopening the window.
    expect(late.statusCode).toBe(410)
  })
})

describe('POST /admin/orgs/:slug/decision', () => {
  it('is closed to non-admins', async () => {
    const creator = await createUser()
    await createOrg(creator)
    expect((await decide(creator, 'robotics', 'APPROVE')).statusCode).toBe(403)
  })

  it('approving publishes the group', async () => {
    const creator = await createUser()
    const admin = await createUser({ isAdmin: true })
    await createOrg(creator)

    const res = await decide(admin, 'robotics', 'APPROVE')
    expect(res.statusCode).toBe(200)

    const org = await db.organization.findUnique({ where: { slug: 'robotics' } })
    expect(org?.status).toBe('VERIFIED')
    expect(org?.verifiedAt).not.toBeNull()
    expect(org?.verificationDeadline).toBeNull()

    const app = await getApp()
    expect((await app.inject({ method: 'GET', url: '/orgs' })).json()).toHaveLength(1)
  })

  it('requesting info reopens a fresh window and keeps the note', async () => {
    const creator = await createUser()
    const admin = await createUser({ isAdmin: true })
    await createOrg(creator)

    await decide(admin, 'robotics', 'REQUEST_INFO', 'Send a link to the UTSU listing.')

    const org = await db.organization.findUnique({ where: { slug: 'robotics' } })
    expect(org?.status).toBe('INFO_REQUESTED')
    expect(org?.reviewNote).toBe('Send a link to the UTSU listing.')
    expect(org!.verificationDeadline!.getTime()).toBeGreaterThan(Date.now())
  })

  it('denying deletes the group and its data', async () => {
    const creator = await createUser()
    const admin = await createUser({ isAdmin: true })
    await createOrg(creator)

    const res = await decide(admin, 'robotics', 'DENY', 'Not a real group.')
    expect(res.statusCode).toBe(200)
    expect(await db.organization.count()).toBe(0)
    expect(await db.orgMember.count()).toBe(0)
  })

  it('rejects an unknown decision and a second decision on a verified group', async () => {
    const creator = await createUser()
    const admin = await createUser({ isAdmin: true })
    await createOrg(creator)

    expect((await decide(admin, 'robotics', 'BANISH')).statusCode).toBe(400)
    await decide(admin, 'robotics', 'APPROVE')
    expect((await decide(admin, 'robotics', 'APPROVE')).statusCode).toBe(409)
  })
})

describe('GET /orgs/:slug', () => {
  it('keeps contact details and review notes to members', async () => {
    const creator = await createUser()
    const admin = await createUser({ isAdmin: true })
    const stranger = await createUser()
    await createOrg(creator)
    await decide(admin, 'robotics', 'APPROVE')
    const app = await getApp()

    const asStranger = await app.inject({
      method: 'GET',
      url: '/orgs/robotics',
      cookies: await cookieFor(stranger),
    })
    expect(asStranger.statusCode).toBe(200)
    expect(asStranger.json().contactEmail).toBeUndefined()

    const asMember = await app.inject({
      method: 'GET',
      url: '/orgs/robotics',
      cookies: await cookieFor(creator),
    })
    expect(asMember.json().contactEmail).toBe('exec@mail.utoronto.ca')
  })
})
