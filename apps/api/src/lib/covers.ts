import { db } from '../db/client.js'
import { signedDownloadUrl } from './storage.js'

/**
 * Cover thumbnails for a list of projects.
 *
 * A project's cover is the first image it had uploaded. The URL is signed the
 * same way a download is — the bucket is private, so a directory card can only
 * show a thumbnail the caller was already allowed to see. Callers are
 * responsible for having filtered the list by visibility first; this only
 * signs what it is handed.
 */

// Mirrors the images category in fileValidation.ts. Matched on the filename
// rather than mimeType because the extension is what upload validates against
// — mimeType is whatever the browser claimed at the time.
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']

export async function coverUrls(projectIds: string[]): Promise<Map<string, string>> {
  if (projectIds.length === 0) return new Map()

  const files = await db.projectFile.findMany({
    where: {
      projectId: { in: projectIds },
      OR: IMAGE_EXTENSIONS.map((ext) => ({
        name: { endsWith: `.${ext}`, mode: 'insensitive' as const },
      })),
    },
    orderBy: { uploadedAt: 'asc' },
    select: { projectId: true, storageKey: true, name: true },
  })

  // One per project — the earliest, since findMany came back in that order.
  const firsts = new Map<string, { storageKey: string; name: string }>()
  for (const file of files) {
    if (!firsts.has(file.projectId)) firsts.set(file.projectId, file)
  }

  try {
    const signed = await Promise.all(
      [...firsts].map(async ([projectId, file]) => {
        const url = await signedDownloadUrl(file.storageKey, file.name, { disposition: 'inline' })
        return [projectId, url] as const
      })
    )
    return new Map(signed)
  } catch {
    // Storage isn't configured (a fresh clone, or the test suite). A directory
    // that renders every card with its fallback is a much better failure than
    // a directory that 500s.
    return new Map()
  }
}

/** `projects` with a `coverUrl` attached wherever one exists. */
export async function withCovers<T extends { id: string }>(projects: T[]): Promise<(T & { coverUrl?: string })[]> {
  const covers = await coverUrls(projects.map((p) => p.id))
  return projects.map((p) => ({ ...p, coverUrl: covers.get(p.id) }))
}
