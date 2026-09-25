import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * Student groups as they work now: a moderator creates the page, already
 * verified, and hands it to the exec who runs it. Members link their projects
 * to it, which is what puts "Built with …" on a card.
 */

type User = { id: string; email: string }

async function call(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  user?: User,
  payload?: Record<string, unknown>
) {
  const app = await getApp()
  return app.inject({
    method,
    url,
    ...(user ? { cookies: await cookieFor(user) } : {}),
    ...(payload ? { payload } : {}),
  })
}

const NEW_ORG = { name: 'Robotics Association', slug: 'robotics' }

describe('creating a group', () => {
  it('is for moderators only', async () => {
    const student = await createUser()
    expect((await call('POST', '/orgs', student, NEW_ORG)).statusCode).toBe(403)
    expect(await db.organization.count()).toBe(0)
  })

  it('publishes the page at once and hands it to the exec', async () => {
    const mod = await createUser({ isAdmin: true })
    const exec = await createUser({ email: 'exec@mail.utoronto.ca' })

    const res = await call('POST', '/orgs', mod, { ...NEW_ORG, execEmail: 'Exec@mail.utoronto.ca' })
    expect(res.statusCode).toBe(201)

    const org = await db.organization.findUnique({
      where: { slug: 'robotics' },
      include: { members: true },
    })
    expect(org).toMatchObject({ status: 'VERIFIED', verificationDeadline: null })
    expect(org?.verifiedAt).not.toBeNull()
    expect(org?.members).toEqual([expect.objectContaining({ userId: exec.id, role: 'ADMIN' })])
    // Listed for everyone, signed in or not.
    expect((await call('GET', '/orgs')).json().map((o: { slug: string }) => o.slug)).toEqual([
      'robotics',
    ])
  })

  it('refuses an exec who has no account yet', async () => {
    const mod = await createUser({ isAdmin: true })
    const res = await call('POST', '/orgs', mod, {
      ...NEW_ORG,
      execEmail: 'nobody@mail.utoronto.ca',
    })
    expect(res.statusCode).toBe(404)
  })

  it('rejects a Discord link that is not a Discord host', async () => {
    const mod = await createUser({ isAdmin: true })
    const res = await call('POST', '/orgs', mod, {
      ...NEW_ORG,
      discordUrl: 'https://evil.example/discord',
    })
    expect(res.statusCode).toBe(400)
  })

  it('no longer has a self-serve verification step', async () => {
    const mod = await createUser({ isAdmin: true })
    await call('POST', '/orgs', mod, NEW_ORG)
    expect((await call('POST', '/orgs/robotics/verify', mod, { note: 'hi' })).statusCode).toBe(404)
  })
})

describe('groups left over from self-serve verification', () => {
  async function legacy(creator: User) {
    return db.organization.create({
      data: {
        name: 'Old group',
        slug: 'old-group',
        status: 'IN_REVIEW',
        contactEmail: 'exec@mail.utoronto.ca',
        members: { create: { userId: creator.id, role: 'ADMIN' } },
      },
    })
  }

  it('stay hidden from strangers until a moderator approves them', async () => {
    const creator = await createUser()
    await legacy(creator)
    expect((await call('GET', '/orgs/old-group', await createUser())).statusCode).toBe(404)
    expect((await call('GET', '/orgs/old-group', creator)).statusCode).toBe(200)

    const mod = await createUser({ isAdmin: true })
    expect(
      (await call('POST', '/admin/orgs/old-group/decision', mod, { decision: 'APPROVE' }))
        .statusCode
    ).toBe(200)
    expect((await call('GET', '/orgs/old-group')).statusCode).toBe(200)
  })

  it('can be denied, which deletes them, but no longer sent back for more info', async () => {
    const mod = await createUser({ isAdmin: true })
    await legacy(await createUser())
    const info = await call('POST', '/admin/orgs/old-group/decision', mod, {
      decision: 'REQUEST_INFO',
    })
    expect(info.statusCode).toBe(400)
    await call('POST', '/admin/orgs/old-group/decision', mod, { decision: 'DENY' })
    expect(await db.organization.count()).toBe(0)
  })

  it('is closed to non-moderators', async () => {
    const creator = await createUser()
    await legacy(creator)
    expect(
      (await call('POST', '/admin/orgs/old-group/decision', creator, { decision: 'APPROVE' }))
        .statusCode
    ).toBe(403)
  })
})

describe('"Built with"', () => {
  async function setup() {
    const mod = await createUser({ isAdmin: true })
    const member = await createUser()
    await call('POST', '/orgs', mod, { ...NEW_ORG, execEmail: member.email })
    const project = await createProject(member.id, { title: 'Rover', visibility: 'PUBLIC' })
    return { mod, member, project }
  }

  it('shows a linked group on the project card', async () => {
    const { member, project } = await setup()
    expect(
      (await call('POST', '/orgs/robotics/projects', member, { projectId: project.id })).statusCode
    ).toBe(201)

    const [card] = (await call('GET', '/projects')).json()
    expect(card.orgProjects).toEqual([
      { org: { slug: 'robotics', name: 'Robotics Association', type: 'CLUB' } },
    ])
  })

  it('lists the caller’s own groups for linking', async () => {
    const { member } = await setup()
    const mine = (await call('GET', '/users/me/orgs', member)).json()
    expect(mine.map((o: { slug: string }) => o.slug)).toEqual(['robotics'])
  })

  it('only lets the owner link, and the owner or a group admin unlink', async () => {
    const { member, project } = await setup()
    const outsider = await createUser()
    await db.orgMember.create({
      data: { orgId: (await db.organization.findFirstOrThrow()).id, userId: outsider.id },
    })
    expect(
      (await call('POST', '/orgs/robotics/projects', outsider, { projectId: project.id }))
        .statusCode
    ).toBe(403)

    await call('POST', '/orgs/robotics/projects', member, { projectId: project.id })
    expect(
      (await call('DELETE', `/orgs/robotics/projects/${project.id}`, outsider)).statusCode
    ).toBe(403)
    expect((await call('DELETE', `/orgs/robotics/projects/${project.id}`, member)).statusCode).toBe(
      200
    )
    expect(await db.orgProject.count()).toBe(0)
  })
})

describe('GET /orgs/:slug', () => {
  it('keeps contact details to members and sends no storage summary', async () => {
    const mod = await createUser({ isAdmin: true })
    const exec = await createUser()
    await call('POST', '/orgs', mod, {
      ...NEW_ORG,
      execEmail: exec.email,
      contactEmail: 'exec@mail.utoronto.ca',
    })

    const asStranger = (await call('GET', '/orgs/robotics', await createUser())).json()
    const asMember = (await call('GET', '/orgs/robotics', exec)).json()
    expect(asStranger.contactEmail).toBeUndefined()
    expect(asMember.contactEmail).toBe('exec@mail.utoronto.ca')
    expect(asMember).not.toHaveProperty('storage')
  })
})
