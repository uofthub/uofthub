import { beforeEach, describe, expect, it, vi } from 'vitest'

// Storage is not configured for tests. Signing returns the key it was given,
// so a test can see which object a cover or thumbnail came from.
const storage = vi.hoisted(() => ({
  putObject: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  signedDownloadUrl: vi.fn(async (key: string) => `signed:${key}`),
  getObjectHead: vi.fn(),
  objectKey: vi.fn((projectId: string, name: string) => `projects/${projectId}/${name}`),
}))
vi.mock('../lib/storage.js', () => storage)

import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
  vi.clearAllMocks()
})

type User = { id: string; email: string }

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  user?: User,
  payload?: unknown
) {
  const app = await getApp()
  return app.inject({
    method,
    url,
    ...(user ? { cookies: await cookieFor(user) } : {}),
    ...(payload !== undefined ? { payload: payload as object } : {}),
  })
}

// The smallest valid PNG: enough for the byte check to recognise it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

async function upload(url: string, user: User, bytes: Buffer, filename = 'thumb.png') {
  const boundary = '----uofthub-test'
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const app = await getApp()
  return app.inject({
    method: 'PUT',
    url,
    payload,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    cookies: await cookieFor(user),
  })
}

const addFile = (projectId: string, name: string) =>
  db.projectFile.create({
    data: { projectId, name, storageKey: `projects/${projectId}/${name}`, sizeBytes: 1024 },
  })

async function seed() {
  const owner = await createUser()
  const project = await createProject(owner.id, { visibility: 'PUBLIC' })
  const poster = await addFile(project.id, 'poster.pdf')
  const photo = await addFile(project.id, 'photo.jpg')
  return { owner, project, poster, photo }
}

type Output = { id: string; kind: string; primary: boolean; thumbnailUrl?: string }
const outputsOf = async (projectId: string, user?: User) =>
  (await call('GET', `/projects/${projectId}`, user)).json().outputs as Output[]

describe('saving outputs', () => {
  it('stores them in order over the project’s files and links, one primary', async () => {
    const { owner, project, poster } = await seed()
    const res = await call('PATCH', `/projects/${project.id}`, owner, {
      outputs: [
        { kind: 'POSTER', fileId: poster.id, primary: true },
        { kind: 'VIDEO', label: 'Talk', link: { label: 'Talk', url: 'https://youtu.be/abc' } },
      ],
    })
    expect(res.statusCode).toBe(200)
    const outputs = res.json().outputs
    expect(outputs.map((o: Output & { label: string | null }) => [o.kind, o.label, o.primary])).toEqual([
      ['POSTER', null, true],
      ['VIDEO', 'Talk', false],
    ])
    // The new link is a link of the project like any other.
    expect(await db.projectLink.count({ where: { projectId: project.id } })).toBe(1)
    expect(outputs[0]).not.toHaveProperty('thumbnailKey')
  })

  it('keeps an output’s thumbnail through a reorder, and drops it when its target changes', async () => {
    const { owner, project, poster, photo } = await seed()
    const [first] = (
      await call('PATCH', `/projects/${project.id}`, owner, {
        outputs: [{ kind: 'POSTER', fileId: poster.id, primary: true }],
      })
    ).json().outputs
    await upload(`/projects/${project.id}/outputs/${first.id}/thumbnail`, owner, PNG)
    const key = (await db.projectOutput.findUniqueOrThrow({ where: { id: first.id } })).thumbnailKey

    await call('PATCH', `/projects/${project.id}`, owner, {
      outputs: [
        { kind: 'OTHER', fileId: photo.id },
        { id: first.id, kind: 'POSTER', fileId: poster.id, primary: true },
      ],
    })
    let row = await db.projectOutput.findUniqueOrThrow({ where: { id: first.id } })
    expect(row.position).toBe(1)
    expect(row.thumbnailKey).toBe(key)
    expect(storage.deleteObject).not.toHaveBeenCalledWith(key)

    await call('PATCH', `/projects/${project.id}`, owner, {
      outputs: [{ id: first.id, kind: 'POSTER', fileId: photo.id, primary: true }],
    })
    row = await db.projectOutput.findUniqueOrThrow({ where: { id: first.id } })
    expect(row.thumbnailKey).toBeNull()
    expect(storage.deleteObject).toHaveBeenCalledWith(key)
  })

  it('removes an output without removing its file', async () => {
    const { owner, project, poster } = await seed()
    await call('PATCH', `/projects/${project.id}`, owner, {
      outputs: [{ kind: 'POSTER', fileId: poster.id }],
    })
    await call('PATCH', `/projects/${project.id}`, owner, { outputs: [] })
    expect(await db.projectOutput.count()).toBe(0)
    expect(await db.projectFile.count({ where: { id: poster.id } })).toBe(1)
  })

  it('refuses another project’s file, two primaries, one file twice, or an unsafe link', async () => {
    const { owner, project, poster, photo } = await seed()
    const other = await createProject(owner.id)
    const theirs = await addFile(other.id, 'theirs.pdf')
    const refused = async (outputs: unknown[]) =>
      (await call('PATCH', `/projects/${project.id}`, owner, { title: 'Changed', outputs }))
        .statusCode

    expect(await refused([{ kind: 'POSTER', fileId: theirs.id }])).toBe(400)
    expect(
      await refused([
        { kind: 'POSTER', fileId: poster.id, primary: true },
        { kind: 'OTHER', fileId: photo.id, primary: true },
      ])
    ).toBe(400)
    expect(
      await refused([
        { kind: 'POSTER', fileId: poster.id },
        { kind: 'PAPER', fileId: poster.id },
      ])
    ).toBe(400)
    expect(await refused([{ kind: 'DEMO', link: { url: 'javascript:alert(1)' } }])).toBe(400)
    // Nothing from a refused save was applied.
    expect((await db.project.findUniqueOrThrow({ where: { id: project.id } })).title).not.toBe(
      'Changed'
    )
  })

  it('goes when its file is deleted, taking its thumbnail with it', async () => {
    const { owner, project, poster } = await seed()
    const [output] = (
      await call('PATCH', `/projects/${project.id}`, owner, {
        outputs: [{ kind: 'POSTER', fileId: poster.id, primary: true }],
      })
    ).json().outputs
    await upload(`/projects/${project.id}/outputs/${output.id}/thumbnail`, owner, PNG)
    const { thumbnailKey } = await db.projectOutput.findUniqueOrThrow({ where: { id: output.id } })

    await call('DELETE', `/projects/${project.id}/files/${poster.id}`, owner)
    expect(await db.projectOutput.count()).toBe(0)
    expect(storage.deleteObject).toHaveBeenCalledWith(thumbnailKey)
  })
})

