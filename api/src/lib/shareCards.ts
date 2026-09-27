import { createHash } from 'node:crypto'
import type { Campus, OrgType } from '@prisma/client'
import { db } from '../db/client.js'
import { listedProjectWhere } from './visibility.js'
import { coverUrls } from './covers.js'
import { getObjectHead } from './storage.js'
import { AVATAR_MAX_BYTES } from './fileValidation.js'
import {
  cachedPng,
  imageDataUri,
  OG_HEIGHT,
  OG_WIDTH,
  initialsOf,
  renderCard,
  TYPE_BADGES,
  type Card,
} from './ogImage.js'

/**
 * What a link preview shows for a project, a profile or a group: the
 * `/share` routes' answers, read by web/functions to write the page's head,
 * and the cards the `/og.png` routes draw. Everything here is read signed in
 * as nobody — a preview is fetched by whatever site the link is pasted into.
 */

const apiBase = () => process.env.API_URL ?? 'http://localhost:3001'

/**
 * A short fingerprint of what a card draws. It goes in the image's URL, so
 * an edit is a new address — Discord and Slack keep an image under its URL for
 * days — and keys the render cache the same way.
 */
const fingerprint = (...parts: unknown[]) =>
  createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12)

const CAMPUS_NAMES: Record<Campus, string> = {
  UTSG: 'St. George',
  UTM: 'Mississauga',
  UTSC: 'Scarborough',
}

/** Sent with a drawn card, so a preview can state its size; a cover's we don't know. */
const CARD_SIZE = { width: OG_WIDTH, height: OG_HEIGHT }

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

// ── Projects ────────────────────────────────────────────────────────────────

const PROJECT_SELECT = {
  id: true,
  title: true,
  pitch: true,
  type: true,
  tags: true,
  publishedAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true } },
} as const

/** A project anyone may see, or null — drafts, U of T-only and hidden alike. */
const publicProject = (id: string) =>
  db.project.findFirst({
    where: { AND: [{ id }, listedProjectWhere(false)] },
    select: PROJECT_SELECT,
  })

type SharedProject = NonNullable<Awaited<ReturnType<typeof publicProject>>>

const projectCard = (p: SharedProject): Card => ({
  badge: p.type ? TYPE_BADGES[p.type] : undefined,
  title: p.title,
  body: p.pitch,
  footer: `By ${p.owner.name}`,
})

export async function projectShare(id: string) {
  const project = await publicProject(id)
  if (!project) return null
  const { covers } = await coverUrls([project.id])
  const hasCover = covers.has(project.id)
  return {
    title: project.title,
    pitch: project.pitch,
    type: project.type,
    tags: project.tags,
    ownerId: project.owner.id,
    ownerName: project.owner.name,
    publishedAt: project.publishedAt,
    updatedAt: project.updatedAt,
    // The cover when there is one, through a stable address that signs a
    // fresh URL each time — previews are fetched long after they are made.
    // Otherwise a card drawn from the title and pitch.
    image: hasCover
      ? `${apiBase()}/projects/${project.id}/cover`
      : `${apiBase()}/projects/${project.id}/og.png?v=${fingerprint(projectCard(project))}`,
    imageSize: hasCover ? null : CARD_SIZE,
  }
}

export async function projectCardPng(id: string): Promise<Buffer | null> {
  const project = await publicProject(id)
  if (!project) return null
  const card = projectCard(project)
  return cachedPng(`project:${id}:${fingerprint(card)}`, () => renderCard(card))
}

// ── Profiles ────────────────────────────────────────────────────────────────

/**
 * A profile, or null for none — or for an address nobody has confirmed,
 * which is nobody's yet (see routes/auth.ts) and has no business in a preview.
 */
async function confirmedUser(id: string) {
  const user = await db.user.findFirst({
    where: { id, emailVerifiedAt: { not: null } },
    select: {
      id: true,
      name: true,
      program: true,
      faculty: true,
      campus: true,
      classYear: true,
      bio: true,
      avatarKey: true,
      // Carries ?v= when the picture changes, which the fingerprint needs:
      // the object key itself never does.
      avatarUrl: true,
      websiteUrl: true,
      githubUrl: true,
      linkedinUrl: true,
    },
  })
  if (!user) return null
  const projectCount = await db.project.count({
    where: { AND: [{ ownerId: user.id }, listedProjectWhere(false)] },
  })
  return { ...user, projectCount }
}

