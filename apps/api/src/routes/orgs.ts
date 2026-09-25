import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { getOptionalUserId, visibleProjectWhere } from '../lib/visibility.js'
import { safeDiscordUrl, safeExternalUrl, safeGroupMeUrl } from '../lib/url.js'
import { canViewOrg, visibleOrgWhere } from '../lib/orgs.js'
import { requireAdmin } from '../lib/admin.js'
import { parseCampus } from '../lib/campus.js'

export const orgRoutes: FastifyPluginAsync = async (app) => {
  // GET /orgs — verified groups, plus the caller's own whatever their state
  app.get<{ Querystring: { campus?: string } }>('/', async (request) => {
    const callerId = await getOptionalUserId(request)
    // Unrecognised values are dropped, not rejected — same reasoning as the
    // project directory's filter.
    const onCampus = parseCampus(request.query.campus)
    return db.organization.findMany({
      where: { ...visibleOrgWhere(callerId), ...(onCampus && { campus: onCampus }) },
      include: { _count: { select: { members: true, projects: true } } },
      orderBy: { createdAt: 'desc' },
    })
  })

  // GET /orgs/events/upcoming — the next few events across verified groups,
  // for the home feed's "Coming up". Only verified groups: an unverified one
  // is invisible to everyone but its members, and so are its events.
  app.get<{ Querystring: { take?: string } }>('/events/upcoming', async (request) => {
    const take = Math.min(Math.max(Number(request.query.take) || 3, 1), 10)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    return db.orgActivity.findMany({
      where: { date: { gte: today }, org: { status: 'VERIFIED' } },
      include: { org: { select: { slug: true, name: true, campus: true } } },
      orderBy: { date: 'asc' },
      take,
    })
  })

  // POST /orgs — a moderator creates a group, already verified, and hands it
  // to the exec who runs it (`execEmail` becomes its admin; otherwise the
  // moderator is). Self-serve creation with its evidence, deadline and sweep
  // was set aside: a group is a claim to speak for real people, and a
  // moderator checking it once up front is simpler than a queue.
  app.post<{
    Body: {
      name: string
      slug: string
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
    const { name, slug, type = 'CLUB', description, websiteUrl, discordUrl, groupMeUrl } = request.body
    if (!name?.trim() || !slug?.trim()) return reply.code(400).send({ error: 'name and slug are required' })

    const contactEmail = (request.body.contactEmail ?? '').trim().toLowerCase() || null
    const contactRole = (request.body.contactRole ?? '').trim() || null
    if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      return reply.code(400).send({ error: 'The contact email is not an email address' })
    }

    // The exec who will run the page. They must already have an account, so
    // the page never belongs to an address nobody has signed in with.
    let adminId = request.user.sub
    const execEmail = (request.body.execEmail ?? '').trim().toLowerCase()
    if (execEmail) {
      const exec = await db.user.findUnique({ where: { email: execEmail }, select: { id: true } })
      if (!exec) return reply.code(404).send({ error: 'No uofthub account with that email yet' })
      adminId = exec.id
    }

    const slugified = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')

    // Rendered as an <a href> on the org page, so http(s) only.
    let safeWebsite: string | undefined
    if (websiteUrl?.trim()) {
      const parsed = safeExternalUrl(websiteUrl)
      if (!parsed) return reply.code(400).send({ error: 'Website must be an http(s) URL' })
      safeWebsite = parsed
    }

    let safeDiscord: string | undefined
    if (discordUrl?.trim()) {
      const parsed = safeDiscordUrl(discordUrl)
      if (!parsed) return reply.code(400).send({ error: 'Discord link must be a discord.gg or discord.com URL' })
      safeDiscord = parsed
    }

    let safeGroupMe: string | undefined
    if (groupMeUrl?.trim()) {
      const parsed = safeGroupMeUrl(groupMeUrl)
      if (!parsed) return reply.code(400).send({ error: 'GroupMe link must be a groupme.com URL' })
      safeGroupMe = parsed
    }

    const org = await db.organization.create({
      data: {
        name: name.trim(),
        slug: slugified,
        type: type as 'CLUB' | 'LAB',
        // Null is a real answer here — a group that serves all three campuses.
        campus: parseCampus(request.body.campus) ?? null,
        description: description?.trim(),
        websiteUrl: safeWebsite,
        discordUrl: safeDiscord,
        groupMeUrl: safeGroupMe,
        contactEmail,
        contactRole,
        status: 'VERIFIED',
        verifiedAt: new Date(),
        members: { create: { userId: adminId, role: 'ADMIN' } },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true } } } },
        _count: { select: { members: true, projects: true } },
      },
    })
    return reply.code(201).send(org)
  })

  // GET /orgs/:slug
  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    const callerId = await getOptionalUserId(request)

    const org = await db.organization.findUnique({
      where: { slug: request.params.slug },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true, faculty: true, campus: true } },
          },
        },
        activities: {
          orderBy: { date: 'desc' },
          include: { createdBy: { select: { id: true, name: true } } },
        },
        projects: {
          // Linking a private project to an org must not publish it.
          where: { project: { is: visibleProjectWhere(callerId) } },
          include: {
            project: {
              include: {
                owner: { select: { id: true, name: true } },
                _count: { select: { comments: true, reactions: true } },
              },
            },
          },
        },
      },
    })
    if (!org) return reply.code(404).send({ error: 'Not found' })

    // 404 rather than 403, same reasoning as a private project: an unverified
    // slug should not confirm that it exists.
    if (!(await canViewOrg(org, callerId))) return reply.code(404).send({ error: 'Not found' })

    const isMember = org.members.some((m) => m.userId === callerId)

    return {
      ...org,
      // Contact details and the reviewer's notes are for the group itself,
      // not for every visitor reading a verified page.
      contactEmail: isMember ? org.contactEmail : undefined,
      contactRole: isMember ? org.contactRole : undefined,
      verificationNote: isMember ? org.verificationNote : undefined,
      reviewNote: isMember ? org.reviewNote : undefined,
    }
  })

  // PATCH /orgs/:slug — admins edit the group's own details
  app.patch<{
    Params: { slug: string }
    Body: {
      description?: string
      campus?: string | null
      websiteUrl?: string
      discordUrl?: string
      groupMeUrl?: string
    }
  }>('/:slug', { preHandler: [app.authenticate] }, async (request, reply) => {
    const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
    if (!org) return reply.code(404).send({ error: 'Not found' })

    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: request.user.sub } },
    })
    if (member?.role !== 'ADMIN') return reply.code(403).send({ error: 'Admins only' })

    const { description, campus, websiteUrl, discordUrl, groupMeUrl } = request.body

    // Empty and null both clear it back to "all campuses".
    const nextCampus = campus === undefined ? undefined : (parseCampus(campus) ?? null)

    let safeWebsite: string | null | undefined
    if (websiteUrl !== undefined) {
      safeWebsite = websiteUrl.trim() ? safeExternalUrl(websiteUrl) : null
      if (websiteUrl.trim() && !safeWebsite) {
        return reply.code(400).send({ error: 'Website must be an http(s) URL' })
      }
    }

    let safeDiscord: string | null | undefined
    if (discordUrl !== undefined) {
      safeDiscord = discordUrl.trim() ? safeDiscordUrl(discordUrl) : null
      if (discordUrl.trim() && !safeDiscord) {
        return reply.code(400).send({ error: 'Discord link must be a discord.gg or discord.com URL' })
      }
    }

    let safeGroupMe: string | null | undefined
    if (groupMeUrl !== undefined) {
      safeGroupMe = groupMeUrl.trim() ? safeGroupMeUrl(groupMeUrl) : null
      if (groupMeUrl.trim() && !safeGroupMe) {
        return reply.code(400).send({ error: 'GroupMe link must be a groupme.com URL' })
      }
    }

    const updated = await db.organization.update({
      where: { id: org.id },
      data: {
        ...(description !== undefined && { description: description.trim() || null }),
        ...(nextCampus !== undefined && { campus: nextCampus }),
        ...(safeWebsite !== undefined && { websiteUrl: safeWebsite }),
        ...(safeDiscord !== undefined && { discordUrl: safeDiscord }),
        ...(safeGroupMe !== undefined && { groupMeUrl: safeGroupMe }),
      },
    })
    return updated
  })

  // ── ACTIVITIES ──────────────────────────────────────────────────────────────

  // GET /orgs/:slug/activities
  app.get<{ Params: { slug: string } }>('/:slug/activities', async (request, reply) => {
    const callerId = await getOptionalUserId(request)
    const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
    if (!org || !(await canViewOrg(org, callerId))) return reply.code(404).send({ error: 'Not found' })

    return db.orgActivity.findMany({
      where: { orgId: org.id },
      orderBy: { date: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    })
  })

  // POST /orgs/:slug/activities — any member can post
  app.post<{
    Params: { slug: string }
    Body: { title?: string; description?: string; date?: string; link?: string; imageUrl?: string }
  }>('/:slug/activities', { preHandler: [app.authenticate] }, async (request, reply) => {
    const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
    if (!org) return reply.code(404).send({ error: 'Not found' })

    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: request.user.sub } },
    })
    if (!member) return reply.code(403).send({ error: 'Not a member of this org' })

    const title = (request.body.title ?? '').trim()
    if (!title) return reply.code(400).send({ error: 'Title is required' })

    // Defaults to now, so "we ran this today" needs no date picking.
    const date = request.body.date ? new Date(request.body.date) : new Date()
    if (Number.isNaN(date.getTime())) return reply.code(400).send({ error: 'Invalid date' })

    // Both render as an href / img src, so both go through the same guard.
    let link: string | undefined
    if (request.body.link?.trim()) {
      const parsed = safeExternalUrl(request.body.link)
      if (!parsed) return reply.code(400).send({ error: 'Link must be an http(s) URL' })
      link = parsed
    }
    let imageUrl: string | undefined
    if (request.body.imageUrl?.trim()) {
      const parsed = safeExternalUrl(request.body.imageUrl)
      if (!parsed) return reply.code(400).send({ error: 'Image must be an http(s) URL' })
      imageUrl = parsed
    }

    const activity = await db.orgActivity.create({
      data: {
        orgId: org.id,
        createdById: request.user.sub,
        title,
        description: request.body.description?.trim() || null,
        date,
        link,
        imageUrl,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    })
    return reply.code(201).send(activity)
  })

  // DELETE /orgs/:slug/activities/:id — its author, or an org admin
  app.delete<{ Params: { slug: string; id: string } }>(
    '/:slug/activities/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
      if (!org) return reply.code(404).send({ error: 'Not found' })

      // Scoped to this org, same reasoning as DELETE .../links/:linkId: being
      // an admin of one group must not delete another group's activity by id.
      const activity = await db.orgActivity.findFirst({
        where: { id: request.params.id, orgId: org.id },
      })
      if (!activity) return reply.code(404).send({ error: 'Not found' })

      const member = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId: org.id, userId: request.user.sub } },
      })
      const canDelete = activity.createdById === request.user.sub || member?.role === 'ADMIN'
      if (!canDelete) return reply.code(403).send({ error: 'Forbidden' })

      await db.orgActivity.delete({ where: { id: activity.id } })
      return { ok: true }
    }
  )

  // POST /orgs/:slug/projects — link a project to this org
  app.post<{ Params: { slug: string }; Body: { projectId: string } }>(
    '/:slug/projects',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
      if (!org) return reply.code(404).send({ error: 'Org not found' })

      const member = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId: org.id, userId: request.user.sub } },
      })
      if (!member) return reply.code(403).send({ error: 'Not a member of this org' })

      // Only the project's owner may attach it: org membership alone must not
      // let someone list another person's project under their group.
      const project = await db.project.findUnique({
        where: { id: request.body.projectId },
        select: { ownerId: true },
      })
      if (!project) return reply.code(404).send({ error: 'Project not found' })
      if (project.ownerId !== request.user.sub) {
        return reply.code(403).send({ error: 'Only the project owner can link it to an org' })
      }

      const link = await db.orgProject.upsert({
        where: { orgId_projectId: { orgId: org.id, projectId: request.body.projectId } },
        update: {},
        create: { orgId: org.id, projectId: request.body.projectId },
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
      const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
      if (!org) return reply.code(404).send({ error: 'Org not found' })
      const [project, member] = await Promise.all([
        db.project.findUnique({ where: { id: request.params.projectId }, select: { ownerId: true } }),
        db.orgMember.findUnique({ where: { orgId_userId: { orgId: org.id, userId: request.user.sub } } }),
      ])
      if (!project) return reply.code(404).send({ error: 'Project not found' })
      if (project.ownerId !== request.user.sub && member?.role !== 'ADMIN') {
        return reply.code(403).send({ error: 'Only the project owner or a group admin can unlink it' })
      }
      await db.orgProject.deleteMany({ where: { orgId: org.id, projectId: request.params.projectId } })
      return { ok: true }
    }
  )

  // POST /orgs/:slug/members — add a member by email
  app.post<{ Params: { slug: string }; Body: { email: string; role?: string } }>(
    '/:slug/members',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
      if (!org) return reply.code(404).send({ error: 'Org not found' })

      const requester = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId: org.id, userId: request.user.sub } },
      })
      if (requester?.role !== 'ADMIN') return reply.code(403).send({ error: 'Admins only' })

      // Emails are stored lowercased at sign-up, so normalize before lookup.
      const user = await db.user.findUnique({
        where: { email: (request.body.email ?? '').trim().toLowerCase() },
      })
      if (!user) return reply.code(404).send({ error: 'User not found' })

      const member = await db.orgMember.upsert({
        where: { orgId_userId: { orgId: org.id, userId: user.id } },
        update: { role: request.body.role ?? 'MEMBER' },
        create: { orgId: org.id, userId: user.id, role: request.body.role ?? 'MEMBER' },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
      return reply.code(201).send(member)
    }
  )
}
