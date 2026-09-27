import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * Sections and details through the routes: stored stripped of empties,
 * returned on a single project but never on list rows, carried by versions,
 * and searchable.
 */

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

const sections = [
  { id: 'why', kind: 'motivation', body: 'Commuters miss the ferry.' },
  { id: 'empty', kind: 'results', title: 'Results', body: '   ' },
  {
    id: 'ways',
    kind: 'approaches',
    items: [
      { label: 'Human baseline', body: 'Asked twelve riders.' },
      { label: 'Deep learning', body: 'A small transformer.' },
    ],
  },
]

describe('sections and details on a project', () => {
  it('are stored without the empty ones and come back on the project', async () => {
    const owner = await createUser()
    const created = await call('POST', '/projects', owner, {
      title: 'Ferry times',
      sections,
      details: [
        { label: 'Supervisor', value: 'Prof. Ada' },
        { label: 'Runtime', value: '' },
      ],
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().sections.map((s: { id: string }) => s.id)).toEqual(['why', 'ways'])

    const read = (await call('GET', `/projects/${created.json().id}`, owner)).json()
    expect(read.sections.map((s: { id: string }) => s.id)).toEqual(['why', 'ways'])
    expect(read.details).toEqual([{ label: 'Supervisor', value: 'Prof. Ada' }])
  })

  it('are stored as null when nothing is left, so "none" has one form', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    const res = await call('PATCH', `/projects/${project.id}`, owner, {
      sections: [{ kind: 'data', body: '' }],
      details: [],
    })
    expect(res.statusCode).toBe(200)
    const row = await db.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(row.sections).toBeNull()
    expect(row.details).toBeNull()
  })

  it('are left alone by an edit that does not mention them, and cleared by null', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    await call('PATCH', `/projects/${project.id}`, owner, { sections })
    await call('PATCH', `/projects/${project.id}`, owner, { title: 'Renamed' })
    let row = await db.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(row.sections).toHaveLength(2)

    await call('PATCH', `/projects/${project.id}`, owner, { sections: null })
    row = await db.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(row.sections).toBeNull()
  })

  it('refuses content that breaks the rules, saying why', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    const res = await call('PATCH', `/projects/${project.id}`, owner, {
      sections: [{ kind: 'custom', body: 'untitled' }],
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/title/)
  })

  it('are left off list rows', async () => {
    const owner = await createUser()
    await call('POST', '/projects', owner, {
      title: 'Ferry times',
      visibility: 'PUBLIC',
      sections,
      details: [{ label: 'Supervisor', value: 'Prof. Ada' }],
    })
    const [row] = (await call('GET', '/projects')).json()
    expect(row.title).toBe('Ferry times')
    expect(row).not.toHaveProperty('sections')
    expect(row).not.toHaveProperty('details')
  })

  it('are found by search', async () => {
    const owner = await createUser()
    await call('POST', '/projects', owner, {
      title: 'Ferry times',
      visibility: 'PUBLIC',
      sections,
      details: [{ label: 'Supervisor', value: 'Professor Lovelace' }],
    })
    const titles = async (q: string) =>
      (await call('GET', `/projects?search=${q}`)).json().map((p: { title: string }) => p.title)
    expect(await titles('commuters')).toEqual(['Ferry times'])
    expect(await titles('transformer')).toEqual(['Ferry times'])
    expect(await titles('lovelace')).toEqual(['Ferry times'])
    expect(await titles('submarine')).toEqual([])
  })

  it('are kept by a version', async () => {
    const owner = await createUser()
    const created = (
      await call('POST', '/projects', owner, {
        title: 'Ferry times',
        visibility: 'PUBLIC',
        sections,
        details: [{ label: 'Supervisor', value: 'Prof. Ada' }],
      })
    ).json()

    await call('POST', `/projects/${created.id}/versions`, owner, { note: 'First draft' })
    const version = await db.projectVersion.findFirstOrThrow({ where: { projectId: created.id } })
    expect(version.sections).toEqual(created.sections)
    expect(version.details).toEqual(created.details)
  })
})
