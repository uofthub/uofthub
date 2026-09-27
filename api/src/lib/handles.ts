import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '../db/client.js'

/**
 * Readable addresses: uofthub.com/@handle for a student, and
 * uofthub.com/@handle/slug for one of their projects.
 *
 * Handles live under `@` rather than at the root so they can never collide
 * with a page of the site's — /explore is ours, /@explore is somebody's, and a
 * page added next year can't be taken already.
 *
 * A handle given up — renamed away from, or the account deleted — keeps
 * redirecting to its old owner only until somebody else takes it, as on
 * GitHub. Holding on to every old name forever would lock them away for good.
 *
 * A handle is not proof of who anyone is: the display name never was either.
 * What is proof is the Faculty badge (from the address's domain, which nobody
 * can set) and a moderator's say — they can rename a handle, which frees it
 * for whoever it rightly belongs to (routes/admin.ts).
 *
 * The migration that added handles (handles_and_slugs) mirrors `slugify`, the
 * reserved words and `RESERVED_PROJECT_SLUGS` in SQL to give existing
 * accounts and projects theirs — change both together.
 */

type Tx = Prisma.TransactionClient | typeof db

export const HANDLE_MIN = 3
export const HANDLE_MAX = 30

/** How long after choosing a handle a student may choose another. */
export const HANDLE_CHANGE_DAYS = 30

/** Lowercase letters, digits, `-` and `_`, starting and ending with a letter or digit. */
const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/

/**
 * Words that would read as the site's own voice, or as somebody official.
 * Checked after `-` and `_` are ignored, so "u-of-t-hub" is "uofthub" too.
 */
const RESERVED = new Set([
  'admin',
  'administrator',
  'announcements',
  'api',
  'help',
  'helpdesk',
  'me',
  'mod',
  'moderator',
  'moderators',
  'news',
  'null',
  'official',
  'president',
  'registrar',
  'root',
  'security',
  'staff',
  'support',
  'system',
  'team',
  'undefined',
  'uoft',
  'uofthub',
  'uoftofficial',
  'utoronto',
  'universityoftoronto',
  'www',
])

/** A stand-in no one can choose: longer than HANDLE_MAX. See User.handle. */
export const unconfirmedHandle = () => `unconfirmed-${randomUUID()}`
export const isUnconfirmedHandle = (handle: string) => handle.startsWith('unconfirmed-')

/**
 * Text as an address part: accents dropped, lowercase, anything else a
 * single `-`, cut to `max` without a dangling `-`.
 */
export function slugify(text: string, max: number): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')
}

/** What a student typed, as a handle: trimmed, lowercase, without a leading `@`. */
export const normalizeHandle = (raw: unknown) =>
  String(raw ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()

const isReserved = (handle: string) => {
  const bare = handle.replace(/[-_]/g, '')
  return RESERVED.has(bare) || bare.includes('uofthub')
}

/** Why `handle` can't be anybody's, or null when it could be. */
export function handleProblem(handle: string): string | null {
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX)
    return `A handle is ${HANDLE_MIN} to ${HANDLE_MAX} characters`
  if (!HANDLE_PATTERN.test(handle))
    return 'Use lowercase letters, numbers, - and _, starting and ending with a letter or number'
  if (isReserved(handle)) return 'That handle is reserved'
  return null
}

/**
 * Whether `userId` may take `handle`: nobody else goes by it now. One that
 * somebody gave up is free — taking it ends its redirect to them.
 */
export async function handleAvailable(handle: string, userId: string | null, tx: Tx = db) {
  const holder = await tx.user.findUnique({ where: { handle }, select: { id: true } })
  return !holder || holder.id === userId
}

/**
 * Whether nobody goes by `handle` or used to. Handles given out unasked — at
 * sign-up — keep clear of old ones, so an old link keeps working until
 * somebody chooses to take its handle.
 */
async function untouched(handle: string, tx: Tx) {
  const [holder, retired] = await Promise.all([
    tx.user.findUnique({ where: { handle }, select: { id: true } }),
    tx.handleHistory.findUnique({ where: { handle }, select: { handle: true } }),
  ])
  return !holder && !retired
}

/**
 * A free handle made from a name — "Ada Lovelace" is ada-lovelace, or
 * ada-lovelace-2 when that is taken. Room is left for the number.
 */
export async function suggestHandle(name: string, tx: Tx = db): Promise<string> {
  let base = slugify(name, HANDLE_MAX - 4)
  if (handleProblem(base)) base = 'student'
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    if (await untouched(candidate, tx)) return candidate
  }
  return `${base.slice(0, HANDLE_MAX - 9)}-${Math.random().toString(36).slice(2, 10)}`
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

/**
 * Runs `write` with a handle suggested from `name` — and with the next one,
 * should somebody of the same name take it in between.
 */
export async function withSuggestedHandle<T>(
  name: string,
  write: (handle: string) => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write(await suggestHandle(name))
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= 3) throw err
    }
  }
}

export class HandleError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

