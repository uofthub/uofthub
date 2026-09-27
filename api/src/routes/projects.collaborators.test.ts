import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../db/client.js'
import { onEmailVerified } from '../lib/accounts.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
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
    expect(first.statusCode).toBe(201)
    const again = await call('POST', `/projects/${project.id}/collaborators`, owner, {
      email: friend.email,
    })
    expect(again.statusCode).toBe(409)
    expect(await db.notification.count({ where: { userId: friend.id } })).toBe(1)

    const people = (await call('GET', `/projects/${project.id}/people`, owner)).json()
    expect(people.pending).toEqual([
      expect.objectContaining({ userId: friend.id, title: 'Designer' }),
    ])
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
    ).toBe(201)
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

  it('refuses an address with no account, and emails nobody', async () => {
    const { owner, project } = await seed()
    const res = await call('POST', `/projects/${project.id}/collaborators`, owner, {
      email: 'new.person@mail.utoronto.ca',
      title: 'Writer',
    })
    expect(res.statusCode).toBe(404)
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
    const res = await call('POST', `/projects/${project.id}/collaborators`, owner, {
      email: 'x@gmail.com',
    })
    expect(res.statusCode).toBe(404)
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

describe('TA access', () => {
  it('is not a credit once granted', async () => {
    const owner = await createUser()
    const ta = await createUser({ email: 'ta@utoronto.ca' })
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })

    expect((await call('POST', `/projects/${project.id}/request-access`, ta)).statusCode).toBe(202)
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

  it('is refused for a project the TA can already see', async () => {
    const owner = await createUser()
    const ta = await createUser({ email: 'ta@utoronto.ca' })
    const project = await createProject(owner.id, { visibility: 'UOFT' })
    expect((await call('POST', `/projects/${project.id}/request-access`, ta)).statusCode).toBe(409)
  })

  it('cannot be granted by the requester to themself', async () => {
    const owner = await createUser()
    const ta = await createUser({ email: 'ta@utoronto.ca' })
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })
    await call('POST', `/projects/${project.id}/request-access`, ta)
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
