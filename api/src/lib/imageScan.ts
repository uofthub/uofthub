import { Prisma, type ImageScan, type ScanTarget, type Visibility } from '@prisma/client'
import { db } from '../db/client.js'
import { avatarUrlFor } from './avatar.js'
import { keepEvidence } from './evidence.js'
import { getObjectHead } from './storage.js'

/**
 * Checking uploaded images for nudity. An image is shown the moment it is
 * uploaded and queued here; a sweep inside the API sends it to the scanner
 * (scanner/, NudeNet behind a shared token) and, if it is flagged, hides it
 * and files a SEXUAL_CONTENT report — first in the moderation queue — for a
 * moderator to confirm or dismiss. Dismissing puts back what was hidden.
 *
 * The scanner runs on a free instance that sleeps when idle. A pass that
 * finds it asleep wakes it with its first request and leaves the queue for the
 * next pass, so nothing is lost while it starts. With SCANNER_URL unset the
 * queue still fills, and is worked through once the scanner is configured.
 */

export const SCAN_INTERVAL_MS = 60 * 1000
const BATCH = 20
/** The image upload cap: a project image file is the largest thing queued. */
const SCAN_MAX_BYTES = 25 * 1024 * 1024
/** Long enough for a sleeping free instance to start and answer. */
const SCAN_TIMEOUT_MS = 90 * 1000

/** NudeNet labels that mean nudity. Covered body parts and faces are not. */
const NUDITY = new Set([
  'FEMALE_GENITALIA_EXPOSED',
  'MALE_GENITALIA_EXPOSED',
  'FEMALE_BREAST_EXPOSED',
  'ANUS_EXPOSED',
  'BUTTOCKS_EXPOSED',
])

/**
 * The score over which a nudity label flags an image. Tuned here, not in the
 * scanner, which returns every detection; lower catches more and hides more
 * anatomy diagrams and art along the way.
 */
const threshold = () => Number(process.env.SCANNER_THRESHOLD ?? 0.6)

export type Detection = { class: string; score: number }

/** The detections that flag an image, or none. */
export const nudity = (detections: Detection[]) =>
  detections.filter((d) => NUDITY.has(d.class) && d.score >= threshold())

/** Queue an image just stored under `key`. A key stored again (an avatar) is scanned again. */
export async function queueScan(key: string, target: ScanTarget, subjectId: string) {
  const fresh = {
    target,
    subjectId,
    status: 'PENDING' as const,
    attempts: 0,
    labels: Prisma.DbNull,
    undo: Prisma.DbNull,
    scannedAt: null,
    createdAt: new Date(),
  }
  await db.imageScan.upsert({ where: { key }, create: { key, ...fresh }, update: fresh })
}

