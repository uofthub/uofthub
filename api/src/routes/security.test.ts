import { beforeEach, describe, expect, it, vi } from 'vitest'

// Event images go here instead of a bucket, so a test can see what was kept.
const stored = vi.hoisted(() => new Map<string, string>())
vi.mock('../lib/storage.js', async (original) => ({
  ...(await original<object>()),
  putObject: async (key: string, _body: Buffer, type: string) => {
    stored.set(key, type)
  },
  deleteObjects: async (keys: (string | null | undefined)[]) => {
    for (const key of keys) if (key) stored.delete(key)
  },
}))

import { db } from '../db/client.js'
import { PIN_LIMIT } from '../lib/pins.js'
import {
  cookieFor,
  createOrg,
  createProject,
  createUser,
  getApp,
  resetDb,
} from '../test/helpers.js'

/**
 * Regression tests for the security audit (SECURITY_AUDIT.md): each case is a
 * finding that was fixed, pinned so it cannot quietly come back.
 */

beforeEach(async () => {
  await resetDb()
  stored.clear()
})

type User = { id: string; email: string }

async function call(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  user?: User,
  options: { payload?: object | string | Buffer; headers?: Record<string, string> } = {}
) {
  const app = await getApp()
  return app.inject({
    method,
    url,
    ...(user && { cookies: await cookieFor(user) }),
    ...(options.payload !== undefined && { payload: options.payload }),
    ...(options.headers && { headers: options.headers }),
  })
}

