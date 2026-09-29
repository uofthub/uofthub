/**
 * Thumbnails, made in the author's browser from the file they just picked.
 *
 * A poster PDF's first page, a video's opening frame, or a large image scaled
 * down — the picture a project's primary output is shown by on every card.
 * Made here rather than on the server for two reasons (docs/structured-
 * projects.md has the full argument): the browser already has hardened
 * decoders for all three, where the server would need a native image library
 * and would be decoding untrusted files on the request path; and the bucket
 * sends no CORS headers, so once a file is uploaded a canvas cannot read it
 * back — the local file is the only moment it can be drawn.
 *
 * Originals are never altered. A thumbnail is a separate, small image.
 */

/** The long edge of a thumbnail, in pixels. */
export const THUMB_EDGE = 1280
/** An image under both of these is its own thumbnail. */
export const IMAGE_EDGE_LIMIT = 1600
export const IMAGE_BYTES_LIMIT = 1024 * 1024
/** Matches the server's cap. */
export const THUMB_MAX_BYTES = 512 * 1024

export type ThumbnailSource = 'pdf' | 'video' | 'image'

/** What kind of thumbnail a file can have, from its type and name. */
export function thumbnailSource(file: Pick<File, 'name' | 'type'>): ThumbnailSource | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (file.type.startsWith('video/') || ext === 'mp4' || ext === 'webm') return 'video'
  // SVG is a document that happens to draw; it is never scaled into a bitmap.
  if (ext === 'svg' || file.type === 'image/svg+xml') return null
  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext))
    return 'image'
  return null
}

/** `width`×`height` scaled so the long edge is at most `edge`, never enlarged. */
export function fitWithin(width: number, height: number, edge = THUMB_EDGE) {
  const scale = Math.min(1, edge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Whether an image this size is worth a thumbnail of its own. */
export const imageNeedsThumbnail = (width: number, height: number, bytes: number) =>
  Math.max(width, height) > IMAGE_EDGE_LIMIT || bytes > IMAGE_BYTES_LIMIT

/** When a video's frame is taken: a tenth of the way in, and never past 3s. */
export const posterFrameTime = (duration: number) =>
  Number.isFinite(duration) && duration > 0 ? Math.min(duration * 0.1, 3) : 0

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/**
 * WebP where the browser can encode it. Browsers that cannot (older Safari)
 * quietly hand back a PNG instead of failing, which is why the type is checked
 * rather than trusted; JPEG is the fallback, far smaller than PNG for this.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const webp = await toBlob(canvas, 'image/webp', 0.82)
  if (webp?.type === 'image/webp' && webp.size <= THUMB_MAX_BYTES) return webp
  for (const quality of [0.85, 0.7, 0.55]) {
    const jpeg = await toBlob(canvas, 'image/jpeg', quality)
    if (jpeg && jpeg.size <= THUMB_MAX_BYTES) return jpeg
  }
  return null
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function imageThumbnail(file: File, force: boolean): Promise<Blob | null> {
  // EXIF rotation applied before drawing, so a phone photo is not sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    if (!force && !imageNeedsThumbnail(bitmap.width, bitmap.height, file.size)) return null
    const size = fitWithin(bitmap.width, bitmap.height)
    const canvas = canvasOf(size.width, size.height)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height)
    return encodeCanvas(canvas)
  } finally {
    bitmap.close()
  }
}

async function videoThumbnail(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('This video could not be read'))
      video.src = url
    })
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve()
      video.onerror = () => reject(new Error('This video could not be read'))
      video.currentTime = posterFrameTime(video.duration)
    })
    const size = fitWithin(video.videoWidth, video.videoHeight)
    const canvas = canvasOf(size.width, size.height)
    canvas.getContext('2d')!.drawImage(video, 0, 0, size.width, size.height)
    return encodeCanvas(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function pdfThumbnail(file: File): Promise<Blob | null> {
  // Loaded here and only here, so pdf.js is in no bundle but the one fetched
  // the first time a PDF is picked.
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  // pdf.js 5 and later have no eval path left to turn off: the font compiler behind
  // CVE-2024-4367 was removed along with the `isEvalSupported` option.
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    // A page is vector, so it is rendered at the thumbnail's size directly —
    // up as well as down, unlike an image.
    const viewport = page.getViewport({ scale: THUMB_EDGE / Math.max(base.width, base.height) })
    const canvas = canvasOf(Math.round(viewport.width), Math.round(viewport.height))
    await page.render({ canvas, viewport, background: '#ffffff' }).promise
    return encodeCanvas(canvas)
  } finally {
    // The loading task owns the worker since pdf.js 6; destroying it frees both.
    await task.destroy()
  }
}

/**
 * A thumbnail for `file`, or null when it needs none (a small image is its
 * own) or cannot have one (a spreadsheet, an SVG). `force` makes one for an
 * image of any size, for when the author picks an image to be a thumbnail.
 */
export async function makeThumbnail(file: File, { force = false } = {}): Promise<Blob | null> {
  switch (thumbnailSource(file)) {
    case 'pdf':
      return pdfThumbnail(file)
    case 'video':
      return videoThumbnail(file)
    case 'image':
      return imageThumbnail(file, force)
    default:
      return null
  }
}
