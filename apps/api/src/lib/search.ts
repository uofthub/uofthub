import { db } from '../db/client.js'

/**
 * Full-text project search.
 *
 * The directory used to match with `contains` + `mode: 'insensitive'`, which
 * Prisma compiles to `ILIKE '%term%'`. No index can serve a leading wildcard,
 * so every search was a sequential scan of every project — fine at a hundred
 * rows, hopeless at a hundred thousand. Matching now goes through the
 * `searchVector` GIN index added in `add_search_and_indexes`.
 *
 * This resolves ids only, and the caller feeds them back into the same Prisma
 * query it always ran. That is deliberate: visibility is the security boundary
 * of this app, it lives in `visibleProjectWhere`, and a second copy of it
 * written in SQL is exactly the kind of thing that drifts out of step and
 * quietly leaks a private project. Text matching is the only job here.
 */

/**
 * Ceiling on ids handed back to the caller.
 *
 * Ranked, so these are the best matches rather than an arbitrary slice — but a
 * query matching more projects than this cannot be paged past the cap. That is
 * a real limit, and it is set where a student would never reach it: nobody
 * pages to result 1,000 of "machine learning".
 */
export const SEARCH_ID_CAP = 1000

/** Terms beyond this are dropped; a genuine search is never this long. */
const MAX_TERMS = 8

/**
 * A user's raw input as a prefix tsquery.
 *
 * Everything that isn't alphanumeric is dropped rather than escaped, so no
 * input can reach `to_tsquery` as syntax — a stray `&`, `!` or unbalanced
 * paren would otherwise throw and 500 the directory. `:*` on each term keeps
 * type-ahead working: "rob" still finds "robotics", which plain full-text
 * matching (whole stemmed words only) would not.
 *
 * Returns null when nothing survives, e.g. a query of only punctuation.
 */
export function toPrefixTsQuery(raw: string): string | null {
  const terms = raw.toLowerCase().match(/[a-z0-9]+/g)
  if (!terms?.length) return null
  return terms
    .slice(0, MAX_TERMS)
    .map((t) => `${t}:*`)
    .join(' & ')
}

/**
 * Ids of projects matching `raw`, best first. Returns [] for a query with
 * nothing searchable in it — which the caller must treat as "no matches",
 * not as "no search", or a query of pure punctuation would return everything.
 */
export async function searchProjectIds(raw: string): Promise<string[]> {
  const query = toPrefixTsQuery(raw)
  if (!query) return []

  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Project"
    WHERE "searchVector" @@ to_tsquery('english', ${query})
    ORDER BY ts_rank("searchVector", to_tsquery('english', ${query})) DESC
    LIMIT ${SEARCH_ID_CAP}
  `
  return rows.map((r) => r.id)
}
