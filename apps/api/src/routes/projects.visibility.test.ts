import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/** Owner with one project at each visibility level, plus the two onlookers. */
async function seed() {
  const owner = await createUser()
  const stranger = await createUser()
  const collaborator = await createUser()

  const publicProject = await createProject(owner.id, { title: 'public', visibility: 'PUBLIC' })
  const uoftProject = await createProject(owner.id, { title: 'uoft', visibility: 'UOFT' })
  const privateProject = await createProject(owner.id, { title: 'private', visibility: 'PRIVATE' })

  await db.projectCollaborator.create({
    data: { projectId: privateProject.id, userId: collaborator.id, accepted: true },
  })

  return { owner, stranger, collaborator, publicProject, uoftProject, privateProject }
}

const titles = (res: { json: () => { title: string }[] }) => res.json().map((p) => p.title).sort()

describe('GET /projects', () => {
  it('shows a signed-out visitor public projects only', async () => {
    await seed()
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/projects' })
    expect(titles(res)).toEqual(['public'])
  })

  it('shows any signed-in student both public and U of T projects', async () => {
    const { stranger } = await seed()
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/projects', cookies: await cookieFor(stranger) })
    expect(titles(res)).toEqual(['public', 'uoft'])
  })

  it('shows the owner their own private project too', async () => {
    const { owner } = await seed()
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/projects', cookies: await cookieFor(owner) })
    expect(titles(res)).toEqual(['private', 'public', 'uoft'])
  })

  it('shows an accepted collaborator the private project they were added to', async () => {
    const { collaborator } = await seed()
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/projects', cookies: await cookieFor(collaborator) })
    expect(titles(res)).toEqual(['private', 'public', 'uoft'])
  })

  it('does not show a pending collaborator the private project', async () => {
    const { privateProject } = await seed()
    const invitee = await createUser()
    await db.projectCollaborator.create({
      data: { projectId: privateProject.id, userId: invitee.id, accepted: false },
    })

    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/projects', cookies: await cookieFor(invitee) })
    expect(titles(res)).toEqual(['public', 'uoft'])
  })

  it('keeps the visibility filter when a search term is also given', async () => {
    // The two clauses are AND-composed; spreading one over the other would
    // silently drop the visibility half and leak private rows.
    const { owner, stranger } = await seed()
    await createProject(owner.id, { title: 'secret sauce', visibility: 'PRIVATE' })

    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: '/projects?search=secret',
      cookies: await cookieFor(stranger),
    })
    expect(res.json()).toEqual([])
  })
})

describe('GET /projects/:id', () => {
  it('404s a private project for a stranger rather than 403ing', async () => {
    const { privateProject, stranger } = await seed()
    const app = await getApp()

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${privateProject.id}`,
      cookies: await cookieFor(stranger),
    })
    // 403 would confirm the id exists.
    expect(res.statusCode).toBe(404)
  })

  it('serves it to the owner and the accepted collaborator', async () => {
    const { privateProject, owner, collaborator } = await seed()
    const app = await getApp()

    for (const user of [owner, collaborator]) {
      const res = await app.inject({
        method: 'GET',
        url: `/projects/${privateProject.id}`,
        cookies: await cookieFor(user),
      })
      expect(res.statusCode).toBe(200)
    }
  })

  it('counts a view for a visitor but not for the owner', async () => {
    const { publicProject, owner, stranger } = await seed()
    const app = await getApp()

    await app.inject({ method: 'GET', url: `/projects/${publicProject.id}`, cookies: await cookieFor(owner) })
    expect((await db.project.findUnique({ where: { id: publicProject.id } }))?.viewCount).toBe(0)

    await app.inject({ method: 'GET', url: `/projects/${publicProject.id}`, cookies: await cookieFor(stranger) })
    expect((await db.project.findUnique({ where: { id: publicProject.id } }))?.viewCount).toBe(1)
  })
})
