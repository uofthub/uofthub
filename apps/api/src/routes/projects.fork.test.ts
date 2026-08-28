import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

async function fork(projectId: string, user: { id: string; email: string }) {
  const app = await getApp()
  return app.inject({
    method: 'POST',
    url: `/projects/${projectId}/fork`,
    cookies: await cookieFor(user),
    payload: {},
  })
}

describe('POST /projects/:id/fork', () => {
  it('copies title, description, tags and links into a private project', async () => {
    const owner = await createUser()
    const forker = await createUser()
    const original = await db.project.create({
      data: {
        ownerId: owner.id,
        title: 'Solar car telemetry',
        description: 'Live dashboard',
        tags: ['ECE297', 'hardware'],
        visibility: 'PUBLIC',
        links: { create: [{ label: 'GitHub', url: 'https://github.com/example/repo' }] },
      },
    })

    const res = await fork(original.id, forker)
    expect(res.statusCode).toBe(201)

    const body = res.json()
    expect(body.title).toBe('Solar car telemetry (fork)')
    expect(body.description).toBe('Live dashboard')
    expect(body.tags).toEqual(['ECE297', 'hardware'])
    expect(body.ownerId).toBe(forker.id)
    expect(body.forkedFromId).toBe(original.id)
    // A fork of a public project must not itself start public — the forker
    // never chose to publish anything.
    expect(body.visibility).toBe('PRIVATE')
    expect(body.links).toHaveLength(1)
    expect(body.links[0].url).toBe('https://github.com/example/repo')
  })

  it('leaves the original untouched', async () => {
    const owner = await createUser()
    const forker = await createUser()
    const original = await createProject(owner.id, { visibility: 'UOFT', title: 'Original' })

    await fork(original.id, forker)

    const after = await db.project.findUnique({ where: { id: original.id } })
    expect(after?.title).toBe('Original')
    expect(after?.ownerId).toBe(owner.id)
    expect(after?.visibility).toBe('UOFT')
  })

  it('404s a private project the forker cannot see, without confirming it exists', async () => {
    const owner = await createUser()
    const stranger = await createUser()
    const secret = await createProject(owner.id, { visibility: 'PRIVATE' })

    const res = await fork(secret.id, stranger)
    expect(res.statusCode).toBe(404)
    expect(await db.project.count()).toBe(1)
  })

  it('lets an accepted collaborator fork a private project', async () => {
    const owner = await createUser()
    const collaborator = await createUser()
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })
    await db.projectCollaborator.create({
      data: { projectId: project.id, userId: collaborator.id, accepted: true },
    })

    const res = await fork(project.id, collaborator)
    expect(res.statusCode).toBe(201)
    expect(res.json().ownerId).toBe(collaborator.id)
  })

  it('refuses to fork a taken-down project', async () => {
    // Otherwise the copy comes back with a clean takenDownAt and the
    // moderation decision is one click from being undone.
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })
    await db.project.update({ where: { id: project.id }, data: { takenDownAt: new Date() } })

    const res = await fork(project.id, owner)
    expect(res.statusCode).toBe(403)
    expect(await db.project.count()).toBe(1)
  })

  it('rejects an anonymous forker', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    const app = await getApp()

    const res = await app.inject({ method: 'POST', url: `/projects/${project.id}/fork`, payload: {} })
    expect(res.statusCode).toBe(401)
  })
})
