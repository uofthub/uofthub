import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * The file preview endpoint the in-app viewer reads.
 *
 * Everything here stops before storage is touched — visibility, a missing
 * file, an unsupported type — which is deliberate: those are the checks that
 * decide who gets a signed URL at all, and they are the ones worth pinning
 * down without an R2 bucket in the loop.
 */

async function addFile(projectId: string, name: string) {
  return db.projectFile.create({
    data: { projectId, name, storageKey: `projects/${projectId}/${name}`, sizeBytes: 1024 },
  })
}

describe('GET /projects/:id/files/:fileId/preview', () => {
  it('hides a private project’s file from a stranger', async () => {
    const owner = await createUser()
    const stranger = await createUser()
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })
    const file = await addFile(project.id, 'notes.md')

    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/files/${file.id}/preview`,
      cookies: await cookieFor(stranger),
    })

    expect(res.statusCode).toBe(404)
  })

  it('404s on a file belonging to a different project', async () => {
    const owner = await createUser()
    const mine = await createProject(owner.id, { visibility: 'PUBLIC' })
    const theirs = await createProject(owner.id, { visibility: 'PUBLIC' })
    const file = await addFile(theirs.id, 'report.pdf')

    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: `/projects/${mine.id}/files/${file.id}/preview` })

    expect(res.statusCode).toBe(404)
  })

  it('refuses a type no browser can render, rather than handing back a URL', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    const file = await addFile(project.id, 'source.zip')

    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: `/projects/${project.id}/files/${file.id}/preview` })

    expect(res.statusCode).toBe(415)
  })
})
