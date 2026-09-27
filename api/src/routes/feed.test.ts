import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * The signed-in home feed. What matters here is not only which projects come
 * back but the reason attached to each one — the reason is the whole point of
 * the page, and a wrong one makes the feed look better connected than it is.
 */

async function feed(user: { id: string; email: string }, query = '') {
  const app = await getApp()
  return app.inject({ method: 'GET', url: `/feed${query}`, cookies: await cookieFor(user) })
}

const titles = (body: { items: { project: { title: string } }[] }) =>
  body.items.map((i) => i.project.title)

const reasons = (body: { items: { reason: { kind: string } }[] }) =>
  body.items.map((i) => i.reason.kind)

describe('GET /feed', () => {
  it('rejects a caller with no session', async () => {
    const app = await getApp()
    expect((await app.inject({ method: 'GET', url: '/feed' })).statusCode).toBe(401)
  })

  it('leads with projects from people the student follows', async () => {
    const me = await createUser()
    const followed = await createUser({ name: 'Ada' })
    const stranger = await createUser()

    await createProject(stranger.id, { title: 'unrelated', visibility: 'PUBLIC' })
    await createProject(followed.id, { title: 'followed work', visibility: 'PUBLIC' })
    await db.follow.create({ data: { followerId: me.id, followingId: followed.id } })

    const body = (await feed(me)).json()

    expect(titles(body)[0]).toBe('followed work')
    expect(body.items[0].reason).toMatchObject({ kind: 'FOLLOWING', userName: 'Ada' })
  })

  it('surfaces projects tagged with a course the student has published in', async () => {
    const me = await createUser()
    const classmate = await createUser()
    await createProject(me.id, { title: 'my csc343 work', visibility: 'PUBLIC', tags: ['CSC343'] })
    await createProject(classmate.id, {
      title: 'their csc343 work',
      visibility: 'PUBLIC',
      tags: ['CSC343'],
    })

    const body = (await feed(me)).json()

    expect(titles(body)).toEqual(['their csc343 work'])
    expect(body.items[0].reason).toMatchObject({ kind: 'COURSE', tag: 'CSC343' })
  })

  it('matches a course tag whatever case it was typed in', async () => {
    const me = await createUser()
    const classmate = await createUser()
    await createProject(me.id, { title: 'mine', visibility: 'PUBLIC', tags: ['csc343'] })
    await createProject(classmate.id, { title: 'theirs', visibility: 'PUBLIC', tags: ['CSC343'] })

    const body = (await feed(me)).json()

    expect(titles(body)).toEqual(['theirs'])
    expect(body.items[0].reason.kind).toBe('COURSE')
  })

  it('surfaces work from the student’s own campus', async () => {
    const me = await createUser()
    const peer = await createUser()
    await db.user.update({ where: { id: me.id }, data: { campus: 'UTM' } })
    await db.user.update({ where: { id: peer.id }, data: { campus: 'UTM' } })
    await createProject(peer.id, { title: 'utm work', visibility: 'PUBLIC' })

    const body = (await feed(me)).json()

    expect(titles(body)).toEqual(['utm work'])
    expect(body.items[0].reason).toMatchObject({ kind: 'CAMPUS', campus: 'UTM' })
  })

  it('names the strongest connection when several apply', async () => {
    // Following beats a shared course beats a shared campus: a feed that said
    // "from your campus" about somebody you deliberately follow would be
    // technically true and useless.
    const me = await createUser()
    const followed = await createUser({ name: 'Ada' })
    await db.user.update({ where: { id: me.id }, data: { campus: 'UTSC' } })
    await db.user.update({ where: { id: followed.id }, data: { campus: 'UTSC' } })
    await db.follow.create({ data: { followerId: me.id, followingId: followed.id } })
    await createProject(me.id, { title: 'mine', visibility: 'PUBLIC', tags: ['CSC343'] })
    await createProject(followed.id, { title: 'theirs', visibility: 'PUBLIC', tags: ['CSC343'] })

    const body = (await feed(me)).json()
    expect(body.items[0].reason.kind).toBe('FOLLOWING')
  })

  it('tops up with trending work when the student is connected to nothing', async () => {
    // A brand new account has no follows, no projects and no campus. An empty
    // page is the worst thing it could be shown.
    const me = await createUser()
    const stranger = await createUser()
    await createProject(stranger.id, { title: 'quiet', visibility: 'PUBLIC', recentViews: 1 })
    await createProject(stranger.id, { title: 'popular', visibility: 'PUBLIC', recentViews: 99 })

    const body = (await feed(me)).json()

    expect(titles(body)).toEqual(['popular', 'quiet'])
    expect(reasons(body)).toEqual(['TRENDING', 'TRENDING'])
  })

  it('never repeats a connected project in the trending top-up below it', async () => {
    const me = await createUser()
    const followed = await createUser()
    await db.follow.create({ data: { followerId: me.id, followingId: followed.id } })
    await createProject(followed.id, { title: 'only one', visibility: 'PUBLIC', recentViews: 500 })

    const body = (await feed(me)).json()
    expect(titles(body)).toEqual(['only one'])
  })

  it('omits the student’s own projects', async () => {
    const me = await createUser()
    await createProject(me.id, { title: 'mine', visibility: 'PUBLIC' })

    expect(titles((await feed(me)).json())).toEqual([])
  })

  it('omits projects that were never published', async () => {
    const me = await createUser()
    const stranger = await createUser()
    // UOFT-visible to the caller, but drafted before publishedAt existed and
    // never stamped — the directory can show it, the feed has no date for it.
    await createProject(stranger.id, { title: 'undated', visibility: 'UOFT', publishedAt: null })

    expect(titles((await feed(me)).json())).toEqual([])
  })

  it('omits a taken-down project even from a follower', async () => {
    const me = await createUser()
    const followed = await createUser()
    await db.follow.create({ data: { followerId: me.id, followingId: followed.id } })
    const project = await createProject(followed.id, { title: 'removed', visibility: 'PUBLIC' })
    await db.project.update({ where: { id: project.id }, data: { takenDownAt: new Date() } })

    expect(titles((await feed(me)).json())).toEqual([])
  })

  it('honours visibility — a stranger’s private project never reaches the feed', async () => {
    const me = await createUser()
    const stranger = await createUser()
    await createProject(stranger.id, {
      title: 'secret',
      visibility: 'PRIVATE',
      publishedAt: new Date(),
    })

    expect(titles((await feed(me)).json())).toEqual([])
  })

  it('orders by publish date, not creation date', async () => {
    // A capstone drafted in January and opened up in March is March's news.
    const me = await createUser()
    const followed = await createUser()
    await db.follow.create({ data: { followerId: me.id, followingId: followed.id } })

    const old = await createProject(followed.id, { title: 'drafted first', visibility: 'PUBLIC' })
    const recent = await createProject(followed.id, {
      title: 'drafted second',
      visibility: 'PUBLIC',
    })
    await db.project.update({
      where: { id: old.id },
      data: { publishedAt: new Date('2026-03-01T00:00:00Z') },
    })
    await db.project.update({
      where: { id: recent.id },
      data: { publishedAt: new Date('2026-01-01T00:00:00Z') },
    })

    expect(titles((await feed(me)).json())).toEqual(['drafted first', 'drafted second'])
  })

  it('pages past the end of the connected half into trending', async () => {
    const me = await createUser()
    const followed = await createUser()
    const stranger = await createUser()
    await db.follow.create({ data: { followerId: me.id, followingId: followed.id } })
    await createProject(followed.id, { title: 'connected', visibility: 'PUBLIC' })
    // Recent views rather than relying on publish order: both are stamped with
    // `new Date()` and can land in the same millisecond.
    await createProject(stranger.id, { title: 'trending', visibility: 'PUBLIC', recentViews: 10 })

    const first = (await feed(me, '?take=1')).json()
    const second = (await feed(me, '?take=1&skip=1')).json()

    expect(titles(first)).toEqual(['connected'])
    expect(reasons(first)).toEqual(['FOLLOWING'])
    expect(titles(second)).toEqual(['trending'])
    expect(reasons(second)).toEqual(['TRENDING'])
  })

  it('never shows the same project on two pages', async () => {
    // The two halves are disjoint sets rather than "connected" and
    // "everything", which is what makes paging exact: when the connected half
    // runs out mid-page, the trending half picks up where it left off instead
    // of restarting over a list that still contains what was just shown.
    const me = await createUser()
    const followed = await createUser()
    const stranger = await createUser()
    await db.follow.create({ data: { followerId: me.id, followingId: followed.id } })

    for (let i = 0; i < 3; i++) {
      await createProject(followed.id, { title: `followed ${i}`, visibility: 'PUBLIC' })
      await createProject(stranger.id, {
        title: `stranger ${i}`,
        visibility: 'PUBLIC',
        recentViews: 10 - i,
      })
    }

    const pages = await Promise.all([0, 2, 4].map((skip) => feed(me, `?take=2&skip=${skip}`)))
    const seen = pages.flatMap((res) => titles(res.json()))

    expect(seen).toHaveLength(6)
    expect(new Set(seen).size).toBe(6)
  })

  it('runs out rather than looping when everything has been seen', async () => {
    const me = await createUser()
    const stranger = await createUser()
    await createProject(stranger.id, { title: 'only', visibility: 'PUBLIC' })

    expect(titles((await feed(me, '?skip=20')).json())).toEqual([])
  })

  it('leaves out link-only and private projects the student only collaborates on', async () => {
    const me = await createUser()
    const owner = await createUser()
    await createProject(owner.id, { title: 'listed', visibility: 'PUBLIC' })
    const unlisted = await createProject(owner.id, { title: 'link only', visibility: 'UNLISTED' })
    // Published once, then taken back to a draft.
    const private_ = await createProject(owner.id, {
      title: 'back to draft',
      visibility: 'PRIVATE',
      publishedAt: new Date(),
    })
    await db.projectCollaborator.createMany({
      data: [unlisted, private_].map((p) => ({ projectId: p.id, userId: me.id, accepted: true })),
    })

    expect(titles((await feed(me)).json())).toEqual(['listed'])
  })
})

