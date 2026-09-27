import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { clearFacetsCache } from '../lib/facets.js'
import { startOfUtcWeek } from '../lib/dates.js'
import {
  cookieFor,
  createProject,
  createUser,
  createOrg,
  getApp,
  resetDb,
  uniqueIp,
} from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
  clearFacetsCache()
})

/**
 * The backend the redesigned UI is built on: real project fields, saves,
 * link-only projects, unique views, this-week trending, threaded comments,
 * update notes, scoped feeds, the weekly spotlight, and the counts Explore
 * decorates its links with.
 */

type User = { id: string; email: string }

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  user?: User,
  payload?: unknown,
  ip?: string
) {
  const app = await getApp()
  return app.inject({
    method,
    url,
    ...(user ? { cookies: await cookieFor(user) } : {}),
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    ...(ip ? { remoteAddress: ip } : {}),
  })
}

const titles = (rows: { title: string }[]) => rows.map((p) => p.title)

describe('project fields', () => {
  it('stores a pitch, type and status, and returns them', async () => {
    const me = await createUser()
    const res = await call('POST', '/projects', me, {
      title: 'Seatfinder',
      pitch: 'Live map of open study seats.',
      description: '## The problem\nFinding a seat takes ages.',
      type: 'APP',
      status: 'SHIPPED',
      visibility: 'PUBLIC',
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({
      pitch: 'Live map of open study seats.',
      type: 'APP',
      status: 'SHIPPED',
    })
  })

  it('rejects a type, status or visibility it does not know', async () => {
    const me = await createUser()
    expect((await call('POST', '/projects', me, { title: 'x', type: 'PODCAST' })).statusCode).toBe(
      400
    )
    expect((await call('POST', '/projects', me, { title: 'x', status: 'DONE' })).statusCode).toBe(
      400
    )
    expect(
      (await call('POST', '/projects', me, { title: 'x', visibility: 'SECRET' })).statusCode
    ).toBe(400)
  })

  it('clears a status with null, and leaves fields that were not sent alone', async () => {
    const me = await createUser()
    const project = await createProject(me.id, {
      type: 'FILM',
      status: 'HELP_WANTED',
      pitch: 'A short.',
    })

    const res = await call('PATCH', `/projects/${project.id}`, me, { status: null })
    expect(res.json()).toMatchObject({ status: null, type: 'FILM', pitch: 'A short.' })
  })

  it('filters the directory by type and status', async () => {
    const me = await createUser()
    await createProject(me.id, { title: 'film', type: 'FILM', visibility: 'PUBLIC' })
    await createProject(me.id, {
      title: 'app needing help',
      type: 'APP',
      status: 'HELP_WANTED',
      visibility: 'PUBLIC',
    })
    await createProject(me.id, {
      title: 'app',
      type: 'APP',
      status: 'SHIPPED',
      visibility: 'PUBLIC',
    })

    expect(titles((await call('GET', '/projects?type=FILM')).json())).toEqual(['film'])
    expect(titles((await call('GET', '/projects?status=HELP_WANTED')).json())).toEqual([
      'app needing help',
    ])
  })

})

describe('what a project card is sent', () => {
  it('carries reactions, links, collaborators and the save state in the list itself', async () => {
    const owner = await createUser()
    const partner = await createUser({ name: 'Omar' })
    const reader = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    await db.projectLink.create({
      data: { projectId: project.id, label: 'Live demo', url: 'https://x.app' },
    })
    await db.projectCollaborator.create({
      data: { projectId: project.id, userId: partner.id, accepted: true },
    })
    await db.projectReaction.createMany({
      data: [
        { projectId: project.id, userId: reader.id, kind: 'IMPRESSIVE' },
        { projectId: project.id, userId: partner.id, kind: 'USEFUL' },
      ],
    })
    await db.projectSave.create({ data: { userId: reader.id, projectId: project.id } })

    const [card] = (await call('GET', '/projects', reader)).json()
    expect(card.reactions).toEqual({ USEFUL: 1, IMPRESSIVE: 1, COLLAB: 0 })
    expect(card.reactionTotal).toBe(2)
    expect(card.saved).toBe(true)
    expect(card.myReactions).toEqual(['IMPRESSIVE'])
    expect(card.links[0].label).toBe('Live demo')
    expect(card.collaborators[0].user.name).toBe('Omar')
    expect(card._count).toEqual({ comments: 0 })
  })

  it('shows the view count to the owner only', async () => {
    const owner = await createUser()
    const other = await createUser()
    await createProject(owner.id, { visibility: 'PUBLIC', viewCount: 12 })

    expect((await call('GET', '/projects', other)).json()[0]).not.toHaveProperty('viewCount')
    expect((await call('GET', '/projects', owner)).json()[0].viewCount).toBe(12)
  })
})

describe('saving', () => {
  it('toggles a private bookmark that never notifies anybody', async () => {
    const owner = await createUser()
    const me = await createUser()
    const project = await createProject(owner.id, { title: 'keeper', visibility: 'PUBLIC' })

    expect((await call('POST', `/projects/${project.id}/save`, me)).json()).toEqual({ saved: true })
    expect(titles((await call('GET', '/users/me/saved', me)).json())).toEqual(['keeper'])
    expect(await db.notification.count()).toBe(0)

    expect((await call('POST', `/projects/${project.id}/save`, me)).json()).toEqual({
      saved: false,
    })
    expect((await call('GET', '/users/me/saved', me)).json()).toEqual([])
  })

  it('will not save what the caller cannot see, and drops what later went private', async () => {
    const owner = await createUser()
    const me = await createUser()
    const secret = await createProject(owner.id, { visibility: 'PRIVATE' })
    expect((await call('POST', `/projects/${secret.id}/save`, me)).statusCode).toBe(404)

    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    await call('POST', `/projects/${project.id}/save`, me)
    await db.project.update({ where: { id: project.id }, data: { visibility: 'PRIVATE' } })
    expect((await call('GET', '/users/me/saved', me)).json()).toEqual([])
  })
})

describe('unlisted projects', () => {
  it('open for anyone with the link but appear in no list', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, {
      title: 'link only',
      visibility: 'UNLISTED',
      publishedAt: null,
    })

    expect((await call('GET', `/projects/${project.id}`)).statusCode).toBe(200)
    expect((await call('GET', '/projects')).json()).toEqual([])
    expect((await call('GET', '/projects', await createUser())).json()).toEqual([])
    expect(titles((await call('GET', `/users/${owner.id}/projects`, owner)).json())).toEqual([
      'link only',
    ])
  })

  it('are not published, so followers are not told', async () => {
    const owner = await createUser()
    const follower = await createUser()
    await db.follow.create({ data: { followerId: follower.id, followingId: owner.id } })

    const res = await call('POST', '/projects', owner, { title: 'quiet', visibility: 'UNLISTED' })
    expect(res.json().publishedAt).toBeNull()
    expect(await db.notification.count({ where: { userId: follower.id } })).toBe(0)
  })
})

