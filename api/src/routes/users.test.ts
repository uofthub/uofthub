import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * Profiles, the projects listed on them, and following. Campus is covered
 * separately in campus.test.ts.
 */

describe('GET /users/:id', () => {
  it('returns a public profile to a signed-out visitor', async () => {
    const user = await createUser({ name: 'Ada' })
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: `/users/${user.id}` })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: user.id, name: 'Ada' })
  })

  it('never exposes the email or password hash on a public profile', async () => {
    const user = await createUser()
    await db.user.update({ where: { id: user.id }, data: { passwordHash: 'scrypt$fake' } })

    const app = await getApp()
    const body = (await app.inject({ method: 'GET', url: `/users/${user.id}` })).json()

    expect(body).not.toHaveProperty('email')
    expect(body).not.toHaveProperty('passwordHash')
  })

  it('404s on an unknown id', async () => {
    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: '/users/00000000-0000-0000-0000-000000000000',
    })
    expect(res.statusCode).toBe(404)
  })

  it('counts the projects this viewer can see, followers and following', async () => {
    const user = await createUser()
    const other = await createUser()
    await createProject(user.id, { visibility: 'PUBLIC' })
    await createProject(user.id, { visibility: 'UOFT' })
    await createProject(user.id) // a draft
    await db.follow.create({ data: { followerId: other.id, followingId: user.id } })

    const app = await getApp()
    const get = async (as?: { id: string; email: string }) =>
      (
        await app.inject({
          method: 'GET',
          url: `/users/${user.id}`,
          ...(as && { cookies: await cookieFor(as) }),
        })
      ).json()

    expect((await get())._count).toMatchObject({ ownedProjects: 1, followers: 1, following: 0 })
    expect((await get(other))._count.ownedProjects).toBe(2)
    expect((await get(user))._count.ownedProjects).toBe(3)
  })

  it('lists followers and following', async () => {
    const user = await createUser({ name: 'Centre' })
    const fan = await createUser({ name: 'Fan' })
    await db.follow.create({ data: { followerId: fan.id, followingId: user.id } })
    const app = await getApp()
    // Signed in: the lists are not for browsing signed out (see the route).
    const cookies = await cookieFor(user)
    const followers = (
      await app.inject({ method: 'GET', url: `/users/${user.id}/followers`, cookies })
    ).json()
    const following = (
      await app.inject({ method: 'GET', url: `/users/${fan.id}/following`, cookies })
    ).json()
    expect(followers.map((p: { name: string }) => p.name)).toEqual(['Fan'])
    expect(following.map((p: { name: string }) => p.name)).toEqual(['Centre'])
  })
})

describe('GET /users/:id/projects', () => {
  it('honours project visibility rather than listing everything the user owns', async () => {
    const owner = await createUser()
    await createProject(owner.id, { title: 'public', visibility: 'PUBLIC' })
    await createProject(owner.id, { title: 'uoft', visibility: 'UOFT' })
    await createProject(owner.id, { title: 'private', visibility: 'PRIVATE' })

    const app = await getApp()
    const titles = async (cookies?: { token: string }) =>
      (await app.inject({ method: 'GET', url: `/users/${owner.id}/projects`, cookies }))
        .json()
        .map((p: { title: string }) => p.title)
        .sort()

    expect(await titles()).toEqual(['public'])
    expect(await titles(await cookieFor(await createUser()))).toEqual(['public', 'uoft'])
    expect(await titles(await cookieFor(owner))).toEqual(['private', 'public', 'uoft'])
  })
})

describe('PATCH /users/me', () => {
  it('refuses a caller with no session', async () => {
    const app = await getApp()
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { name: 'X' } })
    expect(res.statusCode).toBe(401)
  })

  it('updates only the fields sent', async () => {
    const user = await createUser({ name: 'Before' })
    await db.user.update({ where: { id: user.id }, data: { program: 'CS', bio: 'Hello' } })

    const app = await getApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(user),
      payload: { name: 'After' },
    })

    expect(res.json()).toMatchObject({ name: 'After', program: 'CS', bio: 'Hello' })
  })

  it('trims the name', async () => {
    const user = await createUser()
    const app = await getApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(user),
      payload: { name: '  Ada  ' },
    })
    expect(res.json().name).toBe('Ada')
  })

  it('cannot be used to grant itself moderator', async () => {
    const user = await createUser()
    const app = await getApp()
    await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(user),
      payload: { name: 'Ada', isAdmin: true },
    })

    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).isAdmin).toBe(false)
  })

  it('cannot be used to change its own email', async () => {
    const user = await createUser({ email: 'real@mail.utoronto.ca' })
    const app = await getApp()
    await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(user),
      payload: { email: 'someone.else@mail.utoronto.ca' },
    })

    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(
      'real@mail.utoronto.ca'
    )
  })
})

