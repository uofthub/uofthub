import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.js'
import { hashPassword } from '../lib/password.js'
import { cookieFor, createUser, getApp, resetDb, uniqueIp } from '../test/helpers.js'

/**
 * The emails carry the only copy of each token, so they are captured here
 * rather than sent: a test follows the link exactly as a student would.
 */
const sent = vi.hoisted(() => ({
  verify: [] as { to: string; token: string }[],
  reset: [] as { to: string; token: string; reason: string }[],
  already: [] as string[],
}))
vi.mock('../lib/authEmails.js', () => ({
  sendVerificationEmail: async (to: string, _name: string, token: string) => {
    sent.verify.push({ to, token })
  },
  sendPasswordResetEmail: async (to: string, token: string, reason: string) => {
    sent.reset.push({ to, token, reason })
  },
  sendAlreadyRegisteredEmail: async (to: string) => {
    sent.already.push(to)
  },
}))

beforeEach(async () => {
  await resetDb()
  sent.verify.length = 0
  sent.reset.length = 0
  sent.already.length = 0
})

/**
 * Email + password sign-up and sign-in. The Microsoft OAuth flow is not
 * covered here — it needs a live identity provider — but the account states it
 * produces are, since those are what /login has to cope with.
 */

const GOOD_PASSWORD = 'correct horse battery'

// Each call gets its own source address — see uniqueIp() for why.
const post = async (url: string, payload: Record<string, unknown>, cookies?: { token: string }) =>
  (await getApp()).inject({ method: 'POST', url, payload, cookies, remoteAddress: uniqueIp() })

const register = (payload: Record<string, unknown>) =>
  post('/auth/register', { acceptTerms: true, ...payload })
const login = (payload: Record<string, unknown>) => post('/auth/login', payload)

/** Sign up and follow the emailed link, as a student would. Returns the verify response. */
async function signUp(email: string, password = GOOD_PASSWORD) {
  await register({ name: 'Ada', email, password })
  const token = sent.verify.filter((m) => m.to === email).at(-1)!.token
  return post('/auth/verify', { token })
}

const tokenCookie = (res: Awaited<ReturnType<typeof post>>) =>
  res.cookies.find((c) => c.name === 'token')

