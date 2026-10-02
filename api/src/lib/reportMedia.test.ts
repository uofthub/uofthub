import { beforeEach, describe, expect, it, vi } from 'vitest'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
const PDF = Buffer.from('%PDF-1.7\n')
// The bucket, as a map; signed URLs name the key and how it is served.
const objects = vi.hoisted(() => new Map<string, Buffer>())
vi.mock('./storage.js', async (original) => ({
  ...(await original<object>()),
  getObjectHead: async (key: string) => {
    const body = objects.get(key)
    if (!body) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
    return body
  },
  signedDownloadUrl: async (key: string, _name: string, options: { disposition?: string } = {}) =>
    `https://storage.test/${key}?${options.disposition ?? 'attachment'}`,
}))

import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
  objects.clear()
})

async function media(reportId: string, as?: { id: string; email: string }) {
  const app = await getApp()
  return app.inject({
    method: 'GET',
    url: `/admin/reports/${reportId}/media`,
    cookies: await cookieFor(as ?? (await createUser({ isAdmin: true }))),
  })
}

describe('GET /admin/reports/:id/media', () => {
  it('is for moderators only', async () => {
    const subject = await createUser()
    const report = await db.report.create({
      data: { targetType: 'USER', subjectUserId: subject.id, reason: 'SEXUAL_CONTENT' },
    })
    expect((await media(report.id, await createUser())).statusCode).toBe(403)
  })

  it('shows a taken-down project’s files: images inline, the rest as downloads', async () => {
    const owner = await createUser()
    const reporter = await createUser()
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })
    await db.project.update({ where: { id: project.id }, data: { takenDownAt: new Date() } })
    objects.set('projects/p/photo.png', PNG)
    objects.set('projects/p/paper.pdf', PDF)
    await db.projectFile.createMany({
      data: [
        {
          projectId: project.id,
          name: 'photo.png',
          storageKey: 'projects/p/photo.png',
          sizeBytes: 1,
        },
        {
          projectId: project.id,
          name: 'paper.pdf',
          storageKey: 'projects/p/paper.pdf',
          sizeBytes: 1,
        },
        {
          projectId: project.id,
          name: 'gone.png',
          storageKey: 'projects/p/gone.png',
          sizeBytes: 1,
        },
      ],
    })
    const report = await db.report.create({
      data: { projectId: project.id, reporterId: reporter.id, reason: 'SEXUAL_CONTENT' },
    })

    const res = await media(report.id)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([
      expect.objectContaining({
        name: 'photo.png',
        kind: 'image',
        url: expect.stringContaining('?inline'),
      }),
      expect.objectContaining({
        name: 'paper.pdf',
        kind: 'file',
        url: expect.stringContaining('?attachment'),
      }),
    ])
  })

  it('shows the copy a scan kept, not whatever the avatar key holds now', async () => {
    const subject = await createUser()
    objects.set(`avatars/${subject.id}`, PNG)
    objects.set('evidence/abc-avatar', PNG)
    await db.user.update({ where: { id: subject.id }, data: { avatarKey: null } })
    const report = await db.report.create({
      data: {
        targetType: 'USER',
        subjectUserId: subject.id,
        reason: 'SEXUAL_CONTENT',
        scanKey: `avatars/${subject.id}`,
        evidenceKeys: ['evidence/abc-avatar'],
      },
    })
    const res = await media(report.id)
    expect(res.json()).toEqual([
      expect.objectContaining({ label: 'Kept copy (evidence)', kind: 'image' }),
    ])
  })
})
