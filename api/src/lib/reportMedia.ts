import { fileTypeFromBuffer } from 'file-type'
import type { ReportTarget } from '@prisma/client'
import { db } from '../db/client.js'
import { getObjectHead, signedDownloadUrl } from './storage.js'

/**
 * What a moderator needs to see to decide a report: the images and files it
 * is about, whatever their visibility. A taken-down project is private, a
 * flagged image is unlinked and evidence is never served anywhere else, so
 * without this a moderator would be deciding blind. Every URL is signed for
 * five minutes and asked for by a moderator (GET /admin/reports/:id/media).
 */

export type ReportMedia = {
  /** What this is to the report: "Flagged image (kept copy)", "Profile photo"… */
  label: string
  name: string
  /** `image` is shown inline; anything else is a download. */
  kind: 'image' | 'file'
  url: string
}

/** Image types safe to show inline; SVG is never one. */
const INLINE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
/** A project can hold 20 files; this is what one report shows of them. */
const MAX_ITEMS = 24

type Item = { key: string; label: string; name: string }

async function describe(item: Item): Promise<ReportMedia | null> {
  let head: Buffer
  try {
    head = await getObjectHead(item.key, 4100)
  } catch {
    return null // deleted since
  }
  const mime = (await fileTypeFromBuffer(head))?.mime
  const inline = !!mime && INLINE.has(mime)
  return {
    label: item.label,
    name: item.name,
    kind: inline ? 'image' : 'file',
    url: await signedDownloadUrl(
      item.key,
      item.name,
      inline ? { disposition: 'inline', contentType: mime } : {}
    ),
  }
}

const lastSegment = (key: string) => key.split('/').at(-1) ?? key

export async function reportMedia(report: {
  targetType: ReportTarget
  projectId: string | null
  activityId: string | null
  subjectUserId: string | null
  scanKey: string | null
  evidenceKeys: string[]
}): Promise<ReportMedia[]> {
  const items: Item[] = []
  const add = (key: string | null | undefined, label: string, name = lastSegment(key ?? '')) => {
    if (key && !items.some((i) => i.key === key)) items.push({ key, label, name })
  }

  // The copy kept when it was flagged or taken down is exactly what was seen;
  // the original key may since hold a new upload (an avatar's always does).
  for (const key of report.evidenceKeys) add(key, 'Kept copy (evidence)')
  if (!report.evidenceKeys.length) add(report.scanKey, 'Flagged image')

  switch (report.targetType) {
    case 'PROJECT': {
      if (!report.projectId) break
      const [files, outputs] = await Promise.all([
        db.projectFile.findMany({
          where: { projectId: report.projectId },
          select: { name: true, storageKey: true },
          orderBy: { uploadedAt: 'asc' },
        }),
        db.projectOutput.findMany({
          where: { projectId: report.projectId, thumbnailKey: { not: null } },
          select: { thumbnailKey: true, label: true },
          orderBy: { position: 'asc' },
        }),
      ])
      for (const f of files) add(f.storageKey, 'Project file', f.name)
      for (const o of outputs) add(o.thumbnailKey, 'Thumbnail', o.label ?? 'thumbnail')
      break
    }
    case 'USER': {
      if (!report.subjectUserId) break
      const user = await db.user.findUnique({
        where: { id: report.subjectUserId },
        select: { avatarKey: true },
      })
      add(user?.avatarKey, 'Current profile photo', 'avatar')
      break
    }
    case 'ORG_ACTIVITY': {
      if (!report.activityId) break
      const activity = await db.orgActivity.findUnique({
        where: { id: report.activityId },
        select: { imageKey: true },
      })
      add(activity?.imageKey, 'Event image')
      break
    }
    // A comment or a collection is text, already in the report's excerpt.
    case 'COMMENT':
    case 'COLLECTION':
      break
  }

  const described = await Promise.all(items.slice(0, MAX_ITEMS).map(describe))
  return described.filter((m): m is ReportMedia => !!m)
}
