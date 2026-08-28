/**
 * Deletes student groups that never completed verification.
 *
 *   pnpm --filter @uofthub/api sweep-orgs        # delete expired groups
 *   pnpm --filter @uofthub/api sweep-orgs --dry  # list them, delete nothing
 *
 * Run it daily — there is no in-process scheduler, deliberately: a cron entry
 * (or a platform scheduled job) is one line of config and cannot double-fire
 * across replicas the way a setInterval in the API would.
 *
 *   0 4 * * *  cd /srv/uofthub && pnpm --filter @uofthub/api sweep-orgs
 *
 * A group only expires while PENDING_VERIFICATION or INFO_REQUESTED — both
 * states where the clock is on the group. IN_REVIEW has no deadline (the
 * clock is on us), and VERIFIED has none at all. Nothing here is the only
 * thing enforcing the window: POST /orgs/:slug/verify refuses an expired
 * deadline too, so a missed cron run delays cleanup rather than reopening it.
 */
import { db } from '../db/client.js'
import { EXPIRING_STATUSES } from '../lib/orgs.js'

const dryRun = process.argv.includes('--dry')

const expired = await db.organization.findMany({
  where: {
    status: { in: [...EXPIRING_STATUSES] },
    verificationDeadline: { lt: new Date() },
  },
  select: { id: true, slug: true, name: true, status: true, verificationDeadline: true },
})

if (expired.length === 0) {
  console.log('No groups past their verification deadline.')
} else {
  for (const org of expired) {
    console.log(
      `${dryRun ? 'would delete' : 'deleting'} ${org.slug} (${org.name}) — ${org.status}, due ${org.verificationDeadline?.toISOString()}`
    )
  }
  if (!dryRun) {
    const { count } = await db.organization.deleteMany({ where: { id: { in: expired.map((o) => o.id) } } })
    console.log(`Deleted ${count} group(s).`)
  }
}

await db.$disconnect()
