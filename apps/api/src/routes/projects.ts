import type { FastifyPluginAsync } from 'fastify'
import type { Prisma, ProjectStatus, ProjectType, ReactionKind, Visibility } from '@prisma/client'
import { db } from '../db/client.js'
import {
  canViewProject,
  canViewProjectId,
  getOptionalUserId,
  visibleProjectWhere,
} from '../lib/visibility.js'
import { safeExternalUrl } from '../lib/url.js'
import {
  PROJECT_FILE_COUNT_CAP,
  TEXT_PREVIEW_MAX_BYTES,
  categoryFor,
  extOf,
  matchesDeclaredType,
  previewKindFor,
} from '../lib/fileValidation.js'
import {
  deleteObject,
  getObjectHead,
  objectKey,
  putObject,
  signedDownloadUrl,
} from '../lib/storage.js'
import {
  CARD_INCLUDE,
  OWNER_SELECT,
  REACTION_KINDS,
  decorate,
  emptyReactions,
  inOrder,
} from '../lib/projectShape.js'
import { recordView } from '../lib/views.js'
import { trendingIds } from '../lib/trending.js'
import { facetsFor } from '../lib/facets.js'
import { parseCampus } from '../lib/campus.js'
import { startOfUtcDay } from '../lib/dates.js'
import { PIN_LIMIT } from '../lib/pins.js'
import { searchProjectIds } from '../lib/search.js'
import { notify, notifyMany, notifyOnce, notifyProjectOwner } from '../lib/notifications.js'
import { announcePublish } from '../lib/publishing.js'
import { bySession } from '../lib/rateLimit.js'
import { isReportReason, reportDetails, reportRateLimit } from '../lib/reports.js'
import { ImportError, importFromLink } from '../lib/linkImport.js'

// Upload/delete cost real storage and bandwidth, so they get a tighter budget
// than the global ceiling — same pattern as auth.ts's credentialRateLimit.
const uploadRateLimit = { rateLimit: { max: 20, timeWindow: '10 minutes' } }

// Each import is the server fetching somebody else's site on a student's
// behalf, so it is budgeted per student.
const importRateLimit = { rateLimit: { max: 20, timeWindow: '10 minutes', keyGenerator: bySession } }

const PROJECT_TYPES: ProjectType[] = [
  'APP',
  'RESEARCH',
  'FILM',
  'DESIGN',
  'AUDIO',
  'HARDWARE',
  'WRITING',
  'OTHER',
]
const PROJECT_STATUSES: ProjectStatus[] = ['IN_PROGRESS', 'SHIPPED', 'HELP_WANTED']
const VISIBILITIES: Visibility[] = ['PRIVATE', 'UOFT', 'PUBLIC', 'UNLISTED']

/** A card's one line. Generous next to the form's 120, for pitches split out of old descriptions. */
const PITCH_MAX = 280
/** A version's release note — one line in the Updates timeline. */
const NOTE_MAX = 280
const COMMENT_MAX = 4000

/** `undefined` leaves a field alone, `null` clears it, anything unknown is an error. */
function parseEnum<T extends string>(value: unknown, allowed: T[]): T | null | undefined | false {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return allowed.includes(value as T) ? (value as T) : false
}

/** The editable fields shared by create and update, validated once. */
function parseFields(body: {
  pitch?: string | null
  type?: string | null
  status?: string | null
  visibility?: string
}):
  | { error: string }
  | {
      pitch?: string | null
      type?: ProjectType | null
      status?: ProjectStatus | null
      visibility?: Visibility
    } {
  const type = parseEnum(body.type, PROJECT_TYPES)
  if (type === false) return { error: 'Unknown project type' }
  const status = parseEnum(body.status, PROJECT_STATUSES)
  if (status === false) return { error: 'Unknown project status' }
  const visibility = parseEnum(body.visibility, VISIBILITIES)
  if (visibility === false || visibility === null) {
    if (body.visibility !== undefined) return { error: 'Unknown visibility' }
  }
  let pitch: string | null | undefined
  if (body.pitch !== undefined) {
    pitch = body.pitch?.trim() || null
    if (pitch && pitch.length > PITCH_MAX)
      return { error: `A pitch is at most ${PITCH_MAX} characters` }
  }
  return { pitch, type, status, visibility: visibility || undefined }
}

/** How much of a comment rides along in the notification that announces it. */
const COMMENT_EXCERPT_MAX = 140

