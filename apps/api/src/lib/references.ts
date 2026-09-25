import type { ReferenceKind } from '@prisma/client'
import { z } from 'zod'
import { safeExternalUrl } from './url.js'

/**
 * A project's references, and the identity that lets two of them match.
 *
 * The point of storing references rather than links is "also used in…": a
 * student reading about one CSC211 project can see which others used the same
 * dataset. That only works if the same dataset has the same key however it was
 * pasted — `https://doi.org/10.5281/ZENODO.1`, `doi:10.5281/zenodo.1` and a
 * bare DOI are one thing; so are `arxiv.org/abs/2101.00001v2` and its PDF, and
 * `github.com/Owner/Repo/tree/main` and `github.com/owner/repo.git`.
 */

export const REFERENCE_KINDS = [
  'DATASET',
  'PAPER',
  'SOFTWARE',
  'MODEL',
  'BOOK',
  'ARCHIVE',
  'WEBSITE',
  'OTHER',
] as const satisfies readonly ReferenceKind[]

/* ----------------------------------- keys ---------------------------------- */

const DOI = /^10\.\d{4,9}\/\S+$/
const ARXIV_DOI = /^10\.48550\/arxiv\.(.+)$/
// New-style 2101.00001 and old-style hep-th/9901001, either with a version.
const ARXIV_ID = /^((?:\d{4}\.\d{4,5})|(?:[a-z-]+(?:\.[a-z]{2})?\/\d{7}))(?:v\d+)?$/i

/** Query parameters that say where a link was shared from, not what it is. */
const TRACKING = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|si|igshid)$/i

/**
 * A DOI in any of the forms people paste it, bare and lower-cased (DOIs are
 * case-insensitive). Null when it is not a DOI.
 */
export function normalizeDoi(raw: string): string | null {
  let doi = raw.trim()
  doi = doi.replace(/^doi:\s*/i, '')
  doi = doi.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '')
  try {
    doi = decodeURIComponent(doi)
  } catch {
    // A stray % is part of the DOI, not an escape.
  }
  // Trailing punctuation from the sentence the DOI was copied out of.
  doi = doi.replace(/[.,;:)\]]+$/, '').toLowerCase()
  return DOI.test(doi) ? doi : null
}

const arxivKey = (id: string) => {
  const m = ARXIV_ID.exec(id.replace(/\.pdf$/i, ''))
  return m ? `arxiv:${m[1].toLowerCase()}` : null
}

/** The key for a DOI: arXiv's own DOIs collapse to the arXiv id. */
function doiKey(doi: string): string {
  const arxiv = ARXIV_DOI.exec(doi)
  return (arxiv && arxivKey(arxiv[1])) || `doi:${doi}`
}

/** The key for a URL: a known home collapses to its id, anything else is canonicalized. */
export function urlKey(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const parts = url.pathname.split('/').filter(Boolean)

  if (host === 'doi.org' || host === 'dx.doi.org') {
    const doi = normalizeDoi(url.pathname.slice(1))
    if (doi) return doiKey(doi)
  }
  if (host === 'arxiv.org' && (parts[0] === 'abs' || parts[0] === 'pdf') && parts.length >= 2) {
    const key = arxivKey(parts.slice(1).join('/'))
    if (key) return key
  }
  if (host === 'github.com' && parts.length >= 2) {
    return `github:${parts[0].toLowerCase()}/${parts[1].toLowerCase().replace(/\.git$/, '')}`
  }
  if (host === 'huggingface.co' && parts.length >= 2) {
    const scoped = parts[0] === 'datasets' || parts[0] === 'spaces'
    if (scoped && parts.length >= 3) return `hf:${parts.slice(0, 3).join('/').toLowerCase()}`
    if (!scoped) return `hf:${parts.slice(0, 2).join('/').toLowerCase()}`
  }
  if (host === 'kaggle.com' && parts[0] === 'datasets' && parts.length >= 3) {
    return `kaggle:${parts[1].toLowerCase()}/${parts[2].toLowerCase()}`
  }

  const params = [...url.searchParams]
    .filter(([name]) => !TRACKING.test(name))
    .sort(([a], [b]) => a.localeCompare(b))
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : ''
  const port = url.port ? `:${url.port}` : ''
  const path = url.pathname.replace(/\/+$/, '')
  // http and https are the same resource here; paths keep their case.
  return `https://${host}${port}${path}${query}`
}

/** A reference's identity: its DOI when it has one, otherwise its URL's. */
export function referenceKey(ref: { url?: string | null; doi?: string | null }): string | null {
  const doi = ref.doi ? normalizeDoi(ref.doi) : null
  if (doi) return doiKey(doi)
  return ref.url ? urlKey(ref.url) : null
}

/* --------------------------------- parsing --------------------------------- */

export const REFERENCE_LIMITS = { rows: 30, title: 200, authors: 200, note: 280 }

const text = (max: number, what: string) =>
  z
    .string({ error: `${what} must be text` })
    .trim()
    .max(max, `${what} is at most ${max} characters`)
    .optional()
    .nullable()

const ReferencesInput = z
  .array(
    z.object({
      kind: z.enum(REFERENCE_KINDS, { error: 'Unknown reference kind' }),
      title: text(REFERENCE_LIMITS.title, 'A reference’s title'),
      url: text(2000, 'A reference’s link'),
      doi: text(200, 'A DOI'),
      authors: text(REFERENCE_LIMITS.authors, 'Authors'),
      year: z
        .number({ error: 'A year must be a number' })
        .int()
        .min(1000, 'That year is too early')
        .max(2100, 'That year is too far away')
        .optional()
        .nullable(),
      note: text(REFERENCE_LIMITS.note, 'A reference’s note'),
    }),
    { error: 'References must be a list' }
  )
  .max(REFERENCE_LIMITS.rows, `A project has at most ${REFERENCE_LIMITS.rows} references`)

export type ReferenceRow = {
  kind: ReferenceKind
  title: string
  url: string | null
  doi: string | null
  authors: string | null
  year: number | null
  note: string | null
  key: string | null
  position: number
}

/**
 * References as a request sent them, ready to store in order. A row with
 * nothing in it is dropped; one with a link but no title is refused, since the
 * page would have nothing to call it.
 */
export function parseReferences(input: unknown): { value: ReferenceRow[] } | { error: string } {
  if (input === null) return { value: [] }
  const parsed = ReferencesInput.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid references' }

  const rows: ReferenceRow[] = []
  for (const r of parsed.data) {
    if (!r.title && !r.url && !r.doi && !r.authors && !r.note) continue
    if (!r.title) return { error: 'Give each reference a title' }

    let url: string | null = null
    if (r.url) {
      url = safeExternalUrl(r.url)
      if (!url) return { error: `The link for “${r.title}” must be an http(s) URL` }
    }
    let doi: string | null = null
    if (r.doi) {
      doi = normalizeDoi(r.doi)
      if (!doi) return { error: `“${r.doi}” is not a DOI — they start with 10.` }
    }

    rows.push({
      kind: r.kind,
      title: r.title,
      url,
      doi,
      authors: r.authors || null,
      year: r.year ?? null,
      note: r.note || null,
      key: referenceKey({ url, doi }),
      position: rows.length,
    })
  }
  return { value: rows }
}