/** The scanner's answer; 'unreadable' when it could not decode the bytes as an image. */
async function detect(bytes: Buffer): Promise<Detection[] | 'unreadable'> {
  const res = await fetch(`${process.env.SCANNER_URL}/scan`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.SCANNER_TOKEN}`,
      'content-type': 'application/octet-stream',
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
  })
  if (res.status === 422) return 'unreadable'
  if (!res.ok) throw new Error(`The image scanner answered ${res.status}`)
  return ((await res.json()) as { detections: Detection[] }).detections
}

/**
 * Settle a scan — unless its key was stored again while it ran, which queued
 * it afresh (a new `createdAt`) for the new bytes.
 */
const settle = (scan: ImageScan, data: Prisma.ImageScanUpdateManyMutationInput) =>
  db.imageScan.updateMany({
    where: { key: scan.key, createdAt: scan.createdAt },
    data: { scannedAt: new Date(), ...data },
  })

const isMissing = (err: unknown) => (err as { name?: string })?.name === 'NoSuchKey'

/** Work through the queue, oldest first, until it is empty or the scanner fails. */
export async function runScanSweep(): Promise<void> {
  if (!process.env.SCANNER_URL || !process.env.SCANNER_TOKEN) return
  const pending = await db.imageScan.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  })
  for (const scan of pending) {
    let bytes: Buffer
    try {
      bytes = await getObjectHead(scan.key, SCAN_MAX_BYTES)
    } catch (err) {
      // Deleted before its turn: nothing left to show, or to scan.
      if (isMissing(err)) {
        await settle(scan, { status: 'SKIPPED' })
        continue
      }
      throw err
    }

    let result: Detection[] | 'unreadable'
    try {
      result = await detect(bytes)
    } catch (err) {
      // Asleep, starting or down: this request woke it, the rest wait.
      await db.imageScan.update({ where: { key: scan.key }, data: { attempts: { increment: 1 } } })
      throw err
    }

    if (result === 'unreadable') {
      await settle(scan, { status: 'SKIPPED' })
      continue
    }
    const hits = nudity(result)
    if (hits.length) await flag(scan, hits)
    else await settle(scan, { status: 'CLEAN' })
  }
}

/** What hiding a flagged image changed, so a dismissal can put it back. */
type Undo =
  | { avatarIsCustom: boolean }
  | { outputId: string }
  | { visibility: Visibility }
  | { activity: true }

/** Where a flagged image is reported, and whose it is. */
type Hidden = {
  target:
    | { targetType: 'USER' }
    | { targetType: 'PROJECT'; projectId: string }
    | { targetType: 'ORG_ACTIVITY'; activityId: string }
  subjectUserId: string
  what: string
  undo: Undo | null
}

/** Take a flagged image out of sight. Null when what it belonged to is gone. */
async function hide(scan: ImageScan): Promise<Hidden | null> {
  const { key, subjectId } = scan
  switch (scan.target) {
    case 'AVATAR': {
      const user = await db.user.findUnique({
        where: { id: subjectId },
        select: { avatarKey: true, avatarIsCustom: true },
      })
      if (!user) return null
      const shown = user.avatarKey === key
      if (shown)
        await db.user.update({
          where: { id: subjectId },
          // Marked custom so the next Microsoft sign-in doesn't put the same
          // photo straight back.
          data: { avatarKey: null, avatarUrl: null, avatarIsCustom: true },
        })
      return {
        target: { targetType: 'USER' },
        subjectUserId: subjectId,
        what: 'profile photo',
        undo: shown ? { avatarIsCustom: user.avatarIsCustom } : null,
      }
    }
    case 'THUMBNAIL':
    case 'PROJECT_FILE': {
      const project = await db.project.findUnique({
        where: { id: subjectId },
        select: { ownerId: true, visibility: true, takenDownAt: true },
      })
      if (!project) return null
      const base = {
        target: { targetType: 'PROJECT' as const, projectId: subjectId },
        subjectUserId: project.ownerId,
      }
      if (scan.target === 'THUMBNAIL') {
        const output = await db.projectOutput.findFirst({
          where: { projectId: subjectId, thumbnailKey: key },
          select: { id: true },
        })
        if (output)
          await db.projectOutput.update({ where: { id: output.id }, data: { thumbnailKey: null } })
        return { ...base, what: 'thumbnail', undo: output ? { outputId: output.id } : null }
      }
      // A file is the work itself, not a picture of it: the project goes
      // private until a moderator has looked.
      const file = await db.projectFile.findFirst({
        where: { projectId: subjectId, storageKey: key },
        select: { name: true },
      })
      const hiding = !!file && !project.takenDownAt
      if (hiding)
        await db.project.update({
          where: { id: subjectId },
          data: { visibility: 'PRIVATE', takenDownAt: new Date() },
        })
      return {
        ...base,
        what: file ? `file “${file.name}”` : 'file',
        undo: hiding ? { visibility: project.visibility } : null,
      }
    }
    case 'ORG_ACTIVITY': {
      const activity = await db.orgActivity.findUnique({
        where: { id: subjectId },
        select: { imageKey: true, createdById: true },
      })
      if (!activity) return null
      const shown = activity.imageKey === key
      if (shown) await db.orgActivity.update({ where: { id: subjectId }, data: { imageKey: null } })
      return {
        target: { targetType: 'ORG_ACTIVITY', activityId: subjectId },
        subjectUserId: activity.createdById,
        what: 'event image',
        undo: shown ? { activity: true } : null,
      }
    }
  }
}

async function flag(scan: ImageScan, hits: Detection[]) {
  const hidden = await hide(scan)
  await settle(scan, {
    status: 'FLAGGED',
    labels: hits,
    undo: hidden?.undo ?? Prisma.DbNull,
  })
  if (!hidden) return
  const labels = hits.map((h) => `${h.class} ${h.score.toFixed(2)}`).join(', ')
  const report = await db.report.create({
    data: {
      reporterId: null,
      reason: 'SEXUAL_CONTENT',
      ...hidden.target,
      subjectUserId: hidden.subjectUserId,
      details: `Flagged by the image scanner (${hidden.what}): ${labels}`,
      scanKey: scan.key,
    },
    select: { id: true },
  })
  await keepEvidence(report.id, scan.key)
}

/**
 * A moderator dismissed the report a scan filed: it was a false alarm, so
 * whatever the scan hid comes back — unless it has since been replaced, or
 * something else (a moderator's take-down) is keeping it hidden.
 */
export async function releaseScan(key: string): Promise<void> {
  const scan = await db.imageScan.findUnique({ where: { key } })
  if (!scan || scan.status !== 'FLAGGED') return
  const undo = scan.undo as Undo | null
  if (undo) {
    if ('avatarIsCustom' in undo)
      await db.user.updateMany({
        where: { id: scan.subjectId, avatarKey: null },
        data: {
          avatarKey: key,
          avatarUrl: avatarUrlFor(scan.subjectId, Date.now()),
          avatarIsCustom: undo.avatarIsCustom,
        },
      })
    else if ('outputId' in undo)
      await db.projectOutput.updateMany({
        where: { id: undo.outputId, thumbnailKey: null },
        data: { thumbnailKey: key },
      })
    else if ('visibility' in undo) {
      const takenDown = await db.report.count({
        where: { projectId: scan.subjectId, status: 'TAKEN_DOWN' },
      })
      if (!takenDown)
        await db.project.updateMany({
          where: { id: scan.subjectId, takenDownAt: { not: null } },
          data: { takenDownAt: null, visibility: undo.visibility },
        })
    } else
      await db.orgActivity.updateMany({
        where: { id: scan.subjectId, imageKey: null },
        data: { imageKey: key },
      })
  }
  await db.imageScan.update({ where: { key }, data: { status: 'CLEARED' } })
}

/** Run the sweep every minute, one pass at a time — a pass can wait 90s on a waking scanner. */
export function startScanSweep(onError: (err: unknown) => void): () => void {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await runScanSweep()
    } catch (err) {
      onError(err)
    } finally {
      running = false
    }
  }
  void run()
  const timer = setInterval(() => void run(), SCAN_INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}
