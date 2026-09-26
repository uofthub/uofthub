import { db } from '../db/client.js'
import { startOfUtcDay } from './dates.js'
import { isCourseCode } from './faculties.js'
import { TRENDING_WINDOW_DAYS } from './trending.js'
import { listedProjectWhere } from './visibility.js'

/**
 * The counts Explore and the home rails decorate their links with: projects
 * per faculty, the most-used course codes, this week's tags, and how many
 * projects are asking for help.
 *
 * A project counts once towards each faculty among the people who made it —
 * its owner and accepted collaborators — so a joint Engineering and Music
 * project shows up under both, as the faculty filter finds it under both.
 *
 * Computed over every visible project's tags and owner faculty in one read —
 * the kind of aggregate Postgres could do in SQL, but not through Prisma's
 * relation filters, and small enough at one university's scale to do here.
 * Cached briefly per audience, since every visitor asks for the same answer.
 */

export type Facets = {
  faculties: Record<string, number>
  courses: { code: string; count: number }[]
  tagsThisWeek: { tag: string; count: number; course: boolean }[]
  types: Record<string, number>
  helpWanted: number
}

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; facets: Facets }>()

function top<T extends { count: number }>(rows: T[], n: number, label: (r: T) => string): T[] {
  return rows.sort((a, b) => b.count - a.count || label(a).localeCompare(label(b))).slice(0, n)
}

export async function facetsFor(signedIn: boolean): Promise<Facets> {
  const key = signedIn ? 'uoft' : 'public'
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.facets

  const rows = await db.project.findMany({
    // Signed-out visitors count public work only; any account U of T work too.
    where: listedProjectWhere(signedIn),
    select: {
      tags: true,
      type: true,
      status: true,
      courseCode: true,
      publishedAt: true,
      createdAt: true,
      owner: { select: { faculty: true } },
      // Accepted makers only; a VIEWER is a TA's access grant, not credit.
      collaborators: {
        where: { accepted: true, role: { not: 'VIEWER' } },
        select: { user: { select: { faculty: true } } },
      },
    },
  })

  const since = startOfUtcDay(TRENDING_WINDOW_DAYS)
  const faculties: Record<string, number> = {}
  const types: Record<string, number> = {}
  const courses = new Map<string, number>()
  const weekTags = new Map<string, { tag: string; count: number; course: boolean }>()
  let helpWanted = 0

  for (const p of rows) {
    const makers = new Set(
      [p.owner.faculty, ...p.collaborators.map((c) => c.user.faculty)].filter(
        (f): f is string => !!f
      )
    )
    for (const faculty of makers) faculties[faculty] = (faculties[faculty] ?? 0) + 1
    if (p.type) types[p.type] = (types[p.type] ?? 0) + 1
    if (p.status === 'HELP_WANTED') helpWanted += 1
    const thisWeek = (p.publishedAt ?? p.createdAt) >= since
    if (p.courseCode) courses.set(p.courseCode, (courses.get(p.courseCode) ?? 0) + 1)
    // The course rides along with the tags in this week's list, marked as one.
    for (const raw of [...(p.courseCode ? [p.courseCode] : []), ...p.tags]) {
      const tag = raw.trim()
      if (!tag) continue
      const course = isCourseCode(tag)
      if (thisWeek) {
        // Case folded for counting; the first spelling seen is the one shown.
        const k = tag.toLowerCase()
        const entry = weekTags.get(k) ?? { tag: course ? tag.toUpperCase() : tag, count: 0, course }
        entry.count += 1
        weekTags.set(k, entry)
      }
    }
  }

  const facets: Facets = {
    faculties,
    types,
    helpWanted,
    courses: top(
      [...courses].map(([code, count]) => ({ code, count })),
      12,
      (r) => r.code
    ),
    tagsThisWeek: top([...weekTags.values()], 8, (r) => r.tag),
  }
  cache.set(key, { at: Date.now(), facets })
  return facets
}

/** For tests, which create projects and read facets within the TTL. */
export function clearFacetsCache() {
  cache.clear()
}
