import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { createOrg, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

async function get(url: string) {
  return (await getApp()).inject({ method: 'GET', url })
}

describe('project preview images', () => {
  it('draws public projects and nothing else', async () => {
    const owner = await createUser()
    const open = await createProject(owner.id, { title: 'Open', visibility: 'PUBLIC' })
    const campus = await createProject(owner.id, { title: 'Campus', visibility: 'UOFT' })

    const png = await get(`/projects/${open.id}/og.png`)
    expect(png.statusCode).toBe(200)
    expect(png.headers['content-type']).toBe('image/png')
    expect(png.rawPayload.subarray(0, 8).equals(PNG)).toBe(true)

    expect((await get(`/projects/${campus.id}/og.png`)).statusCode).toBe(404)
  })

  it('moves the image to a new address when the title changes', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { title: 'Before', visibility: 'PUBLIC' })
    const before = (await get(`/projects/${project.id}/share`)).json().image
    await db.project.update({ where: { id: project.id }, data: { title: 'After' } })
    const after = (await get(`/projects/${project.id}/share`)).json().image
    expect(after).not.toBe(before)
  })
})

describe('profile previews', () => {
  it('describe a confirmed student', async () => {
    const user = await createUser({ name: 'Ada Lovelace' })
    await db.user.update({
      where: { id: user.id },
      data: { program: 'Computer Science', classYear: 2027, githubUrl: 'https://github.com/ada' },
    })
    await createProject(user.id, { title: 'Open', visibility: 'PUBLIC' })
    await createProject(user.id, { title: 'Draft', visibility: 'PRIVATE' })

    const card = await get(`/users/${user.id}/share`)
    expect(card.json()).toMatchObject({
      name: 'Ada Lovelace',
      headline: 'Computer Science · Class of 2027',
      // What a stranger can see, not what they keep private.
      projectCount: 1,
      links: ['https://github.com/ada'],
    })
    expect(card.json().image).toMatch(new RegExp(`/users/${user.id}/og\\.png\\?v=`))

    const png = await get(`/users/${user.id}/og.png`)
    expect(png.statusCode).toBe(200)
    expect(png.rawPayload.subarray(0, 8).equals(PNG)).toBe(true)
  })

  it('say nothing about an address nobody has confirmed', async () => {
    const user = await createUser({ verified: false })
    expect((await get(`/users/${user.id}/share`)).statusCode).toBe(404)
    expect((await get(`/users/${user.id}/og.png`)).statusCode).toBe(404)
  })

  it('list only students with something public in the sitemap', async () => {
    const maker = await createUser()
    const lurker = await createUser()
    const drafter = await createUser()
    await createProject(maker.id, { visibility: 'PUBLIC' })
    await createProject(drafter.id, { visibility: 'UOFT' })

    const sitemap = (await get('/users/sitemap')).json()
    expect(sitemap.map((u: { id: string }) => u.id)).toEqual([maker.id])
    expect(sitemap.map((u: { id: string }) => u.id)).not.toContain(lurker.id)
  })
})

describe('group previews', () => {
  it('describe a group by slug', async () => {
    const admin = await createUser()
    const org = await createOrg(admin.id, { slug: 'hart-house-film' })

    const card = await get('/orgs/hart-house-film/share')
    expect(card.json()).toMatchObject({ name: org.name, type: 'CLUB', memberCount: 1 })
    // The exec's contact is for members only, never a preview.
    expect(JSON.stringify(card.json())).not.toContain('exec@')

    const png = await get('/orgs/hart-house-film/og.png')
    expect(png.statusCode).toBe(200)
    expect(png.rawPayload.subarray(0, 8).equals(PNG)).toBe(true)

    expect((await get('/orgs/nobody/share')).statusCode).toBe(404)
  })
})
