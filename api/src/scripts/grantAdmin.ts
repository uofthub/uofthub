/**
 * Grants (or revokes) the moderator flag on an existing account.
 *
 *   pnpm --filter @uofthub/api grant-admin someone@utoronto.ca
 *   pnpm --filter @uofthub/api grant-admin someone@utoronto.ca --revoke
 *
 * There is deliberately no API route for this: the first moderator has to come
 * from outside the app, and every one after that is a decision someone makes
 * with database access, not a button an account can be tricked into pressing.
 */
import { db } from '../db/client.js'

const [emailArg, ...flags] = process.argv.slice(2)
const revoke = flags.includes('--revoke')

if (!emailArg) {
  console.error('Usage: grant-admin <email> [--revoke]')
  process.exit(1)
}

const email = emailArg.trim().toLowerCase()

const { count } = await db.user.updateMany({
  where: { email },
  data: { isAdmin: !revoke },
})

if (count === 0) {
  console.error(`No account found for ${email} — they need to sign in once first.`)
  process.exit(1)
}

console.log(`${email} is ${revoke ? 'no longer' : 'now'} a moderator.`)
await db.$disconnect()
