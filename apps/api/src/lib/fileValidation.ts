import { fileTypeFromBuffer } from 'file-type'

/**
 * Category policy from docs/ARCHITECTURE.md § File storage. Kept here rather
 * than duplicated across routes so the allowlist and limits have one source
 * of truth.
 */
export interface FileCategory {
  name: string
  extensions: string[]
  maxSizeBytes: number
}

const MB = 1024 * 1024

export const FILE_CATEGORIES: FileCategory[] = [
  { name: 'docs', extensions: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'md'], maxSizeBytes: 25 * MB },
  { name: 'images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'], maxSizeBytes: 25 * MB },
  { name: 'video', extensions: ['mp4', 'webm'], maxSizeBytes: 250 * MB },
  // ARCHITECTURE.md doesn't give audio its own limit — treated like docs/images
  // (25MB) as the conservative default until that's decided explicitly.
  { name: 'audio', extensions: ['mp3', 'wav'], maxSizeBytes: 25 * MB },
  { name: 'archives', extensions: ['zip'], maxSizeBytes: 100 * MB },
]

export const ACCOUNT_QUOTA_BYTES = 2 * 1024 * MB
export const PROJECT_FILE_COUNT_CAP = 20

export function extOf(filename: string): string {
  return (filename.split('.').pop() ?? '').toLowerCase()
}

export function categoryFor(ext: string): FileCategory | undefined {
  return FILE_CATEGORIES.find(c => c.extensions.includes(ext))
}

// file-type can't produce a magic-byte signature for these — plain text has
// none to check, so the declared extension is trusted for them.
const TRUST_EXTENSION = new Set(['txt', 'md', 'csv'])

// file-type reports both .jpg and .jpeg uploads as ext 'jpg'; everything else
// is checked for an exact match against the declared extension.
const DETECTED_MATCH: Record<string, string[]> = {
  jpeg: ['jpg'],
}

// Legacy MS Office formats (.doc/.xls/.ppt) all share the OLE2/Compound File
// Binary container signature — file-type doesn't attempt to disambiguate
// further, so the signature is checked directly instead.
const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

/**
 * Whether `buffer`'s actual content matches the declared extension. The point
 * is specifically to catch a renamed executable slipping past the allowlist
 * (docs/ARCHITECTURE.md calls this out as a security boundary) — not to be an
 * exhaustive file-format validator.
 */
export async function matchesDeclaredType(buffer: Buffer, ext: string): Promise<boolean> {
  if (TRUST_EXTENSION.has(ext)) return true

  if (ext === 'svg') {
    let text = buffer.subarray(0, 512).toString('utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip a UTF-8 BOM
    return /^(<\?xml|<svg)/i.test(text.trimStart())
  }

  if (ext === 'doc' || ext === 'xls' || ext === 'ppt') {
    return buffer.subarray(0, OLE2_SIGNATURE.length).equals(OLE2_SIGNATURE)
  }

  const detected = await fileTypeFromBuffer(buffer)
  if (!detected) return false
  return (DETECTED_MATCH[ext] ?? [ext]).includes(detected.ext)
}
