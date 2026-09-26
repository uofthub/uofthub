import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  encodeCanvas,
  fitWithin,
  imageNeedsThumbnail,
  posterFrameTime,
  thumbnailSource,
  THUMB_MAX_BYTES,
} from './thumbnails'

const file = (name: string, type = '') => ({ name, type })

describe('thumbnailSource', () => {
  it('knows a PDF, a video and an image by type or by name', () => {
    expect(thumbnailSource(file('poster.pdf', 'application/pdf'))).toBe('pdf')
    expect(thumbnailSource(file('POSTER.PDF'))).toBe('pdf')
    expect(thumbnailSource(file('talk.mp4', 'video/mp4'))).toBe('video')
    expect(thumbnailSource(file('clip.webm'))).toBe('video')
    expect(thumbnailSource(file('board.jpg', 'image/jpeg'))).toBe('image')
    expect(thumbnailSource(file('board.HEIC', 'image/heic'))).toBe('image')
  })

  it('makes none for an SVG or a document it cannot draw', () => {
    expect(thumbnailSource(file('logo.svg', 'image/svg+xml'))).toBeNull()
    expect(thumbnailSource(file('data.csv', 'text/csv'))).toBeNull()
    expect(thumbnailSource(file('slides.pptx'))).toBeNull()
  })
})

describe('fitWithin', () => {
  it('scales the long edge down to 1280, keeping the shape', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1280, height: 960 })
    expect(fitWithin(2000, 8000)).toEqual({ width: 320, height: 1280 })
  })

  it('never enlarges', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('imageNeedsThumbnail', () => {
  it('is only for an image too large to put on a card as it is', () => {
    expect(imageNeedsThumbnail(1200, 900, 300_000)).toBe(false)
    expect(imageNeedsThumbnail(4032, 3024, 300_000)).toBe(true)
    expect(imageNeedsThumbnail(1200, 900, 2_000_000)).toBe(true)
  })
})

describe('posterFrameTime', () => {
  it('takes a frame a tenth of the way in, never past three seconds', () => {
    expect(posterFrameTime(10)).toBe(1)
    expect(posterFrameTime(600)).toBe(3)
    expect(posterFrameTime(NaN)).toBe(0)
    expect(posterFrameTime(Infinity)).toBe(0)
  })
})

describe('encodeCanvas', () => {
  afterEach(() => vi.restoreAllMocks())

  const canvasReturning = (...blobs: (Blob | null)[]) => {
    const toBlob = vi.fn((cb: BlobCallback, _type?: string, _quality?: number) =>
      cb(blobs.shift() ?? null)
    )
    return { canvas: { toBlob } as unknown as HTMLCanvasElement, toBlob }
  }

  it('uses WebP when the browser really encodes it', async () => {
    const webp = new Blob(['x'], { type: 'image/webp' })
    const { canvas } = canvasReturning(webp)
    expect(await encodeCanvas(canvas)).toBe(webp)
  })

  it('falls back to JPEG when asking for WebP quietly gives something else', async () => {
    const png = new Blob(['x'], { type: 'image/png' })
    const jpeg = new Blob(['x'], { type: 'image/jpeg' })
    const { canvas, toBlob } = canvasReturning(png, jpeg)
    expect(await encodeCanvas(canvas)).toBe(jpeg)
    expect(toBlob.mock.calls[1][1]).toBe('image/jpeg')
  })

  it('lowers the JPEG quality until it fits, and gives up past that', async () => {
    const big = new Blob([new Uint8Array(THUMB_MAX_BYTES + 1)], { type: 'image/jpeg' })
    const small = new Blob(['x'], { type: 'image/jpeg' })
    expect(await encodeCanvas(canvasReturning(null, big, small).canvas)).toBe(small)
    expect(await encodeCanvas(canvasReturning(null, big, big, big).canvas)).toBeNull()
  })
})
