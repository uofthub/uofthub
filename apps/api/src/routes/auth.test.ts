import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createUser, getApp, resetDb, uniqueIp } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * Email + password sign-up and sign-in. The Microsoft OAuth flow is not
 * covered here — it needs a live identity provider — but the account states it
 * produces are, since those are what /login has to cope with.
 */

const GOOD_PASSWORD = 'correct horse battery'

// Each call gets its own source address — see uniqueIp() for why.
const register = async (payload: Record<string, unknown>) =>
  (await getApp()).inject({ method: 'POST', url: '/auth/register', payload, remoteAddress: uniqueIp() })

const login = async (payload: Record<string, unknown>) =>
  (await getApp()).inject({ method: 'POST', url: '/auth/login', payload, remoteAddress: uniqueIp() })

describe('POST /auth/register', () => {
  it('creates an account and issues an httpOnly session cookie', async () => {
    const res = await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })

    expect(res.statusCode).toBe(201)
    const cookie = res.cookies.find((c) => c.name === 'token')
    expect(cookie).toBeDefined()
    expect(cookie!.httpOnly).toBe(true)
    expect(cookie!.sameSite?.toLowerCase()).toBe('lax')
  })

  it('never stores the password itself', async () => {
    await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    const user = await db.user.findUniqueOrThrow({ where: { email: 'ada@mail.utoronto.ca' } })

    expect(user.passwordHash).not.toContain(GOOD_PASSWORD)
    expect(user.passwordHash).toMatch(/^scrypt\$/)
  })

  it.each([
    'someone@gmail.com',
    'someone@utoronto.ca.evil.com',
    'someone@notutoronto.ca',
  ])('refuses a non-U of T address: %s', async (email) => {
    const res = await register({ name: 'Nope', email, password: GOOD_PASSWORD })
    expect(res.statusCode).toBe(403)
    expect(await db.user.count()).toBe(0)
  })

  it('accepts both U of T domains', async () => {
    expect((await register({ name: 'S', email: 's@mail.utoronto.ca', password: GOOD_PASSWORD })).statusCode).toBe(201)
    expect((await register({ name: 'F', email: 'f@utoronto.ca', password: GOOD_PASSWORD })).statusCode).toBe(201)
  })

  it('normalises the address, so casing cannot create a second account', async () => {
    await register({ name: 'Ada', email: 'Ada@Mail.UToronto.CA', password: GOOD_PASSWORD })
    const res = await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })

    expect(res.statusCode).toBe(409)
    expect(await db.user.count()).toBe(1)
  })

  it('rejects a password below the minimum length', async () => {
    const res = await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: 'short' })
    expect(res.statusCode).toBe(400)
  })

  it('rejects an unbounded password rather than hashing it', async () => {
    const res = await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: 'a'.repeat(5000) })
    expect(res.statusCode).toBe(400)
  })

  it('requires all three fields', async () => {
    expect((await register({ email: 'a@mail.utoronto.ca', password: GOOD_PASSWORD })).statusCode).toBe(400)
    expect((await register({ name: 'A', password: GOOD_PASSWORD })).statusCode).toBe(400)
    expect((await register({ name: 'A', email: 'a@mail.utoronto.ca' })).statusCode).toBe(400)
  })

  it('links a password onto an existing Microsoft-only account instead of colliding', async () => {
    const existing = await createUser({ email: 'oauth@mail.utoronto.ca' })
    expect(existing.passwordHash).toBeNull()

    const res = await register({ name: 'OAuth', email: 'oauth@mail.utoronto.ca', password: GOOD_PASSWORD })

    expect(res.statusCode).toBe(201)
    expect(await db.user.count()).toBe(1)
    expect((await db.user.findUniqueOrThrow({ where: { id: existing.id } })).passwordHash).not.toBeNull()
  })
})

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
  })

  it('signs in with the right password', async () => {
    const res = await login({ email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    expect(res.statusCode).toBe(200)
    expect(res.cookies.find((c) => c.name === 'token')).toBeDefined()
  })

  it('rejects the wrong password without issuing a session', async () => {
    const res = await login({ email: 'ada@mail.utoronto.ca', password: 'wrong horse battery' })
    expect(res.statusCode).toBe(401)
    expect(res.cookies.find((c) => c.name === 'token')).toBeUndefined()
  })

  it('gives the same answer for an unknown account as for a wrong password', async () => {
    const unknown = await login({ email: 'nobody@mail.utoronto.ca', password: GOOD_PASSWORD })
    const wrong = await login({ email: 'ada@mail.utoronto.ca', password: 'wrong horse battery' })

    expect(unknown.statusCode).toBe(401)
    expect(unknown.json()).toEqual(wrong.json())
  })

  it('tells a Microsoft-only account to use the other button rather than 401ing', async () => {
    await createUser({ email: 'oauth@mail.utoronto.ca' })
    const res = await login({ email: 'oauth@mail.utoronto.ca', password: GOOD_PASSWORD })

    // A deliberate disclosure: without it an OAuth user has no way to learn why
    // their password never works. See the comment on the route.
    expect(res.statusCode).toBe(409)
  })

  it('requires both fields', async () => {
    expect((await login({ email: 'ada@mail.utoronto.ca' })).statusCode).toBe(400)
    expect((await login({ password: GOOD_PASSWORD })).statusCode).toBe(400)
  })
})

