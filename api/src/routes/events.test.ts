import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { stopListening } from '../lib/live.js'
import { cookieFor, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * The live stream behind the bell and Messages. These go over a real socket
 * rather than `app.inject()`: inject waits for the response to end, and a
 * stream that ended would not be one. Events really do travel through
 * Postgres NOTIFY, as they do between replicas in production.
 */

type User = { id: string; email: string }

let base = ''

beforeAll(async () => {
  const app = await getApp()
  base = await app.listen({ port: 0, host: '127.0.0.1' })
})

afterAll(async () => {
  await stopListening()
  await (await getApp()).close()
})

async function authHeader(user: User) {
  return { cookie: `token=${(await cookieFor(user)).token}` }
}

/** Open `user`'s stream; `next()` resolves with the next named event on it. */
async function openStream(user: User) {
  const abort = new AbortController()
  const res = await fetch(`${base}/events`, { headers: await authHeader(user), signal: abort.signal })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const next = async (): Promise<string> => {
    for (;;) {
      const match = buffer.match(/^event: (\w+)$/m)
      if (match) {
        buffer = buffer.slice(match.index! + match[0].length)
        return match[1]
      }
      const { value, done } = await reader.read()
      if (done) throw new Error('stream ended')
      buffer += decoder.decode(value, { stream: true })
    }
  }
  return { res, next, close: () => abort.abort() }
}

function post(path: string, user: User, body: unknown) {
  return authHeader(user).then((headers) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

describe('GET /events', () => {
  it('refuses a request without a session', async () => {
    const res = await fetch(`${base}/events`)
    expect(res.status).toBe(401)
  })

  it('is an event stream the web app may read across origins', async () => {
    const me = await createUser()
    const stream = await openStream(me)
    try {
      expect(stream.res.status).toBe(200)
      expect(stream.res.headers.get('content-type')).toBe('text/event-stream')
      // Headers the CORS plugin set survive the hand-written response.
      expect(stream.res.headers.get('access-control-allow-credentials')).toBe('true')
    } finally {
      stream.close()
    }
  })

  it('tells both people in a conversation about a new message', async () => {
    const a = await createUser()
    const b = await createUser()
    const toB = await openStream(b)
    const toA = await openStream(a)
    try {
      expect((await post(`/messages/${b.id}`, a, { body: 'Hi' })).status).toBe(201)
      expect(await toB.next()).toBe('message')
      expect(await toA.next()).toBe('message')
    } finally {
      toB.close()
      toA.close()
    }
  })

  it('tells a student when a notification is written for them, and nobody else', async () => {
    const a = await createUser()
    const b = await createUser()
    const bystander = await createUser()
    const toB = await openStream(b)
    const toBystander = await openStream(bystander)
    try {
      expect((await post(`/users/${b.id}/follow`, a, {})).status).toBeLessThan(300)
      expect(await toB.next()).toBe('notification')

      // The bystander's next event is the message sent to them afterwards,
      // not the follow that came first.
      await post(`/messages/${bystander.id}`, a, { body: 'Hi' })
      expect(await toBystander.next()).toBe('message')
    } finally {
      toB.close()
      toBystander.close()
    }
  })
})
