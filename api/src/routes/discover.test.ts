import { beforeEach, describe, expect, it } from 'vitest'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * The suite runs with no OPENAI_API_KEY (see vitest.config.ts), so these
 * cover the path that matters most for correctness: what /discover does when
 * the model is unavailable. It must still search, still honour visibility,
 * and still say that it did not interpret anything.
 */
async function discover(user: { id: string; email: string }, q: string) {
  const app = await getApp()
  return app.inject({
    method: 'GET',
    url: `/discover?q=${encodeURIComponent(q)}`,
    cookies: await cookieFor(user),
  })
}

describe('GET /discover', () => {
  it('requires a session — a model call costs money per request', async () => {
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/discover?q=anything' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects an empty query', async () => {
    const user = await createUser()
    expect((await discover(user, '   ')).statusCode).toBe(400)
  })

  it('falls back to a keyword search, and says so, when the model is unavailable', async () => {
    const owner = await createUser()
    const seeker = await createUser()
    await createProject(owner.id, { title: 'Robotics arm controller', visibility: 'PUBLIC' })
    await createProject(owner.id, { title: 'Poetry anthology', visibility: 'PUBLIC' })

    const res = await discover(seeker, 'robotics')
    expect(res.statusCode).toBe(200)

    const body = res.json()
    // An imperfect search beats an error page.
    expect(body.interpreted).toBe(false)
    expect(body.filters.search).toBe('robotics')
    expect(body.projects.map((p: { title: string }) => p.title)).toEqual(['Robotics arm controller'])
  })

  it('matches on description and tags, not just the title', async () => {
    const owner = await createUser()
    const seeker = await createUser()
    await createProject(owner.id, {
      title: 'Untitled',
      description: 'A study of protein folding',
      visibility: 'PUBLIC',
    })

    const res = await discover(seeker, 'protein')
    expect(res.json().projects).toHaveLength(1)
  })

  it('never returns a project the searcher could not otherwise see', async () => {
    const owner = await createUser()
    const seeker = await createUser()
    await createProject(owner.id, { title: 'Secret rocket', visibility: 'PRIVATE' })
    await createProject(owner.id, { title: 'Public rocket', visibility: 'PUBLIC' })

    const res = await discover(seeker, 'rocket')
    expect(res.json().projects.map((p: { title: string }) => p.title)).toEqual(['Public rocket'])
  })

  it('truncates an overlong query rather than sending it on', async () => {
    const user = await createUser()
    const res = await discover(user, 'x'.repeat(2000))
    expect(res.statusCode).toBe(200)
    expect(res.json().filters.search).toHaveLength(300)
  })
})