describe('GET /auth/me', () => {
  it('refuses a caller with no session', async () => {
    const app = await getApp()
    expect((await app.inject({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401)
  })

  it('returns the signed-in user, without the password hash', async () => {
    const user = await createUser({ email: 'ada@mail.utoronto.ca' })
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: '/auth/me', cookies: await cookieFor(user) })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: user.id, email: user.email, isAdmin: false })
    expect(res.json()).not.toHaveProperty('passwordHash')
  })

  it('reports a staff address as FACULTY and a student address as STUDENT', async () => {
    const app = await getApp()
    const student = await createUser({ email: 'stu@mail.utoronto.ca' })
    const staff = await createUser({ email: 'prof@utoronto.ca' })

    const asStudent = await app.inject({ method: 'GET', url: '/auth/me', cookies: await cookieFor(student) })
    const asStaff = await app.inject({ method: 'GET', url: '/auth/me', cookies: await cookieFor(staff) })

    expect(asStudent.json().role).toBe('STUDENT')
    expect(asStaff.json().role).toBe('FACULTY')
  })
})

describe('POST /auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    const token = res.cookies.find((c) => c.name === 'token')!.value

    const app = await getApp()
    const out = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { token } })

    expect(out.statusCode).toBe(200)
    const cleared = out.cookies.find((c) => c.name === 'token')
    expect(cleared?.value).toBe('')
  })
})

describe('credential rate limiting', () => {
  it('cuts off repeated password guesses from one address', async () => {
    await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })

    const app = await getApp()
    const attacker = uniqueIp()
    const guess = () =>
      app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ada@mail.utoronto.ca', password: 'not the password' },
        remoteAddress: attacker,
      })

    const codes: number[] = []
    for (let i = 0; i < 12; i++) codes.push((await guess()).statusCode)

    // 10 per 15 minutes, so the tail of a 12-guess run must be refused.
    expect(codes.filter((c) => c === 401)).toHaveLength(10)
    expect(codes.filter((c) => c === 429)).toHaveLength(2)
  })

  it('does not let one address exhaust another\'s budget', async () => {
    await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })

    const app = await getApp()
    const attacker = uniqueIp()
    for (let i = 0; i < 12; i++) {
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ada@mail.utoronto.ca', password: 'wrong' },
        remoteAddress: attacker,
      })
    }

    // Campus NAT means a legitimate student may share nothing but bad luck
    // with an attacker; a different address must still be able to sign in.
    const innocent = await login({ email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    expect(innocent.statusCode).toBe(200)
  })
})
