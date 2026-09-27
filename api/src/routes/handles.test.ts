import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { handleProblem, slugify, suggestHandle } from '../lib/handles.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

type User = Awaited<ReturnType<typeof createUser>>

async function call(
  method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE',
  url: string,
  as?: User,
  payload?: object
) {
  return (await getApp()).inject({
    method,
    url,
    payload,
    cookies: as ? await cookieFor(as) : undefined,
  })
}

const rename = (as: User, handle: string) => call('PUT', '/users/me/handle', as, { handle })

/** Lets a student rename again at once, as if their last change were long ago. */
const waitOut = (user: User) =>
  db.user.update({ where: { id: user.id }, data: { handleChangedAt: null } })

describe('handle rules', () => {
  it('slug names and titles', () => {
    expect(slugify('Élodie Nguyễn', 26)).toBe('elodie-nguyen')
    expect(slugify('  CSC343: A — B!! ', 60)).toBe('csc343-a-b')
    expect(slugify('abcdef-ghijk', 7)).toBe('abcdef')
  })

  it('allow plain handles and refuse official-sounding ones', () => {
    expect(handleProblem('ada_lovelace-2')).toBeNull()
    expect(handleProblem('ab')).not.toBeNull()
    expect(handleProblem('-ada')).not.toBeNull()
    expect(handleProblem('Ada')).not.toBeNull()
    expect(handleProblem('admin')).toBe('That handle is reserved')
    expect(handleProblem('u-of-t-hub')).toBe('That handle is reserved')
    expect(handleProblem('the-real-uofthub')).toBe('That handle is reserved')
  })

  it('suggest the next free one', async () => {
    await createUser()
    await db.user.updateMany({ data: { handle: 'ada-lovelace' } })
    expect(await suggestHandle('Ada Lovelace')).toBe('ada-lovelace-2')
    expect(await suggestHandle('Al')).toBe('student')
  })
})

describe('PUT /users/me/handle', () => {
  it('renames, and the old handle keeps leading to the same student', async () => {
    const ada = await createUser()
    const old = ada.handle
    expect((await rename(ada, '@AB')).json().error).toMatch(/3 to 30 characters/)

    expect((await rename(ada, '@ada-l')).json()).toEqual({ handle: 'ada-l' })
    expect((await call('GET', `/paths/${old}`)).json()).toEqual({ userId: ada.id, handle: 'ada-l' })
    expect((await call('GET', '/paths/ADA-L')).json()).toEqual({ userId: ada.id, handle: 'ada-l' })
  })

  it('lets somebody else take a handle given up, which ends its redirect', async () => {
    const ada = await createUser()
    const eve = await createUser()
    const old = ada.handle
    await rename(ada, 'ada-l')

    const check = (await call('GET', `/users/handle-check?handle=${old}`, eve)).json()
    expect(check).toMatchObject({ available: true, problem: null })
    expect((await rename(eve, old)).statusCode).toBe(200)
    expect((await call('GET', `/paths/${old}`)).json()).toEqual({ userId: eve.id, handle: old })

    // One somebody goes by now is not free.
    await waitOut(ada)
    expect((await rename(ada, old)).statusCode).toBe(409)
  })

  it('never gives out an old handle unasked', async () => {
    const ada = await createUser({ name: 'Ada Lovelace' })
    await db.user.update({ where: { id: ada.id }, data: { handle: 'ada-lovelace' } })
    await rename(ada, 'ada-l')
    // Still Ada's redirect, so a new Ada Lovelace is suggested the next one.
    expect(await suggestHandle('Ada Lovelace')).toBe('ada-lovelace-2')
  })

  it('allows one change a month', async () => {
    const ada = await createUser()
    expect((await rename(ada, 'ada-one')).statusCode).toBe(200)
    const again = await rename(ada, 'ada-two')
    expect(again.statusCode).toBe(429)
    expect(again.json().error).toMatch(/You can change your handle again on/)
  })

  it("frees a deleted student's handles, old ones included", async () => {
    const ada = await createUser()
    const eve = await createUser()
    const first = ada.handle
    await rename(ada, 'ada-l')
    await call('DELETE', '/users/me', ada, { confirmEmail: ada.email })
    expect(await db.user.findUnique({ where: { id: ada.id } })).toBeNull()
    expect((await call('GET', `/paths/${first}`)).statusCode).toBe(404)
    expect((await call('GET', '/paths/ada-l')).statusCode).toBe(404)
    expect((await rename(eve, 'ada-l')).statusCode).toBe(200)
  })
})

