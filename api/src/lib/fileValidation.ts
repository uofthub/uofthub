import { Readable } from 'node:stream'
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
  {
    name: 'docs',
    // No legacy .doc/.ppt/.xls: their OLE2 container is the one that carries
    // VBA macros, and the OOXML formats cover every modern use. Files uploaded
    // before this still download (their content types stay below).
    extensions: ['pdf', 'docx', 'pptx', 'xlsx', 'csv', 'txt', 'md'],
    maxSizeBytes: 25 * MB,
  },
  {
    name: 'images',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'],
    maxSizeBytes: 25 * MB,
  },
  { name: 'video', extensions: ['mp4', 'webm'], maxSizeBytes: 250 * MB },
  // ARCHITECTURE.md doesn't give audio its own limit — treated like docs/images
  // (25MB) as the conservative default until that's decided explicitly.
  { name: 'audio', extensions: ['mp3', 'wav'], maxSizeBytes: 25 * MB },
  { name: 'archives', extensions: ['zip'], maxSizeBytes: 100 * MB },
]

export const PROJECT_FILE_COUNT_CAP = 20

/**
 * Bytes of project files one owner's projects may hold between them — an
 * abuse ceiling, not a plan limit. Without it the per-file and per-project
 * caps bound nothing: projects are free to make, so one account could keep
 * uploading 250MB videos indefinitely at our cost. Set well above anything a
 * student has needed; overridable per deployment.
 */
export const storageQuotaBytes = (): number => {
  const n = Number.parseInt(process.env.STORAGE_QUOTA_BYTES ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : 5 * 1024 * MB
}

/**
 * How a browser can display a file, if at all. Anything absent from the map is
 * download-only — .docx, .xlsx, .pptx and .zip need an application to open,
 * and nothing here pretends otherwise.
 */
export type PreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'text'

// No SVG: it can carry script, so it is download-only — never shown inline,
// never a cover, never an avatar.
const PREVIEW_KINDS: Record<PreviewKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  pdf: ['pdf'],
  video: ['mp4', 'webm'],
  audio: ['mp3', 'wav'],
  text: ['txt', 'md', 'csv'],
}

export function previewKindFor(ext: string): PreviewKind | undefined {
  return (Object.keys(PREVIEW_KINDS) as PreviewKind[]).find((kind) =>
    PREVIEW_KINDS[kind].includes(ext)
  )
}

/**
 * Cap on the bytes a text preview reads back out of storage. A 25MB .csv is a
 * legal upload but not something to hand a browser to syntax-highlight — the
 * viewer shows the head of it and points at the download for the rest.
 */
export const TEXT_PREVIEW_MAX_BYTES = 512 * 1024

/**
 * The Content-Type each allowed extension is stored and served with. Decided
 * here, from the extension the bytes were checked against, never from what
 * the uploading browser claimed — a PNG uploaded as `text/html` would
 * otherwise be served as a web page from our storage domain.
 */
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  zip: 'application/zip',
}

export const contentTypeFor = (ext: string): string =>
  CONTENT_TYPES[ext] ?? 'application/octet-stream'

/** Avatars: raster images only, and small. */
export const AVATAR_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
export const AVATAR_MAX_BYTES = 5 * MB

export function extOf(filename: string): string {
  return (filename.split('.').pop() ?? '').toLowerCase()
}

export function categoryFor(ext: string): FileCategory | undefined {
  return FILE_CATEGORIES.find((c) => c.extensions.includes(ext))
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

// ── Streaming uploads ─────────────────────────────────────────────────────────

/** Why an upload was refused, with the status to refuse it with. */
export class UploadError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413
  ) {
    super(message)
  }
}

/** Enough of the head of a file for file-type to recognise any format we allow. */
const HEAD_BYTES = 4100

/**
 * Check an upload against its declared type and size while streaming it to
 * storage, without ever holding the whole file in memory.
 *
 * The head is read first and checked by its bytes; nothing reaches storage
 * unless it passes. The rest is counted as it flows, and the upload is
 * aborted the moment it passes the category's cap. Returns the size stored.
 */
export async function streamValidated(
  source: AsyncIterable<Buffer> & { truncated?: boolean; resume?: () => void },
  ext: string,
  category: FileCategory,
  store: (body: Readable, contentType: string) => Promise<void>
): Promise<number> {
  const iterator = source[Symbol.asyncIterator]()
  const head: Buffer[] = []
  let size = 0
  let ended = false
  while (size < HEAD_BYTES) {
    const next = await iterator.next()
    if (next.done) {
      ended = true
      break
    }
    head.push(next.value)
    size += next.value.length
  }

  const tooBig = () =>
    new UploadError(
      `File exceeds the ${category.name} size limit (${category.maxSizeBytes / MB}MB)`,
      413
    )
  const headBuffer = Buffer.concat(head)
  const refuse = (err: UploadError) => {
    // Let the rest of the request body drain rather than stall the socket.
    source.resume?.()
    return err
  }
  if (size > category.maxSizeBytes) throw refuse(tooBig())
  if (!(await matchesDeclaredType(headBuffer, ext)))
    throw refuse(new UploadError('File content does not match its extension', 400))

  let overflow = false
  const body = Readable.from(
    (async function* () {
      yield headBuffer
      if (ended) return
      for (;;) {
        const next = await iterator.next()
        if (next.done) return
        size += next.value.length
        if (size > category.maxSizeBytes) {
          overflow = true
          throw tooBig()
        }
        yield next.value
      }
    })()
  )

  try {
    await store(body, contentTypeFor(ext))
  } catch (err) {
    if (overflow) throw refuse(tooBig())
    throw err
  }
  // The multipart parser stops at the global cap and marks the stream rather
  // than failing it.
  if (source.truncated) throw tooBig()
  return size
}