describe('views', () => {
  it('count one person once a day, however often they reload', async () => {
    const owner = await createUser()
    const reader = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    await call('GET', `/projects/${project.id}`, reader)
    await call('GET', `/projects/${project.id}`, reader)
    await call('GET', `/projects/${project.id}`, await createUser())

    expect((await db.project.findUnique({ where: { id: project.id } }))?.viewCount).toBe(2)
    expect((await db.projectDailyView.findFirst({ where: { projectId: project.id } }))?.count).toBe(
      2
    )
  })

  it('tell signed-out visitors apart without storing who they are', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    const one = uniqueIp()

    await call('GET', `/projects/${project.id}`, undefined, undefined, one)
    await call('GET', `/projects/${project.id}`, undefined, undefined, one)
    await call('GET', `/projects/${project.id}`, undefined, undefined, uniqueIp())

    expect((await db.project.findUnique({ where: { id: project.id } }))?.viewCount).toBe(2)
    const keys = await db.projectViewer.findMany({ where: { projectId: project.id } })
    expect(keys.every((k) => k.viewerKey.startsWith('a:') && !k.viewerKey.includes('10.'))).toBe(
      true
    )
  })

  it('never count the owner', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    await call('GET', `/projects/${project.id}`, owner)
    expect((await db.project.findUnique({ where: { id: project.id } }))?.viewCount).toBe(0)
  })
})

