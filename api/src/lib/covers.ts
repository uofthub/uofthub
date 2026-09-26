import type { OutputKind } from '@prisma/client'
import { db } from '../db/client.js'
import { signedDownloadUrl } from './storage.js'
import { contentTypeFor, extOf } from './fileValidation.js'
import { thumbnailContentType } from './outputs.js'

/**
 * Cover thumbnails for a list of projects, and what each one leads with.
 *
 * A project's cover is, in order:
 *   1. its primary output's thumbnail — a poster's first page, a video frame,
 *      a large image scaled down, or one the author chose by hand;
 *   2. its primary output's own file, when that is an image;
 *   3. otherwise the first image it had uploaded, as before outputs existed.
 *
 * The URL is signed the same way a download is — the bucket is private, so a
 * directory card can only show a thumbnail the caller was already allowed to
 * see. Callers are responsible for having filtered the list by visibility
 * first; this only signs what it is handed.
 */

// Mirrors the images category in fileValidation.ts. Matched on the filename
// rather than mimeType because the extension is what upload validates against
// — mimeType is whatever the browser claimed at the time.
// No SVG: it can carry script, so it is never shown inline.
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
const isImage = (name: string) =>
  IMAGE_EXTENSIONS.includes((name.split('.').pop() ?? '').toLowerCase())

type Source = { key: string; name: string; type: string }

/**
 * What a project leads with, for a card's main button ("View poster") —
 * which file or link it is, not the file itself.
 */
export type Lead = {
  kind: OutputKind
  label: string | null
  fileId: string | null
  linkId: string | null
}

type Covers = { covers: Map<string, string>; leads: Map<string, Lead> }

export async function coverUrls(projectIds: string[]): Promise<Covers> {
  if (projectIds.length === 0) return { covers: new Map(), leads: new Map() }

  const [primaries, images] = await Promise.all([
    db.projectOutput.findMany({
      where: { primaryOfProjectId: { in: projectIds } },
      select: {
        projectId: true,
        kind: true,
        label: true,
        fileId: true,
        linkId: true,
        thumbnailKey: true,
        file: { select: { storageKey: true, name: true } },
      },
    }),
    db.projectFile.findMany({
      where: {
        projectId: { in: projectIds },
        OR: IMAGE_EXTENSIONS.map((ext) => ({
          name: { endsWith: `.${ext}`, mode: 'insensitive' as const },
        })),
      },
      orderBy: { uploadedAt: 'asc' },
      select: { projectId: true, storageKey: true, name: true },
    }),
  ])

  const leads = new Map<string, Lead>(
    primaries.map((p) => [
      p.projectId,
      { kind: p.kind, label: p.label, fileId: p.fileId, linkId: p.linkId },
    ])
  )
  const sources = new Map<string, Source>()
  for (const p of primaries) {
    if (p.thumbnailKey)
      sources.set(p.projectId, {
        key: p.thumbnailKey,
        name: 'cover',
        type: thumbnailContentType(p.thumbnailKey),
      })
    else if (p.file && isImage(p.file.name))
      sources.set(p.projectId, {
        key: p.file.storageKey,
        name: p.file.name,
        type: contentTypeFor(extOf(p.file.name)),
      })
  }
  // The earliest image, since findMany came back in that order.
  for (const file of images) {
    if (!sources.has(file.projectId))
      sources.set(file.projectId, {
        key: file.storageKey,
        name: file.name,
        type: contentTypeFor(extOf(file.name)),
      })
  }

  try {
    const signed = await Promise.all(
      [...sources].map(async ([projectId, source]) => {
        const url = await signedDownloadUrl(source.key, source.name, {
          disposition: 'inline',
          contentType: source.type,
        })
        return [projectId, url] as const
      })
    )
    return { covers: new Map(signed), leads }
  } catch {
    // Storage isn't configured (a fresh clone, or the test suite). A directory
    // that renders every card with its fallback is a much better failure than
    // a directory that 500s.
    return { covers: new Map(), leads }
  }
}

/** `projects` with a `coverUrl` and a `lead` attached wherever one exists. */
export async function withCovers<T extends { id: string }>(
  projects: T[]
): Promise<(T & { coverUrl?: string; lead?: Lead })[]> {
  const { covers, leads } = await coverUrls(projects.map((p) => p.id))
  return projects.map((p) => ({ ...p, coverUrl: covers.get(p.id), lead: leads.get(p.id) }))
}
