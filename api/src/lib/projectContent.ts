import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  ProjectDetailItem,
  ProjectSection,
  ProjectSectionItem,
  SectionKind,
} from '@uofthub/types'

/**
 * A project's optional sections and details: what they may contain, and the
 * rule that anything left empty is not stored at all.
 *
 * The page renders a section only when it has something in it, and so an
 * empty one must never reach the database — otherwise every reader of the row
 * (the page, search, a fork, a version) would have to agree on what "empty"
 * means. Stripping happens once, here, on the way in. The web app's renderer
 * checks again only because rows can be written outside these routes.
 *
 * Zod checks the shape and the limits; `normalizeSections` then drops what is
 * empty and applies the rules that span sections (one of each kind).
 */

/**
 * The value list for `SectionKind`. `@uofthub/types` ships TypeScript source,
 * which the built API cannot import at runtime, so the list is repeated here
 * and checked against the type in both directions below.
 */
export const SECTION_KINDS = [
  'motivation',
  'method',
  'approaches',
  'data',
  'results',
  'examples',
  'considerations',
  'reflection',
  'conclusion',
  'custom',
] as const satisfies readonly SectionKind[]
// Fails to compile if SectionKind gains a kind this list is missing.
const _everyKind: Record<SectionKind, true> = Object.fromEntries(
  SECTION_KINDS.map((k) => [k, true])
) as Record<(typeof SECTION_KINDS)[number], true>
void _everyKind

/** Kinds that hold a list of named items as well as, or instead of, a body. */
const ITEM_KINDS = new Set<SectionKind>(['approaches', 'examples'])

export const SECTION_LIMITS = {
  sections: 16,
  title: 80,
  body: 20_000,
  items: 12,
  itemLabel: 80,
  itemBody: 5_000,
  /** The whole list, serialized — a backstop on what one row can hold. */
  bytes: 100_000,
}

export const DETAIL_LIMITS = { rows: 12, label: 40, value: 200 }

const text = (max: number, what: string) =>
  z
    .string({ error: `${what} must be text` })
    .trim()
    .max(max, `${what} is at most ${max.toLocaleString('en-CA')} characters`)
    .optional()
    .nullable()

const ItemInput = z.object({
  label: text(SECTION_LIMITS.itemLabel, 'An item’s name'),
  body: text(SECTION_LIMITS.itemBody, 'An item’s text'),
})

const SectionInput = z.object({
  id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,40}$/, 'A section id is letters, digits, - and _ only')
    .optional(),
  kind: z.enum(SECTION_KINDS, { error: 'Unknown section kind' }),
  title: text(SECTION_LIMITS.title, 'A section title'),
  body: text(SECTION_LIMITS.body, 'A section'),
  items: z
    .array(ItemInput)
    .max(SECTION_LIMITS.items, `A section has at most ${SECTION_LIMITS.items} items`)
    .optional()
    .nullable(),
})

const SectionsInput = z
  .array(SectionInput, { error: 'Sections must be a list' })
  .max(SECTION_LIMITS.sections, `A project has at most ${SECTION_LIMITS.sections} sections`)

const DetailsInput = z
  .array(
    z.object({
      label: text(DETAIL_LIMITS.label, 'A detail’s label'),
      value: text(DETAIL_LIMITS.value, 'A detail'),
    }),
    { error: 'Details must be a list' }
  )
  .max(DETAIL_LIMITS.rows, `A project has at most ${DETAIL_LIMITS.rows} details`)

type Parsed<T> = { value: T | null } | { error: string }

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? 'Invalid content'

/**
 * Drop what is empty — an item with no name and no text, then a section with
 * no text and no items left — and enforce what the page relies on. A title on
 * its own is not content: it would render a heading over nothing.
 */
export function normalizeSections(
  input: z.infer<typeof SectionsInput>
): { value: ProjectSection[] } | { error: string } {
  const out: ProjectSection[] = []
  const seen = new Set<SectionKind>()
  const ids = new Set<string>()

  for (const raw of input) {
    const items: ProjectSectionItem[] = []
    for (const item of raw.items ?? []) {
      if (!item.label && !item.body) continue
      if (!item.label) return { error: 'Give each item in a section a name' }
      items.push({ label: item.label, ...(item.body ? { body: item.body } : {}) })
    }
    if (!raw.body && items.length === 0) continue

    if (items.length > 0 && !ITEM_KINDS.has(raw.kind))
      return { error: 'Only approaches and examples sections have items' }
    if (raw.kind === 'custom' && !raw.title) return { error: 'A custom section needs a title' }
    if (raw.kind !== 'custom') {
      if (seen.has(raw.kind)) return { error: `A project has only one ${raw.kind} section` }
      seen.add(raw.kind)
    }

    const id = raw.id ?? `s${randomUUID().replaceAll('-', '').slice(0, 10)}`
    if (ids.has(id)) return { error: 'Two sections share an id' }
    ids.add(id)

    out.push({
      id,
      kind: raw.kind,
      ...(raw.title ? { title: raw.title } : {}),
      ...(raw.body ? { body: raw.body } : {}),
      ...(items.length ? { items } : {}),
    })
  }

  if (JSON.stringify(out).length > SECTION_LIMITS.bytes)
    return { error: 'That is more than a project can hold — try moving some of it into a file' }
  return { value: out }
}

/**
 * Sections as a request sent them. `null` clears them; an empty result is
 * stored as null too, so "no sections" has one representation.
 */
export function parseSections(input: unknown): Parsed<ProjectSection[]> {
  if (input === null) return { value: null }
  const parsed = SectionsInput.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const normalized = normalizeSections(parsed.data)
  if ('error' in normalized) return normalized
  return { value: normalized.value.length ? normalized.value : null }
}

/**
 * Details as a request sent them, in the author's order. A row missing either
 * its label or its value says nothing and is dropped. Labels may repeat —
 * "Performer" twice is two performers.
 */
export function parseDetails(input: unknown): Parsed<ProjectDetailItem[]> {
  if (input === null) return { value: null }
  const parsed = DetailsInput.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const rows = parsed.data.flatMap((r) =>
    r.label && r.value ? [{ label: r.label, value: r.value }] : []
  )
  return { value: rows.length ? rows : null }
}
