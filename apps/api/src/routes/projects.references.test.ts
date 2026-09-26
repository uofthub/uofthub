import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

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

const census = {
  kind: 'DATASET',
  title: 'Canadian Census 2021',
  url: 'https://www12.statcan.gc.ca/census-recensement/2021/?utm_source=class',
}
const paper = { kind: 'PAPER', title: 'Attention is all you need', doi: '10.48550/arXiv.1706.03762' }

describe('references on a project', () => {
  it('are stored in order and come back on the project', async () => {
    const owner = await createUser()
    const res = await call('POST', '/projects', owner, {
      title: 'Commute study',
      references: [census, paper],
    })
    expect(res.statusCode).toBe(201)
    const read = (await call('GET', `/projects/${res.json().id}`, owner)).json()
    expect(read.references.map((r: { title: string; key: string }) => [r.title, r.key])).toEqual([
      ['Canadian Census 2021', 'https://www12.statcan.gc.ca/census-recensement/2021'],
      ['Attention is all you need', 'arxiv:1706.03762'],
    ])
  })

  it('are replaced as a whole list, left alone when not sent, and cleared by null', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    await call('PATCH', `/projects/${project.id}`, owner, { references: [census, paper] })
    await call('PATCH', `/projects/${project.id}`, owner, { references: [paper] })
    expect(await db.projectReference.count({ where: { projectId: project.id } })).toBe(1)

    await call('PATCH', `/projects/${project.id}`, owner, { title: 'Renamed' })
    expect(await db.projectReference.count({ where: { projectId: project.id } })).toBe(1)

    await call('PATCH', `/projects/${project.id}`, owner, { references: null })
    expect(await db.projectReference.count({ where: { projectId: project.id } })).toBe(0)
  })

  it('leave the old list untouched when the new one is refused', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    await call('PATCH', `/projects/${project.id}`, owner, { references: [census] })
    const res = await call('PATCH', `/projects/${project.id}`, owner, {
      title: 'Renamed',
      references: [{ kind: 'PAPER', url: 'https://example.org' }],
    })
    expect(res.statusCode).toBe(400)
    const row = await db.project.findUniqueOrThrow({
      where: { id: project.id },
      include: { references: true },
    })
    expect(row.title).not.toBe('Renamed')
    expect(row.references).toHaveLength(1)
  })

  it('are copied by a fork', async () => {
    const owner = await createUser()
    const forker = await createUser()
    const original = (
      await call('POST', '/projects', owner, {
        title: 'Commute study',
        visibility: 'PUBLIC',
        references: [census, paper],
      })
    ).json()
    const fork = (await call('POST', `/projects/${original.id}/fork`, forker)).json()
    expect(fork.references.map((r: { title: string }) => r.title)).toEqual([
      'Canadian Census 2021',
      'Attention is all you need',
    ])
  })

  it('make a project findable by what it cited', async () => {
    const owner = await createUser()
    await call('POST', '/projects', owner, {
      title: 'Commute study',
      visibility: 'PUBLIC',
      references: [census],
    })
    const titles = async (q: string) =>
      (await call('GET', `/projects?search=${q}`)).json().map((p: { title: string }) => p.title)
    expect(await titles('census')).toEqual(['Commute study'])
  })
})

describe('GET /projects/:id/shared-references', () => {
  it('names other projects that cited the same thing, however it was pasted', async () => {
    const a = await createUser()
    const b = await createUser()
    const mine = (
      await call('POST', '/projects', a, { title: 'Mine', visibility: 'PUBLIC', references: [paper] })
    ).json()
    await call('POST', '/projects', b, {
      title: 'Theirs',
      visibility: 'PUBLIC',
      references: [{ kind: 'PAPER', title: 'Transformers', url: 'https://arxiv.org/pdf/1706.03762v7.pdf' }],
    })
    await call('POST', '/projects', b, {
      title: 'Unrelated',
      visibility: 'PUBLIC',
      references: [census],
    })

    const shared = (await call('GET', `/projects/${mine.id}/shared-references`)).json()
    expect(shared).toHaveLength(1)
    expect(shared[0].reference.title).toBe('Attention is all you need')
    expect(shared[0].projects.map((p: { title: string }) => p.title)).toEqual(['Theirs'])
  })

  it('never names a project the reader cannot see', async () => {
    const a = await createUser()
    const b = await createUser()
    const mine = (
      await call('POST', '/projects', a, { title: 'Mine', visibility: 'PUBLIC', references: [census] })
    ).json()
    for (const [title, visibility, showFrom] of [
      ['Draft', 'PRIVATE', null],
      ['U of T only', 'UOFT', null],
      ['Hidden until grading', 'PUBLIC', '2099-12-20'],
    ] as const) {
      await call('POST', '/projects', b, { title, visibility, showFrom, references: [census] })
    }

    const names = async (user?: User) =>
      (await call('GET', `/projects/${mine.id}/shared-references`, user))
        .json()
        .flatMap((s: { projects: { title: string }[] }) => s.projects.map((p) => p.title))
    expect(await names()).toEqual([])
    expect(await names(a)).toEqual(['U of T only'])
    expect(await names(b)).toEqual(['Hidden until grading', 'U of T only', 'Draft'])
  })

  it('is a 404 for a project the reader cannot see', async () => {
    const a = await createUser()
    const draft = await createProject(a.id)
    expect((await call('GET', `/projects/${draft.id}/shared-references`)).statusCode).toBe(404)
  })
})