describe('trending', () => {
  it('ranks this week’s engagement above old view totals', async () => {
    const owner = await createUser()
    await createProject(owner.id, {
      title: 'famous last year',
      visibility: 'PUBLIC',
      viewCount: 5000,
    })
    const fresh = await createProject(owner.id, { title: 'this week', visibility: 'PUBLIC' })
    await db.projectReaction.create({
      data: { projectId: fresh.id, userId: (await createUser()).id, kind: 'IMPRESSIVE' },
    })

    expect(titles((await call('GET', '/projects?sort=trending')).json())).toEqual([
      'this week',
      'famous last year',
    ])
  })

  it('weighs a reaction above a handful of views', async () => {
    const owner = await createUser()
    await createProject(owner.id, { title: 'glanced at', visibility: 'PUBLIC', recentViews: 2 })
    const liked = await createProject(owner.id, { title: 'reacted to', visibility: 'PUBLIC' })
    await db.projectReaction.create({
      data: { projectId: liked.id, userId: (await createUser()).id, kind: 'USEFUL' },
    })

    expect(titles((await call('GET', '/projects?sort=trending')).json())).toEqual([
      'reacted to',
      'glanced at',
    ])
  })
})

describe('comments', () => {
  it('nest replies one level deep, even when answering a reply', async () => {
    const owner = await createUser()
    const a = await createUser()
    const b = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    const top = (
      await call('POST', `/projects/${project.id}/comments`, a, { body: 'Question?' })
    ).json()
    const reply = (
      await call('POST', `/projects/${project.id}/comments`, owner, {
        body: 'Answer.',
        parentId: top.id,
      })
    ).json()
    await call('POST', `/projects/${project.id}/comments`, b, {
      body: 'Follow-up.',
      parentId: reply.id,
    })

    const thread = (await call('GET', `/projects/${project.id}/comments`)).json()
    expect(thread).toHaveLength(1)
    expect(thread[0].replies.map((r: { body: string }) => r.body)).toEqual([
      'Answer.',
      'Follow-up.',
    ])
  })

  it('tell the person replied to, and do not ping the owner twice', async () => {
    const owner = await createUser()
    const asker = await createUser()
    const answerer = await createUser({ name: 'Liam' })
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    const top = (
      await call('POST', `/projects/${project.id}/comments`, asker, {
        body: 'Could this map Bahen?',
      })
    ).json()
    await call('POST', `/projects/${project.id}/comments`, answerer, {
      body: 'I can help map it.',
      parentId: top.id,
    })

    const [replied] = await db.notification.findMany({ where: { userId: asker.id } })
    expect(replied.type).toBe('COMMENT_REPLIED')
    expect(replied.payload).toMatchObject({ actorName: 'Liam', excerpt: 'I can help map it.' })
    expect(await db.notification.count({ where: { userId: owner.id } })).toBe(2)
  })

  it('refuses a parent from another project', async () => {
    const owner = await createUser()
    const me = await createUser()
    const one = await createProject(owner.id, { visibility: 'PUBLIC' })
    const two = await createProject(owner.id, { visibility: 'PUBLIC' })
    const elsewhere = (
      await call('POST', `/projects/${one.id}/comments`, me, { body: 'hi' })
    ).json()

    expect(
      (
        await call('POST', `/projects/${two.id}/comments`, me, {
          body: 'x',
          parentId: elsewhere.id,
        })
      ).statusCode
    ).toBe(400)
  })

  it('list the ones readers found helpful first', async () => {
    const owner = await createUser()
    const a = await createUser()
    const b = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    await call('POST', `/projects/${project.id}/comments`, a, { body: 'first' })
    const useful = (
      await call('POST', `/projects/${project.id}/comments`, b, { body: 'useful' })
    ).json()

    expect(
      (await call('POST', `/projects/${project.id}/comments/${useful.id}/helpful`, a)).json()
    ).toEqual({
      helpful: true,
      helpfulCount: 1,
    })
    const thread = (await call('GET', `/projects/${project.id}/comments`, a)).json()
    expect(thread.map((c: { body: string }) => c.body)).toEqual(['useful', 'first'])
    expect(thread[0].helpfulByMe).toBe(true)
  })

  it('will not let somebody mark their own comment helpful', async () => {
    const owner = await createUser()
    const me = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    const mine = (
      await call('POST', `/projects/${project.id}/comments`, me, { body: 'mine' })
    ).json()
    expect(
      (await call('POST', `/projects/${project.id}/comments/${mine.id}/helpful`, me)).statusCode
    ).toBe(400)
  })
})

describe('updates', () => {
  it('keep a release note on the version', async () => {
    const me = await createUser()
    const project = await createProject(me.id, { visibility: 'PUBLIC' })

    await call('POST', `/projects/${project.id}/versions`, me, { note: 'Added Gerstein Library' })
    const [version] = (await call('GET', `/projects/${project.id}/versions`)).json()
    expect(version).toMatchObject({ versionNum: 1, note: 'Added Gerstein Library' })

    expect(
      (await call('POST', `/projects/${project.id}/versions`, me, { note: 'x'.repeat(300) }))
        .statusCode
    ).toBe(400)
  })
})

