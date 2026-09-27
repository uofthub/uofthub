import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * Engagement that reaches the person who made the thing: the notifications
 * behind likes, comments, reactions and publishing, plus the pinning
 * and reaction endpoints those hang off.
 *
 * The rule under test throughout is that a notification fires for real
 * engagement and cannot be used to pester somebody — a like that is toggled
 * off and on again is not a second event.
 */

const notificationsFor = (userId: string) =>
  db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })

async function post(
  url: string,
  user: { id: string; email: string },
  payload: Record<string, unknown> = {}
) {
  const app = await getApp()
  return app.inject({ method: 'POST', url, cookies: await cookieFor(user), payload })
}

describe('"Want to collab" notifications', () => {
  it('tells the owner privately, the first time, who wants to collaborate', async () => {
    const owner = await createUser()
    const fan = await createUser({ name: 'Priya' })
    const project = await createProject(owner.id, { title: 'Gripper', visibility: 'PUBLIC' })

    await post(`/projects/${project.id}/reactions`, fan, { kind: 'COLLAB' })

    const [notification] = await notificationsFor(owner.id)
    expect(notification.type).toBe('PROJECT_COLLAB_INTEREST')
    expect(notification.payload).toMatchObject({
      projectId: project.id,
      projectTitle: 'Gripper',
      actorId: fan.id,
      actorName: 'Priya',
    })
  })

  it('does not ping the owner again when it is toggled off and back on', async () => {
    const owner = await createUser()
    const fan = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    await post(`/projects/${project.id}/reactions`, fan, { kind: 'COLLAB' })
    await post(`/projects/${project.id}/reactions`, fan, { kind: 'COLLAB' })
    await post(`/projects/${project.id}/reactions`, fan, { kind: 'COLLAB' })

    expect(await notificationsFor(owner.id)).toHaveLength(1)
  })

  it('treats a second person’s offer as its own event', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    await post(`/projects/${project.id}/reactions`, await createUser(), { kind: 'COLLAB' })
    await post(`/projects/${project.id}/reactions`, await createUser(), { kind: 'COLLAB' })

    expect(await notificationsFor(owner.id)).toHaveLength(2)
  })

  it('is not the same notification as a public reaction', async () => {
    const owner = await createUser()
    const fan = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    await post(`/projects/${project.id}/reactions`, fan, { kind: 'IMPRESSIVE' })
    await post(`/projects/${project.id}/reactions`, fan, { kind: 'COLLAB' })

    expect((await notificationsFor(owner.id)).map((n) => n.type)).toEqual([
      'PROJECT_REACTED',
      'PROJECT_COLLAB_INTEREST',
    ])
  })

  it('says nothing when the owner offers to collaborate on their own project', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    await post(`/projects/${project.id}/reactions`, owner, { kind: 'COLLAB' })

    expect(await notificationsFor(owner.id)).toEqual([])
  })

  it('no longer has a like to toggle', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    expect((await post(`/projects/${project.id}/like`, await createUser())).statusCode).toBe(404)
  })
})

describe('comment notifications', () => {
  it('announces every comment, with enough of it to be worth reading', async () => {
    const owner = await createUser()
    const reader = await createUser({ name: 'Sam' })
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    await post(`/projects/${project.id}/comments`, reader, { body: 'How did you calibrate it?' })
    await post(`/projects/${project.id}/comments`, reader, { body: 'Never mind, found it.' })

    const notifications = await notificationsFor(owner.id)
    expect(notifications).toHaveLength(2)
    expect(notifications[0].type).toBe('PROJECT_COMMENTED')
    expect(notifications[0].payload).toMatchObject({
      actorName: 'Sam',
      excerpt: 'How did you calibrate it?',
    })
  })

  it('truncates a long comment rather than copying it whole into the bell', async () => {
    const owner = await createUser()
    const reader = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    await post(`/projects/${project.id}/comments`, reader, { body: 'x'.repeat(500) })

    const [notification] = await notificationsFor(owner.id)
    expect((notification.payload as { excerpt: string }).excerpt).toHaveLength(140)
  })

  it('says nothing when the owner comments on their own project', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    await post(`/projects/${project.id}/comments`, owner, { body: 'note to self' })

    expect(await notificationsFor(owner.id)).toEqual([])
  })
})

