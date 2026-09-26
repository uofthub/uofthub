import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { testDatabaseUrl } from './env.js'

/**
 * Creates the test database if it doesn't exist and brings it up to the
 * current migration, once per `vitest run`. Using the real migrations rather
 * than `db push` means the suite also proves the migration history applies
 * cleanly to an empty database — which is what CI and production do.
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl()
  const dbName = new URL(url).pathname.slice(1)

  // CREATE DATABASE has to run from a connection to a different database.
  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() })
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
    console.log(`Created test database ${dbName}`)
  } catch {
    // Already there — the normal case on every run after the first.
  } finally {
    await admin.$disconnect()
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    // Passing DATABASE_URL explicitly wins over the .env file Prisma would
    // otherwise read, which points at the development database.
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
}
