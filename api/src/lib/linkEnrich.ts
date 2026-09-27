import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { aiModel, openaiClient } from './openai.js'

/**
 * The AI half of "Start from a link": given what lib/linkImport.ts read off a
 * page (its metadata and visible text, or a repo's README), fill in the parts
 * of the post form a page never states outright — the project's type, status,
 * tags, a write-up and its key details.
 *
 * Optional by design. With no `OPENAI_API_KEY`, or when the call fails or
 * times out, `enrichImport` returns null and the import is exactly what the
 * page's own metadata gives. Everything it returns is untrusted: the schema
 * closes the set of fields, and `clampEnriched` enforces the limits the post
 * form does, so a runaway answer can only ever become a draft to edit.
 *
 * Every call costs model credits, so it is kept to as few, and as small, as
 * the feature allows (see `enrichImport`): no call when the page already filled
 * the form, one call per link a day however many students paste it, a few per
 * student a day, and a daily ceiling for the whole site. Past any of those the
 * import is simply the plain one.
 */

const PROJECT_TYPES = [
  'APP',
  'RESEARCH',
  'FILM',
  'DESIGN',
  'AUDIO',
  'HARDWARE',
  'WRITING',
  'OTHER',
] as const

const Enriched = z.object({
  title: z
    .string()
    .describe('The project’s own name, without the site’s name or a tagline.')
    .nullable(),
  pitch: z
    .string()
    .describe('One or two sentences, under 280 characters, saying what the project is and does.')
    .nullable(),
  description: z
    .string()
    .describe(
      'A short Markdown write-up, at most 120 words: what it is, how it works, what it is built with. Only facts the page states.'
    )
    .nullable(),
  type: z
    .enum(PROJECT_TYPES)
    .describe(
      'APP: software, websites, games, tools, libraries. RESEARCH: papers, studies, theses, datasets, models. FILM: video. DESIGN: visual, UX, architecture, art. AUDIO: music, podcasts. HARDWARE: robots, electronics, physical builds. WRITING: essays, stories, journalism. OTHER: none of these.'
    )
    .nullable(),
  status: z
    .enum(['IN_PROGRESS', 'SHIPPED', 'HELP_WANTED'])
    .describe(
      'SHIPPED if it is released, published or finished; HELP_WANTED if it asks for contributors or teammates; IN_PROGRESS if it is described as ongoing. Null when the page does not say.'
    )
    .nullable(),
  tags: z
    .array(z.string())
    .describe(
      'Up to 8 short lowercase topic or technology tags, e.g. "machine learning", "react", "robotics".'
    ),
  details: z
    .array(
      z.object({
        label: z.string().describe('A short label, e.g. "Built with", "Team", "Published in".'),
        value: z.string().describe('The value, as the page states it.'),
      })
    )
    .describe('Up to 6 key facts the page states. Empty when it states none.'),
})

export type Enriched = z.infer<typeof Enriched>

const SYSTEM = `You fill in a draft post for uofthub, where University of Toronto students publish their projects. A student pasted a link to their project; you are given what could be read from it.

Use only what the source says. Never invent a feature, a result, a technology, a team member or a date — a field the source does not support is null (or an empty list). The student edits the draft before posting, but they should not have to delete things that are not true.

Write plainly, not as marketing: no "revolutionary", no exclamation marks. Ignore navigation, cookie banners, sign-up prompts and anything else that is about the site rather than the project.`

// Input is most of the cost. A project is almost always described near the
// top of its page, so about a thousand tokens of it is enough.
export const SOURCE_TEXT_MAX = 4_000

export type EnrichSource = {
  url: string
  title?: string
  pitch?: string
  /** A description the source already has (a README): the model skips writing one. */
  description?: string
  tags: string[]
  /** The page's readable text, or a repository's README. */
  text?: string
}

const TIMEOUT_MS = 20_000

// ── Spending limits ──────────────────────────────────────────────────────────
//
// Kept in memory: a restart forgets them, which at worst allows one extra day's
// budget — not worth a table. Both are overridable per deployment.

const perStudentPerDay = () => envInt('AI_IMPORT_PER_STUDENT_DAY', 5)
const perSitePerDay = () => envInt('AI_IMPORT_PER_DAY', 200)

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

let day = ''
let siteCalls = 0
const studentCalls = new Map<string, number>()

