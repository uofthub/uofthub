import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolves the database the test suite is allowed to touch.
 *
 * Tests truncate every table between cases, so pointing them at the
 * development database would silently destroy real work. The name therefore
 * has to end in `_test` — anything else throws rather than connecting.
 *
 * Nothing here reads `process.env.DATABASE_URL` first by accident: Prisma
 * loads `.env` into its own client rather than into `process.env`, so the dev
 * URL is invisible to Node unless we read the file ourselves.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV_FILE = resolve(HERE, '../../.env')

function fromEnvFile(key: string): string | undefined {
  if (!existsSync(ENV_FILE)) return undefined
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (match?.[1] === key) return match[2].trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

function assertTestDatabase(url: string): string {
  const name = new URL(url).pathname.replace(/^\//, '')
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${name}" — the test database name must end in "_test". ` +
        'Set TEST_DATABASE_URL to override.'
    )
  }
  return url
}

/** Test database URL: `TEST_DATABASE_URL`, or the dev database's name + `_test`. */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return assertTestDatabase(process.env.TEST_DATABASE_URL)

  const base = process.env.DATABASE_URL ?? fromEnvFile('DATABASE_URL')
  if (!base) {
    throw new Error('No DATABASE_URL found — set TEST_DATABASE_URL or create api/.env')
  }

  const url = new URL(base)
  const name = url.pathname.replace(/^\//, '') || 'uofthub'
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`
  return assertTestDatabase(url.toString())
}