describe('POST /auth/register', () => {
  it('refuses an account without agreeing to the Terms', async () => {
    const res = await register({
      name: 'Ada',
      email: 'ada@mail.utoronto.ca',
      password: GOOD_PASSWORD,
      acceptTerms: false,
    })
    expect(res.statusCode).toBe(400)
    expect(await db.user.count()).toBe(0)
  })

  it('records when the Terms were agreed to', async () => {
    await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    const user = await db.user.findUniqueOrThrow({ where: { email: 'ada@mail.utoronto.ca' } })
    expect(user.termsAcceptedAt).toBeInstanceOf(Date)
  })

  it('refuses anything that is not exactly one U of T address', async () => {
    for (const email of [
      'me@gmail.com,x@mail.utoronto.ca',
      '"me@gmail.com"@mail.utoronto.ca',
      'a b@mail.utoronto.ca',
      'me@gmail.com <x@mail.utoronto.ca>',
      'x@toronto.com',
    ]) {
      const res = await register({ name: 'Mallory', email, password: GOOD_PASSWORD })
      expect(res.statusCode, email).toBe(403)
    }
    expect(await db.user.count()).toBe(0)
    expect(sent.verify).toHaveLength(0)
  })

  it('creates an unconfirmed account and emails a link, without signing in', async () => {
    const res = await register({
      name: 'Ada',
      email: 'ada@mail.utoronto.ca',
      password: GOOD_PASSWORD,
    })

    expect(res.statusCode).toBe(202)
    expect(tokenCookie(res)).toBeUndefined()
    expect(sent.verify).toHaveLength(1)
    const user = await db.user.findUniqueOrThrow({ where: { email: 'ada@mail.utoronto.ca' } })
    expect(user.emailVerifiedAt).toBeNull()
  })

  it('never stores the password itself', async () => {
    await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    const user = await db.user.findUniqueOrThrow({ where: { email: 'ada@mail.utoronto.ca' } })

    expect(user.passwordHash).not.toContain(GOOD_PASSWORD)
    expect(user.passwordHash).toMatch(/^scrypt\$/)
  })

  it.each(['someone@gmail.com', 'someone@utoronto.ca.evil.com', 'someone@notutoronto.ca'])(
    'refuses a non-U of T address: %s',
    async (email) => {
      const res = await register({ name: 'Nope', email, password: GOOD_PASSWORD })
      expect(res.statusCode).toBe(403)
      expect(await db.user.count()).toBe(0)
    }
  )

  it('accepts both U of T domains', async () => {
    expect(
      (await register({ name: 'S', email: 's@mail.utoronto.ca', password: GOOD_PASSWORD }))
        .statusCode
    ).toBe(202)
    expect(
      (await register({ name: 'F', email: 'f@utoronto.ca', password: GOOD_PASSWORD })).statusCode
    ).toBe(202)
  })

  it('normalises the address, so casing cannot create a second account', async () => {
    await register({ name: 'Ada', email: 'Ada@Mail.UToronto.CA', password: GOOD_PASSWORD })
    await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    expect(await db.user.count()).toBe(1)
  })

  it('rejects a password below the minimum length', async () => {
    const res = await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: 'short' })
    expect(res.statusCode).toBe(400)
  })

  it('rejects an unbounded password rather than hashing it', async () => {
    const res = await register({
      name: 'Ada',
      email: 'ada@mail.utoronto.ca',
      password: 'a'.repeat(5000),
    })
    expect(res.statusCode).toBe(400)
  })

  it('requires all three fields', async () => {
    expect(
      (await register({ email: 'a@mail.utoronto.ca', password: GOOD_PASSWORD })).statusCode
    ).toBe(400)
    expect((await register({ name: 'A', password: GOOD_PASSWORD })).statusCode).toBe(400)
    expect((await register({ name: 'A', email: 'a@mail.utoronto.ca' })).statusCode).toBe(400)
  })

  it('never sets a password on an existing Microsoft account — it emails the owner instead', async () => {
    const existing = await createUser({ email: 'oauth@mail.utoronto.ca' })

    const res = await register({
      name: 'Mallory',
      email: 'oauth@mail.utoronto.ca',
      password: GOOD_PASSWORD,
    })

    expect(res.statusCode).toBe(202)
    expect(tokenCookie(res)).toBeUndefined()
    const after = await db.user.findUniqueOrThrow({ where: { id: existing.id } })
    expect(after.passwordHash).toBeNull()
    expect(after.name).toBe(existing.name)
    // The link to add a password goes to the address, i.e. to its real owner.
    expect(sent.reset).toEqual([
      expect.objectContaining({ to: 'oauth@mail.utoronto.ca', reason: 'set' }),
    ])
  })

  it('answers an address that already has a password exactly like a new one', async () => {
    await signUp('ada@mail.utoronto.ca')
    const again = await register({
      name: 'Ada',
      email: 'ada@mail.utoronto.ca',
      password: 'another good one',
    })
    const fresh = await register({
      name: 'Bo',
      email: 'bo@mail.utoronto.ca',
      password: GOOD_PASSWORD,
    })

    expect(again.statusCode).toBe(fresh.statusCode)
    expect(again.json()).toEqual(fresh.json())
    expect(sent.already).toEqual(['ada@mail.utoronto.ca'])
    // And the existing password is untouched.
    expect(
      (await login({ email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })).statusCode
    ).toBe(200)
  })
})