describe('GET /feed/activity', () => {
  async function activity(user: { id: string; email: string }) {
    const app = await getApp()
    return app.inject({ method: 'GET', url: '/feed/activity', cookies: await cookieFor(user) })
  }

  it('rejects a caller with no session', async () => {
    const app = await getApp()
    expect((await app.inject({ method: 'GET', url: '/feed/activity' })).statusCode).toBe(401)
  })

  it('counts this week’s engagement across everything the student owns', async () => {
    const me = await createUser()
    const visitor = await createUser({ name: 'Priya' })
    const a = await createProject(me.id, { visibility: 'PUBLIC' })
    const b = await createProject(me.id, { visibility: 'PUBLIC' })

    await db.comment.create({ data: { projectId: b.id, userId: visitor.id, body: 'Nice work' } })
    await db.projectReaction.create({
      data: { projectId: a.id, userId: visitor.id, kind: 'USEFUL' },
    })
    await db.projectReaction.create({
      data: { projectId: a.id, userId: visitor.id, kind: 'COLLAB' },
    })

    const body = (await activity(me)).json()

    expect(body).toMatchObject({ projectCount: 2, comments: 1, reactions: 2, collabRequests: 1 })
    expect(body.recentComments[0]).toMatchObject({ body: 'Nice work' })
    expect(body.recentComments[0].user.name).toBe('Priya')
    expect(body.recentReactions[0].project.id).toBe(a.id)
    expect(body).not.toHaveProperty('likes')
  })

  it('does not count the owner’s own reactions and comments as engagement', async () => {
    const me = await createUser()
    const project = await createProject(me.id, { visibility: 'PUBLIC' })
    await db.projectReaction.create({
      data: { projectId: project.id, userId: me.id, kind: 'IMPRESSIVE' },
    })
    await db.comment.create({
      data: { projectId: project.id, userId: me.id, body: 'note to self' },
    })

    const body = (await activity(me)).json()

    expect(body).toMatchObject({ reactions: 0, comments: 0 })
    expect(body.recentReactions).toEqual([])
    expect(body.recentComments).toEqual([])
  })

  it('reports this week’s views against last week’s', async () => {
    const me = await createUser()
    const project = await createProject(me.id, { visibility: 'PUBLIC' })

    const day = (daysAgo: number) => {
      const date = new Date()
      date.setUTCDate(date.getUTCDate() - daysAgo)
      date.setUTCHours(0, 0, 0, 0)
      return date
    }
    await db.projectDailyView.createMany({
      data: [
        { projectId: project.id, date: day(1), count: 5 },
        { projectId: project.id, date: day(9), count: 2 },
        // Older than both windows, so it belongs to neither.
        { projectId: project.id, date: day(40), count: 100 },
      ],
    })

    expect((await activity(me)).json()).toMatchObject({ views: 5, previousViews: 2 })
  })

  it('reports zeroes rather than failing for a student with no projects', async () => {
    const me = await createUser()
    const body = (await activity(me)).json()
    expect(body).toMatchObject({
      projectCount: 0,
      views: 0,
      previousViews: 0,
      reactions: 0,
      comments: 0,
    })
  })
})
