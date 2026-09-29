import type { FastifyPluginAsync } from 'fastify'
import type { Campus } from '@prisma/client'
import { db } from '../db/client.js'
import { getOptionalUserId, visibleProjectWhere } from '../lib/visibility.js'
import { safeDiscordUrl, safeExternalUrl, safeGroupMeUrl } from '../lib/url.js'
import { activeMembership, isOrgAdmin, isOrgRole } from '../lib/orgs.js'
import { isModerator, requireAdmin } from '../lib/admin.js'
import { parseCampus } from '../lib/campus.js'
import { fileReport, isReportReason, reportRateLimit } from '../lib/reports.js'
import { notify, notifyMany } from '../lib/notifications.js'
import { bySession } from '../lib/rateLimit.js'
import { orgCardPng, orgShare } from '../lib/shareCards.js'
import { PNG_HEADERS } from '../lib/ogImage.js'

const ORG_NAME_MAX = 100
const ORG_DESCRIPTION_MAX = 2000
const ACTIVITY_TITLE_MAX = 120
const ACTIVITY_DESCRIPTION_MAX = 2000
const URL_MAX = 2000

/** How much of a group's history its page carries; enough for a term or two. */
const PAGE_ACTIVITIES = 50
const PAGE_PROJECTS = 50

// Every invitation and join request lands in somebody's notifications.
const membershipRateLimit = {
  rateLimit: { max: 30, timeWindow: '1 hour', keyGenerator: bySession },
}

/** A group's address: lower-case letters, digits and single dashes, no dash at either end. */
const slugify = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

/**
 * A link field from a form: `undefined` leaves it alone, empty clears it, and
 * anything else must pass `check` — or it is `false`, with the message to send.
 */
function parseLinkField(
  raw: unknown,
  check: (value: string) => string | null
): string | null | undefined | false {
  if (raw === undefined) return undefined
  if (raw === null || (typeof raw === 'string' && !raw.trim())) return null
  if (typeof raw !== 'string' || raw.length > URL_MAX) return false
  return check(raw) ?? false
}

/** A group event's editable fields, validated once for create and edit. */
function parseActivity(
  body: {
    title?: unknown
    description?: unknown
    date?: unknown
    link?: unknown
    imageUrl?: unknown
  },
  creating: boolean
):
  | { error: string }
  | {
      title?: string
      description?: string | null
      date?: Date
      link?: string | null
      imageUrl?: string | null
    } {
  let title: string | undefined
  if (body.title !== undefined || creating) {
    title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return { error: 'Title is required' }
    if (title.length > ACTIVITY_TITLE_MAX)
      return { error: `A title is at most ${ACTIVITY_TITLE_MAX} characters` }
  }
  let description: string | null | undefined
  if (body.description !== undefined) {
    description = typeof body.description === 'string' ? body.description.trim() || null : null
    if (description && description.length > ACTIVITY_DESCRIPTION_MAX)
      return { error: `A description is at most ${ACTIVITY_DESCRIPTION_MAX} characters` }
  }
  let date: Date | undefined
  if (body.date !== undefined && body.date !== null && body.date !== '') {
    date = new Date(String(body.date))
    if (Number.isNaN(date.getTime())) return { error: 'Invalid date' }
  } else if (creating) {
    // Defaults to now, so "we ran this today" needs no date picking.
    date = new Date()
  }
  // Both render as an href / img src, so both go through the same guard.
  const link = parseLinkField(body.link, safeExternalUrl)
  if (link === false) return { error: 'Link must be an http(s) URL' }
  const imageUrl = parseLinkField(body.imageUrl, safeExternalUrl)
  if (imageUrl === false) return { error: 'Image must be an http(s) URL' }
  return { title, description, date, link, imageUrl }
}

const PERSON = {
  select: {
    id: true,
    handle: true,
    name: true,
    avatarUrl: true,
    faculty: true,
    campus: true,
    program: true,
  },
} as const