describe('cross-site writes', () => {
  it('refuses a write whose Origin is not the web app', async () => {
    const me = await createUser()
    const them = await createUser()
    const res = await call('POST', `/users/${them.id}/follow`, me, {
      headers: { origin: 'https://evil.uofthub.com' },
    })
    expect(res.statusCode).toBe(403)
    expect(await db.follow.count()).toBe(0)
  })

  it('refuses a browser write marked cross-site even without an Origin', async () => {
    const me = await createUser()
    const them = await createUser()
    const res = await call('POST', `/users/${them.id}/follow`, me, {
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('lets the web app write, and reads through from anywhere', async () => {
    const me = await createUser()
    const them = await createUser()
    const write = await call('POST', `/users/${them.id}/follow`, me, {
      headers: { origin: 'http://localhost:5173' },
    })
    expect(write.statusCode).toBe(200)
    const read = await call('GET', '/auth/me', me, { headers: { origin: 'https://example.com' } })
    expect(read.statusCode).toBe(200)
  })

  it('leaves one-click unsubscribe to its token', async () => {
    const res = await call('POST', '/email/unsubscribe?token=nope.nope', undefined, {
      headers: { origin: 'https://mail.google.com' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('does not mark messages read just because a thread was fetched', async () => {
    const a = await createUser()
    const b = await createUser()
    await call('POST', `/messages/${b.id}`, a, { payload: { body: 'hi' } })
    await call('GET', `/messages/${a.id}`, b)
    expect(await db.message.count({ where: { readAt: null } })).toBe(1)
  })
})

describe('the moderator gate', () => {
  it('stops the handler, not just the status code', async () => {
    const user = await createUser()
    const target = await createUser()
    const since = new Date()
    await db.user.update({ where: { id: target.id }, data: { messagingSuspendedAt: since } })
    const res = await call('DELETE', `/admin/users/${target.id}/messaging-suspension`, user)
    expect(res.statusCode).toBe(403)
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: target.id } })).messagingSuspendedAt
    ).toEqual(since)
  })
})

describe('inputs of the wrong type', () => {
  it('answers 400, not 500, for a body that is not text', async () => {
    const a = await createUser()
    const b = await createUser()
    const project = await createProject(a.id, { visibility: 'PUBLIC' })
    for (const body of [5, ['x'], { a: 1 }]) {
      expect((await call('POST', `/messages/${b.id}`, a, { payload: { body } })).statusCode).toBe(
        400
      )
      expect(
        (await call('POST', `/projects/${project.id}/comments`, b, { payload: { body } }))
          .statusCode
      ).toBe(400)
    }
    expect(
      (await call('PATCH', `/projects/${project.id}`, a, { payload: { pitch: 5 } })).statusCode
    ).toBe(400)
    expect(
      (await call('PATCH', `/projects/${project.id}`, a, { payload: { courseCode: ['CSC'] } }))
        .statusCode
    ).toBe(400)
  })

  it('pages safely whatever skip and take say', async () => {
    for (const q of ['skip=Infinity', 'skip=1e308', 'skip=-1', 'take=2.5', 'skip=abc&take=NaN']) {
      const res = await call('GET', `/projects?${q}`)
      expect(res.statusCode, q).toBe(200)
    }
  })
})

describe('follower lists', () => {
  it('need a session, like people search', async () => {
    const a = await createUser()
    const b = await createUser()
    await db.follow.create({ data: { followerId: a.id, followingId: b.id } })
    expect((await call('GET', `/users/${b.id}/followers`)).statusCode).toBe(401)
    const signedIn = await call('GET', `/users/${b.id}/followers`, a)
    expect(signedIn.statusCode).toBe(200)
    expect(signedIn.json()).toHaveLength(1)
  })

  it('leave out anyone the viewer has blocked', async () => {
    const viewer = await createUser()
    const blocked = await createUser()
    const star = await createUser()
    await db.follow.create({ data: { followerId: blocked.id, followingId: star.id } })
    await db.userBlock.create({ data: { blockerId: viewer.id, blockedId: blocked.id } })
    expect((await call('GET', `/users/${star.id}/followers`, viewer)).json()).toHaveLength(0)
  })
})

describe('caps under concurrency', () => {
  it('never pins past the limit, however many requests arrive together', async () => {
    const owner = await createUser()
    const projects = await Promise.all(
      Array.from({ length: PIN_LIMIT + 4 }, () => createProject(owner.id, { visibility: 'PUBLIC' }))
    )
    await Promise.all(projects.map((p) => call('POST', `/projects/${p.id}/pin`, owner)))
    expect(await db.project.count({ where: { ownerId: owner.id, pinnedAt: { not: null } } })).toBe(
      PIN_LIMIT
    )
  })

  it('treats two quick saves as one, not as a 500', async () => {
    const me = await createUser()
    const project = await createProject((await createUser()).id, { visibility: 'PUBLIC' })
    const results = await Promise.all(
      [1, 2].map(() => call('POST', `/projects/${project.id}/save`, me))
    )
    expect(results.map((r) => r.statusCode)).toEqual([200, 200])
  })
})

describe('group event images', () => {
  // The smallest valid PNG.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  )
  const image = (bytes: Buffer, name = 'poster.png') => {
    const boundary = '----uofthub-test'
    return {
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
            'Content-Type: image/png\r\n\r\n'
        ),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    }
  }

  it('are uploaded and checked, never hotlinked', async () => {
    const admin = await createUser()
    await createOrg(admin.id, { slug: 'robots' })
    const posted = await call('POST', '/orgs/robots/activities', admin, {
      payload: { title: 'Kickoff', imageUrl: 'https://tracker.example/pixel.png' },
    })
    expect(posted.statusCode).toBe(201)
    expect(posted.json().imageUrl).toBeNull()
    const id = posted.json().id

    const svg = await call(
      'PUT',
      `/orgs/robots/activities/${id}/image`,
      admin,
      image(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg')
    )
    expect(svg.statusCode).toBe(400)

    const res = await call('PUT', `/orgs/robots/activities/${id}/image`, admin, image(PNG))
    expect(res.statusCode).toBe(200)
    expect([...stored.values()]).toEqual(['image/png'])
    expect(res.json().imageUrl).toMatch(/^http/)
    expect(res.json()).not.toHaveProperty('imageKey')
  })

  it('may only be set by the event’s author or the group’s admins', async () => {
    const admin = await createUser()
    const stranger = await createUser()
    await createOrg(admin.id, { slug: 'robots' })
    const { id } = (
      await call('POST', '/orgs/robots/activities', admin, { payload: { title: 'Kickoff' } })
    ).json()
    const res = await call('PUT', `/orgs/robots/activities/${id}/image`, stranger, image(PNG))
    expect(res.statusCode).toBe(403)
    expect(stored.size).toBe(0)
  })
})