describe('POST /auth/verify', () => {
  it('confirms the account and signs in with an httpOnly session cookie', async () => {
    const res = await signUp('ada@mail.utoronto.ca')

    expect(res.statusCode).toBe(200)
    const cookie = tokenCookie(res)
    expect(cookie).toBeDefined()
    expect(cookie!.httpOnly).toBe(true)
    expect(cookie!.sameSite?.toLowerCase()).toBe('lax')
    const user = await db.user.findUniqueOrThrow({ where: { email: 'ada@mail.utoronto.ca' } })
    expect(user.emailVerifiedAt).not.toBeNull()
  })

  it('works once', async () => {
    await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    const { token } = sent.verify[0]
    expect((await post('/auth/verify', { token })).statusCode).toBe(200)
    expect((await post('/auth/verify', { token })).statusCode).toBe(400)
  })

  it('gives the account its handle only once the address is proven', async () => {
    await register({ name: 'Ada Lovelace', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    const where = { email: 'ada@mail.utoronto.ca' }
    // Until then a placeholder nobody can choose, so a sign-up with somebody
    // else's address can't squat their name.
    expect((await db.user.findUniqueOrThrow({ where })).handle).toMatch(/^unconfirmed-/)
    await post('/auth/verify', { token: sent.verify[0].token })
    expect((await db.user.findUniqueOrThrow({ where })).handle).toBe('ada-lovelace')
  })

  it('refuses a made-up token', async () => {
    expect((await post('/auth/verify', { token: 'nope' })).statusCode).toBe(400)
  })

  it('stops an older link working once a newer one is sent', async () => {
    await register({ name: 'Ada', email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    await post('/auth/resend-verification', { email: 'ada@mail.utoronto.ca' })
    expect(sent.verify).toHaveLength(2)
    expect((await post('/auth/verify', { token: sent.verify[0].token })).statusCode).toBe(400)
    expect((await post('/auth/verify', { token: sent.verify[1].token })).statusCode).toBe(200)
  })
})

describe('password reset', () => {
  it('sets a new password, confirms the address and ends other sessions', async () => {
    const user = await createUser({ email: 'ada@mail.utoronto.ca' })
    const old = await cookieFor(user)

    expect(
      (await post('/auth/forgot-password', { email: 'ada@mail.utoronto.ca' })).statusCode
    ).toBe(202)
    const res = await post('/auth/reset-password', {
      token: sent.reset[0].token,
      password: 'a new good password',
    })

    expect(res.statusCode).toBe(200)
    expect(tokenCookie(res)).toBeDefined()
    expect(
      (await login({ email: 'ada@mail.utoronto.ca', password: 'a new good password' })).statusCode
    ).toBe(200)
    const app = await getApp()
    expect((await app.inject({ method: 'GET', url: '/auth/me', cookies: old })).statusCode).toBe(
      401
    )
  })

  it('says the same for an unknown address', async () => {
    const res = await post('/auth/forgot-password', { email: 'nobody@mail.utoronto.ca' })
    expect(res.statusCode).toBe(202)
    expect(sent.reset).toHaveLength(0)
  })

  it('refuses a used or unknown token', async () => {
    await createUser({ email: 'ada@mail.utoronto.ca' })
    await post('/auth/forgot-password', { email: 'ada@mail.utoronto.ca' })
    const { token } = sent.reset[0]
    expect(
      (await post('/auth/reset-password', { token, password: 'a new good password' })).statusCode
    ).toBe(200)
    expect(
      (await post('/auth/reset-password', { token, password: 'another new one' })).statusCode
    ).toBe(400)
    expect(
      (await post('/auth/reset-password', { token: 'x', password: 'another new one' })).statusCode
    ).toBe(400)
  })
})

describe('POST /auth/password', () => {
  it('needs the current password and ends other sessions', async () => {
    const user = await createUser({ email: 'ada@mail.utoronto.ca' })
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(GOOD_PASSWORD) },
    })
    const session = await cookieFor(user)

    const wrong = await post(
      '/auth/password',
      { currentPassword: 'wrong wrong wrong', newPassword: 'a new good password' },
      session
    )
    expect(wrong.statusCode).toBe(403)

    const ok = await post(
      '/auth/password',
      { currentPassword: GOOD_PASSWORD, newPassword: 'a new good password' },
      session
    )
    expect(ok.statusCode).toBe(200)
    const app = await getApp()
    expect(
      (await app.inject({ method: 'GET', url: '/auth/me', cookies: session })).statusCode
    ).toBe(401)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/auth/me',
          cookies: { token: tokenCookie(ok)!.value },
        })
      ).statusCode
    ).toBe(200)
  })

  it('lets a Microsoft-only account add a first password without one', async () => {
    const user = await createUser({ email: 'oauth@mail.utoronto.ca' })
    const res = await post(
      '/auth/password',
      { newPassword: 'a new good password' },
      await cookieFor(user)
    )
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await signUp('ada@mail.utoronto.ca')
  })

  it('signs in with the right password', async () => {
    const res = await login({ email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    expect(res.statusCode).toBe(200)
    expect(tokenCookie(res)).toBeDefined()
  })

  it('refuses an unconfirmed account even with the right password', async () => {
    await register({ name: 'Bo', email: 'bo@mail.utoronto.ca', password: GOOD_PASSWORD })
    const res = await login({ email: 'bo@mail.utoronto.ca', password: GOOD_PASSWORD })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('UNVERIFIED')
    expect(tokenCookie(res)).toBeUndefined()
  })

  it('rejects the wrong password without issuing a session', async () => {
    const res = await login({ email: 'ada@mail.utoronto.ca', password: 'wrong horse battery' })
    expect(res.statusCode).toBe(401)
    expect(tokenCookie(res)).toBeUndefined()
  })

  it('gives the same answer for an unknown account as for a wrong password', async () => {
    const unknown = await login({ email: 'nobody@mail.utoronto.ca', password: GOOD_PASSWORD })
    const wrong = await login({ email: 'ada@mail.utoronto.ca', password: 'wrong horse battery' })

    expect(unknown.statusCode).toBe(401)
    expect(unknown.json()).toEqual(wrong.json())
  })

  it('answers a Microsoft-only account exactly as it answers a wrong password', async () => {
    await createUser({ email: 'oauth@mail.utoronto.ca' })
    const oauth = await login({ email: 'oauth@mail.utoronto.ca', password: GOOD_PASSWORD })
    const unknown = await login({ email: 'nobody@mail.utoronto.ca', password: GOOD_PASSWORD })

    // A different answer would tell anyone which addresses are registered and
    // how; the shared message points at the UTORid button for everybody.
    expect(oauth.statusCode).toBe(401)
    expect(oauth.json()).toEqual(unknown.json())
    expect(oauth.json().error).toMatch(/UTORid/)
  })

  it('takes as long to refuse an unknown address as a wrong password', async () => {
    const time = async (email: string) => {
      const start = performance.now()
      await login({ email, password: 'wrong horse battery' })
      return performance.now() - start
    }
    // Warm-up, then alternate so a slow moment on the machine lands on both.
    await time('nobody@mail.utoronto.ca')
    const known: number[] = []
    const unknown: number[] = []
    for (let i = 0; i < 4; i++) {
      known.push(await time('ada@mail.utoronto.ca'))
      unknown.push(await time(`nobody${i}@mail.utoronto.ca`))
    }
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
    // Without the dummy hash an unknown address skipped scrypt entirely and
    // answered in a fraction of the time.
    expect(median(unknown)).toBeGreaterThan(median(known) * 0.5)
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
})

describe('POST /auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = await signUp('ada@mail.utoronto.ca')
    const token = tokenCookie(res)!.value

    const app = await getApp()
    const out = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { token } })

    expect(out.statusCode).toBe(200)
    const cleared = out.cookies.find((c) => c.name === 'token')
    expect(cleared?.value).toBe('')
  })

  it('ends a copy of the token too, but no other session', async () => {
    const app = await getApp()
    await signUp('ada@mail.utoronto.ca')
    const here = tokenCookie(
      await login({ email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    )!
    const there = tokenCookie(
      await login({ email: 'ada@mail.utoronto.ca', password: GOOD_PASSWORD })
    )!
    await app.inject({ method: 'POST', url: '/auth/logout', cookies: { token: here.value } })

    const me = (token: string) => app.inject({ method: 'GET', url: '/auth/me', cookies: { token } })
    expect((await me(here.value)).statusCode).toBe(401)
    expect((await me(there.value)).statusCode).toBe(200)
  })
})

