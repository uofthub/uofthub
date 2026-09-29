import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

async function search(q: string, as?: { id: string; email: string }) {
  const app = await getApp()
  return app.inject({
    method: 'GET',
    url: `/users/search?q=${encodeURIComponent(q)}`,
    ...(as ? { cookies: await cookieFor(as) } : {}),
  })
}

const names = (res: { json: () => { name: string }[] }) => res.json().map((p) => p.name)

describe('GET /users/search', () => {
  it('is for signed-in students only', async () => {
    await createUser({ name: 'Maya Chen' })
    expect((await search('maya')).statusCode).toBe(401)
  })

  it('matches name, handle and program, every word somewhere', async () => {
    const me = await createUser()
    const maya = await createUser({ name: 'Maya Chen' })
    await db.user.update({ where: { id: maya.id }, data: { program: 'Computer Science' } })
    const arjun = await createUser({ name: 'Arjun Patel' })
    await db.user.update({ where: { id: arjun.id }, data: { handle: 'robo-arjun' } })

    expect(names(await search('chen', me))).toEqual(['Maya Chen'])
    expect(names(await search('robo', me))).toEqual(['Arjun Patel'])
    expect(names(await search('maya computer', me))).toEqual(['Maya Chen'])
    expect(names(await search('maya engineering', me))).toEqual([])
  })

  it('puts names that start with the query first, then the most followed', async () => {
    const me = await createUser()
    const popular = await createUser({ name: 'Leo Carter' })
    await createUser({ name: 'Carter Wu' })
    await db.user.update({ where: { id: popular.id }, data: { program: 'Carter studies' } })
    const fan = await createUser()
    await db.follow.create({ data: { followerId: fan.id, followingId: popular.id } })

    // Both names contain a word starting "carter"; Leo has the follower.
    expect(names(await search('carter', me))).toEqual(['Leo Carter', 'Carter Wu'])
    expect(names(await search('car', me))).toEqual(['Leo Carter', 'Carter Wu'])
  })

  it('leaves out unconfirmed, suspended and blocked accounts', async () => {
    const me = await createUser()
    await createUser({ name: 'Sam Unconfirmed', verified: false })
    const suspended = await createUser({ name: 'Sam Suspended' })
    await db.user.update({ where: { id: suspended.id }, data: { suspendedAt: new Date() } })
    const blocker = await createUser({ name: 'Sam Blocker' })
    await db.userBlock.create({ data: { blockerId: blocker.id, blockedId: me.id } })
    const blocked = await createUser({ name: 'Sam Blocked' })
    await db.userBlock.create({ data: { blockerId: me.id, blockedId: blocked.id } })
    await createUser({ name: 'Sam Visible' })

    expect(names(await search('sam', me))).toEqual(['Sam Visible'])
  })

  it('treats wildcards and punctuation as nothing', async () => {
    const me = await createUser()
    await createUser({ name: 'Maya Chen' })
    expect((await search('%', me)).json()).toEqual([])
    expect((await search('_', me)).json()).toEqual([])
  })
})
