import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

type User = { id: string; email: string }

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  user?: User,
  payload?: object
) {
  const app = await getApp()
  return app.inject({
    method,
    url,
    ...(user && { cookies: await cookieFor(user) }),
    ...(payload && { payload }),
  })
}

async function seed() {
  const owner = await createUser()
  const author = await createUser()
  const reader = await createUser()
  const project = await createProject(owner.id, { visibility: 'PUBLIC' })
  const comment = (
    await call('POST', `/projects/${project.id}/comments`, author, { body: 'First!' })
  ).json()
  return { owner, author, reader, project, comment }
}

describe('editing and deleting comments', () => {
  it('lets the author edit, marking it edited, and nobody else', async () => {
    const { owner, author, project, comment } = await seed()
    const url = `/projects/${project.id}/comments/${comment.id}`
    expect((await call('PATCH', url, owner, { body: 'Hijacked' })).statusCode).toBe(403)
    const res = await call('PATCH', url, author, { body: 'Second thoughts' })
    expect(res.statusCode).toBe(200)
    const [thread] = (await call('GET', `/projects/${project.id}/comments`)).json()
    expect(thread).toMatchObject({ body: 'Second thoughts', deleted: false })
    expect(thread.editedAt).not.toBeNull()
  })

  it('lets the author, the project owner or a moderator delete — not another reader', async () => {
    const { owner, author, reader, project } = await seed()
    const post = async () =>
      (await call('POST', `/projects/${project.id}/comments`, author, { body: 'x' })).json().id
    const mod = await createUser({ isAdmin: true })
    const a = await post()
    const b = await post()
    const c = await post()
    expect((await call('DELETE', `/projects/${project.id}/comments/${a}`, reader)).statusCode).toBe(
      403
    )
    expect((await call('DELETE', `/projects/${project.id}/comments/${a}`, author)).statusCode).toBe(
      200
    )
    expect((await call('DELETE', `/projects/${project.id}/comments/${b}`, owner)).statusCode).toBe(
      200
    )
    expect((await call('DELETE', `/projects/${project.id}/comments/${c}`, mod)).statusCode).toBe(
      200
    )
    expect(await db.comment.count({ where: { id: { in: [a, b, c] } } })).toBe(0)
  })

  it('keeps a deleted comment with replies as an empty placeholder', async () => {
    const { author, reader, project, comment } = await seed()
    await call('POST', `/projects/${project.id}/comments`, reader, {
      body: 'Reply',
      parentId: comment.id,
    })
    await call('DELETE', `/projects/${project.id}/comments/${comment.id}`, author)
    const [thread] = (await call('GET', `/projects/${project.id}/comments`)).json()
    expect(thread).toMatchObject({ deleted: true, body: '', user: null, userId: null })
    expect(thread.replies).toHaveLength(1)
  })
})