describe('output thumbnails', () => {
  it('accept a small raster image from the owner and replace the old one', async () => {
    const { owner, project, poster } = await seed()
    const [output] = (
      await call('PATCH', `/projects/${project.id}`, owner, {
        outputs: [{ kind: 'POSTER', fileId: poster.id }],
      })
    ).json().outputs
    const url = `/projects/${project.id}/outputs/${output.id}/thumbnail`

    const first = await upload(url, owner, PNG)
    expect(first.statusCode).toBe(200)
    const firstKey = (await db.projectOutput.findUniqueOrThrow({ where: { id: output.id } }))
      .thumbnailKey!
    expect(firstKey).toMatch(new RegExp(`^projects/${project.id}/thumbs/${output.id}-.+\\.png$`))

    await upload(url, owner, PNG)
    expect(storage.deleteObject).toHaveBeenCalledWith(firstKey)
    expect((await outputsOf(project.id))[0].thumbnailUrl).toMatch(/^signed:projects\//)
  })

  it('refuse what is not a raster image, or too large', async () => {
    const { owner, project, poster } = await seed()
    const [output] = (
      await call('PATCH', `/projects/${project.id}`, owner, {
        outputs: [{ kind: 'POSTER', fileId: poster.id }],
      })
    ).json().outputs
    const url = `/projects/${project.id}/outputs/${output.id}/thumbnail`

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    expect((await upload(url, owner, svg, 'thumb.svg')).statusCode).toBe(400)
    expect((await upload(url, owner, Buffer.from('hello'), 'thumb.png')).statusCode).toBe(400)
    const huge = Buffer.concat([PNG, Buffer.alloc(600 * 1024)])
    expect((await upload(url, owner, huge)).statusCode).toBe(413)
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it('are the owner’s alone to set', async () => {
    const { owner, project, poster } = await seed()
    const stranger = await createUser()
    const [output] = (
      await call('PATCH', `/projects/${project.id}`, owner, {
        outputs: [{ kind: 'POSTER', fileId: poster.id }],
      })
    ).json().outputs
    const url = `/projects/${project.id}/outputs/${output.id}/thumbnail`
    expect((await upload(url, stranger, PNG)).statusCode).toBe(403)
    expect((await call('DELETE', url, stranger)).statusCode).toBe(403)
    const unknown = `/projects/${project.id}/outputs/00000000-0000-4000-8000-000000000000/thumbnail`
    expect((await upload(unknown, owner, PNG)).statusCode).toBe(404)
  })
})

describe('a project’s cover', () => {
  const coverOf = async (projectId: string) => {
    const rows = (await call('GET', '/projects')).json() as { id: string; coverUrl?: string }[]
    return rows.find((r) => r.id === projectId)?.coverUrl
  }

  it('is the first uploaded image when there is no primary output', async () => {
    const { project } = await seed()
    expect(await coverOf(project.id)).toBe(`signed:projects/${project.id}/photo.jpg`)
  })

  it('is the primary output’s thumbnail when it has one', async () => {
    const { owner, project, poster } = await seed()
    const [output] = (
      await call('PATCH', `/projects/${project.id}`, owner, {
        outputs: [{ kind: 'POSTER', fileId: poster.id, primary: true }],
      })
    ).json().outputs
    // A PDF with no thumbnail yet: the first image still stands in.
    expect(await coverOf(project.id)).toBe(`signed:projects/${project.id}/photo.jpg`)

    await upload(`/projects/${project.id}/outputs/${output.id}/thumbnail`, owner, PNG)
    expect(await coverOf(project.id)).toMatch(new RegExp(`^signed:projects/${project.id}/thumbs/`))
  })

  it('is the primary output’s own image when that is what it is', async () => {
    const { owner, project, poster } = await seed()
    const board = await addFile(project.id, 'board.png')
    await call('PATCH', `/projects/${project.id}`, owner, {
      outputs: [
        { kind: 'POSTER', fileId: poster.id },
        { kind: 'OTHER', fileId: board.id, primary: true },
      ],
    })
    expect(await coverOf(project.id)).toBe(`signed:projects/${project.id}/board.png`)
  })
})
