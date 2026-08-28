/**
 * Grants each VERIFIED group the storage allowance for every academic term it
 * is owed but has not been given.
 *
 *   pnpm --filter @uofthub/api grant-term-storage
 *
 * Safe to run at any cadence — grants are keyed by (org, term), so re-running
 * inside the same term is a no-op. Run it monthly rather than exactly on term
 * boundaries; a group that goes ungranted for two terms is caught up in one
 * run, because allowances stack (docs/student-groups.md § Storage policy).
 *
 *   0 5 1 * *  cd /srv/uofthub && pnpm --filter @uofthub/api grant-term-storage
 *
 * Approving a group already grants its current term, so this exists to carry
 * groups forward into later terms, not to onboard them.
 */
import { db } from '../db/client.js'
import { grantMissingTermAllowances } from '../lib/orgs.js'
import { ORG_TERM_ALLOWANCE_BYTES, termFor, termLabel } from '../lib/terms.js'

const now = new Date()
const orgs = await db.organization.findMany({
  where: { status: 'VERIFIED' },
  select: { id: true, slug: true, verifiedAt: true, createdAt: true },
})

let total = 0
for (const org of orgs) {
  // `verifiedAt` is null only for groups grandfathered in by the migration
  // that introduced verification; their creation date is the honest start.
  const since = org.verifiedAt ?? org.createdAt
  const granted = await grantMissingTermAllowances(org.id, since, now)
  if (granted > 0) {
    console.log(`${org.slug}: granted ${granted} term(s)`)
    total += granted
  }
}

const gb = ORG_TERM_ALLOWANCE_BYTES / 1024 ** 3
console.log(
  total === 0
    ? `Nothing to grant — every verified group is current through ${termLabel(termFor(now))}.`
    : `Granted ${total} term allowance(s) of ${gb}GB across ${orgs.length} group(s).`
)

await db.$disconnect()
