import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * The moderation surface. Every route here can take somebody's work offline,
 * so the first thing each block asserts is that a non-moderator cannot reach
 * it — that is the check with real consequences if it ever regresses.
 */

async function openReport() {
  const owner = await createUser()
  const reporter = await createUser()
  const project = await createProject(owner.id, { title: 'Reported', visibility: 'PUBLIC' })
  const report = await db.report.create({
    data: { projectId: project.id, reporterId: reporter.id, reason: 'SPAM', details: 'spam' },
  })
  return { owner, reporter, project, report }
}

describe('admin authorization', () => {
  it('refuses a signed-out caller', async () => {
    const app = await getApp()
    expect((await app.inject({ method: 'GET', url: '/admin/reports' })).statusCode).toBe(401)
  })

  it('refuses an ordinary signed-in student', async () => {
    const student = await createUser()
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/admin/reports', cookies: await cookieFor(student) })
    expect(res.statusCode).toBe(403)
  })

  it('refuses a faculty account — role is not moderator', async () => {
    const faculty = await createUser({ email: 'prof@utoronto.ca' })
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/admin/reports', cookies: await cookieFor(faculty) })
    expect(res.statusCode).toBe(403)
  })

  it('refuses a non-moderator the decision endpoint, not just the queue', async () => {
    const { report } = await openReport()
    const student = await createUser()
    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: `/admin/reports/${report.id}/decision`,
      cookies: await cookieFor(student),
      payload: { decision: 'TAKE_DOWN' },
    })
    expect(res.statusCode).toBe(403)
    expect((await db.project.findFirst({ where: { title: 'Reported' } }))?.takenDownAt).toBeNull()
  })

  it('reads the flag from the database, not the token', async () => {
    // A session minted while the flag was set must stop working the moment it
    // is revoked — the whole reason requireAdmin does not trust the JWT.
    const admin = await createUser({ isAdmin: true })
    const cookies = await cookieFor(admin)
    const app = await getApp()
    expect((await app.inject({ method: 'GET', url: '/admin/reports', cookies })).statusCode).toBe(200)

    await db.user.update({ where: { id: admin.id }, data: { isAdmin: false } })
    expect((await app.inject({ method: 'GET', url: '/admin/reports', cookies })).statusCode).toBe(403)
  })

  it('lets a moderator read the queue', async () => {
    await openReport()
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/admin/reports', cookies: await cookieFor(admin) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('rejects an unknown status rather than returning everything', async () => {
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin/reports?status=NONSENSE',
      cookies: await cookieFor(admin),
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /admin/reports/:id/decision', () => {
  it('takes a project down: private, stamped, and the owner notified', async () => {
    const { report, project, owner } = await openReport()
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()

    const res = await app.inject({
      method: 'POST',
      url: `/admin/reports/${report.id}/decision`,
      cookies: await cookieFor(admin),
      payload: { decision: 'TAKE_DOWN', note: 'Not your work.' },
    })
    expect(res.statusCode).toBe(200)

    const after = await db.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(after.visibility).toBe('PRIVATE')
    expect(after.takenDownAt).not.toBeNull()

    const notifications = await db.notification.findMany({ where: { userId: owner.id } })
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('PROJECT_MODERATED')
  })

  it('closes the other open reports on the same project, so the owner is told once', async () => {
    const { report, project } = await openReport()
    const second = await createUser()
    await db.report.create({
      data: { projectId: project.id, reporterId: second.id, reason: 'HARASSMENT' },
    })
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()

    await app.inject({
      method: 'POST',
      url: `/admin/reports/${report.id}/decision`,
      cookies: await cookieFor(admin),
      payload: { decision: 'TAKE_DOWN' },
    })

    expect(await db.report.count({ where: { projectId: project.id, status: 'OPEN' } })).toBe(0)
    const owner = await db.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(await db.notification.count({ where: { userId: owner.ownerId } })).toBe(1)
  })

  it('dismissing leaves the project alone and notifies nobody', async () => {
    const { report, project, owner } = await openReport()
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()

    await app.inject({
      method: 'POST',
      url: `/admin/reports/${report.id}/decision`,
      cookies: await cookieFor(admin),
      payload: { decision: 'DISMISS' },
    })

    const after = await db.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(after.visibility).toBe('PUBLIC')
    expect(after.takenDownAt).toBeNull()
    expect(await db.notification.count({ where: { userId: owner.id } })).toBe(0)
  })

  it('refuses to decide the same report twice', async () => {
    const { report } = await openReport()
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()
    const cookies = await cookieFor(admin)
    const decide = () =>
      app.inject({
        method: 'POST',
        url: `/admin/reports/${report.id}/decision`,
        cookies,
        payload: { decision: 'WARN' },
      })

    expect((await decide()).statusCode).toBe(200)
    expect((await decide()).statusCode).toBe(409)
  })

  it('rejects a decision it does not recognise', async () => {
    const { report } = await openReport()
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: `/admin/reports/${report.id}/decision`,
      cookies: await cookieFor(admin),
      payload: { decision: 'DELETE_EVERYTHING' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('sexual content reports', () => {
  it('come first in the open queue, ahead of older reports', async () => {
    const { report: older } = await openReport()
    const subject = await createUser()
    const reporter = await createUser()
    const urgent = await db.report.create({
      data: {
        targetType: 'USER',
        subjectUserId: subject.id,
        reporterId: reporter.id,
        reason: 'SEXUAL_CONTENT',
      },
    })
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin/reports',
      cookies: await cookieFor(admin),
    })
    expect(res.json().map((r: { id: string }) => r.id)).toEqual([urgent.id, older.id])
  })

  it('keep the image a take-down removes, as evidence on the report', async () => {
    const subject = await createUser()
    await db.user.update({
      where: { id: subject.id },
      data: { avatarKey: 'avatars/evidence.png', avatarUrl: 'x', avatarIsCustom: true },
    })
    const reporter = await createUser()
    const report = await db.report.create({
      data: {
        targetType: 'USER',
        subjectUserId: subject.id,
        reporterId: reporter.id,
        reason: 'SEXUAL_CONTENT',
      },
    })
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: `/admin/reports/${report.id}/decision`,
      cookies: await cookieFor(admin),
      payload: { decision: 'TAKE_DOWN' },
    })
    expect(res.statusCode).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { id: subject.id } })).avatarKey).toBeNull()
    expect((await db.report.findUniqueOrThrow({ where: { id: report.id } })).evidenceKeys).toEqual([
      'avatars/evidence.png',
    ])
  })
})