describe('follow notifications', () => {
  it('tells somebody the first time they are followed', async () => {
    const me = await createUser({ name: 'Ada' })
    const them = await createUser()

    await post(`/users/${them.id}/follow`, me)

    const [notification] = await notificationsFor(them.id)
    expect(notification.type).toBe('FOLLOWED_YOU')
    expect(notification.payload).toMatchObject({ actorId: me.id, actorName: 'Ada' })
  })

  it('does not ping again on unfollow and refollow', async () => {
    const me = await createUser()
    const them = await createUser()

    await post(`/users/${them.id}/follow`, me)
    await post(`/users/${them.id}/follow`, me)
    await post(`/users/${them.id}/follow`, me)

    expect(await notificationsFor(them.id)).toHaveLength(1)
  })
})

describe('publishing', () => {
  it('stamps publishedAt and tells the owner’s followers', async () => {
    const owner = await createUser({ name: 'Ada' })
    const follower = await createUser()
    await db.follow.create({ data: { followerId: follower.id, followingId: owner.id } })

    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      cookies: await cookieFor(owner),
      payload: { title: 'Solar car', visibility: 'PUBLIC' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().publishedAt).not.toBeNull()

    const [notification] = await notificationsFor(follower.id)
    expect(notification.type).toBe('FOLLOWING_PUBLISHED')
    expect(notification.payload).toMatchObject({ projectTitle: 'Solar car', ownerName: 'Ada' })
  })

  it('says nothing about a project created private', async () => {
    const owner = await createUser()
    const follower = await createUser()
    await db.follow.create({ data: { followerId: follower.id, followingId: owner.id } })

    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      cookies: await cookieFor(owner),
      payload: { title: 'Draft' },
    })

    expect(res.json().publishedAt).toBeNull()
    expect(await notificationsFor(follower.id)).toEqual([])
  })

  it('announces the edit that opens a draft up', async () => {
    const owner = await createUser()
    const follower = await createUser()
    await db.follow.create({ data: { followerId: follower.id, followingId: owner.id } })
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })

    const app = await getApp()
    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${project.id}`,
      cookies: await cookieFor(owner),
      payload: { visibility: 'UOFT' },
    })

    expect(res.json().publishedAt).not.toBeNull()
    expect(await notificationsFor(follower.id)).toHaveLength(1)
  })

  it('does not announce a project twice when it is closed and reopened', async () => {
    // Tidying a published project up behind a PRIVATE flag and putting it back
    // is not a second publication, and followers should not hear about it.
    const owner = await createUser()
    const follower = await createUser()
    await db.follow.create({ data: { followerId: follower.id, followingId: owner.id } })
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })

    const app = await getApp()
    const patch = async (visibility: string) =>
      app.inject({
        method: 'PATCH',
        url: `/projects/${project.id}`,
        cookies: await cookieFor(owner),
        payload: { visibility },
      })

    await patch('PUBLIC')
    const first = (await db.project.findUniqueOrThrow({ where: { id: project.id } })).publishedAt
    await patch('PRIVATE')
    await patch('PUBLIC')

    expect(await notificationsFor(follower.id)).toHaveLength(1)
    // The original publication date survives the round trip.
    expect((await db.project.findUniqueOrThrow({ where: { id: project.id } })).publishedAt).toEqual(
      first
    )
  })
})

describe('POST /projects/:id/pin', () => {
  it('toggles, and reports which way it went', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    expect((await post(`/projects/${project.id}/pin`, owner)).json()).toEqual({ pinned: true })
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } })).pinnedAt
    ).not.toBeNull()

    expect((await post(`/projects/${project.id}/pin`, owner)).json()).toEqual({ pinned: false })
    expect((await db.project.findUniqueOrThrow({ where: { id: project.id } })).pinnedAt).toBeNull()
  })

  it('refuses anybody but the owner — a pin arranges their profile', async () => {
    const owner = await createUser()
    const stranger = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    expect((await post(`/projects/${project.id}/pin`, stranger)).statusCode).toBe(403)
  })

  it('stops at six, and says so', async () => {
    const owner = await createUser()
    for (let i = 0; i < 6; i++) {
      const project = await createProject(owner.id, { visibility: 'PUBLIC' })
      expect((await post(`/projects/${project.id}/pin`, owner)).statusCode).toBe(200)
    }

    const seventh = await createProject(owner.id, { visibility: 'PUBLIC' })
    const res = await post(`/projects/${seventh.id}/pin`, owner)

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/unpin one/i)
    expect(await db.project.count({ where: { pinnedAt: { not: null } } })).toBe(6)
  })

  it('lets a seventh in once one is unpinned', async () => {
    const owner = await createUser()
    const projects = []
    for (let i = 0; i < 6; i++) {
      const project = await createProject(owner.id, { visibility: 'PUBLIC' })
      await post(`/projects/${project.id}/pin`, owner)
      projects.push(project)
    }

    await post(`/projects/${projects[0].id}/pin`, owner)
    const seventh = await createProject(owner.id, { visibility: 'PUBLIC' })

    expect((await post(`/projects/${seventh.id}/pin`, owner)).json()).toEqual({ pinned: true })
  })
})

describe('GET /users/:id/pinned', () => {
  it('returns the pinned projects, most recently pinned first', async () => {
    const owner = await createUser()
    const first = await createProject(owner.id, { title: 'first', visibility: 'PUBLIC' })
    const second = await createProject(owner.id, { title: 'second', visibility: 'PUBLIC' })
    await createProject(owner.id, { title: 'unpinned', visibility: 'PUBLIC' })

    await db.project.update({ where: { id: first.id }, data: { pinnedAt: new Date('2026-01-01') } })
    await db.project.update({
      where: { id: second.id },
      data: { pinnedAt: new Date('2026-02-01') },
    })

    const app = await getApp()
    const body = (await app.inject({ method: 'GET', url: `/users/${owner.id}/pinned` })).json()

    expect(body.map((p: { title: string }) => p.title)).toEqual(['second', 'first'])
  })

  it('hides a pinned project the visitor is not allowed to see', async () => {
    const owner = await createUser()
    const secret = await createProject(owner.id, { title: 'secret', visibility: 'PRIVATE' })
    await db.project.update({ where: { id: secret.id }, data: { pinnedAt: new Date() } })

    const app = await getApp()
    const anonymous = (await app.inject({ method: 'GET', url: `/users/${owner.id}/pinned` })).json()
    const theirs = (
      await app.inject({
        method: 'GET',
        url: `/users/${owner.id}/pinned`,
        cookies: await cookieFor(owner),
      })
    ).json()

    expect(anonymous).toEqual([])
    expect(theirs.map((p: { title: string }) => p.title)).toEqual(['secret'])
  })
})

describe('reactions', () => {
  it('toggles one kind at a time and leaves the others alone', async () => {
    const owner = await createUser()
    const reader = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    await post(`/projects/${project.id}/reactions`, reader, { kind: 'USEFUL' })
    await post(`/projects/${project.id}/reactions`, reader, { kind: 'COLLAB' })

    const app = await getApp()
    const body = (
      await app.inject({
        method: 'GET',
        url: `/projects/${project.id}/reactions`,
        cookies: await cookieFor(reader),
      })
    ).json()

    expect(body.counts).toEqual({ USEFUL: 1, IMPRESSIVE: 0, COLLAB: 1 })
    expect(body.mine.sort()).toEqual(['COLLAB', 'USEFUL'])

    await post(`/projects/${project.id}/reactions`, reader, { kind: 'USEFUL' })
    const after = (
      await app.inject({
        method: 'GET',
        url: `/projects/${project.id}/reactions`,
        cookies: await cookieFor(reader),
      })
    ).json()
    expect(after.counts.USEFUL).toBe(0)
    expect(after.mine).toEqual(['COLLAB'])
  })

  it('reports every kind at zero on a project nobody has reacted to', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    const app = await getApp()
    const body = (
      await app.inject({ method: 'GET', url: `/projects/${project.id}/reactions` })
    ).json()

    expect(body.counts).toEqual({ USEFUL: 0, IMPRESSIVE: 0, COLLAB: 0 })
    expect(body.mine).toEqual([])
  })

  it('tells a signed-out reader nothing about whose reactions they are', async () => {
    const owner = await createUser()
    const reader = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    await post(`/projects/${project.id}/reactions`, reader, { kind: 'IMPRESSIVE' })

    const app = await getApp()
    const body = (
      await app.inject({ method: 'GET', url: `/projects/${project.id}/reactions` })
    ).json()

    expect(body.counts.IMPRESSIVE).toBe(1)
    expect(body.mine).toEqual([])
  })

  it('rejects a kind that is not one of the three, including the retired ones', async () => {
    const owner = await createUser()
    const reader = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    expect(
      (await post(`/projects/${project.id}/reactions`, reader, { kind: 'AMAZING' })).statusCode
    ).toBe(400)
    expect((await post(`/projects/${project.id}/reactions`, reader, {})).statusCode).toBe(400)
    expect(
      (await post(`/projects/${project.id}/reactions`, reader, { kind: 'WOULD_USE' })).statusCode
    ).toBe(400)
    expect(
      (await post(`/projects/${project.id}/reactions`, reader, { kind: 'WELL_DOCUMENTED' }))
        .statusCode
    ).toBe(400)
  })

  it('404s a project the reader cannot see, rather than confirming it exists', async () => {
    const owner = await createUser()
    const stranger = await createUser()
    const secret = await createProject(owner.id, { visibility: 'PRIVATE' })

    const res = await post(`/projects/${secret.id}/reactions`, stranger, { kind: 'USEFUL' })
    expect(res.statusCode).toBe(404)
    expect(await db.projectReaction.count()).toBe(0)
  })

  it('notifies the owner once however many public reactions the reader taps', async () => {
    const owner = await createUser()
    const reader = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    await post(`/projects/${project.id}/reactions`, reader, { kind: 'USEFUL' })
    await post(`/projects/${project.id}/reactions`, reader, { kind: 'IMPRESSIVE' })
    await post(`/projects/${project.id}/reactions`, reader, { kind: 'USEFUL' })

    const notifications = await notificationsFor(owner.id)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('PROJECT_REACTED')
  })
})

describe('GET /projects/:id/analytics', () => {
  it('names who reacted, and who wants to collaborate, to the owner alone', async () => {
    const owner = await createUser()
    const fan = await createUser({ name: 'Priya' })
    const partner = await createUser({ name: 'Omar' })
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    await db.projectReaction.create({
      data: { projectId: project.id, userId: fan.id, kind: 'USEFUL' },
    })
    await db.projectReaction.create({
      data: { projectId: project.id, userId: partner.id, kind: 'COLLAB' },
    })

    const app = await getApp()
    const body = (
      await app.inject({
        method: 'GET',
        url: `/projects/${project.id}/analytics`,
        cookies: await cookieFor(owner),
      })
    ).json()

    expect(body.reactions).toEqual({ USEFUL: 1, IMPRESSIVE: 0, COLLAB: 1 })
    expect(body.recentReactions.map((r: { user: { name: string } }) => r.user.name)).toEqual([
      'Priya',
    ])
    expect(body.collabInterest.map((r: { user: { name: string } }) => r.user.name)).toEqual([
      'Omar',
    ])
    expect(body).not.toHaveProperty('likes')

    const stranger = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/analytics`,
      cookies: await cookieFor(fan),
    })
    expect(stranger.statusCode).toBe(403)
  })

  it('splits views into this week and last', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    const day = (daysAgo: number) => {
      const date = new Date()
      date.setUTCDate(date.getUTCDate() - daysAgo)
      date.setUTCHours(0, 0, 0, 0)
      return date
    }
    await db.projectDailyView.createMany({
      data: [
        { projectId: project.id, date: day(2), count: 7 },
        { projectId: project.id, date: day(10), count: 3 },
      ],
    })

    const app = await getApp()
    const body = (
      await app.inject({
        method: 'GET',
        url: `/projects/${project.id}/analytics`,
        cookies: await cookieFor(owner),
      })
    ).json()

    expect(body).toMatchObject({ viewsThisWeek: 7, viewsLastWeek: 3 })
  })

  it('stays owner-only', async () => {
    const owner = await createUser()
    const stranger = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/analytics`,
      cookies: await cookieFor(stranger),
    })
    expect(res.statusCode).toBe(403)
  })
})
