import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * Campus filtering, on the two axes it actually reaches the database through:
 * a student's own campus, and the project directory filtering by it.
 */

async function studentAt(campus: 'UTSG' | 'UTM' | 'UTSC' | null, title: string) {
  const user = await createUser()
  if (campus) await db.user.update({ where: { id: user.id }, data: { campus } })
  await createProject(user.id, { title, visibility: 'PUBLIC' })
  return user
}

const titles = (res: { json: () => { title: string }[] }) => res.json().map((p) => p.title).sort()

describe('GET /projects?campus', () => {
  beforeEach(async () => {
    await studentAt('UTSG', 'downtown')
    await studentAt('UTM', 'mississauga')
    await studentAt('UTSC', 'scarborough')
    await studentAt(null, 'unstated')
  })

  it('returns only projects owned by students at that campus', async () => {
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/projects?campus=UTM' })
    expect(titles(res)).toEqual(['mississauga'])
  })

  it('excludes students who have not said where they are', async () => {
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/projects?campus=UTSG' })
    expect(titles(res)).toEqual(['downtown'])
  })

  it('accepts a lowercase campus, since it arrives from a URL', async () => {
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/projects?campus=utsc' })
    expect(titles(res)).toEqual(['scarborough'])
  })

  it('ignores an unrecognised campus rather than erroring on a stale link', async () => {
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/projects?campus=UTSTGEORGE' })
    expect(res.statusCode).toBe(200)
    expect(titles(res)).toEqual(['downtown', 'mississauga', 'scarborough', 'unstated'])
  })
})

describe('PATCH /users/me campus', () => {
  it('sets a campus', async () => {
    const user = await createUser()
    const app = await getApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(user),
      payload: { campus: 'UTSC' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().campus).toBe('UTSC')
  })

  it('clears it back to unstated on an empty string', async () => {
    const user = await createUser()
    await db.user.update({ where: { id: user.id }, data: { campus: 'UTM' } })

    const app = await getApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(user),
      payload: { campus: '' },
    })
    expect(res.json().campus).toBeNull()
  })

  it('rejects a campus that is not one of the three', async () => {
    const user = await createUser()
    const app = await getApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(user),
      payload: { campus: 'UTSG; DROP TABLE' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('leaves the campus alone when the field is absent', async () => {
    const user = await createUser()
    await db.user.update({ where: { id: user.id }, data: { campus: 'UTSG' } })

    const app = await getApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(user),
      payload: { name: 'Renamed' },
    })
    expect(res.json()).toMatchObject({ name: 'Renamed', campus: 'UTSG' })
  })
})