describe('a moderator renaming a handle', () => {
  it('frees the old one for whoever it belongs to', async () => {
    const mod = await createUser({ isAdmin: true })
    const squatter = await createUser()
    const prof = await createUser({ email: 'jane.smith@utoronto.ca' })
    await db.user.update({ where: { id: squatter.id }, data: { handle: 'jane-smith' } })

    const res = await call('POST', `/admin/users/${squatter.id}/handle`, mod, {
      handle: 'not-jane',
    })
    expect(res.json()).toEqual({ handle: 'not-jane' })
    expect((await rename(prof, 'jane-smith')).statusCode).toBe(200)
    expect((await call('GET', '/paths/jane-smith')).json()).toEqual({
      userId: prof.id,
      handle: 'jane-smith',
    })
  })

  it('is for moderators only', async () => {
    const eve = await createUser()
    const ada = await createUser()
    const res = await call('POST', `/admin/users/${ada.id}/handle`, eve, { handle: 'mine-now' })
    expect(res.statusCode).toBe(403)
  })
})

describe('project addresses', () => {
  it('follow the title, and the old one keeps working', async () => {
    const ada = await createUser()
    const res = await call('POST', '/projects', ada, { title: 'Study Buddy', visibility: 'PUBLIC' })
    const project = res.json()
    expect(project.slug).toBe('study-buddy')

    const renamed = await call('PATCH', `/projects/${project.id}`, ada, { title: 'Study Group' })
    expect(renamed.json().slug).toBe('study-group')

    const target = {
      userId: ada.id,
      handle: ada.handle,
      projectId: project.id,
      slug: 'study-group',
    }
    expect((await call('GET', `/paths/${ada.handle}/study-buddy`)).json()).toEqual(target)
    expect((await call('GET', `/paths/${ada.handle}/study-group`)).json()).toEqual(target)
  })

  it("are unique among the owner's projects", async () => {
    const ada = await createUser()
    const create = async (title: string) =>
      (await call('POST', '/projects', ada, { title, visibility: 'PUBLIC' })).json()
    const first = await create('Robot Arm')
    expect((await create('Robot Arm')).slug).toBe('robot-arm-2')

    // Renamed away, "robot-arm" leads to the first until another takes it.
    await call('PATCH', `/projects/${first.id}`, ada, { title: 'Gripper' })
    const at = (slug: string) => call('GET', `/paths/${ada.handle}/${slug}`)
    expect((await at('robot-arm')).json().projectId).toBe(first.id)
    const third = await create('Robot Arm')
    expect(third.slug).toBe('robot-arm')
    expect((await at('robot-arm')).json().projectId).toBe(third.id)

    // Another student's "robot-arm" is theirs.
    expect((await createProject((await createUser()).id, { title: 'Robot Arm' })).slug).toBe(
      'robot-arm'
    )
  })

  it('keep private projects private', async () => {
    const ada = await createUser()
    const eve = await createUser()
    const draft = await createProject(ada.id, { title: 'Secret', visibility: 'PRIVATE' })
    const url = `/paths/${ada.handle}/${draft.slug}`
    expect((await call('GET', url)).statusCode).toBe(404)
    expect((await call('GET', url, eve)).statusCode).toBe(404)
    expect((await call('GET', url, ada)).json().projectId).toBe(draft.id)
  })

  it('say nothing of an account nobody has confirmed', async () => {
    const ghost = await createUser({ verified: false })
    expect((await call('GET', `/paths/${ghost.handle}`)).statusCode).toBe(404)
  })
})

describe('telling faculty from students', () => {
  it('comes from the address, never the profile', async () => {
    const prof = await createUser({ email: 'jane.smith@utoronto.ca' })
    const student = await createUser({ name: 'Prof. Jane Smith' })
    const profile = async (u: User) => (await call('GET', `/users/${u.id}`)).json()
    expect((await profile(prof)).isFaculty).toBe(true)
    expect((await profile(student)).isFaculty).toBe(false)
    expect(await profile(prof)).not.toHaveProperty('email')
  })

  it('takes impersonation reports', async () => {
    const reporter = await createUser()
    const target = await createUser()
    const res = await call('POST', `/users/${target.id}/report`, reporter, {
      reason: 'IMPERSONATION',
    })
    expect(res.statusCode).toBeLessThan(300)
  })
})