type SharedUser = NonNullable<Awaited<ReturnType<typeof confirmedUser>>>

/** "Computer Science · Arts & Science · Class of 2027" — what they study. */
const headline = (u: SharedUser) =>
  [u.program, u.faculty, u.classYear && `Class of ${u.classYear}`].filter(Boolean).join(' · ')

const userCard = (u: SharedUser): Card => ({
  avatar: { initials: initialsOf(u.name) },
  title: u.name,
  body: headline(u) || u.bio,
  footer: [
    u.projectCount > 0 && plural(u.projectCount, 'project'),
    u.campus && CAMPUS_NAMES[u.campus],
  ]
    .filter(Boolean)
    .join(' · '),
})

const userFingerprint = (u: SharedUser) => fingerprint(userCard(u), u.avatarUrl)

export async function userShare(id: string) {
  const user = await confirmedUser(id)
  if (!user) return null
  return {
    name: user.name,
    headline: headline(user) || null,
    bio: user.bio,
    campus: user.campus && CAMPUS_NAMES[user.campus],
    projectCount: user.projectCount,
    links: [user.websiteUrl, user.githubUrl, user.linkedinUrl].filter(Boolean),
    image: `${apiBase()}/users/${user.id}/og.png?v=${userFingerprint(user)}`,
    imageSize: CARD_SIZE,
  }
}

export async function userCardPng(id: string): Promise<Buffer | null> {
  const user = await confirmedUser(id)
  if (!user) return null
  const card = userCard(user)
  return cachedPng(`user:${id}:${userFingerprint(user)}`, async () => {
    // Their picture if we hold it; initials if not, or if it will not load.
    const bytes = user.avatarKey
      ? await getObjectHead(user.avatarKey, AVATAR_MAX_BYTES).catch(() => null)
      : null
    const image = bytes && imageDataUri(bytes)
    return renderCard({ ...card, avatar: { initials: initialsOf(user.name), image } })
  })
}

/**
 * Profiles worth a search engine's time: confirmed, with at least one public
 * project. A student who has only signed up is findable by link, not listed.
 */
export const userSitemap = () =>
  db.user.findMany({
    where: {
      emailVerifiedAt: { not: null },
      ownedProjects: { some: listedProjectWhere(false) },
    },
    select: { id: true, updatedAt: true },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
  })

// ── Groups ──────────────────────────────────────────────────────────────────

const ORG_TYPES: Record<OrgType, { text: string; bg: string; ink: string }> = {
  CLUB: { text: 'Club', bg: '#E6EBF4', ink: '#1E3765' },
  LAB: { text: 'Lab', bg: '#E3EEE6', ink: '#1F5B34' },
}

const orgBySlug = (slug: string) =>
  db.organization.findUnique({
    where: { slug },
    select: {
      slug: true,
      name: true,
      type: true,
      campus: true,
      description: true,
      websiteUrl: true,
      _count: { select: { members: { where: { status: 'ACTIVE' } } } },
    },
  })

type SharedOrg = NonNullable<Awaited<ReturnType<typeof orgBySlug>>>

const orgCard = (o: SharedOrg): Card => ({
  badge: ORG_TYPES[o.type],
  title: o.name,
  body: o.description,
  footer: [plural(o._count.members, 'member'), o.campus && CAMPUS_NAMES[o.campus]]
    .filter(Boolean)
    .join(' · '),
})

export async function orgShare(slug: string) {
  const org = await orgBySlug(slug)
  if (!org) return null
  return {
    name: org.name,
    type: org.type,
    description: org.description,
    campus: org.campus && CAMPUS_NAMES[org.campus],
    websiteUrl: org.websiteUrl,
    memberCount: org._count.members,
    image: `${apiBase()}/orgs/${encodeURIComponent(org.slug)}/og.png?v=${fingerprint(orgCard(org))}`,
    imageSize: CARD_SIZE,
  }
}

export async function orgCardPng(slug: string): Promise<Buffer | null> {
  const org = await orgBySlug(slug)
  if (!org) return null
  const card = orgCard(org)
  return cachedPng(`org:${slug}:${fingerprint(card)}`, () => renderCard(card))
}
