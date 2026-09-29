import { beforeEach, describe, expect, it, vi } from 'vitest'

// Captured rather than sent: which addresses were emailed an invitation.
const invited = vi.hoisted(() => [] as string[])
vi.mock('../lib/authEmails.js', async (original) => ({
  ...(await original<object>()),
  sendProjectInviteEmail: async (to: string) => {
    invited.push(to)
  },
}))

import { db } from '../db/client.js'
import { onEmailVerified } from '../lib/accounts.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
  invited.length = 0
})

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
  const owner = await createUser()
  const friend = await createUser()
  const project = await createProject(owner.id, { visibility: 'PUBLIC' })
  return { owner, friend, project }
}

describe('inviting collaborators', () => {
  it('records the role, and refuses to invite twice', async () => {
    const { owner, friend, project } = await seed()
    const first = await call('POST', `/projects/${project.id}/collaborators`, owner, {
      email: friend.email,
      title: 'Designer',
    })
    expect(first.statusCode).toBe(202)
    const again = await call('POST', `/projects/${project.id}/collaborators`, owner, {
      email: friend.email,
    })
    expect(again.statusCode).toBe(409)
    expect(await db.notification.count({ where: { userId: friend.id } })).toBe(1)

    const people = (await call('GET', `/projects/${project.id}/people`, owner)).json()
    // By the address typed, not the profile behind it, until they accept.
    expect(people.invites).toEqual([
      expect.objectContaining({ email: friend.email, title: 'Designer' }),
    ])
    expect(JSON.stringify(people)).not.toContain(friend.id)
  })

  it('lists invitations for the invitee until they answer', async () => {
    const { owner, friend, project } = await seed()
    await call('POST', `/projects/${project.id}/collaborators`, owner, { email: friend.email })
    const mine = (await call('GET', '/users/me/invites', friend)).json()
    expect(mine).toEqual([expect.objectContaining({ projectId: project.id })])
  })

  it('deletes a declined invitation rather than leaving it looking pending', async () => {
    const { owner, friend, project } = await seed()
    await call('POST', `/projects/${project.id}/collaborators`, owner, { email: friend.email })
    const res = await call('PATCH', `/projects/${project.id}/collaborators/${friend.id}`, friend, {
      accepted: false,
    })
    expect(res.statusCode).toBe(200)
    expect(await db.projectCollaborator.count()).toBe(0)
    // So they can be invited again.
    expect(
      (await call('POST', `/projects/${project.id}/collaborators`, owner, { email: friend.email }))
        .statusCode
    ).toBe(202)
  })

  it('lets the owner remove someone and a collaborator leave', async () => {
    const { owner, friend, project } = await seed()
    const other = await createUser()
    await db.projectCollaborator.createMany({
      data: [
        { projectId: project.id, userId: friend.id, accepted: true },
        { projectId: project.id, userId: other.id, accepted: true },
      ],
    })
    expect(
      (await call('DELETE', `/projects/${project.id}/collaborators/${friend.id}`, owner)).statusCode
    ).toBe(200)
    expect(
      (await call('DELETE', `/projects/${project.id}/collaborators/${other.id}`, other)).statusCode
    ).toBe(200)
    expect(await db.projectCollaborator.count()).toBe(0)
  })

  it('answers exactly the same whether or not the address has an account', async () => {
    const { owner, friend, project } = await seed()
    const known = await call('POST', `/projects/${project.id}/collaborators`, owner, {
      email: friend.email,
      title: 'Writer',
    })
    const unknown = await call('POST', `/projects/${project.id}/collaborators`, owner, {
      email: 'new.person@mail.utoronto.ca',
      title: 'Writer',
    })
    expect(unknown.statusCode).toBe(known.statusCode)
    expect(Object.keys(unknown.json()).sort()).toEqual(Object.keys(known.json()).sort())
    expect(known.json()).not.toHaveProperty('user')
    // The unknown address waits for an account, and is told so — once.
    expect(await db.projectEmailInvite.count()).toBe(1)
    expect(invited).toEqual(['new.person@mail.utoronto.ca'])
    const again = await call('POST', `/projects/${project.id}/collaborators`, owner, {
      email: 'new.person@mail.utoronto.ca',
    })
    expect(again.statusCode).toBe(409)
    expect(invited).toHaveLength(1)

    const people = (await call('GET', `/projects/${project.id}/people`, owner)).json()
    expect(people.invites.map((i: { email: string }) => i.email).sort()).toEqual(
      [friend.email, 'new.person@mail.utoronto.ca'].sort()
    )
  })

  it('treats an unconfirmed account like no account at all', async () => {
    const { owner, project } = await seed()
    const squatter = await createUser({ email: 'someone@mail.utoronto.ca', verified: false })
    const res = await call('POST', `/projects/${project.id}/collaborators`, owner, {
      email: squatter.email,
    })
    expect(res.statusCode).toBe(202)
    expect(await db.projectCollaborator.count()).toBe(0)
    expect(await db.notification.count({ where: { userId: squatter.id } })).toBe(0)
    expect(await db.projectEmailInvite.count()).toBe(1)
  })

  it('withdraws an unanswered invitation by address, account or not', async () => {
    const { owner, friend, project } = await seed()
    for (const email of [friend.email, 'new.person@mail.utoronto.ca'])
      await call('POST', `/projects/${project.id}/collaborators`, owner, { email })
    for (const email of [friend.email, 'new.person@mail.utoronto.ca'])
      expect(
        (
          await call(
            'DELETE',
            `/projects/${project.id}/email-invites/${encodeURIComponent(email)}`,
            owner
          )
        ).statusCode
      ).toBe(200)
    expect(await db.projectCollaborator.count()).toBe(0)
    expect(await db.projectEmailInvite.count()).toBe(0)
  })

  it('hands over an invitation sent before invites needed an account', async () => {
    const { owner, project } = await seed()
    await db.projectEmailInvite.create({
      data: {
        projectId: project.id,
        email: 'new.person@mail.utoronto.ca',
        title: 'Writer',
        invitedById: owner.id,
      },
    })

    const newcomer = await createUser({ email: 'new.person@mail.utoronto.ca' })
    await onEmailVerified(newcomer.id)

    const row = await db.projectCollaborator.findUniqueOrThrow({
      where: { projectId_userId: { projectId: project.id, userId: newcomer.id } },
    })
    expect(row).toMatchObject({ accepted: false, title: 'Writer' })
    expect(await db.projectEmailInvite.count()).toBe(0)
  })

  it('refuses an address outside U of T', async () => {
    const { owner, project } = await seed()
    for (const email of ['x@gmail.com', 'x@gmail.com,y@mail.utoronto.ca']) {
      const res = await call('POST', `/projects/${project.id}/collaborators`, owner, { email })
      expect(res.statusCode).toBe(400)
    }
    expect(await db.projectEmailInvite.count()).toBe(0)
  })
})