export const projectRoutes: FastifyPluginAsync = async (app) => {
  // GET /projects?search&faculty&campus&type&status&sort=new|trending&take&skip
  app.get<{
    Querystring: {
      search?: string
      faculty?: string
      campus?: string
      type?: string
      status?: string
      sort?: string
      take?: string
      skip?: string
    }
  }>('/', async (request) => {
    const { search, faculty, campus, sort, take = '20', skip = '0' } = request.query
    // Unknown values are dropped rather than 400ing, like campus below.
    const type = parseEnum(request.query.type, PROJECT_TYPES) || undefined
    const status = parseEnum(request.query.status, PROJECT_STATUSES) || undefined
    // An unrecognised campus is dropped rather than 400ing: it filters a
    // browse page, and a stale bookmark should still show projects.
    const onCampus = parseCampus(campus)

    // Resolved up front through the full-text index; the ids then narrow the
    // same visibility-filtered query this route has always run.
    const matchedIds = search ? await searchProjectIds(search) : null
    const callerId = await getOptionalUserId(request)

    const where: Prisma.ProjectWhereInput = {
      // AND-composed: the visibility fragment uses OR internally, so spreading
      // another condition alongside it would silently drop one of them.
      AND: [
        visibleProjectWhere(callerId),
        ...(matchedIds ? [{ id: { in: matchedIds } }] : []),
        ...(faculty
          ? [{ owner: { faculty: { equals: faculty, mode: 'insensitive' as const } } }]
          : []),
        ...(onCampus ? [{ owner: { campus: onCampus } }] : []),
        ...(type ? [{ type }] : []),
        ...(status ? [{ status }] : []),
      ],
    }
    const page = {
      take: Math.min(Math.max(Number(take) || 20, 1), 50),
      skip: Math.max(Number(skip) || 0, 0),
    }

    if (sort === 'trending') {
      const ids = await trendingIds(where, page)
      const rows = await db.project.findMany({ where: { id: { in: ids } }, include: CARD_INCLUDE })
      return decorate(inOrder(rows, ids), callerId)
    }

    const projects = await db.project.findMany({
      where,
      include: CARD_INCLUDE,
      orderBy: [{ createdAt: 'desc' }],
      ...page,
    })
    return decorate(projects, callerId)
  })

  // POST /projects/import — { url } → what the post form can be filled with.
  // Nothing is saved: the student edits the result and posts it as usual. See
  // lib/linkImport.ts for what stops this being used to reach inside our network.
  app.post<{ Body: { url?: string } }>(
    '/import',
    { preHandler: [app.authenticate], config: importRateLimit },
    async (request, reply) => {
      const url = request.body?.url
      if (typeof url !== 'string' || !url.trim())
        return reply.code(400).send({ error: 'Paste a link to import' })
      try {
        return await importFromLink(url)
      } catch (err) {
        if (err instanceof ImportError) return reply.code(422).send({ error: err.message })
        request.log.warn({ err }, 'link import failed')
        return reply.code(422).send({ error: 'That link could not be read' })
      }
    }
  )

  // GET /projects/facets — counts for Explore's tiles and the home rails
  app.get('/facets', async (request) => facetsFor(!!(await getOptionalUserId(request))))

  // GET /projects/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const callerId = await getOptionalUserId(request)

    const project = await db.project.findUnique({
      where: { id: request.params.id },
      include: {
        ...CARD_INCLUDE,
        // Visibility needs every collaborator row, accepted or not, to decide
        // who may read; only accepted ones are returned to the page.
        collaborators: {
          include: {
            user: {
              select: { id: true, name: true, avatarUrl: true, faculty: true, campus: true },
            },
          },
        },
        // storageKey is an internal R2 pointer, never sent to the client —
        // downloads go through the signed-URL route below instead.
        files: {
          select: { id: true, name: true, sizeBytes: true, mimeType: true, uploadedAt: true },
        },
      },
    })
    if (!project) return reply.code(404).send({ error: 'Not found' })

    // 404 rather than 403: a private project should not confirm its own id.
    if (!canViewProject(project, callerId)) {
      return reply.code(404).send({ error: 'Not found' })
    }

    // The owner reloading their own page is not interest.
    if (callerId !== project.ownerId) await recordView(project.id, request, callerId)

    const [shaped, following, followerCount] = await Promise.all([
      decorate(
        [{ ...project, collaborators: project.collaborators.filter((c) => c.accepted) }],
        callerId
      ).then(([p]) => p),
      callerId
        ? db.projectFollow
            .findUnique({ where: { userId_projectId: { userId: callerId, projectId: project.id } } })
            .then(Boolean)
        : false,
      // Like saves, who follows is private; the owner sees only how many.
      callerId === project.ownerId
        ? db.projectFollow.count({ where: { projectId: project.id } })
        : undefined,
    ])
    return { ...shaped, following, ...(followerCount !== undefined && { followerCount }) }
  })

  // POST /projects
  app.post<{
    Body: {
      title: string
      pitch?: string
      description?: string
      type?: string
      status?: string
      tags?: string[]
      visibility?: string
      links?: { label: string; url: string }[]
    }
  }>('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { title, description, tags = [], links = [] } = request.body

    if (!title?.trim()) return reply.code(400).send({ error: 'Title is required' })
    const fields = parseFields(request.body)
    if ('error' in fields) return reply.code(400).send({ error: fields.error })

    // Reject javascript:/data: links up front rather than storing them.
    const safeLinks: { label: string; url: string }[] = []
    for (const link of links) {
      const url = safeExternalUrl(link?.url)
      if (!url) {
        return reply.code(400).send({ error: `Link "${link?.label ?? ''}" must be an http(s) URL` })
      }
      safeLinks.push({ label: String(link.label ?? '').trim(), url })
    }

    const project = await db.project.create({
      data: {
        ownerId: request.user.sub,
        title: title.trim(),
        pitch: fields.pitch ?? undefined,
        description: description?.trim() || undefined,
        type: fields.type ?? undefined,
        status: fields.status ?? undefined,
        tags,
        visibility: fields.visibility ?? 'PRIVATE',
        links: safeLinks.length ? { create: safeLinks } : undefined,
      },
      include: CARD_INCLUDE,
    })

    // A project created straight to UOFT/PUBLIC is published the moment it
    // exists, so the stamp and the follower fan-out happen here too — not only
    // on the PATCH that flips a draft open later.
    const publishedAt = await announcePublish(project)

    const [shaped] = await decorate(
      [{ ...project, publishedAt: publishedAt ?? project.publishedAt }],
      request.user.sub
    )
    return reply.code(201).send(shaped)
  })

  // PATCH /projects/:id
  app.patch<{
    Params: { id: string }
    Body: {
      title?: string
      pitch?: string | null
      description?: string
      type?: string | null
      status?: string | null
      tags?: string[]
      visibility?: string
    }
  }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const project = await db.project.findUnique({ where: { id: request.params.id } })
    if (!project) return reply.code(404).send({ error: 'Not found' })
    if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

    const { title, description, tags } = request.body
    if (title !== undefined && !title.trim())
      return reply.code(400).send({ error: 'Title is required' })
    const fields = parseFields(request.body)
    if ('error' in fields) return reply.code(400).send({ error: fields.error })
    const { visibility } = fields

    // A take-down would be worth nothing if the owner could just set the
    // project public again; only a moderator can clear `takenDownAt`.
    if (visibility !== undefined && project.takenDownAt) {
      return reply
        .code(403)
        .send({ error: 'This project was taken down by a moderator. Contact the team to appeal.' })
    }

    const updated = await db.project.update({
      where: { id: project.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() || null }),
        ...(tags !== undefined && { tags }),
        ...(fields.pitch !== undefined && { pitch: fields.pitch }),
        ...(fields.type !== undefined && { type: fields.type }),
        ...(fields.status !== undefined && { status: fields.status }),
        ...(visibility !== undefined && { visibility }),
      },
      include: CARD_INCLUDE,
    })

    // The edit that opens a draft up is the one that counts as publishing it.
    const publishedAt = await announcePublish(updated)

    const [shaped] = await decorate(
      [{ ...updated, publishedAt: publishedAt ?? updated.publishedAt }],
      request.user.sub
    )
    return shaped
  })

  // DELETE /projects/:id
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      await db.project.delete({ where: { id: project.id } })
      return { ok: true }
    }
  )

  // POST /projects/:id/save — toggles a private bookmark
  //
  // Nobody but the saver ever learns about it: no notification, no count.
  app.post<{ Params: { id: string } }>(
    '/:id/save',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.sub
      if (!(await canViewProjectId(id, userId))) return reply.code(404).send({ error: 'Not found' })

      const where = { userId_projectId: { userId, projectId: id } }
      if (await db.projectSave.findUnique({ where })) {
        await db.projectSave.delete({ where })
        return { saved: false }
      }
      await db.projectSave.create({ data: { userId, projectId: id } })
      return { saved: true }
    }
  )

  // POST /projects/:id/follow — toggles "tell me when this posts an update"
  //
  // Private like a save: the owner is not notified and sees only a count.
  // Following your own project is refused — you wrote the update.
  app.post<{ Params: { id: string } }>(
    '/:id/follow',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.sub
      const project = await db.project.findUnique({
        where: { id },
        select: {
          ownerId: true,
          visibility: true,
          collaborators: { select: { userId: true, accepted: true } },
        },
      })
      if (!project || !canViewProject(project, userId))
        return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId === userId)
        return reply.code(400).send({ error: 'You get your own updates already' })

      const where = { userId_projectId: { userId, projectId: id } }
      if (await db.projectFollow.findUnique({ where })) {
        await db.projectFollow.delete({ where })
        return { following: false }
      }
      await db.projectFollow.create({ data: { userId, projectId: id } })
      return { following: true }
    }
  )

  // POST /projects/:id/reactions — toggles one reaction of one kind
  app.post<{ Params: { id: string }; Body: { kind?: string } }>(
    '/:id/reactions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.sub
      const kind = request.body?.kind

      if (!kind || !REACTION_KINDS.includes(kind as ReactionKind)) {
        return reply.code(400).send({ error: 'A valid reaction kind is required' })
      }
      if (!(await canViewProjectId(id, userId))) {
        return reply.code(404).send({ error: 'Not found' })
      }

      const where = { projectId_userId_kind: { projectId: id, userId, kind: kind as ReactionKind } }
      const existing = await db.projectReaction.findUnique({ where })

      if (existing) {
        await db.projectReaction.delete({ where })
        return { kind, reacted: false }
      }

      await db.projectReaction.create({
        data: { projectId: id, userId, kind: kind as ReactionKind },
      })
      if (kind === 'COLLAB') {
        // Its own notification: "Want to collab" is an offer to one person,
        // and the owner is the only one who ever sees who made it. Keyed, so
        // toggling it is not a way to pester them.
        await notifyProjectOwner(id, userId, 'PROJECT_COLLAB_INTEREST', {
          key: `collab:${id}:${userId}`,
        })
      } else {
        // One key per person per project rather than per kind: somebody
        // tapping both public reactions is one piece of feedback, not two.
        await notifyProjectOwner(id, userId, 'PROJECT_REACTED', {
          key: `reaction:${id}:${userId}`,
          extra: { kind },
        })
      }
      return { kind, reacted: true }
    }
  )

  // GET /projects/:id/reactions — the tally, plus what this caller chose
  app.get<{ Params: { id: string } }>('/:id/reactions', async (request, reply) => {
    const callerId = await getOptionalUserId(request)
    if (!(await canViewProjectId(request.params.id, callerId))) {
      return reply.code(404).send({ error: 'Not found' })
    }

    const rows = await db.projectReaction.findMany({
      where: { projectId: request.params.id },
      select: { kind: true, userId: true },
    })

    // Every kind is present in the response, at zero if nobody chose it: the
    // page renders a fixed row of chips and would otherwise have to invent the
    // missing keys itself. Counts only — who reacted is never listed here.
    const counts = emptyReactions()
    const mine: ReactionKind[] = []
    for (const row of rows) {
      counts[row.kind] += 1
      if (callerId && row.userId === callerId) mine.push(row.kind)
    }

    return { counts, mine }
  })

  // POST /projects/:id/pin — toggles this project on the owner's profile strip
  app.post<{ Params: { id: string } }>(
    '/:id/pin',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({
        where: { id: request.params.id },
        select: { id: true, ownerId: true, pinnedAt: true },
      })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      // Pinning arranges the owner's own profile, so it is theirs alone to do —
      // a collaborator pinning it would move somebody else's furniture.
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      if (project.pinnedAt) {
        await db.project.update({ where: { id: project.id }, data: { pinnedAt: null } })
        return { pinned: false }
      }

      const pinned = await db.project.count({
        where: { ownerId: project.ownerId, pinnedAt: { not: null } },
      })
      if (pinned >= PIN_LIMIT) {
        return reply
          .code(400)
          .send({ error: `You can pin ${PIN_LIMIT} projects — unpin one to make room.` })
      }

      await db.project.update({ where: { id: project.id }, data: { pinnedAt: new Date() } })
      return { pinned: true }
    }
  )

  // GET /projects/:id/comments
  //
  // Top-level comments with their replies nested one level deep. The ones
  // readers marked helpful come first, so the useful answer to the author's
  // question is not buried under the thread that followed it.
  app.get<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const callerId = await getOptionalUserId(request)
    if (!(await canViewProjectId(request.params.id, callerId))) {
      return reply.code(404).send({ error: 'Not found' })
    }

    const rows = await db.comment.findMany({
      where: { projectId: request.params.id },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true, faculty: true } },
        _count: { select: { helpful: true } },
        ...(callerId ? { helpful: { where: { userId: callerId }, select: { userId: true } } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    })

    type Row = (typeof rows)[number] & { helpful?: { userId: string }[] }
    const shape = (c: Row) => ({
      id: c.id,
      projectId: c.projectId,
      userId: c.userId,
      parentId: c.parentId,
      body: c.body,
      createdAt: c.createdAt,
      user: c.user,
      helpfulCount: c._count.helpful,
      helpfulByMe: !!c.helpful?.length,
    })

    const replies = new Map<string, ReturnType<typeof shape>[]>()
    for (const c of rows) {
      if (!c.parentId) continue
      replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), shape(c)])
    }
    return rows
      .filter((c) => !c.parentId)
      .map((c) => ({ ...shape(c), replies: replies.get(c.id) ?? [] }))
      .sort(
        (a, b) => b.helpfulCount - a.helpfulCount || a.createdAt.getTime() - b.createdAt.getTime()
      )
  })

  // POST /projects/:id/comments — a comment, or with parentId a reply
  app.post<{ Params: { id: string }; Body: { body: string; parentId?: string } }>(
    '/:id/comments',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = request.body?.body?.trim()
      if (!body) return reply.code(400).send({ error: 'Comment body is required' })
      if (body.length > COMMENT_MAX)
        return reply.code(400).send({ error: `A comment is at most ${COMMENT_MAX} characters` })

      const projectId = request.params.id
      const userId = request.user.sub
      if (!(await canViewProjectId(projectId, userId))) {
        return reply.code(404).send({ error: 'Not found' })
      }

      // One level of replies: answering a reply files it under the same
      // top-level comment, so a thread never becomes a staircase.
      let parent: { id: string; userId: string } | null = null
      if (request.body.parentId) {
        const target = await db.comment.findUnique({
          where: { id: request.body.parentId },
          select: { id: true, userId: true, projectId: true, parentId: true },
        })
        if (!target || target.projectId !== projectId) {
          return reply.code(400).send({ error: 'That comment is not on this project' })
        }
        parent = target.parentId
          ? await db.comment.findUnique({
              where: { id: target.parentId },
              select: { id: true, userId: true },
            })
          : target
        // Whoever was actually answered hears about it, even when the reply is
        // filed under the thread's first comment.
        if (target.userId !== userId) {
          const [actor, project] = await Promise.all([
            db.user.findUnique({ where: { id: userId }, select: { name: true } }),
            db.project.findUnique({
              where: { id: projectId },
              select: { title: true, ownerId: true },
            }),
          ])
          // The owner already gets PROJECT_COMMENTED below; one ping is enough.
          if (project && target.userId !== project.ownerId) {
            await notify(target.userId, 'COMMENT_REPLIED', {
              projectId,
              projectTitle: project.title,
              actorId: userId,
              actorName: actor?.name,
              excerpt: body.slice(0, COMMENT_EXCERPT_MAX),
            })
          }
        }
      }

      const comment = await db.comment.create({
        data: { projectId, userId, body, parentId: parent?.id },
        include: { user: { select: { id: true, name: true, avatarUrl: true, faculty: true } } },
      })

      // Unkeyed: every comment is new writing, and the owner wants all of them.
      // The excerpt is denormalized so the bell reads as something specific
      // rather than "somebody commented".
      await notifyProjectOwner(projectId, userId, 'PROJECT_COMMENTED', {
        extra: { excerpt: comment.body.slice(0, COMMENT_EXCERPT_MAX) },
      })

      return reply.code(201).send({ ...comment, helpfulCount: 0, helpfulByMe: false, replies: [] })
    }
  )

  // POST /projects/:id/comments/:commentId/helpful — toggles "Helpful"
  app.post<{ Params: { id: string; commentId: string } }>(
    '/:id/comments/:commentId/helpful',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id, commentId } = request.params
      const userId = request.user.sub
      if (!(await canViewProjectId(id, userId))) return reply.code(404).send({ error: 'Not found' })

      const comment = await db.comment.findUnique({
        where: { id: commentId },
        select: { projectId: true, userId: true },
      })
      if (!comment || comment.projectId !== id) return reply.code(404).send({ error: 'Not found' })
      // Voting your own comment helpful says nothing.
      if (comment.userId === userId)
        return reply.code(400).send({ error: 'You cannot mark your own comment helpful' })

      const where = { commentId_userId: { commentId, userId } }
      const had = await db.commentHelpful.findUnique({ where })
      if (had) await db.commentHelpful.delete({ where })
      else await db.commentHelpful.create({ data: { commentId, userId } })
      const helpfulCount = await db.commentHelpful.count({ where: { commentId } })
      return { helpful: !had, helpfulCount }
    }
  )

  // POST /projects/:id/collaborators — invite
  app.post<{ Params: { id: string }; Body: { email: string } }>(
    '/:id/collaborators',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({
        where: { id: request.params.id },
        include: { owner: { select: { name: true } } },
      })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      // Emails are stored lowercased at sign-up, so normalize before lookup.
      const invitee = await db.user.findUnique({
        where: { email: (request.body.email ?? '').trim().toLowerCase() },
      })
      if (!invitee) return reply.code(404).send({ error: 'User not found' })
      if (invitee.id === request.user.sub)
        return reply.code(400).send({ error: 'Cannot invite yourself' })

      const collab = await db.projectCollaborator.upsert({
        where: { projectId_userId: { projectId: project.id, userId: invitee.id } },
        update: {},
        create: {
          projectId: project.id,
          userId: invitee.id,
          role: 'COLLABORATOR',
          accepted: false,
        },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })

      await notify(invitee.id, 'COLLABORATOR_INVITED', {
        projectId: project.id,
        projectTitle: project.title,
        inviterName: project.owner.name,
      })

      return reply.code(201).send(collab)
    }
  )

  // PATCH /projects/:id/collaborators/:userId — accept/deny an invite (by the
  // invitee), or approve/deny a pending VIEWER access request (by the owner)
  app.patch<{ Params: { id: string; userId: string }; Body: { accepted: boolean } }>(
    '/:id/collaborators/:userId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id, userId } = request.params

      const project = await db.project.findUnique({
        where: { id },
        select: { id: true, title: true, ownerId: true },
      })
      if (!project) return reply.code(404).send({ error: 'Not found' })

      // Without this, responding to an invite that does not exist throws
      // Prisma's P2025 and surfaces as a 500.
      const invite = await db.projectCollaborator.findUnique({
        where: { projectId_userId: { projectId: id, userId } },
        include: { user: { select: { name: true } } },
      })
      if (!invite) return reply.code(404).send({ error: 'No invitation found' })

      const isSelf = userId === request.user.sub
      // A VIEWER row is a TA/professor access request (see POST
      // .../request-access) rather than an owner-issued invite, so it's the
      // owner — not the requester — who decides it.
      const isOwnerDecidingAccessRequest =
        !isSelf && request.user.sub === project.ownerId && invite.role === 'VIEWER'
      if (!isSelf && !isOwnerDecidingAccessRequest)
        return reply.code(403).send({ error: 'Forbidden' })

      const collab = await db.projectCollaborator.update({
        where: { projectId_userId: { projectId: id, userId } },
        data: { accepted: request.body.accepted },
      })

      if (isOwnerDecidingAccessRequest) {
        await notify(userId, 'ACCESS_REQUEST_DECIDED', {
          projectId: project.id,
          projectTitle: project.title,
          accepted: request.body.accepted,
        })
      } else if (project.ownerId !== userId) {
        await notify(project.ownerId, 'COLLABORATOR_RESPONDED', {
          projectId: project.id,
          projectTitle: project.title,
          userName: invite.user.name,
          accepted: request.body.accepted,
        })
      }

      return collab
    }
  )

  // DELETE /projects/:id/collaborators/:userId
  app.delete<{ Params: { id: string; userId: string } }>(
    '/:id/collaborators/:userId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id, userId } = request.params
      const project = await db.project.findUnique({
        where: { id },
        select: { id: true, title: true, ownerId: true },
      })
      if (!project) return reply.code(404).send({ error: 'Not found' })

      const isOwner = project.ownerId === request.user.sub
      const isSelf = userId === request.user.sub
      if (!isOwner && !isSelf) return reply.code(403).send({ error: 'Forbidden' })

      const collab = await db.projectCollaborator.findUnique({
        where: { projectId_userId: { projectId: id, userId } },
      })
      if (!collab) return reply.code(404).send({ error: 'Not found' })

      await db.projectCollaborator.delete({
        where: { projectId_userId: { projectId: id, userId } },
      })

      // Owner denying a still-pending VIEWER access request (see
      // POST .../request-access) — let the requester know rather than
      // leaving the request to silently vanish.
      if (isOwner && !isSelf && collab.role === 'VIEWER' && !collab.accepted) {
        await notify(userId, 'ACCESS_REQUEST_DECIDED', {
          projectId: project.id,
          projectTitle: project.title,
          accepted: false,
        })
      }

      return { ok: true }
    }
  )

  // POST /projects/:id/links
  app.post<{ Params: { id: string }; Body: { label: string; url: string } }>(
    '/:id/links',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      const url = safeExternalUrl(request.body.url)
      if (!url) return reply.code(400).send({ error: 'Link must be an http(s) URL' })

      const link = await db.projectLink.create({
        data: { projectId: project.id, label: String(request.body.label ?? '').trim(), url },
      })
      return reply.code(201).send(link)
    }
  )

  // DELETE /projects/:id/links/:linkId
  app.delete<{ Params: { id: string; linkId: string } }>(
    '/:id/links/:linkId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      // Scope the delete to this project: owning one project must not grant
      // the ability to delete another project's link by id.
      const { count } = await db.projectLink.deleteMany({
        where: { id: request.params.linkId, projectId: project.id },
      })
      if (count === 0) return reply.code(404).send({ error: 'Link not found' })

      return { ok: true }
    }
  )

  // ── FILES ───────────────────────────────────────────────────────────────────

  // POST /projects/:id/files — multipart upload, owner only
  app.post<{ Params: { id: string } }>(
    '/:id/files',
    { preHandler: [app.authenticate], config: uploadRateLimit },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      const data = await request.file()
      if (!data) return reply.code(400).send({ error: 'No file uploaded' })

      const ext = extOf(data.filename)
      const category = categoryFor(ext)
      if (!category) return reply.code(400).send({ error: `Unsupported file type: .${ext || '?'}` })

      const buffer = await data.toBuffer()
      // @fastify/multipart truncates rather than throwing when the stream
      // exceeds the registered global limit (250MB) — buffer.length would
      // otherwise look like a plausible, if large, file.
      if (data.file.truncated) {
        return reply.code(413).send({ error: 'File exceeds the 250MB upload limit' })
      }
      if (buffer.length > category.maxSizeBytes) {
        return reply.code(413).send({
          error: `File exceeds the ${category.name} size limit (${category.maxSizeBytes / (1024 * 1024)}MB)`,
        })
      }

      // Checked against the actual bytes, not the client-declared filename or
      // MIME type — this is what stops a renamed executable getting through.
      if (!(await matchesDeclaredType(buffer, ext))) {
        return reply.code(400).send({ error: 'File content does not match its extension' })
      }

      const fileCount = await db.projectFile.count({ where: { projectId: project.id } })
      if (fileCount >= PROJECT_FILE_COUNT_CAP) {
        return reply
          .code(400)
          .send({ error: `This project already has the ${PROJECT_FILE_COUNT_CAP}-file limit` })
      }

      // No storage quota for now — per-file size and per-project count above
      // are the only limits. Group allowances and personal quotas were set
      // aside with the redesign (docs/redesign.md); files are no longer
      // billed to a group.
      const key = objectKey(project.id, data.filename)
      await putObject(key, buffer, data.mimetype)

      const file = await db.projectFile.create({
        data: {
          projectId: project.id,
          name: data.filename,
          storageKey: key,
          sizeBytes: buffer.length,
          mimeType: data.mimetype,
        },
        select: { id: true, name: true, sizeBytes: true, mimeType: true, uploadedAt: true },
      })
      return reply.code(201).send(file)
    }
  )

  // DELETE /projects/:id/files/:fileId — owner only
  app.delete<{ Params: { id: string; fileId: string } }>(
    '/:id/files/:fileId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      // Scope to this project, same reasoning as DELETE .../links/:linkId.
      const file = await db.projectFile.findFirst({
        where: { id: request.params.fileId, projectId: project.id },
      })
      if (!file) return reply.code(404).send({ error: 'File not found' })

      await deleteObject(file.storageKey)
      await db.projectFile.delete({ where: { id: file.id } })
      return { ok: true }
    }
  )

  // GET /projects/:id/files/:fileId/download — redirects to a short-lived signed URL
  app.get<{ Params: { id: string; fileId: string } }>(
    '/:id/files/:fileId/download',
    async (request, reply) => {
      const callerId = await getOptionalUserId(request)
      if (!(await canViewProjectId(request.params.id, callerId))) {
        return reply.code(404).send({ error: 'Not found' })
      }

      const file = await db.projectFile.findFirst({
        where: { id: request.params.fileId, projectId: request.params.id },
      })
      if (!file) return reply.code(404).send({ error: 'File not found' })

      const url = await signedDownloadUrl(file.storageKey, file.name)
      return reply.redirect(url)
    }
  )

  // GET /projects/:id/files/:fileId/preview — what the in-app viewer renders
  //
  // Deliberately JSON rather than a redirect like /download. The session cookie
  // is SameSite=Lax, so it rides a top-level navigation (clicking a download
  // link) but not a subresource load — an <img>/<iframe>/<video> pointed at
  // this API would arrive signed out and 404 on anything not public. Fetching
  // the signed URL here instead, over a credentialed XHR, lets the browser then
  // load the bytes straight from storage where no cookie is needed.
  app.get<{ Params: { id: string; fileId: string } }>(
    '/:id/files/:fileId/preview',
    async (request, reply) => {
      const callerId = await getOptionalUserId(request)
      if (!(await canViewProjectId(request.params.id, callerId))) {
        return reply.code(404).send({ error: 'Not found' })
      }

      const file = await db.projectFile.findFirst({
        where: { id: request.params.fileId, projectId: request.params.id },
      })
      if (!file) return reply.code(404).send({ error: 'File not found' })

      const kind = previewKindFor(extOf(file.name))
      if (!kind) return reply.code(415).send({ error: 'This file type cannot be previewed' })

      // Text is returned inline: reading it in the page would otherwise need a
      // cross-origin fetch of the storage URL, and the bucket sends no CORS
      // headers. Media is handed over as a URL for the browser to stream itself.
      if (kind === 'text') {
        const head = await getObjectHead(file.storageKey, TEXT_PREVIEW_MAX_BYTES)
        return {
          kind,
          name: file.name,
          text: head.toString('utf8'),
          truncated: file.sizeBytes > head.length,
        }
      }

      return {
        kind,
        name: file.name,
        url: await signedDownloadUrl(file.storageKey, file.name, { disposition: 'inline' }),
      }
    }
  )

  // ── VERSIONING ─────────────────────────────────────────────────────────────

  // GET /projects/:id/versions
  app.get<{ Params: { id: string } }>('/:id/versions', async (request, reply) => {
    const callerId = await getOptionalUserId(request)
    if (!(await canViewProjectId(request.params.id, callerId))) {
      return reply.code(404).send({ error: 'Not found' })
    }

    const versions = await db.projectVersion.findMany({
      where: { projectId: request.params.id },
      orderBy: { versionNum: 'desc' },
    })
    return versions
  })

  // POST /projects/:id/versions — snapshot current state as a new version
  //
  // With a note it is also an update: the note is the line the project's
  // Updates timeline shows ("Added Gerstein Library and a quiet-floors filter").
  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    '/:id/versions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      const note = request.body?.note?.trim() || null
      if (note && note.length > NOTE_MAX) {
        return reply.code(400).send({ error: `An update note is at most ${NOTE_MAX} characters` })
      }

      const latest = await db.projectVersion.findFirst({
        where: { projectId: project.id },
        orderBy: { versionNum: 'desc' },
      })

      const version = await db.projectVersion.create({
        data: {
          projectId: project.id,
          versionNum: (latest?.versionNum ?? 0) + 1,
          note,
          title: project.title,
          description: project.description,
          tags: project.tags,
        },
      })

      // A version with a note is an update, and its followers asked to hear
      // about those. Only the ones who can still see the project are told —
      // it may have gone back to a draft since they followed it.
      if (note && !project.takenDownAt) {
        const [followers, collaborators] = await Promise.all([
          db.projectFollow.findMany({ where: { projectId: project.id }, select: { userId: true } }),
          db.projectCollaborator.findMany({
            where: { projectId: project.id },
            select: { userId: true, accepted: true },
          }),
        ])
        const audience = followers
          .map((f) => f.userId)
          .filter((userId) => canViewProject({ ...project, collaborators }, userId))
        await notifyMany(
          audience,
          'PROJECT_UPDATED',
          { projectId: project.id, projectTitle: project.title, note },
          `update:${version.id}`
        )
      }
      return reply.code(201).send(version)
    }
  )

  // ── FORK / REMIX ────────────────────────────────────────────────────────────

  // POST /projects/:id/fork
  app.post<{ Params: { id: string } }>(
    '/:id/fork',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const original = await db.project.findUnique({
        where: { id: request.params.id },
        include: {
          links: true,
          collaborators: { select: { userId: true, accepted: true } },
        },
      })
      if (!original) return reply.code(404).send({ error: 'Not found' })

      // Same rule as reading it, so collaborators can fork and a private id is
      // not confirmed by a 403.
      if (!canViewProject(original, request.user.sub)) {
        return reply.code(404).send({ error: 'Not found' })
      }

      // The owner can still see a taken-down project, and a fork of it would
      // come back with a clean `takenDownAt` — a one-click way around the
      // moderation decision.
      if (original.takenDownAt) {
        return reply.code(403).send({ error: 'This project was taken down and cannot be forked.' })
      }

      const fork = await db.project.create({
        data: {
          ownerId: request.user.sub,
          title: `${original.title} (fork)`,
          pitch: original.pitch,
          description: original.description,
          type: original.type,
          // A fork starts its own life: it is not "shipped" because the
          // original was.
          status: 'IN_PROGRESS',
          tags: original.tags,
          visibility: 'PRIVATE',
          forkedFromId: original.id,
          links: original.links.length
            ? { create: original.links.map((l) => ({ label: l.label, url: l.url })) }
            : undefined,
        },
        include: CARD_INCLUDE,
      })

      // Against the original, not the fork — the fork has no audience yet, and
      // it is the original's owner who wants to know their work was picked up.
      // Unkeyed: forking the same project twice is two real events.
      await notifyProjectOwner(original.id, request.user.sub, 'PROJECT_FORKED', {
        extra: { forkId: fork.id },
      })

      const [shaped] = await decorate([fork], request.user.sub)
      return reply.code(201).send(shaped)
    }
  )

  // ── ANALYTICS ───────────────────────────────────────────────────────────────

  // GET /projects/:id/analytics — owner-only engagement metrics
  app.get<{ Params: { id: string } }>(
    '/:id/analytics',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({
        where: { id: request.params.id },
        select: {
          ownerId: true,
          viewCount: true,
          _count: { select: { comments: true, forks: true, saves: true, followers: true } },
        },
      })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      const projectId = request.params.id
      const thirtyDaysAgo = startOfUtcDay(30)
      const sevenDaysAgo = startOfUtcDay(7)
      const fourteenDaysAgo = startOfUtcDay(14)
      const person = { select: { id: true, name: true, avatarUrl: true, faculty: true } }

      const [dailyViews, reactionRows, collabInterest, recentReactions] = await Promise.all([
        db.projectDailyView.findMany({
          where: { projectId, date: { gte: thirtyDaysAgo } },
          orderBy: { date: 'asc' },
        }),
        db.projectReaction.groupBy({ by: ['kind'], where: { projectId }, _count: { kind: true } }),
        // Who wants to collaborate: the one list the owner sees and nobody else
        // does. Everyone else only ever gets the count.
        db.projectReaction.findMany({
          where: { projectId, kind: 'COLLAB' },
          include: { user: person },
          orderBy: { createdAt: 'desc' },
        }),
        // A reaction is attributed to the owner the way a like used to be —
        // "Priya and 4 others" is a fact, where "23" is only a number.
        db.projectReaction.findMany({
          where: { projectId, kind: { not: 'COLLAB' } },
          include: { user: person },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
      ])

      const viewsBetween = (from: Date, to?: Date) =>
        dailyViews
          .filter((d) => d.date >= from && (!to || d.date < to))
          .reduce((sum, d) => sum + d.count, 0)

      // Same shape as GET /:id/reactions — every kind present, zero included.
      const reactions = emptyReactions()
      for (const row of reactionRows) reactions[row.kind] = row._count.kind

      return {
        // Unique viewers per day, summed — see lib/views.ts.
        totalViews: project.viewCount,
        comments: project._count.comments,
        forks: project._count.forks,
        // How many people bookmarked it. Never who: a save is private.
        saves: project._count.saves,
        followers: project._count.followers,
        // Two adjacent weeks rather than one number, so the owner can tell
        // "quiet" apart from "slowing down" — the single total never could.
        viewsThisWeek: viewsBetween(sevenDaysAgo),
        viewsLastWeek: viewsBetween(fourteenDaysAgo, sevenDaysAgo),
        reactions,
        collabInterest: collabInterest.map((r) => ({ user: r.user, createdAt: r.createdAt })),
        recentReactions: recentReactions.map((r) => ({
          user: r.user,
          kind: r.kind,
          createdAt: r.createdAt,
        })),
        dailyViews: dailyViews.map((d) => ({ date: d.date, count: d.count })),
      }
    }
  )

  // ── TA / FACULTY ACCESS REQUESTS ────────────────────────────────────────────

  // POST /projects/:id/request-access — faculty/TA requests VIEWER access
  app.post<{ Params: { id: string } }>(
    '/:id/request-access',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'FACULTY') {
        return reply.code(403).send({ error: 'Only faculty/TAs can request access' })
      }

      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.visibility === 'PRIVATE') {
        return reply.code(403).send({ error: 'Cannot request access to a private project' })
      }

      const existing = await db.projectCollaborator.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: request.user.sub } },
      })
      if (existing) return reply.code(409).send({ error: 'Access already requested or granted' })

      const [requester] = await Promise.all([
        db.user.findUnique({ where: { id: request.user.sub }, select: { name: true } }),
        db.projectCollaborator.create({
          data: {
            projectId: project.id,
            userId: request.user.sub,
            role: 'VIEWER',
            accepted: false,
          },
        }),
      ])

      await notify(project.ownerId, 'ACCESS_REQUESTED', {
        projectId: project.id,
        projectTitle: project.title,
        requesterId: request.user.sub,
        requesterName: requester?.name,
      })

      return { ok: true, message: 'Access request sent to project owner' }
    }
  )

  // GET /projects/:id/access-requests — owner sees pending VIEWER requests
  app.get<{ Params: { id: string } }>(
    '/:id/access-requests',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const project = await db.project.findUnique({ where: { id: request.params.id } })
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (project.ownerId !== request.user.sub) return reply.code(403).send({ error: 'Forbidden' })

      const requests = await db.projectCollaborator.findMany({
        where: { projectId: project.id, role: 'VIEWER', accepted: false },
        include: {
          user: { select: { id: true, name: true, email: true, faculty: true, campus: true } },
        },
        orderBy: { invitedAt: 'desc' },
      })
      return requests
    }
  )

  // ── MODERATION ──────────────────────────────────────────────────────────────

  // POST /projects/:id/report — any signed-in user flags a project for review
  app.post<{ Params: { id: string }; Body: { reason?: string; details?: string } }>(
    '/:id/report',
    { preHandler: [app.authenticate], config: reportRateLimit },
    async (request, reply) => {
      const reason = request.body?.reason
      if (!isReportReason(reason)) {
        return reply.code(400).send({ error: 'A valid reason is required' })
      }

      const project = await db.project.findUnique({
        where: { id: request.params.id },
        select: { id: true, ownerId: true, visibility: true },
      })
      if (!project) return reply.code(404).send({ error: 'Not found' })

      // Reporting exists for work that has an audience. A PRIVATE project is
      // only visible to its owner and accepted collaborators, so there is
      // nothing for a moderator to act on.
      if (project.visibility === 'PRIVATE') {
        return reply
          .code(403)
          .send({ error: 'Only U of T-visible or public projects can be reported' })
      }
      if (project.ownerId === request.user.sub) {
        return reply.code(400).send({ error: 'You cannot report your own project' })
      }

      // One open report per person per project: a second one adds nothing to
      // the queue, and re-reporting is only useful once the first was decided.
      const existing = await db.report.findFirst({
        where: { projectId: project.id, reporterId: request.user.sub, status: 'OPEN' },
        select: { id: true },
      })
      if (existing) return reply.code(409).send({ error: 'You have already reported this project' })

      const report = await db.report.create({
        data: {
          projectId: project.id,
          reporterId: request.user.sub,
          reason,
          details: reportDetails(request.body.details),
        },
        select: { id: true, reason: true, status: true, createdAt: true },
      })
      return reply.code(201).send(report)
    }
  )
}
