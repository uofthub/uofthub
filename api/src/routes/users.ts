import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { getOptionalUserId, visibleProjectWhere } from '../lib/visibility.js'
import {
  AVATAR_EXTENSIONS,
  AVATAR_MAX_BYTES,
  contentTypeFor,
  extOf,
  matchesDeclaredType,
} from '../lib/fileValidation.js'
import { deleteObject, putObject, signedDownloadUrl } from '../lib/storage.js'
import { avatarObjectKey, avatarUrlFor } from '../lib/avatar.js'
import { CARD_INCLUDE, decorate } from '../lib/projectShape.js'
import { isFaculty } from '../lib/faculties.js'
import { parseCampus } from '../lib/campus.js'
import { notifyOnce } from '../lib/notifications.js'
import { publish } from '../lib/live.js'
import { blockedBetween } from '../lib/blocks.js'
import { fileReport, isReportReason, reportRateLimit } from '../lib/reports.js'
import { PIN_LIMIT } from '../lib/pins.js'
import { listablePeopleWhere, PERSON_RESULT_SELECT, toPersonResult } from '../lib/people.js'
import {
  parseCourses,
  parseOpenTo,
  OPEN_TO_ITEM_MAX,
  OPEN_TO_MAX,
  COURSES_MAX,
} from '../lib/profile.js'
import { safeExternalUrl, safeGithubUrl, safeLinkedInUrl } from '../lib/url.js'
import { userCardPng, userShare, userSitemap } from '../lib/shareCards.js'
import {
  changeHandle,
  HandleError,
  handleAvailable,
  handleProblem,
  normalizeHandle,
} from '../lib/handles.js'
import { roleFor } from '../lib/session.js'
import { PNG_HEADERS } from '../lib/ogImage.js'

const ME_SELECT = {
  id: true,
  email: true,
  name: true,
  handle: true,
  handleChangedAt: true,
  faculty: true,
  campus: true,
  program: true,
  classYear: true,
  bio: true,
  avatarUrl: true,
  openTo: true,
  websiteUrl: true,
  githubUrl: true,
  linkedinUrl: true,
  courses: true,
  allowMessages: true,
  emailNotifications: true,
  pushMessages: true,
  pushAnswers: true,
  pushActivity: true,
  createdAt: true,
} as const

const NOTIFICATIONS_PAGE = 30
const FOLLOW_PAGE = 30
const NAME_MAX = 80
const PROGRAM_MAX = 100
const BIO_MAX = 500
const URL_MAX = 500
const CLASS_YEAR_MIN = 1950
const CLASS_YEAR_MAX = 2100

/**
 * A free-text field from a form: `undefined` leaves it alone, empty or null
 * clears it, and anything longer than `max` is `false`.
 */
function optionalText(raw: unknown, max: number): string | null | undefined | false {
  if (raw === undefined) return undefined
  if (raw === null) return null
  if (typeof raw !== 'string') return false
  const text = raw.trim()
  if (text.length > max) return false
  return text || null
}

// Avatars are small and infrequent — a lighter budget than project uploads,
// same pattern as auth.ts's credentialRateLimit.
const avatarRateLimit = { rateLimit: { max: 10, timeWindow: '10 minutes' } }