describe('POST /auth/logout-everywhere', () => {
  it('ends every session on the account', async () => {
    const user = await createUser()
    const a = await cookieFor(user)
    const b = await cookieFor(user)
    expect((await post('/auth/logout-everywhere', {}, a)).statusCode).toBe(200)
    const app = await getApp()
    expect((await app.inject({ method: 'GET', url: '/auth/me', cookies: b })).statusCode).toBe(401)
  })
})

describe('suspended accounts', () => {
  it('can read and sign out, but not write', async () => {
    const user = await createUser()
    await db.user.update({ where: { id: user.id }, data: { suspendedAt: new Date() } })
    const session = await cookieFor(user)
    const app = await getApp()

    expect(
      (await app.inject({ method: 'GET', url: '/auth/me', cookies: session })).statusCode
    ).toBe(200)
    const write = await app.inject({
      method: 'POST',
      url: '/projects',
      cookies: session,
      payload: { title: 'x' },
    })
    expect(write.statusCode).toBe(403)
    expect(write.json().code).toBe('SUSPENDED')
    expect((await post('/auth/logout', {}, session)).statusCode).toBe(200)
  })
})

describe('agreeing to the Terms', () => {
  it('blocks writes until the account agrees, then lets them through', async () => {
    const user = await createUser({ acceptedTerms: false })
    const session = await cookieFor(user)
    const app = await getApp()
    const createProject = () =>
      app.inject({ method: 'POST', url: '/projects', cookies: session, payload: { title: 'x' } })

    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: session })
    expect(me.json()).toMatchObject({ termsAcceptedAt: null, termsCurrent: false })
    const blocked = await createProject()
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json().code).toBe('TERMS_NOT_ACCEPTED')

    expect((await post('/auth/accept-terms', {}, session)).statusCode).toBe(200)
    expect((await createProject()).statusCode).not.toBe(403)
    const after = await app.inject({ method: 'GET', url: '/auth/me', cookies: session })
    expect(after.json().termsCurrent).toBe(true)
  })

  it('asks again once the Terms change', async () => {
    const user = await createUser()
    await db.user.update({
      where: { id: user.id },
      data: { termsAcceptedAt: new Date('2020-01-01T00:00:00Z') },
    })
    const session = await cookieFor(user)
    const app = await getApp()
    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: session })
    expect(me.json().termsCurrent).toBe(false)
  })

  it('still lets the account sign out', async () => {
    const user = await createUser({ acceptedTerms: false })
    expect((await post('/auth/logout', {}, await cookieFor(user))).statusCode).toBe(200)
  })
})

describe('credential rate limiting', () => {
  it('cuts off repeated password guesses from one address', async () => {
    await signUp('ada@mail.utoronto.ca')

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

  it("does not let one address exhaust another's budget", async () => {
    await signUp('ada@mail.utoronto.ca')

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