/**
 * Gives `userId` a new handle. The old one redirects to them until somebody
 * else takes it — which is also how a handle a moderator took off an
 * impersonator goes to its rightful owner.
 *
 * A student may change it once every HANDLE_CHANGE_DAYS; a moderator any
 * time, and their change starts the student's wait again.
 */
export async function changeHandle(
  userId: string,
  raw: unknown,
  opts: { byModerator?: boolean } = {}
) {
  const handle = normalizeHandle(raw)
  const problem = handleProblem(handle)
  if (problem) throw new HandleError(problem, 400)

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { handle: true, handleChangedAt: true },
    })
    if (user.handle === handle) return user.handle

    if (!opts.byModerator && user.handleChangedAt) {
      const next = new Date(user.handleChangedAt.getTime() + HANDLE_CHANGE_DAYS * 86_400_000)
      if (next > new Date())
        throw new HandleError(
          `You can change your handle again on ${next.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}`,
          429
        )
    }
    if (!(await handleAvailable(handle, userId, tx)))
      throw new HandleError('That handle is taken', 409)

    // Theirs now: it stops redirecting to whoever had it before, them included.
    await tx.handleHistory.deleteMany({ where: { handle } })
    if (!isUnconfirmedHandle(user.handle))
      await tx.handleHistory.upsert({
        where: { handle: user.handle },
        create: { handle: user.handle, userId },
        update: { userId, retiredAt: new Date() },
      })
    await tx.user.update({ where: { id: userId }, data: { handle, handleChangedAt: new Date() } })
    return handle
  })
}

/**
 * The account a handle names, current or retired — confirmed accounts only.
 * `handle` is the one it goes by now, so an old address can redirect.
 */
export async function resolveHandle(raw: string) {
  const handle = normalizeHandle(raw)
  if (handle.length > HANDLE_MAX) return null
  const select = { id: true, handle: true, emailVerifiedAt: true } as const
  const user =
    (await db.user.findUnique({ where: { handle }, select })) ??
    (await db.handleHistory.findUnique({ where: { handle }, select: { user: { select } } }))?.user
  return user?.emailVerifiedAt ? { userId: user.id, handle: user.handle } : null
}

// ── Project slugs ───────────────────────────────────────────────────────────

export const PROJECT_SLUG_MAX = 60

/** Words a project can't be called in its address, kept for pages under a profile. */
const RESERVED_PROJECT_SLUGS = new Set([
  'edit',
  'new',
  'projects',
  'collections',
  'followers',
  'following',
  'settings',
])

/** A title as a slug, before it is made unique among the owner's projects. */
export function projectSlugBase(title: string): string {
  const base = slugify(title, PROJECT_SLUG_MAX - 4) || 'project'
  return RESERVED_PROJECT_SLUGS.has(base) ? `${base}-project` : base
}

/**
 * A slug for `title` that no other project of the owner has now — `projectId`
 * is the project it is for. A project whose slug already comes from this
 * title keeps it. One an older project gave up is free; `claimProjectSlug`
 * ends its redirect.
 */
export async function uniqueProjectSlug(
  tx: Tx,
  ownerId: string,
  title: string,
  projectId?: string,
  current?: string
): Promise<string> {
  const base = projectSlugBase(title)
  if (current && (current === base || new RegExp(`^${base}-\\d+$`).test(current))) return current
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`
    const holder = await tx.project.findUnique({
      where: { ownerId_slug: { ownerId, slug } },
      select: { id: true },
    })
    if (!holder || holder.id === projectId) return slug
  }
}

/** A slug about to be a project's: it stops redirecting to whichever had it before. */
export const claimProjectSlug = (tx: Tx, ownerId: string, slug: string) =>
  tx.projectSlugHistory.deleteMany({ where: { ownerId, slug } })

/**
 * Moves a project to the slug its new title gives it, keeping the old one as
 * a redirect. Nothing happens when the title's slug is the one it has.
 */
export async function reslugProject(
  tx: Tx,
  project: { id: string; ownerId: string; slug: string },
  title: string
) {
  const slug = await uniqueProjectSlug(tx, project.ownerId, title, project.id, project.slug)
  if (slug === project.slug) return
  await claimProjectSlug(tx, project.ownerId, slug)
  await tx.projectSlugHistory.upsert({
    where: { ownerId_slug: { ownerId: project.ownerId, slug: project.slug } },
    create: { ownerId: project.ownerId, slug: project.slug, projectId: project.id },
    update: { projectId: project.id, retiredAt: new Date() },
  })
  await tx.project.update({ where: { id: project.id }, data: { slug } })
}

/** The project `slug` names among `ownerId`'s, current or retired. */
export async function resolveProjectSlug(ownerId: string, raw: string) {
  const slug = raw.toLowerCase()
  const project = await db.project.findUnique({
    where: { ownerId_slug: { ownerId, slug } },
    select: { id: true },
  })
  if (project) return project.id
  const retired = await db.projectSlugHistory.findUnique({
    where: { ownerId_slug: { ownerId, slug } },
    select: { projectId: true },
  })
  return retired?.projectId ?? null
}
