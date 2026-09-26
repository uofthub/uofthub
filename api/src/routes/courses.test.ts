import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { clearFacetsCache } from '../lib/facets.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
  clearFacetsCache()
})

type User = { id: string; email: string }

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, user?: User, payload?: unknown) {
  const app = await getApp()
  return app.inject({
    method,
    url,
    ...(user ? { cookies: await cookieFor(user) } : {}),
    ...(payload !== undefined ? { payload: payload as object } : {}),
  })
}

const titles = (res: { json: () => unknown }) =>
  (res.json() as { title: string }[]).map((p) => p.title).sort()

describe('a project’s course', () => {
  it('is stored upper-cased, refused when it is not a course code, and cleared by null', async () => {
    const owner = await createUser()
    const created = await call('POST', '/projects', owner, {
      title: 'Poster',
      courseCode: ' csc211h5 ',
    })
    expect(created.json().courseCode).toBe('CSC211H5')

    const bad = await call('PATCH', `/projects/${created.json().id}`, owner, { courseCode: 'CS 211' })
    expect(bad.statusCode).toBe(400)

    const cleared = await call('PATCH', `/projects/${created.json().id}`, owner, { courseCode: null })
    expect(cleared.json().courseCode).toBeNull()
  })

  it('files work under a course exactly, or under every campus of a stem', async () => {
    const owner = await createUser()
    await createProject(owner.id, { title: 'utm', visibility: 'PUBLIC', courseCode: 'CSC211H5' })
    await createProject(owner.id, { title: 'stg', visibility: 'PUBLIC', courseCode: 'CSC211H1' })
    await createProject(owner.id, { title: 'other', visibility: 'PUBLIC', courseCode: 'MAT137Y1' })
    // Mentions the course without being made for it — the old search-based
    // filter listed this under CSC211.
    await createProject(owner.id, {
      title: 'mentions',
      visibility: 'PUBLIC',
      description: 'Inspired by a CSC211 lecture.',
    })

    expect(titles(await call('GET', '/projects?course=CSC211H5'))).toEqual(['utm'])
    expect(titles(await call('GET', '/projects?course=csc211'))).toEqual(['stg', 'utm'])
    // Nonsense is ignored, like an unknown campus, rather than matching nothing.
    expect(titles(await call('GET', '/projects?course=nope'))).toHaveLength(4)
  })

  it('makes the project findable by its code', async () => {
    const owner = await createUser()
    await call('POST', '/projects', owner, {
      title: 'Poster',
      visibility: 'PUBLIC',
      courseCode: 'CSC211H5',
    })
    expect(titles(await call('GET', '/projects?search=csc211h5'))).toEqual(['Poster'])
  })
})

describe('the migration that moved course codes out of tags', () => {
  // The migration's own UPDATE, run against fixtures, so what is tested is the
  // SQL that ran — not a copy of it.
  const sql = readFileSync(
    new URL('../../prisma/migrations/20260926000000_course_code/migration.sql', import.meta.url),
    'utf8'
  )
  const backfill = sql.slice(sql.indexOf('WITH firsts'), sql.indexOf(';', sql.indexOf('WITH firsts')))

  it('makes the first course-code tag the course and drops every spelling of it', async () => {
    const owner = await createUser()
    const a = await createProject(owner.id, { tags: ['React', 'csc309', 'Maps', 'CSC309 '] })
    const b = await createProject(owner.id, { tags: ['CSC343', 'MAT137Y1'] })
    const c = await createProject(owner.id, { tags: ['Robotics'] })

    await db.$executeRawUnsafe(backfill)

    const row = (id: string) =>
      db.project.findUniqueOrThrow({ where: { id }, select: { courseCode: true, tags: true } })
    expect(await row(a.id)).toEqual({ courseCode: 'CSC309', tags: ['React', 'Maps'] })
    // A project has one course; a second code stays a tag.
    expect(await row(b.id)).toEqual({ courseCode: 'CSC343', tags: ['MAT137Y1'] })
    expect(await row(c.id)).toEqual({ courseCode: null, tags: ['Robotics'] })
  })
})

