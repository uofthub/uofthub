import { randomUUID } from 'node:crypto'
import { db } from '../db/client.js'
import { copyObject, deleteObjects } from './storage.js'

/**
 * Keeping an image a sexual-content take-down removed, in case the report has
 * to go to the police. Copied under evidence/ rather than left where it was:
 * an avatar's key is the same for every upload, so a new avatar or the next
 * Microsoft photo sync would otherwise overwrite it.
 */

const EVIDENCE_PREFIX = 'evidence/'

/** Copy `key` under evidence/ and record the copy on the report. */
export async function keepEvidence(reportId: string, key: string): Promise<void> {
  const copy = `${EVIDENCE_PREFIX}${randomUUID()}-${key.split('/').at(-1)}`
  let kept = copy
  try {
    await copyObject(key, copy)
  } catch {
    // A pointer to the original, which might later be overwritten, beats no
    // record at all.
    kept = key
  }
  await db.report.update({ where: { id: reportId }, data: { evidenceKeys: { push: kept } } })
}

/** Drop a report's evidence copies — once it turned out to be a false alarm. */
export async function discardEvidence(reportId: string, keys: string[]): Promise<void> {
  await deleteObjects(keys.filter((k) => k.startsWith(EVIDENCE_PREFIX)))
  await db.report.update({ where: { id: reportId }, data: { evidenceKeys: [] } })
}