export const userRoutes: FastifyPluginAsync = async (app) => {
  // GET /users/handle-check?handle= — whether the caller could take a handle,
  // for the Settings field to answer as they type
  app.get<{ Querystring: { handle?: string } }>(
    '/handle-check',
    { preHandler: [app.authenticate] },
    async (request) => {
      const handle = normalizeHandle(request.query.handle)
      const problem = handleProblem(handle)
      if (problem) return { handle, available: false, problem }
      const available = await handleAvailable(handle, request.user.sub)
      return { handle, available, problem: available ? null : 'That handle is taken' }
    }
  )

  // PUT /users/me/handle — { handle } choose a new handle. The old one keeps
  // redirecting here until somebody else takes it; see lib/handles.ts.
  app.put<{ Body: { handle?: string } }>(
    '/me/handle',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        return { handle: await changeHandle(request.user.sub, request.body?.handle) }
      } catch (err) {
        if (err instanceof HandleError) return reply.code(err.status).send({ error: err.message })
        throw err
      }
    }
  )

  // GET /users/search?q=&take= — people by name, handle or program, for
  // Explore and the command panel.
  //
  // Signed in only: a profile is public by link, but a directory anyone can
  // page through is a list of every student's name. Every word must appear in
  // one of the three fields, so "maya cs" finds Maya Chen in Computer Science.
  // Names that start with the query come first, then the most followed.
  app.get<{ Querystring: { q?: string; take?: string } }>(
    '/search',
    { preHandler: [app.authenticate] },
    async (request) => {
      // Letters, digits and spaces only: `%` and `_` would be LIKE wildcards.
      const q = String(request.query.q ?? '')
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .trim()
        .toLowerCase()
      const terms = q.split(/\s+/).filter(Boolean).slice(0, 5)
      if (!terms.length) return []
      const take = Math.min(Math.max(Number(request.query.take) || 6, 1), 20)
      const me = request.user.sub

      const rows = await db.user.findMany({
        where: {
          ...listablePeopleWhere(me),
          AND: terms.map((t) => ({
            OR: [
              { name: { contains: t, mode: 'insensitive' as const } },
              { handle: { contains: t, mode: 'insensitive' as const } },
              { program: { contains: t, mode: 'insensitive' as const } },
            ],
          })),
        },
        select: PERSON_RESULT_SELECT,
        take: 50,
      })

      const starts = (u: (typeof rows)[number]) =>
        u.name.toLowerCase().startsWith(q) ||
        u.name.toLowerCase().includes(` ${q}`) ||
        u.handle.startsWith(q)
      return rows
        .sort(
          (a, b) => Number(starts(b)) - Number(starts(a)) || b._count.followers - a._count.followers
        )
        .slice(0, take)
        .map(toPersonResult)
    }
  )

  // GET /users/sitemap — the profiles a search engine should list
  app.get('/sitemap', async () => userSitemap())

  // GET /users/:id/share — what a link preview shows; see lib/shareCards.ts
  app.get<{ Params: { id: string } }>('/:id/share', async (request, reply) => {
    const card = await userShare(request.params.id)
    return card ?? reply.code(404).send({ error: 'Not found' })
  })

  // GET /users/:id/og.png — the profile's preview image
  app.get<{ Params: { id: string } }>('/:id/og.png', async (request, reply) => {
    const png = await userCardPng(request.params.id)
    if (!png) return reply.code(404).send({ error: 'Not found' })
    return reply.headers(PNG_HEADERS).send(png)
  })

  // GET /users/:id — public profile
  //
  // The project counts are of what this caller can see, matching the lists
  // below them — a count that included drafts would say how many a student
  // keeps private, and never match what the page shows.
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const callerId = await getOptionalUserId(request)
    const user = await db.user.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        handle: true,
        // Only to tell faculty and staff from students; never sent.
        email: true,
        name: true,
        faculty: true,
        campus: true,
        program: true,
        classYear: true,
        bio: true,
        avatarUrl: true,
        openTo: true,
        websiteUrl: true,
        githubUrl: true,
        linkedinUrl: true,
        courses: true,
        allowMessages: true,
        createdAt: true,
        _count: { select: { followers: true, following: true } },
      },
    })
    if (!user) return reply.code(404).send({ error: 'Not found' })

    const visible = visibleProjectWhere(callerId)
    const [ownedProjects, collaborations, blockedByMe] = await Promise.all([
      db.project.count({ where: { AND: [{ ownerId: user.id }, visible] } }),
      db.project.count({
        where: {
          AND: [
            // Credited on somebody else's project — an invitation counts once
            // it is accepted, not before.
            { collaborators: { some: { userId: user.id, accepted: true, role: 'COLLABORATOR' } } },
            visible,
          ],
        },
      }),
      callerId && callerId !== user.id
        ? db.userBlock
            .findUnique({
              where: { blockerId_blockedId: { blockerId: callerId, blockedId: user.id } },
            })
            .then(Boolean)
        : false,
    ])
    const { email, ...profile } = user
    return {
      ...profile,
      // From the address's domain, which nobody can set: what tells a real
      // professor from a student who named themselves after one.
      isFaculty: roleFor(email) === 'FACULTY',
      _count: { ...user._count, ownedProjects, collaborations },
      blockedByMe,
    }
  })

  // GET /users/:id/followers?skip and /following?skip — who, a page at a time
  for (const direction of ['followers', 'following'] as const) {
    app.get<{ Params: { id: string }; Querystring: { skip?: string } }>(
      `/:id/${direction}`,
      async (request) => {
        const skip = Math.max(Number(request.query.skip) || 0, 0)
        const rows = await db.follow.findMany({
          where:
            direction === 'followers'
              ? { followingId: request.params.id }
              : { followerId: request.params.id },
          select: {
            createdAt: true,
            [direction === 'followers' ? 'follower' : 'following']: {
              select: {
                id: true,
                handle: true,
                name: true,
                avatarUrl: true,
                faculty: true,
                campus: true,
                program: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: FOLLOW_PAGE,
        })
        return rows.map(
          (r) =>
            (r as unknown as Record<string, unknown>)[
              direction === 'followers' ? 'follower' : 'following'
            ]
        )
      }
    )
  }

  // GET /users/:id/projects?take&skip
  //
  // Paged, like the directory. It used to return every project a user owned:
  // fine for a student with six, and a query that grows without bound for a
  // prolific one — and now one signed cover URL per row on top.
  app.get<{ Params: { id: string }; Querystring: { take?: string; skip?: string } }>(
    '/:id/projects',
    async (request) => {
      const callerId = await getOptionalUserId(request)
      const { take = '24', skip = '0' } = request.query

      const projects = await db.project.findMany({
        where: {
          // Signed-in viewers also see this user's UOFT projects, not just PUBLIC.
          AND: [{ ownerId: request.params.id }, visibleProjectWhere(callerId)],
        },
        include: CARD_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number(take) || 24, 1), 50),
        skip: Math.max(Number(skip) || 0, 0),
      })
      return decorate(projects, callerId)
    }
  )

  // GET /users/:id/pinned — the handful a student chose to lead with
  //
  // Its own route rather than a flag on the list above: the list is paged
  // newest-first, so a project pinned a year ago would not be on the first
  // page, and the strip has to be complete to be worth anything.
  app.get<{ Params: { id: string } }>('/:id/pinned', async (request) => {
    const callerId = await getOptionalUserId(request)

    const projects = await db.project.findMany({
      where: {
        // A pinned project that is still PRIVATE is pinned for the owner's own
        // benefit; the same visibility rules apply to it as to anything else.
        AND: [
          { ownerId: request.params.id, pinnedAt: { not: null } },
          visibleProjectWhere(callerId),
        ],
      },
      include: CARD_INCLUDE,
      orderBy: { pinnedAt: 'desc' },
      take: PIN_LIMIT,
    })
    return decorate(projects, callerId)
  })

  // GET /users/:id/collaborations?take&skip — projects this person is credited
  // on without owning. The profile's Collaborations tab.
  app.get<{ Params: { id: string }; Querystring: { take?: string; skip?: string } }>(
    '/:id/collaborations',
    async (request) => {
      const callerId = await getOptionalUserId(request)
      const { take = '24', skip = '0' } = request.query
      const projects = await db.project.findMany({
        where: {
          AND: [
            {
              collaborators: {
                some: { userId: request.params.id, accepted: true, role: 'COLLABORATOR' },
              },
            },
            visibleProjectWhere(callerId),
          ],
        },
        include: CARD_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number(take) || 24, 1), 50),
        skip: Math.max(Number(skip) || 0, 0),
      })
      return decorate(projects, callerId)
    }
  )

  // GET /users/me/orgs — the groups the caller belongs to, for linking a
  // project to one
  app.get('/me/orgs', { preHandler: [app.authenticate] }, async (request) => {
    return db.organization.findMany({
      where: { members: { some: { userId: request.user.sub, status: 'ACTIVE' } } },
      select: { id: true, slug: true, name: true, type: true },
      orderBy: { name: 'asc' },
    })
  })

  // GET /users/me/org-invites — groups that invited the caller, waiting on an answer
  app.get('/me/org-invites', { preHandler: [app.authenticate] }, async (request) => {
    const rows = await db.orgMember.findMany({
      where: { userId: request.user.sub, status: 'INVITED' },
      include: { org: { select: { slug: true, name: true, type: true } } },
      orderBy: { joinedAt: 'desc' },
    })
    return rows.map((r) => ({ ...r.org, role: r.role, invitedAt: r.joinedAt }))
  })

  // GET /users/me/invites — invitations waiting for the caller's answer.
  // The bell announces each one once; this is where they can always be found.
  app.get('/me/invites', { preHandler: [app.authenticate] }, async (request) => {
    const rows = await db.projectCollaborator.findMany({
      where: { userId: request.user.sub, role: 'COLLABORATOR', accepted: false },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            owner: { select: { id: true, handle: true, name: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { invitedAt: 'desc' },
    })
    return rows.map((r) => ({
      projectId: r.projectId,
      projectTitle: r.project.title,
      owner: r.project.owner,
      title: r.title,
      invitedAt: r.invitedAt,
    }))
  })

  // GET /users/me/saved?take&skip — the caller's own bookmarks, newest save
  // first. Only ever the caller's: a save is private.
  app.get<{ Querystring: { take?: string; skip?: string } }>(
    '/me/saved',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = request.user.sub
      const { take = '24', skip = '0' } = request.query
      const saves = await db.projectSave.findMany({
        // A saved project that has since gone private to its makers drops out
        // of the list rather than leaking its title.
        where: { userId, project: { is: visibleProjectWhere(userId) } },
        include: { project: { include: CARD_INCLUDE } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number(take) || 24, 1), 50),
        skip: Math.max(Number(skip) || 0, 0),
      })
      return decorate(
        saves.map((s) => s.project),
        userId
      )
    }
  )

  // PATCH /users/me — update own profile
  //
  // Every text field is capped, and empty clears it. The avatar is not set
  // here: it is uploaded (POST /users/me/avatar), so it is always our own
  // bytes from our own bucket, never an arbitrary URL on everyone's screen.
  app.patch<{
    Body: {
      name?: string
      faculty?: string
      campus?: string | null
      program?: string | null
      classYear?: number | string | null
      bio?: string | null
      openTo?: string[]
      websiteUrl?: string | null
      githubUrl?: string | null
      linkedinUrl?: string | null
      courses?: string[]
      allowMessages?: boolean
      emailNotifications?: boolean
      pushMessages?: boolean
      pushAnswers?: boolean
      pushActivity?: boolean
    }
  }>('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = request.body ?? {}
    const { faculty, campus } = body

    const name = optionalText(body.name, NAME_MAX)
    if (name === false || (body.name !== undefined && !name))
      return reply.code(400).send({ error: `A name is required, at most ${NAME_MAX} characters` })
    const program = optionalText(body.program, PROGRAM_MAX)
    if (program === false)
      return reply.code(400).send({ error: `A program is at most ${PROGRAM_MAX} characters` })
    const bio = optionalText(body.bio, BIO_MAX)
    if (bio === false)
      return reply.code(400).send({ error: `A bio is at most ${BIO_MAX} characters` })

    let classYear: number | null | undefined
    if (body.classYear !== undefined) {
      if (body.classYear === null || body.classYear === '') classYear = null
      else {
        classYear = Number(body.classYear)
        if (
          !Number.isInteger(classYear) ||
          classYear < CLASS_YEAR_MIN ||
          classYear > CLASS_YEAR_MAX
        )
          return reply
            .code(400)
            .send({ error: `A graduating year between ${CLASS_YEAR_MIN} and ${CLASS_YEAR_MAX}` })
      }
    }

    let openTo: string[] | undefined
    if (body.openTo !== undefined) {
      const parsed = parseOpenTo(body.openTo)
      if (!parsed)
        return reply.code(400).send({
          error: `Up to ${OPEN_TO_MAX} "Open to" items, each at most ${OPEN_TO_ITEM_MAX} characters`,
        })
      openTo = parsed
    }
    let courses: string[] | undefined
    if (body.courses !== undefined) {
      const parsed = parseCourses(body.courses)
      if (!parsed)
        return reply
          .code(400)
          .send({ error: `Up to ${COURSES_MAX} course codes, like CSC343, CSCA08 or MAT137Y1` })
      courses = parsed
    }
    for (const flag of [
      'allowMessages',
      'emailNotifications',
      'pushMessages',
      'pushAnswers',
      'pushActivity',
    ] as const) {
      if (body[flag] !== undefined && typeof body[flag] !== 'boolean')
        return reply.code(400).send({ error: `${flag} must be true or false` })
    }

    // Empty or null clears a link; anything else has to be a real link to the
    // right place — the profile shows each one behind its service's icon.
    const links: Record<string, string | null> = {}
    const checks = [
      ['websiteUrl', safeExternalUrl, 'Website must be an http(s) link'],
      ['githubUrl', safeGithubUrl, 'GitHub link must point at github.com'],
      ['linkedinUrl', safeLinkedInUrl, 'LinkedIn link must point at linkedin.com'],
    ] as const
    for (const [field, check, message] of checks) {
      const raw = body[field]
      if (raw === undefined) continue
      if (raw === null || String(raw).trim() === '') {
        links[field] = null
        continue
      }
      const safe = String(raw).length <= URL_MAX ? check(String(raw)) : null
      if (!safe) return reply.code(400).send({ error: message })
      links[field] = safe
    }

    // Faculty comes from a fixed list (lib/faculties.ts) so filters and the
    // "Your program" feed can match it exactly. A value written before the
    // list existed may be sent back unchanged; it just cannot be newly chosen.
    if (faculty !== undefined && faculty !== '' && !isFaculty(String(faculty))) {
      const current = await db.user.findUnique({
        where: { id: request.user.sub },
        select: { faculty: true },
      })
      if (current?.faculty !== faculty)
        return reply.code(400).send({ error: 'Choose a faculty from the list' })
    }

    // Empty string and null both mean "clear it" — the profile form sends the
    // empty option that way. Anything else has to be a real campus.
    let nextCampus: ReturnType<typeof parseCampus> | null | undefined
    if (campus !== undefined) {
      if (campus === null || campus === '') nextCampus = null
      else {
        nextCampus = parseCampus(campus)
        if (!nextCampus) return reply.code(400).send({ error: 'Campus must be UTSG, UTM or UTSC' })
      }
    }

    const user = await db.user.update({
      where: { id: request.user.sub },
      data: {
        ...(name && { name }),
        ...(faculty !== undefined && { faculty: faculty || null }),
        ...(nextCampus !== undefined && { campus: nextCampus }),
        ...(program !== undefined && { program }),
        ...(classYear !== undefined && { classYear }),
        ...(bio !== undefined && { bio }),
        ...(openTo !== undefined && { openTo }),
        ...(courses !== undefined && { courses }),
        ...(body.allowMessages !== undefined && { allowMessages: body.allowMessages }),
        ...(body.emailNotifications !== undefined && {
          emailNotifications: body.emailNotifications,
        }),
        ...(body.pushMessages !== undefined && { pushMessages: body.pushMessages }),
        ...(body.pushAnswers !== undefined && { pushAnswers: body.pushAnswers }),
        ...(body.pushActivity !== undefined && { pushActivity: body.pushActivity }),
        ...links,
      },
      select: ME_SELECT,
    })
    return user
  })

  // DELETE /users/me — { confirmEmail }. The account and everything it owns.
  //
  // The rows go by cascade: projects (and their files, comments, versions),
  // comments and reactions elsewhere, saves, follows, collections, messages,
  // memberships. Projects the student only collaborated on stay with their
  // owners. The storage objects are deleted by hand after the rows, so a
  // failure leaves an unreferenced object rather than a referenced one gone.
  app.delete<{ Body: { confirmEmail?: string } }>(
    '/me',
    { preHandler: [app.authenticate], config: { allowSuspended: true } },
    async (request, reply) => {
      const user = await db.user.findUniqueOrThrow({
        where: { id: request.user.sub },
        select: { id: true, email: true, avatarKey: true },
      })
      const typed = String(request.body?.confirmEmail ?? '')
        .trim()
        .toLowerCase()
      if (typed !== user.email)
        return reply.code(400).send({ error: 'Type your email address exactly to confirm' })

      const [files, outputs] = await Promise.all([
        db.projectFile.findMany({
          where: { project: { ownerId: user.id } },
          select: { storageKey: true },
        }),
        db.projectOutput.findMany({
          where: { project: { ownerId: user.id }, thumbnailKey: { not: null } },
          select: { thumbnailKey: true },
        }),
      ])
      await db.user.delete({ where: { id: user.id } })
      await Promise.all(
        [user.avatarKey, ...files.map((f) => f.storageKey), ...outputs.map((o) => o.thumbnailKey)]
          .filter((k): k is string => !!k)
          .map((k) => deleteObject(k).catch(() => undefined))
      )
      reply.clearCookie('token', { path: '/' })
      return { ok: true }
    }
  )

  // GET /users/me/export — everything the student put here, as a JSON download
  app.get(
    '/me/export',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const userId = request.user.sub
      const [account, projects, comments, collections, messages, reactions, saves, follows] =
        await Promise.all([
          db.user.findUniqueOrThrow({
            where: { id: userId },
            select: ME_SELECT,
          }),
          db.project.findMany({
            where: { ownerId: userId },
            include: {
              links: { select: { label: true, url: true } },
              references: { orderBy: { position: 'asc' } },
              files: { select: { name: true, sizeBytes: true, mimeType: true, uploadedAt: true } },
              versions: { orderBy: { versionNum: 'asc' } },
            },
            orderBy: { createdAt: 'asc' },
          }),
          db.comment.findMany({
            where: { userId },
            select: { projectId: true, parentId: true, body: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          }),
          db.collection.findMany({
            where: { ownerId: userId },
            include: { items: { select: { projectId: true, addedAt: true } } },
          }),
          db.message.findMany({
            where: { senderId: userId },
            select: { recipientId: true, body: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          }),
          db.projectReaction.findMany({
            where: { userId },
            select: { projectId: true, kind: true, createdAt: true },
          }),
          db.projectSave.findMany({
            where: { userId },
            select: { projectId: true, createdAt: true },
          }),
          db.follow.findMany({
            where: { followerId: userId },
            select: { followingId: true, createdAt: true },
          }),
        ])
      // Internal pointers are ours, not the student's data.
      const cleanProjects = projects.map((p) => ({
        ...p,
        references: p.references.map(({ key: _k, ...r }) => r),
      }))
      reply.header('Content-Disposition', 'attachment; filename="uofthub-export.json"')
      return {
        exportedAt: new Date(),
        account,
        projects: cleanProjects,
        comments,
        collections,
        messagesSent: messages,
        reactions,
        saves,
        following: follows,
      }
    }
  )

  // POST /users/me/avatar — multipart upload
  app.post(
    '/me/avatar',
    { preHandler: [app.authenticate], config: avatarRateLimit },
    async (request, reply) => {
      const data = await request.file({ limits: { fileSize: AVATAR_MAX_BYTES + 1 } })
      if (!data) return reply.code(400).send({ error: 'No file uploaded' })

      const ext = extOf(data.filename)
      if (!AVATAR_EXTENSIONS.includes(ext)) {
        data.file.resume()
        return reply.code(400).send({ error: 'An avatar must be a PNG, JPEG, GIF or WebP image' })
      }

      const buffer = await data.toBuffer()
      if (data.file.truncated || buffer.length > AVATAR_MAX_BYTES) {
        return reply
          .code(413)
          .send({ error: `Avatar exceeds the ${AVATAR_MAX_BYTES / (1024 * 1024)}MB limit` })
      }
      if (!(await matchesDeclaredType(buffer, ext))) {
        return reply.code(400).send({ error: 'File content does not match its extension' })
      }

      const userId = request.user.sub
      const key = avatarObjectKey(userId)
      await putObject(key, buffer, contentTypeFor(ext))

      const user = await db.user.update({
        where: { id: userId },
        // A new URL each time, so browsers holding the old picture fetch this one.
        data: { avatarKey: key, avatarIsCustom: true, avatarUrl: avatarUrlFor(userId, Date.now()) },
        select: ME_SELECT,
      })
      return user
    }
  )

  // DELETE /users/me/avatar
  app.delete('/me/avatar', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub
    const existing = await db.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    })
    if (existing?.avatarKey) await deleteObject(existing.avatarKey)

    await db.user.update({
      where: { id: userId },
      data: { avatarKey: null, avatarUrl: null, avatarIsCustom: false },
    })
    return { ok: true }
  })

  // GET /users/:id/avatar — public redirect to a signed URL; avatars aren't
  // visibility-gated the way project files are, so no auth check here.
  app.get<{ Params: { id: string } }>('/:id/avatar', async (request, reply) => {
    const user = await db.user.findUnique({
      where: { id: request.params.id },
      select: { avatarKey: true },
    })
    if (!user?.avatarKey) return reply.code(404).send({ error: 'No avatar' })

    // Always stated as a raster image, whatever was stored: an <img> sniffs
    // PNG, GIF or WebP bytes regardless, and nothing served from here can be
    // opened as a page or an SVG with script in it.
    const url = await signedDownloadUrl(user.avatarKey, 'avatar', {
      disposition: 'inline',
      contentType: 'image/jpeg',
    })
    return reply.redirect(url)
  })

  // POST /users/:id/follow — toggles follow
  app.post<{ Params: { id: string } }>(
    '/:id/follow',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const followerId = request.user.sub
      const followingId = request.params.id

      if (followerId === followingId)
        return reply.code(400).send({ error: 'Cannot follow yourself' })

      // Without this, following a nonexistent id fails the foreign key and
      // surfaces as a 500 rather than a 404.
      const target = await db.user.findUnique({ where: { id: followingId }, select: { id: true } })
      if (!target) return reply.code(404).send({ error: 'User not found' })

      const existing = await db.follow.findUnique({
        where: { followerId_followingId: { followerId, followingId } },
      })

      if (existing) {
        await db.follow.delete({ where: { followerId_followingId: { followerId, followingId } } })
        return { following: false }
      }
      if (await blockedBetween(followerId, followingId))
        return reply.code(403).send({ error: 'You can’t follow this person' })

      await db.follow.create({ data: { followerId, followingId } })

      // Keyed on the follower, so unfollow-refollow is not a way to ping
      // somebody repeatedly — you announce yourself to a person once.
      const follower = await db.user.findUnique({
        where: { id: followerId },
        select: { name: true },
      })
      await notifyOnce(followingId, 'FOLLOWED_YOU', `follow:${followerId}`, {
        actorId: followerId,
        actorName: follower?.name,
      })

      return { following: true }
    }
  )

  // POST /users/:id/report — { reason, details? } a profile: its name, bio,
  // picture or links
  app.post<{ Params: { id: string }; Body: { reason?: string; details?: string } }>(
    '/:id/report',
    { preHandler: [app.authenticate], config: reportRateLimit },
    async (request, reply) => {
      const reason = request.body?.reason
      if (!isReportReason(reason))
        return reply.code(400).send({ error: 'A valid reason is required' })
      const user = await db.user.findUnique({
        where: { id: request.params.id },
        select: { id: true, handle: true, name: true, bio: true },
      })
      if (!user) return reply.code(404).send({ error: 'Not found' })
      const report = await fileReport({
        reporterId: request.user.sub,
        subjectUserId: user.id,
        target: { targetType: 'USER' },
        reason,
        details: request.body.details,
        excerpt: [user.name, user.bio].filter(Boolean).join('\n\n'),
      })
      if ('error' in report) return reply.code(report.status).send({ error: report.error })
      return reply.code(201).send(report)
    }
  )

  // GET /users/:id/follow/me — check if current user follows
  app.get<{ Params: { id: string } }>(
    '/:id/follow/me',
    { preHandler: [app.authenticate] },
    async (request) => {
      const followerId = request.user.sub
      const followingId = request.params.id
      const row = await db.follow.findUnique({
        where: { followerId_followingId: { followerId, followingId } },
      })
      return { following: !!row }
    }
  )

  // GET /users/me/notifications?before — most recent first, for the bell, a
  // page at a time going back. `nextBefore` is where the next page starts.
  app.get<{ Querystring: { before?: string } }>(
    '/me/notifications',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const before = request.query.before ? new Date(request.query.before) : null
      if (before && Number.isNaN(before.getTime()))
        return reply.code(400).send({ error: 'before must be a date' })
      const [notifications, unreadCount] = await Promise.all([
        db.notification.findMany({
          where: { userId: request.user.sub, ...(before && { createdAt: { lt: before } }) },
          orderBy: { createdAt: 'desc' },
          take: NOTIFICATIONS_PAGE,
        }),
        db.notification.count({ where: { userId: request.user.sub, read: false } }),
      ])
      const nextBefore =
        notifications.length === NOTIFICATIONS_PAGE
          ? notifications[notifications.length - 1].createdAt.toISOString()
          : null
      return { notifications, unreadCount, nextBefore }
    }
  )

  // POST /users/me/notifications/:id/read
  app.post<{ Params: { id: string } }>(
    '/me/notifications/:id/read',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      // Scoped to the caller so one user can't mark another's notification
      // read by guessing its id.
      const { count } = await db.notification.updateMany({
        where: { id: request.params.id, userId: request.user.sub },
        data: { read: true },
      })
      if (count === 0) return reply.code(404).send({ error: 'Not found' })
      // Read from a push, with no tab open: the student's other tabs catch up.
      await publish([request.user.sub], 'notification')
      return { ok: true }
    }
  )

  // POST /users/me/notifications/read-all — bulk mark-read for opening the bell dropdown
  app.post('/me/notifications/read-all', { preHandler: [app.authenticate] }, async (request) => {
    await db.notification.updateMany({
      where: { userId: request.user.sub, read: false },
      data: { read: true },
    })
    return { ok: true }
  })
}