describe('course templates', () => {
  it('serves CSC211H5’s, by its code or its stem', async () => {
    const res = await call('GET', '/courses/csc211h5/template')
    expect(res.statusCode).toBe(200)
    const template = res.json()
    expect(template.primaryOutput.kind).toBe('POSTER')
    expect(template.sections.map((s: { title: string }) => s.title)).toEqual([
      'Task & motivation',
      'Data & evaluation setup',
      'Approaches',
      'Results',
      'Examples & failure analysis',
      'Trade-offs & responsible use',
      'Recommendation',
    ])
    expect(
      template.sections[2].items.map((i: { label: string }) => i.label)
    ).toEqual(['Human baseline', 'Algorithmic', 'Deep learning', 'LLM prompting'])
    expect((await call('GET', '/courses/CSC211/template')).statusCode).toBe(200)
  })

  it('has none for another campus’s course or a course without one', async () => {
    expect((await call('GET', '/courses/CSC211H1/template')).statusCode).toBe(404)
    expect((await call('GET', '/courses/MAT137/template')).statusCode).toBe(404)
  })

  it('is recorded on a project that started from it, and refused if it does not exist', async () => {
    const owner = await createUser()
    const ok = await call('POST', '/projects', owner, {
      title: 'Poster',
      templateCode: 'CSC211H5',
      templateVersion: 1,
    })
    expect(ok.statusCode).toBe(201)
    const row = await db.project.findUniqueOrThrow({ where: { id: ok.json().id } })
    expect([row.templateCode, row.templateVersion]).toEqual(['CSC211H5', 1])

    const unknown = await call('POST', '/projects', owner, {
      title: 'Poster',
      templateCode: 'MAT137Y1',
      templateVersion: 1,
    })
    expect(unknown.statusCode).toBe(400)
    const future = await call('POST', '/projects', owner, {
      title: 'Poster',
      templateCode: 'CSC211H5',
      templateVersion: 99,
    })
    expect(future.statusCode).toBe(400)
  })
})

describe('faculty filters', () => {
  async function seed() {
    const engineer = await createUser()
    const musician = await createUser()
    const ta = await createUser()
    const invitee = await createUser()
    await db.user.update({ where: { id: engineer.id }, data: { faculty: 'Engineering' } })
    await db.user.update({ where: { id: musician.id }, data: { faculty: 'Music' } })
    await db.user.update({ where: { id: ta.id }, data: { faculty: 'Law' } })
    await db.user.update({ where: { id: invitee.id }, data: { faculty: 'Nursing' } })

    const joint = await createProject(engineer.id, { title: 'joint', visibility: 'PUBLIC' })
    await createProject(engineer.id, { title: 'solo', visibility: 'PUBLIC' })
    await db.projectCollaborator.createMany({
      data: [
        { projectId: joint.id, userId: musician.id, accepted: true },
        // Access for a TA is not credit for the work.
        { projectId: joint.id, userId: ta.id, accepted: true, role: 'VIEWER' },
        // Nor is an invitation nobody answered.
        { projectId: joint.id, userId: invitee.id, accepted: false },
      ],
    })
  }

  it('find a project by its owner’s faculty or an accepted collaborator’s', async () => {
    await seed()
    expect(titles(await call('GET', '/projects?faculty=Engineering'))).toEqual(['joint', 'solo'])
    expect(titles(await call('GET', '/projects?faculty=music'))).toEqual(['joint'])
    expect(titles(await call('GET', '/projects?faculty=Law'))).toEqual([])
    expect(titles(await call('GET', '/projects?faculty=Nursing'))).toEqual([])
  })

  it('count a joint project once under each of its makers’ faculties', async () => {
    await seed()
    const { faculties } = (await call('GET', '/projects/facets')).json()
    expect(faculties).toEqual({ Engineering: 2, Music: 1 })
  })
})

describe('the feed and courses', () => {
  it('connects a student to work made for a course they take', async () => {
    const me = await createUser()
    const other = await createUser()
    await db.user.update({ where: { id: me.id }, data: { courses: ['CSC211H5'] } })
    await createProject(other.id, { title: 'poster', visibility: 'PUBLIC', courseCode: 'CSC211H5' })

    const { items } = (await call('GET', '/feed', me)).json()
    expect(items).toHaveLength(1)
    expect(items[0].reason).toEqual({ kind: 'COURSE', tag: 'CSC211H5' })
  })
})