describe('what a collaborator may do', () => {
  it('edits the content but not who can see it', async () => {
    const { owner, friend, project } = await seed()
    await db.projectCollaborator.create({
      data: { projectId: project.id, userId: friend.id, accepted: true },
    })

    expect(
      (await call('PATCH', `/projects/${project.id}`, friend, { title: 'Renamed' })).statusCode
    ).toBe(200)
    expect(
      (await call('PATCH', `/projects/${project.id}`, friend, { visibility: 'PRIVATE' })).statusCode
    ).toBe(403)
    expect((await call('DELETE', `/projects/${project.id}`, friend)).statusCode).toBe(403)
    expect((await call('GET', `/projects/${project.id}`, friend)).json().canEdit).toBe(true)
    expect((await call('GET', `/projects/${project.id}`, owner)).json().canEdit).toBe(true)
  })

  it('does nothing while the invitation is unanswered', async () => {
    const { friend, project } = await seed()
    await db.projectCollaborator.create({ data: { projectId: project.id, userId: friend.id } })
    expect(
      (await call('PATCH', `/projects/${project.id}`, friend, { title: 'Renamed' })).statusCode
    ).toBe(403)
  })
})

// Asking for access is paused (docs/future.md); requests and grants made
// before then are still decided and honoured.
describe('TA access', () => {
  const asked = (projectId: string, userId: string) =>
    db.projectCollaborator.create({
      data: { projectId, userId, role: 'VIEWER', accepted: false },
    })

  it('can no longer be asked for', async () => {
    const owner = await createUser()
    const ta = await createUser({ email: 'ta@utoronto.ca' })
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })
    expect((await call('POST', `/projects/${project.id}/request-access`, ta)).statusCode).toBe(404)
    expect(await db.projectCollaborator.count()).toBe(0)
  })

  it('is not a credit once granted', async () => {
    const owner = await createUser()
    const ta = await createUser({ email: 'ta@utoronto.ca' })
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })

    await asked(project.id, ta.id)
    const people = (await call('GET', `/projects/${project.id}/people`, owner)).json()
    expect(people.accessRequests).toEqual([expect.objectContaining({ userId: ta.id })])

    await call('PATCH', `/projects/${project.id}/collaborators/${ta.id}`, owner, { accepted: true })
    const seen = (await call('GET', `/projects/${project.id}`, ta)).json()
    expect(seen.collaborators).toEqual([])
    expect(seen.canEdit).toBe(false)
    expect((await call('PATCH', `/projects/${project.id}`, ta, { title: 'x' })).statusCode).toBe(
      403
    )
  })

  it('cannot be granted by the requester to themself', async () => {
    const owner = await createUser()
    const ta = await createUser({ email: 'ta@utoronto.ca' })
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })
    await asked(project.id, ta.id)
    const res = await call('PATCH', `/projects/${project.id}/collaborators/${ta.id}`, ta, {
      accepted: true,
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('project validation', () => {
  it('caps and cleans tags and titles', async () => {
    const owner = await createUser()
    const post = (payload: object) => call('POST', '/projects', owner, payload)
    expect((await post({ title: 'x'.repeat(121) })).statusCode).toBe(400)
    expect(
      (await post({ title: 'ok', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).statusCode
    ).toBe(400)
    expect((await post({ title: 'ok', tags: [42] })).statusCode).toBe(400)
    const made = await post({ title: '  ok  ', tags: ['#ML', 'ml', ' vision '] })
    expect(made.statusCode).toBe(201)
    expect(made.json()).toMatchObject({ title: 'ok', tags: ['ML', 'vision'] })
  })
})