describe('feed tabs', () => {
  it('scope to people followed, the campus, or the program — with no strangers topping them up', async () => {
    const me = await createUser()
    await db.user.update({ where: { id: me.id }, data: { campus: 'UTM', faculty: 'Engineering' } })
    const followed = await createUser()
    const utm = await createUser()
    const engineer = await createUser()
    await db.user.update({ where: { id: utm.id }, data: { campus: 'UTM' } })
    await db.user.update({ where: { id: engineer.id }, data: { faculty: 'Engineering' } })
    await db.follow.create({ data: { followerId: me.id, followingId: followed.id } })
    await createProject(followed.id, { title: 'from a follow', visibility: 'PUBLIC' })
    await createProject(utm.id, { title: 'from UTM', visibility: 'PUBLIC' })
    await createProject(engineer.id, { title: 'from Engineering', visibility: 'PUBLIC' })
    await createProject((await createUser()).id, {
      title: 'stranger',
      visibility: 'PUBLIC',
      recentViews: 50,
    })

    const tab = async (scope: string) =>
      titles(
        (await call('GET', `/feed?scope=${scope}`, me))
          .json()
          .items.map((i: { project: { title: string } }) => i.project)
      )
    expect(await tab('following')).toEqual(['from a follow'])
    expect(await tab('campus')).toEqual(['from UTM'])
    expect(await tab('program')).toEqual(['from Engineering'])
  })

  it('narrows any tab to one type of work', async () => {
    const me = await createUser()
    const followed = await createUser()
    await db.follow.create({ data: { followerId: me.id, followingId: followed.id } })
    await createProject(followed.id, { title: 'a film', type: 'FILM', visibility: 'PUBLIC' })
    await createProject(followed.id, { title: 'an app', type: 'APP', visibility: 'PUBLIC' })

    const body = (await call('GET', '/feed?scope=following&type=FILM', me)).json()
    expect(body.items.map((i: { project: { title: string } }) => i.project.title)).toEqual([
      'a film',
    ])
  })
})

describe('the weekly spotlight', () => {
  it('falls back to this week’s most active project, and says it was not picked', async () => {
    const owner = await createUser()
    await createProject(owner.id, { title: 'quiet', visibility: 'PUBLIC' })
    await createProject(owner.id, { title: 'busy', visibility: 'PUBLIC', recentViews: 30 })

    const body = (await call('GET', '/spotlight')).json()
    expect(body).toMatchObject({ curated: false, project: { title: 'busy' } })
  })

  it('never falls back to the caller’s own unlisted or draft work', async () => {
    const me = await createUser()
    const other = await createUser()
    await createProject(other.id, { title: 'listed', visibility: 'PUBLIC' })
    await createProject(me.id, { title: 'my link-only', visibility: 'UNLISTED', recentViews: 50 })
    await createProject(me.id, {
      title: 'my old draft',
      visibility: 'PRIVATE',
      publishedAt: new Date(),
      recentViews: 50,
    })

    const body = (await call('GET', '/spotlight', me)).json()
    expect(body).toMatchObject({ curated: false, project: { title: 'listed' } })
  })

  it('shows a moderator’s pick, with their note', async () => {
    const admin = await createUser({ isAdmin: true })
    const owner = await createUser()
    await createProject(owner.id, { title: 'busy', visibility: 'PUBLIC', recentViews: 30 })
    const pick = await createProject(owner.id, { title: 'picked', visibility: 'PUBLIC' })

    const res = await call('POST', '/admin/spotlight', admin, {
      projectId: pick.id,
      note: 'Faculty of Music week',
    })
    expect(res.statusCode).toBe(200)
    expect((await call('GET', '/spotlight')).json()).toMatchObject({
      curated: true,
      note: 'Faculty of Music week',
      project: { title: 'picked' },
    })
  })

  it('files a pick under the Monday of its week and replaces that week’s', async () => {
    const admin = await createUser({ isAdmin: true })
    const owner = await createUser()
    const a = await createProject(owner.id, { visibility: 'PUBLIC' })
    const b = await createProject(owner.id, { visibility: 'PUBLIC' })
    await call('POST', '/admin/spotlight', admin, { projectId: a.id })
    await call('POST', '/admin/spotlight', admin, { projectId: b.id })

    const picks = await db.spotlight.findMany()
    expect(picks).toHaveLength(1)
    expect(picks[0].projectId).toBe(b.id)
    expect(picks[0].weekOf.toISOString()).toBe(startOfUtcWeek().toISOString())
  })

  it('refuses a draft or link-only project, and anybody but a moderator', async () => {
    const admin = await createUser({ isAdmin: true })
    const owner = await createUser()
    const draft = await createProject(owner.id, { visibility: 'PRIVATE' })
    const hidden = await createProject(owner.id, { visibility: 'UNLISTED' })
    const fine = await createProject(owner.id, { visibility: 'PUBLIC' })

    expect(
      (await call('POST', '/admin/spotlight', admin, { projectId: draft.id })).statusCode
    ).toBe(400)
    expect(
      (await call('POST', '/admin/spotlight', admin, { projectId: hidden.id })).statusCode
    ).toBe(400)
    expect((await call('POST', '/admin/spotlight', owner, { projectId: fine.id })).statusCode).toBe(
      403
    )
  })
})

