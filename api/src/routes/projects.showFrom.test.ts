import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { clearFacetsCache } from '../lib/facets.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
  clearFacetsCache()
})

/**
 * A show-from date hides a project from everyone but its makers until then,
 * whatever its visibility — so course work can be posted before grading and
 * appear after it. Every way of reaching a project is checked here, because a
 * hidden project that leaks through one list is not hidden.
 */

type User = { id: string; email: string }

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, user?: User, payload?: unknown) {
  const app = await getApp()
  return app.inject({
    method,
    url,
    ...(user ? { cookies: await cookieFor(user) } : {}),
    ...(payload !== undefined ? { payload: payload as object } : {}),
  })
}

const DAY = 24 * 60 * 60 * 1000
const inAWeek = () => new Date(Date.now() + 7 * DAY)
const aWeekAgo = () => new Date(Date.now() - 7 * DAY)

/** A public course project hidden until next week, and one already revealed. */
async function seed() {
  const owner = await createUser()
  const collaborator = await createUser()
  const stranger = await createUser()
  const hidden = await createProject(owner.id, {
    title: 'hidden poster',
    visibility: 'PUBLIC',
    tags: ['CSC211H5'],
    showFrom: inAWeek(),
  })
  const revealed = await createProject(owner.id, {
    title: 'revealed poster',
    visibility: 'PUBLIC',
    showFrom: aWeekAgo(),
  })
  await db.projectCollaborator.create({
    data: { projectId: hidden.id, userId: collaborator.id, accepted: true },
  })
  return { owner, collaborator, stranger, hidden, revealed }
}

const titles = (res: { json: () => unknown }) =>
  (res.json() as { title: string }[]).map((p) => p.title).sort()

describe('reading one hidden project', () => {
  it('is a 404 to strangers and signed-out visitors, as a private project is', async () => {
    const { stranger, hidden } = await seed()
    expect((await call('GET', `/projects/${hidden.id}`)).statusCode).toBe(404)
    expect((await call('GET', `/projects/${hidden.id}`, stranger)).statusCode).toBe(404)
  })

  it('opens for the owner and an accepted collaborator', async () => {
    const { owner, collaborator, hidden } = await seed()
    expect((await call('GET', `/projects/${hidden.id}`, owner)).statusCode).toBe(200)
    expect((await call('GET', `/projects/${hidden.id}`, collaborator)).statusCode).toBe(200)
  })

  it('opens for everyone once the date has passed', async () => {
    const { revealed } = await seed()
    expect((await call('GET', `/projects/${revealed.id}`)).statusCode).toBe(200)
  })

  it('refuses comments, reactions, follows, versions and files the same way', async () => {
    const { stranger, hidden } = await seed()
    const file = await db.projectFile.create({
      data: { projectId: hidden.id, name: 'poster.pdf', storageKey: 'k', sizeBytes: 1 },
    })
    const reads = [
      call('GET', `/projects/${hidden.id}/comments`, stranger),
      call('GET', `/projects/${hidden.id}/reactions`, stranger),
      call('GET', `/projects/${hidden.id}/versions`, stranger),
      call('GET', `/projects/${hidden.id}/files/${file.id}/preview`, stranger),
      call('POST', `/projects/${hidden.id}/comments`, stranger, { body: 'nice' }),
      call('POST', `/projects/${hidden.id}/reactions`, stranger, { kind: 'USEFUL' }),
      call('POST', `/projects/${hidden.id}/follow`, stranger),
      call('POST', `/projects/${hidden.id}/save`, stranger),
      call('POST', `/projects/${hidden.id}/fork`, stranger),
    ]
    for (const res of await Promise.all(reads)) expect(res.statusCode).toBe(404)
  })
})

describe('hidden projects in lists', () => {
  it('leaves them out of the directory, search and a profile until the date', async () => {
    const { owner, stranger } = await seed()
    expect(titles(await call('GET', '/projects'))).toEqual(['revealed poster'])
    expect(titles(await call('GET', '/projects', stranger))).toEqual(['revealed poster'])
    expect(titles(await call('GET', '/projects?search=poster', stranger))).toEqual([
      'revealed poster',
    ])
    expect(titles(await call('GET', `/users/${owner.id}/projects`, stranger))).toEqual([
      'revealed poster',
    ])
  })

  it('still lists them for their makers', async () => {
    const { owner, collaborator } = await seed()
    expect(titles(await call('GET', `/users/${owner.id}/projects`, owner))).toEqual([
      'hidden poster',
      'revealed poster',
    ])
    expect(titles(await call('GET', '/projects', collaborator))).toEqual([
      'hidden poster',
      'revealed poster',
    ])
  })

  it('keeps them out of the feed', async () => {
    const { stranger } = await seed()
    const res = await call('GET', '/feed', stranger)
    expect(res.statusCode).toBe(200)
    const { items } = res.json() as { items: { project: { title: string } }[] }
    expect(items.map((i) => i.project.title)).toEqual(['revealed poster'])
  })

  it('does not count them in Explore’s facets, so their course is not given away', async () => {
    const { stranger } = await seed()
    const facets = (await call('GET', '/projects/facets', stranger)).json() as {
      courses: { code: string }[]
    }
    expect(facets.courses.map((c) => c.code)).not.toContain('CSC211H5')
  })
})