export const orgRoutes: FastifyPluginAsync = async (app) => {
  /** A group by slug, or null. */
  const bySlug = (slug: string) => db.organization.findUnique({ where: { slug } })

  // GET /orgs?campus — every group, newest first
  app.get<{ Querystring: { campus?: string } }>('/', async (request) => {
    // Unrecognised values are dropped, not rejected — same reasoning as the
    // project directory's filter.
    const onCampus = parseCampus(request.query.campus)
    return db.organization.findMany({
      where: onCampus ? { campus: onCampus } : {},
      select: {
        id: true,
        slug: true,
        name: true,
        type: true,
        campus: true,
        description: true,
        createdAt: true,
        _count: { select: { members: { where: { status: 'ACTIVE' } }, projects: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  })

  // GET /orgs/events/upcoming — the next few events across all groups, for
  // the home feed's "Coming up"
  app.get<{ Querystring: { take?: string } }>('/events/upcoming', async (request) => {
    const take = Math.min(Math.max(Number(request.query.take) || 3, 1), 10)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    return db.orgActivity.findMany({
      where: { date: { gte: today } },
      include: { org: { select: { slug: true, name: true, campus: true } } },
      orderBy: { date: 'asc' },
      take,
    })
  })

  // POST /orgs — a moderator creates a group and hands it to the exec who runs
  // it (`execEmail` becomes its admin; otherwise the moderator is). A group is
  // a claim to speak for real people, so a moderator checks it once, up front.
  app.post<{
    Body: {
      name?: string
      slug?: string
      type?: string
      campus?: string
      description?: string
      websiteUrl?: string
      discordUrl?: string
      groupMeUrl?: string
      contactEmail?: string
      contactRole?: string
      execEmail?: string
    }
  }>('/', { preHandler: [app.authenticate, requireAdmin] }, async (request, reply) => {
    const body = request.body ?? {}
    const name = String(body.name ?? '').trim()
    const slug = slugify(String(body.slug ?? ''))
    const type = body.type ?? 'CLUB'
    if (!name || !body.slug?.trim())
      return reply.code(400).send({ error: 'name and slug are required' })
    if (name.length > ORG_NAME_MAX)
      return reply.code(400).send({ error: `A name is at most ${ORG_NAME_MAX} characters` })
    if (type !== 'CLUB' && type !== 'LAB')
      return reply.code(400).send({ error: 'type must be CLUB or LAB' })
    const description = String(body.description ?? '').trim() || null
    if (description && description.length > ORG_DESCRIPTION_MAX)
      return reply
        .code(400)
        .send({ error: `A description is at most ${ORG_DESCRIPTION_MAX} characters` })
    if (!slug)
      return reply.code(400).send({ error: 'The address needs at least one letter or number' })
    if (await bySlug(slug)) return reply.code(409).send({ error: `/orgs/${slug} is already taken` })

    const contactEmail =
      String(body.contactEmail ?? '')
        .trim()
        .toLowerCase() || null
    const contactRole =
      String(body.contactRole ?? '')
        .trim()
        .slice(0, 60) || null
    if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      return reply.code(400).send({ error: 'The contact email is not an email address' })
    }

    // The exec who will run the page. They must already have an account, so
    // the page never belongs to an address nobody has signed in with.
    let adminId = request.user.sub
    const execEmail = String(body.execEmail ?? '')
      .trim()
      .toLowerCase()
    if (execEmail) {
      const exec = await db.user.findUnique({ where: { email: execEmail }, select: { id: true } })
      if (!exec) return reply.code(404).send({ error: 'No uofthub account with that email yet' })
      adminId = exec.id
    }

    const websiteUrl = parseLinkField(body.websiteUrl, safeExternalUrl)
    if (websiteUrl === false)
      return reply.code(400).send({ error: 'Website must be an http(s) URL' })
    const discordUrl = parseLinkField(body.discordUrl, safeDiscordUrl)
    if (discordUrl === false)
      return reply.code(400).send({ error: 'Discord link must be a discord.gg or discord.com URL' })
    const groupMeUrl = parseLinkField(body.groupMeUrl, safeGroupMeUrl)
    if (groupMeUrl === false)
      return reply.code(400).send({ error: 'GroupMe link must be a groupme.com URL' })

    const org = await db.organization.create({
      data: {
        name,
        slug,
        type,
        // Null is a real answer here — a group that serves all three campuses.
        campus: parseCampus(body.campus) ?? null,
        description,
        websiteUrl: websiteUrl ?? null,
        discordUrl: discordUrl ?? null,
        groupMeUrl: groupMeUrl ?? null,
        contactEmail,
        contactRole,
        members: { create: { userId: adminId, role: 'ADMIN' } },
      },
    })
    return reply.code(201).send(org)
  })

  // GET /orgs/:slug/share — what a link preview shows; see lib/shareCards.ts
  app.get<{ Params: { slug: string } }>('/:slug/share', async (request, reply) => {
    const card = await orgShare(request.params.slug)
    return card ?? reply.code(404).send({ error: 'Not found' })
  })

  // GET /orgs/:slug/og.png — the group's preview image
  app.get<{ Params: { slug: string } }>('/:slug/og.png', async (request, reply) => {
    const png = await orgCardPng(request.params.slug)
    if (!png) return reply.code(404).send({ error: 'Not found' })
    return reply.headers(PNG_HEADERS).send(png)
  })

  // GET /orgs/:slug — the page. Its members; for its admins, invitations and
  // join requests too; and for the caller, where they stand with it.
  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    const callerId = await getOptionalUserId(request)

    const org = await db.organization.findUnique({
      where: { slug: request.params.slug },
      include: {
        members: { include: { user: PERSON }, orderBy: { joinedAt: 'asc' } },
        activities: {
          orderBy: { date: 'desc' },
          take: PAGE_ACTIVITIES,
          include: { createdBy: { select: { id: true, handle: true, name: true } } },
        },
        projects: {
          // Linking a private project to an org must not publish it.
          where: { project: { is: visibleProjectWhere(callerId) } },
          take: PAGE_PROJECTS,
          include: {
            project: {
              include: {
                owner: { select: { id: true, handle: true, name: true } },
                _count: { select: { comments: true, reactions: true } },
              },
            },
          },
        },
      },
    })
    if (!org) return reply.code(404).send({ error: 'Not found' })

    const mine = org.members.find((m) => m.userId === callerId)
    const isMember = mine?.status === 'ACTIVE'
    const isAdmin = isMember && mine?.role === 'ADMIN'
    const { contactEmail, contactRole, members, ...rest } = org

    return {
      ...rest,
      members: members.filter((m) => m.status === 'ACTIVE'),
      // Only the group's admins see who is waiting, either way.
      ...(isAdmin && {
        invited: members.filter((m) => m.status === 'INVITED'),
        requests: members.filter((m) => m.status === 'REQUESTED'),
      }),
      // Where the caller stands: ACTIVE, INVITED, REQUESTED, or null.
      myStatus: mine?.status ?? null,
      myRole: isMember ? mine!.role : null,
      // How moderators reach the exec — for the group's own members.
      contactEmail: isMember ? contactEmail : undefined,
      contactRole: isMember ? contactRole : undefined,
    }
  })

  // PATCH /orgs/:slug — admins edit the group's own details
  app.patch<{
    Params: { slug: string }
    Body: {
      name?: string
      description?: string | null
      campus?: string | null
      websiteUrl?: string | null
      discordUrl?: string | null
      groupMeUrl?: string | null
    }
  }>('/:slug', { preHandler: [app.authenticate] }, async (request, reply) => {
    const org = await bySlug(request.params.slug)
    if (!org) return reply.code(404).send({ error: 'Not found' })
    if (!(await isOrgAdmin(org.id, request.user.sub)))
      return reply.code(403).send({ error: 'Admins only' })

    const body = request.body ?? {}
    let name: string | undefined
    if (body.name !== undefined) {
      name = String(body.name).trim()
      if (!name || name.length > ORG_NAME_MAX)
        return reply
          .code(400)
          .send({ error: `A name is required, at most ${ORG_NAME_MAX} characters` })
    }
    let description: string | null | undefined
    if (body.description !== undefined) {
      description = String(body.description ?? '').trim() || null
      if (description && description.length > ORG_DESCRIPTION_MAX)
        return reply
          .code(400)
          .send({ error: `A description is at most ${ORG_DESCRIPTION_MAX} characters` })
    }
    // Empty and null both clear it back to "all campuses".
    const campus: Campus | null | undefined =
      body.campus === undefined ? undefined : (parseCampus(body.campus) ?? null)

    const websiteUrl = parseLinkField(body.websiteUrl, safeExternalUrl)
    if (websiteUrl === false)
      return reply.code(400).send({ error: 'Website must be an http(s) URL' })
    const discordUrl = parseLinkField(body.discordUrl, safeDiscordUrl)
    if (discordUrl === false)
      return reply.code(400).send({ error: 'Discord link must be a discord.gg or discord.com URL' })
    const groupMeUrl = parseLinkField(body.groupMeUrl, safeGroupMeUrl)
    if (groupMeUrl === false)
      return reply.code(400).send({ error: 'GroupMe link must be a groupme.com URL' })

    return db.organization.update({
      where: { id: org.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(campus !== undefined && { campus }),
        ...(websiteUrl !== undefined && { websiteUrl }),
        ...(discordUrl !== undefined && { discordUrl }),
        ...(groupMeUrl !== undefined && { groupMeUrl }),
      },
    })
  })

  // DELETE /orgs/:slug — the group's admin, or a moderator. Its events and
  // memberships go with it; the projects linked to it stay their owners'.
  app.delete<{ Params: { slug: string } }>(
    '/:slug',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const org = await bySlug(request.params.slug)
      if (!org) return reply.code(404).send({ error: 'Not found' })
      if (!(await isOrgAdmin(org.id, request.user.sub)) && !(await isModerator(request.user.sub)))
        return reply.code(403).send({ error: 'Forbidden' })
      await db.organization.delete({ where: { id: org.id } })
      return { ok: true }
    }
  )

  // ── MEMBERS ─────────────────────────────────────────────────────────────────

  // POST /orgs/:slug/members — { email, role? } an admin invites someone. If
  // they had already asked to join, this approves them instead.
  app.post<{ Params: { slug: string }; Body: { email?: string; role?: string } }>(
    '/:slug/members',
    { preHandler: [app.authenticate], config: membershipRateLimit },
    async (request, reply) => {
      const org = await bySlug(request.params.slug)
      if (!org) return reply.code(404).send({ error: 'Org not found' })
      if (!(await isOrgAdmin(org.id, request.user.sub)))
        return reply.code(403).send({ error: 'Admins only' })

      const role = request.body?.role ?? 'MEMBER'
      if (!isOrgRole(role)) return reply.code(400).send({ error: 'role must be MEMBER or ADMIN' })

      // Emails are stored lowercased at sign-up, so normalize before lookup.
      const user = await db.user.findUnique({
        where: {
          email: String(request.body?.email ?? '')
            .trim()
            .toLowerCase(),
        },
        select: { id: true },
      })
      if (!user) return reply.code(404).send({ error: 'No uofthub account with that email yet' })

      const where = { orgId_userId: { orgId: org.id, userId: user.id } }
      const existing = await db.orgMember.findUnique({ where })
      if (existing?.status === 'ACTIVE') return reply.code(409).send({ error: 'Already a member' })
      if (existing?.status === 'INVITED') return reply.code(409).send({ error: 'Already invited' })

      if (existing?.status === 'REQUESTED') {
        const member = await db.orgMember.update({
          where,
          data: { status: 'ACTIVE', role, joinedAt: new Date() },
          include: { user: PERSON },
        })
        await notify(user.id, 'ORG_MEMBERSHIP_DECIDED', {
          slug: org.slug,
          orgName: org.name,
          accepted: true,
        })
        return reply.code(201).send(member)
      }

      const inviter = await db.user.findUnique({
        where: { id: request.user.sub },
        select: { name: true },
      })
      const member = await db.orgMember.create({
        data: { orgId: org.id, userId: user.id, role, status: 'INVITED' },
        include: { user: PERSON },
      })
      await notify(user.id, 'ORG_INVITED', {
        slug: org.slug,
        orgName: org.name,
        inviterName: inviter?.name,
      })
      return reply.code(201).send(member)
    }
  )

  // POST /orgs/:slug/join — ask to join. If an admin had already invited the
  // caller, this accepts the invitation instead.
  app.post<{ Params: { slug: string } }>(
    '/:slug/join',
    { preHandler: [app.authenticate], config: membershipRateLimit },
    async (request, reply) => {
      const org = await bySlug(request.params.slug)
      if (!org) return reply.code(404).send({ error: 'Not found' })
      const me = request.user.sub
      const where = { orgId_userId: { orgId: org.id, userId: me } }
      const existing = await db.orgMember.findUnique({ where })
      if (existing?.status === 'ACTIVE') return reply.code(409).send({ error: 'Already a member' })
      if (existing?.status === 'REQUESTED') return { status: 'REQUESTED' }
      if (existing?.status === 'INVITED') {
        await db.orgMember.update({ where, data: { status: 'ACTIVE', joinedAt: new Date() } })
        return { status: 'ACTIVE' }
      }

      await db.orgMember.create({ data: { orgId: org.id, userId: me, status: 'REQUESTED' } })
      const [admins, requester] = await Promise.all([
        db.orgMember.findMany({
          where: { orgId: org.id, status: 'ACTIVE', role: 'ADMIN' },
          select: { userId: true },
        }),
        db.user.findUnique({ where: { id: me }, select: { name: true } }),
      ])
      await notifyMany(
        admins.map((a) => a.userId),
        'ORG_JOIN_REQUESTED',
        { slug: org.slug, orgName: org.name, actorId: me, actorName: requester?.name }
      )
      return { status: 'REQUESTED' }
    }
  )

  // POST /orgs/:slug/membership — { accepted } the invitee answers an invitation
  app.post<{ Params: { slug: string }; Body: { accepted?: boolean } }>(
    '/:slug/membership',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (typeof request.body?.accepted !== 'boolean')
        return reply.code(400).send({ error: 'accepted must be true or false' })
      const org = await bySlug(request.params.slug)
      if (!org) return reply.code(404).send({ error: 'Not found' })
      const where = { orgId_userId: { orgId: org.id, userId: request.user.sub } }
      const invite = await db.orgMember.findUnique({ where })
      if (invite?.status !== 'INVITED')
        return reply.code(404).send({ error: 'No invitation found' })
      if (request.body.accepted)
        await db.orgMember.update({ where, data: { status: 'ACTIVE', joinedAt: new Date() } })
      else await db.orgMember.delete({ where })
      return { ok: true, status: request.body.accepted ? 'ACTIVE' : null }
    }
  )

  // PATCH /orgs/:slug/members/:userId — { role?, approve? } an admin approves
  // a join request, or makes someone an admin or a member
  app.patch<{
    Params: { slug: string; userId: string }
    Body: { role?: string; approve?: boolean }
  }>('/:slug/members/:userId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const org = await bySlug(request.params.slug)
    if (!org) return reply.code(404).send({ error: 'Not found' })
    if (!(await isOrgAdmin(org.id, request.user.sub)))
      return reply.code(403).send({ error: 'Admins only' })

    const where = { orgId_userId: { orgId: org.id, userId: request.params.userId } }
    const member = await db.orgMember.findUnique({ where })
    if (!member) return reply.code(404).send({ error: 'Not a member' })

    const role = request.body?.role
    if (role !== undefined && !isOrgRole(role))
      return reply.code(400).send({ error: 'role must be MEMBER or ADMIN' })
    if (role === 'MEMBER' && member.role === 'ADMIN' && member.status === 'ACTIVE') {
      const admins = await db.orgMember.count({
        where: { orgId: org.id, status: 'ACTIVE', role: 'ADMIN' },
      })
      if (admins <= 1) return reply.code(400).send({ error: 'Make someone else an admin first' })
    }

    const approving = request.body?.approve === true && member.status === 'REQUESTED'
    const updated = await db.orgMember.update({
      where,
      data: {
        ...(role && { role }),
        ...(approving && { status: 'ACTIVE', joinedAt: new Date() }),
      },
      include: { user: PERSON },
    })
    if (approving)
      await notify(member.userId, 'ORG_MEMBERSHIP_DECIDED', {
        slug: org.slug,
        orgName: org.name,
        accepted: true,
      })
    return updated
  })

  // DELETE /orgs/:slug/members/:userId — an admin removes someone, withdraws
  // an invitation or turns down a request; anyone leaves by removing themself.
  // A group always keeps an admin while it has other members.
  app.delete<{ Params: { slug: string; userId: string } }>(
    '/:slug/members/:userId',
    { preHandler: [app.authenticate], config: { allowSuspended: true } },
    async (request, reply) => {
      const org = await bySlug(request.params.slug)
      if (!org) return reply.code(404).send({ error: 'Not found' })
      const self = request.params.userId === request.user.sub
      if (!self && !(await isOrgAdmin(org.id, request.user.sub)))
        return reply.code(403).send({ error: 'Admins only' })

      const where = { orgId_userId: { orgId: org.id, userId: request.params.userId } }
      const member = await db.orgMember.findUnique({ where })
      if (!member) return reply.code(404).send({ error: 'Not a member' })

      if (member.status === 'ACTIVE' && member.role === 'ADMIN') {
        const [admins, others] = await Promise.all([
          db.orgMember.count({ where: { orgId: org.id, status: 'ACTIVE', role: 'ADMIN' } }),
          db.orgMember.count({
            where: { orgId: org.id, status: 'ACTIVE', userId: { not: member.userId } },
          }),
        ])
        if (admins <= 1 && others > 0)
          return reply.code(400).send({ error: 'Make someone else an admin first' })
      }

      await db.orgMember.delete({ where })
      if (!self && member.status === 'REQUESTED')
        await notify(member.userId, 'ORG_MEMBERSHIP_DECIDED', {
          slug: org.slug,
          orgName: org.name,
          accepted: false,
        })
      return { ok: true }
    }
  )

  // ── ACTIVITIES ──────────────────────────────────────────────────────────────

  // GET /orgs/:slug/activities
  app.get<{ Params: { slug: string } }>('/:slug/activities', async (request, reply) => {
    const org = await bySlug(request.params.slug)
    if (!org) return reply.code(404).send({ error: 'Not found' })
    return db.orgActivity.findMany({
      where: { orgId: org.id },
      orderBy: { date: 'desc' },
      take: PAGE_ACTIVITIES,
      include: { createdBy: { select: { id: true, handle: true, name: true } } },
    })
  })

  // POST /orgs/:slug/activities — any member can post
  app.post<{
    Params: { slug: string }
    Body: { title?: string; description?: string; date?: string; link?: string; imageUrl?: string }
  }>('/:slug/activities', { preHandler: [app.authenticate] }, async (request, reply) => {
    const org = await bySlug(request.params.slug)
    if (!org) return reply.code(404).send({ error: 'Not found' })
    if (!(await activeMembership(org.id, request.user.sub)))
      return reply.code(403).send({ error: 'Not a member of this org' })

    const fields = parseActivity(request.body ?? {}, true)
    if ('error' in fields) return reply.code(400).send({ error: fields.error })

    const activity = await db.orgActivity.create({
      data: {
        orgId: org.id,
        createdById: request.user.sub,
        title: fields.title!,
        description: fields.description ?? null,
        date: fields.date!,
        link: fields.link ?? null,
        imageUrl: fields.imageUrl ?? null,
      },
      include: { createdBy: { select: { id: true, handle: true, name: true } } },
    })
    return reply.code(201).send(activity)
  })

  /** An activity of this group the caller may change: its author, or an admin. */
  async function ownActivity(
    slug: string,
    id: string,
    userId: string
  ): Promise<{ status: 404 | 403 } | { activity: { id: string } }> {
    const org = await bySlug(slug)
    if (!org) return { status: 404 }
    // Scoped to this org: being an admin of one group must not reach another
    // group's activity by id.
    const activity = await db.orgActivity.findFirst({ where: { id, orgId: org.id } })
    if (!activity) return { status: 404 }
    if (activity.createdById !== userId && !(await isOrgAdmin(org.id, userId)))
      return { status: 403 }
    return { activity }
  }

  // PATCH /orgs/:slug/activities/:id — its author, or an org admin
  app.patch<{
    Params: { slug: string; id: string }
    Body: { title?: string; description?: string; date?: string; link?: string; imageUrl?: string }
  }>('/:slug/activities/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const found = await ownActivity(request.params.slug, request.params.id, request.user.sub)
    if (!('activity' in found))
      return reply
        .code(found.status)
        .send({ error: found.status === 404 ? 'Not found' : 'Forbidden' })
    const fields = parseActivity(request.body ?? {}, false)
    if ('error' in fields) return reply.code(400).send({ error: fields.error })
    return db.orgActivity.update({
      where: { id: found.activity.id },
      data: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
      include: { createdBy: { select: { id: true, handle: true, name: true } } },
    })
  })

  // DELETE /orgs/:slug/activities/:id — its author, an org admin or a moderator
  app.delete<{ Params: { slug: string; id: string } }>(
    '/:slug/activities/:id',
    { preHandler: [app.authenticate], config: { allowSuspended: true } },
    async (request, reply) => {
      const found = await ownActivity(request.params.slug, request.params.id, request.user.sub)
      if (
        !('activity' in found) &&
        !(found.status === 403 && (await isModerator(request.user.sub)))
      )
        return reply
          .code(found.status)
          .send({ error: found.status === 404 ? 'Not found' : 'Forbidden' })
      await db.orgActivity.deleteMany({ where: { id: request.params.id } })
      return { ok: true }
    }
  )

  // POST /orgs/:slug/activities/:id/report — { reason, details? }
  app.post<{ Params: { slug: string; id: string }; Body: { reason?: string; details?: string } }>(
    '/:slug/activities/:id/report',
    { preHandler: [app.authenticate], config: reportRateLimit },
    async (request, reply) => {
      const reason = request.body?.reason
      if (!isReportReason(reason))
        return reply.code(400).send({ error: 'A valid reason is required' })
      const org = await bySlug(request.params.slug)
      if (!org) return reply.code(404).send({ error: 'Not found' })
      const activity = await db.orgActivity.findFirst({
        where: { id: request.params.id, orgId: org.id },
        select: { id: true, createdById: true, title: true, description: true },
      })
      if (!activity) return reply.code(404).send({ error: 'Not found' })
      const report = await fileReport({
        reporterId: request.user.sub,
        subjectUserId: activity.createdById,
        target: { targetType: 'ORG_ACTIVITY', activityId: activity.id },
        reason,
        details: request.body.details,
        excerpt: [activity.title, activity.description].filter(Boolean).join('\n\n'),
      })
      if ('error' in report) return reply.code(report.status).send({ error: report.error })
      return reply.code(201).send(report)
    }
  )

  // ── PROJECTS ────────────────────────────────────────────────────────────────

  // POST /orgs/:slug/projects — { projectId } link a project to this org
  app.post<{ Params: { slug: string }; Body: { projectId?: string } }>(
    '/:slug/projects',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const org = await bySlug(request.params.slug)
      if (!org) return reply.code(404).send({ error: 'Org not found' })
      if (!(await activeMembership(org.id, request.user.sub)))
        return reply.code(403).send({ error: 'Not a member of this org' })

      // Only the project's owner may attach it: org membership alone must not
      // let someone list another person's project under their group.
      const projectId = String(request.body?.projectId ?? '')
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { ownerId: true },
      })
      if (!project) return reply.code(404).send({ error: 'Project not found' })
      if (project.ownerId !== request.user.sub) {
        return reply.code(403).send({ error: 'Only the project owner can link it to an org' })
      }

      const link = await db.orgProject.upsert({
        where: { orgId_projectId: { orgId: org.id, projectId } },
        update: {},
        create: { orgId: org.id, projectId },
      })
      return reply.code(201).send(link)
    }
  )

  // DELETE /orgs/:slug/projects/:projectId — unlink a project. The project's
  // owner can take their work off a group's page, and a group admin can take
  // a project off theirs.
  app.delete<{ Params: { slug: string; projectId: string } }>(
    '/:slug/projects/:projectId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const org = await bySlug(request.params.slug)
      if (!org) return reply.code(404).send({ error: 'Org not found' })
      const project = await db.project.findUnique({
        where: { id: request.params.projectId },
        select: { ownerId: true },
      })
      if (!project) return reply.code(404).send({ error: 'Project not found' })
      if (project.ownerId !== request.user.sub && !(await isOrgAdmin(org.id, request.user.sub))) {
        return reply
          .code(403)
          .send({ error: 'Only the project owner or a group admin can unlink it' })
      }
      await db.orgProject.deleteMany({
        where: { orgId: org.id, projectId: request.params.projectId },
      })
      return { ok: true }
    }
  )
}