describe('POST /users/:id/follow', () => {
  it('toggles, rather than duplicating on a second call', async () => {
    const me = await createUser()
    const them = await createUser()
    const app = await getApp()
    const cookies = await cookieFor(me)
    const toggle = () => app.inject({ method: 'POST', url: `/users/${them.id}/follow`, cookies })

    expect((await toggle()).json()).toEqual({ following: true })
    expect(await db.follow.count()).toBe(1)
    expect((await toggle()).json()).toEqual({ following: false })
    expect(await db.follow.count()).toBe(0)
  })

  it('refuses to follow yourself', async () => {
    const me = await createUser()
    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: `/users/${me.id}/follow`,
      cookies: await cookieFor(me),
    })
    expect(res.statusCode).toBe(400)
  })

  it('404s on an unknown user instead of failing the foreign key', async () => {
    const me = await createUser()
    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: '/users/00000000-0000-0000-0000-000000000000/follow',
      cookies: await cookieFor(me),
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('PATCH /users/me — limits', () => {
  it('clears a bio with an empty string and refuses one that is too long', async () => {
    const me = await createUser()
    await db.user.update({ where: { id: me.id }, data: { bio: 'Hello' } })
    const app = await getApp()
    const cookies = await cookieFor(me)
    const patch = (payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: '/users/me', cookies, payload })

    expect((await patch({ bio: '' })).json().bio).toBeNull()
    expect((await patch({ bio: 'x'.repeat(501) })).statusCode).toBe(400)
    expect((await patch({ name: 'x'.repeat(81) })).statusCode).toBe(400)
    expect((await patch({ classYear: 'soon' })).statusCode).toBe(400)
    expect((await patch({ classYear: null })).json().classYear).toBeNull()
  })

  it('does not accept an avatar URL — avatars are uploaded', async () => {
    const me = await createUser()
    const app = await getApp()
    await app.inject({
      method: 'PATCH',
      url: '/users/me',
      cookies: await cookieFor(me),
      payload: { avatarUrl: 'https://tracker.example/pixel.gif' },
    })
    expect((await db.user.findUniqueOrThrow({ where: { id: me.id } })).avatarUrl).toBeNull()
  })
})

describe('DELETE /users/me', () => {
  it('needs the email typed back, then deletes the account and what it owns', async () => {
    const me = await createUser()
    const other = await createUser()
    const mine = await createProject(me.id, { visibility: 'PUBLIC' })
    const theirs = await createProject(other.id, { visibility: 'PUBLIC' })
    await db.comment.create({ data: { projectId: theirs.id, userId: me.id, body: 'hi' } })
    const app = await getApp()
    const cookies = await cookieFor(me)

    const wrong = await app.inject({
      method: 'DELETE',
      url: '/users/me',
      cookies,
      payload: { confirmEmail: 'nope' },
    })
    expect(wrong.statusCode).toBe(400)

    const res = await app.inject({
      method: 'DELETE',
      url: '/users/me',
      cookies,
      payload: { confirmEmail: me.email.toUpperCase() },
    })
    expect(res.statusCode).toBe(200)
    expect(await db.user.findUnique({ where: { id: me.id } })).toBeNull()
    expect(await db.project.findUnique({ where: { id: mine.id } })).toBeNull()
    expect(await db.comment.count()).toBe(0)
    expect(await db.project.findUnique({ where: { id: theirs.id } })).not.toBeNull()
    // The old session is worthless now.
    expect((await app.inject({ method: 'GET', url: '/auth/me', cookies })).statusCode).toBe(401)
  })
})

describe('GET /users/me/export', () => {
  it('downloads the caller’s own data, without the password hash', async () => {
    const me = await createUser()
    await createProject(me.id, { title: 'Mine' })
    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: '/users/me/export',
      cookies: await cookieFor(me),
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.json().projects.map((p: { title: string }) => p.title)).toEqual(['Mine'])
    expect(JSON.stringify(res.json())).not.toContain('passwordHash')
  })
})
