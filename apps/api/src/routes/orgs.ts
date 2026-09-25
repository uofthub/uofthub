import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { getOptionalUserId, visibleProjectWhere } from '../lib/visibility.js'
import { safeDiscordUrl, safeExternalUrl, safeGroupMeUrl } from '../lib/url.js'
import { canViewOrg, verificationDeadlineFromNow, visibleOrgWhere } from '../lib/orgs.js'
import { emailAdminsOfSubmission } from '../lib/orgEmails.js'
import { parseCampus } from '../lib/campus.js'

const VERIFICATION_NOTE_MAX = 2000

/** A verification submission is prose, not a form — it just can't be empty. */
function readNote(raw: unknown): string {
  return String(raw ?? '').trim().slice(0, VERIFICATION_NOTE_MAX)
}

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

  // POST /orgs — create org (auth required). Unlike before, this does not
  // publish: the group enters PENDING_VERIFICATION with a 7-day deadline and
  // is visible to nobody but its members until an admin approves it.
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
    }
  }>('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { name, slug, type = 'CLUB', description, websiteUrl, discordUrl, groupMeUrl } = request.body
    if (!name?.trim() || !slug?.trim()) return reply.code(400).send({ error: 'name and slug are required' })

    const contactEmail = (request.body.contactEmail ?? '').trim().toLowerCase()
    const contactRole = (request.body.contactRole ?? '').trim()
    // Both are what makes the claim reviewable at all — an admin needs
    // somebody to ask, and a role to weigh the claim against.
    if (!contactEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      return reply.code(400).send({ error: 'A contact email is required' })
    }
    if (!contactRole) {
      return reply.code(400).send({ error: 'Your role in the group is required' })
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
        status: 'PENDING_VERIFICATION',
        verificationDeadline: verificationDeadlineFromNow(),
        members: { create: { userId: request.user.sub, role: 'ADMIN' } },
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
                _count: { select: { likes: true, comments: true } },
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

  // POST /orgs/:slug/verify — the group submits its verification material
  app.post<{ Params: { slug: string }; Body: { note?: string } }>(
    '/:slug/verify',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const org = await db.organization.findUnique({ where: { slug: request.params.slug } })
      if (!org) return reply.code(404).send({ error: 'Not found' })

      const member = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId: org.id, userId: request.user.sub } },
      })
      if (member?.role !== 'ADMIN') return reply.code(403).send({ error: 'Admins only' })

      if (org.status === 'VERIFIED') return reply.code(409).send({ error: 'This group is already verified' })
      if (org.status === 'IN_REVIEW') {
        return reply.code(409).send({ error: 'This group is already in review' })
      }

      // The sweep deletes expired groups, but it runs on a schedule — so the
      // window is enforced here too rather than trusting the cron to have run.
      if (org.verificationDeadline && org.verificationDeadline < new Date()) {
        return reply.code(410).send({ error: 'The verification window for this group has closed' })
      }

      const note = readNote(request.body?.note)
      if (!note) return reply.code(400).send({ error: 'Describe how we can verify the group' })

      const updated = await db.organization.update({
        where: { id: org.id },
        // The deadline is cleared, not extended: the clock was on the group to
        // submit, and review takes as long as it takes.
        data: { status: 'IN_REVIEW', verificationNote: note, verificationDeadline: null },
      })

      await emailAdminsOfSubmission(updated, note)
      return updated
    }
  )

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
