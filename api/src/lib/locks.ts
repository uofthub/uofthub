import { Prisma } from '@prisma/client'
import { db } from '../db/client.js'

/**
 * Runs `fn` in a transaction that holds a Postgres advisory lock on `key`, so
 * two requests for the same key take turns.
 *
 * For caps checked by counting: "count, then insert if under the limit" lets
 * every request that arrives together see the same count and all insert —
 * ten parallel pins at nine of ten pinned would make nineteen. Under the lock
 * each one counts after the previous one's insert. The lock is released when
 * the transaction ends, commit or rollback, and never blocks anything that
 * does not ask for the same key.
 */
export function withLock<T>(
  key: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
    return fn(tx)
  })
}

/**
 * Runs a create that a unique key guards, and says whether it made the row.
 * For toggles: two clicks arriving together both see "not there yet" and both
 * create, and the second one's duplicate key is not an error worth a 500 —
 * the thing is on, which is what was asked.
 */
export async function createUnlessExists(create: () => Promise<unknown>): Promise<boolean> {
  try {
    await create()
    return true
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false
    throw err
  }
}
