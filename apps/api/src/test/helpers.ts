import type { FastifyInstance } from 'fastify'
import type { Visibility } from '@prisma/client'
import { buildApp } from '../app.js'
import { db } from '../db/client.js'

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

let seq = 0

export async function createUser(
  overrides: { email?: string; name?: string; isAdmin?: boolean } = {}
) {
  seq += 1
  const faculty = overrides.email?.endsWith('@utoronto.ca') ?? false
  return db.user.create({
    data: {
      email: overrides.email ?? `student${seq}@mail.utoronto.ca`,
      name: overrides.name ?? `Student ${seq}`,
      isAdmin: overrides.isAdmin ?? false,
      faculty: faculty ? 'Arts & Science' : undefined,
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
      // Mirrors getRole() in routes/auth.ts: staff addresses are FACULTY.
      role: user.email.endsWith('@utoronto.ca') ? 'FACULTY' : 'STUDENT',
    }),
  }
}

export async function createProject(
  ownerId: string,
  overrides: { title?: string; visibility?: Visibility; description?: string } = {}
) {
  seq += 1
  return db.project.create({
    data: {
      ownerId,
      title: overrides.title ?? `Project ${seq}`,
      description: overrides.description,
      visibility: overrides.visibility ?? 'PRIVATE',
    },
  })
}

/** A verified group with `userId` as its admin, skipping the review flow. */
export async function createVerifiedOrg(userId: string, overrides: { slug?: string } = {}) {
  seq += 1
  return db.organization.create({
    data: {
      name: `Group ${seq}`,
      slug: overrides.slug ?? `group-${seq}`,
      status: 'VERIFIED',
      verifiedAt: new Date(),
      contactEmail: 'exec@mail.utoronto.ca',
      contactRole: 'President',
      members: { create: { userId, role: 'ADMIN' } },
    },
  })
}
