import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Readable } from 'node:stream'

// Uploads are streamed into this instead of a bucket, so a test can see what
// was stored, as what, and that nothing was stored at all when it is refused.
const stored = vi.hoisted(() => new Map<string, { bytes: Buffer; type: string }>())
vi.mock('../lib/storage.js', async (original) => ({
  ...(await original<object>()),
  objectKey: (projectId: string, name: string) => `projects/${projectId}/${name}`,
  putObjectStream: async (key: string, body: Readable, type: string) => {
    const chunks: Buffer[] = []
    for await (const chunk of body) chunks.push(chunk as Buffer)
    stored.set(key, { bytes: Buffer.concat(chunks), type })
  },
  deleteObject: async (key: string) => {
    stored.delete(key)
  },
  deleteObjects: async (keys: (string | null | undefined)[]) => {
    for (const key of keys) if (key) stored.delete(key)
  },
}))

import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
  stored.clear()
})

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
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${mine.id}/files/${file.id}/preview`,
    })

    expect(res.statusCode).toBe(404)
  })

  it('refuses a type no browser can render, rather than handing back a URL', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    const file = await addFile(project.id, 'source.zip')

    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/files/${file.id}/preview`,
    })

    expect(res.statusCode).toBe(415)
  })
})

describe('POST /projects/:id/files', () => {
  // The smallest valid PNG.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  )

  async function upload(
    projectId: string,
    user: { id: string; email: string },
    filename: string,
    bytes: Buffer,
    claimed = 'text/html'
  ) {
    const boundary = '----uofthub-test'
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
          `Content-Type: ${claimed}\r\n\r\n`
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const app = await getApp()
    return app.inject({
      method: 'POST',
      url: `/projects/${projectId}/files`,
      payload,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      cookies: await cookieFor(user),
    })
  }

  it('refuses the macro-capable legacy Office formats', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    const ole2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(64).fill(0)])
    for (const name of ['report.doc', 'sheet.xls', 'deck.ppt']) {
      const res = await upload(project.id, owner, name, ole2, 'application/msword')
      expect(res.statusCode, name).toBe(400)
    }
    expect(stored.size).toBe(0)
  })

  it('stops an owner at the storage ceiling, and stores nothing past it', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    const other = await createProject(owner.id)
    // Counted across every project the owner has.
    await db.projectFile.create({
      data: { projectId: other.id, name: 'big.mp4', storageKey: 'k', sizeBytes: 1000 },
    })
    process.env.STORAGE_QUOTA_BYTES = String(1000 + PNG.length - 1)
    try {
      const res = await upload(project.id, owner, 'photo.png', PNG)
      expect(res.statusCode).toBe(413)
      expect(stored.size).toBe(0)
    } finally {
      delete process.env.STORAGE_QUOTA_BYTES
    }
  })

  it('never lets uploads that start together pass the file limit', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    await db.projectFile.createMany({
      data: Array.from({ length: 19 }, (_, i) => ({
        projectId: project.id,
        name: `f${i}.txt`,
        storageKey: `k${i}`,
        sizeBytes: 1,
      })),
    })
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => upload(project.id, owner, `p${i}.png`, PNG))
    )
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1)
    expect(await db.projectFile.count({ where: { projectId: project.id } })).toBe(20)
    // The refused ones' bytes do not linger in storage.
    expect(stored.size).toBe(1)
  })

  it('stores a real image as what it is, whatever the browser claimed', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    const res = await upload(project.id, owner, 'photo.png', PNG, 'text/html')

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({
      name: 'photo.png',
      sizeBytes: PNG.length,
      mimeType: 'image/png',
    })
    expect([...stored.values()]).toEqual([{ bytes: PNG, type: 'image/png' }])
  })

  it('refuses a renamed file before storing anything', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    const res = await upload(
      project.id,
      owner,
      'photo.png',
      Buffer.from('MZ not really a png at all')
    )

    expect(res.statusCode).toBe(400)
    expect(stored.size).toBe(0)
    expect(await db.projectFile.count()).toBe(0)
  })

  it('refuses at the file cap without reading the upload', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    await db.projectFile.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        projectId: project.id,
        name: `f${i}.txt`,
        storageKey: `k${i}`,
        sizeBytes: 1,
      })),
    })
    const res = await upload(project.id, owner, 'photo.png', PNG)
    expect(res.statusCode).toBe(400)
    expect(stored.size).toBe(0)
  })

  it('does not preview an SVG inline', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    const file = await addFile(project.id, 'logo.svg')
    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/files/${file.id}/preview`,
    })
    expect(res.statusCode).toBe(415)
  })
})
