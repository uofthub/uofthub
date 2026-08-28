import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

async function report(
  reporter: { id: string; email: string },
  projectId: string,
  payload: Record<string, unknown> = { reason: 'SPAM' }
) {
  const app = await getApp()
  return app.inject({
    method: 'POST',
    url: `/projects/${projectId}/report`,
    cookies: await cookieFor(reporter),
    payload,
  })
}

describe('POST /projects/:id/report', () => {
  it('files a report on a public project', async () => {
    const owner = await createUser()
    const reporter = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    const res = await report(reporter, project.id, {
      reason: 'ACADEMIC_INTEGRITY',
      details: 'Solutions to a live assignment.',
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().status).toBe('OPEN')

    const row = await db.report.findFirst()
    expect(row?.reason).toBe('ACADEMIC_INTEGRITY')
    expect(row?.details).toBe('Solutions to a live assignment.')
  })

  it('refuses a private project, your own project, an unknown reason and a duplicate', async () => {
    const owner = await createUser()
    const reporter = await createUser()
    const publicProject = await createProject(owner.id, { visibility: 'PUBLIC' })
    const privateProject = await createProject(owner.id, { visibility: 'PRIVATE' })

    // Nobody outside a private project can see it, so there is nothing to act on.
    expect((await report(reporter, privateProject.id)).statusCode).toBe(403)
    expect((await report(owner, publicProject.id)).statusCode).toBe(400)
    expect((await report(reporter, publicProject.id, { reason: 'VIBES' })).statusCode).toBe(400)

    expect((await report(reporter, publicProject.id)).statusCode).toBe(201)
    expect((await report(reporter, publicProject.id)).statusCode).toBe(409)
    expect(await db.report.count()).toBe(1)
  })

  it('caps stored details rather than trusting the client', async () => {
    const owner = await createUser()
    const reporter = await createUser()
    const project = await createProject(owner.id, { visibility: 'UOFT' })

    await report(reporter, project.id, { reason: 'OTHER', details: 'x'.repeat(5000) })
    expect((await db.report.findFirst())?.details).toHaveLength(1000)
  })
})

describe('POST /admin/reports/:id/decision', () => {
  async function seedReport() {
    const owner = await createUser()
    const reporter = await createUser()
    const admin = await createUser({ isAdmin: true })
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    const res = await report(reporter, project.id)
    return { owner, reporter, admin, project, reportId: res.json().id as string }
  }

  async function decide(
    admin: { id: string; email: string },
    reportId: string,
    decision: string,
    note?: string
  ) {
    const app = await getApp()
    return app.inject({
      method: 'POST',
      url: `/admin/reports/${reportId}/decision`,
      cookies: await cookieFor(admin),
      payload: { decision, note },
    })
  }

  it('is closed to the reporter and to anonymous callers', async () => {
    const { reporter, reportId } = await seedReport()
    const app = await getApp()

    expect((await decide(reporter, reportId, 'DISMISS')).statusCode).toBe(403)
    const anon = await app.inject({
      method: 'POST',
      url: `/admin/reports/${reportId}/decision`,
      payload: { decision: 'DISMISS' },
    })
    expect(anon.statusCode).toBe(401)
  })

  it('dismissing closes the report and tells nobody', async () => {
    const { admin, reportId } = await seedReport()

    expect((await decide(admin, reportId, 'DISMISS')).statusCode).toBe(200)
    expect((await db.report.findUnique({ where: { id: reportId } }))?.status).toBe('DISMISSED')
    // The owner never learns a dismissed report existed.
    expect(await db.notification.count()).toBe(0)
  })

  it('warning notifies the owner and leaves the project up', async () => {
    const { admin, owner, project, reportId } = await seedReport()

    await decide(admin, reportId, 'WARN', 'Tone it down.')

    const after = await db.project.findUnique({ where: { id: project.id } })
    expect(after?.visibility).toBe('PUBLIC')
    expect(after?.takenDownAt).toBeNull()

    const note = await db.notification.findFirst({ where: { userId: owner.id } })
    expect(note?.type).toBe('PROJECT_MODERATED')
    expect(note?.payload).toMatchObject({ action: 'WARNED', note: 'Tone it down.' })
  })

  it('taking down forces the project private and blocks the owner from re-opening it', async () => {
    const { admin, owner, project, reportId } = await seedReport()
    const app = await getApp()

    const res = await decide(admin, reportId, 'TAKE_DOWN')
    // The response reflects the project's post-decision state, not the
    // visibility it had a moment earlier.
    expect(res.json().project.visibility).toBe('PRIVATE')

    const reopen = await app.inject({
      method: 'PATCH',
      url: `/projects/${project.id}`,
      cookies: await cookieFor(owner),
      payload: { visibility: 'PUBLIC' },
    })
    expect(reopen.statusCode).toBe(403)
    expect((await db.project.findUnique({ where: { id: project.id } }))?.visibility).toBe('PRIVATE')

    // Editing everything else still works — nothing was deleted.
    const rename = await app.inject({
      method: 'PATCH',
      url: `/projects/${project.id}`,
      cookies: await cookieFor(owner),
      payload: { title: 'Renamed' },
    })
    expect(rename.statusCode).toBe(200)
  })

  it('a take-down closes sibling reports so the owner is notified once', async () => {
    const { admin, owner, project, reportId } = await seedReport()
    const second = await createUser()
    await report(second, project.id, { reason: 'HARASSMENT' })

    await decide(admin, reportId, 'TAKE_DOWN')

    const statuses = await db.report.findMany({ select: { status: true } })
    expect(statuses.map((r) => r.status)).toEqual(['TAKEN_DOWN', 'TAKEN_DOWN'])
    expect(await db.notification.count({ where: { userId: owner.id } })).toBe(1)
  })

  it('refuses a second decision on the same report', async () => {
    const { admin, reportId } = await seedReport()
    await decide(admin, reportId, 'DISMISS')
    expect((await decide(admin, reportId, 'TAKE_DOWN')).statusCode).toBe(409)
  })
})