describe('facets', () => {
  it('counts projects per faculty, course and help wanted', async () => {
    const a = await createUser()
    await db.user.update({ where: { id: a.id }, data: { faculty: 'Music' } })
    await createProject(a.id, {
      visibility: 'PUBLIC',
      courseCode: 'CSC309',
      tags: ['React'],
      status: 'HELP_WANTED',
    })
    await createProject(a.id, { visibility: 'PUBLIC', courseCode: 'CSC309' })
    await createProject(a.id, { visibility: 'PRIVATE', courseCode: 'CSC309' })

    const body = (await call('GET', '/projects/facets')).json()
    expect(body.faculties).toEqual({ Music: 2 })
    expect(body.courses).toEqual([{ code: 'CSC309', count: 2 }])
    expect(body.helpWanted).toBe(1)
    expect(body.tagsThisWeek.map((t: { tag: string }) => t.tag)).toEqual(['CSC309', 'React'])
  })

  it('does not count U of T-only work for a signed-out visitor', async () => {
    const a = await createUser()
    await createProject(a.id, { visibility: 'UOFT', courseCode: 'CSC309' })
    expect((await call('GET', '/projects/facets')).json().courses).toEqual([])
  })
})

describe('upcoming events', () => {
  it('lists future events only, soonest first', async () => {
    const me = await createUser()
    const org = await createOrg(me.id)
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000)
    await db.orgActivity.createMany({
      data: [
        { orgId: org.id, createdById: me.id, title: 'later', date: inDays(10) },
        { orgId: org.id, createdById: me.id, title: 'sooner', date: inDays(2) },
        { orgId: org.id, createdById: me.id, title: 'past', date: inDays(-5) },
      ],
    })

    const body = (await call('GET', '/orgs/events/upcoming?take=5')).json()
    expect(titles(body)).toEqual(['sooner', 'later'])
    expect(body[0].org.slug).toBe(org.slug)
  })
})

describe('profiles', () => {
  it('lists and counts the projects somebody is credited on', async () => {
    const owner = await createUser()
    const me = await createUser()
    const project = await createProject(owner.id, { title: 'team work', visibility: 'PUBLIC' })
    await db.projectCollaborator.create({
      data: { projectId: project.id, userId: me.id, accepted: true },
    })
    const pending = await createProject(owner.id, { title: 'not yet', visibility: 'PUBLIC' })
    await db.projectCollaborator.create({
      data: { projectId: pending.id, userId: me.id, accepted: false },
    })

    expect(titles((await call('GET', `/users/${me.id}/collaborations`)).json())).toEqual([
      'team work',
    ])
    expect((await call('GET', `/users/${me.id}`)).json()._count.collaborations).toBe(1)
  })

  it('takes a faculty from the list, and keeps an old free-text one if it is sent back unchanged', async () => {
    const me = await createUser()
    expect((await call('PATCH', '/users/me', me, { faculty: 'Engineering' })).statusCode).toBe(200)
    expect(
      (await call('PATCH', '/users/me', me, { faculty: 'Underwater Basketry' })).statusCode
    ).toBe(400)

    await db.user.update({ where: { id: me.id }, data: { faculty: 'EngSci (old)' } })
    expect(
      (await call('PATCH', '/users/me', me, { faculty: 'EngSci (old)', bio: 'hi' })).statusCode
    ).toBe(200)
    expect((await call('PATCH', '/users/me', me, { faculty: '' })).json().faculty).toBeNull()
  })
})