describe('reporting beyond projects', () => {
  it('files a comment report with what it said, and a take-down removes the comment', async () => {
    const { author, reader, project, comment } = await seed()
    const mod = await createUser({ isAdmin: true })
    const filed = await call(
      'POST',
      `/projects/${project.id}/comments/${comment.id}/report`,
      reader,
      {
        reason: 'HARASSMENT',
      }
    )
    expect(filed.statusCode).toBe(201)
    expect(
      (
        await call('POST', `/projects/${project.id}/comments/${comment.id}/report`, reader, {
          reason: 'SPAM',
        })
      ).statusCode
    ).toBe(409)

    const [queued] = (await call('GET', '/admin/reports', mod)).json()
    expect(queued).toMatchObject({ targetType: 'COMMENT', excerpt: 'First!' })

    const decided = await call('POST', `/admin/reports/${queued.id}/decision`, mod, {
      decision: 'TAKE_DOWN',
    })
    expect(decided.statusCode).toBe(200)
    expect(await db.comment.count({ where: { id: comment.id } })).toBe(0)
    const told = await db.notification.findFirst({
      where: { userId: author.id, type: 'CONTENT_MODERATED' },
    })
    expect(told?.payload).toMatchObject({ target: 'comment', action: 'TAKEN_DOWN' })
  })

  it('reports a profile, and can suspend its owner with the decision', async () => {
    const target = await createUser()
    await db.user.update({ where: { id: target.id }, data: { bio: 'Rude things' } })
    const reader = await createUser()
    const mod = await createUser({ isAdmin: true })
    expect(
      (await call('POST', `/users/${target.id}/report`, reader, { reason: 'HARASSMENT' }))
        .statusCode
    ).toBe(201)
    expect(
      (await call('POST', `/users/${reader.id}/report`, reader, { reason: 'SPAM' })).statusCode
    ).toBe(400)

    const [queued] = (await call('GET', '/admin/reports?type=USER', mod)).json()
    await call('POST', `/admin/reports/${queued.id}/decision`, mod, {
      decision: 'TAKE_DOWN',
      suspend: true,
    })
    const after = await db.user.findUniqueOrThrow({ where: { id: target.id } })
    expect(after.bio).toBeNull()
    expect(after.suspendedAt).not.toBeNull()
  })

  it('reports a collection', async () => {
    const owner = await createUser()
    const reader = await createUser()
    const collection = await db.collection.create({
      data: { ownerId: owner.id, title: 'Spam list' },
    })
    const res = await call('POST', `/collections/${collection.id}/report`, reader, {
      reason: 'SPAM',
    })
    expect(res.statusCode).toBe(201)
  })
})

describe('account moderation', () => {
  it('suspends and lifts, telling the student each time', async () => {
    const student = await createUser()
    const mod = await createUser({ isAdmin: true })
    expect(
      (await call('POST', `/admin/users/${student.id}/suspend`, mod, { note: 'Spam' })).statusCode
    ).toBe(200)
    const blocked = await call('POST', '/projects', student, { title: 'x' })
    expect(blocked.statusCode).toBe(403)
    expect((await call('DELETE', `/admin/users/${student.id}/suspension`, mod)).statusCode).toBe(
      200
    )
    expect((await call('POST', '/projects', student, { title: 'x' })).statusCode).toBe(201)
    expect(
      await db.notification.count({ where: { userId: student.id, type: 'ACCOUNT_MODERATED' } })
    ).toBe(2)
  })

  it('finds accounts by name or email', async () => {
    await createUser({ name: 'Findable Person' })
    const mod = await createUser({ isAdmin: true })
    const found = (await call('GET', '/admin/users?q=findable', mod)).json()
    expect(found.map((u: { name: string }) => u.name)).toEqual(['Findable Person'])
  })

  it('restores a taken-down project so its owner can publish it again', async () => {
    const owner = await createUser()
    const mod = await createUser({ isAdmin: true })
    const project = await createProject(owner.id)
    await db.project.update({ where: { id: project.id }, data: { takenDownAt: new Date() } })
    expect((await call('POST', `/admin/projects/${project.id}/restore`, mod)).statusCode).toBe(200)
    expect(
      (await call('PATCH', `/projects/${project.id}`, owner, { visibility: 'PUBLIC' })).statusCode
    ).toBe(200)
  })
})

describe('blocking reaches past messages', () => {
  it('stops comments, reactions and follows either way, and ends existing follows', async () => {
    const owner = await createUser()
    const pest = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    await call('POST', `/users/${owner.id}/follow`, pest)
    await call('POST', `/messages/${pest.id}/block`, owner)

    expect(await db.follow.count()).toBe(0)
    expect(
      (await call('POST', `/projects/${project.id}/comments`, pest, { body: 'hi' })).statusCode
    ).toBe(403)
    expect(
      (await call('POST', `/projects/${project.id}/reactions`, pest, { kind: 'IMPRESSIVE' }))
        .statusCode
    ).toBe(403)
    expect((await call('POST', `/users/${owner.id}/follow`, pest)).statusCode).toBe(403)
    expect((await call('POST', `/users/${pest.id}/follow`, owner)).statusCode).toBe(403)
  })
})
