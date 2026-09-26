import pg from 'pg'
import { db } from '../db/client.js'

/**
 * Telling an open tab that something of theirs changed.
 *
 * The bell and Messages used to poll every 10–30 seconds. Now each signed-in
 * tab holds one `GET /events` stream open, and the API pushes a bare event
 * name down it — `notification` or `message` — when a row for that student is
 * written. The event carries no data: the tab refetches what it already knows
 * how to fetch, through the same routes and the same visibility rules, so
 * nothing new can leak through the stream.
 *
 * Events travel through Postgres `NOTIFY` rather than an in-memory emitter,
 * because the write and the stream are often on different API instances: a
 * message sent through one replica has to reach a tab connected to another.
 * Each instance holds one `LISTEN` connection and hands what it hears to the
 * streams open on it.
 *
 * Delivery is best-effort. A publish that fails, or an event that arrives
 * while an instance's listener is reconnecting, is simply missed; the tab
 * catches up when its stream reconnects (see `resync` below) or when the
 * student next focuses the window.
 */

export type LiveEvent = 'notification' | 'message'

/** Sent to every stream on an instance whose listener dropped and came back. */
export type StreamEvent = LiveEvent | 'resync'

const CHANNEL = 'live'

/**
 * Recipients per NOTIFY. A payload is capped at 8000 bytes, and a user id
 * serialized into the list costs 39 — so a 500-follower publish is four
 * notifies, not one that Postgres rejects.
 */
const BATCH = 150

/** Tell each of `userIds`' open tabs that `event` happened. Never throws. */
export async function publish(userIds: string[], event: LiveEvent): Promise<void> {
  const unique = [...new Set(userIds)]
  for (let i = 0; i < unique.length; i += BATCH) {
    const payload = JSON.stringify({ event, userIds: unique.slice(i, i + BATCH) })
    // The row this announces is already written; a missed event only delays
    // the tab, so it must never fail the request that caused it.
    await db.$executeRaw`SELECT pg_notify(${CHANNEL}, ${payload})`.catch(() => {})
  }
}

type Send = (event: StreamEvent) => void

const streams = new Map<string, Set<Send>>()

/**
 * Receive `userId`'s events on this instance until the returned function is
 * called. The first subscriber opens the instance's listener.
 */
export async function subscribe(userId: string, send: Send): Promise<() => void> {
  await ensureListening()
  let mine = streams.get(userId)
  if (!mine) streams.set(userId, (mine = new Set()))
  mine.add(send)
  return () => {
    mine.delete(send)
    if (mine.size === 0) streams.delete(userId)
  }
}

function deliver(userId: string, event: StreamEvent) {
  for (const send of streams.get(userId) ?? []) send(event)
}

let listener: pg.Client | null = null
let connecting: Promise<void> | null = null
let everConnected = false

/** How long to wait before reopening a listener that dropped. */
const RECONNECT_MS = 5_000

function ensureListening(): Promise<void> {
  if (listener) return Promise.resolve()
  connecting ??= connect().finally(() => (connecting = null))
  return connecting
}

async function connect(): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  client.on('notification', (msg) => {
    if (msg.channel !== CHANNEL || !msg.payload) return
    const { event, userIds } = JSON.parse(msg.payload) as { event: LiveEvent; userIds: string[] }
    for (const userId of userIds) deliver(userId, event)
  })
  const drop = () => {
    if (listener !== client) return
    listener = null
    client.end().catch(() => {})
    setTimeout(() => {
      if (streams.size > 0) ensureListening().catch(() => {})
    }, RECONNECT_MS).unref()
  }
  client.on('error', drop)
  client.on('end', drop)

  await client.connect()
  await client.query(`LISTEN ${CHANNEL}`)
  listener = client

  // Whatever was published while this instance was deaf is lost; tell every
  // tab still attached here to refetch rather than trust its badges.
  if (everConnected) for (const userId of streams.keys()) deliver(userId, 'resync')
  everConnected = true
}

/** Close the listener. For tests and shutdown; the next subscribe reopens it. */
export async function stopListening(): Promise<void> {
  const client = listener
  listener = null
  everConnected = false
  await client?.end()
}