/** Takes one call from today's budgets, or says there is none left. */
function spend(userId: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== day) {
    day = today
    siteCalls = 0
    studentCalls.clear()
  }
  const mine = studentCalls.get(userId) ?? 0
  if (siteCalls >= perSitePerDay() || mine >= perStudentPerDay()) return false
  siteCalls++
  studentCalls.set(userId, mine + 1)
  return true
}

// ── Cache ────────────────────────────────────────────────────────────────────
//
// A club's page or a course's showcase gets pasted by every member of a team;
// the answer is the same each time, so it is paid for once a day.

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_MAX = 1000
const cache = new Map<string, { at: number; value: Enriched }>()

function cached(url: string): Enriched | null {
  const hit = cache.get(url)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(url)
    return null
  }
  return hit.value
}

function remember(url: string, value: Enriched) {
  cache.delete(url)
  cache.set(url, { at: Date.now(), value })
  // A Map iterates in insertion order, so the first key is the oldest.
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
}

/** For tests: forget today's spending and every cached answer. */
export function resetEnrichState() {
  day = ''
  siteCalls = 0
  studentCalls.clear()
  cache.clear()
}

/**
 * True when the source leaves something worth a model call: a page that
 * already gave a summary, a write-up and a few tags has nothing left to fill
 * but a type, which the form guesses from the link for free.
 */
export function worthFilling(source: EnrichSource): boolean {
  return !(source.title && source.pitch && source.description && source.tags.length >= 3)
}

/**
 * Fills the rest of the form from a page's content — or null without AI, when
 * there is nothing to fill, or when today's budget for this student or the
 * site is spent.
 */
export async function enrichImport(source: EnrichSource, userId: string): Promise<Enriched | null> {
  const openai = openaiClient()
  if (!openai || !worthFilling(source)) return null

  const hit = cached(source.url)
  if (hit) return hit
  if (!spend(userId)) return null

  const input = [
    `Link: ${source.url}`,
    source.title && `Title: ${source.title}`,
    source.pitch && `Summary: ${source.pitch}`,
    source.tags.length > 0 && `Tags: ${source.tags.join(', ')}`,
    // The README is already the write-up: the model does not write another,
    // which is most of what it would output.
    source.description && 'The project already has a write-up: leave description null.',
    source.text && `Content:\n${source.text.slice(0, SOURCE_TEXT_MAX)}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const response = await openai.responses.parse(
      {
        model: aiModel(),
        instructions: SYSTEM,
        input,
        // A 120-word write-up and a handful of short fields is a few hundred
        // tokens; the rest is headroom for a reasoning model's hidden tokens,
        // capped so one import can never run long.
        max_output_tokens: 1500,
        text: { format: zodTextFormat(Enriched, 'imported_project') },
      },
      { timeout: TIMEOUT_MS, maxRetries: 0 }
    )
    // output_parsed is null when the response didn't validate against the schema.
    if (!response.output_parsed) return null
    const value = clampEnriched(response.output_parsed)
    remember(source.url, value)
    return value
  } catch (err) {
    // A failed call only means a plainer import.
    console.warn('link import: AI fill-in failed', err)
    return null
  }
}

const TITLE_MAX = 120
const PITCH_MAX = 280
const DESCRIPTION_MAX = 20_000
const TAGS_MAX = 8
const TAG_MAX = 40
const DETAILS_MAX = 6
const DETAIL_LABEL_MAX = 40
const DETAIL_VALUE_MAX = 200

const clip = (s: string | null, max: number) => {
  const text = s?.trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** Holds the model's answer to the limits the post form enforces. */
export function clampEnriched(e: Enriched): Enriched {
  const seen = new Set<string>()
  const tags = e.tags
    .map((t) => t.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase())
    .filter((t) => t && t.length <= TAG_MAX && !seen.has(t) && seen.add(t))
    .slice(0, TAGS_MAX)
  const details = e.details
    .map((d) => ({
      label: clip(d.label, DETAIL_LABEL_MAX),
      value: clip(d.value, DETAIL_VALUE_MAX),
    }))
    .filter((d): d is { label: string; value: string } => !!d.label && !!d.value)
    .slice(0, DETAILS_MAX)
  return {
    title: clip(e.title, TITLE_MAX),
    pitch: clip(e.pitch, PITCH_MAX),
    description: clip(e.description, DESCRIPTION_MAX),
    type: e.type,
    status: e.status,
    tags,
    details,
  }
}
