import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The bucket, as a map: what is stored, and what was copied where.
const objects = vi.hoisted(() => new Map<string, Buffer>())
vi.mock('./storage.js', async (original) => ({
  ...(await original<object>()),
  getObjectHead: async (key: string) => {
    const body = objects.get(key)
    if (!body) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
    return body
  },
  copyObject: async (from: string, to: string) => {
    objects.set(to, objects.get(from)!)
  },
  deleteObjects: async (keys: (string | null | undefined)[]) => {
    for (const key of keys) if (key) objects.delete(key)
  },
}))

import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'
import { queueScan, runScanSweep, type Detection } from './imageScan.js'

/** What the fake scanner says about the next images, in order. */
let answers: (Detection[] | number)[] = []
const scanner = vi.fn(async () => {
  const next = answers.shift() ?? []
  if (typeof next === 'number') return new Response('', { status: next })
  return Response.json({ detections: next })
})

const NUDE: Detection[] = [{ class: 'FEMALE_BREAST_EXPOSED', score: 0.9 }]

beforeEach(async () => {
  await resetDb()
  objects.clear()
  answers = []
  scanner.mockClear()
  vi.stubGlobal('fetch', scanner)
  vi.stubEnv('SCANNER_URL', 'https://scanner.test')
  vi.stubEnv('SCANNER_TOKEN', 'token')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function avatar() {
  const user = await createUser()
  const key = `avatars/${user.id}.png`
  objects.set(key, Buffer.from('png'))
  await db.user.update({
    where: { id: user.id },
    data: { avatarKey: key, avatarUrl: 'u', avatarIsCustom: false },
  })
  await queueScan(key, 'AVATAR', user.id)
  return { user, key }
}

async function imageFile() {
  const owner = await createUser()
  const project = await createProject(owner.id, { visibility: 'PUBLIC' })
  const key = `projects/${project.id}/photo.jpg`
  objects.set(key, Buffer.from('jpg'))
  await db.projectFile.create({
    data: { projectId: project.id, name: 'photo.jpg', storageKey: key, sizeBytes: 3 },
  })
  await queueScan(key, 'PROJECT_FILE', project.id)
  return { owner, project, key }
}

const scanOf = (key: string) => db.imageScan.findUniqueOrThrow({ where: { key } })

describe('the scan sweep', () => {
  it('sends the image with the token, and marks a clean one clean', async () => {
    const { key } = await avatar()
    answers = [[{ class: 'FACE_FEMALE', score: 0.9 }]]
    await runScanSweep()
    expect(scanner).toHaveBeenCalledWith('https://scanner.test/scan', expect.anything())
    const init = scanner.mock.calls[0] as unknown as [string, RequestInit]
    expect((init[1].headers as Record<string, string>).authorization).toBe('Bearer token')
    expect((await scanOf(key)).status).toBe('CLEAN')
    expect(await db.report.count()).toBe(0)
  })

  it('copes with a scanner URL that ends in a slash', async () => {
    vi.stubEnv('SCANNER_URL', 'https://scanner.test/')
    await avatar()
    await runScanSweep()
    expect(scanner).toHaveBeenCalledWith('https://scanner.test/scan', expect.anything())
  })

  it('ignores a nudity label under the threshold', async () => {
    const { key } = await avatar()
    answers = [[{ class: 'FEMALE_BREAST_EXPOSED', score: 0.3 }]]
    await runScanSweep()
    expect((await scanOf(key)).status).toBe('CLEAN')
  })

  it('does nothing while the scanner is not configured', async () => {
    vi.stubEnv('SCANNER_URL', '')
    const { key } = await avatar()
    await runScanSweep()
    expect(scanner).not.toHaveBeenCalled()
    expect((await scanOf(key)).status).toBe('PENDING')
  })

  it('leaves the queue for the next pass when the scanner is asleep', async () => {
    const { key } = await avatar()
    answers = [503]
    await expect(runScanSweep()).rejects.toThrow()
    const scan = await scanOf(key)
    expect(scan.status).toBe('PENDING')
    expect(scan.attempts).toBe(1)
  })

  it('skips an image deleted before its turn, or one the scanner cannot read', async () => {
    const gone = await avatar()
    objects.delete(gone.key)
    const unreadable = await imageFile()
    answers = [422]
    await runScanSweep()
    expect((await scanOf(gone.key)).status).toBe('SKIPPED')
    expect((await scanOf(unreadable.key)).status).toBe('SKIPPED')
  })

  it('scans a key again when it is stored again', async () => {
    const { user, key } = await avatar()
    await runScanSweep()
    await queueScan(key, 'AVATAR', user.id)
    expect((await scanOf(key)).status).toBe('PENDING')
  })
})

describe('a flagged image', () => {
  it('is hidden, reported first in the queue, and kept as evidence', async () => {
    const { user, key } = await avatar()
    answers = [NUDE]
    await runScanSweep()

    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.avatarKey).toBeNull()
    // So the next Microsoft sign-in doesn't restore the same photo.
    expect(after.avatarIsCustom).toBe(true)
    const report = await db.report.findFirstOrThrow()
    expect(report).toMatchObject({
      reporterId: null,
      reason: 'SEXUAL_CONTENT',
      targetType: 'USER',
      subjectUserId: user.id,
      scanKey: key,
    })
    expect(report.evidenceKeys).toHaveLength(1)
    expect(report.evidenceKeys[0]).toMatch(/^evidence\//)
    expect(objects.has(report.evidenceKeys[0])).toBe(true)
    expect((await scanOf(key)).status).toBe('FLAGGED')
  })

  it('takes its project private until a moderator decides', async () => {
    const { owner, project, key } = await imageFile()
    answers = [NUDE]
    await runScanSweep()
    const hidden = await db.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(hidden.visibility).toBe('PRIVATE')
    expect(hidden.takenDownAt).not.toBeNull()
    expect(await db.report.findFirstOrThrow()).toMatchObject({
      targetType: 'PROJECT',
      projectId: project.id,
      subjectUserId: owner.id,
      scanKey: key,
    })
  })

  it('comes back, with no evidence kept, when a moderator dismisses the report', async () => {
    const { project, key } = await imageFile()
    answers = [NUDE]
    await runScanSweep()
    const report = await db.report.findFirstOrThrow()
    const evidence = report.evidenceKeys[0]

    const admin = await createUser({ isAdmin: true })
    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: `/admin/reports/${report.id}/decision`,
      cookies: await cookieFor(admin),
      payload: { decision: 'DISMISS' },
    })
    expect(res.statusCode).toBe(200)

    const restored = await db.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(restored.visibility).toBe('PUBLIC')
    expect(restored.takenDownAt).toBeNull()
    expect((await scanOf(key)).status).toBe('CLEARED')
    expect((await db.report.findUniqueOrThrow({ where: { id: report.id } })).evidenceKeys).toEqual(
      []
    )
    expect(objects.has(evidence)).toBe(false)
  })

  it('stays hidden when a moderator takes it down', async () => {
    const { user } = await avatar()
    answers = [NUDE]
    await runScanSweep()
    const report = await db.report.findFirstOrThrow()
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()
    await app.inject({
      method: 'POST',
      url: `/admin/reports/${report.id}/decision`,
      cookies: await cookieFor(admin),
      payload: { decision: 'TAKE_DOWN' },
    })
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).avatarKey).toBeNull()
    expect(
      (await db.report.findUniqueOrThrow({ where: { id: report.id } })).evidenceKeys
    ).toHaveLength(1)
  })
})
