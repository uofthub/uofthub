import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createOrg, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

type User = { id: string; email: string }

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  user?: User,
  payload?: object
) {
  const app = await getApp()
  return app.inject({
    method,
    url,
    ...(user && { cookies: await cookieFor(user) }),
    ...(payload && { payload }),
  })
}

async function seed() {
  const admin = await createUser()
  const org = await createOrg(admin.id, { slug: 'robots' })
  return { admin, org }
}

const statusOf = async (orgId: string, userId: string) =>
  (await db.orgMember.findUnique({ where: { orgId_userId: { orgId, userId } } }))?.status ?? null

describe('joining a group', () => {
  it('is an invitation the person accepts, not something done to them', async () => {
    const { admin, org } = await seed()
    const friend = await createUser()
    expect(
      (await call('POST', '/orgs/robots/members', admin, { email: friend.email })).statusCode
    ).toBe(201)
    expect(await statusOf(org.id, friend.id)).toBe('INVITED')
    expect(await db.notification.count({ where: { userId: friend.id, type: 'ORG_INVITED' } })).toBe(
      1
    )
    // Not a member yet: cannot post as the group.
    expect((await call('POST', '/orgs/robots/activities', friend, { title: 'x' })).statusCode).toBe(
      403
    )
    expect((await call('GET', '/users/me/org-invites', friend)).json()).toHaveLength(1)

    await call('POST', '/orgs/robots/membership', friend, { accepted: true })
    expect(await statusOf(org.id, friend.id)).toBe('ACTIVE')
  })

  it('can be asked for, and an admin approves', async () => {
    const { admin, org } = await seed()
    const student = await createUser()
    expect((await call('POST', '/orgs/robots/join', student)).json()).toEqual({
      status: 'REQUESTED',
    })
    expect(
      await db.notification.count({ where: { userId: admin.id, type: 'ORG_JOIN_REQUESTED' } })
    ).toBe(1)

    const page = (await call('GET', '/orgs/robots', admin)).json()
    expect(page.requests.map((r: { userId: string }) => r.userId)).toEqual([student.id])
    expect((await call('GET', '/orgs/robots', student)).json().requests).toBeUndefined()

    await call('PATCH', `/orgs/robots/members/${student.id}`, admin, { approve: true })
    expect(await statusOf(org.id, student.id)).toBe('ACTIVE')
  })

  it('refuses a role that is not MEMBER or ADMIN', async () => {
    const { admin } = await seed()
    const friend = await createUser()
    const res = await call('POST', '/orgs/robots/members', admin, {
      email: friend.email,
      role: 'OWNER',
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('leaving and removing', () => {
  it('lets a member leave and an admin remove, but never strands the group without an admin', async () => {
    const { admin, org } = await seed()
    const a = await createUser()
    const b = await createUser()
    await db.orgMember.createMany({
      data: [
        { orgId: org.id, userId: a.id },
        { orgId: org.id, userId: b.id },
      ],
    })
    expect((await call('DELETE', `/orgs/robots/members/${a.id}`, a)).statusCode).toBe(200)
    expect((await call('DELETE', `/orgs/robots/members/${b.id}`, a)).statusCode).toBe(403)
    // The only admin cannot leave members behind with nobody to run it.
    expect((await call('DELETE', `/orgs/robots/members/${admin.id}`, admin)).statusCode).toBe(400)
    expect(
      (await call('PATCH', `/orgs/robots/members/${admin.id}`, admin, { role: 'MEMBER' }))
        .statusCode
    ).toBe(400)

    await call('PATCH', `/orgs/robots/members/${b.id}`, admin, { role: 'ADMIN' })
    expect((await call('DELETE', `/orgs/robots/members/${admin.id}`, admin)).statusCode).toBe(200)
  })
})

describe('running the page', () => {
  it('renames, edits an event, and deletes the group', async () => {
    const { admin } = await seed()
    expect((await call('PATCH', '/orgs/robots', admin, { name: 'Robot Club' })).json().name).toBe(
      'Robot Club'
    )
    const event = (
      await call('POST', '/orgs/robots/activities', admin, { title: 'Kickoff' })
    ).json()
    const edited = await call('PATCH', `/orgs/robots/activities/${event.id}`, admin, {
      title: 'Kick-off',
    })
    expect(edited.json().title).toBe('Kick-off')

    const stranger = await createUser()
    expect((await call('DELETE', '/orgs/robots', stranger)).statusCode).toBe(403)
    expect((await call('DELETE', '/orgs/robots', admin)).statusCode).toBe(200)
    expect(await db.organization.count()).toBe(0)
  })

  it('lets a moderator delete any group', async () => {
    await seed()
    const mod = await createUser({ isAdmin: true })
    expect((await call('DELETE', '/orgs/robots', mod)).statusCode).toBe(200)
  })

  it('refuses a slug that is taken', async () => {
    await seed()
    const mod = await createUser({ isAdmin: true })
    const res = await call('POST', '/orgs', mod, { name: 'Other', slug: 'Robots' })
    expect(res.statusCode).toBe(409)
  })
})