describe('putting a hidden project in front of others', () => {
  it('cannot be added to a collection', async () => {
    const { owner, hidden, revealed } = await seed()
    const collection = (
      await call('POST', '/collections', owner, { title: 'Best of term' })
    ).json() as { id: string }
    const add = (projectId: string) =>
      call('POST', `/collections/${collection.id}/items`, owner, { projectId })
    expect((await add(hidden.id)).statusCode).toBe(400)
    expect((await add(revealed.id)).statusCode).not.toBe(400)
  })

  it('cannot be spotlighted', async () => {
    const { hidden } = await seed()
    const admin = await createUser({ isAdmin: true })
    const res = await call('POST', '/admin/spotlight', admin, { projectId: hidden.id })
    expect(res.statusCode).toBe(400)
  })
})

describe('asking about a project you cannot see', () => {
  it('reports a 404, not a 403 that confirms it exists', async () => {
    const { stranger, hidden } = await seed()
    const res = await call('POST', `/projects/${hidden.id}/report`, stranger, { reason: 'SPAM' })
    expect(res.statusCode).toBe(404)
  })

  it('lets a TA ask for access to it, answering exactly as for an id that does not exist', async () => {
    const { hidden } = await seed()
    const ta = await createUser({ email: 'ta.person@utoronto.ca' })
    const real = await call('POST', `/projects/${hidden.id}/request-access`, ta)
    const fake = await call(
      'POST',
      '/projects/00000000-0000-0000-0000-000000000000/request-access',
      ta
    )

    expect(real.statusCode).toBe(202)
    expect(real.json()).toEqual(fake.json())
    expect(await db.projectCollaborator.count({ where: { userId: ta.id, role: 'VIEWER' } })).toBe(1)
  })

  it('lets a TA ask for access to a draft too', async () => {
    const owner = await createUser()
    const draft = await createProject(owner.id, { visibility: 'PRIVATE' })
    const ta = await createUser({ email: 'another.ta@utoronto.ca' })
    expect((await call('POST', `/projects/${draft.id}/request-access`, ta)).statusCode).toBe(202)
  })
})

describe('setting a show-from date', () => {
  it('takes a calendar day as midnight in Toronto', async () => {
    const owner = await createUser()
    const res = await call('POST', '/projects', owner, {
      title: 'Poster',
      showFrom: '2099-12-20',
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().showFrom).toBe('2099-12-20T05:00:00.000Z')
  })

  it('refuses something that is not a date', async () => {
    const owner = await createUser()
    const res = await call('POST', '/projects', owner, { title: 'Poster', showFrom: 'after exams' })
    expect(res.statusCode).toBe(400)
  })

  it('publishes a hidden project for the day it appears, and tells nobody yet', async () => {
    const owner = await createUser()
    const follower = await createUser()
    await db.follow.create({ data: { followerId: follower.id, followingId: owner.id } })
    const draft = await createProject(owner.id)

    const res = await call('PATCH', `/projects/${draft.id}`, owner, {
      visibility: 'UOFT',
      showFrom: '2099-12-20',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().publishedAt).toBe('2099-12-20T05:00:00.000Z')
    expect(await db.notification.count({ where: { userId: follower.id } })).toBe(0)
  })

  it('announces at once when the date is cleared', async () => {
    const owner = await createUser()
    const follower = await createUser()
    await db.follow.create({ data: { followerId: follower.id, followingId: owner.id } })
    const draft = await createProject(owner.id)
    await call('PATCH', `/projects/${draft.id}`, owner, {
      visibility: 'UOFT',
      showFrom: '2099-12-20',
    })

    const res = await call('PATCH', `/projects/${draft.id}`, owner, { showFrom: null })
    expect(new Date(res.json().publishedAt).getTime()).toBeLessThanOrEqual(Date.now())
    expect(
      await db.notification.count({ where: { userId: follower.id, type: 'FOLLOWING_PUBLISHED' } })
    ).toBe(1)
  })

  it('stops being scheduled when put back to private', async () => {
    const owner = await createUser()
    const draft = await createProject(owner.id)
    await call('PATCH', `/projects/${draft.id}`, owner, {
      visibility: 'UOFT',
      showFrom: '2099-12-20',
    })
    const res = await call('PATCH', `/projects/${draft.id}`, owner, { visibility: 'PRIVATE' })
    expect(res.json().publishedAt ?? null).toBeNull()
  })
})
