import type { ProjectLink } from '@uofthub/types'
import type { IconName } from '../components/ui/Icon'
import { safeUrl } from './api'

/**
 * How a project as the API stores it becomes a project as the design shows it.
 *
 * The API stores a project's type, status, pitch and course as fields. The
 * main action ("Try it live", "Watch", "Listen") is still read out of what its
 * links point at when it has no primary output to say.
 */

/* ---------------------------------- course --------------------------------- */

/**
 * A U of T course code: three letters, three digits, optionally the credit
 * weight and campus suffix — CSC309, MAT102, CSC309H1, ENG100Y5.
 */
// Three letters, then three digits (St. George and UTM: CSC343, MAT137Y1) or
// a level letter and two digits (UTSC: CSCA08, MATA31H3), then an optional
// weight and campus suffix.
const COURSE_CODE = /^[a-z]{3}(?:\d{3}|[a-d]\d{2})(?:[hy]\d)?$/i

export const isCourseCode = (tag: string) => COURSE_CODE.test(tag.trim())

/** The course a project was made for. */
export const courseOf = (project: { courseCode?: string | null }): string | undefined =>
  project.courseCode ?? undefined

/**
 * The `#React #Maps` row: the tags, less a repeat of the project's own course.
 * Any other course code stays — "also used in CSC311" is worth showing, and
 * the course column holds only one.
 */
export function topicTags(project: { tags: string[]; courseCode?: string | null }): string[] {
  const course = project.courseCode?.trim().toUpperCase()
  return project.tags.filter((t) => t.trim().toUpperCase() !== course)
}

/* ---------------------------------- links ---------------------------------- */

export type LinkRole = 'live' | 'code' | 'video' | 'audio' | 'design' | 'other'

const HOSTS: [RegExp, LinkRole][] = [
  [/(^|\.)(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)$/, 'code'],
  [/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/, 'video'],
  [/(^|\.)(soundcloud\.com|bandcamp\.com|spotify\.com)$/, 'audio'],
  [/(^|\.)(figma\.com|behance\.net|dribbble\.com)$/, 'design'],
]

const LABELS: [RegExp, LinkRole][] = [
  [/\b(code|repo|repository|source|github|gitlab)\b/i, 'code'],
  [/\b(video|watch|trailer|film)\b/i, 'video'],
  [/\b(listen|track|album|audio|podcast)\b/i, 'audio'],
  [/\b(figma|prototype|mockup)\b/i, 'design'],
  [/\b(live|demo|website|site|app|try|play)\b/i, 'live'],
]

/** What a link is for, from where it points first and what it is called second. */
export function linkRole(link: Pick<ProjectLink, 'label' | 'url'>): LinkRole {
  let host = ''
  try {
    host = new URL(link.url).hostname.toLowerCase()
  } catch {
    return 'other'
  }
  for (const [pattern, role] of HOSTS) if (pattern.test(host)) return role
  for (const [pattern, role] of LABELS) if (pattern.test(link.label)) return role
  return 'other'
}

export const LINK_ICONS: Record<LinkRole, IconName> = {
  live: 'globe',
  code: 'branch',
  video: 'video',
  audio: 'music',
  design: 'palette',
  other: 'link',
}

export type SafeLink = ProjectLink & { href: string; role: LinkRole }

/** Links fit to render — anything that is not http(s) is dropped here. */
export function safeLinks(links: ProjectLink[] | undefined): SafeLink[] {
  return (links ?? []).flatMap((l) => {
    const href = safeUrl(l.url)
    return href ? [{ ...l, href, role: linkRole(l) }] : []
  })
}

export type PrimaryAction = { label: string; icon: IconName; href: string }

/**
 * The card's main button. The design derives it from the project's type; with
 * no type stored, it is derived from the one thing that decides it anyway —
 * whether there is something live to try, a video to watch or audio to hear.
 */
export function primaryAction(links: SafeLink[]): PrimaryAction | undefined {
  const live = links.find((l) => l.role === 'live')
  if (live) return { label: 'Try it live', icon: 'external', href: live.href }
  const video = links.find((l) => l.role === 'video')
  if (video) return { label: 'Watch', icon: 'play', href: video.href }
  const audio = links.find((l) => l.role === 'audio')
  if (audio) return { label: 'Listen', icon: 'play', href: audio.href }
  return undefined
}

/** The code link, for "View code". */
export const codeLink = (links: SafeLink[]) => links.find((l) => l.role === 'code')

/* ---------------------------------- time ----------------------------------- */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** Feed-card time: "now", "12m", "2h", "5d", "3w", then a date. */
export function timeShort(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  if (diff < MINUTE) return 'now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`
  if (diff < 5 * WEEK) return `${Math.floor(diff / WEEK)}w`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Project-page time: "3 days ago", "2 weeks ago", "1 month ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  const say = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return say(Math.floor(diff / MINUTE), 'minute')
  if (diff < DAY) return say(Math.floor(diff / HOUR), 'hour')
  if (diff < WEEK) {
    const days = Math.floor(diff / DAY)
    return days === 1 ? 'yesterday' : say(days, 'day')
  }
  if (diff < 30 * DAY) return say(Math.floor(diff / WEEK), 'week')
  if (diff < 365 * DAY) return say(Math.floor(diff / (30 * DAY)), 'month')
  return say(Math.floor(diff / (365 * DAY)), 'year')
}

/** When a project went out: published, falling back to created for old rows. */
export const postedAt = (p: { publishedAt?: string; createdAt: string }) =>
  p.publishedAt ?? p.createdAt

/* ---------------------------------- people --------------------------------- */

/** "Omar", "Omar +1" — the maker line under a card. */
export function makersLabel(names: string[]): string {
  if (names.length === 0) return ''
  const first = names[0].split(/\s+/)[0]
  return names.length > 1 ? `${first} +${names.length - 1}` : first
}
