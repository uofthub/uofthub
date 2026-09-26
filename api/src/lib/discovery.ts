import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { CAMPUSES } from './campus.js'

/**
 * Turns "AI projects from Engineering students this year" into the filters the
 * project query already understands.
 *
 * The model never sees the database and never produces a query — it fills a
 * fixed, closed set of fields, which the route then applies through Prisma.
 * That is the whole security model here: its output is untrusted input, so the
 * schema below is what stops a creative answer from becoming a creative query.
 *
 * Provider is OpenAI, model configurable per deployment (`OPENAI_MODEL`).
 * Nothing outside this module knows which provider is behind it — swapping one
 * in is a change to `parseQuery`, not to the route.
 */

/** Faculties the model may choose from. Anything else is dropped by the schema. */
export const FACULTIES = [
  'Arts & Science',
  'Engineering',
  'Medicine',
  'Law',
  'Education',
  'Rotman',
  'Music',
  'Architecture',
  'Information',
  'Kinesiology',
] as const

const DiscoverFilters = z.object({
  search: z
    .string()
    .describe('Keywords to match against a project title, description or tags. Omit if the query has no topic.')
    .nullable(),
  faculty: z
    .enum(FACULTIES)
    .describe('The faculty of the student who owns the project, if the query names one.')
    .nullable(),
  campus: z
    .enum(CAMPUSES)
    .describe(
      'The campus of the student who owns the project. UTSG is St. George/downtown/main campus, UTM is Mississauga/Erindale, UTSC is Scarborough. Only when the query names one.'
    )
    .nullable(),
  tag: z
    .string()
    .describe('An exact course or topic tag, e.g. "CSC309". Only when the query names one.')
    .nullable(),
  sort: z
    .enum(['new', 'trending'])
    .describe('"trending" for popular/best/most-viewed, "new" for recent/latest.')
    .nullable(),
  within: z
    .enum(['month', 'term', 'year'])
    .describe('Time window if the query bounds one: "this month", "this term", "the last year".')
    .nullable(),
})

export type DiscoverFilters = z.infer<typeof DiscoverFilters>

export const EMPTY_FILTERS: DiscoverFilters = {
  search: null,
  faculty: null,
  campus: null,
  tag: null,
  sort: null,
  within: null,
}

const SYSTEM = `You translate a student's natural-language request into search filters for uofthub, a platform where University of Toronto students publish their projects.

Fill only the fields the request actually implies, and leave every other field null — an over-specified filter returns nothing, which is worse than a broad search. "search" should be the topic in the fewest words that still mean the same thing ("machine learning", not "machine learning projects").

Examples:
- "show me machine learning projects" → search: "machine learning"
- "trending engineering projects" → faculty: "Engineering", sort: "trending"
- "what have students built in CSC309 this year" → tag: "CSC309", within: "year"
- "cool stuff from med students lately" → faculty: "Medicine", sort: "new"
- "robotics at UTM" → search: "robotics", campus: "UTM"
- "what are Scarborough students building" → campus: "UTSC"
- "what's popular right now" → sort: "trending"`

/** Overridable per deployment; this is the default when `OPENAI_MODEL` is unset. */
export const DEFAULT_MODEL = 'gpt-5.6-luna'

export const discoveryModel = (): string => process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL

let client: OpenAI | null | undefined

function getClient(): OpenAI | null {
  if (client === undefined) {
    // Same degradation as lib/email.ts: no key means the feature quietly
    // becomes its non-AI equivalent rather than the route 503ing. Local dev
    // and a deploy without an AI budget both keep working.
    client = process.env.OPENAI_API_KEY ? new OpenAI() : null
    if (!client) console.warn('OPENAI_API_KEY is not set — /discover falls back to keyword search')
  }
  return client
}

export const isAiConfigured = (): boolean => getClient() !== null

/**
 * Parses one query. Returns null when there is no API key, or when the call
 * fails — the caller falls back to a plain keyword search either way, because
 * a search that returns something imperfect beats an error page.
 */
export async function parseQuery(query: string): Promise<DiscoverFilters | null> {
  const openai = getClient()
  if (!openai) return null

  const response = await openai.responses.parse({
    model: discoveryModel(),
    instructions: SYSTEM,
    input: query,
    // Extraction into six fields — the answer is a handful of tokens. The cap
    // is generous enough to leave room for a reasoning model's hidden tokens
    // without letting a runaway response bill for long.
    max_output_tokens: 2048,
    text: { format: zodTextFormat(DiscoverFilters, 'discover_filters') },
  })

  // output_parsed is null when the response didn't validate against the schema.
  return response.output_parsed ?? null
}

/** Start of the window a `within` value names, or null for "no bound". */
export function windowStart(within: DiscoverFilters['within'], now = new Date()): Date | null {
  if (!within) return null
  // UTC setters, like lib/terms.ts: the local-time ones shift the boundary by
  // a day whenever the server sits west of UTC.
  const start = new Date(now)
  if (within === 'month') start.setUTCMonth(start.getUTCMonth() - 1)
  // A term is four months — the same shape as the academic calendar in
  // lib/terms.ts, without pretending to line up with its exact boundaries.
  if (within === 'term') start.setUTCMonth(start.getUTCMonth() - 4)
  if (within === 'year') start.setUTCFullYear(start.getUTCFullYear() - 1)
  return start
}
