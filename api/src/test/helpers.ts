import type { FastifyInstance } from 'fastify'
import type { Visibility, ProjectType, ProjectStatus } from '@prisma/client'
import { buildApp } from '../app.js'
import { db } from '../db/client.js'
import { unconfirmedHandle, uniqueProjectSlug } from '../lib/handles.js'

/**
 * Shared scaffolding for the route tests. Requests go through
 * `app.inject()` — the real routing, hooks, auth and serialization, with no
 * socket — so a test failing means the endpoint is wrong, not the transport.
 */

let cached: FastifyInstance | null = null

/** One app per run; building it per test would re-register plugins needlessly. */
export async function getApp(): Promise<FastifyInstance> {
  if (!cached) {
    cached = await buildApp()
    await cached.ready()
  }
  return cached
}

/** Empties every table. Called before each test so cases can't leak into one another. */
export async function resetDb(): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t.tablename}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`)
}

let ip = 0

/**
 * A distinct source address per call.
 *
 * `app.inject()` reports every request as 127.0.0.1, and the credential routes
 * are rate-limited to 10 per 15 minutes per IP — so a file that signs in a
 * dozen times would start getting 429s that have nothing to do with what it is
 * testing. The limiter is left at its real setting and the requests are simply
 * made to look like they come from different clients, which is also what makes
 * a deliberate test of the limit (same address, repeated) mean something.
 */
export function uniqueIp(): string {
  ip += 1
  return `10.${(ip >> 16) & 255}.${(ip >> 8) & 255}.${ip & 255}`
}

let seq = 0

export async function createUser(
  overrides: { email?: string; name?: string; isAdmin?: boolean; verified?: boolean } = {}
) {
  seq += 1
  const faculty = overrides.email?.endsWith('@utoronto.ca') ?? false
  return db.user.create({
    data: {
      email: overrides.email ?? `student${seq}@mail.utoronto.ca`,
      name: overrides.name ?? `Student ${seq}`,
      handle: overrides.verified === false ? unconfirmedHandle() : `student-${seq}`,
      isAdmin: overrides.isAdmin ?? false,
      faculty: faculty ? 'Arts & Science' : undefined,
      // Confirmed unless a test says otherwise — the state every account a
      // route sees is in, since an unconfirmed one cannot sign in.
      emailVerifiedAt: overrides.verified === false ? null : new Date(),
    },
  })
}

/** A session cookie for this user, signed the same way `/auth/login` signs one. */
export async function cookieFor(user: { id: string; email: string }): Promise<{ token: string }> {
  const app = await getApp()
  return {
    token: app.jwt.sign({
      sub: user.id,
      email: user.email,
      sv: (user as { sessionVersion?: number }).sessionVersion ?? 0,
    }),
  }
}

export async function createProject(
  ownerId: string,
  overrides: {
    title?: string
    visibility?: Visibility
    description?: string
    tags?: string[]
    /** The course it was made for, as stored: upper-cased. */
    courseCode?: string
    /**
     * Left to mirror the routes by default — anything not PRIVATE is stamped
     * as published, exactly as POST/PATCH /projects do. Pass it explicitly to
     * order a feed, or `null` for a project that was never visible.
     */
    publishedAt?: Date | null
    /** Hidden from everyone but its makers until then. */
    showFrom?: Date | null
    /**
     * Defaults the way the routes leave it: announced when published, unless
     * a future show-from date means the sweep has yet to announce it.
     */
    announcedAt?: Date | null
    viewCount?: number
    /**
     * Unique views recorded today — what trending ranks by. `viewCount` alone
     * is the owner's lifetime total and no longer moves a ranking.
     */
    recentViews?: number
    type?: ProjectType
    status?: ProjectStatus
    pitch?: string
  } = {}
) {
  seq += 1
  const visibility = overrides.visibility ?? 'PRIVATE'
  const showFrom = overrides.showFrom ?? null
  const hidden = !!showFrom && showFrom > new Date()
  const published =
    overrides.publishedAt !== undefined
      ? overrides.publishedAt
      : visibility === 'PRIVATE'
        ? null
        : hidden
          ? showFrom
          : new Date()
  const announced =
    overrides.announcedAt !== undefined ? overrides.announcedAt : hidden ? null : published

  const title = overrides.title ?? `Project ${seq}`
  const project = await db.project.create({
    data: {
      ownerId,
      title,
      slug: await uniqueProjectSlug(db, ownerId, title),
      pitch: overrides.pitch,
      type: overrides.type,
      status: overrides.status,
      description: overrides.description,
      tags: overrides.tags ?? [],
      courseCode: overrides.courseCode,
      visibility,
      publishedAt: published,
      showFrom,
      announcedAt: announced,
      viewCount: overrides.viewCount ?? overrides.recentViews ?? 0,
    },
  })
  if (overrides.recentViews) {
    const date = new Date()
    date.setUTCHours(0, 0, 0, 0)
    await db.projectDailyView.create({
      data: { projectId: project.id, date, count: overrides.recentViews },
    })
  }
  return project
}

/** A group with `userId` as its admin, as a moderator would have set it up. */
export async function createOrg(userId: string, overrides: { slug?: string } = {}) {
  seq += 1
  return db.organization.create({
    data: {
      name: `Group ${seq}`,
      slug: overrides.slug ?? `group-${seq}`,
      contactEmail: 'exec@mail.utoronto.ca',
      contactRole: 'President',
      members: { create: { userId, role: 'ADMIN' } },
    },
  })
}
